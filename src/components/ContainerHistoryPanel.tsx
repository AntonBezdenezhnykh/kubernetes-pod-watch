import { Container, PodWithHealth } from '@/types/kubernetes';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Container as ContainerIcon,
  CheckCircle,
  XCircle,
  RefreshCw,
  Clock,
  AlertTriangle,
  Image,
  Terminal,
} from 'lucide-react';

interface ContainerHistoryPanelProps {
  pod: PodWithHealth;
  selectedContainerId: string | null;
  onSelectContainer: (container: Container) => void;
}

export const ContainerHistoryPanel = ({
  pod,
  selectedContainerId,
  onSelectContainer,
}: ContainerHistoryPanelProps) => {
  // Sort containers: unhealthy first, then by restart count
  const sortedContainers = [...pod.containers].sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? 1 : -1;
    if (a.status !== b.status) {
      const priority = { Terminated: 0, Waiting: 1, Running: 2 };
      return priority[a.status] - priority[b.status];
    }
    return b.restartCount - a.restartCount;
  });

  const getStatusConfig = (container: Container) => {
    if (!container.ready || container.status === 'Terminated') {
      return {
        bgClass: 'bg-[hsl(var(--status-error)/0.1)]',
        borderClass: 'border-[hsl(var(--status-error)/0.3)]',
        iconClass: 'text-[hsl(var(--status-error))]',
        icon: XCircle,
      };
    }
    if (container.status === 'Waiting') {
      return {
        bgClass: 'bg-[hsl(var(--status-warning)/0.1)]',
        borderClass: 'border-[hsl(var(--status-warning)/0.3)]',
        iconClass: 'text-[hsl(var(--status-warning))]',
        icon: Clock,
      };
    }
    if (container.restartCount >= 3) {
      return {
        bgClass: 'bg-[hsl(var(--status-warning)/0.1)]',
        borderClass: 'border-[hsl(var(--status-warning)/0.3)]',
        iconClass: 'text-[hsl(var(--status-warning))]',
        icon: AlertTriangle,
      };
    }
    return {
      bgClass: 'bg-[hsl(var(--status-ready)/0.05)]',
      borderClass: 'border-[hsl(var(--status-ready)/0.2)]',
      iconClass: 'text-[hsl(var(--status-ready))]',
      icon: CheckCircle,
    };
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <ContainerIcon className="w-5 h-5 text-primary" />
              Containers
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {pod.name}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-[hsl(var(--status-ready))]" />
              {pod.containers.filter((c) => c.ready).length} ready
            </span>
            <span className="flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-[hsl(var(--status-error))]" />
              {pod.containers.filter((c) => !c.ready).length} issues
            </span>
          </div>
        </div>
      </div>

      {/* Container list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {sortedContainers.map((container) => {
          const config = getStatusConfig(container);
          const StatusIcon = config.icon;
          const isSelected = selectedContainerId === container.id;

          return (
            <button
              key={container.id}
              onClick={() => onSelectContainer(container)}
              className={cn(
                'w-full p-4 rounded-xl border transition-all text-left',
                config.bgClass,
                isSelected ? config.borderClass : 'border-transparent',
                isSelected && 'ring-2 ring-offset-2 ring-offset-background ring-primary/50',
                'hover:border-border'
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <StatusIcon className={cn('w-5 h-5', config.iconClass)} />
                  <span className="font-medium">{container.name}</span>
                </div>
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    container.status === 'Running' && 'bg-[hsl(var(--status-ready)/0.15)] text-[hsl(var(--status-ready))]',
                    container.status === 'Waiting' && 'bg-[hsl(var(--status-pending)/0.15)] text-[hsl(var(--status-pending))]',
                    container.status === 'Terminated' && 'bg-[hsl(var(--status-error)/0.15)] text-[hsl(var(--status-error))]'
                  )}
                >
                  {container.status}
                </span>
              </div>

              {/* Image */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Image className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono truncate">{container.image}</span>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs">
                {container.startedAt && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDistanceToNow(new Date(container.startedAt), { addSuffix: true })}
                  </div>
                )}
                {container.restartCount > 0 && (
                  <div className={cn(
                    'flex items-center gap-1.5',
                    container.restartCount >= 3
                      ? 'text-[hsl(var(--status-error))]'
                      : 'text-[hsl(var(--status-warning))]'
                  )}>
                    <RefreshCw className="w-3.5 h-3.5" />
                    {container.restartCount} restart{container.restartCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {/* Last state error */}
              {container.lastState && (
                <div className="mt-3 p-2.5 rounded-lg bg-[hsl(var(--status-error)/0.15)] text-xs">
                  <div className="font-semibold text-[hsl(var(--status-error))] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {container.lastState.reason}
                    {container.lastState.exitCode !== undefined && (
                      <span className="font-mono">(exit: {container.lastState.exitCode})</span>
                    )}
                  </div>
                  {container.lastState.message && (
                    <p className="mt-1 text-muted-foreground line-clamp-2">
                      {container.lastState.message}
                    </p>
                  )}
                </div>
              )}

              {/* Click hint */}
              <div className="mt-3 pt-2 border-t border-border/50 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Terminal className="w-3.5 h-3.5" />
                Click to view logs
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
