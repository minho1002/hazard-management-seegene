'use client'

import { useState, useEffect } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement,
  Tooltip, Legend, Filler,
} from 'chart.js'
import { Doughnut, Bar, Line } from 'react-chartjs-2'
import * as XLSX from 'xlsx'
import { useStore } from '@/lib/store'
import { toLegacyBucket, STATUS_META } from '@/lib/designTokens'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler)

// ── Types ──────────────────────────────────────────────────────────────────
type DefectRow = {
  id: number
  caseNumber: string
  title: string
  locationText: string | null
  severity: string
  status: string
  costType: string
  reporterName: string | null
  managerName: string | null
  recurrenceCount: number | null
  firstOccurredAt: string | null
  totalCost: number
  categoryName: string | null
  categoryColor: string | null
  vendorName: string | null
}

type ApiData = {
  summary: { total: number; open: number; inProgress: number; hold: number; completed: number; totalCost: number }
  byCategory: { name: string; color: string; count: number; cost: number }[]
  bySeverity: { severity: string; count: number }[]
  monthly: { month: string; count: number; cost: number }[]
  defects: DefectRow[]
}

type MonthEntry = { month: string; label: string; count: number; cost: number }

type ReportParams = {
  from: string; to: string
  summary: ApiData['summary']
  byCategory: ApiData['byCategory']
  allMonths: MonthEntry[]
  sevData: { key: string; label: string; color: string; count: number }[]
  defects: DefectRow[]
  insights: string[]
  actionItems: DefectRow[]
}

// ── Constants ──────────────────────────────────────────────────────────────
const SEV_CONFIG = [
  { key: 'critical', label: '긴급', color: '#be1044' },
  { key: 'high',     label: '높음', color: '#c2440c' },
  { key: 'medium',   label: '보통', color: '#9a6c00' },
  { key: 'low',      label: '낮음', color: '#697386' },
]
const SEV_LABELS: Record<string, string> = { critical: '긴급', high: '높음', medium: '보통', low: '낮음' }
const STAT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_META).map(([key, meta]) => [key, meta.label])
)

const PERIODS = [
  { key: 'this_month', label: '이번 달' },
  { key: 'last_month', label: '지난 달' },
  { key: '3months',    label: '최근 3개월' },
  { key: '6months',    label: '최근 6개월' },
  { key: 'custom',     label: '사용자 지정' },
]

// ── A4 CSS for standalone export ───────────────────────────────────────────
const RPT_CSS = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{background:#fff}
.rpt-a4{font-family:'Malgun Gothic','맑은 고딕','Inter',sans-serif;font-size:10.5pt;line-height:1.7;color:#0a2540;background:#fff;padding:20mm;width:210mm;min-height:297mm;box-sizing:border-box}
.rpt-hd{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.rpt-hd-left .rpt-title{font-size:15pt;font-weight:800;color:#0a2540;line-height:1.2}
.rpt-hd-left .rpt-org{font-size:9pt;color:#635bff;font-weight:600;margin-top:4px}
.rpt-hd-right{text-align:right}
.rpt-hd-meta{font-size:8.5pt;color:#425466;margin-bottom:2px}
.rpt-hd-meta strong{color:#0a2540;font-weight:700}
.rpt-rule{border:none;border-top:2.5px solid #0a2540;margin:0 0 14px}
.rpt-rule-thin{border:none;border-top:1px solid #e3e8ef;margin:14px 0}
.rpt-sec{margin-bottom:18px}
.rpt-sec-h{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#635bff;border-left:3px solid #635bff;padding-left:8px;margin-bottom:10px}
.rpt-kpi-row{display:flex;gap:10px}
.rpt-kpi{flex:1;border:1px solid #e3e8ef;border-radius:7px;padding:12px 10px;text-align:center;position:relative;overflow:hidden}
.rpt-kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px}
.rpt-kpi.ka::before{background:#635bff}.rpt-kpi.kb::before{background:#1d6dc2}.rpt-kpi.kc::before{background:#e8960c}.rpt-kpi.kf::before{background:#a16207}.rpt-kpi.kd::before{background:#0f7850}.rpt-kpi.ke::before{background:#be1044}
.rpt-kpi-lbl{font-size:7.5pt;font-weight:700;text-transform:uppercase;color:#697386;margin-bottom:6px}
.rpt-kpi-v{font-size:18pt;font-weight:800;letter-spacing:-.03em;line-height:1}
.rpt-kpi-u{font-size:7.5pt;color:#697386;margin-top:3px}
.rpt-2col{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.rpt-tbl{width:100%;border-collapse:collapse;font-size:9pt}
.rpt-tbl th{background:#f5f7fa;padding:6px 9px;text-align:left;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#425466;border-bottom:1.5px solid #e3e8ef}
.rpt-tbl td{padding:6px 9px;border-bottom:1px solid #f0f4f8;vertical-align:middle}
.rpt-tbl-sm td,.rpt-tbl-sm th{padding:5px 7px;font-size:8pt}
.rpt-bar-wrap{display:inline-block;width:56px;height:5px;background:#f0f4f8;border-radius:3px;vertical-align:middle;margin-right:4px;overflow:hidden}
.rpt-bar{height:100%;border-radius:3px}
.rpt-pct{font-size:7.5pt;color:#697386}
.rpt-cdot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
.rpt-mchart{display:flex;gap:3px;align-items:flex-end;border-bottom:1.5px solid #e3e8ef;padding-bottom:0}
.rpt-mcol{flex:1;display:flex;flex-direction:column;align-items:center}
.rpt-mbar-w{height:68px;display:flex;align-items:flex-end;width:100%}
.rpt-mbar{width:100%;background:#635bff;border-radius:2px 2px 0 0;min-height:2px}
.rpt-mcnt{font-size:7pt;font-weight:700;color:#0a2540;text-align:center;width:100%;margin-top:3px}
.rpt-mlbl{font-size:6.5pt;color:#697386;text-align:center;width:100%}
.rpt-insight-list{padding-left:15px;margin:0}
.rpt-insight-list li{font-size:9pt;color:#425466;margin-bottom:5px;line-height:1.6}
.rpt-sev,.rpt-stat{display:inline-block;padding:1px 6px;border-radius:4px;font-size:8pt;font-weight:600;white-space:nowrap}
.rpt-sev-critical{background:#fef0f4;color:#be1044}.rpt-sev-high{background:#fef3ee;color:#c2440c}.rpt-sev-medium{background:#fefae8;color:#9a6c00}.rpt-sev-low{background:#f3f5f7;color:#697386}
.rpt-stat-open{background:#ebf3fe;color:#1d6dc2}.rpt-stat-in_progress{background:#fef3e2;color:#b06b1a}.rpt-stat-hold{background:#fefce8;color:#a16207}.rpt-stat-completed{background:#e6f6f0;color:#0f7850}
.rpt-page-break{break-before:page;page-break-before:always;padding-top:20mm}
.rpt-footer{text-align:center;font-size:8pt;color:#b0bac6;margin-top:28px;padding-top:10px;border-top:1px solid #e3e8ef}
@media print{@page{size:A4 portrait;margin:0}.rpt-page-break{break-before:page;page-break-before:always;padding-top:0}.rpt-sec{break-inside:avoid}.rpt-tbl tr{break-inside:avoid}.rpt-2col{break-inside:avoid}}`

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtKRW(n: number | null | undefined): string {
  if (!n) return '0원'
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}

function getPeriodDates(p: string): { from: string; to: string } {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  if (p === 'this_month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: today }
  }
  if (p === 'last_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last  = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
  }
  if (p === '6months') {
    const d = new Date(now); d.setMonth(d.getMonth() - 6)
    return { from: d.toISOString().slice(0, 10), to: today }
  }
  const d = new Date(now); d.setMonth(d.getMonth() - 3)
  return { from: d.toISOString().slice(0, 10), to: today }
}

function buildMonthsInRange(from: string, to: string, monthly: ApiData['monthly']): MonthEntry[] {
  const result: MonthEntry[] = []
  const toD = new Date(to)
  let cur = new Date(new Date(from).getFullYear(), new Date(from).getMonth(), 1)
  while (cur <= toD) {
    const m = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
    const found = monthly.find(d => d.month === m)
    result.push({ month: m, label: m.slice(5) + '월', count: found?.count ?? 0, cost: found?.cost ?? 0 })
    cur.setMonth(cur.getMonth() + 1)
  }
  return result
}

function buildInsights(from: string, to: string, data: ApiData): string[] {
  const { summary, byCategory, defects } = data
  const { total, completed: done, totalCost } = summary
  const insights: string[] = []
  insights.push(`보고 기간(${from} ~ ${to}) 내 총 ${total}건의 하자가 등록되었습니다.`)
  if (total > 0) {
    insights.push(`전체 ${total}건 중 ${done}건(${Math.round(done / total * 100)}%)이 완료 처리되었습니다.`)
    const topCat = [...byCategory].sort((a, b) => b.count - a.count)[0]
    if (topCat?.count > 0) insights.push(`'${topCat.name}' 카테고리가 ${topCat.count}건으로 가장 많이 발생했습니다.`)
    const critCount = defects.filter(d => d.severity === 'critical').length
    if (critCount > 0) insights.push(`심각도 '긴급' 하자 ${critCount}건은 즉각적인 조치가 필요합니다.`)
    if (totalCost > 0) insights.push(`기간 내 누적 처리 비용은 총 ${fmtKRW(totalCost)}입니다.`)
    const recCount = defects.filter(d => (d.recurrenceCount ?? 0) > 0).length
    if (recCount > 0) insights.push(`재발 이력이 있는 하자 ${recCount}건에 대해 근본 원인 분석이 필요합니다.`)
  } else {
    insights.push('해당 기간 내 등록된 하자가 없습니다.')
  }
  return insights
}

function computeReportParams(data: ApiData, from: string, to: string): ReportParams {
  const allMonths = buildMonthsInRange(from, to, data.monthly)
  const sevData = SEV_CONFIG.map(s => ({
    ...s,
    count: data.bySeverity.find(b => b.severity === s.key)?.count ?? 0,
  }))
  const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const actionItems = data.defects
    .filter(d => toLegacyBucket(d.status) === 'open' || toLegacyBucket(d.status) === 'in_progress')
    .sort((a, b) => (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3))
  return {
    from, to,
    summary: data.summary,
    byCategory: data.byCategory,
    allMonths,
    sevData,
    defects: data.defects,
    insights: buildInsights(from, to, data),
    actionItems,
  }
}

// ── Build A4 HTML ──────────────────────────────────────────────────────────
function buildA4HTML(p: ReportParams): string {
  const today = new Date().toISOString().slice(0, 10)
  const { total } = p.summary
  const maxMth = Math.max(...p.allMonths.map(m => m.count), 1)

  const catRows = p.byCategory.map(c => `
    <tr>
      <td><span class="rpt-cdot" style="background:${c.color}"></span>${c.name}</td>
      <td style="text-align:center;font-weight:700">${c.count}</td>
      <td><div class="rpt-bar-wrap"><div class="rpt-bar" style="width:${total ? Math.round(c.count / total * 100) : 0}%;background:${c.color}"></div></div><span class="rpt-pct">${total ? Math.round(c.count / total * 100) : 0}%</span></td>
      <td style="text-align:right">${fmtKRW(c.cost)}</td>
    </tr>`).join('')

  const sevRows = p.sevData.map(s => `
    <tr>
      <td><span class="rpt-cdot" style="background:${s.color}"></span>${s.label}</td>
      <td style="text-align:center;font-weight:700">${s.count}</td>
      <td><div class="rpt-bar-wrap"><div class="rpt-bar" style="width:${total ? Math.round(s.count / total * 100) : 0}%;background:${s.color}"></div></div><span class="rpt-pct">${total ? Math.round(s.count / total * 100) : 0}%</span></td>
    </tr>`).join('')

  const mCols = p.allMonths.map(m => `
    <div class="rpt-mcol">
      <div class="rpt-mbar-w"><div class="rpt-mbar" style="height:${Math.max(Math.round(m.count / maxMth * 68), 2)}px"></div></div>
      <div class="rpt-mcnt">${m.count}</div>
      <div class="rpt-mlbl">${m.label}</div>
    </div>`).join('')

  const actionSection = p.actionItems.length > 0 ? `
    <hr class="rpt-rule-thin">
    <div class="rpt-sec">
      <div class="rpt-sec-h">조치 필요 사항 (${p.actionItems.length}건)</div>
      <table class="rpt-tbl rpt-tbl-sm">
        <thead><tr><th>케이스번호</th><th>제목</th><th>심각도</th><th>상태</th><th>담당업체</th></tr></thead>
        <tbody>${p.actionItems.map(d => `
          <tr>
            <td style="font-family:monospace;font-size:8pt;color:#635bff">${d.caseNumber}</td>
            <td>${d.title}</td>
            <td><span class="rpt-sev rpt-sev-${d.severity}">${SEV_LABELS[d.severity] ?? d.severity}</span></td>
            <td><span class="rpt-stat rpt-stat-${d.status}">${STAT_LABELS[d.status] ?? d.status}</span></td>
            <td>${d.vendorName ?? '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''

  const detailRows = p.defects.length > 0
    ? p.defects.map(d => `
      <tr>
        <td style="font-family:monospace;font-size:7.5pt;color:#635bff">${d.caseNumber}</td>
        <td>${d.title}</td>
        <td>${d.categoryName ? `<span class="rpt-cdot" style="background:${d.categoryColor ?? '#999'}"></span>${d.categoryName}` : '-'}</td>
        <td style="font-size:8pt">${d.locationText ?? '-'}</td>
        <td><span class="rpt-sev rpt-sev-${d.severity}">${SEV_LABELS[d.severity] ?? d.severity}</span></td>
        <td><span class="rpt-stat rpt-stat-${d.status}">${STAT_LABELS[d.status] ?? d.status}</span></td>
        <td style="white-space:nowrap;font-size:7.5pt">${d.firstOccurredAt?.slice(0, 10) ?? '-'}</td>
        <td style="text-align:right;font-size:7.5pt">${d.totalCost ? fmtKRW(d.totalCost) : '-'}</td>
      </tr>`).join('')
    : `<tr><td colspan="8" style="text-align:center;color:#697386;padding:16px">해당 기간 내 하자 내역이 없습니다.</td></tr>`

  return `<div class="rpt-a4">
  <div class="rpt-hd">
    <div class="rpt-hd-left">
      <div class="rpt-title">시설 하자관리 보고서</div>
      <div class="rpt-org">대전충청검사센터 시설관리팀</div>
    </div>
    <div class="rpt-hd-right">
      <div class="rpt-hd-meta"><strong>보고 기간</strong>&nbsp;${p.from} ~ ${p.to}</div>
      <div class="rpt-hd-meta"><strong>생성일</strong>&nbsp;${today}</div>
      <div class="rpt-hd-meta"><strong>작성부서</strong>&nbsp;시설관리팀</div>
    </div>
  </div>
  <hr class="rpt-rule">
  <div class="rpt-sec">
    <div class="rpt-sec-h">요약</div>
    <div class="rpt-kpi-row">
      <div class="rpt-kpi ka"><div class="rpt-kpi-lbl">전체</div><div class="rpt-kpi-v">${p.summary.total}</div><div class="rpt-kpi-u">건</div></div>
      <div class="rpt-kpi kb"><div class="rpt-kpi-lbl">접수</div><div class="rpt-kpi-v" style="color:#1d6dc2">${p.summary.open}</div><div class="rpt-kpi-u">건</div></div>
      <div class="rpt-kpi kc"><div class="rpt-kpi-lbl">처리중</div><div class="rpt-kpi-v" style="color:#b06b1a">${p.summary.inProgress}</div><div class="rpt-kpi-u">건</div></div>
      <div class="rpt-kpi kf"><div class="rpt-kpi-lbl">보류</div><div class="rpt-kpi-v" style="color:#a16207">${p.summary.hold}</div><div class="rpt-kpi-u">건</div></div>
      <div class="rpt-kpi kd"><div class="rpt-kpi-lbl">완료</div><div class="rpt-kpi-v" style="color:#0f7850">${p.summary.completed}</div><div class="rpt-kpi-u">건</div></div>
      <div class="rpt-kpi ke"><div class="rpt-kpi-lbl">총 비용</div><div class="rpt-kpi-v" style="font-size:13pt;color:#be1044">${fmtKRW(p.summary.totalCost)}</div><div class="rpt-kpi-u">원</div></div>
    </div>
  </div>
  <hr class="rpt-rule-thin">
  <div class="rpt-2col">
    <div class="rpt-sec">
      <div class="rpt-sec-h">카테고리별 현황</div>
      <table class="rpt-tbl">
        <thead><tr><th>카테고리</th><th style="text-align:center">건수</th><th>비율</th><th style="text-align:right">비용</th></tr></thead>
        <tbody>${catRows}</tbody>
      </table>
    </div>
    <div class="rpt-sec">
      <div class="rpt-sec-h">심각도별 분포</div>
      <table class="rpt-tbl">
        <thead><tr><th>심각도</th><th style="text-align:center">건수</th><th>비율</th></tr></thead>
        <tbody>${sevRows}</tbody>
      </table>
    </div>
  </div>
  <hr class="rpt-rule-thin">
  <div class="rpt-sec">
    <div class="rpt-sec-h">월별 발생 추이</div>
    <div class="rpt-mchart">${mCols}</div>
  </div>
  <hr class="rpt-rule-thin">
  <div class="rpt-sec">
    <div class="rpt-sec-h">주요 인사이트</div>
    <ul class="rpt-insight-list">${p.insights.map(ins => `<li>${ins}</li>`).join('')}</ul>
  </div>
  ${actionSection}
  <div class="rpt-page-break">
    <div class="rpt-sec-h" style="margin-bottom:10px">하자 목록 상세 (${p.defects.length}건)</div>
    <table class="rpt-tbl rpt-tbl-sm">
      <thead><tr><th>번호</th><th>제목</th><th>카테고리</th><th>위치</th><th>심각도</th><th>상태</th><th>발생일</th><th style="text-align:right">비용</th></tr></thead>
      <tbody>${detailRows}</tbody>
    </table>
  </div>
  <div class="rpt-footer">대전충청검사센터 시설관리팀&nbsp;|&nbsp;하자관리시스템&nbsp;|&nbsp;출력일: ${today}</div>
</div>`
}

function buildStandaloneHTML(p: ReportParams): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>시설 하자관리 보고서</title><style>${RPT_CSS}</style></head><body>${buildA4HTML(p)}</body></html>`
}

// ── Build ApiData from localStorage ────────────────────────────────────────
function buildApiData(state: ReturnType<typeof useStore>['state'], from: string, to: string): ApiData {
  const filtered = state.defects.filter(d => !d.deletedAt && d.firstOccurredAt && d.firstOccurredAt >= from && d.firstOccurredAt <= to)
  const total = filtered.length
  const open = filtered.filter(d => toLegacyBucket(d.status) === 'open').length
  const inProgress = filtered.filter(d => toLegacyBucket(d.status) === 'in_progress').length
  const hold = filtered.filter(d => toLegacyBucket(d.status) === 'hold').length
  const completed = filtered.filter(d => toLegacyBucket(d.status) === 'completed').length
  const totalCost = filtered.reduce((s, d) => s + (d.totalCost || 0), 0)

  const byCategory = state.categories.map(c => ({
    name: c.name,
    color: c.color,
    count: filtered.filter(d => d.categoryId === c.id).length,
    cost: filtered.filter(d => d.categoryId === c.id).reduce((s, d) => s + (d.totalCost || 0), 0),
  }))

  const sevKeys = ['critical', 'high', 'medium', 'low']
  const bySeverity = sevKeys.map(k => ({ severity: k, count: filtered.filter(d => d.severity === k).length }))

  // Build monthly
  const monthMap = new Map<string, { count: number; cost: number }>()
  filtered.forEach(d => {
    if (!d.firstOccurredAt) return
    const m = d.firstOccurredAt.slice(0, 7)
    const prev = monthMap.get(m) || { count: 0, cost: 0 }
    monthMap.set(m, { count: prev.count + 1, cost: prev.cost + (d.totalCost || 0) })
  })
  const monthly = Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v }))

  const defects: DefectRow[] = filtered.map(d => {
    const cat = state.categories.find(c => c.id === d.categoryId)
    const v = state.vendors.find(v => v.id === d.assignedVendorId)
    return {
      id: d.id,
      caseNumber: d.caseNumber,
      title: d.title,
      locationText: d.locationText,
      severity: d.severity,
      status: d.status,
      costType: d.costType,
      reporterName: d.reporterName,
      managerName: d.managerName,
      recurrenceCount: d.recurrenceCount,
      firstOccurredAt: d.firstOccurredAt,
      totalCost: d.totalCost,
      categoryName: cat?.name || null,
      categoryColor: cat?.color || null,
      vendorName: v?.name || null,
    }
  })

  return { summary: { total, open, inProgress, hold, completed, totalCost }, byCategory, bySeverity, monthly, defects }
}

// ── Component ──────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { state } = useStore()
  const [period, setPeriod] = useState('3months')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
    document.head.appendChild(script)
    return () => { try { document.head.removeChild(script) } catch (_) {} }
  }, [])

  useEffect(() => {
    const dates = getPeriodDates('3months')
    setFromDate(dates.from)
    setToDate(dates.to)
  }, [])

  // Derive apiData from store directly (no async fetch needed)
  const apiData: ApiData | null = (fromDate && toDate) ? buildApiData(state, fromDate, toDate) : null
  const loading = false

  function selectPeriod(p: string) {
    setPeriod(p)
    if (p === 'custom') return
    const dates = getPeriodDates(p)
    setFromDate(dates.from)
    setToDate(dates.to)
  }

  const rp = apiData ? computeReportParams(apiData, fromDate, toDate) : null

  async function handleDownloadPDF() {
    if (!rp) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lib = (window as any).html2pdf
    if (!lib) { alert('PDF 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.'); return }
    setPdfLoading(true)
    const wrap = document.createElement('div')
    wrap.innerHTML = buildA4HTML(rp)
    Object.assign(wrap.style, { position: 'absolute', left: '-9999px', top: '0', zIndex: '-1' })
    document.body.appendChild(wrap)
    try {
      await lib().set({
        margin: 0,
        filename: `하자관리보고서_${fromDate}_${toDate}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(wrap.querySelector('.rpt-a4')).save()
    } catch (err) {
      console.error(err)
      alert('PDF 생성 중 오류가 발생했습니다.')
    } finally {
      document.body.removeChild(wrap)
      setPdfLoading(false)
    }
  }

  function handleDownloadExcel() {
    if (!rp) return
    const wb = XLSX.utils.book_new()
    const today = new Date().toISOString().slice(0, 10)
    const sumRows = [
      ['시설 하자관리 보고서'],
      [`보고 기간: ${rp.from} ~ ${rp.to}`],
      [`생성일: ${today}`],
      [],
      ['구분', '건수'],
      ['전체', rp.summary.total], ['접수', rp.summary.open],
      ['처리중', rp.summary.inProgress], ['보류', rp.summary.hold], ['완료', rp.summary.completed],
      ['총 비용(원)', rp.summary.totalCost],
      [],
      ['카테고리별 현황'],
      ['카테고리', '건수', '비율(%)', '비용(원)'],
      ...rp.byCategory.map(c => [c.name, c.count, rp.summary.total ? Math.round(c.count / rp.summary.total * 100) : 0, c.cost]),
      [],
      ['심각도별 분포'],
      ['심각도', '건수', '비율(%)'],
      ...rp.sevData.map(s => [s.label, s.count, rp.summary.total ? Math.round(s.count / rp.summary.total * 100) : 0]),
      [],
      ['월별 발생 추이'],
      ['월', '건수'],
      ...rp.allMonths.map(m => [m.month, m.count]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), '요약')
    const headers = ['케이스번호', '제목', '카테고리', '위치', '심각도', '상태', '발생일', '비용(원)', '담당업체', '담당자', '신고자', '재발횟수']
    const rows = rp.defects.map(d => [
      d.caseNumber, d.title, d.categoryName ?? '-', d.locationText ?? '-',
      SEV_LABELS[d.severity] ?? d.severity, STAT_LABELS[d.status] ?? d.status,
      d.firstOccurredAt?.slice(0, 10) ?? '-', d.totalCost ?? 0,
      d.vendorName ?? '-', d.managerName ?? '-', d.reporterName ?? '-', d.recurrenceCount ?? 0,
    ])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), '하자 목록')
    XLSX.writeFile(wb, `하자관리보고서_${fromDate}_${toDate}.xlsx`)
  }

  function handleDownloadWord() {
    if (!rp) return
    const today = new Date().toISOString().slice(0, 10)
    const wordCSS = `body{font-family:'맑은 고딕',sans-serif;font-size:11pt;color:#0a2540;margin:20mm}h1{font-size:16pt;font-weight:800;margin:0 0 4pt}h2{font-size:10pt;font-weight:700;color:#635bff;border-left:3pt solid #635bff;padding-left:8pt;margin:14pt 0 8pt}hr{border:none;border-top:2pt solid #0a2540;margin:8pt 0 14pt}.thin{border-top:1pt solid #e3e8ef!important;margin:12pt 0!important}table{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:12pt}th{background:#f5f7fa;padding:6pt 8pt;font-size:8pt;font-weight:700;text-transform:uppercase;border-bottom:1.5pt solid #e3e8ef;text-align:left}td{padding:6pt 8pt;border-bottom:1pt solid #f0f4f8;vertical-align:middle}.krow{display:flex;gap:10pt;margin-bottom:14pt}.kbox{flex:1;border:1pt solid #e3e8ef;border-radius:5pt;padding:10pt;text-align:center}.klbl{font-size:8pt;font-weight:700;text-transform:uppercase;color:#697386;margin-bottom:5pt}.kv{font-size:18pt;font-weight:800}.footer{font-size:8pt;color:#b0bac6;text-align:center;border-top:1pt solid #e3e8ef;padding-top:8pt;margin-top:20pt}`
    const body = `<h1>시설 하자관리 보고서</h1>
<p style="color:#635bff;font-weight:600;font-size:9.5pt;margin:0 0 3pt">대전충청검사센터 시설관리팀</p>
<p style="font-size:9pt;color:#425466;margin:0 0 8pt">보고 기간: <strong>${rp.from} ~ ${rp.to}</strong> &nbsp;|&nbsp; 생성일: ${today}</p>
<hr>
<h2>요약</h2>
<div class="krow">
  <div class="kbox"><div class="klbl">전체</div><div class="kv">${rp.summary.total}</div></div>
  <div class="kbox"><div class="klbl">접수</div><div class="kv" style="color:#1d6dc2">${rp.summary.open}</div></div>
  <div class="kbox"><div class="klbl">처리중</div><div class="kv" style="color:#b06b1a">${rp.summary.inProgress}</div></div>
  <div class="kbox"><div class="klbl">보류</div><div class="kv" style="color:#a16207">${rp.summary.hold}</div></div>
  <div class="kbox"><div class="klbl">완료</div><div class="kv" style="color:#0f7850">${rp.summary.completed}</div></div>
  <div class="kbox"><div class="klbl">총 비용</div><div class="kv" style="font-size:11pt;color:#be1044">${fmtKRW(rp.summary.totalCost)}</div></div>
</div>
<hr class="thin">
<h2>카테고리별 현황</h2>
<table><thead><tr><th>카테고리</th><th style="text-align:center">건수</th><th style="text-align:center">비율(%)</th><th style="text-align:right">비용</th></tr></thead>
<tbody>${rp.byCategory.map(c => `<tr><td>${c.name}</td><td style="text-align:center;font-weight:700">${c.count}</td><td style="text-align:center">${rp.summary.total ? Math.round(c.count / rp.summary.total * 100) : 0}%</td><td style="text-align:right">${fmtKRW(c.cost)}</td></tr>`).join('')}</tbody></table>
<h2>심각도별 분포</h2>
<table><thead><tr><th>심각도</th><th style="text-align:center">건수</th><th style="text-align:center">비율(%)</th></tr></thead>
<tbody>${rp.sevData.map(s => `<tr><td>${s.label}</td><td style="text-align:center;font-weight:700">${s.count}</td><td style="text-align:center">${rp.summary.total ? Math.round(s.count / rp.summary.total * 100) : 0}%</td></tr>`).join('')}</tbody></table>
<h2>월별 발생 추이</h2>
<table><thead><tr>${rp.allMonths.map(m => `<th style="text-align:center">${m.label}</th>`).join('')}</tr></thead>
<tbody><tr>${rp.allMonths.map(m => `<td style="text-align:center;font-weight:700">${m.count}</td>`).join('')}</tr></tbody></table>
<h2>주요 인사이트</h2>
<ul>${rp.insights.map(i => `<li style="font-size:9.5pt;color:#425466;margin-bottom:5pt">${i}</li>`).join('')}</ul>
${rp.actionItems.length > 0 ? `<h2>조치 필요 사항</h2><table><thead><tr><th>케이스번호</th><th>제목</th><th>심각도</th><th>상태</th><th>담당업체</th></tr></thead><tbody>${rp.actionItems.map(d => `<tr><td style="font-family:monospace;font-size:8pt">${d.caseNumber}</td><td>${d.title}</td><td>${SEV_LABELS[d.severity] ?? d.severity}</td><td>${STAT_LABELS[d.status] ?? d.status}</td><td>${d.vendorName ?? '-'}</td></tr>`).join('')}</tbody></table>` : ''}
<h2>하자 목록 상세</h2>
<table><thead><tr><th>번호</th><th>제목</th><th>카테고리</th><th>심각도</th><th>상태</th><th>발생일</th><th style="text-align:right">비용</th></tr></thead>
<tbody>${rp.defects.map(d => `<tr><td style="font-family:monospace;font-size:8pt">${d.caseNumber}</td><td>${d.title}</td><td>${d.categoryName ?? '-'}</td><td>${SEV_LABELS[d.severity] ?? d.severity}</td><td>${STAT_LABELS[d.status] ?? d.status}</td><td>${d.firstOccurredAt?.slice(0, 10) ?? '-'}</td><td style="text-align:right">${d.totalCost ? fmtKRW(d.totalCost) : '-'}</td></tr>`).join('')}</tbody></table>
<div class="footer">대전충청검사센터 시설관리팀 | 하자관리시스템 | 출력일: ${today}</div>`
    const html = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset="UTF-8"><title>시설 하자관리 보고서</title><style>${wordCSS}</style></head><body>${body}</body></html>`
    const blob = new Blob(['﻿' + html], { type: 'application/msword;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `하자관리보고서_${fromDate}_${toDate}.doc`; a.click()
    URL.revokeObjectURL(url)
  }

  function handlePrint() {
    if (!rp) return
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.'); return }
    win.document.write(buildStandaloneHTML(rp))
    win.document.close()
    win.addEventListener('load', () => { win.focus(); win.print() })
  }

  // Chart data
  const statusChart = rp ? {
    labels: ['접수', '처리중', '보류', '완료'],
    datasets: [{ data: [rp.summary.open, rp.summary.inProgress, rp.summary.hold, rp.summary.completed], backgroundColor: ['#635bff', '#d97706', '#EAB308', '#0f7850'], borderWidth: 0, hoverOffset: 4 }],
  } : null

  const catCountChart = rp ? {
    labels: rp.byCategory.map(c => c.name),
    datasets: [{ data: rp.byCategory.map(c => c.count), backgroundColor: rp.byCategory.map(c => c.color + 'bb'), borderRadius: 4, borderSkipped: false as const }],
  } : null

  const monthlyChart = rp ? {
    labels: rp.allMonths.map(m => m.label),
    datasets: [{ label: '발생 건수', data: rp.allMonths.map(m => m.count), borderColor: '#635bff', backgroundColor: 'rgba(99,91,255,0.12)', fill: true, tension: 0.4, pointRadius: 2, borderWidth: 2 }],
  } : null

  const catCostChart = rp ? {
    labels: rp.byCategory.map(c => c.name),
    datasets: [{ data: rp.byCategory.map(c => c.cost), backgroundColor: rp.byCategory.map(c => c.color + 'bb'), borderRadius: 4, borderSkipped: false as const }],
  } : null

  const chartBase = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }

  return (
    <div className="flex flex-col" style={{ minHeight: '100vh' }}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 flex items-center justify-between flex-wrap gap-3 bg-white"
        style={{ padding: '16px 32px', borderBottom: '1px solid #e3e8ef' }}>
        <div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>보고서</h1>
          <p style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>기간별 하자 현황 분석 · 경영진 보고서 자동 생성</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 border rounded-lg font-medium transition-colors hover:bg-gray-50"
            style={{ padding: '6px 12px', borderColor: '#e3e8ef', color: '#425466', fontSize: '0.78rem' }}>
            <i className="fa-solid fa-eye" /> 미리보기
          </button>
          <button onClick={handleDownloadExcel} className="flex items-center gap-1.5 rounded-lg font-medium text-white"
            style={{ padding: '6px 12px', background: '#1d6840', fontSize: '0.78rem' }}>
            <i className="fa-solid fa-file-excel" /> Excel
          </button>
          <button onClick={handleDownloadPDF} disabled={pdfLoading} className="flex items-center gap-1.5 rounded-lg font-medium text-white disabled:opacity-50"
            style={{ padding: '6px 12px', background: '#c0392b', fontSize: '0.78rem' }}>
            <i className={pdfLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-pdf'} />
            {pdfLoading ? ' 생성 중...' : ' PDF'}
          </button>
          <button onClick={handleDownloadWord} className="flex items-center gap-1.5 rounded-lg font-medium text-white"
            style={{ padding: '6px 12px', background: '#2b5797', fontSize: '0.78rem' }}>
            <i className="fa-solid fa-file-word" /> Word
          </button>
          <button onClick={handlePrint} className="flex items-center gap-1.5 rounded-lg font-medium text-white"
            style={{ padding: '6px 12px', background: '#0d1f35', fontSize: '0.78rem' }}>
            <i className="fa-solid fa-print" /> 인쇄
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '24px 32px' }}>

        {/* Period Selector */}
        <div className="rounded-xl mb-4" style={{ background: '#fff', border: '1px solid #e3e8ef', padding: '14px 18px', boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }}>
          <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#697386', marginBottom: 9 }}>
            <i className="fa-regular fa-calendar" />&nbsp; 보고 기간
          </p>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => selectPeriod(p.key)}
                style={{
                  padding: '5px 13px', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer',
                  borderRadius: 999,
                  border: period === p.key ? '1.5px solid #635bff' : '1.5px solid #e3e8ef',
                  background: period === p.key ? '#635bff' : '#fff',
                  color: period === p.key ? '#fff' : '#425466',
                  transition: 'all 0.12s',
                  fontFamily: 'inherit',
                }}>
                {p.label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2 mt-3">
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #e3e8ef', outline: 'none', width: 145, fontSize: '0.8rem', fontFamily: 'inherit' }} />
              <span style={{ color: '#b0bac6' }}>—</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #e3e8ef', outline: 'none', width: 145, fontSize: '0.8rem', fontFamily: 'inherit' }} />
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20" style={{ color: '#b0bac6', fontSize: '0.85rem' }}>
            <i className="fa-solid fa-spinner fa-spin mr-2" /> 데이터 로딩 중...
          </div>
        )}

        {rp && !loading && (
          <>
            {/* 6-column KPI */}
            <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
              {[
                { label: '전체',   value: String(rp.summary.total),         color: '#635bff' },
                { label: '접수',   value: String(rp.summary.open),          color: '#1d6dc2' },
                { label: '처리중', value: String(rp.summary.inProgress),    color: '#b06b1a' },
                { label: '보류',   value: String(rp.summary.hold),          color: '#a16207' },
                { label: '완료',   value: String(rp.summary.completed),     color: '#0f7850' },
                { label: '총 비용', value: fmtKRW(rp.summary.totalCost),   color: '#be1044', small: true },
              ].map(k => (
                <div key={k.label} className="rounded-xl text-center" style={{ background: '#fff', border: '1px solid #e3e8ef', padding: '15px', boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#697386', marginBottom: 7 }}>{k.label}</p>
                  <p style={{ fontSize: k.small ? '1.05rem' : '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: k.color }}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Charts row 1 */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-xl bg-white" style={{ border: '1px solid #e3e8ef', padding: '16px 18px', boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540', marginBottom: 12 }}>상태별 분포</p>
                <div style={{ height: 180 }}>
                  {statusChart && <Doughnut data={statusChart} options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { font: { size: 11 }, padding: 12 } } } }} />}
                </div>
              </div>
              <div className="rounded-xl bg-white" style={{ border: '1px solid #e3e8ef', padding: '16px 18px', boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540', marginBottom: 12 }}>카테고리별 건수</p>
                <div style={{ height: 180 }}>
                  {catCountChart && <Bar data={catCountChart} options={{ ...chartBase, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#b0bac6' } }, y: { beginAtZero: true, grid: { color: '#f0f4f8' }, ticks: { stepSize: 1, font: { size: 10 }, color: '#b0bac6' } } } }} />}
                </div>
              </div>
            </div>

            {/* Charts row 2 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl bg-white" style={{ border: '1px solid #e3e8ef', padding: '16px 18px', boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540', marginBottom: 12 }}>월별 발생 추이</p>
                <div style={{ height: 180 }}>
                  {monthlyChart && <Line data={monthlyChart} options={{ ...chartBase, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#b0bac6', maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: { color: '#f0f4f8' }, ticks: { stepSize: 1, font: { size: 10 }, color: '#b0bac6' } } } }} />}
                </div>
              </div>
              <div className="rounded-xl bg-white" style={{ border: '1px solid #e3e8ef', padding: '16px 18px', boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540', marginBottom: 12 }}>카테고리별 비용</p>
                <div style={{ height: 180 }}>
                  {catCostChart && <Bar data={catCostChart} options={{ ...chartBase, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#b0bac6' } }, y: { beginAtZero: true, grid: { color: '#f0f4f8' }, ticks: { font: { size: 10 }, color: '#b0bac6', callback: (v: number | string) => v ? `${(Number(v) / 10000).toFixed(0)}만` : 0 } } } }} />}
                </div>
              </div>
            </div>

            {/* Severity Table */}
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e3e8ef', boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
                    {['심각도', '건수', '비율'].map((h, i) => (
                      <th key={h} style={{ padding: '9px 16px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#697386', textAlign: i > 0 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rp.sevData.map((s, i) => {
                    const pct = rp.summary.total ? Math.round(s.count / rp.summary.total * 100) : 0
                    return (
                      <tr key={s.key} style={{ borderBottom: i < rp.sevData.length - 1 ? '1px solid #f0f4f8' : 'none' }}>
                        <td style={{ padding: '11px 16px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{s.label}</span>
                          </span>
                        </td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', fontSize: '0.82rem', fontWeight: 700 }}>{s.count}건</td>
                        <td style={{ padding: '11px 16px', textAlign: 'right', fontSize: '0.78rem', color: '#697386' }}>{pct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Full-screen Preview Modal */}
      {showPreview && rp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.72)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPreview(false) }}>
          {/* Toolbar */}
          <div style={{ background: '#111827', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, flexWrap: 'wrap', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
            <span style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 700, marginRight: 'auto' }}>
              <i className="fa-solid fa-file-lines" />&nbsp; 보고서 미리보기 — A4 출력 기준
            </span>
            {[
              { label: 'Excel', icon: 'fa-file-excel', bg: '#1d6840', fn: handleDownloadExcel },
              { label: 'PDF',   icon: 'fa-file-pdf',   bg: '#c0392b', fn: handleDownloadPDF },
              { label: 'Word',  icon: 'fa-file-word',  bg: '#2b5797', fn: handleDownloadWord },
              { label: '인쇄',  icon: 'fa-print',      bg: '#0d1f35', fn: handlePrint },
            ].map(b => (
              <button key={b.label} onClick={b.fn}
                style={{ padding: '5px 11px', background: b.bg, color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
                <i className={`fa-solid ${b.icon}`} /> {b.label}
              </button>
            ))}
            <button onClick={() => setShowPreview(false)}
              style={{ padding: '5px 11px', background: '#374151', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', marginLeft: 8 }}>
              <i className="fa-solid fa-xmark" /> 닫기
            </button>
          </div>
          {/* Page */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px 50px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#374151' }}>
            <div style={{ background: '#fff', boxShadow: '0 6px 28px rgba(0,0,0,0.35)', borderRadius: 1, overflow: 'hidden' }}>
              <div dangerouslySetInnerHTML={{ __html: buildA4HTML(rp) }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
