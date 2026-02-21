import { Container } from '@/types/kubernetes';
import { useContainerResourceSamples } from '@/hooks/useKubernetesData';
import { format } from 'date-fns';
import { Activity, Cpu, HardDrive, Loader2 } from 'lucide-react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

interface ResourceUsagePanelProps {
  container: Container;
}

const bytesToMiB = (value: number) => Math.round((value / (1024 * 1024)) * 100) / 100;

export const ResourceUsagePanel = ({ container }: ResourceUsagePanelProps) => {
  const { data: samples = [], isLoading, error } = useContainerResourceSamples(container.id);

  const chartData = samples.map((sample) => ({
    time: format(new Date(sample.sampledAt), 'HH:mm:ss'),
    sampledAt: sample.sampledAt,
    cpu: sample.cpuMillicores,
    memoryMiB: bytesToMiB(sample.memoryBytes),
  }));

  const latest = samples[samples.length - 1];
  const cpuAvg =
    samples.length > 0
      ? Math.round(samples.reduce((sum, s) => sum + s.cpuMillicores, 0) / samples.length)
      : 0;
  const memoryAvg =
    samples.length > 0
      ? bytesToMiB(samples.reduce((sum, s) => sum + s.memoryBytes, 0) / samples.length)
      : 0;

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Resource Usage: {container.name}</span>
        </div>
        <span className="text-xs text-muted-foreground">30s samples</span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-destructive text-sm p-4 text-center">
          Failed to load resource samples: {error.message}
        </div>
      ) : samples.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4 text-center">
          No resource samples yet. Wait for the 30s collector to record data.
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-3 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg border border-border p-2">
              <div className="text-muted-foreground flex items-center gap-1"><Cpu className="w-3.5 h-3.5" />Latest CPU</div>
              <div className="font-semibold">{latest?.cpuMillicores ?? 0} mCPU</div>
            </div>
            <div className="rounded-lg border border-border p-2">
              <div className="text-muted-foreground flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" />Latest RAM</div>
              <div className="font-semibold">{bytesToMiB(latest?.memoryBytes ?? 0)} MiB</div>
            </div>
            <div className="rounded-lg border border-border p-2">
              <div className="text-muted-foreground">Avg CPU</div>
              <div className="font-semibold">{cpuAvg} mCPU</div>
            </div>
            <div className="rounded-lg border border-border p-2">
              <div className="text-muted-foreground">Avg RAM</div>
              <div className="font-semibold">{memoryAvg} MiB</div>
            </div>
          </div>

          <div className="rounded-xl border border-border p-2">
            <div className="text-xs text-muted-foreground px-2 pb-1">CPU (millicores)</div>
            <ChartContainer
              config={{
                cpu: { label: 'CPU', color: 'hsl(var(--status-warning))' },
              }}
              className="h-44 w-full"
            >
              <LineChart data={chartData} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="time" tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis tickLine={false} axisLine={false} width={45} />
                <ChartTooltip content={<ChartTooltipContent labelKey="time" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="monotone"
                  dataKey="cpu"
                  stroke="var(--color-cpu)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </div>

          <div className="rounded-xl border border-border p-2">
            <div className="text-xs text-muted-foreground px-2 pb-1">Memory (MiB)</div>
            <ChartContainer
              config={{
                memoryMiB: { label: 'Memory', color: 'hsl(var(--status-ready))' },
              }}
              className="h-44 w-full"
            >
              <LineChart data={chartData} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="time" tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis tickLine={false} axisLine={false} width={45} />
                <ChartTooltip content={<ChartTooltipContent labelKey="time" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="monotone"
                  dataKey="memoryMiB"
                  stroke="var(--color-memoryMiB)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </div>
        </div>
      )}
    </div>
  );
};
