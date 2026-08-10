'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useStore, type Defect } from '@/lib/store'
import DefectCalendar from '@/components/dashboard/DefectCalendar'
import DefectsTable from '@/components/defects/DefectsTable'
import EmptyState from '@/components/ui/EmptyState'
import { analyzeSearchQuery, hasConditions, SORT_BY_LABELS } from '@/lib/searchParser'
import type { SearchCondition } from '@/lib/searchParser'
import {
  needsTodayAction, isOverdue, COLORS, getPaymentBadge, needsAfterPhoto,
  isInProgressStatus, isScheduled, needsRecheck, isUnresolved, getDisplayCost, getCostBearerStatus,
  COST_ESTIMATED_COLOR, COST_CONFIRMED_COLOR, isRecurring,
  isKpiCompleted, filterByOccurredPeriod, sumCostSummary,
  type StandardPeriodType, STANDARD_PERIOD_OPTIONS, computeStandardPeriod,
  STATUS_FLOW, STATUS_META, COST_BEARER_CATEGORIES,
} from '@/lib/designTokens'
import { canDelete, canRegister, useCurrentRole } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'
import { useMediaQuery } from '@/lib/useMediaQuery'

const DEFECT_TYPE_OPTIONS = ['하자사항', '일반사항', '확인 필요'] as const
// Dashboard/하자목록/AI보고서와 동일한 비용부담주체 기준(getCostBearerStatus) — 옵션 목록도 맞춰야 필터가 정상 동작한다.
const COST_BEARER_OPTIONS = COST_BEARER_CATEGORIES

function fmtKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}

// 운영현황(구 /analytics 캘린더+트리아지)과 하자목록(구 /defects)을 하나의 화면으로 통합한다.
// 상단 필터(기간/상태/심각도/카테고리/하자구분/비용부담주체/검색)를 두 탭(달력 보기/목록 보기)이
// 공유하고, 각 탭은 이동 전 화면의 기존 컴포넌트(DefectCalendar/DefectsTable)를 그대로 재사용한다.
export default function OperationsStatusPage() {
  const { state, restoreDefect } = useStore()
  const [updatedAt, setUpdatedAt] = useState('')
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const isTablet = useMediaQuery('(max-width: 1024px)')
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독
  const canSeeDeleted = canDelete(role)
  const canCreate = canRegister(role)

  useEffect(() => {
    setUpdatedAt(new Date().toLocaleString('ko-KR'))
  }, [])

  // ── 기간 필터 (라이브 적용) — Dashboard/AI보고서/보고서와 동일한 computeStandardPeriod() ──
  const [periodType, setPeriodType] = useState<StandardPeriodType>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const period = computeStandardPeriod(periodType, customFrom || null, customTo || null)

  // ── 상태/심각도/카테고리/하자구분/비용부담주체/검색 (초안 → 적용) — 하자목록 필터 폼 그대로 재사용 ──
  const [draftNlQuery, setDraftNlQuery] = useState('')
  const [draftStatus, setDraftStatus] = useState('')
  const [draftSeverity, setDraftSeverity] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [draftDefectType, setDraftDefectType] = useState('')
  const [draftCostBearer, setDraftCostBearer] = useState('')

  const [nlQuery, setNlQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [defectTypeFilter, setDefectTypeFilter] = useState('')
  const [costBearerFilter, setCostBearerFilter] = useState('')

  const [showDeleted, setShowDeleted] = useState(false)
  const [quickFilter, setQuickFilter] = useState<string | null>(null)

  function applyFilters() {
    setNlQuery(draftNlQuery)
    setStatusFilter(draftStatus)
    setSeverityFilter(draftSeverity)
    setCategoryFilter(draftCategory)
    setDefectTypeFilter(draftDefectType)
    setCostBearerFilter(draftCostBearer)
  }

  // 하자 데이터(localStorage)는 절대 지우지 않는다 — 조회기간/필터/탭 선택 같은 조회 상태만 초기화한다.
  function resetFilters() {
    setDraftNlQuery(''); setDraftStatus(''); setDraftSeverity('')
    setDraftCategory(''); setDraftDefectType(''); setDraftCostBearer('')
    setNlQuery(''); setStatusFilter(''); setSeverityFilter('')
    setCategoryFilter(''); setDefectTypeFilter(''); setCostBearerFilter('')
    setQuickFilter(null)
    setSelectedDate(null)
    setPeriodType('month')
    setCustomFrom(''); setCustomTo('')
  }

  const nlCondition: SearchCondition | null = nlQuery.trim() ? analyzeSearchQuery(nlQuery) : null
  const nlHasConditions = !!(nlCondition && hasConditions(nlCondition))

  const nonDeleted = state.defects.filter(d => !d.deletedAt)
  const missingOccurredAtCount = nonDeleted.filter(d => !d.firstOccurredAt).length

  const base = state.defects.filter(d => (canSeeDeleted && showDeleted) ? !!d.deletedAt : !d.deletedAt)
  // Dashboard/운영현황과 동일한 filterByOccurredPeriod() — 발생일(firstOccurredAt) 미입력 건은
  // 어느 기간에도 속하지 않으므로 항상 제외한다(missingOccurredAtCount로 별도 안내).
  const periodDefects = filterByOccurredPeriod(base, period.from, period.to)

  // 달력 보기/목록 보기 두 탭이 공유하는 필터링된 데이터 — 하자목록과 동일한 필터 로직을 그대로 재사용한다.
  const filteredDefects = periodDefects.filter(d => {
    if (statusFilter && d.status !== statusFilter) return false
    if (severityFilter && d.severity !== severityFilter) return false
    if (categoryFilter && d.categoryId !== parseInt(categoryFilter)) return false
    if (defectTypeFilter && (d.defectType ?? '확인 필요') !== defectTypeFilter) return false
    if (costBearerFilter && getCostBearerStatus(d) !== costBearerFilter) return false

    if (nlCondition) {
      if (nlHasConditions) {
        if (nlCondition.keyword) {
          const kw = nlCondition.keyword.toLowerCase()
          if (!(d.title.toLowerCase().includes(kw) ||
                d.description?.toLowerCase().includes(kw) ||
                d.locationText?.toLowerCase().includes(kw))) return false
        }
        if (nlCondition.category) {
          const matchedCat = state.categories.find(c => c.name.toLowerCase() === nlCondition.category!.toLowerCase())
          if (matchedCat && d.categoryId !== matchedCat.id) return false
        }
        if (nlCondition.location) {
          const loc = nlCondition.location.toLowerCase()
          if (d.locationText && !d.locationText.toLowerCase().includes(loc)) return false
        }
        if (nlCondition.rootCause) {
          const rc = nlCondition.rootCause
          const inAiField = d.rootCause ? d.rootCause.includes(rc) : false
          const inText = d.title.includes(rc) || (d.description?.includes(rc) ?? false)
          if (!inAiField && !inText) return false
        }
        if (nlCondition.dateRange.start || nlCondition.dateRange.end) {
          const dateStr = d.firstOccurredAt || d.createdAt
          const date = new Date(dateStr)
          if (nlCondition.dateRange.start && date < nlCondition.dateRange.start) return false
          if (nlCondition.dateRange.end && date > nlCondition.dateRange.end) return false
        }
      } else {
        const kw = nlQuery.trim().toLowerCase()
        if (!(d.title.toLowerCase().includes(kw) ||
              d.description?.toLowerCase().includes(kw) ||
              d.locationText?.toLowerCase().includes(kw))) return false
      }
    }
    return true
  }).sort((a, b) => {
    if (nlCondition?.sortBy === 'recurrenceCount') return b.recurrenceCount - a.recurrenceCount
    if (nlCondition?.sortBy === 'totalCost') return b.totalCost - a.totalCost
    return b.id - a.id
  })

  // 목록 보기 탭에서만 적용되는 빠른 필터 — 하자목록의 기존 quickFilter 스위치 그대로 재사용.
  // (칩으로는 today/critical/overdue/recurring/nophoto만 노출하고, 나머지는 좌측 미완결현황
  // 카드 클릭으로 진입한다 — 카드 라벨과 1:1 대응하는 키를 그대로 쓴다.)
  const listDefects = filteredDefects.filter(d => {
    if (quickFilter === 'today' && !needsTodayAction(d, nonDeleted)) return false
    if (quickFilter === 'critical' && !(d.severity === 'critical' && d.status !== 'completed')) return false
    if (quickFilter === 'overdue' && !isOverdue(d)) return false
    if (quickFilter === 'recurring' && !(isRecurring(d, nonDeleted) && d.status !== 'completed')) return false
    if (quickFilter === 'recheck' && d.status !== 'recheck_needed') return false
    if (quickFilter === 'inprogress' && !isInProgressStatus(d)) return false
    if (quickFilter === 'scheduled' && !isScheduled(d)) return false
    if (quickFilter === 'unresolved' && !isUnresolved(d)) return false
    if (quickFilter === 'action_done' && d.status !== 'action_done') return false
    if (quickFilter === 'completed' && !isKpiCompleted(d)) return false
    if (quickFilter === 'nophoto' && !needsAfterPhoto(d, state.files)) return false
    return true
  })

  // ── 달력 보기: 기존 운영현황(구 /analytics)의 미완결 현황/비용/Top3 카드 — filteredDefects 기준 ──
  const inProgressItems = filteredDefects.filter(isInProgressStatus)
  const scheduledItems = filteredDefects.filter(isScheduled)
  const overdueItems = filteredDefects.filter(isOverdue)
  const recheckItems = filteredDefects.filter(needsRecheck)
  const unresolvedIds = new Set<number>([...inProgressItems, ...scheduledItems, ...overdueItems, ...recheckItems].map(d => d.id))
  const unresolvedStatusCards = [
    { key: 'inprogress', label: '진행 중', count: inProgressItems.length, color: '#1D4ED8' },
    { key: 'scheduled', label: '조치 예정', count: scheduledItems.length, color: '#1D4ED8' },
    { key: 'overdue', label: '지연', count: overdueItems.length, color: '#C2410C' },
    { key: 'recheck', label: '재점검 필요', count: recheckItems.length, color: '#C2410C' },
  ]
  const actionDoneItems = filteredDefects.filter(d => d.status === 'action_done')
  const completedItems = filteredDefects.filter(isKpiCompleted)
  const recurringItems = filteredDefects.filter(d => isRecurring(d, nonDeleted))

  const { confirmed: periodConfirmedCost, pending: periodEstimatedPendingCost } = sumCostSummary(filteredDefects)
  function costBucket(d: Defect): '우리측' | '타업체' | '기타' {
    const bearer = getCostBearerStatus(d)
    if (bearer === '재단') return '우리측'
    if (bearer === '외주업체') return '타업체'
    return '기타'
  }
  const periodOwnCost = filteredDefects.filter(d => costBucket(d) === '우리측').reduce((s, d) => s + (getDisplayCost(d).confirmed ? (getDisplayCost(d).amount ?? 0) : 0), 0)
  const periodClaimCost = filteredDefects.filter(d => costBucket(d) === '타업체').reduce((s, d) => s + (getDisplayCost(d).confirmed ? (getDisplayCost(d).amount ?? 0) : 0), 0)

  const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const top3 = [...filteredDefects]
    .filter(d => needsTodayAction(d, nonDeleted))
    .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || b.recurrenceCount - a.recurrenceCount)
    .slice(0, 3)

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 10, boxShadow: '0 1px 3px rgba(10,37,64,0.05)', overflow: 'hidden' }
  const selectStyle: React.CSSProperties = {
    border: '1px solid #e3e8ef', borderRadius: 6, padding: '5px 22px 5px 8px',
    fontSize: '0.74rem', fontFamily: 'inherit', color: '#425466', background: '#f5f7fa', outline: 'none',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='5'%3E%3Cpath d='M0 0l4.5 5L9 0z' fill='%23697386'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 7px center', cursor: 'pointer',
  }
  const inputStyle: React.CSSProperties = {
    border: '1px solid #e3e8ef', borderRadius: 6, padding: '5px 10px 5px 26px',
    fontSize: '0.74rem', fontFamily: 'inherit', color: '#0a2540', background: '#f5f7fa', outline: 'none', width: 200,
  }

  const filterActive = !!(nlQuery || statusFilter || severityFilter || categoryFilter || defectTypeFilter || costBearerFilter || quickFilter)

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540' }}>운영현황</h1>
          <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 1 }}>업데이트 {updatedAt} · 조회기간: {period.label}</div>
        </div>
        <button onClick={resetFilters} title="조회기간·필터·탭 선택만 초기화합니다. 하자 데이터는 지워지지 않습니다." style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}>
          <i className="fa-solid fa-rotate" /> 초기화
        </button>
      </div>

      {/* 기간 필터 */}
      <div style={{ position: 'sticky', top: 53, zIndex: 41, background: '#fff', borderBottom: '1px solid #e3e8ef', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
        {STANDARD_PERIOD_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setPeriodType(opt.key)}
            style={{
              padding: '5px 12px', borderRadius: 999, fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              border: periodType === opt.key ? '1.5px solid #635bff' : '1.5px solid #e3e8ef',
              background: periodType === opt.key ? '#635bff' : '#fff',
              color: periodType === opt.key ? '#fff' : '#425466',
            }}
          >
            {opt.label}
          </button>
        ))}
        {periodType === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e3e8ef', fontSize: '0.73rem', fontFamily: 'inherit' }} />
            <span style={{ color: '#b0bac6' }}>~</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e3e8ef', fontSize: '0.73rem', fontFamily: 'inherit' }} />
          </div>
        )}
        {missingOccurredAtCount > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', fontWeight: 600, color: '#B06B1A', background: '#FFF7ED', padding: '4px 9px', borderRadius: 6, whiteSpace: 'nowrap' }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />발생일 미입력 {missingOccurredAtCount}건 (집계 제외)
          </span>
        )}
      </div>

      {/* 상태/심각도/카테고리/하자구분/비용부담주체/검색 + 하자등록 */}
      <form
        onSubmit={e => { e.preventDefault(); applyFilters() }}
        style={{ borderBottom: '1px solid #e3e8ef', background: '#fff', padding: '8px 20px', display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}
      >
        <select style={selectStyle} value={draftStatus} onChange={e => setDraftStatus(e.target.value)}>
          <option value="">전체 상태</option>
          {STATUS_FLOW.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select style={selectStyle} value={draftSeverity} onChange={e => setDraftSeverity(e.target.value)}>
          <option value="">전체 심각도</option>
          <option value="critical">긴급</option>
          <option value="high">높음</option>
          <option value="medium">보통</option>
          <option value="low">낮음</option>
        </select>
        <select style={selectStyle} value={draftCategory} onChange={e => setDraftCategory(e.target.value)}>
          <option value="">전체 카테고리</option>
          {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select style={selectStyle} value={draftDefectType} onChange={e => setDraftDefectType(e.target.value)}>
          <option value="">하자 구분 전체</option>
          {DEFECT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select style={selectStyle} value={draftCostBearer} onChange={e => setDraftCostBearer(e.target.value)}>
          <option value="">비용부담주체 전체</option>
          {COST_BEARER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div style={{ position: 'relative' }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#635bff', fontSize: '0.68rem', pointerEvents: 'none' }} />
          <input
            style={inputStyle}
            type="text"
            placeholder="검색 (예: 지난달 누수 하자)"
            value={draftNlQuery}
            onChange={e => setDraftNlQuery(e.target.value)}
          />
        </div>

        <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 600, background: '#635bff', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          <i className="fa-solid fa-magnifying-glass" style={{ fontSize: '0.65rem' }} /> 검색
        </button>
        <button type="button" onClick={resetFilters} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 600, background: '#fff', color: '#697386', border: '1px solid #e3e8ef', cursor: 'pointer', fontFamily: 'inherit' }}>
          초기화
        </button>

        {canCreate && (
          <Link
            href="/defects/new"
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, background: '#635bff', color: '#fff', textDecoration: 'none' }}
          >
            <i className="fa-solid fa-plus" /> 하자 등록
          </Link>
        )}
      </form>

      {nlHasConditions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '8px 20px 0' }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#635bff', letterSpacing: '0.06em', textTransform: 'uppercase' }}>AI 검색 파싱 결과</span>
          {nlCondition?.category && <span style={{ fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,91,255,.1)', color: '#635bff' }}>카테고리: {nlCondition.category}</span>}
          {nlCondition?.location && <span style={{ fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#ebf3fe', color: '#1d6dc2' }}>위치: {nlCondition.location}</span>}
          {nlCondition?.rootCause && <span style={{ fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#fef3ee', color: '#c2440c' }}>원인: {nlCondition.rootCause}</span>}
          {nlCondition?.sortBy && <span style={{ fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#fef3e2', color: '#b06b1a' }}>정렬: {SORT_BY_LABELS[nlCondition.sortBy]}</span>}
        </div>
      )}

      {/* 달력 보기 / 목록 보기 탭 */}
      <div style={{ padding: '12px 20px 0', display: 'flex', gap: 6 }}>
        {([{ key: 'calendar', label: '달력 보기', icon: 'fa-solid fa-calendar-days' }, { key: 'list', label: '목록 보기', icon: 'fa-solid fa-list-check' }] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setViewMode(t.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: '8px 8px 0 0', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid #e3e8ef', borderBottom: viewMode === t.key ? '1px solid #fff' : '1px solid #e3e8ef',
              background: viewMode === t.key ? '#fff' : '#f5f7fa',
              color: viewMode === t.key ? '#635bff' : '#697386',
              position: 'relative', top: 1,
            }}
          >
            <i className={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px 20px', borderTop: '1px solid #e3e8ef' }}>
        {viewMode === 'calendar' ? (
          <>
            {/* 좌우 분할: 달력 / 핵심카드 — 기존 운영현황(구 /analytics) 레이아웃 그대로 재사용 */}
            <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 360px', gap: 12, marginBottom: 16 }}>
              <div style={{ ...card, padding: 14 }}>
                <DefectCalendar defects={filteredDefects} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ ...card, padding: '14px 16px', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: COLORS.danger, borderRadius: '10px 10px 0 0' }} />
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#697386', marginBottom: 8 }}>🚨 미완결 현황 · {period.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {unresolvedStatusCards.map(c => (
                      <button
                        key={c.key}
                        onClick={() => { setViewMode('list'); setQuickFilter(c.key) }}
                        style={{ textAlign: 'left', cursor: 'pointer', display: 'block', padding: '8px 10px', borderRadius: 8, background: '#f8f9fb', border: '1px solid #eef1f5' }}
                      >
                        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#697386' }}>{c.label}</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: c.color }}>{c.count}<span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#697386', marginLeft: 3 }}>건</span></div>
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => { setViewMode('list'); setQuickFilter('unresolved') }}
                      style={{ textAlign: 'left', cursor: 'pointer', display: 'block', padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FCA5A5' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#B91C1C' }}>미완결 합계</span>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#B91C1C' }}>{unresolvedIds.size}<span style={{ fontSize: '0.75rem', fontWeight: 600, marginLeft: 3 }}>건</span></span>
                      </div>
                    </button>
                    <button
                      onClick={() => { setViewMode('list'); setQuickFilter('action_done') }}
                      title="조치완료: 조치는 끝났지만 관리자 최종완료 승인 전 단계"
                      style={{ textAlign: 'left', cursor: 'pointer', display: 'block', padding: '10px 12px', borderRadius: 8, background: '#F0FDF4', border: '1px solid #86EFAC' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803D' }}>조치완료</span>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803D' }}>{actionDoneItems.length}<span style={{ fontSize: '0.75rem', fontWeight: 600, marginLeft: 3 }}>건</span></span>
                      </div>
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => { setViewMode('list'); setQuickFilter('completed') }}
                      style={{ textAlign: 'left', cursor: 'pointer', padding: '8px 10px', borderRadius: 8, background: '#f8f9fb', border: '1px solid #eef1f5' }}
                    >
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#697386' }}>완료</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#16A34A' }}>{completedItems.length}<span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#697386', marginLeft: 3 }}>건</span></div>
                    </button>
                    <button
                      onClick={() => { setViewMode('list'); setQuickFilter('recurring') }}
                      style={{ textAlign: 'left', cursor: 'pointer', padding: '8px 10px', borderRadius: 8, background: '#f8f9fb', border: '1px solid #eef1f5' }}
                    >
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#697386' }}>반복</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#be1044' }}>{recurringItems.length}<span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#697386', marginLeft: 3 }}>건</span></div>
                    </button>
                  </div>
                </div>

                <div style={{ ...card, padding: '14px 16px', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#16A34A', borderRadius: '10px 10px 0 0' }} />
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#697386', marginBottom: 6 }}>💰 {period.label} 집행 비용</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: COST_CONFIRMED_COLOR.text, letterSpacing: '-0.03em', lineHeight: 1 }}>{fmtKRW(periodConfirmedCost)}</div>
                    <span style={{ fontSize: '0.64rem', fontWeight: 700, color: COST_CONFIRMED_COLOR.text, background: COST_CONFIRMED_COLOR.bg, padding: '2px 7px', borderRadius: 999 }}>확정</span>
                  </div>
                  {periodEstimatedPendingCost > 0 && (
                    <div style={{ fontSize: '0.7rem', color: COST_ESTIMATED_COLOR.text, marginTop: 4 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, background: COST_ESTIMATED_COLOR.bg, padding: '1px 6px', borderRadius: 4, marginRight: 5 }}>예상(미확정)</span>
                      {fmtKRW(periodEstimatedPendingCost)}
                    </div>
                  )}
                  {(periodOwnCost > 0 || periodClaimCost > 0) && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                      {periodOwnCost > 0 && <span style={{ fontSize: '0.68rem', color: '#697386' }}>우리측 부담 <strong style={{ color: '#425466' }}>{fmtKRW(periodOwnCost)}</strong></span>}
                      {periodClaimCost > 0 && <span style={{ fontSize: '0.68rem', color: '#697386' }}>타업체 청구 <strong style={{ color: '#425466' }}>{fmtKRW(periodClaimCost)}</strong></span>}
                    </div>
                  )}
                </div>

                {top3.length > 0 && (
                  <div style={card}>
                    <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #f0f4f8' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540' }}>오늘 우선처리 Top 3</div>
                    </div>
                    <div>
                      {top3.map(d => {
                        const paymentBadge = getPaymentBadge(d, state.files)
                        return (
                          <Link key={d.id} href={`/defects/${d.id}`} style={{ display: 'block', padding: '8px 14px', textDecoration: 'none', borderBottom: '1px solid #f7f8fa' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0a2540', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                              <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.6rem', color: '#b0bac6' }} />
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#697386', marginBottom: 4 }}>{d.locationText || '-'}</div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                              {isOverdue(d) && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: COLORS.warning, background: '#FFF7ED', padding: '1px 6px', borderRadius: 4 }}>지연</span>}
                              {paymentBadge && paymentBadge.tone !== 'success' && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: paymentBadge.tone === 'danger' ? COLORS.danger : COLORS.warning, background: paymentBadge.tone === 'danger' ? '#FEF2F2' : '#FFF7ED', padding: '1px 6px', borderRadius: 4 }}>{paymentBadge.label}</span>}
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {unresolvedIds.size === 0 && (
              <EmptyState icon="fa-solid fa-circle-check" message="처리할 미완결 항목이 없습니다." actionLabel={canCreate ? '하자 등록' : undefined} actionHref={canCreate ? '/defects/new' : undefined} />
            )}
          </>
        ) : (
          <>
            {/* 목록 보기 — 빠른 필터 칩(상단 8개 필터로 표현되지 않는 항목만) + 삭제됨 보기 — 하자목록 그대로 재사용 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {([
                { key: 'today', label: '오늘 우선처리', color: COLORS.danger },
                { key: 'critical', label: '긴급만', color: COLORS.critical },
                { key: 'overdue', label: '지연만', color: COLORS.warning },
                { key: 'recurring', label: '반복만', color: COLORS.action },
                { key: 'nophoto', label: '조치후 사진 미첨부', color: COLORS.warning },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setQuickFilter(quickFilter === f.key ? null : f.key)}
                  style={{
                    padding: '3px 10px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${quickFilter === f.key ? f.color : '#E5E7EB'}`,
                    background: quickFilter === f.key ? f.color : '#fff',
                    color: quickFilter === f.key ? '#fff' : '#374151',
                  }}
                >
                  {f.label}
                </button>
              ))}
              {canSeeDeleted && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#697386', cursor: 'pointer', marginLeft: 'auto' }}>
                  <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
                  삭제됨 보기
                </label>
              )}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#697386', marginBottom: 8 }}>전체 {listDefects.length}건</div>

            <DefectsTable
              defects={listDefects}
              filterActive={filterActive}
              canSeeDeleted={canSeeDeleted}
              showDeleted={showDeleted}
              onRestore={restoreDefect}
            />
          </>
        )}
      </div>
    </div>
  )
}

