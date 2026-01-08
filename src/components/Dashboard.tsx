import { useState } from 'react';
import { Pod, Container } from '@/types/kubernetes';
import { usePods } from '@/hooks/useKubernetesData';
import { PodList } from './PodList';
import { PodDetails } from './PodDetails';
import { LogViewer } from './LogViewer';
import { Layers, Box, Terminal, Activity, Loader2 } from 'lucide-react';

export const Dashboard = () => {
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  
  const { data: pods = [], isLoading, error } = usePods();

  const handleSelectPod = (pod: Pod) => {
    setSelectedPod(pod);
    setSelectedContainer(null);
  };

  const handleSelectContainer = (container: Container) => {
    setSelectedContainer(container);
  };

  // Stats
  const totalPods = pods.length;
  const runningPods = pods.filter((p) => p.status === 'Running').length;
  const errorPods = pods.filter((p) => ['Error', 'OOMKilled', 'CrashLoopBackOff'].includes(p.status)).length;
  const pendingPods = pods.filter((p) => p.status === 'Pending').length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Layers className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Kubernetes Monitor</h1>
                <p className="text-sm text-muted-foreground">Real-time pod monitoring dashboard</p>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total:</span>
                <span className="font-semibold">{totalPods}</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[hsl(var(--status-ready))]" />
                <span className="text-sm text-muted-foreground">Running:</span>
                <span className="font-semibold text-[hsl(var(--status-ready))]">{runningPods}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[hsl(var(--status-error))]" />
                <span className="text-sm text-muted-foreground">Errors:</span>
                <span className="font-semibold text-[hsl(var(--status-error))]">{errorPods}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[hsl(var(--status-pending))]" />
                <span className="text-sm text-muted-foreground">Pending:</span>
                <span className="font-semibold text-[hsl(var(--status-pending))]">{pendingPods}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-4">
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-120px)]">
          {/* Pod List */}
          <div className="col-span-4 glass-panel overflow-hidden">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="h-full flex items-center justify-center text-destructive">
                <div className="text-center">
                  <p className="text-lg">Error loading pods</p>
                  <p className="text-sm">{error.message}</p>
                </div>
              </div>
            ) : (
              <PodList
                pods={pods}
                selectedPodId={selectedPod?.id ?? null}
                onSelectPod={handleSelectPod}
              />
            )}
          </div>

          {/* Pod Details & Logs */}
          <div className="col-span-8 flex flex-col gap-4">
            {/* Pod Details */}
            <div className="flex-1 glass-panel overflow-hidden min-h-0">
              {selectedPod ? (
                <PodDetails
                  pod={selectedPod}
                  selectedContainerId={selectedContainer?.id ?? null}
                  onSelectContainer={handleSelectContainer}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Box className="w-16 h-16 mx-auto mb-3 opacity-30" />
                    <p className="text-lg">Select a pod to view details</p>
                    <p className="text-sm">Click on a pod from the list on the left</p>
                  </div>
                </div>
              )}
            </div>

            {/* Log Viewer */}
            <div className="h-80 relative">
              {selectedContainer ? (
                <LogViewer container={selectedContainer} />
              ) : (
                <div className="terminal-window h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Terminal className="w-16 h-16 mx-auto mb-3 opacity-30" />
                    <p className="text-lg">Select a container to view logs</p>
                    <p className="text-sm">Click on a container from the pod details above</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
