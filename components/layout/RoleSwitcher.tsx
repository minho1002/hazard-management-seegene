'use client'

import { CURRENT_ROLE, setCurrentRole, type Role } from '@/lib/permissions'

const ROLE_OPTIONS: Role[] = ['관리자', '운영관리자', '담당자', '일반등록자', '조회자']

export default function RoleSwitcher() {
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <label style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 4 }}>
        현재 역할 (로그인 없는 시뮬레이션)
      </label>
      <select
        value={CURRENT_ROLE}
        onChange={e => { setCurrentRole(e.target.value as Role); location.reload() }}
        style={{
          width: '100%', fontSize: '0.72rem', padding: '5px 8px', borderRadius: 6,
          background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
          outline: 'none', cursor: 'pointer',
        }}
      >
        {ROLE_OPTIONS.map(r => <option key={r} value={r} style={{ color: '#0a2540' }}>{r}</option>)}
      </select>
    </div>
  )
}
