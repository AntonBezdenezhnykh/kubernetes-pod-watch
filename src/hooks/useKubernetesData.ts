import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Pod, Container, LogEntry } from '@/types/kubernetes';

type DbPod = Tables<'pods'>;
type DbContainer = Tables<'containers'>;
type DbLog = Tables<'logs'>;

// Transform database pod to frontend Pod type
const transformPod = (dbPod: DbPod, containers: Container[]): Pod => ({
  id: dbPod.id,
  name: dbPod.name,
  namespace: dbPod.namespace,
  status: dbPod.status,
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
  status: dbContainer.status,
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
  level: dbLog.level,
  message: dbLog.message,
});

export const usePods = () => {
  return useQuery({
    queryKey: ['pods'],
    queryFn: async (): Promise<Pod[]> => {
      // Fetch all pods
      const { data: podsData, error: podsError } = await supabase
        .from('pods')
        .select('*')
        .order('created_at', { ascending: false });

      if (podsError) throw podsError;

      // Fetch all containers
      const { data: containersData, error: containersError } = await supabase
        .from('containers')
        .select('*');

      if (containersError) throw containersError;

      // Group containers by pod_id
      const containersByPodId = (containersData ?? []).reduce<Record<string, Container[]>>(
        (acc, container) => {
          const podId = container.pod_id;
          if (!acc[podId]) acc[podId] = [];
          acc[podId].push(transformContainer(container));
          return acc;
        },
        {}
      );

      // Transform pods with their containers
      return (podsData ?? []).map((pod) =>
        transformPod(pod, containersByPodId[pod.id] ?? [])
      );
    },
  });
};

export const useContainerLogs = (containerId: string | null) => {
  return useQuery({
    queryKey: ['logs', containerId],
    queryFn: async (): Promise<LogEntry[]> => {
      if (!containerId) return [];

      const { data, error } = await supabase
        .from('logs')
        .select('*')
        .eq('container_id', containerId)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      return (data ?? []).map(transformLog);
    },
    enabled: !!containerId,
  });
};
