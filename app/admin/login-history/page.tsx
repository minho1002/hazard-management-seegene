'use client'

import { canAccessAdminSettings, useCurrentRole } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'
import { useUserStore } from '@/lib/auth/userStore'
import AccessDenied from '@/components/ui/AccessDenied'
import EmptyState from '@/components/ui/EmptyState'

function fmtDT(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden' }

export default function LoginHistoryPage() {
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독
  const { loginHistory, ready } = useUserStore()

  if (!canAccessAdminSettings(role)) {
    return <AccessDenied message="로그인 이력은 관리자만 접근할 수 있습니다." />
  }

  const sorted = [...loginHistory].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>로그인 이력</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>전체 {sorted.length}건</div>
      </div>
      <div style={{ padding: '24px 32px' }}>
        <div style={{ ...card }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                {['일시', '아이디', '결과', '사유'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!ready ? (
                <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#b0bac6', fontSize: '0.8rem' }}>불러오는 중...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={4}><EmptyState icon="fa-solid fa-right-to-bracket" message="로그인 이력이 없습니다." /></td></tr>
              ) : sorted.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid #f0f4f8' }}>
                  <td style={{ padding: '11px 16px', fontSize: '0.78rem', color: '#697386' }}>{fmtDT(h.createdAt)}</td>
                  <td style={{ padding: '11px 16px', fontSize: '0.8rem', fontWeight: 600, color: '#0a2540' }}>{h.username}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: h.success ? '#e6f6f0' : '#fef0f4', color: h.success ? '#0f7850' : '#be1044' }}>
                      {h.success ? '성공' : '실패'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '0.78rem', color: '#697386' }}>{h.reason ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
