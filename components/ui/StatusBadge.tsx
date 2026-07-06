import { STATUS_META, type StatusKey } from '@/lib/designTokens'

export default function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as StatusKey] ?? { label: status, color: '#6B7280', bg: '#F9FAFB' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 5,
      fontSize: '0.68rem', fontWeight: 600, color: meta.color, background: meta.bg,
    }}>
      {meta.label}
    </span>
  )
}
