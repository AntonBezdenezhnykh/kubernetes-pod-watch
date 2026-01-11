import { VersionGroup, PodWithHealth } from '@/types/kubernetes';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import {
  GitBranch,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

interface VersionTimelineProps {
  versionGroups: VersionGroup[];
  onSelectPod: (pod: PodWithHealth) => void;
  selectedPodId: string | null;
}

export const VersionTimeline = ({
  versionGroups,
  onSelectPod,
  selectedPodId,
}: VersionTimelineProps) => {
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    new Set(versionGroups.slice(0, 2).map((v) => v.version))
  );

  const toggleVersion = (version: string) => {
    const newExpanded = new Set(expandedVersions);
    if (newExpanded.has(version)) {
      newExpanded.delete(version);
    } else {
      newExpanded.add(version);
    }
    setExpandedVersions(newExpanded);
  };

  if (versionGroups.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p>No version data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {versionGroups.map((group, index) => {
        const isExpanded = expandedVersions.has(group.version);
        const isLatest = index === 0;
        const hasIssues = group.healthSummary.error > 0 || group.healthSummary.warning > 0;

        return (
          <div key={group.version} className="relative">
            {/* Timeline connector */}
            {index < versionGroups.length - 1 && (
              <div className="absolute left-[19px] top-12 bottom-0 w-0.5 bg-border" />
            )}

            {/* Version header */}
            <button
              onClick={() => toggleVersion(group.version)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                'hover:bg-accent/50',
                hasIssues && 'bg-[hsl(var(--status-error)/0.05)]'
              )}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                  isLatest
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
                )}
              >
                <GitBranch className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold truncate">
                    {group.version}
                  </span>
                  {isLatest && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                      Latest
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(group.createdAt), 'MMM d, yyyy HH:mm')} •{' '}
                  {formatDistanceToNow(new Date(group.createdAt), { addSuffix: true })}
                </div>
              </div>

              {/* Health summary */}
              <div className="flex items-center gap-2">
                {group.healthSummary.healthy > 0 && (
                  <div className="flex items-center gap-1 text-[hsl(var(--status-ready))]">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">{group.healthSummary.healthy}</span>
                  </div>
                )}
                {group.healthSummary.warning > 0 && (
                  <div className="flex items-center gap-1 text-[hsl(var(--status-warning))]">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-medium">{group.healthSummary.warning}</span>
                  </div>
                )}
                {group.healthSummary.error > 0 && (
                  <div className="flex items-center gap-1 text-[hsl(var(--status-error))]">
                    <XCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">{group.healthSummary.error}</span>
                  </div>
                )}
              </div>

              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              )}
            </button>

            {/* Expanded pods */}
            {isExpanded && (
              <div className="ml-12 mt-1 space-y-1">
                {group.pods.map((pod) => (
                  <button
                    key={pod.id}
                    onClick={() => onSelectPod(pod)}
                    className={cn(
                      'w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm transition-colors',
                      'hover:bg-accent/50',
                      selectedPodId === pod.id && 'bg-accent border border-primary/30'
                    )}
                  >
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        pod.health === 'healthy' && 'bg-[hsl(var(--status-ready))]',
                        pod.health === 'warning' && 'bg-[hsl(var(--status-warning))]',
                        pod.health === 'error' && 'bg-[hsl(var(--status-error))]'
                      )}
                    />
                    <span className="truncate flex-1">{pod.name}</span>
                    <span className="text-xs text-muted-foreground">{pod.namespace}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
