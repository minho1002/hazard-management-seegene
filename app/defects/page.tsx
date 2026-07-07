'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { analyzeSearchQuery, hasConditions, fmtDateRange, SORT_BY_LABELS } from '@/lib/searchParser'
import type { SearchCondition } from '@/lib/searchParser'
import StatusBadge from '@/components/ui/StatusBadge'
import SeverityBadge from '@/components/ui/SeverityBadge'
import EmptyState from '@/components/ui/EmptyState'
import { isOverdue, isRecurring, needsTodayAction, needsAfterPhoto, COLORS, STATUS_FLOW, STATUS_META } from '@/lib/designTokens'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { canDelete, CURRENT_ROLE } from '@/lib/permissions'

const COST_LABELS: Record<string, string> = { gukbo: '국보', our: '자체', claim: '청구' }

function fmtDate(s: string | null) {
  if (!s) return '-'
  return new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function DefectsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlFilter = searchParams.get('filter')
  const urlSearch = searchParams.get('search')
  const { state, restoreDefect } = useStore()
  const isTablet = useMediaQuery('(max-width: 1024px)')

  const [search, setSearch] = useState(urlSearch || '')
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [nlQuery, setNlQuery] = useState('')
  const [quickFilter, setQuickFilter] = useState<string | null>(urlFilter)
  const [showDeleted, setShowDeleted] = useState(false)
  const canSeeDeleted = canDelete(CURRENT_ROLE)

  const nlCondition: SearchCondition | null = nlQuery.trim() ? analyzeSearchQuery(nlQuery) : null

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
      if (quickFilter === 'nophoto' && !needsAfterPhoto(d, state.files)) return false
      if (quickFilter === 'unclassified' && (d.defectType ?? '확인 필요') !== '확인 필요') return false
      if (quickFilter === 'costunresolved' && !(!d.costBearer || d.costBearer === '미정')) return false
      if (search && !(d.title.toLowerCase().includes(search.toLowerCase()) || (d.locationText ?? '').toLowerCase().includes(search.toLowerCase()))) return false
      if (statusFilter && d.status !== statusFilter) return false
      if (severityFilter && d.severity !== severityFilter) return false
      if (categoryFilter && d.categoryId !== parseInt(categoryFilter)) return false
      if (nlCondition && hasConditions(nlCondition)) {
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
      }
      return true
    })

  const card = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }

  const inputStyle: React.CSSProperties = {
    border: '1px solid #e3e8ef', borderRadius: 7, padding: '7px 12px 7px 30px',
    fontSize: '0.8rem', fontFamily: 'inherit', color: '#0a2540', background: '#f5f7fa', outline: 'none', width: 190,
  }
  const selectStyle: React.CSSProperties = {
    border: '1px solid #e3e8ef', borderRadius: 7, padding: '7px 26px 7px 10px',
    fontSize: '0.8rem', fontFamily: 'inherit', color: '#425466', background: '#f5f7fa', outline: 'none',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='5'%3E%3Cpath d='M0 0l4.5 5L9 0z' fill='%23697386'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', cursor: 'pointer',
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Page Header */}
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>하자 목록</h1>
          <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>전체 {filtered.length}건</div>
        </div>
        <Link
          href="/defects/new"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, background: '#635bff', color: '#fff', textDecoration: 'none' }}
        >
          <i className="fa-solid fa-plus" /> 하자 등록
        </Link>
      </div>

      {/* Body */}
      <div style={{ padding: '24px 32px' }}>

        {/* Natural Language Search */}
        <div style={{ ...card, padding: '10px 16px', marginBottom: 8, border: '1px solid rgba(99,91,255,.25)', background: 'rgba(99,91,255,.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 700, color: '#635bff', whiteSpace: 'nowrap' }}>
              <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: '0.72rem' }} />
              AI 검색
            </span>
            <div style={{ position: 'relative', flex: 1, maxWidth: 480 }}>
              <input
                style={{ width: '100%', border: '1px solid rgba(99,91,255,.3)', borderRadius: 7, padding: '6px 32px 6px 12px', fontSize: '0.8rem', fontFamily: 'inherit', color: '#0a2540', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                type="text"
                placeholder='예: 지난달 누수 하자 / 전기실 관련 건 / HVAC 비용 많이 사용한 건'
                value={nlQuery}
                onChange={e => setNlQuery(e.target.value)}
              />
              {nlQuery && (
                <button
                  onClick={() => setNlQuery('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#b0bac6', fontSize: '0.75rem', padding: 2 }}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>
          </div>
          {nlCondition && hasConditions(nlCondition) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(99,91,255,.12)' }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#635bff', letterSpacing: '0.06em', textTransform: 'uppercase' }}>파싱 결과</span>
              {nlCondition.category && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,91,255,.1)', color: '#635bff' }}>
                  카테고리: {nlCondition.category}
                </span>
              )}
              {nlCondition.location && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#ebf3fe', color: '#1d6dc2' }}>
                  위치: {nlCondition.location}
                </span>
              )}
              {nlCondition.rootCause && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#fef3ee', color: '#c2440c' }}>
                  원인: {nlCondition.rootCause}
                </span>
              )}
              {nlCondition.keyword && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#f3f5f7', color: '#425466' }}>
                  키워드: {nlCondition.keyword}
                </span>
              )}
              {(nlCondition.dateRange.start || nlCondition.dateRange.end) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#e6f6f0', color: '#0f7850' }}>
                  기간: {fmtDateRange(nlCondition.dateRange)}
                </span>
              )}
              {nlCondition.sortBy && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.67rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#fef3e2', color: '#b06b1a' }}>
                  정렬: {SORT_BY_LABELS[nlCondition.sortBy]}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 퀵필터 칩 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
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
                padding: '5px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${quickFilter === f.key ? f.color : '#E5E7EB'}`,
                background: quickFilter === f.key ? f.color : '#fff',
                color: quickFilter === f.key ? '#fff' : '#374151',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Filter Row */}
        <div style={{ ...card, padding: '11px 16px', marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <i className="fa-solid fa-search" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#b0bac6', fontSize: '0.75rem', pointerEvents: 'none' }} />
            <input
              style={inputStyle}
              type="text"
              placeholder="제목 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select style={selectStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">전체 상태</option>
            {STATUS_FLOW.map(s => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
          <select style={selectStyle} value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
            <option value="">전체 심각도</option>
            <option value="critical">긴급</option>
            <option value="high">높음</option>
            <option value="medium">보통</option>
            <option value="low">낮음</option>
          </select>
          <select style={selectStyle} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">전체 카테고리</option>
            {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span
            style={{ fontSize: '0.75rem', color: '#b0bac6', cursor: 'pointer', padding: '2px 6px' }}
            onClick={() => { setSearch(''); setStatusFilter(''); setSeverityFilter(''); setCategoryFilter(''); setNlQuery(''); setQuickFilter(null) }}
          >
            초기화
          </span>
          {canSeeDeleted && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#697386', cursor: 'pointer', marginLeft: 'auto' }}>
              <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
              삭제됨 보기
            </label>
          )}
        </div>

        {/* Table */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: isTablet ? 'auto' : 'visible' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                {[
                  '케이스번호', '하자명', '카테고리', '심각도', '상태', '위치', '비용유형', '최초발생',
                  ...(canSeeDeleted && showDeleted ? ['관리'] : []),
                ].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canSeeDeleted && showDeleted ? 9 : 8}>
                    <EmptyState icon="fa-solid fa-inbox" message="등록된 하자가 없습니다." actionLabel="하자 등록" actionHref="/defects/new" />
                  </td>
                </tr>
              ) : filtered.map(d => {
                const cat = state.categories.find(c => c.id === d.categoryId)
                const overdue = isOverdue(d)
                const locCount = state.defectLocations.filter(l => l.defectId === d.id).length
                return (
                  <tr
                    key={d.id}
                    style={{ borderBottom: '1px solid #f0f4f8', cursor: 'pointer', transition: 'background 0.1s', borderLeft: overdue ? `3px solid ${COLORS.warning}` : '3px solid transparent' }}
                    onClick={() => router.push(`/defects/${d.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafbff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '11px 16px', verticalAlign: 'middle' }}>
                      <span style={{ fontFamily: "'SF Mono','Fira Code',monospace", fontSize: '0.75rem', fontWeight: 600, color: '#635bff' }}>{d.caseNumber}</span>
                    </td>
                    <td style={{ padding: '11px 16px', verticalAlign: 'middle' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0a2540' }}>
                        {d.title}
                        {d.recurrenceCount ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.63rem', color: '#be1044', fontWeight: 700, background: '#fef0f4', padding: '1px 5px', borderRadius: 4, marginLeft: 5 }}>
                            <i className="fa-solid fa-rotate" />{d.recurrenceCount}회
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 1 }}>{d.locationText || ''}</div>
                      {d.causeCategory && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.63rem', color: '#635bff', background: 'rgba(99,91,255,.08)', padding: '1px 6px', borderRadius: 4, marginTop: 3 }}>
                          <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: 9 }} />{d.causeCategory}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '11px 16px', verticalAlign: 'middle' }}>
                      {cat ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 500, padding: '2px 8px', borderRadius: 5, background: cat.color + '18', color: cat.color }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color, flexShrink: 0, display: 'inline-block' }} />
                          {cat.name}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '11px 16px', verticalAlign: 'middle' }}>
                      <SeverityBadge severity={d.severity} />
                    </td>
                    <td style={{ padding: '11px 16px', verticalAlign: 'middle', display: 'flex', gap: 4, alignItems: 'center' }}>
                      <StatusBadge status={d.status} />
                      {overdue && (
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: COLORS.warning, background: '#FFF7ED', padding: '1px 6px', borderRadius: 4 }}>지연</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 16px', verticalAlign: 'middle', fontSize: '0.75rem', color: '#697386' }}>
                      {d.locationText || '-'}{locCount > 1 ? ` (위치 ${locCount}개)` : ''}
                    </td>
                    <td style={{ padding: '11px 16px', verticalAlign: 'middle', fontSize: '0.75rem', color: '#697386' }}>{COST_LABELS[d.costType] || d.costType}</td>
                    <td style={{ padding: '11px 16px', verticalAlign: 'middle', fontSize: '0.75rem', color: '#697386' }}>{fmtDate(d.firstOccurredAt)}</td>
                    {canSeeDeleted && showDeleted && (
                      <td style={{ padding: '11px 16px', verticalAlign: 'middle' }}>
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            if (confirm(`'${d.title}' 하자를 복구하시겠습니까?`)) restoreDefect(d.id)
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #cde5d6', background: '#f0fdf4', color: '#16A34A', fontFamily: 'inherit' }}
                        >
                          <i className="fa-solid fa-rotate-left" /> 복구
                        </button>
                      </td>
                    )}
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
