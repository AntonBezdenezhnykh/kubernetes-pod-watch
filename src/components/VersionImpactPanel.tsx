import { useMemo, useState } from 'react';
import { DeploymentGroup, ResourceSample } from '@/types/kubernetes';
import { fetchContainerResourceSamples } from '@/lib/database';
import { useQueries } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, ArrowDown, ArrowUp, Gauge, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

interface VersionImpactPanelProps {
  deployment: DeploymentGroup | null;
}

type WindowPreset = '5m' | '30m' | '24h';

interface VersionSnapshot {
  version: string;
  podName: string;
  createdAt: string;
  containers: DeploymentGroup['pods'][number]['containers'];
}

interface SeriesPoint {
  relMin: number;
  cpu: number;
  memoryBytes: number;
}

interface ResourceStats {
  cpuP95: number;
  memoryP95: number;
}

const WINDOW_MS: Record<WindowPreset, number> = {
  '5m': 5 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

const bytesToMiB = (value: number) => Math.round((value / (1024 * 1024)) * 100) / 100;

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  const weight = rank - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
};

const deltaPercent = (current: number, baseline: number): number | null => {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null;
  if (baseline === 0) return current === 0 ? 0 : null;
  return ((current - baseline) / baseline) * 100;
};

const deltaClassName = (delta: number | null) => {
  if (delta === null) return 'text-muted-foreground';
  if (delta >= 25) return 'text-[hsl(var(--status-error))] font-semibold';
  if (delta >= 10) return 'text-[hsl(var(--status-warning))] font-semibold';
  if (delta <= -10) return 'text-[hsl(var(--status-ready))] font-semibold';
  return 'text-muted-foreground';
};

const VerdictIcon = ({ delta }: { delta: number | null }) => {
  if (delta === null) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  if (delta <= -10) return <ArrowDown className="w-3.5 h-3.5 text-[hsl(var(--status-ready))]" />;
  if (delta >= 10) return <ArrowUp className="w-3.5 h-3.5 text-[hsl(var(--status-error))]" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
};

export const VersionImpactPanel = ({ deployment }: VersionImpactPanelProps) => {
  const [windowPreset, setWindowPreset] = useState<WindowPreset>('30m');
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [baselineVersion, setBaselineVersion] = useState<string>('');

  const versionSnapshots = useMemo<VersionSnapshot[]>(() => {
    if (!deployment) return [];
    const byVersion = new Map<string, VersionSnapshot>();
    for (const pod of deployment.pods) {
      const version = pod.version ?? 'unknown';
      if (!byVersion.has(version)) {
        byVersion.set(version, {
          version,
          podName: pod.name,
          createdAt: pod.createdAt,
          containers: pod.containers,
        });
      }
    }
    return [...byVersion.values()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [deployment]);

  const allContainerIds = useMemo(
    () => [...new Set(versionSnapshots.flatMap((snapshot) => snapshot.containers.map((c) => c.id)))],
    [versionSnapshots]
  );

  const sampleQueries = useQueries({
    queries: allContainerIds.map((containerId) => ({
      queryKey: ['resource-samples', 'version-impact', containerId],
      queryFn: async (): Promise<ResourceSample[]> => {
        const samples = await fetchContainerResourceSamples(containerId);
        return samples.map((sample) => ({
          sampledAt: sample.sampled_at,
          cpuMillicores: Number(sample.cpu_millicores ?? 0),
          memoryBytes: Number(sample.memory_bytes ?? 0),
        }));
      },
      staleTime: 15_000,
      refetchInterval: 30_000,
    })),
  });

  const samplesByContainerId = useMemo(() => {
    const map = new Map<string, ResourceSample[]>();
    allContainerIds.forEach((id, index) => {
      map.set(id, sampleQueries[index]?.data ?? []);
    });
    return map;
  }, [allContainerIds, sampleQueries]);

  const isLoadingSamples = sampleQueries.some((q) => q.isLoading);
  const hasSamplesError = sampleQueries.some((q) => q.isError);

  const latestVersions = versionSnapshots.map((snapshot) => snapshot.version);

  const selectedCurrent = currentVersion || latestVersions[0] || '';
  const selectedBaseline = baselineVersion || latestVersions[1] || latestVersions[0] || '';

  const currentSnapshot = versionSnapshots.find((v) => v.version === selectedCurrent) ?? null;
  const baselineSnapshot = versionSnapshots.find((v) => v.version === selectedBaseline) ?? null;

  const windowStartMs = Date.now() - WINDOW_MS[windowPreset];

  const getContainerStats = (containerId: string): ResourceStats | null => {
    const raw = samplesByContainerId.get(containerId) ?? [];
    const samples = raw.filter((s) => new Date(s.sampledAt).getTime() >= windowStartMs);
    if (samples.length === 0) return null;
    return {
      cpuP95: percentile(samples.map((s) => s.cpuMillicores), 95),
      memoryP95: percentile(samples.map((s) => s.memoryBytes), 95),
    };
  };

  const rows = useMemo(() => {
    if (!currentSnapshot || !baselineSnapshot) return [];
    const currentByName = new Map(currentSnapshot.containers.map((c) => [c.name, c]));
    const baselineByName = new Map(baselineSnapshot.containers.map((c) => [c.name, c]));
    const names = [...new Set([...currentByName.keys(), ...baselineByName.keys()])].sort();

    return names.map((name) => {
      const currentContainer = currentByName.get(name);
      const baselineContainer = baselineByName.get(name);
      const currentStats = currentContainer ? getContainerStats(currentContainer.id) : null;
      const baselineStats = baselineContainer ? getContainerStats(baselineContainer.id) : null;
      const cpuDelta = deltaPercent(currentStats?.cpuP95 ?? 0, baselineStats?.cpuP95 ?? 0);
      const memoryDelta = deltaPercent(currentStats?.memoryP95 ?? 0, baselineStats?.memoryP95 ?? 0);
      return {
        name,
        currentStats,
        baselineStats,
        cpuDelta,
        memoryDelta,
      };
    });
  }, [baselineSnapshot, currentSnapshot, windowPreset, samplesByContainerId]);

  const versionImpactRows = useMemo(() => {
    return versionSnapshots.map((snapshot) => {
      const stats = snapshot.containers
        .map((container) => getContainerStats(container.id))
        .filter((item): item is ResourceStats => Boolean(item));
      const cpuP95Total = stats.reduce((sum, item) => sum + item.cpuP95, 0);
      const memoryP95Total = stats.reduce((sum, item) => sum + item.memoryP95, 0);
      return {
        version: snapshot.version,
        createdAt: snapshot.createdAt,
        cpuP95Total,
        memoryP95Total,
      };
    });
  }, [versionSnapshots, windowPreset, samplesByContainerId]);

  const latestImpact = versionImpactRows[0];
  const previousImpact = versionImpactRows[1];
  const latestCpuDelta = latestImpact && previousImpact
    ? deltaPercent(latestImpact.cpuP95Total, previousImpact.cpuP95Total)
    : null;
  const latestMemoryDelta = latestImpact && previousImpact
    ? deltaPercent(latestImpact.memoryP95Total, previousImpact.memoryP95Total)
    : null;

  const buildRelativeSeries = (snapshot: VersionSnapshot | null): SeriesPoint[] => {
    if (!snapshot) return [];
    const points = new Map<number, { cpu: number; memory: number; count: number }>();

    for (const container of snapshot.containers) {
      const samples = (samplesByContainerId.get(container.id) ?? []).filter(
        (sample) => new Date(sample.sampledAt).getTime() >= windowStartMs
      );
      for (const sample of samples) {
        const ts = new Date(sample.sampledAt).getTime();
        const bucketSec = Math.floor(ts / 30_000) * 30_000;
        const item = points.get(bucketSec) ?? { cpu: 0, memory: 0, count: 0 };
        item.cpu += sample.cpuMillicores;
        item.memory += sample.memoryBytes;
        item.count += 1;
        points.set(bucketSec, item);
      }
    }

    const sorted = [...points.entries()].sort((a, b) => a[0] - b[0]);
    if (sorted.length === 0) return [];
    const latestTs = sorted[sorted.length - 1][0];
    const minuteBuckets = new Map<number, { cpu: number; memory: number; count: number }>();

    for (const [ts, point] of sorted) {
      const relMin = Math.round((ts - latestTs) / 60_000);
      const item = minuteBuckets.get(relMin) ?? { cpu: 0, memory: 0, count: 0 };
      item.cpu += point.cpu;
      item.memory += point.memory;
      item.count += 1;
      minuteBuckets.set(relMin, item);
    }

    return [...minuteBuckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([relMin, point]) => ({
        relMin,
        cpu: point.cpu / Math.max(point.count, 1),
        memoryBytes: point.memory / Math.max(point.count, 1),
      }));
  };

  const currentSeries = buildRelativeSeries(currentSnapshot);
  const baselineSeries = buildRelativeSeries(baselineSnapshot);

  const chartData = useMemo(() => {
    const keys = [...new Set([
      ...currentSeries.map((item) => item.relMin),
      ...baselineSeries.map((item) => item.relMin),
    ])].sort((a, b) => a - b);

    const currentMap = new Map(currentSeries.map((item) => [item.relMin, item]));
    const baselineMap = new Map(baselineSeries.map((item) => [item.relMin, item]));

    return keys.map((relMin) => {
      const current = currentMap.get(relMin);
      const baseline = baselineMap.get(relMin);
      return {
        relMinLabel: `T${relMin}`,
        currentCpu: current?.cpu ?? null,
        baselineCpu: baseline?.cpu ?? null,
        currentMemoryMiB: current ? bytesToMiB(current.memoryBytes) : null,
        baselineMemoryMiB: baseline ? bytesToMiB(baseline.memoryBytes) : null,
      };
    });
  }, [baselineSeries, currentSeries]);

  if (!deployment) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Select a deployment to view version impact.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" />
            Version Impact: {deployment.name}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Compare resource usage by version (latest pod of each version, up to 10 versions)
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {(['5m', '30m', '24h'] as WindowPreset[]).map((preset) => (
            <button
              key={preset}
              onClick={() => setWindowPreset(preset)}
              className={cn(
                'px-2 py-1 rounded border',
                windowPreset === preset
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground'
              )}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6">
          <label className="text-xs text-muted-foreground block mb-1">Current version</label>
          <select
            value={selectedCurrent}
            onChange={(e) => setCurrentVersion(e.target.value)}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm"
          >
            {latestVersions.map((version) => (
              <option key={`current-${version}`} value={version}>
                {version}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-6">
          <label className="text-xs text-muted-foreground block mb-1">Baseline version</label>
          <select
            value={selectedBaseline}
            onChange={(e) => setBaselineVersion(e.target.value)}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm"
          >
            {latestVersions.map((version) => (
              <option key={`baseline-${version}`} value={version}>
                {version}
              </option>
            ))}
          </select>
        </div>
      </div>

      {latestImpact && previousImpact && (
        <div className="rounded-lg border border-border p-3 text-xs flex items-center gap-5">
          <div className="text-muted-foreground">
            Recent impact: <span className="text-foreground font-medium">{latestImpact.version}</span> vs{' '}
            <span className="text-foreground font-medium">{previousImpact.version}</span>
          </div>
          <div className={cn('flex items-center gap-1', deltaClassName(latestCpuDelta))}>
            <VerdictIcon delta={latestCpuDelta} />
            CPU {latestCpuDelta === null ? 'n/a' : `${latestCpuDelta.toFixed(1)}%`}
          </div>
          <div className={cn('flex items-center gap-1', deltaClassName(latestMemoryDelta))}>
            <VerdictIcon delta={latestMemoryDelta} />
            RAM {latestMemoryDelta === null ? 'n/a' : `${latestMemoryDelta.toFixed(1)}%`}
          </div>
        </div>
      )}

      {isLoadingSamples ? (
        <div className="text-sm text-muted-foreground">Loading version samples...</div>
      ) : hasSamplesError ? (
        <div className="text-sm text-[hsl(var(--status-error))] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Failed to load one or more container sample streams.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Container</th>
                  <th className="px-3 py-2">CPU p95 ({selectedBaseline} → {selectedCurrent})</th>
                  <th className="px-3 py-2">RAM p95 ({selectedBaseline} → {selectedCurrent})</th>
                  <th className="px-3 py-2">CPU delta</th>
                  <th className="px-3 py-2">RAM delta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-t border-border/70">
                    <td className="px-3 py-2 font-medium">{row.name}</td>
                    <td className="px-3 py-2">
                      {(row.baselineStats?.cpuP95 ?? 0).toFixed(0)}m → {(row.currentStats?.cpuP95 ?? 0).toFixed(0)}m
                    </td>
                    <td className="px-3 py-2">
                      {bytesToMiB(row.baselineStats?.memoryP95 ?? 0).toFixed(1)}Mi → {bytesToMiB(row.currentStats?.memoryP95 ?? 0).toFixed(1)}Mi
                    </td>
                    <td className={cn('px-3 py-2', deltaClassName(row.cpuDelta))}>
                      <span className="inline-flex items-center gap-1">
                        <VerdictIcon delta={row.cpuDelta} />
                        {row.cpuDelta === null ? 'n/a' : `${row.cpuDelta.toFixed(1)}%`}
                      </span>
                    </td>
                    <td className={cn('px-3 py-2', deltaClassName(row.memoryDelta))}>
                      <span className="inline-flex items-center gap-1">
                        <VerdictIcon delta={row.memoryDelta} />
                        {row.memoryDelta === null ? 'n/a' : `${row.memoryDelta.toFixed(1)}%`}
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-muted-foreground" colSpan={5}>
                      No comparison data available for selected versions and window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-2">
              <div className="text-xs text-muted-foreground px-1 pb-1">
                CPU trend (relative time)
              </div>
              <ChartContainer
                config={{
                  baselineCpu: { label: selectedBaseline, color: 'hsl(var(--status-warning))' },
                  currentCpu: { label: selectedCurrent, color: 'hsl(var(--primary))' },
                }}
                className="h-52 w-full"
              >
                <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="relMinLabel" tickLine={false} axisLine={false} minTickGap={18} />
                  <YAxis tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip content={<ChartTooltipContent labelKey="relMinLabel" />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line type="monotone" dataKey="baselineCpu" stroke="var(--color-baselineCpu)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="currentCpu" stroke="var(--color-currentCpu)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </div>
            <div className="rounded-lg border border-border p-2">
              <div className="text-xs text-muted-foreground px-1 pb-1">
                RAM trend (relative time)
              </div>
              <ChartContainer
                config={{
                  baselineMemoryMiB: { label: `${selectedBaseline} RAM`, color: 'hsl(var(--status-ready))' },
                  currentMemoryMiB: { label: `${selectedCurrent} RAM`, color: 'hsl(var(--status-error))' },
                }}
                className="h-52 w-full"
              >
                <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="relMinLabel" tickLine={false} axisLine={false} minTickGap={18} />
                  <YAxis tickLine={false} axisLine={false} width={46} />
                  <ChartTooltip content={<ChartTooltipContent labelKey="relMinLabel" />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line type="monotone" dataKey="baselineMemoryMiB" stroke="var(--color-baselineMemoryMiB)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="currentMemoryMiB" stroke="var(--color-currentMemoryMiB)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground mb-2">Recent 10 version impact (deployment totals, p95)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {versionImpactRows.map((row, index) => {
                const prev = versionImpactRows[index + 1];
                const cpuDelta = prev ? deltaPercent(row.cpuP95Total, prev.cpuP95Total) : null;
                const memoryDelta = prev ? deltaPercent(row.memoryP95Total, prev.memoryP95Total) : null;
                return (
                  <div key={row.version} className="rounded border border-border/70 px-2 py-1.5 text-xs">
                    <div className="font-mono">{row.version}</div>
                    <div className="text-muted-foreground">
                      {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span>CPU {row.cpuP95Total.toFixed(0)}m</span>
                      <span>RAM {bytesToMiB(row.memoryP95Total).toFixed(1)}Mi</span>
                    </div>
                    {prev && (
                      <div className="mt-1 flex items-center gap-3">
                        <span className={deltaClassName(cpuDelta)}>CPU {cpuDelta === null ? 'n/a' : `${cpuDelta.toFixed(1)}%`}</span>
                        <span className={deltaClassName(memoryDelta)}>RAM {memoryDelta === null ? 'n/a' : `${memoryDelta.toFixed(1)}%`}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

