'use client'

import { useState } from 'react'
import { canAccessAdminSettings, useCurrentRole } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'
import { useUserStore } from '@/lib/auth/userStore'
import type { UserAuditAction } from '@/lib/auth/types'
import AccessDenied from '@/components/ui/AccessDenied'
import EmptyState from '@/components/ui/EmptyState'

function fmtDT(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

const ACTION_LABELS: Record<UserAuditAction, string> = {
  CREATE: '계정 생성', UPDATE: '정보 수정', ROLE_CHANGE: '역할 변경', PASSWORD_RESET: '비밀번호 초기화',
  DISABLE: '비활성화', ENABLE: '활성화', DELETE: '삭제', LOGIN_SUCCESS: '로그인 성공', LOGIN_FAIL: '로그인 실패',
  PERMISSION_CHANGE: '권한 변경',
}
const ACTION_COLORS: Record<UserAuditAction, string> = {
  CREATE: '#2563EB', UPDATE: '#425466', ROLE_CHANGE: '#7C3AED', PASSWORD_RESET: '#B06B1A',
  DISABLE: '#B45309', ENABLE: '#0F7850', DELETE: '#DC2626', LOGIN_SUCCESS: '#0F7850', LOGIN_FAIL: '#DC2626',
  PERMISSION_CHANGE: '#7C3AED',
}

function fmtValue(v: Record<string, unknown> | null): string {
  if (!v) return '-'
  return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(', ')
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden' }
const dateInputStyle: React.CSSProperties = {
  border: '1px solid #e3e8ef', borderRadius: 6, padding: '5px 7px',
  fontSize: '0.74rem', fontFamily: 'inherit', color: '#0a2540', background: '#f5f7fa', outline: 'none', width: 122,
}

export default function UserAuditPage() {
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독
  const { auditLogs, ready, deleteUserAuditLogs } = useUserStore()

  const [draftDateFrom, setDraftDateFrom] = useState('')
  const [draftDateTo, setDraftDateTo] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (!canAccessAdminSettings(role)) {
    return <AccessDenied message="계정 변경 이력은 관리자만 접근할 수 있습니다." />
  }

  // 로그인 성공/실패는 별도의 "로그인 이력" 화면에서 확인하므로 여기서는 계정 변경 이벤트만 표시한다.
  const all = [...auditLogs]
    .filter(l => l.action !== 'LOGIN_SUCCESS' && l.action !== 'LOGIN_FAIL')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const sorted = all.filter(l => {
    if (dateFrom && l.createdAt.slice(0, 10) < dateFrom) return false
    if (dateTo && l.createdAt.slice(0, 10) > dateTo) return false
    return true
  })
  const allSelected = sorted.length > 0 && sorted.every(l => selected.has(l.id))

  function applyDateFilter() { setDateFrom(draftDateFrom); setDateTo(draftDateTo) }
  function resetDateFilter() { setDraftDateFrom(''); setDraftDateTo(''); setDateFrom(''); setDateTo('') }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleDelete(ids: string[]) {
    if (ids.length === 0) return
    if (!confirm(`선택한 ${ids.length}건의 계정 변경 이력을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`)) return
    const result = deleteUserAuditLogs(ids)
    if (!result.ok) { alert(result.error ?? '삭제에 실패했습니다.'); return }
    setSelected(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.delete(id))
      return next
    })
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>계정 변경 이력</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>표시 {sorted.length}건 / 전체 {all.length}건 · 로그인 이력은 별도 메뉴에서 확인</div>
      </div>
      <div style={{ padding: '24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: '#697386', fontWeight: 600 }}>기간</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="date" style={dateInputStyle} value={draftDateFrom} onChange={e => setDraftDateFrom(e.target.value)} />
            <span style={{ color: '#b0bac6', fontSize: '0.72rem' }}>~</span>
            <input type="date" style={dateInputStyle} value={draftDateTo} onChange={e => setDraftDateTo(e.target.value)} />
          </span>
          <button onClick={applyDateFilter} style={{ padding: '5px 12px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', border: '1px solid #635bff', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}>검색</button>
          <button onClick={resetDateFilter} style={{ padding: '5px 12px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', border: '1px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}>초기화</button>

          {selected.size > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ fontSize: '0.72rem', color: '#697386' }}>{selected.size}건 선택됨</span>
              <button onClick={() => handleDelete(Array.from(selected))} style={{ padding: '5px 12px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', border: '1px solid #DC2626', background: '#DC2626', color: '#fff', fontFamily: 'inherit' }}>선택 삭제</button>
            </span>
          )}
        </div>

        <div style={{ ...card }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                <th style={{ padding: '9px 12px', width: 32 }}>
                  <input type="checkbox" checked={allSelected} onChange={() => {
                    setSelected(prev => {
                      if (allSelected) return new Set(Array.from(prev).filter(id => !sorted.some(l => l.id === id)))
                      const next = new Set(prev)
                      sorted.forEach(l => next.add(l.id))
                      return next
                    })
                  }} />
                </th>
                {['일시', '유형', '대상 사용자', '변경자', '변경 내용', '사유'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386' }}>{h}</th>
                ))}
                <th style={{ padding: '9px 16px', width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {!ready ? (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#b0bac6', fontSize: '0.8rem' }}>불러오는 중...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={8}><EmptyState icon="fa-solid fa-clock-rotate-left" message="계정 변경 이력이 없습니다." /></td></tr>
              ) : sorted.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f0f4f8' }}>
                  <td style={{ padding: '9px 12px' }}>
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSelect(l.id)} />
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '0.78rem', color: '#697386' }}>{fmtDT(l.createdAt)}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: ACTION_COLORS[l.action] }}>{ACTION_LABELS[l.action]}</span>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '0.8rem', fontWeight: 600, color: '#0a2540' }}>{l.targetUsername}</td>
                  <td style={{ padding: '11px 16px', fontSize: '0.78rem', color: '#697386' }}>{l.changedBy}</td>
                  <td style={{ padding: '11px 16px', fontSize: '0.75rem', color: '#697386' }}>
                    {l.beforeValue || l.afterValue ? `${fmtValue(l.beforeValue)} → ${fmtValue(l.afterValue)}` : '-'}
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '0.75rem', color: '#697386' }}>{l.reason ?? '-'}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <button onClick={() => handleDelete([l.id])} style={{ padding: '3px 9px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', border: '1px solid #f0d0d0', background: '#fef0f4', color: '#be1044', fontFamily: 'inherit' }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
