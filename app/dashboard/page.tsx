'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useStore, type Defect } from '@/lib/store'
import {
  COLORS, isOverdue, needsAfterPhoto, getPaymentBadge, getCostBearerStatus, getDisplayCost,
  STATUS_FLOW, STATUS_META, SEVERITY_META, type SeverityKey, needsTodayAction, isSlaImminent,
} from '@/lib/designTokens'
import { useMediaQuery } from '@/lib/useMediaQuery'
import StatusBadge from '@/components/ui/StatusBadge'
import { generateActionPlanOpinion } from '@/lib/aiReportService'

const DEFECT_TYPE_KEYS = ['하자사항', '일반사항', '확인 필요'] as const
const COST_BEARER_KEYS = ['시공사', '재단', '외주업체', '사용자', '보험/기타', '미정'] as const
const SEVERITY_KEYS: SeverityKey[] = ['critical', 'high', 'medium', 'low']

type PeriodType = '전체' | '연도별' | '월별' | '주별' | '사용자지정'

function fmtKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}
function pad2(n: number) { return String(n).padStart(2, '0') }
function toYMD(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate() }

// Executive Dashboard. (구 /analytics "집계현황" — 2026-08 고도화로 이 콘텐츠가 /dashboard로 이동했고,
// 기존 /dashboard(캘린더+트리아지)는 "운영현황"(/analytics)으로 이동했다. 기존 KPI/집계/Top10 로직은
// 그대로 재사용하고, 오늘 우선처리·SLA임박·위험 하자·6개월 추이·반복 하자(실계산)·외주업체 성과·
// AI 인사이트만 신규로 추가했다.)
export default function DashboardPage() {
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
  const kpiConfirmedCost = periodDefects.reduce((s, d) => {
    const { amount, confirmed } = getDisplayCost(d)
    return s + (confirmed && amount != null ? amount : 0)
  }, 0)
  const kpiEstimatedPendingCost = periodDefects.reduce((s, d) => {
    const { amount, confirmed } = getDisplayCost(d)
    return s + (!confirmed && amount != null ? amount : 0)
  }, 0)
  const avgDurations = completedInRange
    .map(d => {
      const comp = getCompletionDate(d)
      if (!comp || !d.firstOccurredAt) return null
      const days = (new Date(comp).getTime() - new Date(d.firstOccurredAt).getTime()) / 86400000
      return days >= 0 ? days : null
    })
    .filter((v): v is number => v != null)
  const kpiAvgDuration = avgDurations.length > 0 ? Math.round(avgDurations.reduce((s, v) => s + v, 0) / avgDurations.length) : 0

  // ── Executive Dashboard 신규 블록 (2026-08 고도화) ──────────────────────

  // 오늘 우선처리 Top3 (구 /dashboard 로직 재사용)
  const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const top3 = [...periodDefects]
    .filter(needsTodayAction)
    .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || b.recurrenceCount - a.recurrenceCount)
    .slice(0, 3)

  // SLA 임박(24시간 내)
  const kpiSlaImminent = periodDefects.filter(isSlaImminent).length

  // 위험 하자 TOP5 — 미완료 하자를 심각도 → 지연일수 내림차순으로 정렬
  function overdueDaysOf(d: Defect): number {
    if (!isOverdue(d)) return 0
    const base = d.expectedCompletionDate ?? d.firstOccurredAt
    if (!base) return 0
    return Math.max(0, Math.floor((Date.now() - new Date(base).getTime()) / 86400000))
  }
  const riskTop5 = [...periodDefects]
    .filter(d => d.status !== 'completed')
    .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || overdueDaysOf(b) - overdueDaysOf(a))
    .slice(0, 5)

  // 최근 6개월 발생추이 — 조회기간 선택과 무관하게 항상 최근 6개월 고정(allDefects 기준)
  const trendMonthMap: Record<string, number> = {}
  allDefects.forEach(d => {
    const m = d.firstOccurredAt?.slice(0, 7)
    if (!m) return
    trendMonthMap[m] = (trendMonthMap[m] ?? 0) + 1
  })
  const trendMonths = Object.entries(trendMonthMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
  const trendRows = trendMonths.map(([m, count]) => ({ key: m, label: m.replace('-', '년 ') + '월', color: '#635bff', count }))

  // 반복 하자 TOP5(실제 계산) — recurrenceCount 필드가 아니라 "동일 위치·설비·분야" 조합으로
  // 전체(삭제되지 않은) 하자를 그룹핑해 실제 이력 기준으로 반복을 판정한다.
  function recurringKey(d: Defect): string {
    return `${d.locationText ?? d.zone ?? '위치미상'}|${d.facilityName ?? d.facilityId ?? '설비미상'}|${d.categoryId ?? '미분류'}`
  }
  const recurringGroupMap = new Map<string, Defect[]>()
  allDefects.forEach(d => {
    const key = recurringKey(d)
    const arr = recurringGroupMap.get(key) ?? []
    arr.push(d)
    recurringGroupMap.set(key, arr)
  })
  const recurringGroups = Array.from(recurringGroupMap.entries())
    .map(([key, ds]) => ({ key, defects: ds, count: ds.length, label: ds[0].locationText || ds[0].zone || ds[0].title }))
    .filter(g => g.count >= 2)
    .sort((a, b) => b.count - a.count)
  const recurringTop5Real = recurringGroups.slice(0, 5)
  const recurringDefectIds = new Set(recurringGroups.flatMap(g => g.defects.map(d => d.id)))

  // 외주업체 성과 — 업체별 평균 처리기간(일) · 재발률(%) · 산정 점수(1~5, 전체 기간 기준)
  // 평가점수는 설문/리뷰가 아니라 처리기간·재발률로부터 계산한 값이다.
  const vendorPerf = state.vendors.map(v => {
    const assigned = allDefects.filter(d => d.assignedVendorId === v.id)
    const durations = assigned
      .filter(d => d.actionCompletedAt && d.firstOccurredAt)
      .map(d => (new Date(d.actionCompletedAt as string).getTime() - new Date(d.firstOccurredAt as string).getTime()) / 86400000)
      .filter(days => days >= 0)
    const avgDays = durations.length > 0 ? Math.round(durations.reduce((s, x) => s + x, 0) / durations.length) : null
    const recurCount = assigned.filter(d => recurringDefectIds.has(d.id)).length
    const recurRate = assigned.length > 0 ? recurCount / assigned.length : 0
    const daysPenalty = avgDays != null ? Math.min(2, Math.max(0, avgDays - 7) / 3) : 0
    const recurPenalty = Math.min(2, recurRate * 3)
    const score = assigned.length > 0 ? Math.max(1, Math.min(5, Math.round((5 - daysPenalty - recurPenalty) * 10) / 10)) : null
    return { id: v.id, name: v.name, assignedCount: assigned.length, avgDays, recurRate, score }
  }).filter(v => v.assignedCount > 0).sort((a, b) => b.assignedCount - a.assignedCount)

  // AI 인사이트 & Action Plan — 기존 규칙기반 엔진(lib/aiReportService.ts) 그대로 재사용
  const actionPlan = generateActionPlanOpinion(periodDefects, state.files, state.floorPlans, from || to ? `${from ?? ''} ~ ${to ?? ''}` : '전체 기간')

  const kpis = [
    { label: '누적 하자 수', value: `${kpiTotal}건` },
    { label: '기간 내 신규', value: `${kpiNew}건` },
    { label: '진행중', value: `${kpiInProgress}건` },
    { label: '최종완료', value: `${kpiCompleted}건` },
    { label: '지연', value: `${kpiOverdue}건`, danger: kpiOverdue > 0 },
    { label: '반복', value: `${kpiRecurring}건`, danger: kpiRecurring > 0 },
    { label: '확인 필요', value: `${kpiUnclassified}건` },
    { label: '비용부담 미정', value: `${kpiCostUnresolved}건`, danger: kpiCostUnresolved > 0 },
    { label: '누적 확정비용', value: fmtKRW(kpiConfirmedCost) },
    { label: '누적 예상비용(미확정)', value: fmtKRW(kpiEstimatedPendingCost) },
    { label: '평균 처리기간', value: `${kpiAvgDuration}일` },
    { label: 'SLA 임박(24시간 내)', value: `${kpiSlaImminent}건`, danger: kpiSlaImminent > 0 },
  ]

  // ── 집계 5종 ───────────────────────────────────────────────────────────
  const statusAgg = STATUS_FLOW.map(s => ({ key: s, label: STATUS_META[s].label, color: STATUS_META[s].color, count: periodDefects.filter(d => d.status === s).length }))
  const categoryAgg = state.categories.map(c => ({ key: String(c.id), label: c.name, color: c.color, count: periodDefects.filter(d => d.categoryId === c.id).length }))
  const categoryCostAgg = state.categories.map(c => {
    const rows = periodDefects.filter(d => d.categoryId === c.id)
    const confirmed = rows.reduce((s, d) => { const { amount, confirmed } = getDisplayCost(d); return s + (confirmed && amount != null ? amount : 0) }, 0)
    const pending = rows.reduce((s, d) => { const { amount, confirmed } = getDisplayCost(d); return s + (!confirmed && amount != null ? amount : 0) }, 0)
    return { key: String(c.id), label: c.name, color: c.color, confirmed, pending }
  }).filter(r => r.confirmed > 0 || r.pending > 0)
  const severityAgg = SEVERITY_KEYS.map(s => ({ key: s, label: SEVERITY_META[s].label, color: SEVERITY_META[s].color, count: periodDefects.filter(d => d.severity === s).length }))
  const costBearerAgg = COST_BEARER_KEYS.map(b => ({ key: b, label: b, color: b === '미정' ? COLORS.danger : COLORS.action, count: periodDefects.filter(d => getCostBearerStatus(d) === b).length }))
  const defectTypeAgg = DEFECT_TYPE_KEYS.map(t => ({ key: t, label: t, color: t === '하자사항' ? COLORS.danger : t === '일반사항' ? COLORS.success : COLORS.textMuted, count: periodDefects.filter(d => (d.defectType ?? '확인 필요') === t).length }))

  // ── Top10 테이블 7개 ───────────────────────────────────────────────────
  const recurringTop10 = [...periodDefects].filter(d => d.recurrenceCount > 0 || d.recurringLevel === '반복 확정' || d.recurringLevel === '반복 의심')
    .sort((a, b) => b.recurrenceCount - a.recurrenceCount).slice(0, 10)
  const overdueTop10 = [...periodDefects].filter(isOverdue)
    .sort((a, b) => (a.firstOccurredAt ?? '').localeCompare(b.firstOccurredAt ?? '')).slice(0, 10)
  const costTop10 = [...periodDefects].sort((a, b) => (getDisplayCost(b).amount ?? 0) - (getDisplayCost(a).amount ?? 0)).slice(0, 10)
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
          {rows.length === 0 && <div style={{ fontSize: '0.75rem', color: '#aab' }}>데이터가 없습니다.</div>}
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

  // 카테고리별 비용 — 확정(진하게)과 예상/미확정(연하게)을 한 막대에 이어 붙여 비교한다.
  function CostBarList({ title, rows }: { title: string; rows: { key: string; label: string; color: string; confirmed: number; pending: number }[] }) {
    const max = Math.max(1, ...rows.map(r => r.confirmed + r.pending))
    return (
      <div style={card}>
        <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f4f8' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>{title}</div>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.length === 0 && <div style={{ fontSize: '0.75rem', color: '#aab' }}>데이터가 없습니다.</div>}
          {rows.map(r => {
            const confirmedPct = Math.round((r.confirmed / max) * 100)
            const pendingPct = Math.round((r.pending / max) * 100)
            return (
              <div key={r.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: '#0a2540' }}>{r.label}</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, textAlign: 'right' }}>
                    {r.confirmed > 0 && <span style={{ color: '#0F7850' }}>확정 {fmtKRW(r.confirmed)}</span>}
                    {r.confirmed > 0 && r.pending > 0 && <span style={{ color: '#b0bac6' }}> · </span>}
                    {r.pending > 0 && <span style={{ color: '#B06B1A' }}>예상 {fmtKRW(r.pending)}</span>}
                  </span>
                </div>
                <div style={{ height: 5, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ height: '100%', width: `${confirmedPct}%`, background: r.color }} />
                  <div style={{ height: '100%', width: `${pendingPct}%`, background: r.color, opacity: 0.35 }} />
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
                    <td style={{ padding: '7px 12px', fontSize: '0.76rem', fontWeight: 600, whiteSpace: 'nowrap' as const }}>
                      {(() => {
                        const { amount, confirmed } = getDisplayCost(d)
                        if (amount == null) return <span style={{ color: '#b0bac6', fontWeight: 400 }}>-</span>
                        return (
                          <span style={{ color: confirmed ? '#0a2540' : '#B06B1A' }}>
                            {!confirmed && <span style={{ fontSize: '0.6rem', fontWeight: 700, background: '#FFF7ED', padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>예상</span>}
                            {fmtKRW(amount)}
                          </span>
                        )
                      })()}
                    </td>
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
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>대시보드</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>KPI·위험 하자·비용·반복 하자·외주업체 성과 종합 현황 (Executive Dashboard)</div>
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

        {/* 상단 KPI 12개 */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'repeat(2,1fr)' : 'repeat(6,1fr)', gap: 12, marginBottom: 20 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ ...card, padding: '14px 16px' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#697386', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: k.danger ? COLORS.danger : '#0a2540' }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* 오늘 우선처리 Top3 · 위험 하자 TOP5 (Executive Dashboard 신규) */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={card}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f4f8' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>오늘 우선처리 Top 3</div>
            </div>
            {top3.length === 0 ? (
              <div style={{ padding: 16, fontSize: '0.75rem', color: '#aab' }}>오늘 우선처리할 항목이 없습니다.</div>
            ) : top3.map(d => (
              <Link key={d.id} href={`/defects/${d.id}`} style={{ display: 'block', padding: '10px 18px', textDecoration: 'none', borderBottom: '1px solid #f7f8fa' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0a2540' }}>{d.title}</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>{d.locationText || '-'}</div>
              </Link>
            ))}
          </div>
          <div style={card}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f4f8' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>위험 하자 TOP 5</div>
            </div>
            {riskTop5.length === 0 ? (
              <div style={{ padding: 16, fontSize: '0.75rem', color: '#aab' }}>위험 하자가 없습니다.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {riskTop5.map((d, i) => (
                    <tr key={d.id} style={{ borderBottom: i < riskTop5.length - 1 ? '1px solid #f0f4f8' : 'none' }}>
                      <td style={{ padding: '8px 6px 8px 18px', fontSize: '0.72rem', color: '#697386', width: 20 }}>{i + 1}</td>
                      <td style={{ padding: '8px 6px' }}>
                        <Link href={`/defects/${d.id}`} style={{ fontSize: '0.76rem', fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}>{d.title}</Link>
                        <div style={{ fontSize: '0.65rem', color: '#697386' }}>{d.locationText || '-'}</div>
                      </td>
                      <td style={{ padding: '8px 6px', fontSize: '0.68rem', fontWeight: 700, color: SEVERITY_META[d.severity as SeverityKey]?.color ?? '#697386' }}>{SEVERITY_META[d.severity as SeverityKey]?.label ?? d.severity}</td>
                      <td style={{ padding: '8px 18px 8px 6px', fontSize: '0.68rem', fontWeight: 700, color: overdueDaysOf(d) > 0 ? COLORS.warning : '#b0bac6', textAlign: 'right' as const }}>{overdueDaysOf(d) > 0 ? `+${overdueDaysOf(d)}일` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 집계 5종 */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <BarList title="상태별 집계" rows={statusAgg} />
          <BarList title="카테고리별 집계" rows={categoryAgg} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <CostBarList title="카테고리별 비용 (확정 · 예상/미확정)" rows={categoryCostAgg} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <BarList title="심각도별 집계" rows={severityAgg} />
          <BarList title="비용 부담 주체별 집계" rows={costBearerAgg} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <BarList title="하자사항/일반사항 비율" rows={defectTypeAgg} />
        </div>

        {/* 최근 6개월 발생추이 (Executive Dashboard 신규 — 조회기간 선택과 무관하게 항상 최근 6개월 고정) */}
        <div style={{ marginBottom: 14 }}>
          <BarList title="최근 6개월 발생추이 (전체 기간 고정)" rows={trendRows} />
        </div>

        {/* 반복 하자 TOP5(실제 계산) · 외주업체 성과 (Executive Dashboard 신규) */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={card}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f4f8' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>반복 하자 TOP 5</div>
              <div style={{ fontSize: '0.65rem', color: '#aab', marginTop: 2 }}>동일 위치·설비·분야 이력을 실제 그룹핑해 계산 (recurrenceCount 필드와 별개)</div>
            </div>
            {recurringTop5Real.length === 0 ? (
              <div style={{ padding: 16, fontSize: '0.75rem', color: '#aab' }}>반복 발생 그룹이 없습니다.</div>
            ) : recurringTop5Real.map((g, i) => (
              <div key={g.key} style={{ padding: '9px 18px', borderBottom: i < recurringTop5Real.length - 1 ? '1px solid #f0f4f8' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#0a2540' }}>{i + 1}. {g.label}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#be1044' }}>{g.count}회</span>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f4f8' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>외주업체 성과</div>
              <div style={{ fontSize: '0.65rem', color: '#aab', marginTop: 2 }}>평가점수는 처리기간·재발률 기반 산정값(설문 아님), 전체 기간 기준</div>
            </div>
            {vendorPerf.length === 0 ? (
              <div style={{ padding: 16, fontSize: '0.75rem', color: '#aab' }}>배정된 외주업체가 없습니다.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                    {['업체명', '배정건수', '평균처리기간', '재발률', '평가점수'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: '0.6rem', fontWeight: 700, color: '#697386', whiteSpace: 'nowrap' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendorPerf.map((v, i) => (
                    <tr key={v.id} style={{ borderBottom: i < vendorPerf.length - 1 ? '1px solid #f0f4f8' : 'none' }}>
                      <td style={{ padding: '7px 10px', fontSize: '0.75rem', fontWeight: 600, color: '#0a2540' }}>{v.name}</td>
                      <td style={{ padding: '7px 10px', fontSize: '0.72rem', color: '#425466' }}>{v.assignedCount}건</td>
                      <td style={{ padding: '7px 10px', fontSize: '0.72rem', color: '#425466' }}>{v.avgDays != null ? `${v.avgDays}일` : '-'}</td>
                      <td style={{ padding: '7px 10px', fontSize: '0.72rem', color: v.recurRate > 0 ? '#be1044' : '#425466', fontWeight: v.recurRate > 0 ? 700 : 400 }}>{Math.round(v.recurRate * 100)}%</td>
                      <td style={{ padding: '7px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#635bff' }}>{v.score != null ? `★ ${v.score.toFixed(1)}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* AI 인사이트 & Action Plan (Executive Dashboard 신규 — 기존 generateActionPlanOpinion 재사용) */}
        <div style={{ marginBottom: 24, ...card, padding: 18, background: 'linear-gradient(135deg, rgba(99,91,255,.04), rgba(99,91,255,.01))', border: '1px solid rgba(99,91,255,.2)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0a2540', marginBottom: 10 }}>✨ AI 인사이트 &amp; Action Plan</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: actionPlan.immediateActions.length + actionPlan.recurringWarning.length > 0 ? 12 : 0 }}>
            {actionPlan.headline.map((line, i) => (
              <div key={i} style={{ fontSize: '0.78rem', color: '#0a2540', lineHeight: 1.6 }}>{line}</div>
            ))}
          </div>
          {(actionPlan.immediateActions.length > 0 || actionPlan.recurringWarning.length > 0) && (
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#635bff', marginBottom: 6 }}>AI 권장 조치</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[...actionPlan.immediateActions, ...actionPlan.recurringWarning].slice(0, 5).map((line, i) => (
                  <li key={i} style={{ fontSize: '0.74rem', color: '#425466', lineHeight: 1.5 }}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 집계현황 통합 테이블 (탭 전환) — 반복/지연/고비용/설비별반복/시공사귀책/재단부담/외주업체확인 통합 */}
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0a2540', marginBottom: 12 }}>상세 테이블</div>
        <UnifiedDefectTable tabs={unifiedTabs} />
      </div>
    </div>
  )
}
