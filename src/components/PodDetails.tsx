import { Pod, Container } from '@/types/kubernetes';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Box,
  Server,
  Network,
  Calendar,
  Tag,
  Container as ContainerIcon,
  CheckCircle,
  XCircle,
  RefreshCw,
  Image,
} from 'lucide-react';

interface PodDetailsProps {
  pod: Pod;
  selectedContainerId: string | null;
  onSelectContainer: (container: Container) => void;
}

export const PodDetails = ({ pod, selectedContainerId, onSelectContainer }: PodDetailsProps) => {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Box className="w-5 h-5 text-primary" />
              Pod Details
            </h2>
            <p className="text-sm text-muted-foreground mt-1 font-mono">{pod.name}</p>
          </div>
          <StatusBadge status={pod.status} />
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Namespace:</span>
            <span className="text-primary">{pod.namespace}</span>
          </div>
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Node:</span>
            <span>{pod.nodeName || 'Pending'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Pod IP:</span>
            <span className="font-mono">{pod.podIP || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Created:</span>
            <span>{formatDistanceToNow(new Date(pod.createdAt), { addSuffix: true })}</span>
          </div>
        </div>

        {/* Labels */}
        {Object.keys(pod.labels).length > 0 && (
          <div className="mt-3">
            <span className="text-xs text-muted-foreground block mb-1.5">Labels:</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(pod.labels).map(([key, value]) => (
                <span
                  key={key}
                  className="px-2 py-0.5 bg-secondary text-xs rounded font-mono"
                >
                  {key}={value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Containers */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ContainerIcon className="w-4 h-4 text-primary" />
          Containers ({pod.containers.length})
        </h3>

        <div className="space-y-2">
          {pod.containers.map((container) => (
            <div
              key={container.id}
              onClick={() => onSelectContainer(container)}
              className={cn(
                'p-3 rounded-lg border border-border hover:border-primary/30 cursor-pointer transition-all',
                selectedContainerId === container.id && 'border-primary bg-accent/50 glow-effect'
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      container.ready ? 'bg-[hsl(var(--status-ready))]' : 'bg-[hsl(var(--status-error))]'
                    )}
                  />
                  <span className="font-medium">{container.name}</span>
                </div>
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded',
                    container.status === 'Running' && 'bg-[hsl(var(--status-ready)/0.15)] text-[hsl(var(--status-ready))]',
                    container.status === 'Waiting' && 'bg-[hsl(var(--status-pending)/0.15)] text-[hsl(var(--status-pending))]',
                    container.status === 'Terminated' && 'bg-[hsl(var(--status-error)/0.15)] text-[hsl(var(--status-error))]'
                  )}
                >
                  {container.status}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Image className="w-3.5 h-3.5" />
                  <span className="font-mono truncate">{container.image}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    {container.ready ? (
                      <CheckCircle className="w-3.5 h-3.5 text-[hsl(var(--status-ready))]" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-[hsl(var(--status-error))]" />
                    )}
                    <span>{container.ready ? 'Ready' : 'Not Ready'}</span>
                  </div>
                  {container.restartCount > 0 && (
                    <div className="flex items-center gap-1 text-[hsl(var(--status-warning))]">
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{container.restartCount} restarts</span>
                    </div>
                  )}
                </div>
                {container.startedAt && (
                  <div className="text-muted-foreground">
                    Started: {format(new Date(container.startedAt), 'MMM d, HH:mm:ss')}
                  </div>
                )}
                {container.lastState && (
                  <div className="mt-2 p-2 bg-[hsl(var(--status-error)/0.1)] rounded text-[hsl(var(--status-error))]">
                    <div className="font-medium">{container.lastState.reason}</div>
                    {container.lastState.message && (
                      <div className="opacity-80 mt-0.5">{container.lastState.message}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
