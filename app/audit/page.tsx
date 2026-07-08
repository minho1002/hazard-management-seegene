'use client'

import Link from 'next/link'
import { useStore } from '@/lib/store'
import { STATUS_META, type StatusKey } from '@/lib/designTokens'
import { canAccessAudit, useCurrentRole } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'
import AccessDenied from '@/components/ui/AccessDenied'

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

export default function AuditPage() {
  const { state } = useStore()
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독

  if (!canAccessAudit(role)) {
    return <AccessDenied message="감사이력은 관리자만 접근할 수 있습니다." />
  }

  const entries: AuditEntry[] = [
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

  const card = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden' as const }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>감사이력</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>상태변경·삭제·하자구분/귀책·첨부파일삭제·반복확정 이력 통합 조회 (관리자 전용)</div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                {['변경일시', '유형', '하자', '변경자', '내용', '사유'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#aab', fontSize: '0.8rem' }}>기록된 이력이 없습니다.</td></tr>
              ) : entries.map(e => {
                const defect = state.defects.find(d => d.id === e.defectId)
                return (
                  <tr key={e.key} style={{ borderBottom: '1px solid #f0f4f8' }}>
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
