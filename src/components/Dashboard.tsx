import { useState, useMemo } from 'react';
import { PodWithHealth, Container, HealthStatus } from '@/types/kubernetes';
import { usePods, useContainerLogs } from '@/hooks/useKubernetesData';
import { HealthSummaryCards } from './HealthSummaryCards';
import { PodHealthCard } from './PodHealthCard';
import { PodDetailPanel } from './PodDetailPanel';
import { VersionTimeline } from './VersionTimeline';
import {
  enrichPodWithHealth,
  groupPodsByVersion,
  sortPodsByHealth,
  getActivePods,
} from '@/lib/podHealth';
import { Layers, Loader2, RefreshCw, AlertCircle, GitBranch, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'versions';

export const Dashboard = () => {
  const [selectedPod, setSelectedPod] = useState<PodWithHealth | null>(null);
  const [healthFilter, setHealthFilter] = useState<'all' | HealthStatus>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const { data: rawPods = [], isLoading, error, refetch, isFetching } = usePods();

  // Get logs for all containers to compute warning status
  const allContainerIds = useMemo(() => {
    return rawPods.flatMap((pod) => pod.containers.map((c) => c.id));
  }, [rawPods]);

  // We'll fetch logs for containers in selected pod only to keep it performant
  const selectedContainerIds = selectedPod?.containers.map((c) => c.id) ?? [];
  
  // Build container logs map (simplified - in real app would aggregate all)
  const containerLogsMap = useMemo(() => new Map<string, []>(), []);

  // Process pods with health status
  const podsWithHealth = useMemo(() => {
    const activePods = getActivePods(rawPods);
    return activePods.map((pod) => enrichPodWithHealth(pod, containerLogsMap));
  }, [rawPods, containerLogsMap]);

  // Sort and filter pods
  const displayPods = useMemo(() => {
    let filtered = podsWithHealth;
    if (healthFilter !== 'all') {
      filtered = podsWithHealth.filter((p) => p.health === healthFilter);
    }
    return sortPodsByHealth(filtered);
  }, [podsWithHealth, healthFilter]);

  // Group by version
  const versionGroups = useMemo(
    () => groupPodsByVersion(podsWithHealth),
    [podsWithHealth]
  );

  const handleSelectPod = (pod: PodWithHealth) => {
    setSelectedPod(pod);
  };

  const handleClosePod = () => {
    setSelectedPod(null);
  };

  // Quick stats for header
  const errorCount = podsWithHealth.filter((p) => p.health === 'error').length;
  const warningCount = podsWithHealth.filter((p) => p.health === 'warning').length;
  const healthyCount = podsWithHealth.filter((p) => p.health === 'healthy').length;

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
      {/* Header */}
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
                  <span>{podsWithHealth.length} active pods</span>
                  <span>• {healthyCount} deployed healthy</span>
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

            <div className="flex items-center gap-3">
              {/* View toggle */}
              <div className="flex items-center bg-secondary rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors',
                    viewMode === 'grid'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('versions')}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors',
                    viewMode === 'versions'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <GitBranch className="w-4 h-4" />
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto p-4">
        {/* Health summary cards */}
        <div className="mb-6">
          <HealthSummaryCards
            pods={podsWithHealth}
            versionGroups={versionGroups}
            onFilterHealth={setHealthFilter}
            activeFilter={healthFilter}
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-12 gap-4">
          {/* Left panel - Pods list/grid */}
          <div className={cn(
            'transition-all duration-300',
            selectedPod ? 'col-span-5' : 'col-span-12'
          )}>
            {viewMode === 'grid' ? (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Sorted by priority: <span className="text-[hsl(var(--status-error))]">errors</span>,{' '}
                  <span className="text-[hsl(var(--status-warning))]">warnings</span>, initializing, then healthy.
                </div>
                {displayPods.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Layers className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg">No pods found</p>
                    <p className="text-sm">
                      {healthFilter !== 'all'
                        ? `No ${healthFilter} pods in the cluster`
                        : 'No active pods in the cluster'}
                    </p>
                  </div>
                ) : (
                  <div className={cn(
                    'grid gap-3',
                    selectedPod ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  )}>
                    {displayPods.map((pod) => (
                      <PodHealthCard
                        key={pod.id}
                        pod={pod}
                        isSelected={selectedPod?.id === pod.id}
                        onSelect={handleSelectPod}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="glass-panel p-4">
                <VersionTimeline
                  versionGroups={versionGroups}
                  onSelectPod={handleSelectPod}
                  selectedPodId={selectedPod?.id ?? null}
                />
              </div>
            )}
          </div>

          {/* Right panel - Pod details */}
          {selectedPod && (
            <div className="col-span-7">
              <PodDetailPanel pod={selectedPod} onClose={handleClosePod} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
