import Link from 'next/link'

interface Props {
  icon: string
  message: string
  actionLabel?: string
  actionHref?: string
}

export default function EmptyState({ icon, message, actionLabel, actionHref }: Props) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6B7280' }}>
      <i className={icon} style={{ fontSize: '1.8rem', display: 'block', marginBottom: 10, opacity: 0.35 }} />
      <p style={{ fontSize: '0.82rem', marginBottom: actionLabel ? 14 : 0 }}>{message}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, background: '#2563EB', color: '#fff', textDecoration: 'none' }}
        >
          <i className="fa-solid fa-plus" /> {actionLabel}
        </Link>
      )}
    </div>
  )
}
