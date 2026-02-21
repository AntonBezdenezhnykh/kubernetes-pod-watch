import { useEffect, useRef, useState } from 'react';
import { Container, LogEntry } from '@/types/kubernetes';
import { useContainerLogs, useContainerResourceSamples } from '@/hooks/useKubernetesData';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Terminal, Download, Search, ArrowDown, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface LogViewerProps {
  container: Container;
}

export const LogViewer = ({ container }: LogViewerProps) => {
  const { data: logs = [], isLoading, error } = useContainerLogs(container.id);
  const { data: resourceSamples = [] } = useContainerResourceSamples(container.id);
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'error' | 'warning' | 'exception'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const hasStackTracePattern = (message: string): boolean => {
    const lower = message.toLowerCase();
    return (
      lower.includes('exception') ||
      lower.includes('stacktrace') ||
      lower.includes('traceback') ||
      /\bat\s+\S+\s+\(.+\)/.test(message) ||
      /\bat\s+\S+\.\S+/.test(message)
    );
  };

  const exceptionCount = logs.filter((log) => hasStackTracePattern(log.message)).length;
  const errorCount = logs.filter((log) => log.level === 'error').length;
  const warningCount = logs.filter((log) => log.level === 'warn').length;

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesQuickFilter =
      quickFilter === 'all' ||
      (quickFilter === 'error' && log.level === 'error') ||
      (quickFilter === 'warning' && log.level === 'warn') ||
      (quickFilter === 'exception' && hasStackTracePattern(log.message));

    return matchesSearch && matchesQuickFilter;
  });

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setAutoScroll(true);
  };

  const downloadLogs = () => {
    const content = logs
      .map((log) => `${format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')} [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${container.name}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const findNearestResourceSample = (logTs: string) => {
    if (resourceSamples.length === 0) return null;
    const targetMs = new Date(logTs).getTime();
    if (!Number.isFinite(targetMs)) return null;

    let best = resourceSamples[0];
    let bestDelta = Math.abs(new Date(best.sampledAt).getTime() - targetMs);
    for (let i = 1; i < resourceSamples.length; i += 1) {
      const candidate = resourceSamples[i];
      const delta = Math.abs(new Date(candidate.sampledAt).getTime() - targetMs);
      if (delta < bestDelta) {
        best = candidate;
        bestDelta = delta;
      }
    }
    return best;
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;
  const hasResourceLimits =
    (container.cpuLimitMillicores ?? 0) > 0 || (container.memoryLimitBytes ?? 0) > 0;

  const renderLogLine = (log: LogEntry) => {
    const nearestSample = findNearestResourceSample(log.timestamp);
    const cpuLimit = container.cpuLimitMillicores ?? 0;
    const memoryLimit = container.memoryLimitBytes ?? 0;

    const cpuPercent = nearestSample && cpuLimit > 0
      ? (nearestSample.cpuMillicores / cpuLimit) * 100
      : null;
    const memoryPercent = nearestSample && memoryLimit > 0
      ? (nearestSample.memoryBytes / memoryLimit) * 100
      : null;

    return (
      <div key={log.id} className="log-line">
        <span className="log-timestamp">
          {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
        </span>
        <span
          className={cn(
            log.level === 'info' && 'log-info',
            log.level === 'warn' && 'log-warn',
            log.level === 'error' && 'log-error'
          )}
        >
          [{log.level.toUpperCase().padEnd(5)}]
        </span>
        {hasResourceLimits && (cpuPercent !== null || memoryPercent !== null) && (
          <span className="ml-2 text-[11px] text-muted-foreground">
            {cpuPercent !== null && (
              <span className="mr-2">
                CPU {formatPercent(cpuPercent)}
              </span>
            )}
            {memoryPercent !== null && (
              <span>
                RAM {formatPercent(memoryPercent)}
              </span>
            )}
          </span>
        )}
        <span className="ml-2">{log.message}</span>
      </div>
    );
  };

  const viewerBody = (
    <div className={cn('h-full flex flex-col terminal-window relative', isFullscreen && 'h-[calc(100vh-1.5rem)]')}>
      {/* Terminal Header */}
      <div className="terminal-header">
        <div className="flex items-center gap-2 flex-1">
          <div className="terminal-dot bg-[hsl(var(--status-error))]" />
          <div className="terminal-dot bg-[hsl(var(--status-warning))]" />
          <div className="terminal-dot bg-[hsl(var(--status-ready))]" />
          <div className="ml-3 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono text-sm">{container.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setQuickFilter('all')}
              className={cn(
                'px-2 py-1 rounded text-xs border transition-colors',
                quickFilter === 'all'
                  ? 'border-primary bg-primary/20 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              All ({logs.length})
            </button>
            <button
              onClick={() => setQuickFilter('error')}
              className={cn(
                'px-2 py-1 rounded text-xs border transition-colors',
                quickFilter === 'error'
                  ? 'border-[hsl(var(--status-error)/0.6)] bg-[hsl(var(--status-error)/0.15)] text-[hsl(var(--status-error))]'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              Errors ({errorCount})
            </button>
            <button
              onClick={() => setQuickFilter('exception')}
              className={cn(
                'px-2 py-1 rounded text-xs border transition-colors',
                quickFilter === 'exception'
                  ? 'border-[hsl(var(--status-error)/0.6)] bg-[hsl(var(--status-error)/0.15)] text-[hsl(var(--status-error))]'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              Exceptions ({exceptionCount})
            </button>
            <button
              onClick={() => setQuickFilter('warning')}
              className={cn(
                'px-2 py-1 rounded text-xs border transition-colors',
                quickFilter === 'warning'
                  ? 'border-[hsl(var(--status-warning)/0.6)] bg-[hsl(var(--status-warning)/0.15)] text-[hsl(var(--status-warning))]'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              Warnings ({warningCount})
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 w-48 pl-8 text-xs bg-background/50 border-border"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsFullscreen((prev) => !prev)}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={downloadLogs}
            title="Download logs"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {!hasResourceLimits && (
        <div className="px-4 py-1 text-[11px] text-muted-foreground border-b border-[hsl(var(--terminal-border))]">
          CPU/RAM percent near logs is hidden because this container has no resource limits set.
        </div>
      )}

      {/* Log Content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin bg-[hsl(var(--terminal-bg))]"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-destructive">
            <div className="text-center">
              <p>Error loading logs</p>
              <p className="text-sm">{error.message}</p>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Terminal className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{searchTerm ? 'No matching logs found' : 'No logs available'}</p>
            </div>
          </div>
        ) : (
          <div className="py-2">
            {filteredLogs.map(renderLogLine)}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {!autoScroll && (
        <Button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 h-8 px-3 bg-primary/90 hover:bg-primary shadow-lg"
        >
          <ArrowDown className="w-3.5 h-3.5 mr-1" />
          Follow
        </Button>
      )}
    </div>
  );

  return isFullscreen ? (
    <>
      <div className="fixed inset-0 z-40 bg-black/70" onClick={() => setIsFullscreen(false)} />
      <div className="fixed inset-3 z-50">{viewerBody}</div>
    </>
  ) : viewerBody;
};
