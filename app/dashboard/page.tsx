'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useStore, type Defect } from '@/lib/store'
import {
  COLORS, isOverdue, needsAfterPhoto, getPaymentBadge, getCostBearerStatus, getDisplayCost,
  STATUS_FLOW, STATUS_META, SEVERITY_META, type SeverityKey, needsTodayAction, isSlaImminent,
  COST_BEARER_CATEGORIES, COST_ESTIMATED_COLOR, COST_CONFIRMED_COLOR,
  isInProgressStatus, isRecurring, needsRecheck, isKpiCompleted, filterByOccurredPeriod, sumCostSummary,
  type StandardPeriodType, STANDARD_PERIOD_OPTIONS, computeStandardPeriod, isScheduled, isUnresolved,
} from '@/lib/designTokens'
import StatusBadge from '@/components/ui/StatusBadge'
import DefectCalendar from '@/components/dashboard/DefectCalendar'
import { generateActionPlanOpinion } from '@/lib/aiReportService'

const DEFECT_TYPE_KEYS = ['하자사항', '일반사항', '확인 필요'] as const
// Dashboard/운영현황/하자목록/AI보고서 공통 기준(getCostBearerStatus)의 결과값 목록을 그대로 재사용한다.
const COST_BEARER_KEYS = COST_BEARER_CATEGORIES
const SEVERITY_KEYS: SeverityKey[] = ['critical', 'high', 'medium', 'low']

function fmtKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}

// Executive Dashboard. (구 /analytics "집계현황" — 2026-08 고도화로 이 콘텐츠가 /dashboard로 이동했고,
// 기존 /dashboard(캘린더+트리아지)는 "운영현황"(/analytics)으로 이동했다. 이후 2026-08 2차 고도화로
// 7행 + 우측 Alert Panel 레이아웃으로, 3차 고도화로 Fluent/Apple Card 스타일 비주얼로 다듬었다.
// 데이터 조회/계산 로직은 만들지 않고, 기존 KPI·집계·캘린더·AI 인사이트·비용 계산을 그대로 재사용하거나
// 이미 존재하는 조합함수(computeStandardPeriod/filterByOccurredPeriod/sumCostSummary/getCostBearerStatus
// 등)만으로 파생값을 계산한다. 1920x1080 데스크톱 기준으로만 최적화하며 모바일 대응은 하지 않는다.)
export default function DashboardPage() {
  const { state } = useStore()

  const [periodType, setPeriodType] = useState<StandardPeriodType>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [activeUnifiedTab, setActiveUnifiedTab] = useState('recurring')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // 운영현황/AI보고서/보고서와 동일한 computeStandardPeriod() 하나만 쓴다 — 같은 기간을 고르면
  // 어느 화면에서도 같은 날짜 범위로 계산된다.
  const { from, to } = computeStandardPeriod(periodType, customFrom || null, customTo || null)

  const allDefects = state.defects.filter(d => !d.deletedAt)
  const inRange = (dateStr: string | null) => {
    if (!dateStr) return false
    if (!from && !to) return true
    const d = dateStr.slice(0, 10)
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }

  // 기간 내 하자 (발생일 기준) — 대부분의 KPI/집계/테이블의 기본 데이터셋.
  // 운영현황과 동일한 filterByOccurredPeriod()를 써야 같은 기간에 같은 건수가 나온다
  // (발생일 미입력 건은 운영현황과 동일하게 항상 제외 — 전체 기간도 예외 없음).
  const periodDefects = filterByOccurredPeriod(allDefects, from, to)

  function getCompletionDate(d: Defect): string | null {
    const hist = state.statusHistory
      .filter(h => h.defectId === d.id && h.toStatus === 'completed')
      .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime())
    return hist[0]?.changedAt.slice(0, 10) ?? (d.status === 'completed' ? d.lastOccurredAt : null)
  }

  // ── 상단 KPI ───────────────────────────────────────────────────────────
  // 진행중/완료/지연/재점검/반복/비용은 운영현황과 동일한 공용 함수(designTokens.ts)로만 계산한다
  // — 같은 기간을 선택하면 두 화면 어디서 봐도 같은 숫자가 나온다.
  const kpiTotal = periodDefects.length
  const kpiNew = allDefects.filter(d => inRange(d.createdAt)).length
  const kpiInProgress = periodDefects.filter(isInProgressStatus).length
  const kpiCompleted = periodDefects.filter(isKpiCompleted).length
  const kpiOverdue = periodDefects.filter(isOverdue).length
  const kpiRecheck = periodDefects.filter(needsRecheck).length
  const kpiRecurring = periodDefects.filter(isRecurring).length
  const kpiUnclassified = periodDefects.filter(d => (d.defectType ?? '확인 필요') === '확인 필요').length
  const kpiCostUnresolved = periodDefects.filter(d => getCostBearerStatus(d) === '미정').length
  const { confirmed: kpiConfirmedCost, pending: kpiEstimatedPendingCost } = sumCostSummary(periodDefects)
  // 평균 처리기간은 완료일(완료 이력) 기준 별도 계산이 필요해 완료 코호트를 따로 구한다
  // (위 kpiCompleted와는 별개 — 평균 처리기간은 진행중/완료/지연/재점검/반복/비용 통일 대상에 포함되지 않는다).
  const completedInRange = allDefects.filter(d => d.status === 'completed' && (!from && !to ? true : inRange(getCompletionDate(d))))
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
  const foundationList = periodDefects.filter(d => getCostBearerStatus(d) === '재단').slice(0, 10)
  const vendorReviewList = periodDefects.filter(d => getCostBearerStatus(d) === '외주업체').slice(0, 10)

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

  // ══════════════════════════════════════════════════════════════════════
  // Executive Dashboard 1~7행 · Alert Panel 파생값 — 전부 위에서 이미 계산된 기존 KPI/집계나
  // 기존 공용 함수(getCostBearerStatus/computeStandardPeriod/filterByOccurredPeriod/sumCostSummary/
  // isScheduled/needsRecheck 등)를 조합한 값이며, 새로운 데이터 조회 로직은 추가하지 않았다.
  // ══════════════════════════════════════════════════════════════════════

  // 1행 — Executive KPI 6종
  const kpiUnresolved = periodDefects.filter(isUnresolved).length
  const kpiTodayCount = periodDefects.filter(needsTodayAction).length
  // 이번달 확정비용 — 조회기간 선택과 무관하게 항상 이번 달(달력월) 고정(최근 6개월 추이와 동일한 방식).
  const thisMonthPeriod = computeStandardPeriod('month', null, null)
  const thisMonthDefects = filterByOccurredPeriod(allDefects, thisMonthPeriod.from, thisMonthPeriod.to)
  const kpiThisMonthConfirmedCost = sumCostSummary(thisMonthDefects).confirmed
  const contractorBearerDefects = periodDefects.filter(d => getCostBearerStatus(d) === '시공사')
  const kpiContractorPendingCost = sumCostSummary(contractorBearerDefects).pending

  type ExecTone = 'red' | 'yellow' | 'green' | 'blue'
  const EXEC_TONE_COLOR: Record<ExecTone, string> = { red: COLORS.danger, yellow: '#CA8A04', green: COLORS.success, blue: COLORS.action }
  const execKpis: { label: string; value: string; tone: ExecTone; sub?: string }[] = [
    { label: '총 하자', value: `${kpiTotal}건`, tone: 'blue' },
    { label: '미완결', value: `${kpiUnresolved}건`, tone: 'yellow' },
    { label: '오늘 우선처리', value: `${kpiTodayCount}건`, tone: 'red' },
    { label: '지연', value: `${kpiOverdue}건`, tone: 'red' },
    { label: '이번달 확정비용', value: fmtKRW(kpiThisMonthConfirmedCost), tone: 'green', sub: thisMonthPeriod.label },
    { label: '시공사 부담 예상금액', value: fmtKRW(kpiContractorPendingCost), tone: 'yellow' },
  ]

  // 2행 — 시설 건강도(Risk Score, 기존 KPI 수치로만 산출한 파생 점수) · 위험 Top5(지정 5개 분야)
  const criticalOpenCount = periodDefects.filter(d => d.severity === 'critical' && d.status !== 'completed').length
  const healthPenalty = kpiTotal > 0
    ? (kpiOverdue / kpiTotal) * 40 + (criticalOpenCount / kpiTotal) * 30 + (kpiRecurring / kpiTotal) * 30
    : 0
  const healthScore = Math.max(0, Math.min(100, Math.round(100 - healthPenalty)))
  const healthTone: ExecTone = healthScore >= 80 ? 'green' : healthScore >= 60 ? 'yellow' : 'red'

  const RISK_WATCH_CATEGORIES = ['누수', '전기', 'HVAC', '균열', '배수']
  const riskByCategory = RISK_WATCH_CATEGORIES
    .map(name => {
      const cat = state.categories.find(c => c.name === name)
      const rows = cat ? periodDefects.filter(d => d.categoryId === cat.id) : []
      const riskCount = rows.filter(d => isOverdue(d) || d.severity === 'critical' || d.severity === 'high').length
      return { name, exists: !!cat, count: rows.length, riskCount }
    })
    .filter(r => r.exists)
    .sort((a, b) => b.riskCount - a.riskCount)

  // 3행 — 오늘 해야할 작업 (기존 필드/함수 재사용)
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayScheduled = periodDefects.filter(isScheduled)
  const todayVendorVisit = periodDefects.filter(d => d.vendorVisitDate === todayStr)
  const todayRecheck = periodDefects.filter(needsRecheck)
  const todayUrgent = periodDefects.filter(d => d.severity === 'critical' && d.status !== 'completed')
  const todayTaskGroups: { key: string; label: string; icon: string; color: string; rows: Defect[] }[] = [
    { key: 'scheduled', label: '조치예정', icon: 'fa-solid fa-calendar-check', color: COLORS.action, rows: todayScheduled },
    { key: 'vendorVisit', label: '업체방문', icon: 'fa-solid fa-truck-fast', color: COLORS.action, rows: todayVendorVisit },
    { key: 'recheck', label: '재점검', icon: 'fa-solid fa-magnifying-glass', color: COLORS.warning, rows: todayRecheck },
    { key: 'urgent', label: '긴급조치', icon: 'fa-solid fa-triangle-exclamation', color: COLORS.danger, rows: todayUrgent },
  ]

  // 4행 — 비용부담(5종 축약 뷰, 기존 getCostBearerStatus 재사용)
  const EXEC_COST_BEARER_VIEW = [
    { key: '시공사', label: '시공사' },
    { key: '재단', label: '재단' },
    { key: '외주업체', label: '외주' },
    { key: '보험/기타', label: '보험' },
    { key: '미정', label: '미정' },
  ]
  const execCostBearerAgg = EXEC_COST_BEARER_VIEW.map(b => ({
    key: b.key, label: b.label,
    color: b.key === '미정' ? COLORS.danger : COLORS.action,
    count: periodDefects.filter(d => getCostBearerStatus(d) === b.key).length,
  }))

  // 5행 — 운영 KPI (전부 기존 KPI 수치의 단순 비율)
  const completionRate = kpiTotal > 0 ? Math.round((kpiCompleted / kpiTotal) * 100) : 0
  const overdueRate = kpiTotal > 0 ? Math.round((kpiOverdue / kpiTotal) * 100) : 0
  const recheckRate = kpiTotal > 0 ? Math.round((kpiRecheck / kpiTotal) * 100) : 0
  const operationsKpis: { label: string; value: string; danger?: boolean }[] = [
    { label: '평균 처리기간', value: `${kpiAvgDuration}일` },
    { label: 'SLA 임박', value: `${kpiSlaImminent}건`, danger: kpiSlaImminent > 0 },
    { label: '완료율', value: `${completionRate}%` },
    { label: '지연률', value: `${overdueRate}%`, danger: overdueRate > 0 },
    { label: '재점검율', value: `${recheckRate}%`, danger: recheckRate > 0 },
  ]

  // 7행 — AI Executive Summary (기존 actionPlan을 위험요인/비용/권고사항 3분류로 재구성만 함)
  const execSummary = {
    risks: [...actionPlan.headline, ...actionPlan.recurringWarning],
    cost: actionPlan.costRisk,
    recommendations: [...actionPlan.immediateActions, ...actionPlan.approvalNeeded],
  }

  // ══════════════════════════════════════════════════════════════════════
  // 8행 — 경영진 의사결정 인사이트 (신규 화면 구성) — 전부 위에서 이미 계산된 기존 데이터
  // (thisMonthDefects/categoryCostAgg/recurringGroups/vendorPerf/actionPlan/isOverdue 등)를
  // 다시 그룹핑·정렬만 한 파생값이며, 새로운 DB·API·쿼리는 추가하지 않았다.
  // ══════════════════════════════════════════════════════════════════════
  function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

  // 8-1. 이번달 주요 리스크 — thisMonthDefects(1행에서 이미 계산) 중 미완료·지연·긴급·재점검 건을
  // 위험 하자 TOP5와 동일한 정렬 기준(심각도→지연일수)으로 상위 5건만 추린다.
  const thisMonthRisks = thisMonthDefects
    .filter(d => d.status !== 'completed' && (isOverdue(d) || d.severity === 'critical' || needsRecheck(d)))
    .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || overdueDaysOf(b) - overdueDaysOf(a))
    .slice(0, 5)

  // 8-2. 비용 증가 원인 — 이번달 확정비용을 지난달과 비교(둘 다 filterByOccurredPeriod+sumCostSummary
  // 재사용)하고, 카테고리별 비용(categoryCostAgg, 4행에서 이미 계산)을 비용 큰 순으로 재정렬해
  // "어디서 비용이 늘고 있는지" 상위 5개 분야를 함께 보여준다.
  const lastMonthRef = new Date()
  lastMonthRef.setMonth(lastMonthRef.getMonth() - 1)
  const lastMonthFrom = ymd(new Date(lastMonthRef.getFullYear(), lastMonthRef.getMonth(), 1))
  const lastMonthTo = ymd(new Date(lastMonthRef.getFullYear(), lastMonthRef.getMonth() + 1, 0))
  const lastMonthDefects = filterByOccurredPeriod(allDefects, lastMonthFrom, lastMonthTo)
  const lastMonthConfirmedCost = sumCostSummary(lastMonthDefects).confirmed
  const costMoMDelta = kpiThisMonthConfirmedCost - lastMonthConfirmedCost
  const costMoMPct = lastMonthConfirmedCost > 0
    ? Math.round((costMoMDelta / lastMonthConfirmedCost) * 100)
    : (kpiThisMonthConfirmedCost > 0 ? 100 : 0)
  const costDriverTop5 = [...categoryCostAgg].sort((a, b) => (b.confirmed + b.pending) - (a.confirmed + a.pending)).slice(0, 5)

  // 8-3. 반복하자 원인 — recurringGroups(6행에서 이미 계산된 위치·설비·분야 그룹)를 분야(카테고리)
  // 단위로 재집계해 어떤 분야에서 반복이 가장 많이 발생하는지 상위 5개를 보여준다.
  const recurringByCategoryMap = new Map<string, number>()
  recurringGroups.forEach(g => {
    g.defects.forEach(d => {
      const name = state.categories.find(c => c.id === d.categoryId)?.name ?? '미분류'
      recurringByCategoryMap.set(name, (recurringByCategoryMap.get(name) ?? 0) + 1)
    })
  })
  const recurringCauseTop5 = Array.from(recurringByCategoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // 8-4. 업체 SLA — vendorPerf(외주업체 성과, 이미 계산됨)의 평균 처리기간을 심각도별 지연 기준표
  // (OVERDUE_DAYS_BY_SEVERITY: 보통 14일)에 견줘 준수/주의/위반으로만 재분류한다.
  const vendorSla = vendorPerf.map(v => ({
    ...v,
    slaStatus: (v.avgDays == null ? '데이터없음' : v.avgDays <= 7 ? '준수' : v.avgDays <= 14 ? '주의' : '위반') as '준수' | '주의' | '위반' | '데이터없음',
  }))

  // 8-5. 위험 설비 TOP10 — facilityName(기존 필드) 기준으로 그룹핑해, 단순 반복 건수가 아니라
  // 지연·긴급·높음 심각도 건수(riskCount)로 순위를 매긴다.
  const facilityGroupMap = new Map<string, Defect[]>()
  periodDefects.forEach(d => {
    if (!d.facilityName) return
    const arr = facilityGroupMap.get(d.facilityName) ?? []
    arr.push(d)
    facilityGroupMap.set(d.facilityName, arr)
  })
  const facilityRiskTop10 = Array.from(facilityGroupMap.entries())
    .map(([name, ds]) => ({
      name, count: ds.length,
      riskCount: ds.filter(d => isOverdue(d) || d.severity === 'critical' || d.severity === 'high').length,
    }))
    .sort((a, b) => b.riskCount - a.riskCount || b.count - a.count)
    .slice(0, 10)

  // 8-6. AI 권고사항 — 7행의 요약(4건 슬라이스)과 달리, actionPlan 전체(즉시조치+결재필요+비용리스크)를
  // 슬라이스 없이 모두 재사용해 경영진이 바로 실행할 수 있는 전체 액션 리스트로 보여준다.
  const aiRecommendationsFull = [...actionPlan.immediateActions, ...actionPlan.approvalNeeded, ...actionPlan.costRisk]

  // Executive Alert Panel (오른쪽 고정) — 전부 기존 KPI/함수 재사용
  // filterKey는 하자목록(/defects)의 기존 quickFilter 키를 그대로 사용한다(예: '긴급'→critical).
  const alertItems = [
    { key: 'urgent', filterKey: 'critical', label: '긴급', count: todayUrgent.length, color: COLORS.danger },
    { key: 'inprogress', filterKey: 'inprogress', label: '진행중', count: kpiInProgress, color: COLORS.action },
    { key: 'scheduled', filterKey: 'scheduled', label: '조치예정', count: todayScheduled.length, color: '#CA8A04' },
    { key: 'completed', filterKey: 'completed', label: '완료', count: kpiCompleted, color: COLORS.success },
    { key: 'overdue', filterKey: 'overdue', label: '지연', count: kpiOverdue, color: COLORS.danger },
  ]

  // ── 비주얼 시스템 — Fluent/Apple Card 스타일: 넓은 여백·통일된 카드 높이·옅은 그림자·
  // 16px 라운드·불필요한 테두리 제거. 1920x1080 데스크톱 전용(모바일 대응 없음).
  const card: React.CSSProperties = { background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(16,24,40,.04), 0 6px 20px rgba(16,24,40,.05)', overflow: 'hidden' }
  const inputCls: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 14px', fontSize: '0.8rem', fontFamily: 'inherit', color: '#0a2540', background: '#fff', outline: 'none' }
  const eyebrow: React.CSSProperties = { fontSize: '0.68rem', fontWeight: 700, color: '#8a94a6', textTransform: 'uppercase', letterSpacing: '0.07em' }
  const cardHead: React.CSSProperties = { padding: '22px 24px 6px' }
  const listRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 24px' }

  // KPI 숫자는 크게, 라벨(제목)은 작게 — Row1(Executive KPI)·Row5(운영 KPI) 공용 타일.
  function KpiTile({ label, value, color, sub, dot }: { label: string; value: string; color?: string; sub?: string; dot?: string }) {
    return (
      <div style={{ ...card, padding: '26px 24px', minHeight: 136, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
          <span style={eyebrow}>{label}</span>
        </div>
        <div style={{ fontSize: '2.05rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: color ?? '#0a2540' }}>{value}</div>
        {sub && <div style={{ fontSize: '0.7rem', color: '#aab', marginTop: 9 }}>{sub}</div>}
      </div>
    )
  }

  function BarList({ title, rows }: { title: string; rows: { key: string; label: string; color: string; count: number }[] }) {
    const max = Math.max(1, ...rows.map(r => r.count))
    return (
      <div style={card}>
        <div style={cardHead}><div style={eyebrow}>{title}</div></div>
        <div style={{ padding: '16px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.length === 0 && <div style={{ fontSize: '0.75rem', color: '#aab' }}>데이터가 없습니다.</div>}
          {rows.map(r => {
            const pct = Math.round((r.count / max) * 100)
            return (
              <div key={r.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: '0.78rem', color: '#0a2540' }}>{r.label}</span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#425466' }}>{r.count}건</span>
                </div>
                <div style={{ height: 6, background: '#f2f4f7', borderRadius: 999, overflow: 'hidden' }}>
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
        <div style={cardHead}><div style={eyebrow}>{title}</div></div>
        <div style={{ padding: '16px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.length === 0 && <div style={{ fontSize: '0.75rem', color: '#aab' }}>데이터가 없습니다.</div>}
          {rows.map(r => {
            const confirmedPct = Math.round((r.confirmed / max) * 100)
            const pendingPct = Math.round((r.pending / max) * 100)
            return (
              <div key={r.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
                  <span style={{ fontSize: '0.78rem', color: '#0a2540' }}>{r.label}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, textAlign: 'right' }}>
                    {r.confirmed > 0 && <span style={{ color: COST_CONFIRMED_COLOR.text }}>확정 {fmtKRW(r.confirmed)}</span>}
                    {r.confirmed > 0 && r.pending > 0 && <span style={{ color: '#b0bac6' }}> · </span>}
                    {r.pending > 0 && <span style={{ color: COST_ESTIMATED_COLOR.text }}>예상 {fmtKRW(r.pending)}</span>}
                  </span>
                </div>
                <div style={{ height: 6, background: '#f2f4f7', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
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
        <div style={{ padding: '18px 24px 14px', display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          {visibleTabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveUnifiedTab(t.key)}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: 'none',
                background: current.key === t.key ? '#635bff' : '#f2f4f7',
                color: current.key === t.key ? '#fff' : '#425466', fontFamily: 'inherit',
              }}
            >
              {t.label} ({t.rows.length})
            </button>
          ))}
        </div>
        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f0f1f3' }}>
                {['순위', '하자명', '위치', '분야', '상태', '외주업체', '비용', '지연일', '반복횟수', '결제상태', '조치필요사항'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#8a94a6', whiteSpace: 'nowrap' as const }}>{h}</th>
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
                  <tr key={d.id} style={{ borderBottom: i < current.rows.length - 1 ? '1px solid #f7f8fa' : 'none' }}>
                    <td style={{ padding: '10px 12px', fontSize: '0.74rem', color: '#697386' }}>{i + 1}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <Link href={`/defects/${d.id}`} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}>{d.title}</Link>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.74rem', color: '#697386' }}>{d.locationText || '-'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {cat ? (
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '1px 7px', borderRadius: 6, background: cat.color + '18', color: cat.color, whiteSpace: 'nowrap' as const }}>{cat.name}</span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '10px 12px' }}><StatusBadge status={d.status} /></td>
                    <td style={{ padding: '10px 12px', fontSize: '0.74rem', color: vendor ? '#0a2540' : '#b0bac6', whiteSpace: 'nowrap' as const }}>{vendor ? vendor.name : '자체처리'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '0.76rem', fontWeight: 600, whiteSpace: 'nowrap' as const }}>
                      {(() => {
                        const { amount, confirmed } = getDisplayCost(d)
                        if (amount == null) return <span style={{ color: '#b0bac6', fontWeight: 400 }}>-</span>
                        return (
                          <span style={{ color: confirmed ? COST_CONFIRMED_COLOR.text : COST_ESTIMATED_COLOR.text }}>
                            {!confirmed && <span style={{ fontSize: '0.6rem', fontWeight: 700, background: COST_ESTIMATED_COLOR.bg, padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>예상</span>}
                            {fmtKRW(amount)}
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.74rem', color: overdueDays ? COLORS.warning : '#b0bac6', fontWeight: overdueDays ? 700 : 400 }}>{overdueDays ? `${overdueDays}일` : '-'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '0.74rem', color: d.recurrenceCount > 0 ? '#be1044' : '#b0bac6', fontWeight: d.recurrenceCount > 0 ? 700 : 400 }}>{d.recurrenceCount > 0 ? `${d.recurrenceCount}회` : '-'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '0.68rem', whiteSpace: 'nowrap' as const }}>
                      {badge ? (
                        <span style={{ fontWeight: 700, color: badge.tone === 'success' ? COLORS.success : badge.tone === 'danger' ? COLORS.danger : badge.tone === 'warning' ? COLORS.warning : '#697386' }}>
                          {badge.icon} {badge.label}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.72rem', color: '#425466' }}>{actionNeeded(d)}</td>
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
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <div style={{ padding: '26px 40px 20px', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0a2540', letterSpacing: '-0.01em' }}>대시보드</h1>
        <div style={{ fontSize: '0.76rem', color: '#8a94a6', marginTop: 3 }}>Executive Dashboard — 시설 건강도·비용·반복 하자·AI 인사이트 종합 현황</div>
      </div>

      <div style={{ padding: '28px 40px 48px' }}>
        {/* 기간 필터 — 운영현황/AI보고서/보고서와 동일한 6종(오늘/이번주/이번달/올해/사용자지정/전체기간) */}
        <div style={{ ...card, padding: '14px 20px', marginBottom: 24, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
          {STANDARD_PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setPeriodType(opt.key)}
              style={{
                padding: '7px 16px', borderRadius: 999, fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                background: periodType === opt.key ? '#635bff' : '#f2f4f7',
                color: periodType === opt.key ? '#fff' : '#425466',
              }}
            >
              {opt.label}
            </button>
          ))}
          {periodType === 'custom' && (
            <>
              <input type="date" style={inputCls} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span style={{ color: '#b0bac6' }}>~</span>
              <input type="date" style={inputCls} value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </>
          )}
          {(from || to) && <span style={{ fontSize: '0.74rem', color: '#8a94a6', marginLeft: 4 }}>{from ?? '-'} ~ {to ?? '-'}</span>}
        </div>

        {/* ══════════════ Executive Dashboard 본문 + 우측 Alert Panel ══════════════ */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* ── 본문(1~7행) — KPI를 최상단에 두어 차트류(상세 지표)보다 먼저 보이도록 구성 ── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>

            {/* 1행 — Executive KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 18 }}>
              {execKpis.map(k => (
                <KpiTile key={k.label} label={k.label} value={k.value} color={EXEC_TONE_COLOR[k.tone]} sub={k.sub} dot={EXEC_TONE_COLOR[k.tone]} />
              ))}
            </div>

            {/* 2행 — 시설 건강도(Risk Score) · 위험 Top5(지정 5개 분야) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ ...card, minHeight: 214 }}>
                <div style={cardHead}><div style={eyebrow}>시설 건강도 (Risk Score)</div></div>
                <div style={{ padding: '10px 24px 26px', display: 'flex', alignItems: 'center', gap: 24 }}>
                  <div style={{ fontSize: '3rem', fontWeight: 800, color: EXEC_TONE_COLOR[healthTone], lineHeight: 1, letterSpacing: '-0.02em' }}>{healthScore}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 8, background: '#f2f4f7', borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ height: '100%', width: `${healthScore}%`, background: EXEC_TONE_COLOR[healthTone], borderRadius: 999 }} />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#8a94a6', lineHeight: 1.7 }}>
                      지연률 {kpiTotal > 0 ? Math.round((kpiOverdue / kpiTotal) * 100) : 0}% · 긴급 미완료 {criticalOpenCount}건 · 반복 {kpiTotal > 0 ? Math.round((kpiRecurring / kpiTotal) * 100) : 0}% 반영
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ ...card, minHeight: 214 }}>
                <div style={cardHead}><div style={eyebrow}>위험 Top 5</div></div>
                <div style={{ padding: '8px 0 10px' }}>
                  {riskByCategory.length === 0 ? (
                    <div style={{ padding: '16px 24px', fontSize: '0.75rem', color: '#aab' }}>해당 분야 데이터가 없습니다.</div>
                  ) : riskByCategory.map((r, i) => (
                    <div key={r.name} style={listRow}>
                      <span style={{ fontSize: '0.78rem', color: '#0a2540' }}>{i + 1}. {r.name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '0.7rem', color: '#aab' }}>{r.count}건</span>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: r.riskCount > 0 ? COLORS.danger : '#b0bac6' }}>위험 {r.riskCount}건</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3행 — 월간 캘린더(기존 컴포넌트 그대로) · 오늘 해야할 작업 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ ...card, padding: 22 }}>
                <div style={{ ...eyebrow, marginBottom: 14 }}>월간 캘린더</div>
                <DefectCalendar defects={periodDefects} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
              </div>
              <div style={card}>
                <div style={cardHead}><div style={eyebrow}>오늘 해야할 작업</div></div>
                {todayTaskGroups.every(g => g.rows.length === 0) ? (
                  <div style={{ padding: '16px 24px', fontSize: '0.75rem', color: '#aab' }}>오늘 처리할 작업이 없습니다.</div>
                ) : (
                  <div style={{ padding: '10px 12px 16px' }}>
                    {todayTaskGroups.map(g => (
                      <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px' }}>
                        <span style={{ width: 32, height: 32, borderRadius: 10, background: g.color + '14', color: g.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <i className={g.icon} style={{ fontSize: '0.72rem' }} />
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#0a2540', flex: 1 }}>{g.label}</span>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: g.rows.length > 0 ? g.color : '#c4cbd6' }}>{g.rows.length}건</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 4행 — 비용: 예상 vs 확정 · 비용부담(5종) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ ...card, minHeight: 214 }}>
                <div style={cardHead}><div style={eyebrow}>예상비용 vs 확정비용</div></div>
                <div style={{ padding: '14px 24px 24px' }}>
                  <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8a94a6', marginBottom: 6 }}>확정</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: COST_CONFIRMED_COLOR.text, letterSpacing: '-0.02em' }}>{fmtKRW(kpiConfirmedCost)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8a94a6', marginBottom: 6 }}>예상(미확정)</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: COST_ESTIMATED_COLOR.text, letterSpacing: '-0.02em' }}>{fmtKRW(kpiEstimatedPendingCost)}</div>
                    </div>
                  </div>
                  <div style={{ height: 10, background: '#f2f4f7', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
                    {(() => {
                      const total = kpiConfirmedCost + kpiEstimatedPendingCost
                      const confirmedPct = total > 0 ? Math.round((kpiConfirmedCost / total) * 100) : 0
                      return (
                        <>
                          <div style={{ height: '100%', width: `${confirmedPct}%`, background: COST_CONFIRMED_COLOR.text }} />
                          <div style={{ height: '100%', width: `${100 - confirmedPct}%`, background: COST_ESTIMATED_COLOR.text }} />
                        </>
                      )
                    })()}
                  </div>
                </div>
              </div>
              <BarList title="비용부담" rows={execCostBearerAgg} />
            </div>

            {/* 5행 — 운영 KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 18 }}>
              {operationsKpis.map(k => (
                <KpiTile key={k.label} label={k.label} value={k.value} color={k.danger ? COLORS.danger : '#0a2540'} />
              ))}
            </div>

            {/* 6행 — 반복하자 TOP10(기존 recurringTop10 재사용) */}
            <div style={card}>
              <div style={cardHead}><div style={eyebrow}>반복하자 TOP 10</div></div>
              {recurringTop10.length === 0 ? (
                <div style={{ padding: '16px 24px 22px', fontSize: '0.75rem', color: '#aab' }}>반복 하자가 없습니다.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                  <tbody>
                    {recurringTop10.map((d, i) => (
                      <tr key={d.id}>
                        <td style={{ padding: '10px 6px 10px 24px', fontSize: '0.74rem', color: '#8a94a6', width: 24 }}>{i + 1}</td>
                        <td style={{ padding: '10px 6px' }}>
                          <Link href={`/defects/${d.id}`} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}>{d.title}</Link>
                          <div style={{ fontSize: '0.66rem', color: '#8a94a6', marginTop: 1 }}>{d.locationText || '-'}</div>
                        </td>
                        <td style={{ padding: '10px 6px', fontSize: '0.7rem', fontWeight: 700, color: '#be1044', textAlign: 'right' as const }}>{d.recurrenceCount}회</td>
                        <td style={{ padding: '10px 24px 10px 6px', textAlign: 'right' as const }}><StatusBadge status={d.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 7행 — AI Executive Summary (기존 actionPlan 재사용, 위험요인/비용/권고사항으로 재구성) */}
            <div style={{ ...card, padding: '26px 28px', background: 'linear-gradient(135deg, rgba(99,91,255,.05), rgba(99,91,255,.01))' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0a2540', marginBottom: 18 }}>✨ AI Executive Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: COLORS.danger, marginBottom: 9, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>위험요인</div>
                  {execSummary.risks.length === 0 ? (
                    <div style={{ fontSize: '0.76rem', color: '#aab' }}>특이 위험요인이 없습니다.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {execSummary.risks.slice(0, 4).map((line, i) => <li key={i} style={{ fontSize: '0.76rem', color: '#425466', lineHeight: 1.6 }}>{line}</li>)}
                    </ul>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#B06B1A', marginBottom: 9, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>비용</div>
                  {execSummary.cost.length === 0 ? (
                    <div style={{ fontSize: '0.76rem', color: '#aab' }}>비용 관련 리스크가 없습니다.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {execSummary.cost.slice(0, 4).map((line, i) => <li key={i} style={{ fontSize: '0.76rem', color: '#425466', lineHeight: 1.6 }}>{line}</li>)}
                    </ul>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#635bff', marginBottom: 9, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>권고사항</div>
                  {execSummary.recommendations.length === 0 ? (
                    <div style={{ fontSize: '0.76rem', color: '#aab' }}>추가 권고사항이 없습니다.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {execSummary.recommendations.slice(0, 4).map((line, i) => <li key={i} style={{ fontSize: '0.76rem', color: '#425466', lineHeight: 1.6 }}>{line}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* 8행 — 경영진 의사결정 인사이트 (신규 화면 구성, 전부 기존 데이터 재사용) */}
            <div style={{ ...eyebrow, fontSize: '0.72rem', margin: '4px 0 -4px' }}>경영진 의사결정 인사이트</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* 8-1. 이번달 주요 리스크 */}
              <div style={card}>
                <div style={cardHead}><div style={eyebrow}>이번달 주요 리스크</div></div>
                <div style={{ padding: '8px 0 10px' }}>
                  {thisMonthRisks.length === 0 ? (
                    <div style={{ padding: '16px 24px', fontSize: '0.75rem', color: '#aab' }}>이번달 특이 리스크가 없습니다.</div>
                  ) : thisMonthRisks.map((d, i) => (
                    <Link key={d.id} href={`/defects/${d.id}`} style={{ ...listRow, textDecoration: 'none' }}>
                      <span style={{ fontSize: '0.78rem', color: '#0a2540', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>{i + 1}. {d.title}</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: SEVERITY_META[d.severity as SeverityKey]?.color ?? '#697386', flexShrink: 0 }}>{SEVERITY_META[d.severity as SeverityKey]?.label ?? d.severity}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* 8-3. 반복하자 원인 */}
              <div style={card}>
                <div style={cardHead}>
                  <div style={eyebrow}>반복하자 원인</div>
                  <div style={{ fontSize: '0.68rem', color: '#aab', marginTop: 5 }}>반복 그룹(6행)을 분야별로 재집계 — 반복이 가장 많은 분야 순</div>
                </div>
                <div style={{ padding: '8px 0 10px' }}>
                  {recurringCauseTop5.length === 0 ? (
                    <div style={{ padding: '16px 24px', fontSize: '0.75rem', color: '#aab' }}>반복 하자가 없습니다.</div>
                  ) : recurringCauseTop5.map((r, i) => (
                    <div key={r.name} style={listRow}>
                      <span style={{ fontSize: '0.78rem', color: '#0a2540' }}>{i + 1}. {r.name}</span>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#be1044' }}>{r.count}건</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 8-2. 비용 증가 원인 */}
              <div style={{ ...card, minHeight: 214 }}>
                <div style={cardHead}><div style={eyebrow}>비용 증가 원인</div></div>
                <div style={{ padding: '10px 24px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8a94a6' }}>전월 대비</span>
                    <span style={{ fontSize: '1.3rem', fontWeight: 800, color: costMoMDelta > 0 ? COLORS.danger : costMoMDelta < 0 ? COLORS.success : '#0a2540' }}>
                      {costMoMDelta > 0 ? '+' : ''}{costMoMPct}%
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#aab' }}>({fmtKRW(Math.abs(costMoMDelta))} {costMoMDelta >= 0 ? '증가' : '감소'})</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {costDriverTop5.length === 0 ? (
                      <div style={{ fontSize: '0.75rem', color: '#aab' }}>비용이 집계된 분야가 없습니다.</div>
                    ) : costDriverTop5.map((c, i) => (
                      <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.76rem', color: '#0a2540' }}>{i + 1}. {c.label}</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>{fmtKRW(c.confirmed + c.pending)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 8-5. 위험 설비 TOP10 */}
              <div style={{ ...card, minHeight: 214 }}>
                <div style={cardHead}><div style={eyebrow}>위험 설비 TOP 10</div></div>
                <div style={{ padding: '8px 0 10px', maxHeight: 320, overflowY: 'auto' as const }}>
                  {facilityRiskTop10.length === 0 ? (
                    <div style={{ padding: '16px 24px', fontSize: '0.75rem', color: '#aab' }}>설비 정보가 있는 하자가 없습니다.</div>
                  ) : facilityRiskTop10.map((f, i) => (
                    <div key={f.name} style={listRow}>
                      <span style={{ fontSize: '0.78rem', color: '#0a2540' }}>{i + 1}. {f.name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '0.7rem', color: '#aab' }}>{f.count}건</span>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: f.riskCount > 0 ? COLORS.danger : '#b0bac6' }}>위험 {f.riskCount}건</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 8-4. 업체 SLA */}
              <div style={card}>
                <div style={cardHead}><div style={eyebrow}>업체 SLA</div></div>
                {vendorSla.length === 0 ? (
                  <div style={{ padding: '16px 24px 22px', fontSize: '0.75rem', color: '#aab' }}>배정된 외주업체가 없습니다.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f0f1f3' }}>
                        {['업체명', '평균처리기간', 'SLA상태'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.62rem', fontWeight: 700, color: '#8a94a6', whiteSpace: 'nowrap' as const }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vendorSla.map(v => {
                        const slaColor = v.slaStatus === '준수' ? COLORS.success : v.slaStatus === '주의' ? '#CA8A04' : v.slaStatus === '위반' ? COLORS.danger : '#b0bac6'
                        return (
                          <tr key={v.id}>
                            <td style={{ padding: '9px 10px 9px 24px', fontSize: '0.76rem', fontWeight: 600, color: '#0a2540' }}>{v.name}</td>
                            <td style={{ padding: '9px 10px', fontSize: '0.73rem', color: '#425466' }}>{v.avgDays != null ? `${v.avgDays}일` : '-'}</td>
                            <td style={{ padding: '9px 24px 9px 10px' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: slaColor, background: slaColor + '18', padding: '2px 9px', borderRadius: 999 }}>{v.slaStatus}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 8-6. AI 권고사항 (7행 요약과 달리 전체 액션을 슬라이스 없이 표시) */}
              <div style={card}>
                <div style={cardHead}><div style={eyebrow}>AI 권고사항</div></div>
                <div style={{ padding: '10px 24px 20px' }}>
                  {aiRecommendationsFull.length === 0 ? (
                    <div style={{ fontSize: '0.76rem', color: '#aab' }}>추가 권고사항이 없습니다.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' as const }}>
                      {aiRecommendationsFull.map((line, i) => <li key={i} style={{ fontSize: '0.78rem', color: '#425466', lineHeight: 1.6 }}>{line}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* ── 상세 지표 (기존 화면 구성 그대로 보존 — 차트류는 KPI보다 아래에 배치) ── */}
            <div style={{ ...eyebrow, fontSize: '0.72rem', margin: '8px 0 -4px' }}>상세 지표</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={card}>
                <div style={cardHead}><div style={eyebrow}>오늘 우선처리 Top 3</div></div>
                <div style={{ padding: '8px 0 10px' }}>
                  {top3.length === 0 ? (
                    <div style={{ padding: '16px 24px', fontSize: '0.75rem', color: '#aab' }}>오늘 우선처리할 항목이 없습니다.</div>
                  ) : top3.map(d => (
                    <Link key={d.id} href={`/defects/${d.id}`} style={{ display: 'block', padding: '11px 24px', textDecoration: 'none' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0a2540' }}>{d.title}</div>
                      <div style={{ fontSize: '0.7rem', color: '#8a94a6', marginTop: 2 }}>{d.locationText || '-'}</div>
                    </Link>
                  ))}
                </div>
              </div>
              <div style={card}>
                <div style={cardHead}><div style={eyebrow}>위험 하자 TOP 5</div></div>
                {riskTop5.length === 0 ? (
                  <div style={{ padding: '16px 24px 22px', fontSize: '0.75rem', color: '#aab' }}>위험 하자가 없습니다.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                    <tbody>
                      {riskTop5.map((d, i) => (
                        <tr key={d.id}>
                          <td style={{ padding: '10px 6px 10px 24px', fontSize: '0.74rem', color: '#8a94a6', width: 20 }}>{i + 1}</td>
                          <td style={{ padding: '10px 6px' }}>
                            <Link href={`/defects/${d.id}`} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0a2540', textDecoration: 'none' }}>{d.title}</Link>
                            <div style={{ fontSize: '0.66rem', color: '#8a94a6', marginTop: 1 }}>{d.locationText || '-'}</div>
                          </td>
                          <td style={{ padding: '10px 6px', fontSize: '0.7rem', fontWeight: 700, color: SEVERITY_META[d.severity as SeverityKey]?.color ?? '#697386' }}>{SEVERITY_META[d.severity as SeverityKey]?.label ?? d.severity}</td>
                          <td style={{ padding: '10px 24px 10px 6px', fontSize: '0.7rem', fontWeight: 700, color: overdueDaysOf(d) > 0 ? COLORS.warning : '#b0bac6', textAlign: 'right' as const }}>{overdueDaysOf(d) > 0 ? `+${overdueDaysOf(d)}일` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <BarList title="상태별 집계" rows={statusAgg} />
              <BarList title="카테고리별 집계" rows={categoryAgg} />
            </div>
            <CostBarList title="카테고리별 비용 (확정 · 예상/미확정)" rows={categoryCostAgg} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <BarList title="심각도별 집계" rows={severityAgg} />
              <BarList title="비용 부담 주체별 집계" rows={costBearerAgg} />
            </div>
            <BarList title="하자사항/일반사항 비율" rows={defectTypeAgg} />
            <BarList title="최근 6개월 발생추이 (전체 기간 고정)" rows={trendRows} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={card}>
                <div style={cardHead}>
                  <div style={eyebrow}>반복 하자 TOP 5(실제 그룹핑)</div>
                  <div style={{ fontSize: '0.68rem', color: '#aab', marginTop: 5 }}>동일 위치·설비·분야 이력을 실제 그룹핑해 계산 (recurrenceCount 필드와 별개)</div>
                </div>
                <div style={{ padding: '8px 0 10px' }}>
                  {recurringTop5Real.length === 0 ? (
                    <div style={{ padding: '16px 24px', fontSize: '0.75rem', color: '#aab' }}>반복 발생 그룹이 없습니다.</div>
                  ) : recurringTop5Real.map((g, i) => (
                    <div key={g.key} style={listRow}>
                      <span style={{ fontSize: '0.78rem', color: '#0a2540' }}>{i + 1}. {g.label}</span>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#be1044' }}>{g.count}회</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={card}>
                <div style={cardHead}>
                  <div style={eyebrow}>외주업체 성과</div>
                  <div style={{ fontSize: '0.68rem', color: '#aab', marginTop: 5 }}>평가점수는 처리기간·재발률 기반 산정값(설문 아님), 전체 기간 기준</div>
                </div>
                {vendorPerf.length === 0 ? (
                  <div style={{ padding: '16px 24px 22px', fontSize: '0.75rem', color: '#aab' }}>배정된 외주업체가 없습니다.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f0f1f3' }}>
                        {['업체명', '배정건수', '평균처리기간', '재발률', '평가점수'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.62rem', fontWeight: 700, color: '#8a94a6', whiteSpace: 'nowrap' as const }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vendorPerf.map(v => (
                        <tr key={v.id}>
                          <td style={{ padding: '9px 10px 9px 24px', fontSize: '0.76rem', fontWeight: 600, color: '#0a2540' }}>{v.name}</td>
                          <td style={{ padding: '9px 10px', fontSize: '0.73rem', color: '#425466' }}>{v.assignedCount}건</td>
                          <td style={{ padding: '9px 10px', fontSize: '0.73rem', color: '#425466' }}>{v.avgDays != null ? `${v.avgDays}일` : '-'}</td>
                          <td style={{ padding: '9px 10px', fontSize: '0.73rem', color: v.recurRate > 0 ? '#be1044' : '#425466', fontWeight: v.recurRate > 0 ? 700 : 400 }}>{Math.round(v.recurRate * 100)}%</td>
                          <td style={{ padding: '9px 24px 9px 10px', fontSize: '0.76rem', fontWeight: 700, color: '#635bff' }}>{v.score != null ? `★ ${v.score.toFixed(1)}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div>
              <div style={{ ...eyebrow, fontSize: '0.72rem', marginBottom: 14 }}>상세 테이블</div>
              <UnifiedDefectTable tabs={unifiedTabs} />
            </div>
          </div>

          {/* ── Executive Alert Panel (오른쪽 고정) ── */}
          <aside style={{ width: 280, flexShrink: 0, position: 'sticky', top: 116 }}>
            <div style={card}>
              <div style={cardHead}><div style={eyebrow}>🔔 Executive Alert</div></div>
              <div style={{ padding: '8px 0 12px' }}>
                {alertItems.map(a => (
                  <Link
                    key={a.key}
                    href={`/defects?filter=${a.filterKey}`}
                    style={{ ...listRow, textDecoration: 'none' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.8rem', color: '#0a2540', fontWeight: 500 }}>{a.label}</span>
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: a.color }}>{a.count}</span>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
