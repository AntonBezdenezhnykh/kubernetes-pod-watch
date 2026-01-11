import { PodWithHealth, Container } from '@/types/kubernetes';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Box,
  RefreshCw,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

interface PodHealthCardProps {
  pod: PodWithHealth;
  isSelected: boolean;
  onSelect: (pod: PodWithHealth) => void;
}

export const PodHealthCard = ({ pod, isSelected, onSelect }: PodHealthCardProps) => {
  const healthConfig = {
    healthy: {
      icon: CheckCircle,
      bgClass: 'bg-[hsl(var(--status-ready)/0.05)]',
      borderClass: 'border-[hsl(var(--status-ready)/0.2)]',
      iconClass: 'text-[hsl(var(--status-ready))]',
      label: 'Healthy',
    },
    warning: {
      icon: AlertTriangle,
      bgClass: 'bg-[hsl(var(--status-warning)/0.05)]',
      borderClass: 'border-[hsl(var(--status-warning)/0.3)]',
      iconClass: 'text-[hsl(var(--status-warning))]',
      label: 'Warning',
    },
    error: {
      icon: XCircle,
      bgClass: 'bg-[hsl(var(--status-error)/0.08)]',
      borderClass: 'border-[hsl(var(--status-error)/0.4)]',
      iconClass: 'text-[hsl(var(--status-error))]',
      label: 'Error',
    },
  };

  const config = healthConfig[pod.health];
  const Icon = config.icon;

  const readyContainers = pod.containers.filter((c) => c.ready).length;
  const totalContainers = pod.containers.length;
  const totalRestarts = pod.containers.reduce((sum, c) => sum + c.restartCount, 0);

  // Find the most problematic container
  const problematicContainer = pod.containers.find(
    (c) => !c.ready || c.status !== 'Running' || c.restartCount >= 3
  );

  return (
    <button
      onClick={() => onSelect(pod)}
      className={cn(
        'w-full p-4 rounded-xl border transition-all duration-200 text-left group hover:shadow-lg',
        config.bgClass,
        isSelected ? config.borderClass : 'border-transparent hover:border-border',
        isSelected && 'ring-2 ring-offset-2 ring-offset-background',
        isSelected && pod.health === 'healthy' && 'ring-[hsl(var(--status-ready)/0.5)]',
        isSelected && pod.health === 'warning' && 'ring-[hsl(var(--status-warning)/0.5)]',
        isSelected && pod.health === 'error' && 'ring-[hsl(var(--status-error)/0.5)]'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={cn('p-2 rounded-lg', config.bgClass)}>
            <Icon className={cn('w-5 h-5', config.iconClass)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{pod.name}</span>
                  {pod.hasLogErrors && (
                    <span title="Has error logs">
                      <AlertCircle className="w-4 h-4 text-[hsl(var(--status-warning))] shrink-0" />
                    </span>
                  )}
                </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {pod.namespace} • {formatDistanceToNow(new Date(pod.createdAt), { addSuffix: true })}
            </div>
            {pod.version && (
              <div className="mt-1.5">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary">
                  v{pod.version}
                </span>
              </div>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>

      {/* Container summary */}
      <div className="mt-3 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <Box className="w-3.5 h-3.5 text-muted-foreground" />
          <span className={cn(
            readyContainers === totalContainers
              ? 'text-[hsl(var(--status-ready))]'
              : 'text-[hsl(var(--status-warning))]'
          )}>
            {readyContainers}/{totalContainers} ready
          </span>
        </div>
        {totalRestarts > 0 && (
          <div className="flex items-center gap-1.5 text-[hsl(var(--status-warning))]">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{totalRestarts} restarts</span>
          </div>
        )}
      </div>

      {/* Show problematic container hint */}
      {problematicContainer && (
        <div className="mt-2 p-2 rounded-lg bg-[hsl(var(--status-error)/0.1)] text-xs">
          <span className="font-medium text-[hsl(var(--status-error))]">
            {problematicContainer.name}:
          </span>{' '}
          <span className="text-muted-foreground">
            {problematicContainer.status}
            {problematicContainer.lastState?.reason && ` - ${problematicContainer.lastState.reason}`}
          </span>
        </div>
      )}
    </button>
  );
};
