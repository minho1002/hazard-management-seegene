'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Filler,
  Tooltip, Legend,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { useStore } from '@/lib/store'
import PriorityStatCard from '@/components/ui/PriorityStatCard'
import EmptyState from '@/components/ui/EmptyState'
import { needsTodayAction, isOverdue, isRecurring, COLORS, toLegacyBucket, needsAfterPhoto } from '@/lib/designTokens'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { canRegister, useCurrentRole } from '@/lib/permissions'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend)

function fmtKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}

export default function DashboardPage() {
  const { state } = useStore()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isTablet = useMediaQuery('(max-width: 1024px)')
  const [updatedAt, setUpdatedAt] = useState('')
  const role = useCurrentRole()

  useEffect(() => {
    setUpdatedAt(new Date().toLocaleString('ko-KR'))
  }, [])

  const defects = state.defects.filter(d => !d.deletedAt)
  const totalCost = defects.reduce((s, d) => s + (d.totalCost || 0), 0)

  const todayItems = defects.filter(d => needsTodayAction(d))
  const criticalItems = defects.filter(d => d.severity === 'critical' && d.status !== 'completed')
  const overdueItems = defects.filter(d => isOverdue(d))
  const recurringItems = defects.filter(d => isRecurring(d) && d.status !== 'completed')
  const recheckItems = defects.filter(d => d.status === 'recheck_needed')
  const noPhotoItems = defects.filter(d => needsAfterPhoto(d, state.files))
  const unclassifiedItems = defects.filter(d => (d.defectType ?? '확인 필요') === '확인 필요')
  const costUnresolvedItems = defects.filter(d => !d.costBearer || d.costBearer === '미정')

  const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const todayTop5 = [...todayItems]
    .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || b.recurrenceCount - a.recurrenceCount)
    .slice(0, 5)

  // ── AI 분석 인사이트 데이터 ──────────────────────────────────────────────

  // 1. 반복 발생 원인 TOP10
  const causeCounts: Record<string, { count: number; totalCost: number; recurrences: number }> = {}
  defects.forEach(d => {
    const cause = d.causeCategory ?? (state.categories.find(c => c.id === d.categoryId)?.name ?? '미분류')
    if (!causeCounts[cause]) causeCounts[cause] = { count: 0, totalCost: 0, recurrences: 0 }
    causeCounts[cause].count++
    causeCounts[cause].totalCost += d.totalCost
    causeCounts[cause].recurrences += d.recurrenceCount
  })
  const topCauses = Object.entries(causeCounts)
    .sort((a, b) => (b[1].count + b[1].recurrences) - (a[1].count + a[1].recurrences))
    .slice(0, 10)
  const topCausesMax = Math.max(1, ...topCauses.map(([, v]) => v.count + v.recurrences))

  // 2. 시설별 고장 순위
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

  // 3. 분야별 비용 분석
  const catCostData = state.categories.map(c => {
    const cDefs = defects.filter(d => d.categoryId === c.id)
    const costDefs = cDefs.filter(d => d.totalCost > 0)
    const catTotal = cDefs.reduce((s, d) => s + d.totalCost, 0)
    const avg = costDefs.length > 0 ? Math.round(catTotal / costDefs.length) : 0
    return { ...c, catTotal, avg, count: cDefs.length, costCount: costDefs.length }
  }).sort((a, b) => b.catTotal - a.catTotal)
  const catCostMax = Math.max(1, ...catCostData.map(c => c.catTotal))

  // 4. 재발생 하자 분석
  const recurredDefs = defects.filter(d => d.recurrenceCount > 0).sort((a, b) => b.recurrenceCount - a.recurrenceCount)
  const recurRateByCat = state.categories.map(c => {
    const all = defects.filter(d => d.categoryId === c.id)
    const recurred = all.filter(d => d.recurrenceCount > 0)
    return { ...c, total: all.length, recurred: recurred.length, rate: all.length > 0 ? Math.round(recurred.length / all.length * 100) : 0 }
  }).sort((a, b) => b.rate - a.rate)

  // 5. 취약 구역 분석
  const zoneMap: Record<string, { defects: number; cost: number; critical: number; name: string }> = {}
  defects.forEach(d => {
    const fp = state.floorPlans.find(f => f.id === d.floorPlanId)
    const zone = fp?.name ?? '미확인'
    if (!zoneMap[zone]) zoneMap[zone] = { defects: 0, cost: 0, critical: 0, name: zone }
    zoneMap[zone].defects++
    zoneMap[zone].cost += d.totalCost
    if (d.severity === 'critical' || d.severity === 'high') zoneMap[zone].critical++
  })
  const zones = Object.values(zoneMap)
    .map(z => ({ ...z, score: z.defects + z.critical * 2 }))
    .sort((a, b) => b.score - a.score)
  const zoneMax = Math.max(1, ...zones.map(z => z.score))

  // 6. 향후 예상 유지보수 비용
  const monthsWithData = new Set(
    defects.filter(d => d.totalCost > 0 && d.firstOccurredAt).map(d => d.firstOccurredAt!.slice(0, 7))
  ).size || 1
  const avgMonthly = Math.round(totalCost / monthsWithData)
  const pendingPredCost = defects
    .filter(d => d.status !== 'completed' && d.predictedCostAvg != null)
    .reduce((s, d) => s + (d.predictedCostAvg ?? 0), 0)
  const openCount = defects.filter(d => d.status !== 'completed').length
  const forecast3m = Math.round(avgMonthly * 3 + pendingPredCost * 0.5)
  const forecast6m = Math.round(avgMonthly * 6 + pendingPredCost * 0.8)
  const forecast12m = Math.round(avgMonthly * 12 + pendingPredCost * 1.2)

  // 7. 위치별 하자 발생 Top10 (defectLocations 라벨 기준 집계)
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

  // 8. 반복 발생 설비 Top5 (facilityName 기준)
  const facilityCounts: Record<string, number> = {}
  defects.forEach(d => {
    if (!d.facilityName) return
    facilityCounts[d.facilityName] = (facilityCounts[d.facilityName] ?? 0) + 1
  })
  const topFacilities = Object.entries(facilityCounts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topFacilitiesMax = Math.max(1, ...topFacilities.map(([, c]) => c))

  // 9. 하자사항/일반사항 구분 현황
  const DEFECT_TYPE_KEYS = ['하자사항', '일반사항', '확인 필요'] as const
  const defectTypeCounts = DEFECT_TYPE_KEYS.map(t => ({
    type: t,
    count: defects.filter(d => (d.defectType ?? '확인 필요') === t).length,
  }))

  // 10. 비용 부담 주체별 현황
  const COST_BEARER_KEYS = ['시공사', '재단', '외주업체', '사용자', '보험/기타', '미정'] as const
  const costBearerCounts = COST_BEARER_KEYS.map(b => ({
    bearer: b,
    count: defects.filter(d => (d.costBearer || '미정') === b).length,
    cost: defects.filter(d => (d.costBearer || '미정') === b).reduce((s, d) => s + (d.totalCost || 0), 0),
  }))
  const costBearerMax = Math.max(1, ...costBearerCounts.map(c => c.count))

  // 11. 비용 증가 위험 항목 Top5 (재발 + 고비용)
  const costRiskTop5 = [...defects]
    .filter(d => d.recurrenceCount > 0)
    .sort((a, b) => (b.totalCost * (b.recurrenceCount + 1)) - (a.totalCost * (a.recurrenceCount + 1)))
    .slice(0, 5)

  const total = defects.length
  const open = defects.filter(d => toLegacyBucket(d.status) === 'open').length
  const inProg = defects.filter(d => toLegacyBucket(d.status) === 'in_progress').length
  const hold = defects.filter(d => toLegacyBucket(d.status) === 'hold').length
  const done = defects.filter(d => toLegacyBucket(d.status) === 'completed').length
  const recurred = defects.filter(d => d.recurrenceCount > 0).length
  const now = new Date()
  const mm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = defects.filter(d => d.createdAt && d.createdAt.startsWith(mm)).length

  // Last 12 months
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthlyCounts = months.map(m => defects.filter(d => d.firstOccurredAt && d.firstOccurredAt.startsWith(m)).length)
  const peakIdx = monthlyCounts.indexOf(Math.max(...monthlyCounts))
  const peakLabel = months[peakIdx]?.slice(5) + '월'

  // Category bars
  const catTotal = total || 1
  const catData = state.categories.map(c => ({
    ...c,
    count: defects.filter(d => d.categoryId === c.id).length,
  }))

  // Severity bars
  const sevCfg = [
    { key: 'critical', label: '긴급', color: '#B91C1C' },
    { key: 'high', label: '높음', color: '#DC2626' },
    { key: 'medium', label: '보통', color: '#CA8A04' },
    { key: 'low', label: '낮음', color: '#6B7280' },
  ]
  const sevTotal = total || 1

  // Vendor cost
  const vendorCosts = state.vendors.map(v => ({
    name: v.name,
    cost: defects.filter(d => d.assignedVendorId === v.id).reduce((s, d) => s + (d.totalCost || 0), 0),
  }))

  // Monthly chart with gradient (need canvas ctx)
  const monthlyChartData = {
    labels: months.map(m => m.slice(5) + '월'),
    datasets: [{
      data: monthlyCounts,
      borderColor: '#2563EB',
      backgroundColor: 'rgba(37,99,235,0.12)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#2563EB',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      borderWidth: 2,
    }],
  }

  const vendorChartData = {
    labels: vendorCosts.map(v => v.name),
    datasets: [{
      data: vendorCosts.map(v => v.cost),
      backgroundColor: 'rgba(37,99,235,.7)',
      borderRadius: 4,
      borderSkipped: false as const,
    }],
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: { parsed: { y: number } }) => `${ctx.parsed.y}건` } } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#b0bac6', maxTicksLimit: 6 } },
      y: { beginAtZero: true, grid: { color: '#f0f4f8' }, ticks: { stepSize: 1, font: { size: 10 }, color: '#b0bac6' } },
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const barOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: { parsed: { y: number } }) => fmtKRW(ctx.parsed.y) } } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#b0bac6' } },
      y: { beginAtZero: true, grid: { color: '#f0f4f8' }, ticks: { font: { size: 10 }, color: '#b0bac6', callback: (v: number | string) => v ? `${(Number(v) / 10000).toFixed(0)}만` : 0 } },
    },
  }

  const card = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden' as const }
  const aiCard = { background: '#fff', border: '1px solid rgba(99,91,255,.2)', borderRadius: 12, boxShadow: '0 1px 4px rgba(99,91,255,.07)', overflow: 'hidden' as const }
  const aiCardHeader = { padding: '14px 16px 10px', borderBottom: '1px solid rgba(99,91,255,.1)', background: 'linear-gradient(135deg,rgba(99,91,255,.04),rgba(99,91,255,.01))' }

  function resetStorage() {
    localStorage.removeItem('hajaSys2')
    location.reload()
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Page Header */}
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>대시보드</h1>
          <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>업데이트 {updatedAt}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={resetStorage}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit' }}
          >
            <i className="fa-solid fa-rotate" /> 초기화
          </button>
          {canRegister(role) && (
            <Link
              href="/defects/new"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, background: '#635bff', color: '#fff', textDecoration: 'none' }}
            >
              <i className="fa-solid fa-plus" /> 하자 등록
            </Link>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '24px 32px' }}>

        {/* 우선순위 배너 */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'repeat(2,1fr)' : '1fr 1fr 1fr 1fr 1.2fr', gap: 12, marginBottom: 20 }}>
          <PriorityStatCard
            label="오늘 우선처리" icon="fa-solid fa-bolt" count={todayItems.length}
            color={COLORS.danger} bg="#FEF2F2" href="/defects?filter=today"
            description="지연·긴급·반복 포함"
          />
          <PriorityStatCard
            label="긴급 하자" icon="fa-solid fa-triangle-exclamation" count={criticalItems.length}
            color={COLORS.critical} bg="#FEF2F2" href="/defects?filter=critical"
          />
          <PriorityStatCard
            label="지연 하자" icon="fa-solid fa-clock" count={overdueItems.length}
            color={COLORS.warning} bg="#FFF7ED" href="/defects?filter=overdue"
          />
          <PriorityStatCard
            label="반복 하자" icon="fa-solid fa-rotate" count={recurringItems.length}
            color={COLORS.action} bg="#EFF6FF" href="/defects?filter=recurring"
          />
          {/* AI 인사이트 요약 */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>✨</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#111827' }}>AI 인사이트 요약</span>
            </div>
            {topCauses.length === 0 && floorRanking.length === 0 ? (
              <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>분석할 데이터가 아직 없습니다.</span>
            ) : (
              <>
                {topCauses[0] && (
                  <div style={{ fontSize: '0.72rem', color: '#374151' }}>최다 반복원인: <strong>{topCauses[0][0]}</strong></div>
                )}
                {floorRanking[0] && (
                  <div style={{ fontSize: '0.72rem', color: '#374151' }}>최고 위험구역: <strong>{floorRanking[0].name}</strong></div>
                )}
                <div style={{ fontSize: '0.72rem', color: '#374151' }}>3개월 비용예측: <strong>{fmtKRW(forecast3m)}</strong></div>
              </>
            )}
            <a href="#ai-insight-section" style={{ fontSize: '0.68rem', color: '#2563EB', marginTop: 4, textDecoration: 'none' }}>전체 인사이트 보기 →</a>
          </div>
        </div>

        {todayItems.length === 0 && (
          <div style={{ marginBottom: 20 }}>
            <EmptyState icon="fa-solid fa-circle-check" message="오늘 처리할 긴급·지연 항목이 없습니다." actionLabel={canRegister(role) ? '하자 등록' : undefined} actionHref={canRegister(role) ? '/defects/new' : undefined} />
          </div>
        )}

        {/* 관리 KPI (2단계/5단계 데이터 기반) */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          <PriorityStatCard
            label="재점검 필요" icon="fa-solid fa-magnifying-glass" count={recheckItems.length}
            color={COLORS.warning} bg="#FFF7ED" href="/defects?filter=recheck"
          />
          <PriorityStatCard
            label="조치후 사진 미첨부" icon="fa-solid fa-camera" count={noPhotoItems.length}
            color={COLORS.warning} bg="#FFF7ED" href="/defects?filter=nophoto"
          />
          <PriorityStatCard
            label="확인 필요(하자구분)" icon="fa-solid fa-circle-question" count={unclassifiedItems.length}
            color={COLORS.textMuted} bg="#F9FAFB" href="/defects?filter=unclassified"
          />
          <PriorityStatCard
            label="비용부담 미정" icon="fa-solid fa-won-sign" count={costUnresolvedItems.length}
            color={COLORS.danger} bg="#FEF2F2" href="/defects?filter=costunresolved"
          />
        </div>

        {/* 오늘 우선처리 Top5 */}
        {todayTop5.length > 0 && (
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f4f8' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>오늘 우선처리 Top5</div>
              <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>심각도·반복 순으로 정렬</div>
            </div>
            <div style={{ padding: '8px 0' }}>
              {todayTop5.map((d, i) => (
                <Link
                  key={d.id}
                  href={`/defects/${d.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', textDecoration: 'none', borderBottom: i < todayTop5.length - 1 ? '1px solid #f7f8fa' : 'none' }}
                >
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: COLORS.danger, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontFamily: "'SF Mono','Fira Code',monospace", fontSize: '0.7rem', color: '#635bff', flexShrink: 0 }}>{d.caseNumber}</span>
                  <span style={{ fontSize: '0.8rem', color: '#0a2540', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                  {isOverdue(d) && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: COLORS.warning, background: '#FFF7ED', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>지연</span>}
                  {isRecurring(d) && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: COLORS.danger, background: '#FEF2F2', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>반복{d.recurrenceCount}회</span>}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {/* 전체 하자 */}
          <div style={{ ...card, padding: '18px 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#2563EB', borderRadius: '12px 12px 0 0' }} />
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#697386', marginBottom: 10 }}>전체 하자</div>
            <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.04em', lineHeight: 1 }}>{total}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
              <span style={{ fontSize: '0.7rem', color: '#697386' }}>누적 등록</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#f3f5f7', color: '#697386' }}>건</span>
            </div>
          </div>

          {/* 처리 진행중 */}
          <div style={{ ...card, padding: '18px 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#F97316', borderRadius: '12px 12px 0 0' }} />
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#697386', marginBottom: 10 }}>처리 진행중</div>
            <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.04em', lineHeight: 1 }}>{inProg}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
              <span style={{ fontSize: '0.7rem', color: '#697386' }}>접수 포함 {open + inProg + hold}건 미완료</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#FFF7ED', color: '#F97316' }}>{Math.round((inProg / Math.max(total, 1)) * 100)}%</span>
            </div>
          </div>

          {/* 처리 완료 */}
          <div style={{ ...card, padding: '18px 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#16A34A', borderRadius: '12px 12px 0 0' }} />
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#697386', marginBottom: 10 }}>처리 완료</div>
            <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.04em', lineHeight: 1 }}>{done}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
              <span style={{ fontSize: '0.7rem', color: '#697386' }}>완료율</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#F0FDF4', color: '#16A34A' }}>{Math.round((done / Math.max(total, 1)) * 100)}%</span>
            </div>
          </div>

          {/* 누적 처리비용 */}
          <div style={{ ...card, padding: '18px 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#2563EB', borderRadius: '12px 12px 0 0' }} />
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#697386', marginBottom: 10 }}>누적 처리비용</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.04em', lineHeight: 1 }}>
              {(totalCost / 10000).toFixed(0)}<span style={{ fontSize: '0.9rem', fontWeight: 600 }}>만원</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
              <span style={{ fontSize: '0.7rem', color: '#697386' }}>재발 {recurred}건 포함</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#f3f5f7', color: '#697386' }}>이번달 {thisMonth}건</span>
            </div>
          </div>
        </div>

        {/* Row 1: Monthly trend + Category bars */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '3fr 2fr', gap: 14, marginBottom: 14 }}>
          <div style={card}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>월별 발생 추이</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>최근 12개월</div>
              </div>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(99,91,255,.09)', color: '#635bff' }}>피크: {peakLabel}</span>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ position: 'relative', height: 210 }}>
                <Line data={monthlyChartData} options={lineOpts} />
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f4f8' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>카테고리별 현황</div>
              <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>전체 하자 분포</div>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {catData.map(c => {
                  const pct = Math.round(c.count / catTotal * 100)
                  return (
                    <div key={c.id}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#0a2540', display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0, display: 'inline-block' }} />
                          {c.name}
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#425466' }}>
                          {c.count}건<span style={{ fontSize: '0.68rem', color: '#697386', marginLeft: 4 }}>{pct}%</span>
                        </span>
                      </div>
                      <div style={{ height: 5, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: c.color, borderRadius: 999, transition: 'width 0.5s cubic-bezier(.4,0,.2,1)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Severity bars + Vendor cost */}
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={card}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f4f8' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>심각도 분포</div>
              <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>위험도 현황</div>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {sevCfg.map(s => {
                  const cnt = defects.filter(d => d.severity === s.key).length
                  const pct = Math.round(cnt / sevTotal * 100)
                  return (
                    <div key={s.key}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#0a2540', display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0, display: 'inline-block' }} />
                          {s.label}
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#425466' }}>
                          {cnt}건<span style={{ fontSize: '0.68rem', color: '#697386', marginLeft: 4 }}>{pct}%</span>
                        </span>
                      </div>
                      <div style={{ height: 5, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: s.color, borderRadius: 999, transition: 'width 0.5s cubic-bezier(.4,0,.2,1)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f4f8' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>협력업체별 누적 비용</div>
              <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>처리 비용 합산</div>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ position: 'relative', height: 180 }}>
                <Bar data={vendorChartData} options={barOpts} />
              </div>
            </div>
          </div>
        </div>

        {/* ── AI 분석 인사이트 ──────────────────────────────────────────── */}
        <div id="ai-insight-section" style={{ marginTop: 24 }}>
          {/* Section Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px 16px', background: 'linear-gradient(135deg,rgba(99,91,255,.08),rgba(99,91,255,.03))', borderRadius: 12, border: '1px solid rgba(99,91,255,.18)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#635bff,#8b85ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 14 }}>✨</span>
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0a2540' }}>AI 분석 인사이트</div>
              <div style={{ fontSize: '0.7rem', color: '#697386', marginTop: 1 }}>Rule-Based 분석 · 실시간 데이터 기반 인사이트 · LLM 교체 가능 아키텍처</div>
            </div>
          </div>

          {/* Row A: 반복 발생 원인 TOP10 + 시설별 고장 순위 */}
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Widget 1: 반복 발생 원인 TOP10 */}
            <div style={aiCard}>
              <div style={aiCardHeader}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>반복 발생 원인 TOP10</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>원인 분류별 발생 + 재발 횟수 기준</div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {topCauses.length === 0 ? (
                  <div style={{ color: '#aab', fontSize: '0.75rem', textAlign: 'center', padding: '16px 0' }}>AI 분석 데이터 없음 — 하자 접수 후 AI 분석 실행</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topCauses.map(([cause, v], i) => {
                      const total = v.count + v.recurrences
                      const pct = Math.round((total / topCausesMax) * 100)
                      return (
                        <div key={cause}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: i < 3 ? '#635bff' : '#697386', minWidth: 14 }}>#{i + 1}</span>
                              <span style={{ fontSize: '0.75rem', color: '#0a2540', fontWeight: i < 3 ? 600 : 400 }}>{cause}</span>
                            </div>
                            <span style={{ fontSize: '0.7rem', color: '#425466', fontWeight: 600 }}>{total}회</span>
                          </div>
                          <div style={{ height: 5, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: i < 3 ? '#635bff' : '#a5b4fc', borderRadius: 999 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Widget 2: 시설별 고장 순위 */}
            <div style={aiCard}>
              <div style={aiCardHeader}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>시설별 고장 순위</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>층/구역별 하자 발생 빈도 순위</div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {floorRanking.length === 0 ? (
                  <div style={{ color: '#aab', fontSize: '0.75rem', textAlign: 'center', padding: '16px 0' }}>층 정보가 있는 하자 없음</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {floorRanking.slice(0, 8).map((f, i) => {
                      const pct = Math.round((f.count / floorMax) * 100)
                      const medals = ['🥇', '🥈', '🥉']
                      const rank = medals[i] ?? `#${i + 1}`
                      return (
                        <div key={f.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: '0.7rem', minWidth: 18 }}>{rank}</span>
                              <span style={{ fontSize: '0.75rem', color: '#0a2540', fontWeight: i < 3 ? 600 : 400 }}>{f.name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '0.65rem', color: '#697386' }}>{fmtKRW(f.cost)}</span>
                              <span style={{ fontSize: '0.7rem', color: '#425466', fontWeight: 600 }}>{f.count}건</span>
                            </div>
                          </div>
                          <div style={{ height: 5, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: i < 3 ? '#059669' : '#6ee7b7', borderRadius: 999 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row B: 분야별 비용 분석 + 재발생 하자 분석 */}
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Widget 3: 분야별 비용 분석 */}
            <div style={aiCard}>
              <div style={aiCardHeader}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>분야별 비용 분석</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>카테고리별 누적 처리 비용 및 평균</div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {catCostData.map((c, i) => {
                    const pct = Math.round((c.catTotal / catCostMax) * 100)
                    const catColors = ['#635bff', '#059669', '#d97706', '#e11d48']
                    const color = catColors[i % catColors.length]
                    return (
                      <div key={c.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: '0.75rem', color: '#0a2540', fontWeight: 500 }}>{c.name}</span>
                            <span style={{ fontSize: '0.65rem', color: '#697386' }}>{c.count}건</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0a2540' }}>{fmtKRW(c.catTotal)}</div>
                            <div style={{ fontSize: '0.63rem', color: '#697386' }}>평균 {fmtKRW(c.avg)}</div>
                          </div>
                        </div>
                        <div style={{ height: 6, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999, opacity: 0.85 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Widget 4: 재발생 하자 분석 */}
            <div style={aiCard}>
              <div style={aiCardHeader}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>재발생 하자 분석</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>카테고리별 재발률 및 최다 재발 하자</div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.68rem', color: '#697386', marginBottom: 6, fontWeight: 600 }}>카테고리별 재발률</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {recurRateByCat.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.72rem', color: '#0a2540', minWidth: 48 }}>{c.name}</span>
                        <div style={{ flex: 1, height: 5, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${c.rate}%`, background: c.rate >= 50 ? '#e11d48' : c.rate >= 25 ? '#d97706' : '#635bff', borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: c.rate >= 50 ? '#e11d48' : '#425466', minWidth: 36, textAlign: 'right' }}>{c.rate}%</span>
                        <span style={{ fontSize: '0.63rem', color: '#697386' }}>({c.recurred}/{c.total})</span>
                      </div>
                    ))}
                  </div>
                </div>
                {recurredDefs.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#697386', marginBottom: 6, fontWeight: 600 }}>최다 재발 하자 TOP3</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {recurredDefs.slice(0, 3).map((d, i) => (
                        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: '#faf9ff', borderRadius: 6, border: '1px solid rgba(99,91,255,.1)' }}>
                          <span style={{ fontSize: '0.72rem', color: '#0a2540' }}>#{i + 1} {d.title.slice(0, 18)}{d.title.length > 18 ? '…' : ''}</span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#635bff' }}>{d.recurrenceCount}회 재발</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row C: 취약 구역 분석 + 향후 예상 유지보수 비용 */}
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14 }}>
            {/* Widget 5: 취약 구역 분석 */}
            <div style={aiCard}>
              <div style={aiCardHeader}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>취약 구역 분석</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>취약 점수 = 하자수 + 고위험×2</div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {zones.length === 0 ? (
                  <div style={{ color: '#aab', fontSize: '0.75rem', textAlign: 'center', padding: '16px 0' }}>층/구역 데이터 없음</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {zones.slice(0, 7).map((z, i) => {
                      const pct = Math.round((z.score / zoneMax) * 100)
                      const level = pct >= 75
                        ? { label: '위험', color: '#e11d48', bg: '#fef2f2' }
                        : pct >= 40
                          ? { label: '주의', color: '#d97706', bg: '#fffbeb' }
                          : { label: '양호', color: '#059669', bg: '#f0fdf4' }
                      return (
                        <div key={z.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#697386', minWidth: 14 }}>#{i + 1}</span>
                              <span style={{ fontSize: '0.75rem', color: '#0a2540', fontWeight: pct >= 75 ? 700 : 400 }}>{z.name}</span>
                              <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 4, background: level.bg, color: level.color, fontWeight: 700 }}>{level.label}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '0.63rem', color: '#697386' }}>고위험 {z.critical}건</span>
                              <span style={{ fontSize: '0.7rem', color: '#425466', fontWeight: 600 }}>{z.defects}건</span>
                            </div>
                          </div>
                          <div style={{ height: 5, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: level.color, borderRadius: 999, opacity: 0.7 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Widget 6: 향후 예상 유지보수 비용 */}
            <div style={aiCard}>
              <div style={aiCardHeader}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>향후 예상 유지보수 비용</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>월평균 추세 + 진행중 예측비용 기반 추정</div>
              </div>
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {([
                    { label: '3개월', value: forecast3m, color: '#059669' },
                    { label: '6개월', value: forecast6m, color: '#d97706' },
                    { label: '12개월', value: forecast12m, color: '#635bff' },
                  ] as const).map(f => (
                    <div key={f.label} style={{ padding: '10px 8px', background: '#faf9ff', borderRadius: 8, border: '1px solid rgba(99,91,255,.12)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#697386', marginBottom: 4 }}>{f.label} 예측</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: f.color }}>{fmtKRW(f.value)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f4f8' }}>
                    <span style={{ fontSize: '0.72rem', color: '#697386' }}>월평균 유지보수비 (실적)</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0a2540' }}>{fmtKRW(avgMonthly)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f4f8' }}>
                    <span style={{ fontSize: '0.72rem', color: '#697386' }}>진행중 하자 예측비용</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#d97706' }}>{fmtKRW(pendingPredCost)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#697386' }}>미처리 하자 건수</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#e11d48' }}>{openCount}건</span>
                  </div>
                </div>
                <div style={{ marginTop: 10, padding: '7px 10px', background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '0.65rem', color: '#92400e' }}>※ 예측값 = 월평균 × 개월 + 진행중 AI 예측비용 (가중치 적용). 실제 발생 비용과 차이 있을 수 있음.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Row D: 위치별 하자 발생 Top10 + 반복 발생 설비 Top5 */}
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14, marginTop: 14 }}>
            <div style={aiCard}>
              <div style={aiCardHeader}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>위치별 하자 발생 Top10</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>도면 위치 라벨 기준 집계 (4단계 위치 데이터)</div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {topLocations.length === 0 ? (
                  <div style={{ color: '#aab', fontSize: '0.75rem', textAlign: 'center', padding: '16px 0' }}>도면 위치 라벨이 등록된 하자가 없음</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topLocations.map(([label, v], i) => {
                      const pct = Math.round((v.count / topLocationsMax) * 100)
                      return (
                        <Link key={label} href={`/defects?search=${encodeURIComponent(label)}`} style={{ textDecoration: 'none', display: 'block' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: i < 3 ? '#635bff' : '#697386', minWidth: 14 }}>#{i + 1}</span>
                              <span style={{ fontSize: '0.75rem', color: '#0a2540', fontWeight: i < 3 ? 600 : 400 }}>{label}</span>
                              {v.recurring && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: COLORS.danger, background: '#FEF2F2', padding: '1px 5px', borderRadius: 4 }}>반복</span>}
                            </div>
                            <span style={{ fontSize: '0.7rem', color: '#425466', fontWeight: 600 }}>{v.count}건</span>
                          </div>
                          <div style={{ height: 5, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: i < 3 ? '#635bff' : '#a5b4fc', borderRadius: 999 }} />
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div style={aiCard}>
              <div style={aiCardHeader}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>반복 발생 설비 Top5</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>설비명 기준 집계 (2단계 설비명 필드)</div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {topFacilities.length === 0 ? (
                  <div style={{ color: '#aab', fontSize: '0.75rem', textAlign: 'center', padding: '16px 0' }}>설비명이 등록된 하자가 없음</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topFacilities.map(([name, count], i) => {
                      const pct = Math.round((count / topFacilitiesMax) * 100)
                      return (
                        <div key={name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: '0.75rem', color: '#0a2540', fontWeight: i < 3 ? 600 : 400 }}>{name}</span>
                            <span style={{ fontSize: '0.7rem', color: '#425466', fontWeight: 600 }}>{count}건</span>
                          </div>
                          <div style={{ height: 5, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: i < 3 ? '#059669' : '#6ee7b7', borderRadius: 999 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row E: 하자사항/일반사항 구분 현황 + 비용 부담 주체별 현황 */}
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: 14, marginTop: 14 }}>
            <div style={aiCard}>
              <div style={aiCardHeader}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>하자사항/일반사항 구분 현황</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>관리자 확정 또는 기본값(확인 필요) 기준</div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {defectTypeCounts.map(({ type, count }) => {
                    const pct = Math.round((count / Math.max(1, total)) * 100)
                    const color = type === '하자사항' ? COLORS.danger : type === '일반사항' ? COLORS.success : COLORS.textMuted
                    return (
                      <Link key={type} href={`/defects?filter=${type === '확인 필요' ? 'unclassified' : ''}`} style={{ textDecoration: 'none', display: 'block' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: '0.78rem', color: '#0a2540', fontWeight: 500 }}>{type}</span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#425466' }}>{count}건 <span style={{ fontSize: '0.68rem', color: '#697386' }}>{pct}%</span></span>
                        </div>
                        <div style={{ height: 6, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 999 }} />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>

            <div style={aiCard}>
              <div style={aiCardHeader}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>비용 부담 주체별 현황</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>건수 및 누적 비용</div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {costBearerCounts.filter(c => c.count > 0).map(c => {
                    const pct = Math.round((c.count / costBearerMax) * 100)
                    const isUnresolved = c.bearer === '미정'
                    return (
                      <div key={c.bearer}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: '0.75rem', color: isUnresolved ? COLORS.danger : '#0a2540', fontWeight: isUnresolved ? 700 : 500 }}>{c.bearer}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '0.65rem', color: '#697386' }}>{fmtKRW(c.cost)}</span>
                            <span style={{ fontSize: '0.7rem', color: '#425466', fontWeight: 600 }}>{c.count}건</span>
                          </div>
                        </div>
                        <div style={{ height: 5, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: isUnresolved ? COLORS.danger : '#059669', borderRadius: 999 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Row F: 비용 증가 위험 항목 Top5 */}
          <div style={{ marginTop: 14 }}>
            <div style={aiCard}>
              <div style={aiCardHeader}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>비용 증가 위험 항목 Top5</div>
                <div style={{ fontSize: '0.68rem', color: '#697386', marginTop: 2 }}>재발 횟수 × 누적 비용 기준</div>
              </div>
              <div style={{ padding: '8px 0' }}>
                {costRiskTop5.length === 0 ? (
                  <div style={{ color: '#aab', fontSize: '0.75rem', textAlign: 'center', padding: '16px 0' }}>재발 이력이 있는 하자가 없음</div>
                ) : (
                  costRiskTop5.map((d, i) => (
                    <Link
                      key={d.id}
                      href={`/defects/${d.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', textDecoration: 'none', borderBottom: i < costRiskTop5.length - 1 ? '1px solid #f7f8fa' : 'none' }}
                    >
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#635bff', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontFamily: "'SF Mono','Fira Code',monospace", fontSize: '0.7rem', color: '#635bff', flexShrink: 0 }}>{d.caseNumber}</span>
                      <span style={{ fontSize: '0.8rem', color: '#0a2540', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: COLORS.danger, background: '#FEF2F2', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>재발{d.recurrenceCount}회</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0a2540', flexShrink: 0 }}>{fmtKRW(d.totalCost)}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
