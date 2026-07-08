'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useStore, type Defect } from '@/lib/store'
import EmptyState from '@/components/ui/EmptyState'
import DefectCalendar from '@/components/dashboard/DefectCalendar'
import {
  needsTodayAction, isOverdue, isRecurring, COLORS, getFieldTab, getPaymentBadge, type FieldTab,
} from '@/lib/designTokens'
import { generateActionPlanOpinion } from '@/lib/aiReportService'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { canRegister, useCurrentRole } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'

function fmtKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}

const TAB_META: { key: '전체' | FieldTab; label: string; emoji: string }[] = [
  { key: '전체', label: '전체', emoji: '' },
  { key: '누수', label: '누수', emoji: '💧' },
  { key: '전기', label: '전기', emoji: '⚡' },
  { key: '배수', label: '배수', emoji: '🚽' },
  { key: '기타', label: '기타', emoji: '' },
]

function costBucket(d: Defect): '우리측' | '타업체' | '기타' {
  if (d.costHandlingType === '우리측 부담') return '우리측'
  if (d.costHandlingType === '타업체 청구') return '타업체'
  if (d.costHandlingType === '시공사 부담') return '기타'
  if (d.costType === 'our') return '우리측'
  if (d.costType === 'claim') return '타업체'
  return '기타'
}

export default function DashboardPage() {
  const { state } = useStore()
  const isTablet = useMediaQuery('(max-width: 1024px)')
  const [updatedAt, setUpdatedAt] = useState('')
  const [activeTab, setActiveTab] = useState<'전체' | FieldTab>('전체')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독

  useEffect(() => {
    setUpdatedAt(new Date().toLocaleString('ko-KR'))
  }, [])

  const baseDefects = state.defects.filter(d => !d.deletedAt)
  const categoryNameOf = (d: Defect) => state.categories.find(c => c.id === d.categoryId)?.name ?? null

  const tabCounts: Record<'전체' | FieldTab, number> = { '전체': baseDefects.length, '누수': 0, '전기': 0, '배수': 0, '기타': 0 }
  baseDefects.forEach(d => { tabCounts[getFieldTab(categoryNameOf(d))]++ })

  const defects = activeTab === '전체' ? baseDefects : baseDefects.filter(d => getFieldTab(categoryNameOf(d)) === activeTab)

  // 카드1: 진행 중인 미완결 건수 (진행중/지연/재점검필요/조치완료요청)
  const unresolvedItems = defects.filter(d =>
    d.status !== 'completed' && (d.status === 'in_progress' || d.status === 'recheck_needed' || d.status === 'action_done' || isOverdue(d))
  )

  // 카드2: 이번 달 집행 비용
  const now = new Date()
  const mm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonthDefects = defects.filter(d => (d.firstOccurredAt ?? d.createdAt)?.startsWith(mm))
  const thisMonthOwnCost = thisMonthDefects.filter(d => costBucket(d) === '우리측').reduce((s, d) => s + (d.totalCost || 0), 0)
  const thisMonthClaimCost = thisMonthDefects.filter(d => costBucket(d) === '타업체').reduce((s, d) => s + (d.totalCost || 0), 0)
  const thisMonthTotalCost = thisMonthDefects.reduce((s, d) => s + (d.totalCost || 0), 0)

  // 오늘 우선처리 Top3
  const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const top3 = [...defects]
    .filter(needsTodayAction)
    .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || b.recurrenceCount - a.recurrenceCount)
    .slice(0, 3)

  const actionPlan = generateActionPlanOpinion(defects, state.files, state.floorPlans)

  // ── AI 분석 인사이트 데이터 (탭 필터 반영) ──────────────────────────────

  const causeCounts: Record<string, { count: number; totalCost: number; recurrences: number }> = {}
  defects.forEach(d => {
    const cause = d.causeCategory ?? (categoryNameOf(d) ?? '미분류')
    if (!causeCounts[cause]) causeCounts[cause] = { count: 0, totalCost: 0, recurrences: 0 }
    causeCounts[cause].count++
    causeCounts[cause].totalCost += d.totalCost
    causeCounts[cause].recurrences += d.recurrenceCount
  })
  const topCauses = Object.entries(causeCounts)
    .sort((a, b) => (b[1].count + b[1].recurrences) - (a[1].count + a[1].recurrences))
    .slice(0, 10)
  const topCausesMax = Math.max(1, ...topCauses.map(([, v]) => v.count + v.recurrences))

  const floorMap: Record<string, { count: number; cost: number; name: string }> = {}
  defects.forEach(d => {
    const fp = state.floorPlans.find(f => f.id === d.floorPlanId)
    const key = fp?.name ?? '층 미지정'
    if (!floorMap[key]) floorMap[key] = { count: 0, cost: 0, name: key }
    floorMap[key].count++
    floorMap[key].cost += d.totalCost
  })
  const floorRanking = Object.values(floorMap).sort((a, b) => b.count - a.count)
  const floorMax = Math.max(1, ...floorRanking.map(f => f.count))

  const catCostData = state.categories.map(c => {
    const cDefs = defects.filter(d => d.categoryId === c.id)
    const costDefs = cDefs.filter(d => d.totalCost > 0)
    const catTotal = cDefs.reduce((s, d) => s + d.totalCost, 0)
    const avg = costDefs.length > 0 ? Math.round(catTotal / costDefs.length) : 0
    return { ...c, catTotal, avg, count: cDefs.length, costCount: costDefs.length }
  }).filter(c => c.count > 0).sort((a, b) => b.catTotal - a.catTotal)
  const catCostMax = Math.max(1, ...catCostData.map(c => c.catTotal))

  const recurredDefs = defects.filter(d => d.recurrenceCount > 0).sort((a, b) => b.recurrenceCount - a.recurrenceCount)
  const recurRateByCat = state.categories.map(c => {
    const all = defects.filter(d => d.categoryId === c.id)
    const recurred = all.filter(d => d.recurrenceCount > 0)
    return { ...c, total: all.length, recurred: recurred.length, rate: all.length > 0 ? Math.round(recurred.length / all.length * 100) : 0 }
  }).filter(c => c.total > 0).sort((a, b) => b.rate - a.rate)

  const zoneMap: Record<string, { defects: number; cost: number; critical: number; name: string }> = {}
  defects.forEach(d => {
    const fp = state.floorPlans.find(f => f.id === d.floorPlanId)
    const zone = fp?.name ?? '미확인'
    if (!zoneMap[zone]) zoneMap[zone] = { defects: 0, cost: 0, critical: 0, name: zone }
    zoneMap[zone].defects++
    zoneMap[zone].cost += d.totalCost
    if (d.severity === 'critical' || d.severity === 'high') zoneMap[zone].critical++
  })
  const zones = Object.values(zoneMap).map(z => ({ ...z, score: z.defects + z.critical * 2 })).sort((a, b) => b.score - a.score)
  const zoneMax = Math.max(1, ...zones.map(z => z.score))

  const monthsWithData = new Set(
    defects.filter(d => d.totalCost > 0 && d.firstOccurredAt).map(d => d.firstOccurredAt!.slice(0, 7))
  ).size || 1
  const avgMonthly = Math.round(defects.reduce((s, d) => s + (d.totalCost || 0), 0) / monthsWithData)
  const pendingPredCost = defects.filter(d => d.status !== 'completed' && d.predictedCostAvg != null).reduce((s, d) => s + (d.predictedCostAvg ?? 0), 0)
  const openCount = defects.filter(d => d.status !== 'completed').length
  const forecast3m = Math.round(avgMonthly * 3 + pendingPredCost * 0.5)
  const forecast6m = Math.round(avgMonthly * 6 + pendingPredCost * 0.8)
  const forecast12m = Math.round(avgMonthly * 12 + pendingPredCost * 1.2)

  const locationCounts: Record<string, { count: number; recurring: boolean }> = {}
  state.defectLocations.filter(l => defects.some(d => d.id === l.defectId)).forEach(l => {
    const key = l.label?.trim() || null
    if (!key) return
    const d = defects.find(x => x.id === l.defectId)
    if (!locationCounts[key]) locationCounts[key] = { count: 0, recurring: false }
    locationCounts[key].count++
    if (d && isRecurring(d)) locationCounts[key].recurring = true
  })
  const topLocations = Object.entries(locationCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
  const topLocationsMax = Math.max(1, ...topLocations.map(([, v]) => v.count))

  const costRiskTop5 = [...defects]
    .filter(d => d.recurrenceCount > 0)
    .sort((a, b) => (b.totalCost * (b.recurrenceCount + 1)) - (a.totalCost * (a.recurrenceCount + 1)))
    .slice(0, 5)

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 10, boxShadow: '0 1px 3px rgba(10,37,64,0.05)', overflow: 'hidden' }
  const aiCard: React.CSSProperties = { background: '#fff', border: '1px solid rgba(99,91,255,.2)', borderRadius: 10, boxShadow: '0 1px 4px rgba(99,91,255,.06)', overflow: 'hidden' }
  const aiCardHeader: React.CSSProperties = { padding: '10px 14px 8px', borderBottom: '1px solid rgba(99,91,255,.1)', background: 'linear-gradient(135deg,rgba(99,91,255,.04),rgba(99,91,255,.01))' }

  function resetStorage() {
    localStorage.removeItem('hajaSys2')
    location.reload()
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540' }}>대시보드</h1>
          <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 1 }}>업데이트 {updatedAt}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={resetStorage} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}>
            <i className="fa-solid fa-rotate" /> 초기화
          </button>
          {canRegister(role) && (
            <Link href="/defects/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, background: '#635bff', color: '#fff', textDecoration: 'none' }}>
              <i className="fa-solid fa-plus" /> 하자 등록
            </Link>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ position: 'sticky', top: 53, zIndex: 40, background: '#fff', borderBottom: '1px solid #e3e8ef', padding: '8px 20px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {TAB_META.map(t => {
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                flexShrink: 0, padding: '7px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                border: active ? '1.5px solid #635bff' : '1.5px solid #e3e8ef',
                background: active ? '#635bff' : '#fff', color: active ? '#fff' : '#425466',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {t.emoji && <span>{t.emoji}</span>}
              {t.label}
              <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999, background: active ? 'rgba(255,255,255,.25)' : '#f3f5f7', color: active ? '#fff' : '#697386', fontWeight: 700 }}>{tabCounts[t.key]}</span>
            </button>
          )
        })}
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
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#697386', marginBottom: 6 }}>🚨 진행 중인 미완결 건수</div>
              <Link href="/defects?filter=today" style={{ textDecoration: 'none' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.03em', lineHeight: 1 }}>{unresolvedItems.length}<span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#697386', marginLeft: 4 }}>건</span></div>
              </Link>
              <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 4 }}>오늘 처리해야 하는 진행중·지연·재점검·조치완료요청 포함</div>
            </div>

            <div style={{ ...card, padding: '14px 16px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#16A34A', borderRadius: '10px 10px 0 0' }} />
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#697386', marginBottom: 6 }}>💰 이번 달 집행 비용</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.03em', lineHeight: 1 }}>{fmtKRW(thisMonthTotalCost)}</div>
              {(thisMonthOwnCost > 0 || thisMonthClaimCost > 0) && (
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  {thisMonthOwnCost > 0 && <span style={{ fontSize: '0.68rem', color: '#697386' }}>우리측 부담 <strong style={{ color: '#425466' }}>{fmtKRW(thisMonthOwnCost)}</strong></span>}
                  {thisMonthClaimCost > 0 && <span style={{ fontSize: '0.68rem', color: '#697386' }}>타업체 청구 <strong style={{ color: '#425466' }}>{fmtKRW(thisMonthClaimCost)}</strong></span>}
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

        {unresolvedItems.length === 0 && (
          <div style={{ marginBottom: 16 }}>
            <EmptyState icon="fa-solid fa-circle-check" message="처리할 미완결 항목이 없습니다." actionLabel={canRegister(role) ? '하자 등록' : undefined} actionHref={canRegister(role) ? '/defects/new' : undefined} />
          </div>
        )}

        {/* AI 종합 의견 — Action Plan */}
        <div style={{ ...aiCard, marginBottom: 16 }}>
          <div style={aiCardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>✨</span>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540' }}>AI 종합 의견</div>
            </div>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              {actionPlan.headline.map((line, i) => (
                <div key={i} style={{ fontSize: '0.78rem', color: '#0a2540', lineHeight: 1.6, marginBottom: 2 }}>• {line}</div>
              ))}
            </div>
            {actionPlan.immediateActions.length > 0 && (
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: COLORS.danger, marginBottom: 3 }}>즉시 조치 필요</div>
                {actionPlan.immediateActions.map((t, i) => <div key={i} style={{ fontSize: '0.73rem', color: '#425466', lineHeight: 1.6 }}>· {t}</div>)}
              </div>
            )}
            {actionPlan.costRisk.length > 0 && (
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#B06B1A', marginBottom: 3 }}>비용/결제 리스크</div>
                {actionPlan.costRisk.map((t, i) => <div key={i} style={{ fontSize: '0.73rem', color: '#425466', lineHeight: 1.6 }}>· {t}</div>)}
              </div>
            )}
            {actionPlan.recurringWarning.length > 0 && (
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#635bff', marginBottom: 3 }}>반복 발생 경고</div>
                {actionPlan.recurringWarning.map((t, i) => <div key={i} style={{ fontSize: '0.73rem', color: '#425466', lineHeight: 1.6 }}>· {t}</div>)}
              </div>
            )}
            {actionPlan.approvalNeeded.length > 0 && (
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#0F7850', marginBottom: 3 }}>관리자 결재 필요</div>
                {actionPlan.approvalNeeded.map((t, i) => <div key={i} style={{ fontSize: '0.73rem', color: '#425466', lineHeight: 1.6 }}>· {t}</div>)}
              </div>
            )}
          </div>
        </div>

        {/* ── AI 분석 인사이트 (심화) ──────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 12px', background: 'linear-gradient(135deg,rgba(99,91,255,.08),rgba(99,91,255,.03))', borderRadius: 8, border: '1px solid rgba(99,91,255,.18)' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540' }}>📊 심화 분석</div>
            <div style={{ fontSize: '0.65rem', color: '#697386' }}>Rule-Based · 실시간 데이터 기반</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 10 }}>
            {topCauses.length > 0 && (
              <div style={aiCard}>
                <div style={aiCardHeader}><div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540' }}>반복 발생 원인 TOP10</div></div>
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {topCauses.map(([cause, v], i) => {
                      const t = v.count + v.recurrences
                      const pct = Math.round((t / topCausesMax) * 100)
                      return (
                        <div key={cause}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: '0.73rem', color: '#0a2540', fontWeight: i < 3 ? 600 : 400 }}>#{i + 1} {cause}</span>
                            <span style={{ fontSize: '0.68rem', color: '#425466', fontWeight: 600 }}>{t}회</span>
                          </div>
                          <div style={{ height: 4, background: '#f0f4f8', borderRadius: 999 }}><div style={{ height: '100%', width: `${pct}%`, background: i < 3 ? '#635bff' : '#a5b4fc', borderRadius: 999 }} /></div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {floorRanking.length > 0 && (
              <div style={aiCard}>
                <div style={aiCardHeader}><div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540' }}>시설별 고장 순위</div></div>
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {floorRanking.slice(0, 6).map((f, i) => {
                      const pct = Math.round((f.count / floorMax) * 100)
                      return (
                        <div key={f.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: '0.73rem', color: '#0a2540', fontWeight: i < 3 ? 600 : 400 }}>{['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`} {f.name}</span>
                            <span style={{ fontSize: '0.68rem', color: '#425466', fontWeight: 600 }}>{f.count}건 · {fmtKRW(f.cost)}</span>
                          </div>
                          <div style={{ height: 4, background: '#f0f4f8', borderRadius: 999 }}><div style={{ height: '100%', width: `${pct}%`, background: i < 3 ? '#059669' : '#6ee7b7', borderRadius: 999 }} /></div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {catCostData.length > 0 && (
              <div style={aiCard}>
                <div style={aiCardHeader}><div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540' }}>분야별 비용 분석</div></div>
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {catCostData.map((c, i) => {
                      const pct = Math.round((c.catTotal / catCostMax) * 100)
                      return (
                        <div key={c.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: '0.73rem', color: '#0a2540' }}>{c.name} <span style={{ color: '#697386', fontSize: '0.65rem' }}>{c.count}건</span></span>
                            <span style={{ fontSize: '0.68rem', color: '#425466', fontWeight: 600 }}>{fmtKRW(c.catTotal)}</span>
                          </div>
                          <div style={{ height: 4, background: '#f0f4f8', borderRadius: 999 }}><div style={{ height: '100%', width: `${pct}%`, background: i === 0 ? '#635bff' : '#a5b4fc', borderRadius: 999 }} /></div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {recurRateByCat.length > 0 && (
              <div style={aiCard}>
                <div style={aiCardHeader}><div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540' }}>재발생 하자 분석</div></div>
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: recurredDefs.length > 0 ? 8 : 0 }}>
                    {recurRateByCat.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.7rem', color: '#0a2540', minWidth: 44 }}>{c.name}</span>
                        <div style={{ flex: 1, height: 4, background: '#f0f4f8', borderRadius: 999 }}><div style={{ height: '100%', width: `${c.rate}%`, background: c.rate >= 50 ? '#e11d48' : '#635bff', borderRadius: 999 }} /></div>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: c.rate >= 50 ? '#e11d48' : '#425466' }}>{c.rate}%</span>
                      </div>
                    ))}
                  </div>
                  {recurredDefs.slice(0, 3).map((d, i) => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: '#faf9ff', borderRadius: 6, marginBottom: 3, fontSize: '0.7rem' }}>
                      <span style={{ color: '#0a2540' }}>#{i + 1} {d.title.slice(0, 16)}{d.title.length > 16 ? '…' : ''}</span>
                      <span style={{ fontWeight: 700, color: '#635bff' }}>{d.recurrenceCount}회</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {zones.length > 0 && (
              <div style={aiCard}>
                <div style={aiCardHeader}><div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540' }}>취약 구역 분석</div></div>
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {zones.slice(0, 6).map((z, i) => {
                      const pct = Math.round((z.score / zoneMax) * 100)
                      const level = pct >= 75 ? { l: '위험', c: '#e11d48' } : pct >= 40 ? { l: '주의', c: '#d97706' } : { l: '양호', c: '#059669' }
                      return (
                        <div key={z.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: '0.73rem', color: '#0a2540' }}>{z.name} <span style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: 4, background: level.c + '18', color: level.c, fontWeight: 700 }}>{level.l}</span></span>
                            <span style={{ fontSize: '0.68rem', color: '#425466', fontWeight: 600 }}>{z.defects}건</span>
                          </div>
                          <div style={{ height: 4, background: '#f0f4f8', borderRadius: 999 }}><div style={{ height: '100%', width: `${pct}%`, background: level.c, borderRadius: 999, opacity: 0.7 }} /></div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {(forecast3m > 0 || forecast6m > 0) && (
              <div style={aiCard}>
                <div style={aiCardHeader}><div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540' }}>향후 예상 유지보수 비용</div></div>
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                    {[{ l: '3개월', v: forecast3m, c: '#059669' }, { l: '6개월', v: forecast6m, c: '#d97706' }, { l: '12개월', v: forecast12m, c: '#635bff' }].map(f => (
                      <div key={f.l} style={{ padding: '7px 6px', background: '#faf9ff', borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: '0.6rem', color: '#697386' }}>{f.l}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: f.c }}>{fmtKRW(f.v)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#697386' }}>월평균 {fmtKRW(avgMonthly)} · 진행중 예측비용 {fmtKRW(pendingPredCost)} · 미처리 {openCount}건</div>
                </div>
              </div>
            )}

            {topLocations.length > 0 && (
              <div style={aiCard}>
                <div style={aiCardHeader}><div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540' }}>위치별 하자 발생 Top10</div></div>
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {topLocations.map(([label, v], i) => {
                      const pct = Math.round((v.count / topLocationsMax) * 100)
                      return (
                        <Link key={label} href={`/defects?search=${encodeURIComponent(label)}`} style={{ textDecoration: 'none', display: 'block' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: '0.73rem', color: '#0a2540', fontWeight: i < 3 ? 600 : 400 }}>#{i + 1} {label} {v.recurring && <span style={{ fontSize: '0.6rem', color: COLORS.danger }}>반복</span>}</span>
                            <span style={{ fontSize: '0.68rem', color: '#425466', fontWeight: 600 }}>{v.count}건</span>
                          </div>
                          <div style={{ height: 4, background: '#f0f4f8', borderRadius: 999 }}><div style={{ height: '100%', width: `${pct}%`, background: i < 3 ? '#635bff' : '#a5b4fc', borderRadius: 999 }} /></div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {costRiskTop5.length > 0 && (
            <div style={{ ...aiCard, marginTop: 10 }}>
              <div style={aiCardHeader}><div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0a2540' }}>비용 증가 위험 항목 Top5</div></div>
              <div>
                {costRiskTop5.map((d, i) => (
                  <Link key={d.id} href={`/defects/${d.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', textDecoration: 'none', borderBottom: '1px solid #f7f8fa' }}>
                    <span style={{ fontSize: '0.68rem', color: '#635bff', fontWeight: 700 }}>#{i + 1}</span>
                    <span style={{ fontSize: '0.75rem', color: '#0a2540', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: COLORS.danger, background: '#FEF2F2', padding: '1px 6px', borderRadius: 4 }}>재발{d.recurrenceCount}회</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0a2540' }}>{fmtKRW(d.totalCost)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
