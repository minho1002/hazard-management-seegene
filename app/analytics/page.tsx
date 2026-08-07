'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useStore, type Defect } from '@/lib/store'
import EmptyState from '@/components/ui/EmptyState'
import DefectCalendar from '@/components/dashboard/DefectCalendar'
import CategoryTabBar, { type CategoryTab } from '@/components/dashboard/CategoryTabBar'
import {
  needsTodayAction, isOverdue, COLORS, getPaymentBadge,
  isInProgressStatus, isScheduled, needsRecheck, getDisplayCost,
} from '@/lib/designTokens'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { canRegister, useCurrentRole } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'

function fmtKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}

const ALL_TAB_KEY = '__all__'
const UNCATEGORIZED_TAB_KEY = '__uncategorized__'

type PeriodType = 'today' | 'week' | 'month' | 'year' | 'custom' | 'all'

const PERIOD_OPTIONS: { key: PeriodType; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'year', label: '올해' },
  { key: 'custom', label: '사용자 지정' },
  { key: 'all', label: '전체 기간' },
]

function pad2(n: number) { return String(n).padStart(2, '0') }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

function costBucket(d: Defect): '우리측' | '타업체' | '기타' {
  if (d.costHandlingType === '우리측 부담') return '우리측'
  if (d.costHandlingType === '타업체 청구') return '타업체'
  if (d.costHandlingType === '시공사 부담') return '기타'
  if (d.costType === 'our') return '우리측'
  if (d.costType === 'claim') return '타업체'
  return '기타'
}

// 실무자가 매일 확인하는 캘린더+미완결현황 트리아지 화면. (구 /dashboard — 2026-08 Executive Dashboard
// 고도화로 /dashboard는 집계현황(구 /analytics) 콘텐츠로 교체되고, 이 화면이 "운영현황"으로 이동했다.
// 로직은 이동 전과 동일하다.)
export default function OperationsStatusPage() {
  const { state } = useStore()
  const isTablet = useMediaQuery('(max-width: 1024px)')
  const [updatedAt, setUpdatedAt] = useState('')
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB_KEY)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [periodType, setPeriodType] = useState<PeriodType>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독

  useEffect(() => {
    setUpdatedAt(new Date().toLocaleString('ko-KR'))
  }, [])

  // 조회기간 계산 — 집계 기준은 하자 발생일(firstOccurredAt)
  function computePeriodRange(): { from: string | null; to: string | null; label: string } {
    const now = new Date()
    if (periodType === 'today') {
      const t = toDateStr(now)
      return { from: t, to: t, label: '오늘' }
    }
    if (periodType === 'week') {
      const day = now.getDay() // 0=일요일
      const diffToMonday = day === 0 ? 6 : day - 1
      const monday = new Date(now); monday.setDate(now.getDate() - diffToMonday)
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
      return { from: toDateStr(monday), to: toDateStr(sunday), label: '이번 주' }
    }
    if (periodType === 'month') {
      const from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const to = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(lastDay)}`
      return { from, to, label: '이번 달' }
    }
    if (periodType === 'year') {
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31`, label: '올해' }
    }
    if (periodType === 'custom') {
      if (!customFrom || !customTo) return { from: null, to: null, label: '사용자 지정 (시작·종료일을 선택하세요)' }
      return { from: customFrom, to: customTo, label: `${customFrom} ~ ${customTo}` }
    }
    return { from: null, to: null, label: '전체 기간' }
  }

  const period = computePeriodRange()

  const nonDeleted = state.defects.filter(d => !d.deletedAt)
  const missingOccurredAtCount = nonDeleted.filter(d => !d.firstOccurredAt).length

  // 화면 전체(카테고리별 건수·달력·미완결·비용·Top3)가 이 조회기간 필터를 공통으로 사용한다.
  // 발생일(firstOccurredAt)이 없는 하자는 어느 기간에도 속할 수 없으므로 집계에서 제외하고,
  // missingOccurredAtCount로 별도 안내한다.
  const baseDefects = nonDeleted.filter(d => {
    if (!d.firstOccurredAt) return false
    const occ = d.firstOccurredAt.slice(0, 10)
    if (period.from && occ < period.from) return false
    if (period.to && occ > period.to) return false
    return true
  })

  // 카테고리 탭 — 하드코딩 없이 실제 하자 데이터에서 카테고리별 건수를 집계해 동적으로 생성한다.
  // [전체]는 항상 맨 앞 고정, 나머지는 발생 건수 내림차순(동률이면 이름 가나다순), 0건은 숨김.
  const categoryCountMap = new Map<number, number>()
  let uncategorizedCount = 0
  baseDefects.forEach(d => {
    const cat = state.categories.find(c => c.id === d.categoryId)
    if (cat) categoryCountMap.set(cat.id, (categoryCountMap.get(cat.id) ?? 0) + 1)
    else uncategorizedCount++
  })
  const dynamicCategoryTabs: CategoryTab[] = state.categories
    .map((c): CategoryTab => ({ key: String(c.id), label: c.name, icon: c.icon, count: categoryCountMap.get(c.id) ?? 0 }))
    .concat(uncategorizedCount > 0 ? [{ key: UNCATEGORIZED_TAB_KEY, label: '기타', icon: null, count: uncategorizedCount }] : [])
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'))
  const categoryTabs: CategoryTab[] = [
    { key: ALL_TAB_KEY, label: '전체', icon: null, count: baseDefects.length },
    ...dynamicCategoryTabs,
  ]

  // 선택된 탭이 데이터 변경 등으로 더 이상 존재하지 않게 되면(0건이 되어 숨겨진 경우) 안전하게 [전체]로 폴백한다.
  const effectiveActiveTab = activeTab === ALL_TAB_KEY || categoryTabs.some(t => t.key === activeTab) ? activeTab : ALL_TAB_KEY

  const defects = effectiveActiveTab === ALL_TAB_KEY ? baseDefects : baseDefects.filter(d => {
    if (effectiveActiveTab === UNCATEGORIZED_TAB_KEY) return !state.categories.some(c => c.id === d.categoryId)
    return String(d.categoryId) === effectiveActiveTab
  })

  // 카드1: 미완결 현황 — 접수·조치중 / 조치예정 / 지연 / 재점검필요 로 구분 집계
  // (같은 건이 여러 조건에 걸쳐도 "미완결 합계"에는 1건으로만 반영한다)
  const inProgressItems = defects.filter(isInProgressStatus)
  const scheduledItems = defects.filter(isScheduled)
  const overdueItems = defects.filter(isOverdue)
  const recheckItems = defects.filter(needsRecheck)
  const unresolvedIds = new Set<number>([...inProgressItems, ...scheduledItems, ...overdueItems, ...recheckItems].map(d => d.id))
  const unresolvedStatusCards = [
    { key: 'inprogress', label: '진행 중', count: inProgressItems.length, color: '#1D4ED8' },
    { key: 'scheduled', label: '조치 예정', count: scheduledItems.length, color: '#1D4ED8' },
    { key: 'overdue', label: '지연', count: overdueItems.length, color: '#C2410C' },
    { key: 'recheck', label: '재점검 필요', count: recheckItems.length, color: '#C2410C' },
  ]
  // 조치완료(action_done): 실무자가 조치를 마쳤지만 관리자 최종완료 승인 전 단계 — 미완결 합계에는
  // 포함되지 않지만(집계 로직 불변), 처리 현황을 한눈에 보기 위해 별도로 함께 노출한다.
  const actionDoneItems = defects.filter(d => d.status === 'action_done')

  // 카드2: 조회기간 집행 비용 (defects는 이미 조회기간+카테고리 탭이 반영된 집합)
  // 확정비용(finalCost 우선, 없으면 totalCost)과 예상비용(미확정)을 구분 집계한다.
  const periodConfirmedCost = defects.reduce((s, d) => {
    const { amount, confirmed } = getDisplayCost(d)
    return s + (confirmed && amount != null ? amount : 0)
  }, 0)
  const periodEstimatedPendingCost = defects.reduce((s, d) => {
    const { amount, confirmed } = getDisplayCost(d)
    return s + (!confirmed && amount != null ? amount : 0)
  }, 0)
  const periodOwnCost = defects.filter(d => costBucket(d) === '우리측').reduce((s, d) => s + (getDisplayCost(d).confirmed ? (getDisplayCost(d).amount ?? 0) : 0), 0)
  const periodClaimCost = defects.filter(d => costBucket(d) === '타업체').reduce((s, d) => s + (getDisplayCost(d).confirmed ? (getDisplayCost(d).amount ?? 0) : 0), 0)

  // 오늘 우선처리 Top3
  const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const top3 = [...defects]
    .filter(needsTodayAction)
    .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || b.recurrenceCount - a.recurrenceCount)
    .slice(0, 3)

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 10, boxShadow: '0 1px 3px rgba(10,37,64,0.05)', overflow: 'hidden' }

  // 하자 데이터(localStorage)는 절대 지우지 않는다 — 조회기간/카테고리 탭/캘린더 선택 날짜 같은
  // 조회 필터 상태만 기본값(이번 달)으로 되돌린다.
  function resetFilters() {
    setActiveTab(ALL_TAB_KEY)
    setSelectedDate(null)
    setPeriodType('month')
    setCustomFrom('')
    setCustomTo('')
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540' }}>운영현황</h1>
          <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 1 }}>업데이트 {updatedAt} · 조회기간: {period.label}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={resetFilters} title="조회기간·카테고리 탭·날짜 선택만 초기화합니다. 하자 데이터는 지워지지 않습니다." style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}>
            <i className="fa-solid fa-rotate" /> 초기화
          </button>
          {canRegister(role) && (
            <Link href="/defects/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, background: '#635bff', color: '#fff', textDecoration: 'none' }}>
              <i className="fa-solid fa-plus" /> 하자 등록
            </Link>
          )}
        </div>
      </div>

      {/* 조회기간 선택 */}
      <div style={{ position: 'sticky', top: 53, zIndex: 41, background: '#fff', borderBottom: '1px solid #e3e8ef', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
        {PERIOD_OPTIONS.map(opt => (
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

      {/* Category Tabs — 실데이터 기반 동적 생성, 가로 스크롤 */}
      <div style={{ position: 'sticky', top: 97, zIndex: 40, background: '#fff', borderBottom: '1px solid #e3e8ef', padding: '8px 20px' }}>
        <CategoryTabBar tabs={categoryTabs} activeKey={effectiveActiveTab} onSelect={setActiveTab} />
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* 좌우 분할: 달력 / 핵심카드 */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 360px', gap: 12, marginBottom: 16 }}>
          {/* 좌측: 달력 */}
          <div style={{ ...card, padding: 14 }}>
            <DefectCalendar defects={defects} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          </div>

          {/* 우측: 핵심 카드 2개 + Top3 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ ...card, padding: '14px 16px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: COLORS.danger, borderRadius: '10px 10px 0 0' }} />
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#697386', marginBottom: 8 }}>🚨 미완결 현황 · {period.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {unresolvedStatusCards.map(c => (
                  <Link
                    key={c.key}
                    href={`/defects?filter=${c.key}`}
                    style={{ textDecoration: 'none', display: 'block', padding: '8px 10px', borderRadius: 8, background: '#f8f9fb', border: '1px solid #eef1f5' }}
                  >
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#697386' }}>{c.label}</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: c.color }}>{c.count}<span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#697386', marginLeft: 3 }}>건</span></div>
                  </Link>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <Link
                  href="/defects?filter=unresolved"
                  style={{ textDecoration: 'none', display: 'block', padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FCA5A5' }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#B91C1C' }}>미완결 합계</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#B91C1C' }}>{unresolvedIds.size}<span style={{ fontSize: '0.75rem', fontWeight: 600, marginLeft: 3 }}>건</span></span>
                  </div>
                </Link>
                <Link
                  href="/defects?filter=action_done"
                  title="조치완료: 조치는 끝났지만 관리자 최종완료 승인 전 단계"
                  style={{ textDecoration: 'none', display: 'block', padding: '10px 12px', borderRadius: 8, background: '#F0FDF4', border: '1px solid #86EFAC' }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803D' }}>조치완료</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803D' }}>{actionDoneItems.length}<span style={{ fontSize: '0.75rem', fontWeight: 600, marginLeft: 3 }}>건</span></span>
                  </div>
                </Link>
              </div>
            </div>

            <div style={{ ...card, padding: '14px 16px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#16A34A', borderRadius: '10px 10px 0 0' }} />
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#697386', marginBottom: 6 }}>💰 {period.label} 집행 비용</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.03em', lineHeight: 1 }}>{fmtKRW(periodConfirmedCost)}</div>
                <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#0F7850', background: '#F0FDF4', padding: '2px 7px', borderRadius: 999 }}>확정</span>
              </div>
              {periodEstimatedPendingCost > 0 && (
                <div style={{ fontSize: '0.7rem', color: '#B06B1A', marginTop: 4 }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, background: '#FFF7ED', padding: '1px 6px', borderRadius: 4, marginRight: 5 }}>예상(미확정)</span>
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
          <div style={{ marginBottom: 16 }}>
            <EmptyState icon="fa-solid fa-circle-check" message="처리할 미완결 항목이 없습니다." actionLabel={canRegister(role) ? '하자 등록' : undefined} actionHref={canRegister(role) ? '/defects/new' : undefined} />
          </div>
        )}

      </div>
    </div>
  )
}
