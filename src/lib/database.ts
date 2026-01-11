import { supabase } from '@/integrations/supabase/client';

// Database configuration type
export interface DatabaseConfig {
  useExternalDb: boolean;
}

// Get database configuration from environment
export const getDatabaseConfig = (): DatabaseConfig => {
  const useExternalDb = import.meta.env.VITE_USE_EXTERNAL_DB === 'true';
  return { useExternalDb };
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

// Fetch pods and containers from database
export async function fetchPodsAndContainers(): Promise<{ pods: DbPod[]; containers: DbContainer[] }> {
  const config = getDatabaseConfig();

  if (config.useExternalDb) {
    // Use edge function for external database
    const { data, error } = await supabase.functions.invoke('database', {
      body: null,
      headers: {},
    });

    // Parse the URL params approach since invoke doesn't support query params directly
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/database?action=getPods`,
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch pods');
    }

    const result = await response.json();
    return { pods: result.pods || [], containers: result.containers || [] };
  } else {
    // Use Supabase directly (default Lovable Cloud database)
    const { data: podsData, error: podsError } = await supabase
      .from('pods')
      .select('*')
      .order('created_at', { ascending: false });

    if (podsError) throw podsError;

    const { data: containersData, error: containersError } = await supabase
      .from('containers')
      .select('*');

    if (containersError) throw containersError;

    return {
      pods: (podsData || []) as DbPod[],
      containers: (containersData || []) as DbContainer[],
    };
  }
}

// Fetch logs for a specific container
export async function fetchContainerLogs(containerId: string): Promise<DbLog[]> {
  const config = getDatabaseConfig();

  if (config.useExternalDb) {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/database?action=getLogs&containerId=${containerId}`,
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch logs');
    }

    const result = await response.json();
    return result.logs || [];
  } else {
    const { data, error } = await supabase
      .from('logs')
      .select('*')
      .eq('container_id', containerId)
      .order('timestamp', { ascending: true });

    if (error) throw error;
    return (data || []) as DbLog[];
  }
}

// Check database health
export async function checkDatabaseHealth(): Promise<{ status: string; timestamp: string }> {
  const config = getDatabaseConfig();

  if (config.useExternalDb) {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/database?action=health`,
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Database health check failed');
    }

    return response.json();
  } else {
    // For Supabase, just do a simple query
    const { error } = await supabase.from('pods').select('id').limit(1);
    if (error) throw error;
    return { status: 'healthy', timestamp: new Date().toISOString() };
  }
}
