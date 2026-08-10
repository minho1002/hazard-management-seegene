'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Chart as ChartJS, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler,
} from 'chart.js'
import { Doughnut, Line } from 'react-chartjs-2'
import { useStore, type Defect } from '@/lib/store'
import {
  isOverdue, getDisplayCost, SEVERITY_META, type SeverityKey, needsTodayAction, isSlaImminent,
  isInProgressStatus, isKpiCompleted, filterByOccurredPeriod, sumCostSummary,
  type StandardPeriodType, STANDARD_PERIOD_OPTIONS, computeStandardPeriod, isScheduled, isUnresolved, isRecurring,
} from '@/lib/designTokens'
import StatusBadge from '@/components/ui/StatusBadge'
import { generateActionPlanOpinion } from '@/lib/aiReportService'

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

// 디자인 규칙(6) — 대시보드 전체에서 이 4색만 사용한다.
const BLUE = '#2563EB'
const GREEN = '#16A34A'
const ORANGE = '#F97316'
const RED = '#DC2626'

const SEVERITY_KEYS: SeverityKey[] = ['critical', 'high', 'medium', 'low']
const SEVERITY_DONUT_COLOR: Record<SeverityKey, string> = { critical: RED, high: ORANGE, medium: BLUE, low: GREEN }

function fmtKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
// 조회기간 표시는 "2026.08.01" 형식(점 구분)으로 통일 — 내부 계산용 YYYY-MM-DD 값은 그대로 두고 표시만 바꾼다.
function fmtDot(s: string | null): string { return s ? s.replaceAll('-', '.') : '' }

// 지연일수 — 위험 하자 TOP5에서 재사용(기존 Executive Dashboard 로직 그대로).
function overdueDaysOf(d: Defect): number {
  if (!isOverdue(d)) return 0
  const base = d.expectedCompletionDate ?? d.firstOccurredAt
  if (!base) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(base).getTime()) / 86400000))
}

type Tone = 'lowerBetter' | 'higherBetter' | 'neutral'
function deltaTone(cur: number, prev: number, tone: Tone): string {
  if (tone === 'neutral' || cur === prev) return '#697386'
  const up = cur > prev
  if (tone === 'lowerBetter') return up ? RED : GREEN
  return up ? GREEN : RED
}
function deltaPct(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? '0%' : '신규'
  return `${cur > prev ? '+' : ''}${Math.round((cur - prev) / prev * 100)}%`
}

// 시설관리 Executive Dashboard(2026-08 3차 고도화) — KPI 8개 + 3행(위험/오늘/비용, 카테고리/추이/위험도,
// AI 인사이트&Action Plan)으로 정보량을 줄인 버전. 새 데이터 조회/집계 로직은 만들지 않고, 기존
// designTokens 공용 함수(computeStandardPeriod/filterByOccurredPeriod/sumCostSummary/isOverdue 등)와
// generateActionPlanOpinion만으로 화면에 필요한 값을 계산한다.
export default function DashboardPage() {
  const { state } = useStore()

  const [periodType, setPeriodType] = useState<StandardPeriodType>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')

  useEffect(() => { setUpdatedAt(new Date().toLocaleString('ko-KR')) }, [])

  const period = computeStandardPeriod(periodType, customFrom || null, customTo || null)
  const { from, to } = period

  const allDefects = state.defects.filter(d => !d.deletedAt)
  const inRange = (dateStr: string | null) => {
    if (!dateStr) return false
    if (!from && !to) return true
    const d = dateStr.slice(0, 10)
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }
  const periodDefects = filterByOccurredPeriod(allDefects, from, to)

  // ── 1행 KPI 8개 (선택된 조회기간 기준) ────────────────────────────────────
  const kpiNew = allDefects.filter(d => inRange(d.createdAt)).length
  const kpiInProgress = periodDefects.filter(isInProgressStatus).length
  const kpiScheduled = periodDefects.filter(isScheduled).length
  const kpiSlaImminent = periodDefects.filter(isSlaImminent).length
  const kpiCompleted = periodDefects.filter(isKpiCompleted).length
  const kpiUnresolved = periodDefects.filter(isUnresolved).length
  const { confirmed: kpiConfirmedCost, pending: kpiEstimatedCost } = sumCostSummary(periodDefects)

  // 전월 대비 — 선택된 조회기간과 무관하게 항상 "지난 달"을 비교 기준으로 고정한다
  // (기존 8-2 "비용 증가 원인" 블록의 lastMonthDefects 로직을 그대로 재사용).
  const lastMonthRef = new Date()
  lastMonthRef.setMonth(lastMonthRef.getMonth() - 1)
  const lastMonthFrom = ymd(new Date(lastMonthRef.getFullYear(), lastMonthRef.getMonth(), 1))
  const lastMonthTo = ymd(new Date(lastMonthRef.getFullYear(), lastMonthRef.getMonth() + 1, 0))
  const lastMonthDefects = filterByOccurredPeriod(allDefects, lastMonthFrom, lastMonthTo)
  const lastMonthNew = allDefects.filter(d => {
    const c = d.createdAt?.slice(0, 10)
    return !!c && c >= lastMonthFrom && c <= lastMonthTo
  }).length
  const lastMonthInProgress = lastMonthDefects.filter(isInProgressStatus).length
  const lastMonthScheduled = lastMonthDefects.filter(isScheduled).length
  const lastMonthSlaImminent = lastMonthDefects.filter(isSlaImminent).length
  const lastMonthCompleted = lastMonthDefects.filter(isKpiCompleted).length
  const lastMonthUnresolved = lastMonthDefects.filter(isUnresolved).length
  const { confirmed: lastMonthConfirmedCost, pending: lastMonthEstimatedCost } = sumCostSummary(lastMonthDefects)

  const kpiCards: { key: string; label: string; icon: string; value: string; accent: string; cur: number; prev: number; tone: Tone; tooltip?: string }[] = [
    { key: 'new', label: '신규 접수', icon: 'fa-solid fa-file-circle-plus', value: `${kpiNew}건`, accent: BLUE, cur: kpiNew, prev: lastMonthNew, tone: 'lowerBetter' },
    { key: 'inprogress', label: '진행 중', icon: 'fa-solid fa-hourglass-half', value: `${kpiInProgress}건`, accent: ORANGE, cur: kpiInProgress, prev: lastMonthInProgress, tone: 'neutral' },
    { key: 'scheduled', label: '조치 예정', icon: 'fa-solid fa-calendar-check', value: `${kpiScheduled}건`, accent: GREEN, cur: kpiScheduled, prev: lastMonthScheduled, tone: 'neutral' },
    { key: 'sla', label: '처리기한 임박', icon: 'fa-solid fa-bell', value: `${kpiSlaImminent}건`, accent: RED, cur: kpiSlaImminent, prev: lastMonthSlaImminent, tone: 'lowerBetter', tooltip: '목표 처리기한까지 24시간 이내로 남은 하자' },
    { key: 'completed', label: '조치 완료', icon: 'fa-solid fa-circle-check', value: `${kpiCompleted}건`, accent: GREEN, cur: kpiCompleted, prev: lastMonthCompleted, tone: 'higherBetter' },
    { key: 'unresolved', label: '미완결 합계', icon: 'fa-solid fa-list-check', value: `${kpiUnresolved}건`, accent: BLUE, cur: kpiUnresolved, prev: lastMonthUnresolved, tone: 'lowerBetter' },
    { key: 'estCost', label: '예상 비용', icon: 'fa-solid fa-coins', value: fmtKRW(kpiEstimatedCost), accent: ORANGE, cur: kpiEstimatedCost, prev: lastMonthEstimatedCost, tone: 'lowerBetter' },
    { key: 'confCost', label: '확정 비용', icon: 'fa-solid fa-file-invoice-dollar', value: fmtKRW(kpiConfirmedCost), accent: GREEN, cur: kpiConfirmedCost, prev: lastMonthConfirmedCost, tone: 'neutral' },
  ]

  // ── 2행 ────────────────────────────────────────────────────────────────
  const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const riskTop5 = [...periodDefects]
    .filter(d => d.status !== 'completed')
    .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || overdueDaysOf(b) - overdueDaysOf(a))
    .slice(0, 5)
  const top3 = [...periodDefects]
    .filter(needsTodayAction)
    .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || b.recurrenceCount - a.recurrenceCount)
    .slice(0, 3)
  // 반복 하자 TOP5 — 기존 recurrenceCount/isRecurring(재발 이력) 데이터를 그대로 사용, 새 계산 로직 없음.
  const recurringTop5 = [...periodDefects]
    .filter(isRecurring)
    .sort((a, b) => b.recurrenceCount - a.recurrenceCount)
    .slice(0, 5)

  // 이번 달 비용 현황 — 조회기간 선택과 무관하게 항상 이번 달(달력월) 고정(기존 관례와 동일).
  const thisMonthPeriod = computeStandardPeriod('month', null, null)
  const thisMonthDefects = filterByOccurredPeriod(allDefects, thisMonthPeriod.from, thisMonthPeriod.to)
  const thisMonthCost = sumCostSummary(thisMonthDefects)
  // 절감 금액 — 예상비용(estimatedCost)과 확정비용(finalCost)이 모두 있는 건에 한해, 확정비용이 예상보다
  // 낮게 나온 차액만 "절감"으로 집계한다(기존 getCostDiff와 같은 필드만 사용, 새 계산 로직 없음).
  const savingsItems = thisMonthDefects.filter(d => d.estimatedCost != null && d.finalCost != null)
  const savingsAmount = savingsItems.reduce((s, d) => s + Math.max(0, (d.estimatedCost as number) - (d.finalCost as number)), 0)
  const savingsBase = savingsItems.reduce((s, d) => s + Math.max(0, d.estimatedCost as number), 0)
  const savingsRate = savingsBase > 0 ? Math.round(savingsAmount / savingsBase * 100) : 0

  // ── 3행 ────────────────────────────────────────────────────────────────
  const categoryAgg = state.categories
    .map(c => ({ key: String(c.id), label: c.name, color: c.color, count: periodDefects.filter(d => d.categoryId === c.id).length }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
  const severityAgg = SEVERITY_KEYS
    .map(s => ({ key: s, label: SEVERITY_META[s].label, color: SEVERITY_DONUT_COLOR[s], count: periodDefects.filter(d => d.severity === s).length }))
    .filter(s => s.count > 0)

  // 최근 6개월 발생추이 — 조회기간 선택과 무관하게 항상 고정(기존 관례와 동일).
  const trendMonthMap: Record<string, number> = {}
  allDefects.forEach(d => {
    const m = d.firstOccurredAt?.slice(0, 7)
    if (!m) return
    trendMonthMap[m] = (trendMonthMap[m] ?? 0) + 1
  })
  const trendMonths = Object.entries(trendMonthMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
  const trendLabels = trendMonths.map(([m]) => m.slice(5) + '월')
  const trendCounts = trendMonths.map(([, c]) => c)

  // ── 4행 AI 인사이트 & Action Plan ──────────────────────────────────────
  const actionPlan = generateActionPlanOpinion(periodDefects, state.files, state.floorPlans, period.label)
  const topImprovements = actionPlan.immediateActions.slice(0, 3)
  const expectedRisks = [...actionPlan.recurringWarning, ...actionPlan.costRisk].slice(0, 3)

  // ── 공용 비주얼 토큰 ───────────────────────────────────────────────────
  const card: React.CSSProperties = { background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(16,24,40,.03), 0 2px 8px rgba(16,24,40,.04)', overflow: 'hidden' }
  const cardPad: React.CSSProperties = { padding: '22px 24px' }
  const sectionTitle: React.CSSProperties = { fontSize: '0.92rem', fontWeight: 700, color: '#0a2540', display: 'flex', alignItems: 'center', gap: 8 }
  const listRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid #f4f6f8' }

  function fmtDate(s: string | null | undefined) { return s ? s.slice(0, 10) : '-' }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F8FA' }}>
      {/* Header */}
      <div style={{ padding: '28px 40px 20px', background: '#fff', position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid #eef0f3' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' as const, gap: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.01em' }}>안녕하세요, 관리자님!</h1>
            <div style={{ fontSize: '0.82rem', color: '#8a94a6', marginTop: 4 }}>오늘도 안전하고 쾌적한 시설 관리를 응원합니다.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
              {STANDARD_PERIOD_OPTIONS.filter(o => o.key !== 'all').map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setPeriodType(opt.key)}
                  style={{
                    padding: '8px 18px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                    background: periodType === opt.key ? BLUE : '#F0F2F5',
                    color: periodType === opt.key ? '#fff' : '#425466',
                  }}
                >
                  {opt.label}
                </button>
              ))}
              {periodType === 'custom' && (
                <>
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e3e8ef', fontSize: '0.78rem', fontFamily: 'inherit' }} />
                  <span style={{ color: '#b0bac6' }}>~</span>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e3e8ef', fontSize: '0.78rem', fontFamily: 'inherit' }} />
                </>
              )}
            </div>
            {/* 조회기간 — 선택한 버튼/사용자지정 날짜가 바뀌면 즉시 갱신되며, 아래 KPI·차트·리스트가 모두
                이 기간 하나만 기준으로 계산된다는 것을 한눈에 알 수 있게 항상 표시한다. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#F0F2F5', borderRadius: 10, padding: '8px 14px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#425466', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' as const }}>
                <i className="fa-regular fa-calendar" style={{ color: BLUE }} />
                조회기간 : {from && to ? <strong style={{ color: '#0a2540', fontWeight: 700 }}>{fmtDot(from)} ~ {fmtDot(to)}</strong> : <span style={{ color: '#aab' }}>시작일과 종료일을 선택해주세요</span>}
              </span>
              <span style={{ width: 1, height: 14, background: '#dfe3e8' }} />
              <button
                onClick={() => setUpdatedAt(new Date().toLocaleString('ko-KR'))}
                title="화면을 최신 상태로 갱신합니다"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, color: '#425466', fontFamily: 'inherit', padding: 0 }}
              >
                <i className="fa-solid fa-arrows-rotate" style={{ color: BLUE }} /> 새로고침
              </button>
            </div>
          </div>
        </div>
        <div style={{ fontSize: '0.68rem', color: '#aab', marginTop: 10, textAlign: 'right' as const }}>
          KPI · 차트 · 리스트 모두 위 조회기간 기준으로 계산됩니다{updatedAt && <> · 업데이트 {updatedAt}</>}
        </div>
      </div>

      <div style={{ padding: '28px 40px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* 1행 — KPI 8개 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 20 }}>
          {kpiCards.map(k => (
            <div key={k.key} title={k.tooltip} style={{ ...card, padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: k.accent + '16', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={k.icon} style={{ fontSize: '1.05rem', color: k.accent }} />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#697386', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.02em', lineHeight: 1 }}>{k.value}</div>
              </div>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, color: deltaTone(k.cur, k.prev, k.tone), display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className={`fa-solid ${k.cur > k.prev ? 'fa-arrow-up' : k.cur < k.prev ? 'fa-arrow-down' : 'fa-minus'}`} style={{ fontSize: '0.68rem' }} />
                {deltaPct(k.cur, k.prev)}
                <span style={{ color: '#aab', fontWeight: 500 }}>지난 달 대비</span>
              </div>
            </div>
          ))}
        </div>

        {/* 2행 — 위험 하자 TOP5 / 반복 하자 TOP5 / 오늘 우선처리 TOP3 / 이번 달 비용 현황 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <div style={{ ...cardPad, paddingBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={sectionTitle}><i className="fa-solid fa-triangle-exclamation" style={{ color: RED }} /> 위험 하자 TOP 5</span>
              <Link href="/defects?filter=overdue" style={{ fontSize: '0.76rem', color: BLUE, textDecoration: 'none', fontWeight: 600 }}>더보기 <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.62rem' }} /></Link>
            </div>
            {riskTop5.length === 0 ? (
              <div style={{ padding: '20px 24px 26px', fontSize: '0.8rem', color: '#aab' }}>위험 하자가 없습니다.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f1f3' }}>
                    {['순위', '하자명', '위치', '위험도', '지연일', '상태'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.63rem', fontWeight: 700, color: '#8a94a6', whiteSpace: 'nowrap' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riskTop5.map((d, i) => {
                    const sev = SEVERITY_META[d.severity as SeverityKey]
                    const days = overdueDaysOf(d)
                    return (
                      <tr key={d.id} style={{ borderBottom: i < riskTop5.length - 1 ? '1px solid #f7f8fa' : 'none' }}>
                        <td style={{ padding: '10px 10px 10px 24px', fontSize: '0.74rem', color: '#8a94a6' }}>{i + 1}</td>
                        <td style={{ padding: '10px' }}><Link href={`/defects/${d.id}`} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}>{d.title}</Link></td>
                        <td style={{ padding: '10px', fontSize: '0.72rem', color: '#697386', whiteSpace: 'nowrap' as const }}>{d.locationText || '-'}</td>
                        <td style={{ padding: '10px', fontSize: '0.72rem', fontWeight: 700, color: sev?.color ?? '#697386', whiteSpace: 'nowrap' as const }}>{sev?.label ?? d.severity}</td>
                        <td style={{ padding: '10px', fontSize: '0.72rem', fontWeight: 700, color: days > 0 ? RED : '#b0bac6' }}>{days > 0 ? `+${days}일` : '-'}</td>
                        <td style={{ padding: '10px 24px 10px 10px' }}><StatusBadge status={d.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <div style={{ ...cardPad, paddingBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={sectionTitle}><i className="fa-solid fa-rotate" style={{ color: BLUE }} /> 반복 하자 TOP 5</span>
              <Link href="/defects?filter=recurring" style={{ fontSize: '0.76rem', color: BLUE, textDecoration: 'none', fontWeight: 600 }}>더보기 <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.62rem' }} /></Link>
            </div>
            {recurringTop5.length === 0 ? (
              <div style={{ padding: '20px 24px 26px', fontSize: '0.8rem', color: '#aab' }}>반복 하자가 없습니다.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f0f1f3' }}>
                    {['순위', '하자명', '위치', '카테고리', '반복횟수', '최근발생일'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.63rem', fontWeight: 700, color: '#8a94a6', whiteSpace: 'nowrap' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recurringTop5.map((d, i) => {
                    const cat = state.categories.find(c => c.id === d.categoryId)
                    return (
                      <tr key={d.id} style={{ borderBottom: i < recurringTop5.length - 1 ? '1px solid #f7f8fa' : 'none' }}>
                        <td style={{ padding: '10px 10px 10px 24px', fontSize: '0.74rem', color: '#8a94a6' }}>{i + 1}</td>
                        <td style={{ padding: '10px' }}><Link href={`/defects/${d.id}`} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}>{d.title}</Link></td>
                        <td style={{ padding: '10px', fontSize: '0.72rem', color: '#697386', whiteSpace: 'nowrap' as const }}>{d.locationText || '-'}</td>
                        <td style={{ padding: '10px', fontSize: '0.72rem', color: '#697386', whiteSpace: 'nowrap' as const }}>{cat?.name ?? '-'}</td>
                        <td style={{ padding: '10px', fontSize: '0.72rem', fontWeight: 700, color: BLUE }}>{d.recurrenceCount}회</td>
                        <td style={{ padding: '10px 24px 10px 10px', fontSize: '0.72rem', color: '#697386', whiteSpace: 'nowrap' as const }}>{fmtDate(d.lastOccurredAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <div style={{ ...cardPad, paddingBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={sectionTitle}><i className="fa-solid fa-bolt" style={{ color: ORANGE }} /> 오늘 우선처리 TOP 3</span>
              <Link href="/defects?filter=today" style={{ fontSize: '0.76rem', color: BLUE, textDecoration: 'none', fontWeight: 600 }}>더보기 <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.62rem' }} /></Link>
            </div>
            {top3.length === 0 ? (
              <div style={{ padding: '20px 24px 26px', fontSize: '0.8rem', color: '#aab' }}>오늘 우선처리할 항목이 없습니다.</div>
            ) : (
              <div style={{ padding: '4px 0 12px' }}>
                {top3.map((d, i) => {
                  const cat = state.categories.find(c => c.id === d.categoryId)
                  const vendor = state.vendors.find(v => v.id === d.assignedVendorId)
                  const days = overdueDaysOf(d)
                  const { amount } = getDisplayCost(d)
                  return (
                    <Link key={d.id} href={`/defects/${d.id}`} style={{ display: 'block', padding: '12px 24px', textDecoration: 'none', borderBottom: i < top3.length - 1 ? '1px solid #f4f6f8' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ width: 22, height: 22, borderRadius: 7, background: BLUE, color: '#fff', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0a2540', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{d.title}</span>
                        {days > 0 && <span style={{ fontSize: '0.64rem', fontWeight: 700, color: RED, background: RED + '14', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>지연 +{days}일</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#8a94a6', lineHeight: 1.8, paddingLeft: 32 }}>
                        항목: {cat?.name ?? '-'} &nbsp;|&nbsp; 조치예정일 {fmtDate(d.expectedCompletionDate)} &nbsp;|&nbsp; 담당: {vendor?.name ?? '자체처리'}
                        {amount != null && <>&nbsp;|&nbsp; 예상비용: {fmtKRW(amount)}</>}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <div style={{ ...cardPad, paddingBottom: 14 }}>
              <span style={sectionTitle}><i className="fa-solid fa-won-sign" style={{ color: GREEN }} /> 이번 달 비용 현황</span>
            </div>
            <div style={{ padding: '4px 24px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
                {[
                  { label: '예상 비용', value: fmtKRW(thisMonthCost.pending), color: ORANGE },
                  { label: '확정 비용', value: fmtKRW(thisMonthCost.confirmed), color: GREEN },
                  { label: '절감 금액', value: fmtKRW(savingsAmount), color: BLUE },
                ].map(x => (
                  <div key={x.label} style={{ background: '#F7F8FA', borderRadius: 12, padding: '14px 12px', textAlign: 'center' as const }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#8a94a6', marginBottom: 8 }}>{x.label}</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: x.color, wordBreak: 'keep-all' as const }}>{x.value}</div>
                  </div>
                ))}
              </div>
              {savingsAmount > 0 && (
                <div style={{ fontSize: '0.72rem', color: '#697386', textAlign: 'center' as const }}>절감률 <strong style={{ color: BLUE }}>{savingsRate}%</strong> (예상 대비 확정비용 기준)</div>
              )}
            </div>
          </div>
        </div>

        {/* 3행 — 카테고리 발생현황 / 월별 발생추이 / 위험도 분포 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          <div style={card}>
            <div style={{ ...cardPad, paddingBottom: 6 }}><span style={sectionTitle}><i className="fa-solid fa-layer-group" style={{ color: BLUE }} /> 카테고리 발생현황 <span style={{ fontSize: '0.7rem', fontWeight: 500, color: '#aab' }}>({period.label})</span></span></div>
            <div style={{ padding: '10px 24px 24px', display: 'flex', alignItems: 'center', gap: 20 }}>
              {categoryAgg.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#aab', padding: '20px 0' }}>데이터가 없습니다.</div>
              ) : (
                <>
                  <div style={{ width: 130, height: 130, flexShrink: 0 }}>
                    <Doughnut
                      data={{ labels: categoryAgg.map(c => c.label), datasets: [{ data: categoryAgg.map(c => c.count), backgroundColor: categoryAgg.map(c => c.color), borderWidth: 0 }] }}
                      options={{ responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
                    {categoryAgg.map(c => {
                      const total = categoryAgg.reduce((s, x) => s + x.count, 0)
                      const pct = total ? Math.round(c.count / total * 100) : 0
                      return (
                        <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem' }}>
                          <span style={{ width: 9, height: 9, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                          <span style={{ color: '#0a2540', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.label}</span>
                          <span style={{ color: '#697386', fontWeight: 600 }}>{pct}% ({c.count}건)</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={card}>
            <div style={{ ...cardPad, paddingBottom: 6 }}><span style={sectionTitle}><i className="fa-solid fa-chart-line" style={{ color: BLUE }} /> 월별 발생 추이 <span style={{ fontSize: '0.7rem', fontWeight: 500, color: '#aab' }}>(최근 6개월)</span></span></div>
            <div style={{ padding: '14px 22px 22px', height: 200 }}>
              {trendMonths.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#aab', padding: '20px 0' }}>데이터가 없습니다.</div>
              ) : (
                <Line
                  data={{
                    labels: trendLabels,
                    datasets: [{ label: '발생 건수', data: trendCounts, borderColor: BLUE, backgroundColor: 'rgba(37,99,235,0.10)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: BLUE, borderWidth: 2 }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#8a94a6' } },
                      y: { beginAtZero: true, grid: { color: '#f0f4f8' }, ticks: { stepSize: 1, font: { size: 11 }, color: '#8a94a6' } },
                    },
                  }}
                />
              )}
            </div>
          </div>

          <div style={card}>
            <div style={{ ...cardPad, paddingBottom: 6 }}><span style={sectionTitle}><i className="fa-solid fa-shield-halved" style={{ color: RED }} /> 위험도 분포</span></div>
            <div style={{ padding: '10px 24px 24px', display: 'flex', alignItems: 'center', gap: 20 }}>
              {severityAgg.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#aab', padding: '20px 0' }}>데이터가 없습니다.</div>
              ) : (
                <>
                  <div style={{ width: 130, height: 130, flexShrink: 0 }}>
                    <Doughnut
                      data={{ labels: severityAgg.map(s => s.label), datasets: [{ data: severityAgg.map(s => s.count), backgroundColor: severityAgg.map(s => s.color), borderWidth: 0 }] }}
                      options={{ responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
                    {severityAgg.map(s => {
                      const total = severityAgg.reduce((sum, x) => sum + x.count, 0)
                      const pct = total ? Math.round(s.count / total * 100) : 0
                      return (
                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem' }}>
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                          <span style={{ color: '#0a2540', flex: 1 }}>{s.label}</span>
                          <span style={{ color: '#697386', fontWeight: 600 }}>{pct}% ({s.count}건)</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 4행 — AI 인사이트 & Action Plan */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 20 }}>
          <div style={{ ...card, background: 'linear-gradient(135deg, rgba(37,99,235,.05), rgba(37,99,235,.01))' }}>
            <div style={{ ...cardPad, paddingBottom: 16 }}>
              <span style={sectionTitle}><i className="fa-solid fa-wand-magic-sparkles" style={{ color: BLUE }} /> AI 인사이트 &amp; Action Plan</span>
            </div>
            <div style={{ padding: '0 24px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8a94a6', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>AI 종합의견</div>
                {actionPlan.headline.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#aab' }}>특이 인사이트가 없습니다.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {actionPlan.headline.map((line, i) => <div key={i} style={{ fontSize: '0.84rem', color: '#0a2540', lineHeight: 1.7 }}>{line}</div>)}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: BLUE, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>우선 개선사항</div>
                {topImprovements.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#aab' }}>즉시 조치가 필요한 항목이 없습니다.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {topImprovements.map((t, i) => <li key={i} style={{ fontSize: '0.8rem', color: '#425466', lineHeight: 1.65 }}>{t}</li>)}
                  </ul>
                )}
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: RED, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>예상 위험</div>
                {expectedRisks.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#aab' }}>예상되는 추가 위험이 없습니다.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {expectedRisks.map((t, i) => <li key={i} style={{ fontSize: '0.8rem', color: '#425466', lineHeight: 1.65 }}>{t}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <div style={{ ...cardPad, paddingBottom: 16 }}>
              <span style={{ ...sectionTitle, fontSize: '0.82rem' }}>예상 절감효과</span>
            </div>
            <div style={{ padding: '0 24px', textAlign: 'center' as const, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
              <div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: GREEN, letterSpacing: '-0.02em', wordBreak: 'keep-all' as const }}>{fmtKRW(savingsAmount)}</div>
                <div style={{ fontSize: '0.72rem', color: '#8a94a6', marginTop: 4 }}>이번 달 예상 절감효과</div>
              </div>
              <div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: BLUE }}>{savingsRate}%</div>
                <div style={{ fontSize: '0.72rem', color: '#8a94a6', marginTop: 4 }}>절감률</div>
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <Link
                href="/reports/ai"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 12, background: BLUE, color: '#fff', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none' }}
              >
                <i className="fa-solid fa-chart-pie" /> 상세 분석 보기
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
