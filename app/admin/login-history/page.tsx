'use client'

import { useState } from 'react'
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
const dateInputStyle: React.CSSProperties = {
  border: '1px solid #e3e8ef', borderRadius: 6, padding: '5px 7px',
  fontSize: '0.74rem', fontFamily: 'inherit', color: '#0a2540', background: '#f5f7fa', outline: 'none', width: 122,
}

export default function LoginHistoryPage() {
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독
  const { loginHistory, ready, deleteLoginHistory } = useUserStore()

  const [draftDateFrom, setDraftDateFrom] = useState('')
  const [draftDateTo, setDraftDateTo] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (!canAccessAdminSettings(role)) {
    return <AccessDenied message="로그인 이력은 관리자만 접근할 수 있습니다." />
  }

  const all = [...loginHistory].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const sorted = all.filter(h => {
    if (dateFrom && h.createdAt.slice(0, 10) < dateFrom) return false
    if (dateTo && h.createdAt.slice(0, 10) > dateTo) return false
    return true
  })
  const allSelected = sorted.length > 0 && sorted.every(h => selected.has(h.id))

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
    if (!confirm(`선택한 ${ids.length}건의 로그인 이력을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`)) return
    const result = deleteLoginHistory(ids)
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
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>로그인 이력</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>표시 {sorted.length}건 / 전체 {all.length}건</div>
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
                      if (allSelected) return new Set(Array.from(prev).filter(id => !sorted.some(h => h.id === id)))
                      const next = new Set(prev)
                      sorted.forEach(h => next.add(h.id))
                      return next
                    })
                  }} />
                </th>
                {['일시', '아이디', '결과', '사유'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386' }}>{h}</th>
                ))}
                <th style={{ padding: '9px 16px', width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {!ready ? (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#b0bac6', fontSize: '0.8rem' }}>불러오는 중...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon="fa-solid fa-right-to-bracket" message="로그인 이력이 없습니다." /></td></tr>
              ) : sorted.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid #f0f4f8' }}>
                  <td style={{ padding: '9px 12px' }}>
                    <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleSelect(h.id)} />
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '0.78rem', color: '#697386' }}>{fmtDT(h.createdAt)}</td>
                  <td style={{ padding: '11px 16px', fontSize: '0.8rem', fontWeight: 600, color: '#0a2540' }}>{h.username}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: h.success ? '#e6f6f0' : '#fef0f4', color: h.success ? '#0f7850' : '#be1044' }}>
                      {h.success ? '성공' : '실패'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: '0.78rem', color: '#697386' }}>{h.reason ?? '-'}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <button onClick={() => handleDelete([h.id])} style={{ padding: '3px 9px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', border: '1px solid #f0d0d0', background: '#fef0f4', color: '#be1044', fontFamily: 'inherit' }}>삭제</button>
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
