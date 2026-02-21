// All database access goes through the edge function, which connects to external PostgreSQL.

const getBaseUrl = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) return '/functions/v1/database';
  return `${url.replace(/\/$/, '')}/functions/v1/database`;
};

const getAuthHeaders = () => {
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    ...(publishableKey ? { 'Authorization': `Bearer ${publishableKey}` } : {}),
    'Content-Type': 'application/json',
  };
};

// API response types matching edge function
export interface DbPod {
  id: string;
  name: string;
  namespace: string;
  status: string;
  node_name: string | null;
  pod_ip: string | null;
  labels: Record<string, string> | null;
  restarts: number | null;
  created_at: string;
  updated_at: string;
}

export interface DbContainer {
  id: string;
  pod_id: string;
  name: string;
  image: string;
  status: string;
  ready: boolean | null;
  restart_count: number | null;
  started_at: string | null;
  last_state_reason: string | null;
  last_state_exit_code: number | null;
  last_state_message: string | null;
  cpu_request_millicores: number | null;
  cpu_limit_millicores: number | null;
  memory_request_bytes: number | null;
  memory_limit_bytes: number | null;
  created_at: string;
  updated_at: string;
}

export interface DbLog {
  id: string;
  container_id: string;
  timestamp: string;
  level: string;
  message: string;
  created_at: string;
}

export interface DbResourceSample {
  sampled_at: string;
  cpu_millicores: number;
  memory_bytes: number;
}

export interface DbPodLogSummary {
  pod_id: string;
  error_count: number;
  warning_count: number;
  exception_count: number;
}

// Fetch pods and containers from database (via edge function → external PostgreSQL)
export async function fetchPodsAndContainers(): Promise<{
  pods: DbPod[];
  containers: DbContainer[];
  podLogSummaries: DbPodLogSummary[];
}> {
  const response = await fetch(`${getBaseUrl()}?action=getPods`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch pods');
  }

  const result = await response.json();
  return {
    pods: result.pods || [],
    containers: result.containers || [],
    podLogSummaries: result.podLogSummaries || [],
  };
}

// Fetch logs for a specific container
export async function fetchContainerLogs(containerId: string): Promise<DbLog[]> {
  const response = await fetch(
    `${getBaseUrl()}?action=getLogs&containerId=${encodeURIComponent(containerId)}`,
    { headers: getAuthHeaders() }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch logs');
  }

  const result = await response.json();
  return result.logs || [];
}

export async function fetchContainerResourceSamples(containerId: string): Promise<DbResourceSample[]> {
  const response = await fetch(
    `${getBaseUrl()}?action=getResourceSamples&containerId=${encodeURIComponent(containerId)}`,
    { headers: getAuthHeaders() }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch resource samples');
  }

  const result = await response.json();
  return result.samples || [];
}

// Check database health
export async function checkDatabaseHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await fetch(`${getBaseUrl()}?action=health`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Database health check failed');
  }

  return response.json();
}
