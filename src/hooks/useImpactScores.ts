import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchContainerResourceSamples } from '@/lib/database';
import { ContainerImpact, DeploymentGroup, PodImpact, PodWithHealth, ResourceSample } from '@/types/kubernetes';

const WINDOW_MS = 30 * 60 * 1000;

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

const classifyImpactStatus = (score: number | null): ContainerImpact['status'] => {
  if (score === null) return 'unknown';
  if (score >= 10) return 'degraded';
  if (score <= -10) return 'improved';
  return 'stable';
};

interface ComparisonPair {
  currentPod: PodWithHealth;
  baselinePod: PodWithHealth | null;
}

const getPreviousVersionPod = (deployment: DeploymentGroup, pod: PodWithHealth): PodWithHealth | null => {
  const byVersion = new Map<string, PodWithHealth>();
  for (const item of deployment.pods) {
    const version = item.version ?? 'unknown';
    if (!byVersion.has(version)) {
      byVersion.set(version, item);
    }
  }
  const snapshots = [...byVersion.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const currentVersion = pod.version ?? 'unknown';
  const idx = snapshots.findIndex((item) => (item.version ?? 'unknown') === currentVersion);
  if (idx < 0 || idx === snapshots.length - 1) return null;
  return snapshots[idx + 1];
};

export const useImpactScores = (deployments: DeploymentGroup[], selectedDeploymentId: string | null) => {
  const comparisons = useMemo<ComparisonPair[]>(() => {
    const pairs: ComparisonPair[] = [];

    for (const deployment of deployments) {
      const latestPod = deployment.pods[0];
      if (latestPod) {
        pairs.push({
          currentPod: latestPod,
          baselinePod: getPreviousVersionPod(deployment, latestPod),
        });
      }
    }

    if (selectedDeploymentId) {
      const selectedDeployment = deployments.find((d) => d.id === selectedDeploymentId);
      if (selectedDeployment) {
        for (const pod of selectedDeployment.pods) {
          if (pairs.some((pair) => pair.currentPod.id === pod.id)) continue;
          pairs.push({
            currentPod: pod,
            baselinePod: getPreviousVersionPod(selectedDeployment, pod),
          });
        }
      }
    }

    return pairs;
  }, [deployments, selectedDeploymentId]);

  const containerIds = useMemo(() => {
    return [
      ...new Set(
        comparisons.flatMap((pair) => [
          ...pair.currentPod.containers.map((c) => c.id),
          ...(pair.baselinePod?.containers.map((c) => c.id) ?? []),
        ])
      ),
    ];
  }, [comparisons]);

  const sampleQueries = useQueries({
    queries: containerIds.map((containerId) => ({
      queryKey: ['resource-samples', 'impact', containerId],
      queryFn: async (): Promise<ResourceSample[]> => {
        const rows = await fetchContainerResourceSamples(containerId);
        return rows.map((row) => ({
          sampledAt: row.sampled_at,
          cpuMillicores: Number(row.cpu_millicores ?? 0),
          memoryBytes: Number(row.memory_bytes ?? 0),
        }));
      },
      staleTime: 15_000,
      refetchInterval: 30_000,
    })),
  });

  const samplesByContainerId = useMemo(() => {
    const map = new Map<string, ResourceSample[]>();
    containerIds.forEach((id, index) => map.set(id, sampleQueries[index]?.data ?? []));
    return map;
  }, [containerIds, sampleQueries]);

  const getP95Stats = (containerId: string) => {
    const now = Date.now();
    const samples = (samplesByContainerId.get(containerId) ?? []).filter(
      (sample) => new Date(sample.sampledAt).getTime() >= now - WINDOW_MS
    );
    if (samples.length === 0) return null;
    return {
      cpuP95: percentile(samples.map((s) => s.cpuMillicores), 95),
      memoryP95: percentile(samples.map((s) => s.memoryBytes), 95),
    };
  };

  const { containerImpactsByContainerId, podImpactsByPodId } = useMemo(() => {
    const containerImpacts: Record<string, ContainerImpact> = {};
    const podImpacts: Record<string, PodImpact> = {};

    for (const pair of comparisons) {
      const currentContainersByName = new Map(pair.currentPod.containers.map((c) => [c.name, c]));
      const baselineContainersByName = new Map((pair.baselinePod?.containers ?? []).map((c) => [c.name, c]));
      const allNames = [...new Set([...currentContainersByName.keys(), ...baselineContainersByName.keys()])];

      const perContainerScores: number[] = [];
      let degradedCount = 0;
      let improvedCount = 0;

      for (const name of allNames) {
        const currentContainer = currentContainersByName.get(name);
        const baselineContainer = baselineContainersByName.get(name);
        if (!currentContainer || !baselineContainer) continue;

        const currentStats = getP95Stats(currentContainer.id);
        const baselineStats = getP95Stats(baselineContainer.id);
        if (!currentStats || !baselineStats) {
          containerImpacts[currentContainer.id] = {
            status: 'unknown',
            score: null,
            cpuDeltaPercent: null,
            memoryDeltaPercent: null,
          };
          continue;
        }

        const cpuDelta = deltaPercent(currentStats.cpuP95, baselineStats.cpuP95);
        const memoryDelta = deltaPercent(currentStats.memoryP95, baselineStats.memoryP95);
        const deltas = [cpuDelta, memoryDelta].filter((item): item is number => item !== null);
        const score = deltas.length > 0 ? deltas.reduce((sum, item) => sum + item, 0) / deltas.length : null;
        const status = classifyImpactStatus(score);

        containerImpacts[currentContainer.id] = {
          status,
          score,
          cpuDeltaPercent: cpuDelta,
          memoryDeltaPercent: memoryDelta,
        };

        if (score !== null) {
          perContainerScores.push(score);
        }
        if (status === 'degraded') degradedCount += 1;
        if (status === 'improved') improvedCount += 1;
      }

      const podScore =
        perContainerScores.length > 0
          ? perContainerScores.reduce((sum, item) => sum + item, 0) / perContainerScores.length
          : null;
      podImpacts[pair.currentPod.id] = {
        status: classifyImpactStatus(podScore),
        score: podScore,
        degradedCount,
        improvedCount,
      };
    }

    return {
      containerImpactsByContainerId: containerImpacts,
      podImpactsByPodId: podImpacts,
    };
  }, [comparisons, samplesByContainerId]);

  return {
    containerImpactsByContainerId,
    podImpactsByPodId,
    isLoading: sampleQueries.some((q) => q.isLoading),
  };
};

