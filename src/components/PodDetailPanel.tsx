import { PodWithHealth, Container } from '@/types/kubernetes';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Box,
  Server,
  Network,
  Calendar,
  Tag,
  X,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ContainerHistoryPanel } from './ContainerHistoryPanel';
import { LogViewer } from './LogViewer';
import { ResourceUsagePanel } from './ResourceUsagePanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PodDetailPanelProps {
  pod: PodWithHealth;
  onClose: () => void;
}

export const PodDetailPanel = ({ pod, onClose }: PodDetailPanelProps) => {
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'logs' | 'resources'>('logs');

  useEffect(() => {
    if (pod.containers.length === 0) {
      setSelectedContainer(null);
      return;
    }

    // When pod changes, keep selected container only if it exists in new pod; otherwise pick first.
    setSelectedContainer((prev) => {
      if (!prev) return pod.containers[0];
      return pod.containers.find((c) => c.id === prev.id) ?? pod.containers[0];
    });
  }, [pod.id, pod.containers]);

  const healthConfig = {
    healthy: {
      icon: CheckCircle,
      label: 'Healthy',
      className: 'text-[hsl(var(--status-ready))] bg-[hsl(var(--status-ready)/0.1)]',
    },
    warning: {
      icon: AlertTriangle,
      label: 'Warning',
      className: 'text-[hsl(var(--status-warning))] bg-[hsl(var(--status-warning)/0.1)]',
    },
    error: {
      icon: XCircle,
      label: 'Error',
      className: 'text-[hsl(var(--status-error))] bg-[hsl(var(--status-error)/0.1)]',
    },
  };

  const config = healthConfig[pod.health];
  const HealthIcon = config.icon;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="flex flex-col bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card/50">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={cn('p-2.5 rounded-lg', config.className)}>
              <HealthIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{pod.name}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span className="text-primary">{pod.namespace}</span>
                <span>•</span>
                <span>{pod.status}</span>
                {pod.version && (
                  <>
                    <span>•</span>
                    <span className="font-mono text-primary">v{pod.version}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div className="flex items-center gap-2 group">
            <Server className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Node:</span>
            <span className="truncate">{pod.nodeName || 'Pending'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">IP:</span>
            <span className="font-mono">{pod.podIP || 'N/A'}</span>
            {pod.podIP && (
              <button
                onClick={() => copyToClipboard(pod.podIP, 'ip')}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {copiedField === 'ip' ? (
                  <Check className="w-3.5 h-3.5 text-[hsl(var(--status-ready))]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Created:</span>
            <span title={format(new Date(pod.createdAt), 'PPpp')}>
              {formatDistanceToNow(new Date(pod.createdAt), { addSuffix: true })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Restarts:</span>
            <span className={cn(
              pod.restarts > 0 && 'text-[hsl(var(--status-warning))]'
            )}>
              {pod.restarts}
            </span>
          </div>
        </div>

        {/* Labels */}
        {Object.keys(pod.labels).length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Tag className="w-3.5 h-3.5" />
              Labels
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(pod.labels).map(([key, value]) => (
                <span
                  key={key}
                  className="px-2 py-0.5 bg-secondary text-xs rounded font-mono truncate max-w-[200px]"
                  title={`${key}=${value}`}
                >
                  {key}={value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content area split between containers and logs */}
      <div className="flex flex-col min-h-0">
        {/* Containers section */}
        <div className="min-h-0 overflow-hidden">
          <ContainerHistoryPanel
            pod={pod}
            selectedContainerId={selectedContainer?.id ?? null}
            onSelectContainer={setSelectedContainer}
          />
        </div>

        {/* Logs section */}
        {selectedContainer && (
          <div className="h-80 border-t border-border p-3">
            <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as 'logs' | 'resources')} className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="logs">Logs</TabsTrigger>
                <TabsTrigger value="resources">Resources</TabsTrigger>
              </TabsList>
              <TabsContent value="logs" className="flex-1 min-h-0">
                <div className="h-full rounded-lg border border-border/70 overflow-hidden">
                  <LogViewer key={`logs-${selectedContainer.id}`} container={selectedContainer} />
                </div>
              </TabsContent>
              <TabsContent value="resources" className="flex-1 min-h-0">
                <div className="h-full rounded-lg border border-border/70 overflow-hidden">
                  <ResourceUsagePanel key={`resources-${selectedContainer.id}`} container={selectedContainer} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
};
