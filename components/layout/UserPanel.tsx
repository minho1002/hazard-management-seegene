'use client'

import { useRouter } from 'next/navigation'
import { useSession, logout } from '@/lib/auth/session'

export default function UserPanel() {
  const session = useSession()
  const router = useRouter()

  if (!session) return null

  function handleLogout() {
    logout()
    router.push('/login')
  }

  return (
    <div style={{ padding: '10px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="fa-solid fa-user" style={{ color: '#fff', fontSize: 11 }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.department} · {session.role}</div>
        </div>
        <button
          onClick={handleLogout}
          title="로그아웃"
          style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <i className="fa-solid fa-arrow-right-from-bracket" style={{ fontSize: 11 }} />
        </button>
      </div>
    </div>
  )
}
