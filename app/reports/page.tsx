'use client'

import { useMemo, useState } from 'react'
import { useStore, type Defect } from '@/lib/store'
import {
  toLegacyBucket, STATUS_META, STATUS_FLOW, getDisplayCost, getCostBearerStatus,
  COST_ESTIMATED_COLOR, COST_CONFIRMED_COLOR, COST_BEARER_CATEGORIES,
  isOverdue, filterByOccurredPeriod, type StatusKey,
} from '@/lib/designTokens'
import { generateActionPlanOpinion, type GeneratedReport, type ReportSection, type ActionPlanOpinion } from '@/lib/aiReportService'
import { buildReportPrintHTML } from '@/lib/reportExportHtml'
import { downloadReportPDF } from '@/lib/reportExportPdf'
import { downloadReportExcel } from '@/lib/reportExportExcel'
import { downloadReportWord } from '@/lib/reportExportWord'
import { ReportToast, type ToastMessage } from '@/components/common/ReportToast'

// 이 화면(보고서)은 예방접종관리시스템 보고서 화면의 UX 패턴(좌측 설정 패널 + 우측 실시간 A4 미리보기,
// 설정 변경 시 즉시 갱신, 화면·PDF·Excel·Word가 동일한 reportData 하나만 사용)을 그대로 따르되,
// 실제 A4 렌더링/인쇄/내보내기 엔진은 이 하자관리시스템에 이미 구축되어 있던 AI 보고서 인프라
// (lib/aiReportService.ts의 GeneratedReport/ReportSection 모델, lib/reportExportHtml.ts의
// buildReportPrintHTML, lib/reportExportPdf·Word·Excel.ts, app/globals.css의 .rpt-a4 인쇄 CSS)를
// 그대로 재사용한다 — 새 렌더러를 만들지 않는다.

const DEFECT_TYPE_OPTIONS = ['하자사항', '일반사항', '확인 필요'] as const

type SectionKey = 'kpi' | 'processing' | 'statusBreakdown' | 'category' | 'trend' | 'cost' | 'recurring' | 'overdue' | 'vendor' | 'ai'

const SECTION_LABELS: { key: SectionKey; label: string }[] = [
  { key: 'kpi', label: 'KPI 요약' },
  { key: 'processing', label: '하자 처리현황' },
  { key: 'statusBreakdown', label: '상태별 현황' },
  { key: 'category', label: '카테고리별 현황' },
  { key: 'trend', label: '월별 발생추이' },
  { key: 'cost', label: '예상비용/확정비용' },
  { key: 'recurring', label: '반복하자' },
  { key: 'overdue', label: '지연하자' },
  { key: 'vendor', label: '외주업체 현황' },
  { key: 'ai', label: 'AI Insight / Action Plan' },
]

type ReportTypeKey = 'comprehensive' | 'category' | 'overdue' | 'vendor'

const REPORT_TYPE_OPTIONS: { key: ReportTypeKey; label: string }[] = [
  { key: 'comprehensive', label: '종합 현황 보고서' },
  { key: 'category', label: '카테고리별 보고서' },
  { key: 'overdue', label: '지연하자 현황 보고서' },
  { key: 'vendor', label: '외주업체 현황 보고서' },
]

const REPORT_TYPE_PRESETS: Record<ReportTypeKey, Record<SectionKey, boolean>> = {
  comprehensive: { kpi: true, processing: true, statusBreakdown: true, category: true, trend: true, cost: true, recurring: true, overdue: true, vendor: true, ai: true },
  category:      { kpi: true, processing: false, statusBreakdown: false, category: true, trend: false, cost: true, recurring: false, overdue: false, vendor: false, ai: true },
  overdue:       { kpi: true, processing: false, statusBreakdown: false, category: false, trend: false, cost: false, recurring: false, overdue: true, vendor: false, ai: true },
  vendor:        { kpi: true, processing: false, statusBreakdown: false, category: false, trend: false, cost: true, recurring: false, overdue: false, vendor: true, ai: true },
}

type QuickPresetKey = 'today' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'thisYear'
const QUICK_PRESETS: { key: QuickPresetKey; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: '7d', label: '최근 7일' },
  { key: '30d', label: '최근 30일' },
  { key: 'thisMonth', label: '이번달' },
  { key: 'lastMonth', label: '지난달' },
  { key: 'thisYear', label: '올해' },
]

function pad2(n: number) { return String(n).padStart(2, '0') }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

function computeQuickRange(preset: QuickPresetKey): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  switch (preset) {
    case 'today': return { from: toDateStr(now), to: toDateStr(now) }
    case '7d': return { from: toDateStr(new Date(now.getTime() - 6 * 86400000)), to: toDateStr(now) }
    case '30d': return { from: toDateStr(new Date(now.getTime() - 29 * 86400000)), to: toDateStr(now) }
    case 'thisMonth': return { from: toDateStr(new Date(y, m, 1)), to: toDateStr(now) }
    case 'lastMonth': return { from: toDateStr(new Date(y, m - 1, 1)), to: toDateStr(new Date(y, m, 0)) }
    case 'thisYear': return { from: toDateStr(new Date(y, 0, 1)), to: toDateStr(now) }
  }
}

function fmtKRW(v: number): string { return v > 0 ? `${v.toLocaleString()}원` : '-' }

function emptyActionPlan(): ActionPlanOpinion {
  return { headline: [], immediateActions: [], costRisk: [], recurringWarning: [], approvalNeeded: [] }
}

// 표 섹션에 넣을 행이 하나도 없을 때 표 골격(헤더 개수)은 유지한 채 안내 문구 한 줄만 보여준다.
function tableRowsOrEmpty(headerCount: number, rows: string[][], emptyMsg: string) {
  if (rows.length > 0) return rows.map(cells => ({ cells }))
  return [{ cells: [emptyMsg, ...Array(headerCount - 1).fill('')] }]
}

export default function ReportsPage() {
  const { state } = useStore()

  const [reportType, setReportType] = useState<ReportTypeKey>('comprehensive')
  const [activePreset, setActivePreset] = useState<QuickPresetKey | null>('thisMonth')
  const initialRange = computeQuickRange('thisMonth')
  const [dateFrom, setDateFrom] = useState(initialRange.from)
  const [dateTo, setDateTo] = useState(initialRange.to)
  const [categoryId, setCategoryId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [defectTypeFilter, setDefectTypeFilter] = useState('')
  const [costBearerFilter, setCostBearerFilter] = useState('')
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(REPORT_TYPE_PRESETS.comprehensive)

  const [pdfLoading, setPdfLoading] = useState(false)
  const [excelLoading, setExcelLoading] = useState(false)
  const [wordLoading, setWordLoading] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)

  function applyQuickPreset(key: QuickPresetKey) {
    const r = computeQuickRange(key)
    setDateFrom(r.from); setDateTo(r.to); setActivePreset(key)
  }
  function onReportTypeChange(key: ReportTypeKey) {
    setReportType(key)
    setSections(REPORT_TYPE_PRESETS[key])
  }
  function toggleSection(key: SectionKey) {
    setSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const periodValid = !!dateFrom && !!dateTo && dateFrom <= dateTo
  const periodLabel = periodValid ? `${dateFrom} ~ ${dateTo}` : '조회기간을 확인해주세요'

  // ── 화면·Excel·PDF·Word가 전부 이 report 하나만 참조한다(단일 reportData 원칙) ──
  const report: GeneratedReport | null = useMemo(() => {
    if (!periodValid) return null

    const nonDeleted = state.defects.filter(d => !d.deletedAt)
    const periodDefects = filterByOccurredPeriod(nonDeleted, dateFrom, dateTo)
    const filtered = periodDefects.filter(d =>
      (!categoryId || d.categoryId === Number(categoryId)) &&
      (!statusFilter || d.status === statusFilter) &&
      (!defectTypeFilter || (d.defectType ?? '확인 필요') === defectTypeFilter) &&
      (!costBearerFilter || getCostBearerStatus(d) === costBearerFilter)
    )

    const total = filtered.length
    const open = filtered.filter(d => toLegacyBucket(d.status) === 'open').length
    const inProgress = filtered.filter(d => toLegacyBucket(d.status) === 'in_progress').length
    const hold = filtered.filter(d => toLegacyBucket(d.status) === 'hold').length
    const completed = filtered.filter(d => toLegacyBucket(d.status) === 'completed').length
    // 처리비용 기준 — 확정비용(finalCost/totalCost)이 있으면 그 값을 우선 사용하고, 없을 때만 예상비용으로 대체한다.
    const effCost = (d: Defect) => getDisplayCost(d).amount ?? 0
    const isConfirmed = (d: Defect) => getDisplayCost(d).confirmed
    const totalCost = filtered.reduce((s, d) => s + effCost(d), 0)
    const confirmedCost = filtered.reduce((s, d) => s + (isConfirmed(d) ? effCost(d) : 0), 0)
    const pendingCost = totalCost - confirmedCost

    const sectionList: ReportSection[] = []

    if (sections.kpi) {
      sectionList.push({
        id: 'kpi', title: 'KPI 요약', type: 'kpi-grid',
        kpiItems: [
          { label: '전체', value: `${total}건`, color: '#635bff' },
          { label: '접수', value: `${open}건`, color: '#1d6dc2' },
          { label: '처리중', value: `${inProgress}건`, color: '#b06b1a' },
          { label: '보류', value: `${hold}건`, color: '#a16207' },
          { label: '완료', value: `${completed}건`, color: '#0f7850' },
          { label: '총 비용', value: fmtKRW(totalCost), color: '#be1044' },
        ],
      })
    }

    if (sections.processing) {
      sectionList.push({
        id: 'processing', title: '하자 처리현황', type: 'bar-list',
        barItems: [
          { label: '접수', value: open, pct: total ? Math.round(open / total * 100) : 0, color: '#1d6dc2' },
          { label: '처리중', value: inProgress, pct: total ? Math.round(inProgress / total * 100) : 0, color: '#b06b1a' },
          { label: '보류', value: hold, pct: total ? Math.round(hold / total * 100) : 0, color: '#a16207' },
          { label: '완료', value: completed, pct: total ? Math.round(completed / total * 100) : 0, color: '#0f7850' },
        ],
      })
    }

    if (sections.statusBreakdown) {
      const rows = STATUS_FLOW.map(s => {
        const count = filtered.filter(d => d.status === s).length
        return [STATUS_META[s].label, `${count}건`, `${total ? Math.round(count / total * 100) : 0}%`]
      })
      sectionList.push({
        id: 'status', title: '상태별 현황', type: 'table',
        tableHeaders: ['상태', '건수', '비율'],
        tableRows: tableRowsOrEmpty(3, rows, '해당 조건의 하자가 없습니다.'),
      })
    }

    if (sections.category) {
      const byCategory = state.categories.map(c => {
        const count = filtered.filter(d => d.categoryId === c.id).length
        return { name: c.name, color: c.color, count }
      })
      sectionList.push({
        id: 'category', title: '카테고리별 현황', type: 'bar-list',
        barItems: byCategory.map(c => ({ label: c.name, value: c.count, pct: total ? Math.round(c.count / total * 100) : 0, color: c.color })),
      })
    }

    if (sections.trend) {
      const monthMap = new Map<string, number>()
      filtered.forEach(d => {
        if (!d.firstOccurredAt) return
        const m = d.firstOccurredAt.slice(0, 7)
        monthMap.set(m, (monthMap.get(m) ?? 0) + 1)
      })
      // 조회기간(dateFrom~dateTo)에 걸친 달을 실제 데이터 유무와 무관하게 순서대로 나열한다(0건도 표시).
      const months: { key: string; label: string; count: number }[] = []
      let cur = new Date(Number(dateFrom.slice(0, 4)), Number(dateFrom.slice(5, 7)) - 1, 1)
      const end = new Date(Number(dateTo.slice(0, 4)), Number(dateTo.slice(5, 7)) - 1, 1)
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`
        months.push({ key, label: key.slice(5) + '월', count: monthMap.get(key) ?? 0 })
        cur.setMonth(cur.getMonth() + 1)
      }
      const maxCount = Math.max(...months.map(m => m.count), 1)
      sectionList.push({
        id: 'trend', title: '월별 발생추이', type: 'bar-list',
        barItems: months.map(m => ({ label: m.label, value: m.count, pct: Math.round(m.count / maxCount * 100) })),
      })
    }

    if (sections.cost) {
      sectionList.push({
        id: 'cost', title: '예상비용/확정비용', type: 'kpi-grid',
        kpiItems: [
          { label: '총 비용', value: fmtKRW(totalCost), color: '#be1044' },
          { label: '확정비용', value: fmtKRW(confirmedCost), color: COST_CONFIRMED_COLOR.text, sub: '실제 비용(확정 우선 반영)' },
          { label: '예상비용(미확정)', value: fmtKRW(pendingCost), color: COST_ESTIMATED_COLOR.text, sub: '견적·추정 단계' },
        ],
      })
    }

    if (sections.recurring) {
      const recurringList = filtered
        .filter(d => (d.recurrenceCount ?? 0) > 0)
        .sort((a, b) => (b.recurrenceCount ?? 0) - (a.recurrenceCount ?? 0))
        .slice(0, 10)
      const rows = recurringList.map(d => {
        const cat = state.categories.find(c => c.id === d.categoryId)
        return [d.caseNumber, d.title, cat?.name ?? '-', `${d.recurrenceCount}회`, STATUS_META[d.status as StatusKey]?.label ?? d.status]
      })
      sectionList.push({
        id: 'recurring', title: '반복하자', type: 'table',
        tableHeaders: ['케이스번호', '제목', '카테고리', '반복횟수', '상태'],
        tableRows: tableRowsOrEmpty(5, rows, '조회기간 내 반복하자가 없습니다.'),
      })
    }

    if (sections.overdue) {
      const overdueList = filtered.filter(isOverdue).slice(0, 10)
      const rows = overdueList.map(d => {
        const vendor = state.vendors.find(v => v.id === d.assignedVendorId)
        const base = d.expectedCompletionDate ?? d.firstOccurredAt
        const days = base ? Math.max(0, Math.floor((Date.now() - new Date(base).getTime()) / 86400000)) : 0
        const sevLabel = ({ critical: '긴급', high: '높음', medium: '보통', low: '낮음' } as Record<string, string>)[d.severity] ?? d.severity
        return [d.caseNumber, d.title, sevLabel, `${days}일`, vendor?.name ?? '자체처리']
      })
      sectionList.push({
        id: 'overdue', title: '지연하자', type: 'table',
        tableHeaders: ['케이스번호', '제목', '심각도', '지연일수', '담당업체'],
        tableRows: tableRowsOrEmpty(5, rows, '조회기간 내 지연하자가 없습니다.'),
      })
    }

    if (sections.vendor) {
      const vendorStats = state.vendors.map(v => {
        const assigned = filtered.filter(d => d.assignedVendorId === v.id)
        const completedV = assigned.filter(d => d.status === 'completed')
        const cost = assigned.reduce((s, d) => s + effCost(d), 0)
        return { name: v.name, assignedCount: assigned.length, completedCount: completedV.length, rate: assigned.length ? Math.round(completedV.length / assigned.length * 100) : 0, cost }
      }).filter(v => v.assignedCount > 0).sort((a, b) => b.assignedCount - a.assignedCount)
      const rows = vendorStats.map(v => [v.name, `${v.assignedCount}건`, `${v.completedCount}건`, `${v.rate}%`, fmtKRW(v.cost)])
      sectionList.push({
        id: 'vendor', title: '외주업체 현황', type: 'table',
        tableHeaders: ['업체명', '배정건수', '완료건수', '완료율', '누적비용'],
        tableRows: tableRowsOrEmpty(5, rows, '조회기간 내 외주업체 배정 건이 없습니다.'),
      })
    }

    const actionPlan = sections.ai
      ? generateActionPlanOpinion(filtered, state.files, state.floorPlans, periodLabel)
      : emptyActionPlan()

    return {
      reportType: 'comprehensive-status',
      title: '시설 하자관리 종합 현황 보고서',
      subtitle: '대전충청검사센터 시설관리팀',
      period: periodLabel,
      periodType: 'custom',
      aggBasis: '하자 발생일(firstOccurredAt) 기준',
      periodFilenameSuffix: `${dateFrom}_${dateTo}`,
      generatedAt: new Date().toLocaleString('ko-KR'),
      sections: sectionList,
      actionPlan,
      basedOn: 'rule-based',
      preparedBy: '시설관리팀',
      metadata: {
        totalDefects: total,
        completionRate: total > 0 ? Math.round(completed / total * 100) : 0,
        totalCost,
      },
    }
  }, [state.defects, state.categories, state.vendors, state.files, state.floorPlans, dateFrom, dateTo, categoryId, statusFilter, defectTypeFilter, costBearerFilter, sections, periodValid, periodLabel])

  const previewHtml = report ? buildReportPrintHTML(report) : ''
  const noSectionsSelected = !Object.values(sections).some(Boolean)

  async function handleDownloadPDF() {
    if (!report) return
    setPdfLoading(true)
    try {
      await downloadReportPDF(report)
      setToast({ type: 'success', text: 'PDF 다운로드가 완료되었습니다.' })
    } catch (err) {
      console.error(err)
      setToast({ type: 'error', text: 'PDF 생성 중 오류가 발생했습니다.' })
    } finally {
      setPdfLoading(false)
    }
  }
  async function handleDownloadExcel() {
    if (!report) return
    setExcelLoading(true)
    try {
      await downloadReportExcel(report)
      setToast({ type: 'success', text: 'Excel 다운로드가 완료되었습니다.' })
    } catch (err) {
      console.error(err)
      setToast({ type: 'error', text: 'Excel 생성 중 오류가 발생했습니다.' })
    } finally {
      setExcelLoading(false)
    }
  }
  async function handleDownloadWord() {
    if (!report) return
    setWordLoading(true)
    try {
      await downloadReportWord(report)
      setToast({ type: 'success', text: 'Word 다운로드가 완료되었습니다.' })
    } catch (err) {
      console.error(err)
      setToast({ type: 'error', text: 'Word 생성 중 오류가 발생했습니다.' })
    } finally {
      setWordLoading(false)
    }
  }
  function handlePrint() { window.print() }

  const selectStyle: React.CSSProperties = {
    width: '100%', border: '1px solid #e3e8ef', borderRadius: 7, padding: '7px 8px',
    fontSize: '0.78rem', fontFamily: 'inherit', color: '#0a2540', background: '#fff', outline: 'none',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#697386', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }
  const groupStyle: React.CSSProperties = { marginBottom: 16 }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <style>{`
        @media print {
          .app-sidenav, .app-rolebanner, .no-print { display: none !important; }
          body { background: #fff !important; }
          .rpt-print-area { padding: 0 !important; background: #fff !important; }
        }
      `}</style>

      {/* Sticky Header */}
      <div className="no-print sticky top-0 z-50 flex items-center justify-between flex-wrap gap-3 bg-white"
        style={{ padding: '14px 32px', borderBottom: '1px solid #e3e8ef' }}>
        <div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>보고서</h1>
          <p style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>기간별 하자 현황 분석 · 경영진 보고서 자동 생성</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setZoomOpen(true)} disabled={!report} className="flex items-center gap-1.5 border rounded-lg font-medium transition-colors hover:bg-gray-50 disabled:opacity-50"
            style={{ padding: '6px 12px', borderColor: '#e3e8ef', color: '#425466', fontSize: '0.78rem' }}>
            <i className="fa-solid fa-eye" /> 미리보기
          </button>
          <button onClick={handleDownloadExcel} disabled={!report || excelLoading} className="flex items-center gap-1.5 rounded-lg font-medium text-white disabled:opacity-50"
            style={{ padding: '6px 12px', background: '#1d6840', fontSize: '0.78rem' }}>
            <i className={excelLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-excel'} /> Excel
          </button>
          <button onClick={handleDownloadPDF} disabled={!report || pdfLoading} className="flex items-center gap-1.5 rounded-lg font-medium text-white disabled:opacity-50"
            style={{ padding: '6px 12px', background: '#c0392b', fontSize: '0.78rem' }}>
            <i className={pdfLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-pdf'} /> PDF
          </button>
          <button onClick={handleDownloadWord} disabled={!report || wordLoading} className="flex items-center gap-1.5 rounded-lg font-medium text-white disabled:opacity-50"
            style={{ padding: '6px 12px', background: '#2b5797', fontSize: '0.78rem' }}>
            <i className={wordLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-word'} /> Word
          </button>
          <button onClick={handlePrint} disabled={!report} className="flex items-center gap-1.5 rounded-lg font-medium text-white disabled:opacity-50"
            style={{ padding: '6px 12px', background: '#0d1f35', fontSize: '0.78rem' }}>
            <i className="fa-solid fa-print" /> 인쇄
          </button>
        </div>
      </div>

      {/* Body — 좌: 설정 패널 / 우: A4 미리보기 (예방접종관리시스템 보고서 화면과 동일한 좌우 레이아웃) */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, padding: '24px 32px', alignItems: 'start' }}>
        <aside style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', position: 'sticky', top: 78 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fa-solid fa-sliders" style={{ color: '#635bff' }} /> 보고서 설정
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>보고서 유형</label>
            <select style={selectStyle} value={reportType} onChange={e => onReportTypeChange(e.target.value as ReportTypeKey)}>
              {REPORT_TYPE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>조회기간</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset(null) }} style={{ ...selectStyle, padding: '6px 6px', fontSize: '0.72rem' }} />
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset(null) }} style={{ ...selectStyle, padding: '6px 6px', fontSize: '0.72rem' }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {QUICK_PRESETS.map(p => (
                <button key={p.key} onClick={() => applyQuickPreset(p.key)}
                  style={{
                    padding: '4px 9px', fontSize: '0.68rem', fontWeight: 600, borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                    border: `1px solid ${activePreset === p.key ? '#635bff' : '#e3e8ef'}`,
                    background: activePreset === p.key ? '#635bff' : '#fff',
                    color: activePreset === p.key ? '#fff' : '#425466',
                  }}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => setActivePreset(null)}
                style={{
                  padding: '4px 9px', fontSize: '0.68rem', fontWeight: 600, borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${activePreset === null ? '#635bff' : '#e3e8ef'}`,
                  background: activePreset === null ? '#635bff' : '#fff',
                  color: activePreset === null ? '#fff' : '#425466',
                }}>
                사용자지정
              </button>
            </div>
            {!periodValid && <div style={{ fontSize: '0.68rem', color: '#be1044', marginTop: 6 }}>조회기간을 올바르게 설정해주세요.</div>}
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>카테고리</label>
            <select style={selectStyle} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">전체 카테고리</option>
              {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>상태</label>
            <select style={selectStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">전체 상태</option>
              {STATUS_FLOW.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>하자구분</label>
            <select style={selectStyle} value={defectTypeFilter} onChange={e => setDefectTypeFilter(e.target.value)}>
              <option value="">전체</option>
              {DEFECT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div style={groupStyle}>
            <label style={labelStyle}>비용부담주체</label>
            <select style={selectStyle} value={costBearerFilter} onChange={e => setCostBearerFilter(e.target.value)}>
              <option value="">전체</option>
              {COST_BEARER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ ...groupStyle, marginBottom: 0 }}>
            <label style={labelStyle}>포함 섹션</label>
            <div style={{ border: '1px solid #e3e8ef', borderRadius: 8, padding: '4px 10px', maxHeight: 260, overflowY: 'auto' }}>
              {SECTION_LABELS.map(s => (
                <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: '0.76rem', color: '#425466', cursor: 'pointer' }}>
                  <input type="checkbox" checked={sections[s.key]} onChange={() => toggleSection(s.key)} style={{ accentColor: '#635bff', cursor: 'pointer' }} />
                  {s.label}
                </label>
              ))}
            </div>
            {noSectionsSelected && <div style={{ fontSize: '0.68rem', color: '#be1044', marginTop: 6 }}>포함할 섹션을 1개 이상 선택해주세요.</div>}
          </div>
        </aside>

        {/* 우측: 실시간 A4 미리보기 — 설정이 바뀌면 report(useMemo)가 즉시 재계산되어 바로 반영된다 */}
        <div style={{ background: '#E7ECEB', borderRadius: 14, padding: '28px 20px', display: 'flex', justifyContent: 'center' }}>
          {!periodValid || noSectionsSelected || !report ? (
            <div style={{ width: '210mm', minHeight: 300, background: '#fff', borderRadius: 4, boxShadow: '0 10px 34px rgba(23,80,82,.20)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#94a3ac', padding: 40 }}>
              <i className="fa-solid fa-circle-info" style={{ fontSize: 26 }} />
              <span style={{ fontSize: '0.85rem' }}>{!periodValid ? '조회기간을 올바르게 설정해주세요.' : '포함할 섹션을 1개 이상 선택해주세요.'}</span>
            </div>
          ) : (
            <div style={{ boxShadow: '0 10px 34px rgba(23,80,82,.20)' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          )}
        </div>
      </div>

      {/* 인쇄 전용 영역 — 화면에서는 숨기고(위 좌우 레이아웃이 no-print) 인쇄 시에는 이 영역만 보인다 */}
      {report && (
        <div className="rpt-print-area" style={{ display: 'none' }}>
          <style>{`@media print { .rpt-print-area { display: block !important; } }`}</style>
          <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}

      {/* 확대 미리보기 모달 — 기존 하자관리 보고서 화면의 모달 미리보기 UX를 재사용 */}
      {zoomOpen && report && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.72)' }}
          onClick={e => { if (e.target === e.currentTarget) setZoomOpen(false) }}>
          <div style={{ background: '#111827', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, flexWrap: 'wrap', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
            <span style={{ color: '#fff', fontSize: '0.82rem', fontWeight: 700, marginRight: 'auto' }}>
              <i className="fa-solid fa-file-lines" />&nbsp; 보고서 미리보기 — A4 출력 기준
            </span>
            {[
              { label: 'Excel', icon: 'fa-file-excel', bg: '#1d6840', fn: handleDownloadExcel },
              { label: 'PDF', icon: 'fa-file-pdf', bg: '#c0392b', fn: handleDownloadPDF },
              { label: 'Word', icon: 'fa-file-word', bg: '#2b5797', fn: handleDownloadWord },
              { label: '인쇄', icon: 'fa-print', bg: '#0d1f35', fn: handlePrint },
            ].map(b => (
              <button key={b.label} onClick={b.fn}
                style={{ padding: '5px 11px', background: b.bg, color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
                <i className={`fa-solid ${b.icon}`} /> {b.label}
              </button>
            ))}
            <button onClick={() => setZoomOpen(false)}
              style={{ padding: '5px 11px', background: '#374151', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', marginLeft: 8 }}>
              <i className="fa-solid fa-xmark" /> 닫기
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px 50px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#374151' }}>
            <div style={{ background: '#fff', boxShadow: '0 6px 28px rgba(0,0,0,0.35)', borderRadius: 1, overflow: 'hidden' }}>
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      )}

      <ReportToast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
