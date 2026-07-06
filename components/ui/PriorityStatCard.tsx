import Link from 'next/link'

interface Props {
  label: string
  icon: string
  count: number
  color: string
  bg: string
  href: string
  description?: string
}

export default function PriorityStatCard({ label, icon, count, color, bg, href, description }: Props) {
  return (
    <Link
      href={href}
      style={{
        display: 'block', textDecoration: 'none', background: '#FFFFFF',
        border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 18px',
        position: 'relative', overflow: 'hidden', transition: 'box-shadow .15s, transform .15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 14px rgba(17,24,39,.10)'; (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'none'; (e.currentTarget as HTMLAnchorElement).style.transform = 'none' }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={icon} style={{ fontSize: 12, color }} />
        </div>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#111827' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', lineHeight: 1 }}>{count}</div>
      {description && <div style={{ fontSize: '0.7rem', color: '#6B7280', marginTop: 6 }}>{description}</div>}
    </Link>
  )
}
