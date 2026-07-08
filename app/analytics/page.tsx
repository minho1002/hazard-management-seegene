'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useStore, type Defect } from '@/lib/store'
import {
  COLORS, isOverdue, needsAfterPhoto, getPaymentBadge, getCostBearerStatus,
  STATUS_FLOW, STATUS_META, SEVERITY_META, type SeverityKey,
} from '@/lib/designTokens'
import { useMediaQuery } from '@/lib/useMediaQuery'
import StatusBadge from '@/components/ui/StatusBadge'

const DEFECT_TYPE_KEYS = ['하자사항', '일반사항', '확인 필요'] as const
const COST_BEARER_KEYS = ['시공사', '재단', '외주업체', '사용자', '보험/기타', '미정'] as const
const SEVERITY_KEYS: SeverityKey[] = ['critical', 'high', 'medium', 'low']

type PeriodType = '전체' | '연도별' | '월별' | '주별' | '사용자지정'

function fmtKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}
function fmtDate(s: string | null) {
  if (!s) return '-'
  return new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
function pad2(n: number) { return String(n).padStart(2, '0') }
function toYMD(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate() }

export default function AnalyticsPage() {
  const { state } = useStore()
  const isTablet = useMediaQuery('(max-width: 1024px)')

  const now = new Date()
  const [periodType, setPeriodType] = useState<PeriodType>('전체')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [weekStart, setWeekStart] = useState(toYMD(now))
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [activeUnifiedTab, setActiveUnifiedTab] = useState('recurring')

  let from: string | null = null
  let to: string | null = null
  if (periodType === '연도별') { from = `${year}-01-01`; to = `${year}-12-31` }
  else if (periodType === '월별') { from = `${year}-${pad2(month)}-01`; to = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}` }
  else if (periodType === '주별') {
    const start = new Date(weekStart)
    const end = new Date(start); end.setDate(end.getDate() + 6)
    from = toYMD(start); to = toYMD(end)
  } else if (periodType === '사용자지정') { from = customFrom || null; to = customTo || null }

  const allDefects = state.defects.filter(d => !d.deletedAt)
  const inRange = (dateStr: string | null) => {
    if (!dateStr) return false
    if (!from && !to) return true
    const d = dateStr.slice(0, 10)
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }

  // 기간 내 하자 (발생일 기준) — 대부분의 KPI/집계/테이블의 기본 데이터셋
  const periodDefects = allDefects.filter(d => (!from && !to) || inRange(d.firstOccurredAt))

  function getCompletionDate(d: Defect): string | null {
    const hist = state.statusHistory
      .filter(h => h.defectId === d.id && h.toStatus === 'completed')
      .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime())
    return hist[0]?.changedAt.slice(0, 10) ?? (d.status === 'completed' ? d.lastOccurredAt : null)
  }

  // ── 상단 KPI 10개 ──────────────────────────────────────────────────────
  const kpiTotal = periodDefects.length
  const kpiNew = allDefects.filter(d => inRange(d.createdAt)).length
  const kpiInProgress = periodDefects.filter(d => !['open', 'completed'].includes(d.status) && d.status !== 'hold').length
  const completedInRange = allDefects.filter(d => d.status === 'completed' && (!from && !to ? true : inRange(getCompletionDate(d))))
  const kpiCompleted = completedInRange.length
  const kpiOverdue = periodDefects.filter(isOverdue).length
  const kpiRecurring = periodDefects.filter(d => d.recurrenceCount > 0).length
  const kpiUnclassified = periodDefects.filter(d => (d.defectType ?? '확인 필요') === '확인 필요').length
  const kpiCostUnresolved = periodDefects.filter(d => getCostBearerStatus(d) === '미정').length
  const kpiTotalCost = periodDefects.reduce((s, d) => s + (d.totalCost || 0), 0)
  const avgDurations = completedInRange
    .map(d => {
      const comp = getCompletionDate(d)
      if (!comp || !d.firstOccurredAt) return null
      const days = (new Date(comp).getTime() - new Date(d.firstOccurredAt).getTime()) / 86400000
      return days >= 0 ? days : null
    })
    .filter((v): v is number => v != null)
  const kpiAvgDuration = avgDurations.length > 0 ? Math.round(avgDurations.reduce((s, v) => s + v, 0) / avgDurations.length) : 0

  const kpis = [
    { label: '누적 하자 수', value: `${kpiTotal}건` },
    { label: '기간 내 신규', value: `${kpiNew}건` },
    { label: '진행중', value: `${kpiInProgress}건` },
    { label: '최종완료', value: `${kpiCompleted}건` },
    { label: '지연', value: `${kpiOverdue}건`, danger: kpiOverdue > 0 },
    { label: '반복', value: `${kpiRecurring}건`, danger: kpiRecurring > 0 },
    { label: '확인 필요', value: `${kpiUnclassified}건` },
    { label: '비용부담 미정', value: `${kpiCostUnresolved}건`, danger: kpiCostUnresolved > 0 },
    { label: '누적 처리비용', value: fmtKRW(kpiTotalCost) },
    { label: '평균 처리기간', value: `${kpiAvgDuration}일` },
  ]

  // ── 집계 5종 ───────────────────────────────────────────────────────────
  const statusAgg = STATUS_FLOW.map(s => ({ key: s, label: STATUS_META[s].label, color: STATUS_META[s].color, count: periodDefects.filter(d => d.status === s).length }))
  const categoryAgg = state.categories.map(c => ({ key: String(c.id), label: c.name, color: c.color, count: periodDefects.filter(d => d.categoryId === c.id).length }))
  const severityAgg = SEVERITY_KEYS.map(s => ({ key: s, label: SEVERITY_META[s].label, color: SEVERITY_META[s].color, count: periodDefects.filter(d => d.severity === s).length }))
  const costBearerAgg = COST_BEARER_KEYS.map(b => ({ key: b, label: b, color: b === '미정' ? COLORS.danger : COLORS.action, count: periodDefects.filter(d => getCostBearerStatus(d) === b).length }))
  const defectTypeAgg = DEFECT_TYPE_KEYS.map(t => ({ key: t, label: t, color: t === '하자사항' ? COLORS.danger : t === '일반사항' ? COLORS.success : COLORS.textMuted, count: periodDefects.filter(d => (d.defectType ?? '확인 필요') === t).length }))

  // ── Top10 테이블 7개 ───────────────────────────────────────────────────
  const recurringTop10 = [...periodDefects].filter(d => d.recurrenceCount > 0 || d.recurringLevel === '반복 확정' || d.recurringLevel === '반복 의심')
    .sort((a, b) => b.recurrenceCount - a.recurrenceCount).slice(0, 10)
  const overdueTop10 = [...periodDefects].filter(isOverdue)
    .sort((a, b) => (a.firstOccurredAt ?? '').localeCompare(b.firstOccurredAt ?? '')).slice(0, 10)
  const costTop10 = [...periodDefects].sort((a, b) => b.totalCost - a.totalCost).slice(0, 10)
  const facilityCounts: Record<string, number> = {}
  periodDefects.forEach(d => { if (d.facilityName) facilityCounts[d.facilityName] = (facilityCounts[d.facilityName] ?? 0) + 1 })
  const facilityRepeatList = periodDefects
    .filter(d => d.facilityName && facilityCounts[d.facilityName] >= 2)
    .sort((a, b) => facilityCounts[b.facilityName!] - facilityCounts[a.facilityName!])
    .slice(0, 10)
  const contractorList = periodDefects.filter(d => d.responsibilityType === '시공사 귀책').slice(0, 10)
  const foundationList = periodDefects.filter(d => d.costBearer === '재단').slice(0, 10)
  const vendorReviewList = periodDefects.filter(d => d.costBearer === '외주업체').slice(0, 10)

  // ── 집계현황 통합 테이블 (탭 전환) — 반복하자/지연하자/고비용하자 등 7개로 흩어져 있던
  // 미니테이블을 하나의 큰 테이블 + 탭으로 통합한다. 0건인 탭은 숨긴다.
  const unifiedTabs: { key: string; label: string; rows: Defect[] }[] = [
    { key: 'recurring', label: '반복 하자 Top 10', rows: recurringTop10 },
    { key: 'overdue', label: '지연 하자', rows: overdueTop10 },
    { key: 'cost', label: '고비용 하자', rows: costTop10 },
    { key: 'facility', label: '설비별 반복', rows: facilityRepeatList },
    { key: 'contractor', label: '시공사 귀책 가능', rows: contractorList },
    { key: 'foundation', label: '재단 부담 예상', rows: foundationList },
    { key: 'vendorReview', label: '외주업체 확인 필요', rows: vendorReviewList },
  ]

  const card = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden' as const }
  const inputCls: React.CSSProperties = { border: '1px solid #e3e8ef', borderRadius: 7, padding: '6px 10px', fontSize: '0.78rem', fontFamily: 'inherit', color: '#0a2540', background: '#fff', outline: 'none' }

  function BarList({ title, rows }: { title: string; rows: { key: string; label: string; color: string; count: number }[] }) {
    const max = Math.max(1, ...rows.map(r => r.count))
    return (
      <div style={card}>
        <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f4f8' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>{title}</div>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(r => {
            const pct = Math.round((r.count / max) * 100)
            return (
              <div key={r.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: '0.75rem', color: '#0a2540' }}>{r.label}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>{r.count}건</span>
                </div>
                <div style={{ height: 5, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: r.color, borderRadius: 999 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function actionNeeded(d: Defect): string {
    if (d.status === 'recheck_needed') return '재점검 필요'
    if (isOverdue(d)) return '즉시 조치 필요'
    if (needsAfterPhoto(d, state.files)) return '후사진 필요'
    const badge = getPaymentBadge(d, state.files)
    if (badge && badge.tone !== 'success') return '결제 증빙 필요'
    return '-'
  }

  function UnifiedDefectTable({ tabs }: { tabs: { key: string; label: string; rows: Defect[] }[] }) {
    const visibleTabs = tabs.filter(t => t.rows.length > 0)
    if (visibleTabs.length === 0) return null
    const current = visibleTabs.find(t => t.key === activeUnifiedTab) ?? visibleTabs[0]

    return (
      <div style={card}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f4f8', display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          {visibleTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveUnifiedTab(t.key)}
              style={{
                padding: '5px 12px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${current.key === t.key ? '#635bff' : '#E5E7EB'}`,
                background: current.key === t.key ? '#635bff' : '#fff',
                color: current.key === t.key ? '#fff' : '#425466', fontFamily: 'inherit',
              }}
            >
              {t.label} ({t.rows.length})
            </button>
          ))}
        </div>
        <div style={{ overflowX: isTablet ? 'auto' : 'visible' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                {['순위', '하자명', '위치', '분야', '상태', '외주업체', '비용', '지연일', '반복횟수', '결제상태', '조치필요사항'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '7px 12px', fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#697386', whiteSpace: 'nowrap' as const }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {current.rows.map((d, i) => {
                const cat = state.categories.find(c => c.id === d.categoryId)
                const vendor = state.vendors.find(v => v.id === d.assignedVendorId)
                const overdueDays = isOverdue(d) && d.firstOccurredAt ? Math.floor((Date.now() - new Date(d.firstOccurredAt).getTime()) / 86400000) : null
                const badge = getPaymentBadge(d, state.files)
                return (
                  <tr key={d.id} style={{ borderBottom: i < current.rows.length - 1 ? '1px solid #f0f4f8' : 'none' }}>
                    <td style={{ padding: '7px 12px', fontSize: '0.74rem', color: '#697386' }}>{i + 1}</td>
                    <td style={{ padding: '7px 12px' }}>
                      <Link href={`/defects/${d.id}`} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}>{d.title}</Link>
                    </td>
                    <td style={{ padding: '7px 12px', fontSize: '0.74rem', color: '#697386' }}>{d.locationText || '-'}</td>
                    <td style={{ padding: '7px 12px' }}>
                      {cat ? (
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '1px 7px', borderRadius: 4, background: cat.color + '18', color: cat.color, whiteSpace: 'nowrap' as const }}>{cat.name}</span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '7px 12px' }}><StatusBadge status={d.status} /></td>
                    <td style={{ padding: '7px 12px', fontSize: '0.74rem', color: vendor ? '#0a2540' : '#b0bac6', whiteSpace: 'nowrap' as const }}>{vendor ? vendor.name : '자체처리'}</td>
                    <td style={{ padding: '7px 12px', fontSize: '0.76rem', fontWeight: 600, color: '#0a2540', whiteSpace: 'nowrap' as const }}>{d.totalCost > 0 ? fmtKRW(d.totalCost) : '-'}</td>
                    <td style={{ padding: '7px 12px', fontSize: '0.74rem', color: overdueDays ? COLORS.warning : '#b0bac6', fontWeight: overdueDays ? 700 : 400 }}>{overdueDays ? `${overdueDays}일` : '-'}</td>
                    <td style={{ padding: '7px 12px', fontSize: '0.74rem', color: d.recurrenceCount > 0 ? '#be1044' : '#b0bac6', fontWeight: d.recurrenceCount > 0 ? 700 : 400 }}>{d.recurrenceCount > 0 ? `${d.recurrenceCount}회` : '-'}</td>
                    <td style={{ padding: '7px 12px', fontSize: '0.68rem', whiteSpace: 'nowrap' as const }}>
                      {badge ? (
                        <span style={{ fontWeight: 700, color: badge.tone === 'success' ? COLORS.success : badge.tone === 'danger' ? COLORS.danger : badge.tone === 'warning' ? COLORS.warning : '#697386' }}>
                          {badge.icon} {badge.label}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '7px 12px', fontSize: '0.72rem', color: '#425466' }}>{actionNeeded(d)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>집계현황</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>기간별·위치별·상태별·카테고리별 집계 및 반복 하자 분석</div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* 기간 필터 */}
        <div style={{ ...card, padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <select style={inputCls} value={periodType} onChange={e => setPeriodType(e.target.value as PeriodType)}>
            {(['전체', '연도별', '월별', '주별', '사용자지정'] as const).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {periodType === '연도별' && (
            <select style={inputCls} value={year} onChange={e => setYear(Number(e.target.value))}>
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
          )}
          {periodType === '월별' && (
            <>
              <select style={inputCls} value={year} onChange={e => setYear(Number(e.target.value))}>
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select style={inputCls} value={month} onChange={e => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
              </select>
            </>
          )}
          {periodType === '주별' && (
            <input type="date" style={inputCls} value={weekStart} onChange={e => setWeekStart(e.target.value)} />
          )}
          {periodType === '사용자지정' && (
            <>
              <input type="date" style={inputCls} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span style={{ color: '#b0bac6' }}>~</span>
              <input type="date" style={inputCls} value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </>
          )}
          {(from || to) && <span style={{ fontSize: '0.72rem', color: '#697386' }}>{from ?? '-'} ~ {to ?? '-'}</span>}
        </div>

        {/* 상단 KPI 10개 */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 12, marginBottom: 20 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ ...card, padding: '14px 16px' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#697386', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: k.danger ? COLORS.danger : '#0a2540' }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* 집계 5종 */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <BarList title="상태별 집계" rows={statusAgg} />
          <BarList title="카테고리별 집계" rows={categoryAgg} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <BarList title="심각도별 집계" rows={severityAgg} />
          <BarList title="비용 부담 주체별 집계" rows={costBearerAgg} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <BarList title="하자사항/일반사항 비율" rows={defectTypeAgg} />
        </div>

        {/* 집계현황 통합 테이블 (탭 전환) — 반복/지연/고비용/설비별반복/시공사귀책/재단부담/외주업체확인 통합 */}
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0a2540', marginBottom: 12 }}>상세 테이블</div>
        <UnifiedDefectTable tabs={unifiedTabs} />
      </div>
    </div>
  )
}
