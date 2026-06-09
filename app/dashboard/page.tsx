'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Filler,
  Tooltip, Legend,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { useStore } from '@/lib/store'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend)

function fmtKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}

export default function DashboardPage() {
  const { state } = useStore()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const defects = state.defects
  const total = defects.length
  const open = defects.filter(d => d.status === 'open').length
  const inProg = defects.filter(d => d.status === 'in_progress').length
  const done = defects.filter(d => d.status === 'completed').length
  const totalCost = defects.reduce((s, d) => s + (d.totalCost || 0), 0)
  const recurred = defects.filter(d => d.recurrenceCount > 0).length
  const now = new Date()
  const mm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = defects.filter(d => d.createdAt && d.createdAt.startsWith(mm)).length
  const updatedAt = now.toLocaleString('ko-KR')

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
    { key: 'critical', label: '긴급', color: '#be1044' },
    { key: 'high', label: '높음', color: '#c2440c' },
    { key: 'medium', label: '보통', color: '#9a6c00' },
    { key: 'low', label: '낮음', color: '#697386' },
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
      borderColor: '#635bff',
      backgroundColor: 'rgba(99,91,255,0.12)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#635bff',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      borderWidth: 2,
    }],
  }

  const vendorChartData = {
    labels: vendorCosts.map(v => v.name),
    datasets: [{
      data: vendorCosts.map(v => v.cost),
      backgroundColor: 'rgba(99,91,255,.7)',
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
          <Link
            href="/defects/new"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, background: '#635bff', color: '#fff', textDecoration: 'none' }}
          >
            <i className="fa-solid fa-plus" /> 하자 등록
          </Link>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '24px 32px' }}>

        {/* KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {/* 전체 하자 */}
          <div style={{ ...card, padding: '18px 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#635bff', borderRadius: '12px 12px 0 0' }} />
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#697386', marginBottom: 10 }}>전체 하자</div>
            <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.04em', lineHeight: 1 }}>{total}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
              <span style={{ fontSize: '0.7rem', color: '#697386' }}>누적 등록</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#f3f5f7', color: '#697386' }}>건</span>
            </div>
          </div>

          {/* 처리 진행중 */}
          <div style={{ ...card, padding: '18px 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#e8960c', borderRadius: '12px 12px 0 0' }} />
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#697386', marginBottom: 10 }}>처리 진행중</div>
            <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.04em', lineHeight: 1 }}>{inProg}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
              <span style={{ fontSize: '0.7rem', color: '#697386' }}>접수 포함 {open + inProg}건 미완료</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#fef3e2', color: '#b06b1a' }}>{Math.round((inProg / Math.max(total, 1)) * 100)}%</span>
            </div>
          </div>

          {/* 처리 완료 */}
          <div style={{ ...card, padding: '18px 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#0f7850', borderRadius: '12px 12px 0 0' }} />
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#697386', marginBottom: 10 }}>처리 완료</div>
            <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#0a2540', letterSpacing: '-0.04em', lineHeight: 1 }}>{done}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
              <span style={{ fontSize: '0.7rem', color: '#697386' }}>완료율</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#e6f6f0', color: '#0f7850' }}>{Math.round((done / Math.max(total, 1)) * 100)}%</span>
            </div>
          </div>

          {/* 누적 처리비용 */}
          <div style={{ ...card, padding: '18px 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#1d6dc2', borderRadius: '12px 12px 0 0' }} />
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
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, marginBottom: 14 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
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

      </div>
    </div>
  )
}
