import { useState } from 'react';
import { Pod } from '@/types/kubernetes';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Search, Box, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PodListProps {
  pods: Pod[];
  selectedPodId: string | null;
  onSelectPod: (pod: Pod) => void;
}

export const PodList = ({ pods, selectedPodId, onSelectPod }: PodListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [namespaceFilter, setNamespaceFilter] = useState<string>('all');

  const namespaces = ['all', ...new Set(pods.map((p) => p.namespace))];

  const filteredPods = pods.filter((pod) => {
    const matchesSearch =
      pod.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pod.namespace.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesNamespace = namespaceFilter === 'all' || pod.namespace === namespaceFilter;
    return matchesSearch && matchesNamespace;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Box className="w-5 h-5 text-primary" />
          Pods
          <span className="text-sm font-normal text-muted-foreground">({filteredPods.length})</span>
        </h2>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search pods..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-secondary/50 border-border"
          />
        </div>

        {/* Namespace Filter */}
        <div className="flex gap-1.5 flex-wrap">
          {namespaces.map((ns) => (
            <button
              key={ns}
              onClick={() => setNamespaceFilter(ns)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md transition-colors',
                namespaceFilter === ns
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              )}
            >
              {ns === 'all' ? 'All' : ns}
            </button>
          ))}
        </div>
      </div>

      {/* Pod List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        <div className="space-y-1">
          {filteredPods.map((pod) => (
            <div
              key={pod.id}
              onClick={() => onSelectPod(pod)}
              className={cn('pod-item', selectedPodId === pod.id && 'pod-item-selected')}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm truncate">{pod.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="text-primary/70">{pod.namespace}</span>
                  <span>{pod.containers.length} container{pod.containers.length !== 1 ? 's' : ''}</span>
                  {pod.restarts > 0 && (
                    <span className="flex items-center gap-1 text-[hsl(var(--status-warning))]">
                      <RefreshCw className="w-3 h-3" />
                      {pod.restarts}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={pod.status} />
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(pod.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          ))}

          {filteredPods.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Box className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No pods found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
