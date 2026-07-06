import { SEVERITY_META, type SeverityKey } from '@/lib/designTokens'

export default function SeverityBadge({ severity }: { severity: string }) {
  const meta = SEVERITY_META[severity as SeverityKey] ?? { label: severity, color: '#6B7280', bg: '#F9FAFB' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 5,
      fontSize: '0.68rem', fontWeight: 600, color: meta.color, background: meta.bg,
    }}>
      {meta.label}
    </span>
  )
}
