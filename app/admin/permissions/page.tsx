'use client'

import { useEffect, useState } from 'react'
import { canAccessAdminSettings, useCurrentRole, type Role } from '@/lib/permissions'
import {
  usePermissionMatrix, savePermissionMatrix, resetPermissionMatrix, getPermissionMatrix,
  DEFAULT_MATRIX, CAPABILITY_LABELS, CAPABILITY_NOTES, LOCKED_FOR_ADMIN,
  type PermissionMatrix, type Capability,
} from '@/lib/auth/permissionMatrix'
import { appendUserAuditLog } from '@/lib/auth/userStorage'
import { useSession } from '@/lib/auth/session'
import AccessDenied from '@/components/ui/AccessDenied'

const ROLES: Role[] = ['조회자', '실무자', '관리자']
const CAPABILITIES = Object.keys(CAPABILITY_LABELS) as Capability[]

function cloneMatrix(m: PermissionMatrix): PermissionMatrix {
  const next = {} as PermissionMatrix
  for (const role of ROLES) next[role] = { ...m[role] }
  return next
}

function diffMatrices(before: PermissionMatrix, after: PermissionMatrix) {
  const beforeValue: Record<string, unknown> = {}
  const afterValue: Record<string, unknown> = {}
  for (const role of ROLES) {
    for (const cap of CAPABILITIES) {
      if (before[role][cap] !== after[role][cap]) {
        const key = `${role}.${CAPABILITY_LABELS[cap]}`
        beforeValue[key] = before[role][cap] ? '허용' : '차단'
        afterValue[key] = after[role][cap] ? '허용' : '차단'
      }
    }
  }
  return { beforeValue, afterValue, changed: Object.keys(afterValue).length > 0 }
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden' }

export default function PermissionsPage() {
  const role = useCurrentRole()
  const matrix = usePermissionMatrix()
  const session = useSession()
  const [draft, setDraft] = useState<PermissionMatrix>(matrix)
  const [dirty, setDirty] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!dirty) setDraft(matrix)
  }, [matrix, dirty])

  if (!canAccessAdminSettings(role)) {
    return <AccessDenied message="권한 관리는 관리자만 접근할 수 있습니다." />
  }

  function toggle(targetRole: Role, cap: Capability) {
    if (targetRole === '관리자' && LOCKED_FOR_ADMIN.includes(cap)) return
    setDraft(prev => ({ ...prev, [targetRole]: { ...prev[targetRole], [cap]: !prev[targetRole][cap] } }))
    setDirty(true)
    setSavedMsg(null)
  }

  function handleSave() {
    const before = getPermissionMatrix()
    const { beforeValue, afterValue, changed } = diffMatrices(before, draft)
    savePermissionMatrix(draft)
    if (changed) {
      appendUserAuditLog({
        targetUserId: 'system', targetUsername: '권한 매트릭스',
        action: 'PERMISSION_CHANGE', changedBy: session?.username ?? 'system',
        beforeValue, afterValue, reason: null,
      })
    }
    setDirty(false)
    setSavedMsg('저장되었습니다.')
  }

  function handleReset() {
    if (!confirm('권한 매트릭스를 기본값으로 초기화하시겠습니까?')) return
    const before = getPermissionMatrix()
    const { beforeValue, afterValue, changed } = diffMatrices(before, DEFAULT_MATRIX)
    resetPermissionMatrix()
    if (changed) {
      appendUserAuditLog({
        targetUserId: 'system', targetUsername: '권한 매트릭스',
        action: 'PERMISSION_CHANGE', changedBy: session?.username ?? 'system',
        beforeValue, afterValue, reason: '기본값으로 초기화',
      })
    }
    setDraft(cloneMatrix(DEFAULT_MATRIX))
    setDirty(false)
    setSavedMsg('기본값으로 초기화되었습니다.')
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>권한 관리</h1>
          <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>역할별 기능 접근 권한을 직접 편집할 수 있습니다. 변경 사항은 계정 변경 이력에 기록됩니다.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {savedMsg && <span style={{ fontSize: '0.75rem', color: '#0f7850' }}>{savedMsg}</span>}
          <button
            onClick={handleReset}
            style={{ padding: '7px 14px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}
          >
            기본값으로 초기화
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty}
            style={{ padding: '7px 14px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: dirty ? 'pointer' : 'not-allowed', border: 'none', background: dirty ? '#635bff' : '#c7c9f5', color: '#fff', fontFamily: 'inherit' }}
          >
            저장
          </button>
        </div>
      </div>
      <div style={{ padding: '24px 32px' }}>
        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                <th style={{ textAlign: 'left', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386' }}>기능</th>
                {ROLES.map(r => (
                  <th key={r} style={{ textAlign: 'center', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386', width: 100 }}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map(cap => (
                <tr key={cap} style={{ borderBottom: '1px solid #f0f4f8' }}>
                  <td style={{ padding: '11px 16px', fontSize: '0.8rem', color: '#0a2540', maxWidth: 420 }}>
                    {CAPABILITY_LABELS[cap]}
                    {CAPABILITY_NOTES[cap] && (
                      <div style={{ fontSize: '0.68rem', color: '#b0bac6', marginTop: 3 }}>{CAPABILITY_NOTES[cap]}</div>
                    )}
                  </td>
                  {ROLES.map(r => {
                    const locked = r === '관리자' && LOCKED_FOR_ADMIN.includes(cap)
                    return (
                      <td key={r} style={{ padding: '11px 16px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={draft[r][cap]}
                          disabled={locked}
                          onChange={() => toggle(r, cap)}
                          title={locked ? '관리자가 스스로 관리 화면에서 잠기는 것을 막기 위해 항상 허용으로 고정됩니다.' : undefined}
                          style={{ width: 16, height: 16, cursor: locked ? 'not-allowed' : 'pointer', accentColor: '#635bff', opacity: locked ? 0.6 : 1 }}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
