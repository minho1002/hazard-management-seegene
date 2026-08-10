'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { analyzeSearchQuery, hasConditions, SORT_BY_LABELS } from '@/lib/searchParser'
import type { SearchCondition } from '@/lib/searchParser'
import DefectsTable from '@/components/defects/DefectsTable'
import {
  isOverdue, isRecurring, needsTodayAction, needsAfterPhoto, getCostBearerStatus,
  isInProgressStatus, isScheduled, isUnresolved, isKpiCompleted,
  COLORS, STATUS_FLOW, STATUS_META, COST_BEARER_CATEGORIES,
} from '@/lib/designTokens'
import { canDelete, canRegister, useCurrentRole } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'

const DEFECT_TYPE_OPTIONS = ['하자사항', '일반사항', '확인 필요'] as const
// Dashboard/운영현황/AI보고서와 동일한 비용부담주체 기준(getCostBearerStatus) — 옵션 목록도 맞춰야 필터가 정상 동작한다.
const COST_BEARER_OPTIONS = COST_BEARER_CATEGORIES

const SEVERITY_LABELS: Record<string, string> = { critical: '긴급', high: '높음', medium: '보통', low: '낮음' }

// 퀵필터 정의 — 필터링 로직(filtered 안의 quickFilter 분기)은 그대로 두고 노출 위치만 나눈다.
// 상단에는 사용 빈도가 높은 5개만, 나머지는 "더보기" 메뉴 안으로 옮겨 화면을 간결하게 유지한다.
const PRIMARY_QUICK_FILTERS = [
  { key: 'today', label: '오늘 우선처리', color: COLORS.danger },
  { key: 'critical', label: '긴급', color: COLORS.critical },
  { key: 'overdue', label: '지연', color: COLORS.warning },
  { key: 'recurring', label: '반복', color: COLORS.action },
  { key: 'recheck', label: '재점검 필요', color: COLORS.warning },
] as const
const MORE_QUICK_FILTERS = [
  { key: 'nophoto', label: '조치후 사진 미첨부', color: COLORS.warning },
  { key: 'unclassified', label: '확인 필요', color: COLORS.textMuted },
  { key: 'costunresolved', label: '비용부담 미정', color: COLORS.danger },
] as const
const ALL_QUICK_FILTERS = [...PRIMARY_QUICK_FILTERS, ...MORE_QUICK_FILTERS]

function DefectsPageInner() {
  const searchParams = useSearchParams()
  const urlFilter = searchParams.get('filter')
  const urlSearch = searchParams.get('search')
  const { state, restoreDefect } = useStore()

  // 콤팩트 필터 1줄에 들어가는 조건들 — 검색/초기화 버튼으로 일괄 적용
  const [draftDateFrom, setDraftDateFrom] = useState('')
  const [draftDateTo, setDraftDateTo] = useState('')
  const [draftNlQuery, setDraftNlQuery] = useState('')
  const [draftStatus, setDraftStatus] = useState('')
  const [draftSeverity, setDraftSeverity] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [draftDefectType, setDraftDefectType] = useState('')
  const [draftCostBearer, setDraftCostBearer] = useState('')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [nlQuery, setNlQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [defectTypeFilter, setDefectTypeFilter] = useState('')
  const [costBearerFilter, setCostBearerFilter] = useState('')

  const [quickFilter, setQuickFilter] = useState<string | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  // UI 상태만 담당 — 필터링 로직에는 관여하지 않는다.
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showMoreQuickFilters, setShowMoreQuickFilters] = useState(false)
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독
  const canSeeDeleted = canDelete(role)
  const canCreate = canRegister(role)

  // 대시보드 카드(위험 하자 TOP5/반복 하자 TOP5/오늘 우선처리 등)의 "더보기"는 같은 /defects 라우트로
  // 쿼리스트링만 바꿔서 이동하므로 컴포넌트가 리마운트되지 않는다. 따라서 urlFilter/urlSearch를
  // useState 초기값으로만 반영하면 이전 화면에서 남아있던 퀵필터/기간/검색 조건이 그대로 남아 새
  // 조건과 충돌한다(대시보드 "더보기" 클릭 시 대상 하자가 목록에 안 보이던 원인). 쿼리스트링이 바뀔
  // 때마다 기존 필터를 전부 초기화한 뒤 이번에 전달된 조건만 새로 적용한다. /defects로 직접 진입해
  // 쿼리스트링이 없을 때도 이 effect가 한 번 실행되며, 이 경우 quickFilter는 null로 남아 퀵필터가
  // 자동 활성화되지 않고 전체 하자가 기본으로 보인다.
  useEffect(() => {
    setDraftDateFrom(''); setDraftDateTo('')
    setDraftStatus(''); setDraftSeverity(''); setDraftCategory('')
    setDraftDefectType(''); setDraftCostBearer('')
    setDateFrom(''); setDateTo('')
    setStatusFilter(''); setSeverityFilter(''); setCategoryFilter('')
    setDefectTypeFilter(''); setCostBearerFilter('')
    setShowDeleted(false)

    setDraftNlQuery(urlSearch || '')
    setNlQuery(urlSearch || '')
    setQuickFilter(urlFilter)
  }, [urlFilter, urlSearch])

  function applyFilters() {
    setDateFrom(draftDateFrom)
    setDateTo(draftDateTo)
    setNlQuery(draftNlQuery)
    setStatusFilter(draftStatus)
    setSeverityFilter(draftSeverity)
    setCategoryFilter(draftCategory)
    setDefectTypeFilter(draftDefectType)
    setCostBearerFilter(draftCostBearer)
  }

  function resetFilters() {
    setDraftDateFrom(''); setDraftDateTo(''); setDraftNlQuery('')
    setDraftStatus(''); setDraftSeverity(''); setDraftCategory('')
    setDraftDefectType(''); setDraftCostBearer('')
    setDateFrom(''); setDateTo(''); setNlQuery('')
    setStatusFilter(''); setSeverityFilter(''); setCategoryFilter('')
    setDefectTypeFilter(''); setCostBearerFilter('')
    setQuickFilter(null)
  }

  const nlCondition: SearchCondition | null = nlQuery.trim() ? analyzeSearchQuery(nlQuery) : null
  const nlHasConditions = !!(nlCondition && hasConditions(nlCondition))

  const filtered = [...state.defects]
    .filter(d => (canSeeDeleted && showDeleted) ? !!d.deletedAt : !d.deletedAt)
    .sort((a, b) => {
      if (nlCondition?.sortBy === 'recurrenceCount') return b.recurrenceCount - a.recurrenceCount
      if (nlCondition?.sortBy === 'totalCost') return b.totalCost - a.totalCost
      return b.id - a.id
    })
    .filter(d => {
      if (quickFilter === 'today' && !needsTodayAction(d, state.defects)) return false
      if (quickFilter === 'critical' && !(d.severity === 'critical' && d.status !== 'completed')) return false
      if (quickFilter === 'overdue' && !isOverdue(d)) return false
      if (quickFilter === 'recurring' && !(isRecurring(d, state.defects) && d.status !== 'completed')) return false
      if (quickFilter === 'recheck' && d.status !== 'recheck_needed') return false
      if (quickFilter === 'inprogress' && !isInProgressStatus(d)) return false
      if (quickFilter === 'scheduled' && !isScheduled(d)) return false
      if (quickFilter === 'unresolved' && !isUnresolved(d)) return false
      if (quickFilter === 'action_done' && d.status !== 'action_done') return false
      if (quickFilter === 'completed' && !isKpiCompleted(d)) return false
      if (quickFilter === 'nophoto' && !needsAfterPhoto(d, state.files)) return false
      if (quickFilter === 'unclassified' && (d.defectType ?? '확인 필요') !== '확인 필요') return false
      if (quickFilter === 'costunresolved' && getCostBearerStatus(d) !== '미정') return false

      if (dateFrom || dateTo) {
        const dateStr = d.firstOccurredAt || d.createdAt
        if (dateFrom && dateStr.slice(0, 10) < dateFrom) return false
        if (dateTo && dateStr.slice(0, 10) > dateTo) return false
      }
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
            const matchedCat = state.categories.find(c =>
              c.name.toLowerCase() === nlCondition.category!.toLowerCase()
            )
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
          // 자연어로 해석되지 않으면 일반 키워드 검색으로 대체 (제목/설명/위치)
          const kw = nlQuery.trim().toLowerCase()
          if (!(d.title.toLowerCase().includes(kw) ||
                d.description?.toLowerCase().includes(kw) ||
                d.locationText?.toLowerCase().includes(kw))) return false
        }
      }
      return true
    })

  const card = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 10, boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }

  const dateInputStyle: React.CSSProperties = {
    border: '1px solid #e3e8ef', borderRadius: 6, padding: '5px 7px',
    fontSize: '0.74rem', fontFamily: 'inherit', color: '#0a2540', background: '#f5f7fa', outline: 'none', width: 122,
  }
  const inputStyle: React.CSSProperties = {
    border: '1px solid #e3e8ef', borderRadius: 6, padding: '5px 10px 5px 26px',
    fontSize: '0.74rem', fontFamily: 'inherit', color: '#0a2540', background: '#f5f7fa', outline: 'none', width: 200,
  }
  const selectStyle: React.CSSProperties = {
    border: '1px solid #e3e8ef', borderRadius: 6, padding: '5px 22px 5px 8px',
    fontSize: '0.74rem', fontFamily: 'inherit', color: '#425466', background: '#f5f7fa', outline: 'none',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='5'%3E%3Cpath d='M0 0l4.5 5L9 0z' fill='%23697386'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 7px center', cursor: 'pointer',
  }

  const filterActive = !!(dateFrom || dateTo || nlQuery || statusFilter || severityFilter || categoryFilter || defectTypeFilter || costBearerFilter || quickFilter)

  // "상세필터" 버튼의 적용 건수 배지 — 상세필터 패널 안 항목(심각도/하자구분/비용부담주체/AI검색/삭제됨 보기)만 센다.
  const advancedActiveCount = [severityFilter, defectTypeFilter, costBearerFilter, nlQuery.trim()].filter(Boolean).length + (showDeleted ? 1 : 0)
  const activeExtraQuickFilter = MORE_QUICK_FILTERS.find(f => f.key === quickFilter)

  // 활성 필터 태그 — 검색 영역 아래 표시, 개별 해제 시 적용값과 입력칸(draft) 모두 비워서
  // 이후 "검색" 버튼을 눌러도 지운 조건이 되살아나지 않게 한다.
  type ActiveTag = { key: string; label: string; onRemove: () => void }
  const activeTags: ActiveTag[] = []
  if (quickFilter) {
    const qf = ALL_QUICK_FILTERS.find(f => f.key === quickFilter)
    if (qf) activeTags.push({ key: 'quick', label: qf.label, onRemove: () => setQuickFilter(null) })
  }
  if (dateFrom || dateTo) {
    activeTags.push({
      key: 'date', label: `기간: ${dateFrom || '...'} ~ ${dateTo || '...'}`,
      onRemove: () => { setDateFrom(''); setDateTo(''); setDraftDateFrom(''); setDraftDateTo('') },
    })
  }
  if (statusFilter) {
    activeTags.push({
      key: 'status', label: `상태: ${STATUS_META[statusFilter as keyof typeof STATUS_META]?.label ?? statusFilter}`,
      onRemove: () => { setStatusFilter(''); setDraftStatus('') },
    })
  }
  if (categoryFilter) {
    const cat = state.categories.find(c => String(c.id) === categoryFilter)
    activeTags.push({
      key: 'category', label: `카테고리: ${cat?.name ?? categoryFilter}`,
      onRemove: () => { setCategoryFilter(''); setDraftCategory('') },
    })
  }
  if (severityFilter) {
    activeTags.push({
      key: 'severity', label: `심각도: ${SEVERITY_LABELS[severityFilter] ?? severityFilter}`,
      onRemove: () => { setSeverityFilter(''); setDraftSeverity('') },
    })
  }
  if (defectTypeFilter) {
    activeTags.push({
      key: 'defectType', label: `하자구분: ${defectTypeFilter}`,
      onRemove: () => { setDefectTypeFilter(''); setDraftDefectType('') },
    })
  }
  if (costBearerFilter) {
    activeTags.push({
      key: 'costBearer', label: `비용부담주체: ${costBearerFilter}`,
      onRemove: () => { setCostBearerFilter(''); setDraftCostBearer('') },
    })
  }
  if (nlQuery.trim()) {
    activeTags.push({
      key: 'nlQuery', label: `AI 검색: ${nlQuery.trim()}`,
      onRemove: () => { setNlQuery(''); setDraftNlQuery('') },
    })
  }
  if (showDeleted) {
    activeTags.push({ key: 'showDeleted', label: '삭제됨 보기', onRemove: () => setShowDeleted(false) })
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Page Header */}
      <div style={{ padding: '14px 24px 12px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.02rem', fontWeight: 700, color: '#0a2540' }}>하자 목록</h1>
          <div style={{ fontSize: '0.7rem', color: '#697386', marginTop: 2 }}>전체 {filtered.length}건</div>
        </div>
        {canCreate && (
          <Link
            href="/defects/new"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, background: '#635bff', color: '#fff', textDecoration: 'none' }}
          >
            <i className="fa-solid fa-plus" /> 하자 등록
          </Link>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '14px 20px' }}>

        {/* 퀵필터 칩 — 상단엔 5개만, 나머지는 더보기 메뉴 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {PRIMARY_QUICK_FILTERS.map(f => (
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

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowMoreQuickFilters(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${activeExtraQuickFilter ? activeExtraQuickFilter.color : '#E5E7EB'}`,
                background: activeExtraQuickFilter ? activeExtraQuickFilter.color : '#fff',
                color: activeExtraQuickFilter ? '#fff' : '#374151',
              }}
            >
              {activeExtraQuickFilter ? activeExtraQuickFilter.label : '더보기'}
              <i className={`fa-solid fa-chevron-${showMoreQuickFilters ? 'up' : 'down'}`} style={{ fontSize: '0.55rem' }} />
            </button>
            {showMoreQuickFilters && (
              <>
                <div onClick={() => setShowMoreQuickFilters(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 41, minWidth: 180,
                  background: '#fff', border: '1px solid #e3e8ef', borderRadius: 8, boxShadow: '0 4px 14px rgba(10,37,64,.12)',
                  padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {MORE_QUICK_FILTERS.map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => { setQuickFilter(quickFilter === f.key ? null : f.key); setShowMoreQuickFilters(false) }}
                      style={{
                        textAlign: 'left', padding: '6px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
                        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: quickFilter === f.key ? f.color + '1a' : 'transparent',
                        color: quickFilter === f.key ? f.color : '#374151',
                      }}
                    >
                      {quickFilter === f.key && <i className="fa-solid fa-check" style={{ marginRight: 6, fontSize: '0.6rem' }} />}
                      {f.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 기본 필터 줄 — 기간 → 상태 → 카테고리 → 검색 → 초기화 → 상세필터. 심각도/하자구분/비용부담주체/AI검색/
            삭제됨 보기는 상세필터 패널로 옮겼을 뿐, applyFilters/resetFilters와 filtered 로직은 그대로다. */}
        <form
          onSubmit={e => { e.preventDefault(); applyFilters() }}
          style={{ ...card, padding: '8px 12px', marginBottom: 8 }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="fa-solid fa-calendar-days" style={{ fontSize: '0.7rem', color: '#b0bac6' }} />
              <input type="date" style={dateInputStyle} value={draftDateFrom} onChange={e => setDraftDateFrom(e.target.value)} />
              <span style={{ color: '#b0bac6', fontSize: '0.72rem' }}>~</span>
              <input type="date" style={dateInputStyle} value={draftDateTo} onChange={e => setDraftDateTo(e.target.value)} />
            </span>

            <select style={selectStyle} value={draftStatus} onChange={e => setDraftStatus(e.target.value)}>
              <option value="">전체 상태</option>
              {STATUS_FLOW.map(s => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
            <select style={selectStyle} value={draftCategory} onChange={e => setDraftCategory(e.target.value)}>
              <option value="">전체 카테고리</option>
              {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <button
              type="submit"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 600, background: '#635bff', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <i className="fa-solid fa-magnifying-glass" style={{ fontSize: '0.65rem' }} /> 검색
            </button>
            <button
              type="button"
              onClick={resetFilters}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 600, background: '#fff', color: '#697386', border: '1px solid #e3e8ef', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              초기화
            </button>
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 600,
                background: advancedActiveCount > 0 ? 'rgba(99,91,255,.08)' : '#fff',
                color: advancedActiveCount > 0 ? '#635bff' : '#697386',
                border: `1px solid ${advancedActiveCount > 0 ? '#635bff' : '#e3e8ef'}`, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto',
              }}
            >
              <i className="fa-solid fa-sliders" style={{ fontSize: '0.65rem' }} />
              상세필터{advancedActiveCount > 0 ? ` ${advancedActiveCount}` : ''}
              <i className={`fa-solid fa-chevron-${showAdvanced ? 'up' : 'down'}`} style={{ fontSize: '0.55rem' }} />
            </button>
          </div>

          {showAdvanced && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f1f3' }}>
              <select style={selectStyle} value={draftSeverity} onChange={e => setDraftSeverity(e.target.value)}>
                <option value="">전체 심각도</option>
                <option value="critical">긴급</option>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
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
                  placeholder="AI 검색 (예: 지난달 누수 하자)"
                  value={draftNlQuery}
                  onChange={e => setDraftNlQuery(e.target.value)}
                />
              </div>
              {canSeeDeleted && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#697386', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
                  삭제됨 보기
                </label>
              )}
            </div>
          )}
        </form>

        {/* 활성 필터 태그 — 검색 영역 아래, 개별 해제 가능 */}
        {activeTags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            {activeTags.map(tag => (
              <span
                key={tag.key}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px', borderRadius: 999,
                  fontSize: '0.7rem', fontWeight: 600, background: '#F0F2F5', color: '#425466',
                }}
              >
                {tag.label}
                <button
                  type="button"
                  onClick={tag.onRemove}
                  aria-label={`${tag.label} 필터 해제`}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', border: 'none', background: '#dfe3e8', color: '#425466', cursor: 'pointer', fontSize: '0.6rem', padding: 0, lineHeight: 1 }}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </span>
            ))}
          </div>
        )}

        {nlHasConditions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#635bff', letterSpacing: '0.06em', textTransform: 'uppercase' }}>AI 검색 파싱 결과</span>
            {nlCondition?.category && (
              <span style={{ fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,91,255,.1)', color: '#635bff' }}>카테고리: {nlCondition.category}</span>
            )}
            {nlCondition?.location && (
              <span style={{ fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#ebf3fe', color: '#1d6dc2' }}>위치: {nlCondition.location}</span>
            )}
            {nlCondition?.rootCause && (
              <span style={{ fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#fef3ee', color: '#c2440c' }}>원인: {nlCondition.rootCause}</span>
            )}
            {nlCondition?.sortBy && (
              <span style={{ fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#fef3e2', color: '#b06b1a' }}>정렬: {SORT_BY_LABELS[nlCondition.sortBy]}</span>
            )}
          </div>
        )}

        {/* Table */}
        <DefectsTable
          defects={filtered}
          filterActive={filterActive}
          canSeeDeleted={canSeeDeleted}
          showDeleted={showDeleted}
          onRestore={restoreDefect}
        />
      </div>
    </div>
  )
}

export default function DefectsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#6B7280', fontSize: '.9rem' }}>로딩 중...</div>}>
      <DefectsPageInner />
    </Suspense>
  )
}
