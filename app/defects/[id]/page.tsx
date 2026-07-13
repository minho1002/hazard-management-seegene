'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useStore, type Defect } from '@/lib/store'
import { FLOOR_SVGS } from '@/lib/floorSvgs'
import DefectPhotos from '@/components/defects/DefectPhotos'
import FloorLocationMarkers from '@/components/defects/FloorLocationMarkers'
import StatusBadge from '@/components/ui/StatusBadge'
import SeverityBadge from '@/components/ui/SeverityBadge'
import { isOverdue, isRecurring, COLORS, STATUS_FLOW, STATUS_META, type StatusKey } from '@/lib/designTokens'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { canFinalizeClassification as canFinalizeClassificationFn, canConfirmRecurring, canDelete, canEditDefect, useCurrentRole, useCurrentUserName } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'
import { analyzeRecurrence } from '@/lib/recurringAnalysisService'

const RECURRING_LEVEL_OPTIONS = ['반복 아님', '반복 의심', '반복 확정', '재점검 필요', '예방조치 진행중', '예방조치 완료'] as const

const DEFECT_TYPE_OPTIONS = ['하자사항', '일반사항', '확인 필요'] as const
const RESPONSIBILITY_OPTIONS = ['시공사 귀책', '재단/운영측 부담', '외주업체 부담', '사용자 과실', '소모품/노후', '원인 불명', '분쟁 가능']
const COST_BEARER_OPTIONS = ['시공사', '재단', '외주업체', '사용자', '보험/기타', '미정']
const PAYMENT_METHOD_OPTIONS = ['법인카드', '계좌이체', '세금계산서', '미정'] as const
const WARRANTY_OPTIONS = ['보증기간 내', '보증기간 외', '확인 필요'] as const
const REVIEW_STATUS_OPTIONS = ['미검토', '검토중', '확정', '이견있음', '분쟁가능', '재검토필요'] as const
const COST_APPROVAL_OPTIONS = ['미승인', '승인대기', '승인완료', '반려', '협의중'] as const

const AI_RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  낮음: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  중: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  높음: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  긴급: { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
}
const COST_LABELS: Record<string, string> = { gukbo: '국보', our: '자체', claim: '청구' }
const LOG_LABELS: Record<string, string> = { occurrence: '발생', inspection: '점검', action: '조치', recurrence: '재발' }
const LOG_COLORS: Record<string, string> = { occurrence: '#be1044', inspection: '#1d6dc2', action: '#0f7850', recurrence: '#b06b1a' }

function fmtDate(s: string | null) {
  if (!s) return '-'
  return new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
function fmtDT(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}
function fmtKRW(n: number | null | undefined) {
  if (!n) return '0원'
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}

export default function DefectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { state, updateDefect, updateDefectStatus, updateClassification, softDeleteDefect, addLog, saveFloorImage, addDefectLocation, updateDefectLocation, updateDefectLocationPosition, removeDefectLocation, clearDefectLocations, updateRecurringStatus } = useStore()
  const isTablet = useMediaQuery('(max-width: 1024px)')
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독
  const userName = useCurrentUserName()

  const [showLogModal, setShowLogModal] = useState(false)
  const [logForm, setLogForm] = useState({
    logType: 'action',
    occurredAt: new Date().toISOString().slice(0, 16),
    title: '',
    content: '',
    costAmount: '',
  })
  const [showActionDoneModal, setShowActionDoneModal] = useState(false)
  const [actionDoneForm, setActionDoneForm] = useState({ actionContent: '', actualCost: '' })

  const defectRaw = state.defects.find(d => d.id === parseInt(id))

  const [classifyForm, setClassifyForm] = useState({
    defectType: '확인 필요',
    responsibilityType: '원인 불명',
    costBearer: '미정',
    reviewStatus: '미검토',
    costApprovalStatus: '미승인',
    warrantyStatus: '확인 필요',
    isWarrantyClaimTarget: false,
    relatedContract: '',
    classificationReason: '',
  })

  useEffect(() => {
    if (!defectRaw) return
    setClassifyForm({
      defectType: defectRaw.defectType ?? '확인 필요',
      responsibilityType: defectRaw.responsibilityType ?? '원인 불명',
      costBearer: defectRaw.costBearer ?? '미정',
      reviewStatus: defectRaw.reviewStatus ?? '미검토',
      costApprovalStatus: defectRaw.costApprovalStatus ?? '미승인',
      warrantyStatus: defectRaw.warrantyStatus ?? '확인 필요',
      isWarrantyClaimTarget: defectRaw.isWarrantyClaimTarget ?? false,
      relatedContract: defectRaw.relatedContract ?? '',
      classificationReason: '',
    })
  }, [defectRaw?.id, defectRaw?.defectType, defectRaw?.responsibilityType, defectRaw?.costBearer, defectRaw?.reviewStatus, defectRaw?.costApprovalStatus, defectRaw?.warrantyStatus, defectRaw?.isWarrantyClaimTarget, defectRaw?.relatedContract])

  const [recurringForm, setRecurringForm] = useState({ level: '반복 아님' as string, reason: '' })

  useEffect(() => {
    if (!defectRaw) return
    setRecurringForm({ level: defectRaw.recurringLevel ?? '반복 아님', reason: '' })
  }, [defectRaw?.id, defectRaw?.recurringLevel])

  if (!defectRaw) {
    return (
      <div style={{ padding: 52, textAlign: 'center', color: '#697386' }}>
        <i className="fa-solid fa-inbox" style={{ fontSize: '1.8rem', display: 'block', marginBottom: 10 }} />
        <p>하자를 찾을 수 없습니다.</p>
        <button onClick={() => router.push('/defects')} style={{ marginTop: 16, padding: '8px 16px', background: '#635bff', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.8rem' }}>목록으로</button>
      </div>
    )
  }
  const defect = defectRaw

  const cat = state.categories.find(c => c.id === defect.categoryId)
  const vendor = state.vendors.find(v => v.id === defect.assignedVendorId)
  const floor = state.floorPlans.find(f => f.id === defect.floorPlanId)
  const building = state.buildings.find(b => b.id === defect.buildingId)
  const logs = state.logs.filter(l => l.defectId === defect.id).sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
  const statusHistory = state.statusHistory
    .filter(h => h.defectId === defect.id)
    .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
  const classificationHistory = state.classificationHistory
    .filter(h => h.defectId === defect.id)
    .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
  const recurringAnalysis = analyzeRecurrence(defect, state.defects)
  const displayedRecurringLevel = defect.recurringLevel ?? recurringAnalysis.level
  const similarDefects = recurringAnalysis.matchedDefectIds
    .map(mid => state.defects.find(d => d.id === mid))
    .filter((d): d is Defect => !!d)
  const locations = state.defectLocations.filter(l => l.defectId === defect.id).sort((a, b) => a.id - b.id)

  const floorSvg = state.floorPlanImages[defect.floorPlanId ?? 0]
    ? `<img src="${state.floorPlanImages[defect.floorPlanId ?? 0]}" style="width:100%;height:auto;display:block">`
    : (FLOOR_SVGS[defect.floorPlanId ?? 1] || FLOOR_SVGS[1])

  function handleDeleteDefect() {
    const reason = prompt('삭제 사유를 입력하세요.')
    if (reason == null) return
    if (!reason.trim()) { alert('삭제 사유를 입력해야 합니다.'); return }
    const result = softDeleteDefect(defect.id, reason.trim(), defect.managerName ?? null)
    if (!result.ok) { alert(result.error); return }
    router.push('/defects')
  }

  function applyStatusChange(target: StatusKey, opts?: { actionContent?: string; actualCost?: string; reason?: string | null }): boolean {
    const result = updateDefectStatus(defect.id, target, {
      changedBy: defect.managerName ?? null,
      reason: opts?.reason ?? null,
      actionContent: opts?.actionContent || null,
      actualCost: opts?.actualCost ? Number(opts.actualCost) : null,
    })
    if (!result.ok) { alert(result.error); return false }
    return true
  }

  function handleStatusSelect(target: string) {
    if (target === 'action_done') {
      setActionDoneForm({ actionContent: defect.lastActionContent ?? '', actualCost: '' })
      setShowActionDoneModal(true)
      return
    }
    if (target === 'hold') {
      const reason = prompt('보류 사유를 입력하세요.')
      if (reason == null) return
      if (!reason.trim()) { alert('보류 사유를 입력해야 합니다.'); return }
      applyStatusChange('hold', { reason: reason.trim() })
      return
    }
    applyStatusChange(target as StatusKey)
  }

  function submitActionDone() {
    if (applyStatusChange('action_done', actionDoneForm)) setShowActionDoneModal(false)
  }

  function setClassifyField(k: string, v: string | boolean) {
    setClassifyForm(f => ({ ...f, [k]: v }))
  }

  function submitClassification() {
    const result = updateClassification(defect.id, {
      defectType: classifyForm.defectType as Defect['defectType'],
      responsibilityType: classifyForm.responsibilityType,
      costBearer: classifyForm.costBearer,
      reviewStatus: classifyForm.reviewStatus as Defect['reviewStatus'],
      costApprovalStatus: classifyForm.costApprovalStatus as Defect['costApprovalStatus'],
      warrantyStatus: classifyForm.warrantyStatus as Defect['warrantyStatus'],
      isWarrantyClaimTarget: classifyForm.isWarrantyClaimTarget,
      relatedContract: classifyForm.relatedContract || null,
      classificationReason: classifyForm.classificationReason || null,
    }, {
      changedBy: defect.managerName ?? null,
      reason: classifyForm.classificationReason || null,
    })
    if (!result.ok) alert(result.error)
  }

  function onMapClick(e: React.MouseEvent<HTMLDivElement>) {
    const cont = mapContainerRef.current
    if (!cont) return
    const r = cont.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10
    const newId = addDefectLocation(defect.id, defect.floorPlanId ?? 1, x, y, { createdBy: defect.managerName ?? null })
    setSelectedLocationId(newId)
  }

  function removeLocation(locId: number) {
    if (!confirm('이 위치를 삭제하시겠습니까?')) return
    removeDefectLocation(locId)
    if (selectedLocationId === locId) setSelectedLocationId(null)
  }

  function clearAllLocations() {
    if (!confirm('등록된 모든 위치를 초기화하시겠습니까?')) return
    clearDefectLocations(defect.id)
    setSelectedLocationId(null)
  }

  function submitRecurring() {
    const result = updateRecurringStatus(defect.id, recurringForm.level as Defect['recurringLevel'], {
      changedBy: defect.managerName ?? null,
      reason: recurringForm.reason || null,
    })
    if (!result.ok) alert(result.error)
  }

  function handleFloorImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('5MB 이하 이미지만 업로드 가능합니다.'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      if (ev.target?.result) saveFloorImage(defect.floorPlanId ?? 1, ev.target.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function submitLog() {
    if (!logForm.title.trim()) { alert('제목을 입력하세요.'); return }
    addLog({
      defectId: defect.id,
      logType: logForm.logType,
      title: logForm.title,
      content: logForm.content || null,
      costAmount: logForm.costAmount ? parseInt(logForm.costAmount) : null,
      occurredAt: logForm.occurredAt,
    })
    setLogForm({ logType: 'action', occurredAt: new Date().toISOString().slice(0, 16), title: '', content: '', costAmount: '' })
    setShowLogModal(false)
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden' }
  const ssStyle: React.CSSProperties = { border: '1.5px solid #e3e8ef', borderRadius: 7, padding: '6px 26px 6px 10px', fontSize: '0.8rem', fontFamily: 'inherit', color: '#0a2540', background: '#fff', cursor: 'pointer', outline: 'none', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='5'%3E%3Cpath d='M0 0l4.5 5L9 0z' fill='%23697386'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', fontWeight: 500 }
  const modalInputStyle: React.CSSProperties = { border: '1px solid #e3e8ef', borderRadius: 7, padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'inherit', color: '#0a2540', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' }
  const classifySelectStyle: React.CSSProperties = { ...modalInputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='5'%3E%3Cpath d='M0 0l4.5 5L9 0z' fill='%23697386'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28, cursor: 'pointer' }
  const canEdit = canEditDefect(role, defect.managerName, userName)
  const canFinalizeClassification = canFinalizeClassificationFn(role)
  const canConfirmRecurringLocal = canConfirmRecurring(role)
  const canEditClassification = canEdit
  const reviewStatusOptions = canFinalizeClassification ? REVIEW_STATUS_OPTIONS : REVIEW_STATUS_OPTIONS.filter(o => o !== '확정')
  const costApprovalOptions = canFinalizeClassification ? COST_APPROVAL_OPTIONS : COST_APPROVAL_OPTIONS.filter(o => o !== '승인완료' && o !== '반려')

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Page Header */}
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#697386' }}>
          <Link href="/defects" style={{ cursor: 'pointer', color: '#697386', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.color = '#635bff')} onMouseLeave={e => (e.currentTarget.style.color = '#697386')}>하자 목록</Link>
          <i className="fa-solid fa-chevron-right" style={{ color: '#b0bac6', fontSize: '0.55rem' }} />
          <span style={{ color: '#0a2540', fontWeight: 600 }}>{defect.caseNumber}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            style={{ ...ssStyle, opacity: canEdit ? 1 : 0.5, cursor: canEdit ? 'pointer' : 'not-allowed' }}
            value={defect.status}
            disabled={!canEdit}
            title={canEdit ? undefined : '조회자이거나 담당 하자가 아니어서 상태를 변경할 수 없습니다.'}
            onChange={e => handleStatusSelect(e.target.value)}
          >
            {STATUS_FLOW.map(s => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
          {canEdit && (
            <button
              onClick={() => router.push(`/defects/${defect.id}/edit`)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}
            >
              <i className="fa-solid fa-pen" /> 수정
            </button>
          )}
          {canDelete(role) && (
            <button
              onClick={handleDeleteDefect}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #fecdd3', background: '#fef0f4', color: '#be1044', fontFamily: 'inherit' }}
            >
              <i className="fa-solid fa-trash" /> 삭제
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* Detail Header */}
        <div style={{ ...card, padding: '20px 24px', marginBottom: 18 }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0a2540', marginBottom: 8 }}>{defect.title}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            <SeverityBadge severity={defect.severity} />
            <StatusBadge status={defect.status} />
            {cat && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 5, fontSize: '0.68rem', fontWeight: 600, background: cat.color + '18', color: cat.color }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color, flexShrink: 0, display: 'inline-block' }} />
                {cat.name}
              </span>
            )}
          </div>
        </div>

        {/* 판단 근거 */}
        {(isOverdue(defect) || defect.recurrenceCount > 0 || defect.costType !== 'our') && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {isOverdue(defect) && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: COLORS.warning, background: '#FFF7ED', padding: '5px 10px', borderRadius: 999, border: '1px solid #FED7AA' }}>
                🔶 지연 발생 ({defect.firstOccurredAt ? Math.floor((Date.now() - new Date(defect.firstOccurredAt).getTime()) / 86400000) : 0}일 경과)
              </span>
            )}
            {isRecurring(defect) && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: COLORS.danger, background: '#FEF2F2', padding: '5px 10px', borderRadius: 999, border: '1px solid #FECACA' }}>
                🔁 재발 {defect.recurrenceCount}회
              </span>
            )}
            {defect.costType !== 'our' && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', background: '#F3F4F6', padding: '5px 10px', borderRadius: 999, border: '1px solid #E5E7EB' }}>
                💰 {defect.costType === 'gukbo' ? '국보 부담' : '청구 대상'}
              </span>
            )}
          </div>
        )}

        {/* Detail Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 360px', gap: 18, alignItems: 'start' }}>

          {/* Left */}
          <div>
            {/* Meta */}
            <div style={card}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {[
                  ['건물', building?.name || '대전충청검사센터'],
                  ['위치', `${floor?.name || '-'} / ${defect.locationText || '-'}`],
                  ['신고자', defect.reporterName || '-'],
                  ['담당자', defect.managerName || '-'],
                  ['협력업체', vendor?.name || '미지정'],
                  ['비용유형', COST_LABELS[defect.costType] || defect.costType],
                  ['최초발생', fmtDate(defect.firstOccurredAt)],
                  ['조치예정일', defect.expectedCompletionDate ? fmtDate(defect.expectedCompletionDate) : '-'],
                  ['최근발생', fmtDate(defect.lastOccurredAt)],
                  ['재발횟수', `${defect.recurrenceCount || 0}회`],
                  ['누적비용', fmtKRW(defect.totalCost)],
                ].map(([k, v], i) => (
                  <div key={k as string} style={{ padding: '12px 16px', borderBottom: i < 10 ? '1px solid #f0f4f8' : 'none', borderRight: i % 2 === 0 && i < 10 ? '1px solid #f0f4f8' : 'none' }}>
                    <dt style={{ fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#697386', marginBottom: 3 }}>{k}</dt>
                    <dd style={{ fontSize: '0.82rem', fontWeight: 600, color: k === '누적비용' ? '#0f7850' : '#0a2540' }}>{v as string}</dd>
                  </div>
                ))}
              </div>
              {defect.description && (
                <div style={{ padding: '13px 16px', background: '#f5f7fa', borderTop: '1px solid #f0f4f8', fontSize: '0.8rem', color: '#425466', lineHeight: 1.7 }}>
                  {defect.description}
                </div>
              )}
            </div>

            {/* AI 분석 결과 */}
            {(defect.rootCause || defect.symptom || defect.causeCategory || defect.aiSummary || defect.aiRiskLevel) && (
              <div style={{ background: '#fff', border: '1px solid rgba(99,91,255,.3)', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden' as const, marginTop: 16 }}>
                <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg,rgba(99,91,255,.08),rgba(99,91,255,.04))', borderBottom: '1px solid rgba(99,91,255,.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#635bff', fontSize: 12 }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#635bff' }}>AI 분석 결과</span>
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    {defect.symptom && (
                      <div style={{ padding: '8px 12px', background: '#fafbfc', border: '1px solid #e3e8ef', borderRadius: 8 }}>
                        <dt style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#697386', marginBottom: 3 }}>증상</dt>
                        <dd style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0a2540' }}>{defect.symptom}</dd>
                      </div>
                    )}
                    {defect.causeCategory && (
                      <div style={{ padding: '8px 12px', background: '#fafbfc', border: '1px solid #e3e8ef', borderRadius: 8 }}>
                        <dt style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#697386', marginBottom: 3 }}>원인분류</dt>
                        <dd style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0a2540' }}>{defect.causeCategory}</dd>
                      </div>
                    )}
                    {defect.rootCause && (
                      <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: '#fafbfc', border: '1px solid #e3e8ef', borderRadius: 8 }}>
                        <dt style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#697386', marginBottom: 3 }}>근본원인</dt>
                        <dd style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0a2540' }}>{defect.rootCause}</dd>
                      </div>
                    )}
                  </div>
                  {defect.aiRiskLevel && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>AI 위험도</span>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: (AI_RISK_COLORS[defect.aiRiskLevel] ?? AI_RISK_COLORS['중']).bg, color: (AI_RISK_COLORS[defect.aiRiskLevel] ?? AI_RISK_COLORS['중']).text, border: `1px solid ${(AI_RISK_COLORS[defect.aiRiskLevel] ?? AI_RISK_COLORS['중']).border}` }}>
                        {defect.aiRiskLevel}
                      </span>
                    </div>
                  )}
                  {defect.aiSummary && (
                    <div style={{ padding: '10px 12px', background: 'rgba(99,91,255,.05)', border: '1px solid rgba(99,91,255,.15)', borderRadius: 8 }}>
                      <dt style={{ fontSize: '0.62rem', fontWeight: 700, color: '#635bff', marginBottom: 4 }}>AI 요약</dt>
                      <dd style={{ fontSize: '0.78rem', color: '#425466', lineHeight: 1.65 }}>{defect.aiSummary}</dd>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 반복 하자 분석 */}
            <div style={{ ...card, marginTop: 16 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#697386' }}>반복 하자 분석</span>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: displayedRecurringLevel === '반복 확정' ? '#FEF2F2' : displayedRecurringLevel === '반복 의심' ? '#FFF7ED' : '#f3f5f7',
                  color: displayedRecurringLevel === '반복 확정' ? COLORS.danger : displayedRecurringLevel === '반복 의심' ? COLORS.warning : '#425466',
                }}>{displayedRecurringLevel}</span>
                {!defect.recurringLevel && <span style={{ fontSize: '0.62rem', color: '#b0bac6' }}>(자동분석, 미확정)</span>}
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: '0.8rem', color: '#425466', marginBottom: 10 }}>{recurringAnalysis.reasonSummary}</div>
                {recurringAnalysis.recommendedAction && (
                  <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fafbfc', border: '1px solid #e3e8ef', borderRadius: 8, fontSize: '0.75rem', color: '#425466' }}>
                    <strong style={{ color: '#0a2540' }}>권장 조치:</strong> {recurringAnalysis.recommendedAction}
                  </div>
                )}
                {similarDefects.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#697386', marginBottom: 6 }}>과거 유사 하자</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {similarDefects.map(d => (
                        <Link key={d.id} href={`/defects/${d.id}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: '#fafbfc', border: '1px solid #e3e8ef', borderRadius: 6, textDecoration: 'none', fontSize: '0.75rem', color: '#0a2540' }}>
                          <span>{d.caseNumber} · {d.title}</span>
                          <span style={{ color: '#697386' }}>{fmtDate(d.firstOccurredAt)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {canConfirmRecurringLocal ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                    <div style={{ flex: '1 1 140px' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>반복 상태</label>
                      <select style={classifySelectStyle} value={recurringForm.level} onChange={e => setRecurringForm(f => ({ ...f, level: e.target.value }))}>
                        {RECURRING_LEVEL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: '2 1 200px' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>사유(확정/해제 시 필수)</label>
                      <input style={modalInputStyle} placeholder="예: 동일 위치 3회 재발 확인" value={recurringForm.reason} onChange={e => setRecurringForm(f => ({ ...f, reason: e.target.value }))} />
                    </div>
                    <button
                      onClick={submitRecurring}
                      style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #635bff', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}
                    >
                      적용
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.78rem', color: '#697386' }}>반복 확정/해제 권한이 없습니다.</div>
                )}
              </div>
            </div>

            {/* 하자 구분 및 귀책 판단 */}
            <div style={{ ...card, marginTop: 16 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#697386' }}>하자 구분 및 귀책 판단</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f3f5f7', color: '#425466' }}>{defect.defectType ?? '확인 필요'}</span>
              </div>
              <div style={{ padding: 16 }}>
                {defect.aiClassification && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(99,91,255,.05)', border: '1px solid rgba(99,91,255,.15)', borderRadius: 8, fontSize: '0.73rem', color: '#425466', lineHeight: 1.6 }}>
                    <strong style={{ color: '#635bff' }}><i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: 9, marginRight: 4 }} />AI 추천</strong> (신뢰도 {defect.aiClassification.confidence}): {defect.aiClassification.reasoning}
                  </div>
                )}
                {canEditClassification ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>하자 구분</label>
                      <select style={classifySelectStyle} value={classifyForm.defectType} onChange={e => setClassifyField('defectType', e.target.value)}>
                        {DEFECT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>귀책 구분</label>
                      <select style={classifySelectStyle} value={classifyForm.responsibilityType} onChange={e => setClassifyField('responsibilityType', e.target.value)}>
                        {RESPONSIBILITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: '#425466' }}>귀책 구분: {defect.responsibilityType || '미정'}</div>
                )}
              </div>
            </div>

            {/* 비용 처리 정보 */}
            <div style={{ ...card, marginTop: 16 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f4f8' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#697386' }}>비용 처리 정보</span>
              </div>
              <div style={{ padding: 16 }}>
                {canEditClassification ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>비용 부담 주체</label>
                        <select style={classifySelectStyle} value={classifyForm.costBearer} onChange={e => setClassifyField('costBearer', e.target.value)}>
                          {COST_BEARER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>비용 승인 상태</label>
                        <select style={classifySelectStyle} value={classifyForm.costApprovalStatus} onChange={e => setClassifyField('costApprovalStatus', e.target.value)}>
                          {costApprovalOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>보증기간 여부</label>
                        <select style={classifySelectStyle} value={classifyForm.warrantyStatus} onChange={e => setClassifyField('warrantyStatus', e.target.value)}>
                          {WARRANTY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>검토 상태</label>
                        <select style={classifySelectStyle} value={classifyForm.reviewStatus} onChange={e => setClassifyField('reviewStatus', e.target.value)}>
                          {reviewStatusOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>결제 수단</label>
                        <select
                          style={classifySelectStyle}
                          value={defect.paymentMethod ?? '미정'}
                          onChange={e => updateDefect(defect.id, { paymentMethod: e.target.value as Defect['paymentMethod'] })}
                        >
                          {PAYMENT_METHOD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" id="isWarrantyClaimTarget" checked={classifyForm.isWarrantyClaimTarget} onChange={e => setClassifyField('isWarrantyClaimTarget', e.target.checked)} />
                        <label htmlFor="isWarrantyClaimTarget" style={{ fontSize: '0.78rem', color: '#425466', cursor: 'pointer' }}>하자보수 청구 대상</label>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>관련 계약/공종</label>
                        <input style={modalInputStyle} placeholder="예: 방수공사 계약 (2024)" value={classifyForm.relatedContract} onChange={e => setClassifyField('relatedContract', e.target.value)} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>판단 근거</label>
                        <textarea style={{ ...modalInputStyle, resize: 'vertical', lineHeight: 1.6 }} rows={2} placeholder={canFinalizeClassification ? '확정 사유를 입력하세요.' : '의견/제안 사유를 입력하세요.'} value={classifyForm.classificationReason} onChange={e => setClassifyField('classificationReason', e.target.value)} />
                      </div>
                    </div>
                    <button
                      onClick={submitClassification}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #635bff', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}
                    >
                      <i className="fa-solid fa-check" /> {canFinalizeClassification ? '관리자 최종 확정' : '의견 제출'}
                    </button>
                  </>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.8rem', color: '#425466' }}>
                    <div>비용 부담 주체: {defect.costBearer || '미정'}</div>
                    <div>비용 승인 상태: {defect.costApprovalStatus || '미승인'}</div>
                    <div>보증기간 여부: {defect.warrantyStatus || '확인 필요'}</div>
                    <div>검토 상태: {defect.reviewStatus || '미검토'}</div>
                    <div>결제 수단: {defect.paymentMethod || '미정'}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Floor Map */}
            <div style={{ ...card, marginTop: 16 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#697386' }}>도면 위치</span>
                {canEdit && (
                  <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: '#635bff', fontWeight: 600, padding: '4px 10px', border: '1.5px solid #635bff', borderRadius: 6 }}>
                    <i className="fa-solid fa-upload" /> 도면 교체
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFloorImageUpload} />
                  </label>
                )}
              </div>
              <div
                ref={mapContainerRef}
                style={{ position: 'relative', background: '#f5f7fa', cursor: canEdit ? 'crosshair' : 'default' }}
                onClick={canEdit ? onMapClick : undefined}
              >
                <div dangerouslySetInnerHTML={{ __html: floorSvg }} />
                <FloorLocationMarkers
                  markers={locations}
                  onMove={canEdit ? (locId, x, y) => updateDefectLocationPosition(locId, x, y) : () => {}}
                  onSelect={setSelectedLocationId}
                  selectedId={selectedLocationId}
                  containerRef={mapContainerRef}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid #f0f4f8' }}>
                <span style={{ fontSize: '0.72rem', color: '#697386' }}>총 {locations.length}개 위치가 등록되었습니다</span>
                {canEdit && locations.length > 0 && (
                  <button type="button" onClick={clearAllLocations} style={{ fontSize: '0.7rem', color: '#697386', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                    위치 초기화
                  </button>
                )}
              </div>
              {locations.length > 0 && (
                <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {locations.map((loc, i) => (
                    <div
                      key={loc.id}
                      onClick={() => setSelectedLocationId(loc.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${selectedLocationId === loc.id ? '#635bff' : '#e3e8ef'}`, cursor: 'pointer' }}
                    >
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                      <input
                        style={{ ...modalInputStyle, border: 'none', padding: '2px 4px', flex: 1 }}
                        placeholder={`위치 ${i + 1} 라벨`}
                        value={loc.label ?? ''}
                        readOnly={!canEdit}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateDefectLocation(loc.id, { label: e.target.value })}
                      />
                      {canEdit && (
                        <button type="button" onClick={e => { e.stopPropagation(); removeLocation(loc.id) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b0bac6', fontSize: '.75rem' }}>
                          <i className="fa-solid fa-xmark" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Photos & files (증빙자료는 이 섹션을 재사용) */}
            <div style={{ fontSize: '0.7rem', color: '#b0bac6', marginTop: 16, marginBottom: -8 }}>
              증빙자료(견적서/작업확인서 등)는 아래 사진/첨부파일 영역에서 관리합니다.
            </div>
            <DefectPhotos defectId={defect.id} uploadedBy={defect.managerName ?? null} canEdit={canEdit} />
          </div>

          {/* Right: Timeline + 상태 변경 이력 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ ...card, height: 'fit-content' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540' }}>처리 이력</h3>
              {canEdit && (
                <button
                  onClick={() => setShowLogModal(true)}
                  style={{ background: 'none', border: 'none', color: '#635bff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <i className="fa-solid fa-plus" /> 이력 추가
                </button>
              )}
            </div>
            <div style={{ padding: '4px 18px 18px' }}>
              {logs.length === 0 ? (
                <p style={{ color: '#697386', fontSize: '0.78rem', textAlign: 'center', padding: 20 }}>이력이 없습니다.</p>
              ) : (
                <div style={{ paddingTop: 18, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 4, top: 18, bottom: 0, width: 2, background: '#f0f4f8', borderRadius: 1 }} />
                  {logs.map(l => (
                    <div key={l.id} style={{ position: 'relative', paddingLeft: 22, paddingBottom: 18 }}>
                      <span style={{ position: 'absolute', left: -3, top: 5, width: 10, height: 10, borderRadius: '50%', background: LOG_COLORS[l.logType] || '#697386', border: '2px solid #fff', boxShadow: `0 0 0 3px ${(LOG_COLORS[l.logType] || '#697386') + '22'}`, display: 'inline-block' }} />
                      <div style={{ fontSize: '0.65rem', color: '#697386', marginBottom: 3 }}>
                        {fmtDT(l.occurredAt)}
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 6px', borderRadius: 4, fontSize: '0.62rem', fontWeight: 700, color: '#fff', background: LOG_COLORS[l.logType] || '#697386', marginLeft: 6 }}>
                          {LOG_LABELS[l.logType] || l.logType}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0a2540', marginBottom: 2 }}>{l.title}</div>
                      {l.content && <div style={{ fontSize: '0.73rem', color: '#425466', lineHeight: 1.55 }}>{l.content}</div>}
                      {l.costAmount ? (
                        <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#0f7850', marginTop: 3 }}>
                          <i className="fa-solid fa-won-sign" style={{ fontSize: '0.65rem' }} /> {fmtKRW(l.costAmount)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 상태 변경 이력 */}
          <div style={{ ...card, height: 'fit-content' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f4f8' }}>
              <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540' }}>상태 변경 이력</h3>
            </div>
            <div style={{ padding: '4px 18px 18px' }}>
              {statusHistory.length === 0 ? (
                <p style={{ color: '#697386', fontSize: '0.78rem', textAlign: 'center', padding: 20 }}>상태 변경 이력이 없습니다.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
                  {statusHistory.map(h => (
                    <div key={h.id} style={{ fontSize: '0.75rem', color: '#425466' }}>
                      <div style={{ fontSize: '0.65rem', color: '#697386', marginBottom: 2 }}>{fmtDT(h.changedAt)}</div>
                      <div>
                        <span style={{ fontWeight: 600, color: '#0a2540' }}>{STATUS_META[h.fromStatus as StatusKey]?.label ?? h.fromStatus}</span>
                        {' → '}
                        <span style={{ fontWeight: 600, color: '#0a2540' }}>{STATUS_META[h.toStatus as StatusKey]?.label ?? h.toStatus}</span>
                      </div>
                      {h.reason && <div style={{ fontSize: '0.7rem', color: '#697386', marginTop: 2 }}>{h.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 판단 이력 */}
          <div style={{ ...card, height: 'fit-content' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f4f8' }}>
              <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540' }}>판단 이력</h3>
            </div>
            <div style={{ padding: '4px 18px 18px' }}>
              {classificationHistory.length === 0 ? (
                <p style={{ color: '#697386', fontSize: '0.78rem', textAlign: 'center', padding: 20 }}>판단 이력이 없습니다.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
                  {classificationHistory.map(h => (
                    <div key={h.id} style={{ fontSize: '0.75rem', color: '#425466' }}>
                      <div style={{ fontSize: '0.65rem', color: '#697386', marginBottom: 2 }}>{fmtDT(h.changedAt)}</div>
                      <div style={{ fontWeight: 600, color: '#0a2540' }}>{h.defectType} · {h.responsibilityType || '미정'} · {h.costBearer || '미정'}</div>
                      <div style={{ fontSize: '0.68rem', color: '#697386' }}>검토상태 {h.reviewStatus || '미검토'} / 비용승인 {h.costApprovalStatus || '미승인'}</div>
                      {h.reason && <div style={{ fontSize: '0.7rem', color: '#697386', marginTop: 2 }}>{h.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* Log Modal */}
      {showLogModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,37,64,.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowLogModal(false) }}
        >
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 430, maxWidth: '94vw', boxShadow: '0 8px 28px rgba(10,37,64,.13)', border: '1px solid #e3e8ef' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0a2540', marginBottom: 16 }}>이력 추가</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>유형</label>
                <select style={{ ...modalInputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='5'%3E%3Cpath d='M0 0l4.5 5L9 0z' fill='%23697386'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28, cursor: 'pointer' }} value={logForm.logType} onChange={e => setLogForm(f => ({ ...f, logType: e.target.value }))}>
                  <option value="occurrence">발생</option>
                  <option value="inspection">점검</option>
                  <option value="action">조치</option>
                  <option value="recurrence">재발</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>발생일시</label>
                <input type="datetime-local" style={modalInputStyle} value={logForm.occurredAt} onChange={e => setLogForm(f => ({ ...f, occurredAt: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>제목 *</label>
                <input style={modalInputStyle} placeholder="예: 방수공사 완료" value={logForm.title} onChange={e => setLogForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>내용</label>
                <textarea style={{ ...modalInputStyle, resize: 'vertical', lineHeight: 1.6 }} rows={2} value={logForm.content} onChange={e => setLogForm(f => ({ ...f, content: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>비용 (원)</label>
                <input type="number" style={modalInputStyle} placeholder="0" value={logForm.costAmount} onChange={e => setLogForm(f => ({ ...f, costAmount: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLogModal(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}>취소</button>
              <button onClick={submitLog} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #635bff', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 조치완료 전환 모달 */}
      {showActionDoneModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,37,64,.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowActionDoneModal(false) }}
        >
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 430, maxWidth: '94vw', boxShadow: '0 8px 28px rgba(10,37,64,.13)', border: '1px solid #e3e8ef' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0a2540', marginBottom: 4 }}>조치완료 처리</div>
            <div style={{ fontSize: '0.72rem', color: '#697386', marginBottom: 16 }}>조치 내용과 실제 비용은 선택 입력입니다. 비워두고 바로 전환할 수 있습니다.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>조치 내용</label>
                <textarea style={{ ...modalInputStyle, resize: 'vertical', lineHeight: 1.6 }} rows={3} placeholder="예: 우레탄 방수 보강 시공 완료" value={actionDoneForm.actionContent} onChange={e => setActionDoneForm(f => ({ ...f, actionContent: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>실제 비용 (원)</label>
                <input type="number" style={modalInputStyle} placeholder="0" value={actionDoneForm.actualCost} onChange={e => setActionDoneForm(f => ({ ...f, actualCost: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowActionDoneModal(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}>취소</button>
              <button onClick={submitActionDone} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #635bff', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}>조치완료로 전환</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
