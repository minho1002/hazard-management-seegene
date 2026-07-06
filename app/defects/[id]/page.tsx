'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { FLOOR_SVGS } from '@/lib/floorSvgs'
import DefectPhotos from '@/components/defects/DefectPhotos'
import StatusBadge from '@/components/ui/StatusBadge'
import SeverityBadge from '@/components/ui/SeverityBadge'
import { isOverdue, isRecurring, COLORS, STATUS_FLOW, STATUS_META, type StatusKey } from '@/lib/designTokens'
import { useMediaQuery } from '@/lib/useMediaQuery'

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
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}
function fmtKRW(n: number | null | undefined) {
  if (!n) return '0원'
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}

export default function DefectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { state, updateDefectStatus, softDeleteDefect, addLog, saveFloorImage } = useStore()
  const isTablet = useMediaQuery('(max-width: 1024px)')

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

  const floorSvg = state.floorPlanImages[defect.floorPlanId ?? 0]
    ? `<img src="${state.floorPlanImages[defect.floorPlanId ?? 0]}" style="width:100%;height:auto;display:block">`
    : (FLOOR_SVGS[defect.floorPlanId ?? 1] || FLOOR_SVGS[1])

  function handleDeleteDefect() {
    const reason = prompt('삭제 사유를 입력하세요.')
    if (reason == null) return
    if (!reason.trim()) { alert('삭제 사유를 입력해야 합니다.'); return }
    softDeleteDefect(defect.id, reason.trim(), defect.managerName ?? null)
    router.push('/defects')
  }

  function applyStatusChange(target: StatusKey, opts?: { actionContent?: string; actualCost?: string }): boolean {
    const result = updateDefectStatus(defect.id, target, {
      changedBy: defect.managerName ?? null,
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
    applyStatusChange(target as StatusKey)
  }

  function submitActionDone() {
    if (applyStatusChange('action_done', actionDoneForm)) setShowActionDoneModal(false)
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
            style={ssStyle}
            value={defect.status}
            onChange={e => handleStatusSelect(e.target.value)}
          >
            {STATUS_FLOW.map(s => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
          <button
            onClick={() => router.push(`/defects/${defect.id}/edit`)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}
          >
            <i className="fa-solid fa-pen" /> 수정
          </button>
          <button
            onClick={handleDeleteDefect}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #fecdd3', background: '#fef0f4', color: '#be1044', fontFamily: 'inherit' }}
          >
            <i className="fa-solid fa-trash" /> 삭제
          </button>
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
                  ['최근발생', fmtDate(defect.lastOccurredAt)],
                  ['재발횟수', `${defect.recurrenceCount || 0}회`],
                  ['누적비용', fmtKRW(defect.totalCost)],
                ].map(([k, v], i) => (
                  <div key={k as string} style={{ padding: '12px 16px', borderBottom: i < 8 ? '1px solid #f0f4f8' : 'none', borderRight: i % 2 === 0 ? '1px solid #f0f4f8' : 'none' }}>
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

            {/* Floor Map */}
            <div style={{ ...card, marginTop: 16 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#697386' }}>도면 위치</span>
                <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: '#635bff', fontWeight: 600, padding: '4px 10px', border: '1.5px solid #635bff', borderRadius: 6 }}>
                  <i className="fa-solid fa-upload" /> 도면 교체
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFloorImageUpload} />
                </label>
              </div>
              <div style={{ position: 'relative', background: '#f5f7fa' }}>
                <div dangerouslySetInnerHTML={{ __html: floorSvg }} />
                {defect.locationX != null && (
                  <div
                    style={{ position: 'absolute', left: `${defect.locationX}%`, top: `${defect.locationY ?? 0}%`, transform: 'translate(-50%,-50%)', zIndex: 10 }}
                    title={`${defect.caseNumber}: ${defect.title}`}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2.5px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.25)', background: cat?.color || '#635bff', color: '#fff', fontSize: 10 }}>
                      {cat ? <i className={`fa-solid ${cat.icon}`} style={{ fontSize: 10 }} /> : '●'}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#697386', padding: '8px 16px', textAlign: 'center', borderTop: '1px solid #f0f4f8' }}>
                {defect.locationX != null ? `좌표 (${defect.locationX}%, ${defect.locationY}%) — ${defect.locationText || ''}` : '위치 좌표 미설정'}
              </div>
            </div>

            {/* Photos & files */}
            <DefectPhotos defectId={defect.id} />
          </div>

          {/* Right: Timeline + 상태 변경 이력 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ ...card, height: 'fit-content' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540' }}>처리 이력</h3>
              <button
                onClick={() => setShowLogModal(true)}
                style={{ background: 'none', border: 'none', color: '#635bff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <i className="fa-solid fa-plus" /> 이력 추가
              </button>
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
            <div style={{ fontSize: '0.72rem', color: '#697386', marginBottom: 16 }}>조치 내용, 실제 비용, 조치 후 사진이 있어야 조치완료로 전환할 수 있습니다.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>조치 내용 *</label>
                <textarea style={{ ...modalInputStyle, resize: 'vertical', lineHeight: 1.6 }} rows={3} placeholder="예: 우레탄 방수 보강 시공 완료" value={actionDoneForm.actionContent} onChange={e => setActionDoneForm(f => ({ ...f, actionContent: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>실제 비용 (원) *</label>
                <input type="number" style={modalInputStyle} placeholder="0" value={actionDoneForm.actualCost} onChange={e => setActionDoneForm(f => ({ ...f, actualCost: e.target.value }))} />
              </div>
              <div style={{ fontSize: '0.7rem', color: '#697386' }}>조치 후 사진은 아래 "사진 / 첨부파일" 영역의 "조치후" 섹션에서 먼저 업로드해주세요.</div>
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
