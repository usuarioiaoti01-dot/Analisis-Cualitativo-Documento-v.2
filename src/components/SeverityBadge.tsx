import { SEVERITY_LABEL, type Severity } from '@/lib/types';

const TONE: Record<Severity, string> = {
  low: 'bg-sev-low-bg text-sev-low-ink',
  medium: 'bg-sev-medium-bg text-sev-medium-ink',
  high: 'bg-sev-high-bg text-sev-high-ink',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONE[severity]}`}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
