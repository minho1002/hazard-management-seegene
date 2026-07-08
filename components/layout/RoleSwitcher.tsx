'use client'

import { useEffect, useState } from 'react'
import { useCurrentRole, useCurrentUserName, setCurrentRole, setCurrentUserName, type Role } from '@/lib/permissions'

const ROLE_OPTIONS: Role[] = ['관리자', '실무자', '조회자']

export default function RoleSwitcher() {
  const role = useCurrentRole()
  const currentUserName = useCurrentUserName()
  const [userName, setUserName] = useState(currentUserName)

  useEffect(() => { setUserName(currentUserName) }, [currentUserName])

  function commitUserName() {
    if (userName.trim() && userName.trim() !== currentUserName) {
      setCurrentUserName(userName)
      location.reload()
    }
  }

  return (
    <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <label style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 4 }}>
          현재 역할 (로그인 없는 시뮬레이션)
        </label>
        <select
          value={role}
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
      <div>
        <label style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 4 }}>
          내 이름 (담당 하자 판별용)
        </label>
        <input
          value={userName}
          onChange={e => setUserName(e.target.value)}
          onBlur={commitUserName}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          style={{
            width: '100%', fontSize: '0.72rem', padding: '5px 8px', borderRadius: 6, boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
            outline: 'none',
          }}
        />
      </div>
    </div>
  )
}
