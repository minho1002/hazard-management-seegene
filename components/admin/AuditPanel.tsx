'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { STATUS_META, type StatusKey } from '@/lib/designTokens'
import { canAccessAudit, useCurrentRole } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'
import AccessDenied from '@/components/ui/AccessDenied'

const dateInputStyle: React.CSSProperties = {
  border: '1px solid #e3e8ef', borderRadius: 6, padding: '5px 7px',
  fontSize: '0.74rem', fontFamily: 'inherit', color: '#0a2540', background: '#f5f7fa', outline: 'none', width: 122,
}

interface AuditEntry {
  key: string
  type: string
  typeColor: string
  defectId: number
  changedBy: string | null
  changedAt: string
  summary: string
  reason: string | null
}

function statusLabel(s: string): string {
  return STATUS_META[s as StatusKey]?.label ?? s
}

function fmtDT(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// /audit(구 독립 페이지)에서 이동한 컴포넌트 — 로직은 그대로, /admin/system-history의
// "감사이력" 탭에서 렌더링된다. canAccessAudit는 canAccessAdminSettings와 별개의 독립 권한이므로
// 그대로 유지한다.
export default function AuditPanel() {
  const { state, deleteAuditEntries } = useStore()
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독

  const [draftDateFrom, setDraftDateFrom] = useState('')
  const [draftDateTo, setDraftDateTo] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (!canAccessAudit(role)) {
    return <AccessDenied message="감사이력은 관리자만 접근할 수 있습니다." />
  }

  function applyDateFilter() { setDateFrom(draftDateFrom); setDateTo(draftDateTo) }
  function resetDateFilter() { setDraftDateFrom(''); setDraftDateTo(''); setDateFrom(''); setDateTo('') }

  function toggleSelect(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function deleteEntries(keys: string[]) {
    if (keys.length === 0) return
    if (!confirm(`선택한 ${keys.length}건의 이력을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`)) return
    const result = deleteAuditEntries(keys)
    if (!result.ok) { alert(result.error ?? '삭제에 실패했습니다.'); return }
    setSelected(prev => {
      const next = new Set(prev)
      keys.forEach(k => next.delete(k))
      return next
    })
  }

  const allEntries: AuditEntry[] = [
    ...state.statusHistory.map(h => ({
      key: `status-${h.id}`, type: '상태변경', typeColor: '#2563EB',
      defectId: h.defectId, changedBy: h.changedBy, changedAt: h.changedAt,
      summary: `${statusLabel(h.fromStatus)} → ${statusLabel(h.toStatus)}`, reason: h.reason,
    })),
    ...state.deleteLogs.map(h => ({
      key: `delete-${h.id}`, type: '삭제', typeColor: '#DC2626',
      defectId: h.defectId, changedBy: h.deletedBy, changedAt: h.deletedAt,
      summary: '하자 삭제(Soft Delete)', reason: h.reason,
    })),
    ...state.classificationHistory.map(h => ({
      key: `class-${h.id}`, type: '하자구분/귀책', typeColor: '#7C3AED',
      defectId: h.defectId, changedBy: h.changedBy, changedAt: h.changedAt,
      summary: `${h.defectType} · ${h.responsibilityType ?? '미정'} · ${h.costBearer ?? '미정'} (검토:${h.reviewStatus ?? '-'} / 승인:${h.costApprovalStatus ?? '-'})`,
      reason: h.reason,
    })),
    ...state.fileDeleteLogs.map(h => ({
      key: `file-${h.id}`, type: '첨부파일 삭제', typeColor: '#697386',
      defectId: h.defectId, changedBy: h.deletedBy, changedAt: h.deletedAt,
      summary: `파일 삭제: ${h.fileName}`, reason: h.reason,
    })),
    ...state.recurringHistory.map(h => ({
      key: `recur-${h.id}`, type: '반복 확정/해제', typeColor: '#B91C1C',
      defectId: h.defectId, changedBy: h.changedBy, changedAt: h.changedAt,
      summary: `반복 상태: ${h.level}`, reason: h.reason,
    })),
  ].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())

  const entries = allEntries.filter(e => {
    if (dateFrom && e.changedAt.slice(0, 10) < dateFrom) return false
    if (dateTo && e.changedAt.slice(0, 10) > dateTo) return false
    return true
  })

  const card = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden' as const }
  const allSelected = entries.length > 0 && entries.every(e => selected.has(e.key))

  return (
    <div>
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff' }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>감사이력</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>상태변경·삭제·하자구분/귀책·첨부파일삭제·반복확정 이력 통합 조회 (관리자 전용) · 표시 {entries.length}건 / 전체 {allEntries.length}건</div>
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
              <button onClick={() => deleteEntries(Array.from(selected))} style={{ padding: '5px 12px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', border: '1px solid #DC2626', background: '#DC2626', color: '#fff', fontFamily: 'inherit' }}>선택 삭제</button>
            </span>
          )}
        </div>

        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                <th style={{ padding: '9px 12px', width: 32 }}>
                  <input type="checkbox" checked={allSelected} onChange={() => {
                    setSelected(prev => {
                      if (allSelected) return new Set(Array.from(prev).filter(k => !entries.some(e => e.key === k)))
                      const next = new Set(prev)
                      entries.forEach(e => next.add(e.key))
                      return next
                    })
                  }} />
                </th>
                {['변경일시', '유형', '하자', '변경자', '내용', '사유'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386' }}>{h}</th>
                ))}
                <th style={{ padding: '9px 16px', width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#aab', fontSize: '0.8rem' }}>기록된 이력이 없습니다.</td></tr>
              ) : entries.map(e => {
                const defect = state.defects.find(d => d.id === e.defectId)
                return (
                  <tr key={e.key} style={{ borderBottom: '1px solid #f0f4f8' }}>
                    <td style={{ padding: '9px 12px' }}>
                      <input type="checkbox" checked={selected.has(e.key)} onChange={() => toggleSelect(e.key)} />
                    </td>
                    <td style={{ padding: '9px 16px', fontSize: '0.72rem', color: '#697386', whiteSpace: 'nowrap' }}>{fmtDT(e.changedAt)}</td>
                    <td style={{ padding: '9px 16px' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: e.typeColor + '18', color: e.typeColor }}>{e.type}</span>
                    </td>
                    <td style={{ padding: '9px 16px', fontSize: '0.75rem' }}>
                      {defect ? (
                        <Link href={`/defects/${defect.id}`} style={{ color: '#635bff', textDecoration: 'none' }}>{defect.caseNumber}</Link>
                      ) : `#${e.defectId}`}
                    </td>
                    <td style={{ padding: '9px 16px', fontSize: '0.75rem', color: '#0a2540' }}>{e.changedBy ?? '-'}</td>
                    <td style={{ padding: '9px 16px', fontSize: '0.75rem', color: '#425466' }}>{e.summary}</td>
                    <td style={{ padding: '9px 16px', fontSize: '0.75rem', color: '#697386' }}>{e.reason ?? '-'}</td>
                    <td style={{ padding: '9px 16px' }}>
                      <button onClick={() => deleteEntries([e.key])} style={{ padding: '3px 9px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', border: '1px solid #f0d0d0', background: '#fef0f4', color: '#be1044', fontFamily: 'inherit' }}>삭제</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
