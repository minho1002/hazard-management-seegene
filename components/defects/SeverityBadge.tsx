import { SEVERITY_COLORS, SEVERITY_LABELS } from '@/lib/format'
import type { Severity } from '@/lib/types'

export default function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[severity]}`}>
      {SEVERITY_LABELS[severity]}
    </span>
  )
}
