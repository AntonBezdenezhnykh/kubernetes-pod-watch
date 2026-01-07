export type PodStatus = 'Running' | 'Pending' | 'Error' | 'OOMKilled' | 'CrashLoopBackOff' | 'Terminated' | 'Unknown';

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

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}
