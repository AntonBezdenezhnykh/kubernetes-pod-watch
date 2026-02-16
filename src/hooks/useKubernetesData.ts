import { useQuery } from '@tanstack/react-query';
import { Pod, Container, LogEntry } from '@/types/kubernetes';
import {
  fetchPodsAndContainers,
  fetchContainerLogs,
  DbPod,
  DbContainer,
  DbLog,
} from '@/lib/database';

// Transform database pod to frontend Pod type
const transformPod = (dbPod: DbPod, containers: Container[]): Pod => ({
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
});

// Transform database log to frontend LogEntry type
const transformLog = (dbLog: DbLog): LogEntry => ({
  id: dbLog.id,
  timestamp: dbLog.timestamp,
  level: dbLog.level as LogEntry['level'],
  message: dbLog.message,
});

export const usePods = () => {
  return useQuery({
    queryKey: ['pods'],
    queryFn: async (): Promise<Pod[]> => {
      const { pods, containers } = await fetchPodsAndContainers();

      const containersByPodId = containers.reduce<Record<string, Container[]>>(
        (acc, container) => {
          const podId = container.pod_id;
          if (!acc[podId]) acc[podId] = [];
          acc[podId].push(transformContainer(container));
          return acc;
        },
        {}
      );

      return pods.map((pod) =>
        transformPod(pod, containersByPodId[pod.id] ?? [])
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
      const logs = await fetchContainerLogs(containerId);
      return logs.map(transformLog);
    },
    enabled: !!containerId,
    refetchInterval: 10000,
  });
};
