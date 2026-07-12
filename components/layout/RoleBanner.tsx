'use client'

import { useCurrentRole, useCurrentUserName, ROLE_DESCRIPTIONS } from '@/lib/permissions'

export default function RoleBanner() {
  const role = useCurrentRole()
  const userName = useCurrentUserName()

  return (
    <div
      className="app-rolebanner"
      style={{
        padding: '5px 24px', background: '#eef1ff', borderBottom: '1px solid #dde1fb',
        fontSize: '0.68rem', color: '#4f46e5', display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      <i className="fa-solid fa-user-shield" style={{ fontSize: '.62rem' }} />
      <span style={{ fontWeight: 600 }}>{role}</span>
      <span>· {ROLE_DESCRIPTIONS[role]}</span>
      <span style={{ color: '#8b93c9' }}>({userName})</span>
    </div>
  )
}
