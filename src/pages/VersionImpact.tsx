import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePods } from '@/hooks/useKubernetesData';
import { PodWithHealth } from '@/types/kubernetes';
import { enrichPodWithHealth, groupPodsByDeployment } from '@/lib/podHealth';
import { VersionImpactPanel } from '@/components/VersionImpactPanel';

const VersionImpact = () => {
  const { data: rawPods = [], isLoading, error } = usePods();
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const containerLogsMap = useMemo(() => new Map<string, []>(), []);

  const podsWithHealth: PodWithHealth[] = useMemo(
    () => rawPods.map((pod) => enrichPodWithHealth(pod, containerLogsMap)),
    [rawPods, containerLogsMap]
  );

  const deployments = useMemo(() => groupPodsByDeployment(podsWithHealth), [podsWithHealth]);

  useEffect(() => {
    if (!selectedDeploymentId && deployments[0]) {
      setSelectedDeploymentId(deployments[0].id);
    }
  }, [deployments, selectedDeploymentId]);

  const selectedDeployment =
    deployments.find((deployment) => deployment.id === selectedDeploymentId) ?? null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold">Version Impact</h1>
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-3 space-y-3">
        {error ? (
          <div className="rounded-xl border border-[hsl(var(--status-error)/0.4)] bg-[hsl(var(--status-error)/0.08)] p-4 text-sm text-[hsl(var(--status-error))]">
            Failed to load pods: {error.message}
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-card p-3">
              <label className="text-[11px] text-muted-foreground block mb-1.5">Deployment</label>
              <select
                value={selectedDeploymentId ?? ''}
                onChange={(e) => setSelectedDeploymentId(e.target.value)}
                className="w-full md:w-[340px] bg-background border border-border rounded px-2 py-1 text-[13px]"
              >
                {deployments.map((deployment) => (
                  <option key={deployment.id} value={deployment.id}>
                    {deployment.name}
                  </option>
                ))}
              </select>
            </div>

            <VersionImpactPanel deployment={selectedDeployment} />
          </>
        )}
      </main>
    </div>
  );
};

export default VersionImpact;
