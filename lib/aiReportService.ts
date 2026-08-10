import type { Defect, Category, Vendor, DefectFile, FloorPlan } from '@/lib/store'
import {
  isOverdue, isRecurring, needsTodayAction, getPaymentBadge, getDisplayCost, getCostBearerStatus,
  COST_ESTIMATED_COLOR, COST_CONFIRMED_COLOR, type StandardPeriodType,
} from '@/lib/designTokens'

// 보고서 전체가 참조하는 단일 비용 기준 — 확정비용(finalCost/totalCost)을 우선 사용하고,
// 아직 확정되지 않은 건은 등록 시 입력한 예상비용으로 대체한다(0원과 미입력은 구분).
function effCost(d: Defect): number { return getDisplayCost(d).amount ?? 0 }
function isCostConfirmed(d: Defect): boolean { return getDisplayCost(d).confirmed }
function hasNoCostInfo(d: Defect): boolean { return getDisplayCost(d).amount == null }
function fmtManLabeled(d: Defect): string {
  const { amount, confirmed } = getDisplayCost(d)
  if (amount == null) return '-'
  return confirmed ? fmtMan(amount) : `${fmtMan(amount)}(예상)`
}

export type ReportType = 'field-analysis' | 'budget-settlement' | 'executive-ppt' | 'recurring-defects' | 'cost-bearer' | 'defect-classification' | 'comprehensive-status'

// Dashboard/운영현황/보고서와 동일한 6종 기간 기준(designTokens.ts StandardPeriodType)을 그대로 쓴다.
export type ReportPeriodType = StandardPeriodType

export interface ReportPeriod {
  type: ReportPeriodType
  from: string | null
  to: string | null
  label: string
}

// ── Section types ──────────────────────────────────────────────────────────

export interface KpiItem { label: string; value: string; sub?: string; color?: string }
export interface BarItem { label: string; value: number; pct: number; sub?: string; color?: string }
export interface TableRow { cells: string[]; highlight?: boolean }
export interface Slide {
  slideNumber: number
  slideTitle: string
  items: { label: string; value: string; accent?: boolean }[]
  note?: string
}

export interface ReportSection {
  id: string
  title: string
  type: 'kpi-grid' | 'bar-list' | 'table' | 'slide-deck'
  kpiItems?: KpiItem[]
  barItems?: BarItem[]
  tableHeaders?: string[]
  tableRows?: TableRow[]
  slides?: Slide[]
}

export interface GeneratedReport {
  reportType: ReportType
  title: string
  subtitle: string
  period: string
  periodType: ReportPeriodType
  aggBasis: string
  periodFilenameSuffix: string
  generatedAt: string
  sections: ReportSection[]
  actionPlan: ActionPlanOpinion
  basedOn: 'rule-based' | 'llm'
  metadata: { totalDefects: number; completionRate: number; totalCost: number }
  preparedBy: string
}

export interface ReportInput {
  defects: Defect[]
  categories: Category[]
  vendors: Vendor[]
  files: DefectFile[]
  floorPlans: FloorPlan[]
  period: ReportPeriod
}

// ── Helper ─────────────────────────────────────────────────────────────────

// 만원/억원 단위로 반올림해서 보여주면 실제 확정 금액과 어긋나 보이므로, 원 단위 실금액을 그대로 표기한다.
function fmtMan(v: number): string {
  if (v > 0) return `${v.toLocaleString()}원`
  return '-'
}

function dateFieldFor(type: ReportType): (d: Defect) => string | null {
  if (type === 'budget-settlement' || type === 'cost-bearer') {
    return d => d.paymentCompletedAt ?? d.firstOccurredAt
  }
  return d => d.firstOccurredAt
}

function inPeriod(dateStr: string | null, period: ReportPeriod): boolean {
  if (!period.from && !period.to) return true
  if (!dateStr) return false
  const d = dateStr.slice(0, 10)
  if (period.from && d < period.from) return false
  if (period.to && d > period.to) return false
  return true
}

function filterDefectsForReport(type: ReportType, input: ReportInput): Defect[] {
  const dateOf = dateFieldFor(type)
  return input.defects.filter(d => inPeriod(dateOf(d), input.period))
}

function periodFilenameSuffix(period: ReportPeriod): string {
  if (period.type === 'all') return '전체기간'
  if (period.type === 'today') return period.from ?? '전체기간'
  if (period.type === 'year') return `${(period.from ?? '').slice(0, 4)}년`
  if (period.type === 'month') return `${(period.from ?? '').slice(0, 4)}-${(period.from ?? '').slice(5, 7)}`
  return `${period.from ?? ''}_${period.to ?? ''}` // week/custom
}

const AGG_BASIS_LABEL: Record<ReportType, string> = {
  'field-analysis':        '하자 발생일',
  'budget-settlement':     '결제 완료일 (없으면 하자 발생일)',
  'executive-ppt':         '하자 발생일',
  'recurring-defects':     '하자 발생일',
  'cost-bearer':           '결제 완료일 (없으면 하자 발생일)',
  'defect-classification': '하자 발생일',
  'comprehensive-status':  '하자 발생일',
}

// ── Action-Plan 종합의견 (대시보드 / 집계현황 공용) ─────────────────────────
// 표의 숫자를 그대로 읽어주는 요약을 금지하고, 반드시 "숫자 → 리스크/원인 → 조치 제안"
// 형태의 문장으로 구성한다. 규칙 기반이며, 추후 LLM 호출로 교체 가능하도록
// generateActionPlanOpinion() 하나만 교체하면 되게 분리해 둔다.

export interface ActionPlanOpinion {
  headline: string[]          // 핵심 판단 3줄
  immediateActions: string[]  // 오늘 처리해야 할 미완결 건
  costRisk: string[]          // 비용/결제 리스크
  recurringWarning: string[]  // 반복 발생 구역 경고
  approvalNeeded: string[]    // 관리자 결재/보고 필요 항목
}

export function generateActionPlanOpinion(defects: Defect[], files: DefectFile[], floorPlans: FloorPlan[], periodLabel?: string): ActionPlanOpinion {
  const prefix = periodLabel ? `${periodLabel} 기준` : '오늘'
  const open = defects.filter(d => d.status !== 'completed')
  const overdue = open.filter(isOverdue)
  const todayItems = open.filter(d => needsTodayAction(d))
  const recurring = open.filter(d => isRecurring(d))
  const actionDoneAwaiting = defects.filter(d => d.status === 'action_done')
  const unresolvedCost = open.filter(d => getCostBearerStatus(d) === '미정')
  const unpaid = defects.filter(d => effCost(d) > 0 && getPaymentBadge(d, files)?.tone !== 'success')

  // 구역(층)별 반복 집계 — 3회 이상 발생한 구역을 "반복 위험 구역"으로 판단
  const zoneCounts: Record<string, { count: number; vendorNames: Set<number> }> = {}
  defects.forEach(d => {
    const fp = floorPlans.find(f => f.id === d.floorPlanId)
    if (!fp) return
    const key = fp.name
    if (!zoneCounts[key]) zoneCounts[key] = { count: 0, vendorNames: new Set() }
    zoneCounts[key].count++
    if (d.assignedVendorId) zoneCounts[key].vendorNames.add(d.assignedVendorId)
  })
  const riskZones = Object.entries(zoneCounts).filter(([, v]) => v.count >= 3).sort((a, b) => b[1].count - a[1].count)

  const ownCostTotal = defects
    .filter(d => getCostBearerStatus(d) === '재단')
    .reduce((s, d) => s + effCost(d), 0)

  const headline: string[] = []
  if (todayItems.length > 0) {
    headline.push(`${prefix} 우선처리 대상은 ${overdue.length > 0 ? `지연 ${overdue.length}건` : ''}${overdue.length > 0 && unresolvedCost.length > 0 ? ', ' : ''}${unresolvedCost.length > 0 ? `비용부담 미정 ${unresolvedCost.length}건` : ''}${overdue.length === 0 && unresolvedCost.length === 0 ? `${todayItems.length}건` : ''}이며, 우선순위대로 처리하지 않으면 지연이 누적됩니다.`)
  } else {
    headline.push(`${prefix} 시급하게 처리할 미완결 건은 없습니다.`)
  }
  if (riskZones.length > 0) {
    const [zoneName, zoneInfo] = riskZones[0]
    headline.push(`${zoneName}에서 하자가 ${zoneInfo.count}회 이상 반복 발생해 동일 구역에 구조적 원인이 있는지 재점검이 필요합니다.`)
  }
  if (unpaid.length > 0) {
    headline.push(`결제·증빙이 끝나지 않은 건이 ${unpaid.length}건 있어 이번 달 비용 정산이 지연될 수 있습니다.`)
  } else if (headline.length < 3) {
    headline.push('결제·증빙 미완료 건은 없어 이번 달 비용 정산 리스크는 낮습니다.')
  }

  const immediateActions: string[] = []
  if (overdue.length > 0) immediateActions.push(`지연 중인 ${overdue.length}건은 처리 기한을 초과했으므로 담당자 배정 및 업체 방문 일정을 즉시 재조율해야 합니다.`)
  if (actionDoneAwaiting.length > 0) immediateActions.push(`조치완료 요청이 올라온 ${actionDoneAwaiting.length}건은 관리자 최종 확인 대기 중이며, 승인이 늦어지면 종결 처리가 밀립니다.`)
  if (recurring.length > 0) immediateActions.push(`재발 이력이 있는 ${recurring.length}건은 동일 원인 재발 가능성이 높아 조치 전/후 사진과 조치 내용을 비교 확인해야 합니다.`)

  const costRisk: string[] = []
  if (unresolvedCost.length > 0) costRisk.push(`비용 부담 주체가 미정인 ${unresolvedCost.length}건은 최종완료 처리가 불가능한 상태이므로, 시공사·재단·외주업체 중 귀책 판단을 먼저 확정해야 합니다.`)
  if (unpaid.length > 0) costRisk.push(`결제수단 또는 증빙이 누락된 ${unpaid.length}건은 회계 정산 시 반려될 수 있어, 법인카드/계좌이체 등 결제 수단과 증빙 서류를 먼저 확보해야 합니다.`)
  if (ownCostTotal > 0) costRisk.push(`우리측(재단) 부담 누적 비용이 ${fmtMan(ownCostTotal)}에 달해, 예산 초과가 우려되면 조기에 경영진 보고가 필요합니다.`)

  const recurringWarning: string[] = riskZones.slice(0, 3).map(([zoneName, v]) =>
    `${zoneName} — 누적 ${v.count}건 발생${v.vendorNames.size === 1 ? ' (동일 외주업체 조치 후 재발 이력 있음, 시공 품질 재검토 필요)' : ''}.`
  )

  const approvalNeeded: string[] = []
  if (actionDoneAwaiting.length > 0) approvalNeeded.push(`조치완료 승인 대기 ${actionDoneAwaiting.length}건 — 관리자 최종완료 승인 필요.`)
  if (unresolvedCost.length > 0) approvalNeeded.push(`비용 부담 주체 확정 대기 ${unresolvedCost.length}건 — 관리자 확정 필요.`)
  const highRiskUnclassified = defects.filter(d => d.status !== 'completed' && (d.severity === 'critical' || d.severity === 'high') && (d.defectType ?? '확인 필요') === '확인 필요')
  if (highRiskUnclassified.length > 0) approvalNeeded.push(`고위험(긴급/높음) 등급인데 하자구분이 미확정인 ${highRiskUnclassified.length}건 — 경영진 보고 전 하자사항/일반사항 구분 확정 필요.`)

  return {
    headline: headline.slice(0, 3),
    immediateActions,
    costRisk,
    recurringWarning,
    approvalNeeded,
  }
}

// ── AI 종합의견 (보고서 유형별 Action-Plan) — 숫자만 나열하는 대신, 보고서 유형에
// 맞는 하자 범위를 골라 generateActionPlanOpinion() 하나로 위임한다(중복 생성기 방지).

function opinionScopeFor(type: ReportType, defects: Defect[]): Defect[] {
  if (type === 'recurring-defects') {
    return defects.filter(d => d.recurrenceCount > 0 || d.recurringLevel === '반복 확정' || d.recurringLevel === '반복 의심')
  }
  return defects
}

// ── Section builders ───────────────────────────────────────────────────────

function buildFieldAnalysisSections(input: ReportInput): ReportSection[] {
  const { defects, categories } = input
  const total = defects.length

  const catData = categories.map(c => {
    const cDefs = defects.filter(d => d.categoryId === c.id)
    const done = cDefs.filter(d => d.status === 'completed').length
    const cost = cDefs.reduce((s, d) => s + effCost(d), 0)
    const recurred = cDefs.filter(d => d.recurrenceCount > 0).length
    const rate = cDefs.length > 0 ? Math.round(done / cDefs.length * 100) : 0
    return { ...c, count: cDefs.length, done, cost, recurred, rate }
  }).sort((a, b) => b.count - a.count)

  const maxCount = Math.max(1, ...catData.map(c => c.count))

  return [
    {
      id: 'kpi', title: '분야별 현황 요약', type: 'kpi-grid',
      kpiItems: catData.map(c => ({
        label: c.name, value: `${c.count}건`,
        sub: `완료율 ${c.rate}% · 재발 ${c.recurred}건`, color: c.color,
      })),
    },
    {
      id: 'freq', title: '분야별 발생 빈도', type: 'bar-list',
      barItems: catData.map(c => ({
        label: c.name, value: c.count,
        pct: Math.round(c.count / maxCount * 100),
        sub: total > 0 ? `전체의 ${Math.round(c.count / total * 100)}%` : '',
        color: c.color,
      })),
    },
    {
      id: 'cost-table', title: '분야별 비용 분석', type: 'table',
      tableHeaders: ['분야', '하자 건수', '총 처리 비용', '건당 평균', '재발 건수', '완료율'],
      tableRows: catData.map((c, i) => ({
        cells: [
          c.name, `${c.count}건`,
          c.cost > 0 ? fmtMan(c.cost) : '-',
          c.count > 0 && c.cost > 0 ? fmtMan(Math.round(c.cost / c.count)) : '-',
          c.recurred > 0 ? `${c.recurred}건` : '-',
          `${c.rate}%`,
        ],
        highlight: i === 0,
      })),
    },
  ]
}

function buildBudgetSections(input: ReportInput): ReportSection[] {
  const { defects, categories } = input
  const totalCost = defects.reduce((s, d) => s + effCost(d), 0)
  const confirmedCost = defects.reduce((s, d) => s + (isCostConfirmed(d) ? effCost(d) : 0), 0)
  const pendingEstimatedCost = totalCost - confirmedCost
  const total = defects.length

  const monthMap: Record<string, { count: number; cost: number }> = {}
  defects.forEach(d => {
    const m = d.firstOccurredAt?.slice(0, 7)
    if (!m) return
    if (!monthMap[m]) monthMap[m] = { count: 0, cost: 0 }
    monthMap[m].count++
    monthMap[m].cost += effCost(d)
  })
  const months = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
  const maxMonthlyCost = Math.max(1, ...months.map(([, v]) => v.cost))

  const catCosts = categories.map(c => {
    const cDefs = defects.filter(d => d.categoryId === c.id && effCost(d) > 0)
    const cost = cDefs.reduce((s, d) => s + effCost(d), 0)
    const predCost = cDefs.filter(d => d.predictedCostAvg).reduce((s, d) => s + (d.predictedCostAvg ?? 0), 0)
    return { ...c, cost, count: cDefs.length, predCost }
  }).sort((a, b) => b.cost - a.cost)

  const predDefs = defects.filter(d => d.predictedCostAvg && effCost(d) > 0 && d.predictionErrorRate != null)

  return [
    {
      id: 'budget-kpi', title: '예산 집행 요약', type: 'kpi-grid',
      kpiItems: [
        { label: '총 누적 처리 비용', value: fmtMan(totalCost), color: '#635bff' },
        { label: '· 확정', value: fmtMan(confirmedCost), color: COST_CONFIRMED_COLOR.text },
        { label: '· 예상(미확정)', value: fmtMan(pendingEstimatedCost), color: COST_ESTIMATED_COLOR.text },
        { label: '건당 평균 처리 비용', value: total > 0 && totalCost > 0 ? fmtMan(Math.round(totalCost / total)) : '-', color: '#059669' },
        { label: '비용 정보 미입력 건수', value: `${defects.filter(hasNoCostInfo).length}건`, color: '#d97706' },
        { label: 'AI 예측 적용 건수', value: `${predDefs.length}건`, color: '#635bff' },
      ],
    },
    {
      id: 'cat-cost', title: '분야별 비용 집행 현황', type: 'table',
      tableHeaders: ['분야', '처리 건수', '총 비용', '건당 평균', 'AI 예측비용', '예측 오차'],
      tableRows: catCosts.map((c, i) => ({
        cells: [
          c.name, `${c.count}건`,
          c.cost > 0 ? fmtMan(c.cost) : '-',
          c.count > 0 && c.cost > 0 ? fmtMan(Math.round(c.cost / c.count)) : '-',
          c.predCost > 0 ? fmtMan(Math.round(c.predCost)) : '-',
          c.predCost > 0 && c.cost > 0 ? `${Math.round(Math.abs(c.cost - c.predCost) / c.cost * 100)}%` : '-',
        ],
        highlight: i === 0,
      })),
    },
    {
      id: 'monthly', title: '월별 비용 추이 (최근 6개월)', type: 'bar-list',
      barItems: months.map(([month, v]) => ({
        label: month.replace('-', '년 ') + '월',
        value: v.cost,
        pct: Math.round(v.cost / maxMonthlyCost * 100),
        sub: `${v.count}건`,
        color: '#635bff',
      })),
    },
  ]
}

function buildExecutiveSections(input: ReportInput): ReportSection[] {
  const { defects, categories, vendors } = input
  const total = defects.length
  const completed = defects.filter(d => d.status === 'completed').length
  const inProgress = defects.filter(d => d.status === 'in_progress').length
  const open = defects.filter(d => d.status === 'open').length
  const completionRate = total > 0 ? Math.round(completed / total * 100) : 0
  const totalCost = defects.reduce((s, d) => s + effCost(d), 0)
  const pendingEstimatedCost = defects.reduce((s, d) => s + (isCostConfirmed(d) ? 0 : effCost(d)), 0)
  const openCriticals = defects.filter(d => d.severity === 'critical' && d.status !== 'completed')
  const recurring = defects.filter(d => d.recurrenceCount > 0)

  const healthScore = Math.max(0, Math.min(100,
    completionRate * 0.4 +
    (openCriticals.length === 0 ? 100 : Math.max(0, 100 - openCriticals.length * 25)) * 0.35 +
    (recurring.length === 0 ? 100 : Math.max(0, 100 - recurring.length * 10)) * 0.25
  ))
  const healthLabel = healthScore >= 80 ? '양호' : healthScore >= 60 ? '보통' : '주의 필요'

  const catWithCount = categories.map(c => ({
    ...c, count: defects.filter(d => d.categoryId === c.id).length,
    cost: defects.filter(d => d.categoryId === c.id).reduce((s, d) => s + effCost(d), 0),
  }))
  const topCat = catWithCount.slice().sort((a, b) => b.count - a.count)[0]
  const maxCatCount = Math.max(1, ...catWithCount.map(c => c.count))
  const monthsCount = new Set(defects.filter(d => d.firstOccurredAt).map(d => d.firstOccurredAt!.slice(0, 7))).size || 1
  const annualEst = Math.round(totalCost / monthsCount * 12)

  const slides: Slide[] = [
    {
      slideNumber: 1, slideTitle: '시설 관리 종합 현황',
      items: [
        { label: '전체 하자 건수', value: `${total}건` },
        { label: '처리 완료', value: `${completed}건 (${completionRate}%)`, accent: completionRate >= 70 },
        { label: '처리 중', value: `${inProgress}건` },
        { label: '신규 접수', value: `${open}건`, accent: open > 5 },
        { label: '시설 건강도', value: `${Math.round(healthScore)}점 (${healthLabel})`, accent: healthScore >= 70 },
      ],
    },
    {
      slideNumber: 2, slideTitle: '주요 위험 요소',
      note: openCriticals.length > 0 ? '⚠️ 즉각 관심 요망' : undefined,
      items: [
        { label: '긴급 미처리 하자', value: `${openCriticals.length}건`, accent: openCriticals.length > 0 },
        { label: '재발 하자 건수', value: `${recurring.length}건`, accent: recurring.length > 0 },
        { label: '고위험 하자 합계', value: `${defects.filter(d => d.severity === 'critical' || d.severity === 'high').length}건` },
        { label: '집중 위험 분야', value: topCat?.name ?? '-', accent: true },
        { label: '즉시 조치 필요', value: openCriticals.length > 0 ? `${openCriticals.length}건 처리 지시 권고` : '해당 없음' },
      ],
    },
    {
      slideNumber: 3, slideTitle: '분야별 분석',
      items: catWithCount.map(c => ({
        label: c.name,
        value: `${c.count}건 · ${c.cost > 0 ? fmtMan(c.cost) : '비용 미집행'}`,
        accent: c.count === maxCatCount,
      })),
    },
    {
      slideNumber: 4, slideTitle: '예산 집행 현황',
      items: [
        { label: '총 누적 처리 비용', value: fmtMan(totalCost), accent: true },
        { label: '· 예상(미확정) 포함', value: pendingEstimatedCost > 0 ? fmtMan(pendingEstimatedCost) : '없음' },
        { label: '건당 평균 처리 비용', value: total > 0 && totalCost > 0 ? fmtMan(Math.round(totalCost / total)) : '-' },
        { label: '협력업체 수', value: `${vendors.length}개사` },
        { label: 'AI 예측 적용', value: `${defects.filter(d => d.predictedCostAvg).length}건` },
      ],
    },
    {
      slideNumber: 5, slideTitle: '권고사항 및 향후 계획',
      items: [
        { label: '즉시 조치', value: openCriticals.length > 0 ? `긴급 하자 ${openCriticals.length}건 처리` : '긴급 사항 없음', accent: openCriticals.length > 0 },
        { label: '단기 (1개월)', value: `미처리 하자 ${open}건 우선순위 재검토` },
        { label: '중기 (3개월)', value: `${topCat?.name ?? ''} 분야 예방 점검 강화` },
        { label: '장기 (6개월)', value: 'AI 기반 예방 정비 체계 고도화' },
        { label: '예산 확보 권고', value: `${fmtMan(Math.round(annualEst * 1.1))} 이상` },
      ],
    },
  ]

  return [{ id: 'slides', title: '경영진 보고 슬라이드 (5장)', type: 'slide-deck', slides }]
}

function buildRecurringSections(input: ReportInput): ReportSection[] {
  const { defects } = input
  const recurring = defects
    .filter(d => d.recurrenceCount > 0 || d.recurringLevel === '반복 확정' || d.recurringLevel === '반복 의심')
    .sort((a, b) => b.recurrenceCount - a.recurrenceCount)
  const confirmed = defects.filter(d => d.recurringLevel === '반복 확정' || d.recurrenceCount > 0).length
  const suspected = defects.filter(d => d.recurringLevel === '반복 의심').length
  const recurringCost = recurring.reduce((s, d) => s + effCost(d), 0)

  return [
    {
      id: 'recurring-kpi', title: '반복 하자 현황', type: 'kpi-grid',
      kpiItems: [
        { label: '반복 확정', value: `${confirmed}건`, color: '#be1044' },
        { label: '반복 의심', value: `${suspected}건`, color: '#d97706' },
        { label: '관련 누적 비용', value: fmtMan(recurringCost), color: '#635bff' },
        { label: '전체 대비 비율', value: defects.length > 0 ? `${Math.round(recurring.length / defects.length * 100)}%` : '0%' },
      ],
    },
    {
      id: 'recurring-table', title: '반복 하자 목록', type: 'table',
      tableHeaders: ['케이스번호', '하자명', '반복 상태', '재발 횟수', '누적 비용'],
      tableRows: recurring.slice(0, 20).map((d, i) => ({
        cells: [d.caseNumber, d.title, d.recurringLevel ?? (d.recurrenceCount > 0 ? '반복 확정' : '반복 의심'), `${d.recurrenceCount}회`, fmtManLabeled(d)],
        highlight: i === 0,
      })),
    },
  ]
}

function buildCostBearerSections(input: ReportInput): ReportSection[] {
  const { defects } = input
  const bearers = ['시공사', '재단', '외주업체', '사용자', '보험/기타', '미정']
  const data = bearers.map(b => ({
    name: b,
    count: defects.filter(d => getCostBearerStatus(d) === b).length,
    cost: defects.filter(d => getCostBearerStatus(d) === b).reduce((s, d) => s + effCost(d), 0),
  }))
  const maxCount = Math.max(1, ...data.map(b => b.count))
  const totalCost = defects.reduce((s, d) => s + effCost(d), 0)
  const pendingEstimatedCost = defects.reduce((s, d) => s + (isCostConfirmed(d) ? 0 : effCost(d)), 0)

  return [
    {
      id: 'bearer-kpi', title: '비용 부담 주체 요약', type: 'kpi-grid',
      kpiItems: [
        { label: '총 누적 처리 비용', value: fmtMan(totalCost), color: '#635bff' },
        { label: '· 예상(미확정)', value: fmtMan(pendingEstimatedCost), color: COST_ESTIMATED_COLOR.text },
        ...data.filter(b => b.name !== '미정').slice(0, 3).map(b => ({ label: `${b.name} 부담`, value: fmtMan(b.cost) })),
      ],
    },
    {
      id: 'bearer-bar', title: '주체별 건수 분포', type: 'bar-list',
      barItems: data.map(b => ({
        label: b.name, value: b.count, pct: Math.round(b.count / maxCount * 100),
        sub: fmtMan(b.cost), color: b.name === '미정' ? '#e11d48' : '#635bff',
      })),
    },
    {
      id: 'bearer-table', title: '주체별 상세 집계', type: 'table',
      tableHeaders: ['부담 주체', '건수', '누적 비용'],
      tableRows: data.map(b => ({ cells: [b.name, `${b.count}건`, b.cost > 0 ? fmtMan(b.cost) : '-'], highlight: b.name === '미정' && b.count > 0 })),
    },
  ]
}

function buildClassificationSections(input: ReportInput): ReportSection[] {
  const { defects } = input
  const types = ['하자사항', '일반사항', '확인 필요'] as const
  const typeData = types.map(t => ({ name: t, count: defects.filter(d => (d.defectType ?? '확인 필요') === t).length }))
  const maxTypeCount = Math.max(1, ...typeData.map(t => t.count))

  const contractorList = defects.filter(d => d.responsibilityType === '시공사 귀책')
  const foundationList = defects.filter(d => getCostBearerStatus(d) === '재단')
  const vendorList = defects.filter(d => getCostBearerStatus(d) === '외주업체')

  return [
    {
      id: 'class-bar', title: '하자사항/일반사항/확인필요 비율', type: 'bar-list',
      barItems: typeData.map(t => ({
        label: t.name, value: t.count, pct: Math.round(t.count / maxTypeCount * 100),
        color: t.name === '하자사항' ? '#e11d48' : t.name === '일반사항' ? '#059669' : '#697386',
      })),
    },
    {
      id: 'contractor-table', title: '시공사 귀책 가능 하자 목록', type: 'table',
      tableHeaders: ['케이스번호', '하자명', '누적 비용'],
      tableRows: contractorList.slice(0, 10).map(d => ({ cells: [d.caseNumber, d.title, fmtManLabeled(d)] })),
    },
    {
      id: 'foundation-table', title: '재단 부담 예상 하자 목록', type: 'table',
      tableHeaders: ['케이스번호', '하자명', '누적 비용'],
      tableRows: foundationList.slice(0, 10).map(d => ({ cells: [d.caseNumber, d.title, fmtManLabeled(d)] })),
    },
    {
      id: 'vendor-table', title: '외주업체 확인 필요 하자 목록', type: 'table',
      tableHeaders: ['케이스번호', '하자명', '누적 비용'],
      tableRows: vendorList.slice(0, 10).map(d => ({ cells: [d.caseNumber, d.title, fmtManLabeled(d)] })),
    },
  ]
}

// ── Entry point (swap mockGenerate → realGenerate for LLM) ────────────────

export async function generateReport(type: ReportType, input: ReportInput): Promise<GeneratedReport> {
  await new Promise<void>(r => setTimeout(r, 900))
  return mockGenerate(type, input)
  // 실제 LLM 전환 시: return realGenerate(type, input)
}

function mockGenerate(type: ReportType, input: ReportInput): GeneratedReport {
  const now = new Date()
  const TITLES: Record<ReportType, [string, string]> = {
    'field-analysis':         ['분야별 분석 보고서',        '카테고리별 하자 발생 현황 및 비용 분석'],
    'budget-settlement':      ['예산 정산 보고서',          '처리 비용 집행 현황 및 AI 예측 정확도 분석'],
    'executive-ppt':          ['경영진 보고용 PT',          '시설 관리 종합 현황 및 전략적 권고사항'],
    'recurring-defects':      ['반복 하자 보고서',          '반복 발생 하자 현황 및 근본원인 재점검 권고'],
    'cost-bearer':            ['비용 부담 주체별 보고서',    '시공사·재단·외주업체 부담 예상 금액 및 미정 현황'],
    'defect-classification':  ['하자사항/일반사항 구분 보고서', '귀책 구분 및 관리자 검토 필요 항목'],
    // '보고서'(/reports) 화면 전용 — mockGenerate()로 생성되지 않고 app/reports/page.tsx가
    // GeneratedReport를 직접 조립할 때만 쓰인다. Record<ReportType,...> 완전성을 위해 추가.
    'comprehensive-status':   ['시설 하자관리 종합 현황 보고서', '기간·카테고리·상태별 통합 현황 분석'],
  }
  const [title, subtitle] = TITLES[type]
  const scopedDefects = filterDefectsForReport(type, input)
  const scopedInput: ReportInput = { ...input, defects: scopedDefects }
  const actionPlan = generateActionPlanOpinion(opinionScopeFor(type, scopedDefects), input.files, input.floorPlans, input.period.label)
  const sections =
    type === 'field-analysis'        ? buildFieldAnalysisSections(scopedInput) :
    type === 'budget-settlement'     ? buildBudgetSections(scopedInput) :
    type === 'recurring-defects'     ? buildRecurringSections(scopedInput) :
    type === 'cost-bearer'           ? buildCostBearerSections(scopedInput) :
    type === 'defect-classification' ? buildClassificationSections(scopedInput) :
    buildExecutiveSections(scopedInput)

  return {
    reportType: type, title, subtitle,
    period: input.period.label,
    periodType: input.period.type,
    aggBasis: AGG_BASIS_LABEL[type],
    periodFilenameSuffix: periodFilenameSuffix(input.period),
    generatedAt: now.toLocaleString('ko-KR'),
    sections,
    actionPlan,
    basedOn: 'rule-based',
    preparedBy: '시설관리팀',
    metadata: {
      totalDefects: scopedDefects.length,
      completionRate: scopedDefects.length > 0
        ? Math.round(scopedDefects.filter(d => d.status === 'completed').length / scopedDefects.length * 100)
        : 0,
      totalCost: scopedDefects.reduce((s, d) => s + effCost(d), 0),
    },
  }
}

// async function realGenerate(type: ReportType, input: ReportInput): Promise<GeneratedReport> {
//   const Anthropic = (await import('@anthropic-ai/sdk')).default
//   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
//   const msg = await client.messages.create({
//     model: 'claude-sonnet-4-6', max_tokens: 4096,
//     messages: [{ role: 'user', content: buildLLMPrompt(type, input) }],
//   })
//   return parseLLMResponse(type, (msg.content[0] as { text: string }).text, input)
// }
