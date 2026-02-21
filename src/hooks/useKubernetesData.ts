import { useQuery } from '@tanstack/react-query';
import { Pod, Container, LogEntry, ResourceSample } from '@/types/kubernetes';
import {
  fetchPodsAndContainers,
  fetchContainerLogs,
  fetchContainerResourceSamples,
  DbPod,
  DbContainer,
  DbLog,
  DbPodLogSummary,
  DbResourceSample,
} from '@/lib/database';

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// Transform database pod to frontend Pod type
const transformPod = (
  dbPod: DbPod,
  containers: Container[],
  summary?: DbPodLogSummary
): Pod => ({
  id: dbPod.id,
  name: dbPod.name,
  namespace: dbPod.namespace,
  status: dbPod.status as Pod['status'],
  nodeName: dbPod.node_name ?? '',
  podIP: dbPod.pod_ip ?? '',
  createdAt: dbPod.created_at,
  containers,
  labels: (dbPod.labels as Record<string, string>) ?? {},
  restarts: dbPod.restarts ?? 0,
  logSummary: {
    errors: summary?.error_count ?? 0,
    warnings: summary?.warning_count ?? 0,
    exceptions: summary?.exception_count ?? 0,
  },
});

// Transform database container to frontend Container type
const transformContainer = (dbContainer: DbContainer): Container => ({
  id: dbContainer.id,
  name: dbContainer.name,
  image: dbContainer.image,
  status: dbContainer.status as Container['status'],
  ready: dbContainer.ready ?? false,
  restartCount: dbContainer.restart_count ?? 0,
  startedAt: dbContainer.started_at ?? '',
  lastState: dbContainer.last_state_reason
    ? {
        reason: dbContainer.last_state_reason,
        exitCode: dbContainer.last_state_exit_code ?? undefined,
        message: dbContainer.last_state_message ?? undefined,
      }
    : undefined,
  cpuRequestMillicores: toNumberOrNull(dbContainer.cpu_request_millicores),
  cpuLimitMillicores: toNumberOrNull(dbContainer.cpu_limit_millicores),
  memoryRequestBytes: toNumberOrNull(dbContainer.memory_request_bytes),
  memoryLimitBytes: toNumberOrNull(dbContainer.memory_limit_bytes),
});

// Transform database log to frontend LogEntry type
const transformLog = (dbLog: DbLog): LogEntry => ({
  id: dbLog.id,
  timestamp: dbLog.timestamp,
  level: dbLog.level as LogEntry['level'],
  message: dbLog.message,
});

const transformResourceSample = (dbSample: DbResourceSample): ResourceSample => ({
  sampledAt: dbSample.sampled_at,
  cpuMillicores: toNumberOrNull(dbSample.cpu_millicores) ?? 0,
  memoryBytes: toNumberOrNull(dbSample.memory_bytes) ?? 0,
});

export const usePods = () => {
  return useQuery({
    queryKey: ['pods'],
    queryFn: async (): Promise<Pod[]> => {
      const { pods, containers, podLogSummaries } = await fetchPodsAndContainers();

      const containersByPodId = containers.reduce<Record<string, Container[]>>(
        (acc, container) => {
          const podId = container.pod_id;
          if (!acc[podId]) acc[podId] = [];
          acc[podId].push(transformContainer(container));
          return acc;
        },
        {}
      );

      const summaryByPodId = podLogSummaries.reduce<Record<string, DbPodLogSummary>>(
        (acc, summary) => {
          acc[summary.pod_id] = summary;
          return acc;
        },
        {}
      );

      return pods.map((pod) =>
        transformPod(pod, containersByPodId[pod.id] ?? [], summaryByPodId[pod.id])
      );
    },
    refetchInterval: 30000,
  });
};

export const useContainerLogs = (containerId: string | null) => {
  return useQuery({
    queryKey: ['logs', containerId],
    queryFn: async (): Promise<LogEntry[]> => {
      if (!containerId) return [];
      const logs = await fetchContainerLogs(containerId, 2000);
      return logs.map(transformLog);
    },
    enabled: !!containerId,
    refetchInterval: 10000,
  });
};

export const useContainerResourceSamples = (containerId: string | null) => {
  return useQuery({
    queryKey: ['resource-samples', containerId],
    queryFn: async (): Promise<ResourceSample[]> => {
      if (!containerId) return [];
      const samples = await fetchContainerResourceSamples(containerId);
      return samples.map(transformResourceSample);
    },
    enabled: !!containerId,
    refetchInterval: 30000,
  });
};
