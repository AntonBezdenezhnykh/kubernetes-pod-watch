import { PodWithHealth, VersionGroup } from '@/types/kubernetes';
import { cn } from '@/lib/utils';
import { CheckCircle, AlertTriangle, XCircle, Box, GitBranch } from 'lucide-react';

interface HealthSummaryCardsProps {
  pods: PodWithHealth[];
  versionGroups: VersionGroup[];
  onFilterHealth: (health: 'all' | 'healthy' | 'warning' | 'error') => void;
  activeFilter: 'all' | 'healthy' | 'warning' | 'error';
  totalLabel?: string;
}

export const HealthSummaryCards = ({
  pods,
  versionGroups,
  onFilterHealth,
  activeFilter,
  totalLabel = 'Total Pods',
}: HealthSummaryCardsProps) => {
  const healthyCounts = pods.filter((p) => p.health === 'healthy').length;
  const warningCount = pods.filter((p) => p.health === 'warning').length;
  const errorCount = pods.filter((p) => p.health === 'error').length;
  const totalPods = pods.length;

  const latestVersion = versionGroups[0]?.version ?? 'N/A';

  const cards = [
    {
      key: 'all' as const,
      label: totalLabel,
      count: totalPods,
      icon: Box,
      bgClass: 'bg-primary/10',
      textClass: 'text-primary',
      borderClass: 'border-primary/30',
    },
    {
      key: 'healthy' as const,
      label: 'Healthy',
      count: healthyCounts,
      icon: CheckCircle,
      bgClass: 'bg-[hsl(var(--status-ready)/0.1)]',
      textClass: 'text-[hsl(var(--status-ready))]',
      borderClass: 'border-[hsl(var(--status-ready)/0.3)]',
    },
    {
      key: 'warning' as const,
      label: 'Warnings',
      count: warningCount,
      icon: AlertTriangle,
      bgClass: 'bg-[hsl(var(--status-warning)/0.1)]',
      textClass: 'text-[hsl(var(--status-warning))]',
      borderClass: 'border-[hsl(var(--status-warning)/0.3)]',
    },
    {
      key: 'error' as const,
      label: 'Errors',
      count: errorCount,
      icon: XCircle,
      bgClass: 'bg-[hsl(var(--status-error)/0.1)]',
      textClass: 'text-[hsl(var(--status-error))]',
      borderClass: 'border-[hsl(var(--status-error)/0.3)]',
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-4">
      {cards.map((card) => (
        <button
          key={card.key}
          onClick={() => onFilterHealth(card.key)}
          className={cn(
            'p-4 rounded-xl border transition-all duration-200 text-left',
            card.bgClass,
            activeFilter === card.key ? card.borderClass : 'border-transparent',
            activeFilter === card.key && 'ring-1 ring-offset-2 ring-offset-background',
            activeFilter === card.key && card.key === 'healthy' && 'ring-[hsl(var(--status-ready))]',
            activeFilter === card.key && card.key === 'warning' && 'ring-[hsl(var(--status-warning))]',
            activeFilter === card.key && card.key === 'error' && 'ring-[hsl(var(--status-error))]',
            activeFilter === card.key && card.key === 'all' && 'ring-primary'
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <card.icon className={cn('w-5 h-5', card.textClass)} />
          </div>
          <div className={cn('text-3xl font-bold', card.textClass)}>{card.count}</div>
          <div className="text-sm text-muted-foreground">{card.label}</div>
        </button>
      ))}

      {/* Version Info Card */}
      <div className="p-4 rounded-xl border border-border bg-card/50">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch className="w-5 h-5 text-primary" />
          <span className="text-sm text-muted-foreground">Latest Version</span>
        </div>
        <div className="text-lg font-mono font-semibold text-primary truncate" title={latestVersion}>
          {latestVersion}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {versionGroups.length} version{versionGroups.length !== 1 ? 's' : ''} deployed
        </div>
      </div>
    </div>
  );
};
