import { Container, PodWithHealth } from '@/types/kubernetes';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { classifyContainerSeverity, isSidecarContainer } from '@/lib/podHealth';
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
  const sortBySeverity = (containers: Container[]) => [...containers].sort((a, b) => {
    const aScore = classifyContainerSeverity(a).score;
    const bScore = classifyContainerSeverity(b).score;
    if (aScore !== bScore) return bScore - aScore;
    if (a.restartCount !== b.restartCount) return b.restartCount - a.restartCount;
    return a.name.localeCompare(b.name);
  });

  const applicationContainers = sortBySeverity(
    pod.containers.filter((container) => !isSidecarContainer(container))
  );
  const sidecarContainers = sortBySeverity(
    pod.containers.filter((container) => isSidecarContainer(container))
  );

  // Apps first, sidecars immediately after
  const orderedContainers = [...applicationContainers, ...sidecarContainers].map((container) => ({
    container,
    sidecar: isSidecarContainer(container),
  }));
  const sidecarCount = sidecarContainers.length;

  const getStatusConfig = (container: Container) => {
    const classification = classifyContainerSeverity(container);
    if (classification.severity === 'error') {
      return {
        bgClass: 'bg-[hsl(var(--status-error)/0.1)]',
        borderClass: 'border-[hsl(var(--status-error)/0.3)]',
        iconClass: 'text-[hsl(var(--status-error))]',
        icon: XCircle,
      };
    }
    if (classification.severity === 'warning') {
      return {
        bgClass: 'bg-[hsl(var(--status-warning)/0.1)]',
        borderClass: 'border-[hsl(var(--status-warning)/0.3)]',
        iconClass: 'text-[hsl(var(--status-warning))]',
        icon: AlertTriangle,
      };
    }
    if (classification.severity === 'initializing') {
      return {
        bgClass: 'bg-[hsl(var(--status-pending)/0.08)]',
        borderClass: 'border-[hsl(var(--status-pending)/0.3)]',
        iconClass: 'text-[hsl(var(--status-pending))]',
        icon: Clock,
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
    <div className="flex flex-col">
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
      <div className="max-h-[38vh] overflow-y-auto scrollbar-thin p-3 space-y-2">
        {orderedContainers.map(({ container, sidecar }, index) => {
          const config = getStatusConfig(container);
          const StatusIcon = config.icon;
          const isSelected = selectedContainerId === container.id;
          const classification = classifyContainerSeverity(container);
          const statusLabel =
            classification.severity === 'initializing'
              ? 'Initializing'
              : container.status;
          const previousIsSidecar = index > 0 ? orderedContainers[index - 1].sidecar : sidecar;
          const showGroupLabel = index === 0 || previousIsSidecar !== sidecar;

          return (
            <div key={container.id}>
              {showGroupLabel && (
                <div className="mb-1 px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {sidecar ? `Sidecars (${sidecarCount})` : `Application Containers (${applicationContainers.length})`}
                </div>
              )}
              <button
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
                    {sidecar && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        sidecar
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      classification.severity === 'healthy' && 'bg-[hsl(var(--status-ready)/0.15)] text-[hsl(var(--status-ready))]',
                      classification.severity === 'initializing' && 'bg-[hsl(var(--status-pending)/0.15)] text-[hsl(var(--status-pending))]',
                      classification.severity === 'warning' && 'bg-[hsl(var(--status-warning)/0.15)] text-[hsl(var(--status-warning))]',
                      classification.severity === 'error' && 'bg-[hsl(var(--status-error)/0.15)] text-[hsl(var(--status-error))]'
                    )}
                  >
                    {statusLabel}
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
                  <div
                    className={cn(
                      'mt-3 p-2.5 rounded-lg text-xs',
                      classification.severity === 'error'
                        ? 'bg-[hsl(var(--status-error)/0.15)]'
                        : 'bg-[hsl(var(--status-warning)/0.12)]'
                    )}
                  >
                    <div
                      className={cn(
                        'font-semibold flex items-center gap-1.5',
                        classification.severity === 'error'
                          ? 'text-[hsl(var(--status-error))]'
                          : 'text-[hsl(var(--status-warning))]'
                      )}
                    >
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
            </div>
          );
        })}
      </div>
    </div>
  );
};
