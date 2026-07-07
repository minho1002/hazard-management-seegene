import type { Defect, Category, Vendor } from '@/lib/store'

export type ReportType = 'field-analysis' | 'budget-settlement' | 'executive-ppt' | 'recurring-defects' | 'cost-bearer' | 'defect-classification'

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
  generatedAt: string
  sections: ReportSection[]
  aiOpinion: string
  aiOpinionBullets: string[]
  basedOn: 'rule-based' | 'llm'
  metadata: { totalDefects: number; completionRate: number; totalCost: number }
  preparedBy: string
}

export interface ReportInput {
  defects: Defect[]
  categories: Category[]
  vendors: Vendor[]
}

// ── Helper ─────────────────────────────────────────────────────────────────

function fmtMan(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`
  if (v >= 10_000) return `${Math.round(v / 10_000)}만원`
  if (v > 0) return `${v.toLocaleString()}원`
  return '-'
}

// ── AI Opinion (rule-based — swap body for LLM call to change provider) ────

function generateAiOpinion(type: ReportType, input: ReportInput): { opinion: string; bullets: string[] } {
  const { defects, categories } = input
  const total = defects.length
  const completed = defects.filter(d => d.status === 'completed').length
  const completionRate = total > 0 ? Math.round(completed / total * 100) : 0
  const totalCost = defects.reduce((s, d) => s + d.totalCost, 0)
  const highRisk = defects.filter(d => d.severity === 'critical' || d.severity === 'high')
  const openCriticals = defects.filter(d => d.severity === 'critical' && d.status !== 'completed')
  const recurring = defects.filter(d => d.recurrenceCount > 0)

  const catCounts = categories.map(c => ({
    ...c,
    count: defects.filter(d => d.categoryId === c.id).length,
    recurred: defects.filter(d => d.categoryId === c.id && d.recurrenceCount > 0).length,
  })).sort((a, b) => b.count - a.count)
  const topCat = catCounts[0]
  const topPct = total > 0 && topCat ? Math.round(topCat.count / total * 100) : 0

  if (type === 'field-analysis') {
    return {
      opinion: `분야별 분석 결과, ${topCat?.name ?? '주요'} 분야가 전체 하자의 ${topPct}%를 차지하며 가장 높은 발생 빈도를 보입니다. 처리 완료율 ${completionRate}%, 고위험 하자 ${highRisk.length}건으로 집중 관리가 필요합니다.`,
      bullets: [
        `${topCat?.name ?? ''} 분야 집중 발생 (전체의 ${topPct}%) — 원인 분석 및 예방 조치 강화 권고`,
        completionRate < 70
          ? `처리 완료율 ${completionRate}% — 미처리 하자 우선순위 재검토 필요`
          : `처리 완료율 ${completionRate}% — 양호 수준, 지속 모니터링 권고`,
        highRisk.length > 0
          ? `긴급·고위험 하자 ${highRisk.length}건 — 즉시 처리 또는 전문업체 투입 검토`
          : '현재 긴급 위험 하자 없음 — 예방적 점검 체계 유지',
        catCounts.filter(c => c.recurred > 0).length > 0
          ? `재발 이력 분야: ${catCounts.filter(c => c.recurred > 0).map(c => c.name).join(', ')} — 근본원인 재점검 권고`
          : '재발 이력 하자 없음 — 현재 관리 체계 유지',
      ],
    }
  }

  if (type === 'budget-settlement') {
    const monthsWithData = new Set(
      defects.filter(d => d.firstOccurredAt).map(d => d.firstOccurredAt!.slice(0, 7))
    ).size || 1
    const avgMonthly = Math.round(totalCost / monthsWithData)
    const predDefs = defects.filter(d => d.predictedCostAvg && d.totalCost > 0 && d.predictionErrorRate != null)
    const avgErr = predDefs.length > 0
      ? Math.round(predDefs.reduce((s, d) => s + (d.predictionErrorRate ?? 0), 0) / predDefs.length)
      : null
    return {
      opinion: `총 누적 처리 비용 ${fmtMan(totalCost)}, 건당 평균 ${fmtMan(total > 0 ? Math.round(totalCost / total) : 0)}으로 집계됩니다. 월평균 ${fmtMan(avgMonthly)} 수준의 유지보수 비용이 지속 발생하고 있어 연간 예산 계획 수립 시 참고가 필요합니다.`,
      bullets: [
        `총 누적 처리 비용: ${fmtMan(totalCost)} (건당 평균 ${fmtMan(total > 0 ? Math.round(totalCost / total) : 0)})`,
        `월평균 유지보수 비용: ${fmtMan(avgMonthly)} → 연간 예상 ${fmtMan(avgMonthly * 12)} 필요`,
        avgErr !== null
          ? `AI 비용 예측 평균 오차율: ${avgErr}% — ${avgErr < 20 ? '예측 신뢰도 양호' : '예측 정확도 개선 필요'}`
          : 'AI 비용 예측 데이터 없음 — 하자 등록 시 AI 분석 활성화 권고',
        `비용 미입력 하자 ${defects.filter(d => d.totalCost === 0).length}건 — 처리 비용 입력 완료 여부 확인 권고`,
      ],
    }
  }

  if (type === 'recurring-defects') {
    const recurring = defects.filter(d => d.recurrenceCount > 0 || d.recurringLevel === '반복 확정' || d.recurringLevel === '반복 의심')
    const confirmed = defects.filter(d => d.recurringLevel === '반복 확정' || d.recurrenceCount > 0)
    const recurringCost = recurring.reduce((s, d) => s + d.totalCost, 0)
    return {
      opinion: `전체 ${total}건 중 ${recurring.length}건이 반복 발생 하자로 분류되며(확정 ${confirmed.length}건), 관련 누적 비용은 ${fmtMan(recurringCost)}입니다. 반복 하자는 근본 원인 미해결 가능성이 높아 우선 점검이 필요합니다.`,
      bullets: [
        `반복 하자 ${recurring.length}건 (확정 ${confirmed.length}건) — 전체의 ${total > 0 ? Math.round(recurring.length / total * 100) : 0}%`,
        `반복 하자 관련 누적 비용: ${fmtMan(recurringCost)} — 근본 원인 해결 시 비용 절감 가능`,
        recurring.length > 0
          ? `최다 재발 건: ${recurring.slice().sort((a, b) => b.recurrenceCount - a.recurrenceCount)[0]?.title ?? ''} — 우선 정밀점검 권고`
          : '현재 반복 발생 하자 없음',
        '반복 확정/해제는 관리자 검토를 거쳐야 하며, 확인되지 않은 반복 의심 건은 재점검 권고',
      ],
    }
  }

  if (type === 'cost-bearer') {
    const unresolved = defects.filter(d => !d.costBearer || d.costBearer === '미정')
    const byBearer = ['시공사', '재단', '외주업체'].map(b => ({
      name: b, cost: defects.filter(d => d.costBearer === b).reduce((s, d) => s + d.totalCost, 0),
    }))
    const topBearer = byBearer.slice().sort((a, b) => b.cost - a.cost)[0]
    return {
      opinion: `비용 부담 주체가 확정된 하자의 부담 금액은 ${topBearer && topBearer.cost > 0 ? `${topBearer.name} ${fmtMan(topBearer.cost)}이 최대` : '아직 뚜렷한 경향이 없음'}이며, 비용 부담 미정 건이 ${unresolved.length}건 남아있어 확정 작업이 필요합니다.`,
      bullets: [
        `비용 부담 미정 ${unresolved.length}건 — 관리자 확정 필요(최종완료 처리 전 확정 필수)`,
        ...byBearer.filter(b => b.cost > 0).map(b => `${b.name} 부담 예상 금액: ${fmtMan(b.cost)}`),
        unresolved.length > total * 0.3
          ? '비용 부담 미정 비율이 높음 — 하자구분/귀책판단 단계 검토 지연 여부 확인 권고'
          : '비용 부담 확정 진행률 양호',
      ],
    }
  }

  if (type === 'defect-classification') {
    const defectType = defects.filter(d => d.defectType === '하자사항').length
    const generalType = defects.filter(d => d.defectType === '일반사항').length
    const unclassified = defects.filter(d => (d.defectType ?? '확인 필요') === '확인 필요').length
    const disputed = defects.filter(d => d.reviewStatus === '분쟁가능' || d.reviewStatus === '이견있음').length
    return {
      opinion: `전체 ${total}건 중 하자사항 ${defectType}건, 일반사항 ${generalType}건, 확인 필요 ${unclassified}건으로 분류됩니다. 분쟁 가능 또는 이견 있는 건이 ${disputed}건 있어 우선 검토가 필요합니다.`,
      bullets: [
        `하자사항(시공사 귀책 가능) ${defectType}건 — 시공사 하자보수 요청 검토`,
        `일반사항(재단/외주업체 부담) ${generalType}건`,
        `확인 필요 ${unclassified}건 — 관리자 검토 후 구분 확정 필요`,
        disputed > 0
          ? `분쟁 가능/이견 있음 ${disputed}건 — 우선 검토 및 협의 필요`
          : '분쟁 가능 건 없음 — 양호',
      ],
    }
  }

  // executive-ppt
  const healthScore = Math.max(0, Math.min(100,
    completionRate * 0.4 +
    (openCriticals.length === 0 ? 100 : Math.max(0, 100 - openCriticals.length * 25)) * 0.35 +
    (recurring.length === 0 ? 100 : Math.max(0, 100 - recurring.length * 10)) * 0.25
  ))
  const healthLabel = healthScore >= 80 ? '양호' : healthScore >= 60 ? '보통' : '주의 필요'
  const monthsData = new Set(
    defects.filter(d => d.firstOccurredAt).map(d => d.firstOccurredAt!.slice(0, 7))
  ).size || 1
  return {
    opinion: `시설 관리 종합 평가 결과 건강도 점수 ${Math.round(healthScore)}점(${healthLabel}) 수준입니다. 전체 ${total}건 중 ${completed}건(${completionRate}%) 처리 완료, 누적 비용 ${fmtMan(totalCost)}이 집행되었습니다.`,
    bullets: [
      `시설 건강도: ${Math.round(healthScore)}점 (${healthLabel}) — 처리율·위험도·재발률 종합 산출`,
      openCriticals.length > 0
        ? `미처리 긴급 하자 ${openCriticals.length}건 — 즉각적 자원 배분 필요`
        : '긴급 미처리 하자 없음 — 위험 관리 양호',
      `연간 예상 유지보수 비용: ${fmtMan(Math.round(totalCost / monthsData * 12))} — 예산 확보 권고`,
      recurring.length > 0
        ? `재발 하자 ${recurring.length}건 — AI 기반 예방 정비 전환으로 비용 절감 가능`
        : '재발 하자 없음 — 예방 정비 체계 유지 권고',
    ],
  }
}

// ── Section builders ───────────────────────────────────────────────────────

function buildFieldAnalysisSections(input: ReportInput): ReportSection[] {
  const { defects, categories } = input
  const total = defects.length

  const catData = categories.map(c => {
    const cDefs = defects.filter(d => d.categoryId === c.id)
    const done = cDefs.filter(d => d.status === 'completed').length
    const cost = cDefs.reduce((s, d) => s + d.totalCost, 0)
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
  const totalCost = defects.reduce((s, d) => s + d.totalCost, 0)
  const total = defects.length

  const monthMap: Record<string, { count: number; cost: number }> = {}
  defects.forEach(d => {
    const m = d.firstOccurredAt?.slice(0, 7)
    if (!m) return
    if (!monthMap[m]) monthMap[m] = { count: 0, cost: 0 }
    monthMap[m].count++
    monthMap[m].cost += d.totalCost
  })
  const months = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
  const maxMonthlyCost = Math.max(1, ...months.map(([, v]) => v.cost))

  const catCosts = categories.map(c => {
    const cDefs = defects.filter(d => d.categoryId === c.id && d.totalCost > 0)
    const cost = cDefs.reduce((s, d) => s + d.totalCost, 0)
    const predCost = cDefs.filter(d => d.predictedCostAvg).reduce((s, d) => s + (d.predictedCostAvg ?? 0), 0)
    return { ...c, cost, count: cDefs.length, predCost }
  }).sort((a, b) => b.cost - a.cost)

  const predDefs = defects.filter(d => d.predictedCostAvg && d.totalCost > 0 && d.predictionErrorRate != null)

  return [
    {
      id: 'budget-kpi', title: '예산 집행 요약', type: 'kpi-grid',
      kpiItems: [
        { label: '총 누적 처리 비용', value: fmtMan(totalCost), color: '#635bff' },
        { label: '건당 평균 처리 비용', value: total > 0 && totalCost > 0 ? fmtMan(Math.round(totalCost / total)) : '-', color: '#059669' },
        { label: '비용 미입력 건수', value: `${defects.filter(d => d.totalCost === 0).length}건`, color: '#d97706' },
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
  const totalCost = defects.reduce((s, d) => s + d.totalCost, 0)
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
    cost: defects.filter(d => d.categoryId === c.id).reduce((s, d) => s + d.totalCost, 0),
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
        { label: '건당 평균 처리 비용', value: total > 0 && totalCost > 0 ? fmtMan(Math.round(totalCost / total)) : '-' },
        { label: '연간 예상 비용', value: fmtMan(annualEst) },
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
  const recurringCost = recurring.reduce((s, d) => s + d.totalCost, 0)

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
        cells: [d.caseNumber, d.title, d.recurringLevel ?? (d.recurrenceCount > 0 ? '반복 확정' : '반복 의심'), `${d.recurrenceCount}회`, fmtMan(d.totalCost)],
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
    count: defects.filter(d => (d.costBearer || '미정') === b).length,
    cost: defects.filter(d => (d.costBearer || '미정') === b).reduce((s, d) => s + d.totalCost, 0),
  }))
  const maxCount = Math.max(1, ...data.map(b => b.count))
  const totalCost = defects.reduce((s, d) => s + d.totalCost, 0)

  return [
    {
      id: 'bearer-kpi', title: '비용 부담 주체 요약', type: 'kpi-grid',
      kpiItems: [
        { label: '총 누적 처리 비용', value: fmtMan(totalCost), color: '#635bff' },
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
  const foundationList = defects.filter(d => d.costBearer === '재단')
  const vendorList = defects.filter(d => d.costBearer === '외주업체')

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
      tableRows: contractorList.slice(0, 10).map(d => ({ cells: [d.caseNumber, d.title, fmtMan(d.totalCost)] })),
    },
    {
      id: 'foundation-table', title: '재단 부담 예상 하자 목록', type: 'table',
      tableHeaders: ['케이스번호', '하자명', '누적 비용'],
      tableRows: foundationList.slice(0, 10).map(d => ({ cells: [d.caseNumber, d.title, fmtMan(d.totalCost)] })),
    },
    {
      id: 'vendor-table', title: '외주업체 확인 필요 하자 목록', type: 'table',
      tableHeaders: ['케이스번호', '하자명', '누적 비용'],
      tableRows: vendorList.slice(0, 10).map(d => ({ cells: [d.caseNumber, d.title, fmtMan(d.totalCost)] })),
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
  }
  const [title, subtitle] = TITLES[type]
  const { opinion, bullets } = generateAiOpinion(type, input)
  const sections =
    type === 'field-analysis'        ? buildFieldAnalysisSections(input) :
    type === 'budget-settlement'     ? buildBudgetSections(input) :
    type === 'recurring-defects'     ? buildRecurringSections(input) :
    type === 'cost-bearer'           ? buildCostBearerSections(input) :
    type === 'defect-classification' ? buildClassificationSections(input) :
    buildExecutiveSections(input)

  return {
    reportType: type, title, subtitle,
    period: `${now.getFullYear()}년 ${now.getMonth() + 1}월 기준`,
    generatedAt: now.toLocaleString('ko-KR'),
    sections,
    aiOpinion: opinion,
    aiOpinionBullets: bullets,
    basedOn: 'rule-based',
    preparedBy: '시설관리팀',
    metadata: {
      totalDefects: input.defects.length,
      completionRate: input.defects.length > 0
        ? Math.round(input.defects.filter(d => d.status === 'completed').length / input.defects.length * 100)
        : 0,
      totalCost: input.defects.reduce((s, d) => s + d.totalCost, 0),
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
