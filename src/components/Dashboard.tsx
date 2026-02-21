import { useEffect, useMemo, useState } from 'react';
import { DeploymentGroup, HealthStatus, PodWithHealth } from '@/types/kubernetes';
import { usePods } from '@/hooks/useKubernetesData';
import { HealthSummaryCards } from './HealthSummaryCards';
import { PodDetailPanel } from './PodDetailPanel';
import {
  enrichPodWithHealth,
  groupPodsByDeployment,
  groupPodsByVersion,
} from '@/lib/podHealth';
import { Layers, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';

export const Dashboard = () => {
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [selectedPod, setSelectedPod] = useState<PodWithHealth | null>(null);
  const [healthFilter, setHealthFilter] = useState<'all' | HealthStatus>('all');
  const [latestIssuesOnly, setLatestIssuesOnly] = useState(false);

  const { data: rawPods = [], isLoading, error, refetch, isFetching } = usePods();

  // Build container logs map (placeholder: detailed aggregation can be added later)
  const containerLogsMap = useMemo(() => new Map<string, []>(), []);

  const podsWithHealth = useMemo(
    () => rawPods.map((pod) => enrichPodWithHealth(pod, containerLogsMap)),
    [rawPods, containerLogsMap]
  );

  const versionGroups = useMemo(
    () => groupPodsByVersion(podsWithHealth),
    [podsWithHealth]
  );

  const hasLogIssues = (pod: PodWithHealth | null | undefined) => {
    if (!pod) return false;
    return (
      pod.logSummary.errors > 0 ||
      pod.logSummary.exceptions > 0 ||
      pod.logSummary.warnings > 0
    );
  };

  const hasStatusIssues = (pod: PodWithHealth | null | undefined) => {
    if (!pod) return false;
    return pod.health !== 'healthy';
  };

  const needsAttention = (pod: PodWithHealth | null | undefined) => {
    return hasLogIssues(pod) || hasStatusIssues(pod);
  };

  const allDeployments = useMemo(
    () => groupPodsByDeployment(podsWithHealth),
    [podsWithHealth]
  );

  const latestPods = useMemo(
    () => allDeployments.map((deployment) => deployment.pods[0]).filter(Boolean),
    [allDeployments]
  );

  const deployments = useMemo(() => {
    let filtered = allDeployments;
    if (healthFilter !== 'all') {
      filtered = filtered.filter((deployment) => deployment.pods[0]?.health === healthFilter);
    }
    if (latestIssuesOnly) {
      filtered = filtered.filter((deployment) => hasLogIssues(deployment.pods[0]));
    }
    return filtered;
  }, [allDeployments, healthFilter, latestIssuesOnly]);

  useEffect(() => {
    if (deployments.length === 0) {
      setSelectedDeploymentId(null);
      setSelectedPod(null);
      return;
    }

    const exists = deployments.some((deployment) => deployment.id === selectedDeploymentId);
    if (!exists) {
      setSelectedDeploymentId(deployments[0].id);
    }
  }, [deployments, selectedDeploymentId]);

  const selectedDeployment: DeploymentGroup | null = useMemo(() => {
    if (!selectedDeploymentId) return null;
    return deployments.find((deployment) => deployment.id === selectedDeploymentId) ?? null;
  }, [deployments, selectedDeploymentId]);

  useEffect(() => {
    if (!selectedDeployment) {
      setSelectedPod(null);
      return;
    }

    setSelectedPod((prev) => {
      if (!prev) return selectedDeployment.pods[0] ?? null;
      return selectedDeployment.pods.find((pod) => pod.id === prev.id) ?? selectedDeployment.pods[0] ?? null;
    });
  }, [selectedDeployment]);

  const errorCount = latestPods.filter((pod) => pod.health === 'error').length;
  const warningCount = latestPods.filter((pod) => pod.health === 'warning').length;
  const healthyCount = latestPods.filter((pod) => pod.health === 'healthy').length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading cluster data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-destructive mb-2">Failed to load data</h2>
          <p className="text-muted-foreground mb-4">{error.message}</p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Layers className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Kubernetes Monitor</h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{allDeployments.length} deployments</span>
                  <span>• {podsWithHealth.length} tracked pods</span>
                  <span>• {healthyCount} healthy latest pods</span>
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1 text-[hsl(var(--status-error))]">
                      • {errorCount} error{errorCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="flex items-center gap-1 text-[hsl(var(--status-warning))]">
                      • {warningCount} warning{warningCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-4">
        <div className="mb-6">
          <HealthSummaryCards
            pods={latestPods}
            versionGroups={versionGroups}
            onFilterHealth={setHealthFilter}
            activeFilter={healthFilter}
            totalLabel="Total Deployments"
          />
        </div>

        <div className="grid grid-cols-12 gap-4">
          <section className="col-span-3 bg-card rounded-xl border border-border p-3">
            <h2 className="text-sm font-semibold mb-3">Deployments</h2>
            <button
              onClick={() => setLatestIssuesOnly((prev) => !prev)}
              className={cn(
                'mb-3 w-full text-left text-xs px-2 py-1.5 rounded-md border transition-colors',
                latestIssuesOnly
                  ? 'border-[hsl(var(--status-error)/0.45)] bg-[hsl(var(--status-error)/0.12)] text-[hsl(var(--status-error))]'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              )}
            >
              {latestIssuesOnly ? 'Showing: Latest Pod Log Issues Only' : 'Show: Latest Pod Log Issues Only'}
            </button>
            <div className="space-y-2">
              {deployments.map((deployment) => {
                const latestPod = deployment.pods[0];
                const latestHasLogIssues = hasLogIssues(latestPod);
                const latestNeedsAttention = needsAttention(latestPod);
                return (
                  <button
                    key={deployment.id}
                    onClick={() => setSelectedDeploymentId(deployment.id)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition-colors',
                      selectedDeploymentId === deployment.id
                        ? 'border-primary bg-primary/10'
                        : latestNeedsAttention
                          ? 'border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.06)] hover:bg-[hsl(var(--status-warning)/0.12)]'
                          : 'border-[hsl(var(--status-ready)/0.35)] bg-[hsl(var(--status-ready)/0.06)] hover:bg-[hsl(var(--status-ready)/0.1)]'
                    )}
                  >
                    <div className="font-medium truncate">{deployment.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Latest pod: {latestPod?.name ?? 'n/a'}
                    </div>
                    {latestPod && (
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(latestPod.createdAt), { addSuffix: true })}
                      </div>
                    )}
                    {latestHasLogIssues ? (
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        {(latestPod?.logSummary.errors ?? 0) > 0 && (
                          <span className="text-[hsl(var(--status-error))]">
                            {latestPod?.logSummary.errors} errors
                          </span>
                        )}
                        {(latestPod?.logSummary.exceptions ?? 0) > 0 && (
                          <span className="text-[hsl(var(--status-error))]">
                            {latestPod?.logSummary.exceptions} exceptions
                          </span>
                        )}
                        {(latestPod?.logSummary.warnings ?? 0) > 0 && (
                          <span className="text-[hsl(var(--status-warning))]">
                            {latestPod?.logSummary.warnings} warnings
                          </span>
                        )}
                      </div>
                    ) : hasStatusIssues(latestPod) ? (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-[hsl(var(--status-warning))]">
                        Needs attention: {latestPod?.status}
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-[hsl(var(--status-ready))]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Healthy - no attention needed
                      </div>
                    )}
                  </button>
                );
              })}
              {deployments.length === 0 && (
                <div className="text-sm text-muted-foreground">No deployments matched current filter.</div>
              )}
            </div>
          </section>

          <section className="col-span-4 bg-card rounded-xl border border-border p-3">
            <h2 className="text-sm font-semibold mb-1">Pods</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Sorted by creation time (newest first)
            </p>
            <div className="space-y-2">
              {selectedDeployment?.pods.map((pod) => {
                const podHasLogIssues = hasLogIssues(pod);
                const podNeedsAttention = needsAttention(pod);
                return (
                  <button
                    key={pod.id}
                    onClick={() => setSelectedPod(pod)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition-colors',
                      selectedPod?.id === pod.id
                        ? 'border-primary bg-primary/10'
                        : podNeedsAttention
                          ? 'border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.06)] hover:bg-[hsl(var(--status-warning)/0.12)]'
                          : 'border-[hsl(var(--status-ready)/0.35)] bg-[hsl(var(--status-ready)/0.06)] hover:bg-[hsl(var(--status-ready)/0.1)]'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{pod.name}</span>
                      <StatusBadge status={pod.status} className="text-[10px]" />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(pod.createdAt), { addSuffix: true })}
                    </div>
                    {podHasLogIssues ? (
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        {pod.logSummary.errors > 0 && (
                          <span className="text-[hsl(var(--status-error))]">
                            {pod.logSummary.errors} errors
                          </span>
                        )}
                        {pod.logSummary.exceptions > 0 && (
                          <span className="text-[hsl(var(--status-error))]">
                            {pod.logSummary.exceptions} exceptions
                          </span>
                        )}
                        {pod.logSummary.warnings > 0 && (
                          <span className="text-[hsl(var(--status-warning))]">
                            {pod.logSummary.warnings} warnings
                          </span>
                        )}
                      </div>
                    ) : hasStatusIssues(pod) ? (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-[hsl(var(--status-warning))]">
                        Needs attention: {pod.status}
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-[hsl(var(--status-ready))]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Healthy - no attention needed
                      </div>
                    )}
                  </button>
                );
              })}
              {!selectedDeployment && (
                <div className="text-sm text-muted-foreground">Select a deployment to view pods.</div>
              )}
            </div>
          </section>

          <section className="col-span-5">
            {selectedPod ? (
              <PodDetailPanel pod={selectedPod} onClose={() => setSelectedPod(null)} />
            ) : (
              <div className="h-full min-h-[40vh] rounded-xl border border-border bg-card flex items-center justify-center text-muted-foreground">
                Select a pod to inspect containers and logs.
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
