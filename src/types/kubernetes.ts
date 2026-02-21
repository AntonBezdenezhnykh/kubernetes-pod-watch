export type PodStatus = 'Running' | 'Pending' | 'Error' | 'OOMKilled' | 'CrashLoopBackOff' | 'Terminated' | 'Unknown';

// Health status for quick visual identification
export type HealthStatus = 'healthy' | 'warning' | 'error';
export type ContainerSeverity = 'healthy' | 'initializing' | 'warning' | 'error';

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
  cpuRequestMillicores?: number | null;
  cpuLimitMillicores?: number | null;
  memoryRequestBytes?: number | null;
  memoryLimitBytes?: number | null;
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
  logSummary: {
    errors: number;
    warnings: number;
    exceptions: number;
  };
}

// Extended pod with computed health status
export interface PodWithHealth extends Pod {
  health: HealthStatus;
  version: string | null;
  hasLogErrors: boolean;
  attentionScore: number;
  attentionReason: string | null;
  deploymentName: string;
}

export interface DeploymentGroup {
  id: string;
  name: string;
  pods: PodWithHealth[];
  health: HealthStatus;
  attentionScore: number;
  latestCreatedAt: string;
  healthSummary: {
    healthy: number;
    warning: number;
    error: number;
  };
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

export interface ResourceSample {
  sampledAt: string;
  cpuMillicores: number;
  memoryBytes: number;
}

export type ImpactStatus = 'degraded' | 'improved' | 'stable' | 'unknown';

export interface ContainerImpact {
  status: ImpactStatus;
  score: number | null;
  cpuDeltaPercent: number | null;
  memoryDeltaPercent: number | null;
}

export interface PodImpact {
  status: ImpactStatus;
  score: number | null;
  degradedCount: number;
  improvedCount: number;
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
