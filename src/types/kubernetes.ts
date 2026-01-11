export type PodStatus = 'Running' | 'Pending' | 'Error' | 'OOMKilled' | 'CrashLoopBackOff' | 'Terminated' | 'Unknown';

// Health status for quick visual identification
export type HealthStatus = 'healthy' | 'warning' | 'error';

export interface Container {
  id: string;
  name: string;
  image: string;
  status: 'Running' | 'Waiting' | 'Terminated';
  ready: boolean;
  restartCount: number;
  startedAt: string;
  lastState?: {
    reason: string;
    exitCode?: number;
    message?: string;
  };
}

export interface Pod {
  id: string;
  name: string;
  namespace: string;
  status: PodStatus;
  nodeName: string;
  podIP: string;
  createdAt: string;
  containers: Container[];
  labels: Record<string, string>;
  restarts: number;
}

// Extended pod with computed health status
export interface PodWithHealth extends Pod {
  health: HealthStatus;
  version: string | null;
  hasLogErrors: boolean;
}

// Version group for comparing deployments
export interface VersionGroup {
  version: string;
  pods: PodWithHealth[];
  healthSummary: {
    healthy: number;
    warning: number;
    error: number;
  };
  createdAt: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

// Container status history for timeline
export interface ContainerStatusEvent {
  containerId: string;
  containerName: string;
  status: Container['status'];
  ready: boolean;
  timestamp: string;
  reason?: string;
}
