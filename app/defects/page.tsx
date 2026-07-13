'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { analyzeSearchQuery, hasConditions, SORT_BY_LABELS } from '@/lib/searchParser'
import type { SearchCondition } from '@/lib/searchParser'
import StatusBadge from '@/components/ui/StatusBadge'
import SeverityBadge from '@/components/ui/SeverityBadge'
import EmptyState from '@/components/ui/EmptyState'
import PhotoCompareCell from '@/components/defects/PhotoCompareCell'
import {
  isOverdue, isRecurring, needsTodayAction, needsAfterPhoto, isFullyClosed, getPaymentBadge, getCostBearerStatus,
  isInProgressStatus, isScheduled, isUnresolved,
  COLORS, STATUS_FLOW, STATUS_META,
} from '@/lib/designTokens'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { canDelete, canRegister, useCurrentRole } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'

const DEFECT_TYPE_OPTIONS = ['하자사항', '일반사항', '확인 필요'] as const
const COST_BEARER_OPTIONS = ['우리측 부담', '타업체 청구', '시공사 부담', '미정'] as const

function fmtDate(s: string | null): string {
  if (!s) return '-'
  return s.slice(0, 10)
}

function fmtCost(n: number): string {
  if (!n || n <= 0) return ''
  return n.toLocaleString('ko-KR') + '원'
}

const PAYMENT_TONE_STYLE: Record<string, { bg: string; color: string }> = {
  success: { bg: '#F0FDF4', color: '#16A34A' },
  warning: { bg: '#FFF7ED', color: '#F97316' },
  danger: { bg: '#FEF2F2', color: '#DC2626' },
  neutral: { bg: '#F3F5F7', color: '#425466' },
}

function DefectsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlFilter = searchParams.get('filter')
  const urlSearch = searchParams.get('search')
  const { state, restoreDefect } = useStore()
  const isTablet = useMediaQuery('(max-width: 1024px)')

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
  const [nlQuery, setNlQuery] = useState(urlSearch || '')
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [defectTypeFilter, setDefectTypeFilter] = useState('')
  const [costBearerFilter, setCostBearerFilter] = useState('')

  const [quickFilter, setQuickFilter] = useState<string | null>(urlFilter)
  const [showDeleted, setShowDeleted] = useState(false)
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독
  const canSeeDeleted = canDelete(role)
  const canCreate = canRegister(role)

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
      if (quickFilter === 'today' && !needsTodayAction(d)) return false
      if (quickFilter === 'critical' && !(d.severity === 'critical' && d.status !== 'completed')) return false
      if (quickFilter === 'overdue' && !isOverdue(d)) return false
      if (quickFilter === 'recurring' && !(isRecurring(d) && d.status !== 'completed')) return false
      if (quickFilter === 'recheck' && d.status !== 'recheck_needed') return false
      if (quickFilter === 'inprogress' && !isInProgressStatus(d)) return false
      if (quickFilter === 'scheduled' && !isScheduled(d)) return false
      if (quickFilter === 'unresolved' && !isUnresolved(d)) return false
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

        {/* 퀵필터 칩 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {([
            { key: 'today', label: '오늘 우선처리', color: COLORS.danger },
            { key: 'critical', label: '긴급만', color: COLORS.critical },
            { key: 'overdue', label: '지연만', color: COLORS.warning },
            { key: 'recurring', label: '반복만', color: COLORS.action },
            { key: 'recheck', label: '재점검 필요', color: COLORS.warning },
            { key: 'nophoto', label: '조치후 사진 미첨부', color: COLORS.warning },
            { key: 'unclassified', label: '확인 필요', color: COLORS.textMuted },
            { key: 'costunresolved', label: '비용부담 미정', color: COLORS.danger },
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
        </div>

        {/* Filter Row — 기간 → AI검색 → 상태 → 심각도 → 카테고리 → 하자구분 → 비용부담주체 → 검색 → 초기화 */}
        <form
          onSubmit={e => { e.preventDefault(); applyFilters() }}
          style={{ ...card, padding: '8px 12px', marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="fa-solid fa-calendar-days" style={{ fontSize: '0.7rem', color: '#b0bac6' }} />
            <input type="date" style={dateInputStyle} value={draftDateFrom} onChange={e => setDraftDateFrom(e.target.value)} />
            <span style={{ color: '#b0bac6', fontSize: '0.72rem' }}>~</span>
            <input type="date" style={dateInputStyle} value={draftDateTo} onChange={e => setDraftDateTo(e.target.value)} />
          </span>

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

          <select style={selectStyle} value={draftStatus} onChange={e => setDraftStatus(e.target.value)}>
            <option value="">전체 상태</option>
            {STATUS_FLOW.map(s => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
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

          {canSeeDeleted && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#697386', cursor: 'pointer', marginLeft: 'auto' }}>
              <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
              삭제됨 보기
            </label>
          )}
        </form>

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
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: isTablet ? 'auto' : 'visible' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                {[
                  '종결여부', '발생일', '분야/명', '사진대지', '외주업체', '처리비용', '결제증빙/수단', '상태', '위치', '작업',
                ].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '7px 12px', fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#697386', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState
                      icon="fa-solid fa-inbox"
                      message={filterActive ? '조건에 맞는 하자가 없습니다.' : '등록된 하자가 없습니다.'}
                      actionLabel={canCreate ? '하자 등록' : undefined}
                      actionHref={canCreate ? '/defects/new' : undefined}
                    />
                  </td>
                </tr>
              ) : filtered.map(d => {
                const cat = state.categories.find(c => c.id === d.categoryId)
                const overdue = isOverdue(d)
                const closed = isFullyClosed(d)
                const vendor = state.vendors.find(v => v.id === d.assignedVendorId)
                const files = state.files.filter(f => f.defectId === d.id)
                const latestBefore = [...files].filter(f => f.photoType === 'before').sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]
                const latestAfter = [...files].filter(f => f.photoType === 'after').sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]
                const paymentBadge = getPaymentBadge(d, state.files)
                return (
                  <tr
                    key={d.id}
                    style={{
                      borderBottom: '1px solid #f0f4f8', cursor: 'pointer', transition: 'background 0.1s',
                      borderLeft: overdue ? `3px solid ${COLORS.warning}` : '3px solid transparent',
                      opacity: closed ? 0.55 : 1,
                    }}
                    onClick={() => router.push(`/defects/${d.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafbff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {/* 종결여부 */}
                    <td style={{ padding: '7px 12px', verticalAlign: 'middle' }}>
                      {closed ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 700, color: '#16A34A', background: '#F0FDF4', padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}>
                          ✅ 완결
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 700, color: '#F97316', background: '#FFF7ED', padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}>
                          ⚠️ 조치중
                        </span>
                      )}
                    </td>

                    {/* 발생일 */}
                    <td style={{ padding: '7px 12px', verticalAlign: 'middle', fontSize: '0.74rem', color: '#697386', whiteSpace: 'nowrap' }}>
                      {fmtDate(d.firstOccurredAt)}
                    </td>

                    {/* 분야/명 */}
                    <td style={{ padding: '7px 12px', verticalAlign: 'middle', minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {cat && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 600, padding: '1px 7px', borderRadius: 4, background: cat.color + '18', color: cat.color, whiteSpace: 'nowrap' }}>
                            {cat.name}
                          </span>
                        )}
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>{d.title}</span>
                        {d.recurrenceCount ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', color: '#be1044', fontWeight: 700, background: '#fef0f4', padding: '1px 5px', borderRadius: 4 }}>
                            <i className="fa-solid fa-rotate" />{d.recurrenceCount}회
                          </span>
                        ) : null}
                      </div>
                      {overdue && (
                        <span style={{ display: 'inline-flex', fontSize: '0.6rem', fontWeight: 700, color: COLORS.warning, background: '#FFF7ED', padding: '1px 6px', borderRadius: 4, marginTop: 3 }}>지연</span>
                      )}
                    </td>

                    {/* 사진대지 전/후 */}
                    <td style={{ padding: '7px 12px', verticalAlign: 'middle' }}>
                      <PhotoCompareCell before={latestBefore} after={latestAfter} />
                    </td>

                    {/* 외주업체 */}
                    <td style={{ padding: '7px 12px', verticalAlign: 'middle', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>
                      {vendor ? (
                        <span style={{ color: '#0a2540', fontWeight: 500 }}>{vendor.name}</span>
                      ) : (
                        <span style={{ color: '#b0bac6' }}>자체처리</span>
                      )}
                    </td>

                    {/* 처리비용 */}
                    <td style={{ padding: '7px 12px', verticalAlign: 'middle', fontSize: '0.76rem', color: '#0a2540', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {fmtCost(d.totalCost)}
                    </td>

                    {/* 결제증빙/수단 */}
                    <td style={{ padding: '7px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {paymentBadge && (
                        <span
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 700,
                            padding: '2px 8px', borderRadius: 5,
                            background: PAYMENT_TONE_STYLE[paymentBadge.tone].bg,
                            color: PAYMENT_TONE_STYLE[paymentBadge.tone].color,
                          }}
                        >
                          {paymentBadge.icon} {paymentBadge.label}
                        </span>
                      )}
                    </td>

                    {/* 상태 */}
                    <td style={{ padding: '7px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <StatusBadge status={d.status} />
                    </td>

                    {/* 위치 */}
                    <td style={{ padding: '7px 12px', verticalAlign: 'middle', fontSize: '0.73rem', color: '#697386' }}>
                      {d.locationText || '-'}
                    </td>

                    {/* 작업 */}
                    <td style={{ padding: '7px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {canSeeDeleted && showDeleted ? (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            if (confirm(`'${d.title}' 하자를 복구하시겠습니까?`)) restoreDefect(d.id)
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #cde5d6', background: '#f0fdf4', color: '#16A34A', fontFamily: 'inherit' }}
                        >
                          <i className="fa-solid fa-rotate-left" /> 복구
                        </button>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); router.push(`/defects/${d.id}`) }}
                          title="상세보기"
                          style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e3e8ef', background: '#fff', cursor: 'pointer', color: '#697386', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.62rem' }} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
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
