import { PodStatus } from '@/types/kubernetes';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, AlertTriangle, Clock, HelpCircle, Skull, RefreshCw } from 'lucide-react';

interface StatusBadgeProps {
  status: PodStatus;
  className?: string;
}

const statusConfig: Record<PodStatus, { label: string; className: string; icon: React.ElementType }> = {
  Running: { label: 'Running', className: 'status-ready', icon: CheckCircle },
  Pending: { label: 'Pending', className: 'status-pending', icon: Clock },
  Error: { label: 'Error', className: 'status-error', icon: XCircle },
  OOMKilled: { label: 'OOM Killed', className: 'status-oom', icon: Skull },
  CrashLoopBackOff: { label: 'CrashLoop', className: 'status-warning', icon: RefreshCw },
  Terminated: { label: 'Terminated', className: 'status-terminated', icon: AlertTriangle },
  Unknown: { label: 'Unknown', className: 'status-unknown', icon: HelpCircle },
};

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={cn('status-badge', config.className, className)}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
};
