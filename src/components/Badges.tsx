import type { ReportStatus } from '@/lib/types';

export function StatusBadge({ status }: { status: ReportStatus }) {
  const styles: Record<ReportStatus, string> = {
    open: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    matched: 'bg-violet-50 text-violet-700 ring-violet-600/20',
    verifying: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    closed: 'bg-gray-50 text-gray-600 ring-gray-500/20',
    flagged: 'bg-red-50 text-red-700 ring-red-600/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function TypeBadge({ type }: { type: 'lost' | 'found' }) {
  const isLost = type === 'lost';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
      isLost ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20' : 'bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-600/20'
    }`}>
      {type}
    </span>
  );
}
