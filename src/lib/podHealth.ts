import {
  Pod,
  PodWithHealth,
  HealthStatus,
  VersionGroup,
  LogEntry,
  Container,
  ContainerSeverity,
} from '@/types/kubernetes';

const INITIALIZING_REASONS = new Set(['ContainerCreating', 'PodInitializing']);
const SIDECAR_HINTS = ['istio', 'istio-proxy', 'vault-agent', 'fluent-bit', 'fluentbit', 'alog'];
const ERROR_REASONS = new Set([
  'CrashLoopBackOff',
  'OOMKilled',
  'Error',
  'ImagePullBackOff',
  'ErrImagePull',
  'CreateContainerConfigError',
  'InvalidImageName',
  'RunContainerError',
]);

export const isSidecarContainer = (container: Container): boolean => {
  const name = container.name.toLowerCase();
  const image = container.image.toLowerCase();

  if (SIDECAR_HINTS.some((hint) => name.includes(hint) || image.includes(hint))) {
    return true;
  }

  // Common fallback pattern for generic sidecars
  return name.includes('sidecar');
};

export const classifyContainerSeverity = (
  container: Container
): {
  severity: ContainerSeverity;
  label: string;
  details?: string;
  score: number;
} => {
  const reason = container.lastState?.reason ?? '';
  const isInitializing = INITIALIZING_REASONS.has(reason) || reason.startsWith('Init:');

  if (container.status === 'Terminated' || ERROR_REASONS.has(reason) || container.restartCount >= 5) {
    return {
      severity: 'error',
      label: reason || 'Container failure',
      details: container.lastState?.message,
      score: 100 + container.restartCount,
    };
  }

  if (container.status === 'Waiting' && isInitializing) {
    return {
      severity: 'initializing',
      label: reason || 'Initializing',
      details: container.lastState?.message,
      score: 20,
    };
  }

  if (container.status === 'Waiting' || !container.ready || container.restartCount > 0) {
    return {
      severity: 'warning',
      label: reason || (container.status === 'Waiting' ? 'Waiting' : 'Not ready'),
      details: container.lastState?.message,
      score: 40 + Math.min(container.restartCount, 10),
    };
  }

  return {
    severity: 'healthy',
    label: 'Running',
    score: 0,
  };
};

// Compute health status based on pod and container states
export const computePodHealth = (
  pod: Pod,
  containerLogs: Map<string, LogEntry[]>
): { health: HealthStatus; attentionScore: number; attentionReason: string | null } => {
  // Error conditions - immediate attention required
  const errorStatuses: Pod['status'][] = ['Error', 'OOMKilled', 'CrashLoopBackOff'];
  if (errorStatuses.includes(pod.status)) {
    return { health: 'error', attentionScore: 200, attentionReason: pod.status };
  }

  const containerAssessments = pod.containers.map(classifyContainerSeverity);
  const maxAssessment = containerAssessments.reduce(
    (max, item) => (item.score > max.score ? item : max),
    { severity: 'healthy' as ContainerSeverity, label: '', score: 0 }
  );

  // Check for error logs in running containers
  const hasErrorLogs = pod.containers.some((c) => {
    const logs = containerLogs.get(c.id) ?? [];
    return logs.some((log) => log.level === 'error');
  });

  if (maxAssessment.severity === 'error') {
    return {
      health: 'error',
      attentionScore: maxAssessment.score,
      attentionReason: maxAssessment.label,
    };
  }

  if (hasErrorLogs) {
    return { health: 'warning', attentionScore: 60, attentionReason: 'Error logs detected' };
  }

  // Pending status is a warning
  if (pod.status === 'Pending' || maxAssessment.severity === 'warning') {
    return {
      health: 'warning',
      attentionScore: Math.max(maxAssessment.score, 35),
      attentionReason: maxAssessment.label || (pod.status === 'Pending' ? 'Pending scheduling' : null),
    };
  }

  if (maxAssessment.severity === 'initializing') {
    return {
      health: 'warning',
      attentionScore: maxAssessment.score,
      attentionReason: maxAssessment.label,
    };
  }

  return { health: 'healthy', attentionScore: 0, attentionReason: null };
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
  const computed = computePodHealth(pod, containerLogs);
  const version = extractVersion(pod.labels);
  const hasLogErrors = pod.containers.some((c) => {
    const logs = containerLogs.get(c.id) ?? [];
    return logs.some((log) => log.level === 'error');
  });

  return {
    ...pod,
    health: computed.health,
    version,
    hasLogErrors,
    attentionScore: computed.attentionScore,
    attentionReason: computed.attentionReason,
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
    const attentionDiff = b.attentionScore - a.attentionScore;
    if (attentionDiff !== 0) return attentionDiff;
    // Within same health, sort by most recent
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};

// Filter to get only latest/active pods (not terminated)
export const getActivePods = (pods: Pod[]): Pod[] => {
  return pods.filter((pod) => pod.status !== 'Terminated');
};
