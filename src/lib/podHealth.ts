import { Pod, PodWithHealth, HealthStatus, VersionGroup, LogEntry } from '@/types/kubernetes';

// Compute health status based on pod and container states
export const computePodHealth = (
  pod: Pod,
  containerLogs: Map<string, LogEntry[]>
): HealthStatus => {
  // Error conditions - immediate attention required
  const errorStatuses: Pod['status'][] = ['Error', 'OOMKilled', 'CrashLoopBackOff'];
  if (errorStatuses.includes(pod.status)) {
    return 'error';
  }

  // Check containers for issues
  const hasUnhealthyContainers = pod.containers.some(
    (c) => !c.ready || c.status === 'Terminated' || c.status === 'Waiting'
  );
  
  // High restart count indicates instability
  const hasHighRestarts = pod.containers.some((c) => c.restartCount >= 3);
  
  if (hasUnhealthyContainers || hasHighRestarts) {
    return 'error';
  }

  // Check for error logs in running containers
  const hasErrorLogs = pod.containers.some((c) => {
    const logs = containerLogs.get(c.id) ?? [];
    return logs.some((log) => log.level === 'error');
  });

  if (hasErrorLogs) {
    return 'warning';
  }

  // Pending status is a warning
  if (pod.status === 'Pending') {
    return 'warning';
  }

  return 'healthy';
};

// Extract version from Kubernetes labels
export const extractVersion = (labels: Record<string, string>): string | null => {
  // Common version label keys in Kubernetes
  const versionKeys = [
    'version',
    'app.kubernetes.io/version',
    'helm.sh/chart',
    'app.kubernetes.io/instance',
    'deployment-version',
    'release',
  ];

  for (const key of versionKeys) {
    if (labels[key]) {
      return labels[key];
    }
  }

  return null;
};

// Enrich pod with health status and version
export const enrichPodWithHealth = (
  pod: Pod,
  containerLogs: Map<string, LogEntry[]>
): PodWithHealth => {
  const health = computePodHealth(pod, containerLogs);
  const version = extractVersion(pod.labels);
  const hasLogErrors = pod.containers.some((c) => {
    const logs = containerLogs.get(c.id) ?? [];
    return logs.some((log) => log.level === 'error');
  });

  return {
    ...pod,
    health,
    version,
    hasLogErrors,
  };
};

// Group pods by version
export const groupPodsByVersion = (pods: PodWithHealth[]): VersionGroup[] => {
  const versionMap = new Map<string, PodWithHealth[]>();

  pods.forEach((pod) => {
    const version = pod.version ?? 'unknown';
    const existing = versionMap.get(version) ?? [];
    versionMap.set(version, [...existing, pod]);
  });

  const groups: VersionGroup[] = [];

  versionMap.forEach((versionPods, version) => {
    const healthSummary = {
      healthy: versionPods.filter((p) => p.health === 'healthy').length,
      warning: versionPods.filter((p) => p.health === 'warning').length,
      error: versionPods.filter((p) => p.health === 'error').length,
    };

    // Get earliest created date for the version
    const createdAt = versionPods.reduce((earliest, pod) => {
      return new Date(pod.createdAt) < new Date(earliest) ? pod.createdAt : earliest;
    }, versionPods[0].createdAt);

    groups.push({
      version,
      pods: versionPods,
      healthSummary,
      createdAt,
    });
  });

  // Sort by created date (newest first)
  return groups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// Sort pods: errors first, then warnings, then healthy
export const sortPodsByHealth = (pods: PodWithHealth[]): PodWithHealth[] => {
  const priority: Record<HealthStatus, number> = {
    error: 0,
    warning: 1,
    healthy: 2,
  };

  return [...pods].sort((a, b) => {
    const healthDiff = priority[a.health] - priority[b.health];
    if (healthDiff !== 0) return healthDiff;
    // Within same health, sort by most recent
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};

// Filter to get only latest/active pods (not terminated)
export const getActivePods = (pods: Pod[]): Pod[] => {
  return pods.filter((pod) => pod.status !== 'Terminated');
};
