import * as XLSX from 'xlsx'
import type { GeneratedReport, ReportSection } from '@/lib/aiReportService'
import { fmtReportFilename } from '@/lib/reportExportHtml'

function fmtKRW(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`
  if (v >= 10_000) return `${Math.round(v / 10_000)}만원`
  if (v > 0) return `${v.toLocaleString()}원`
  return '-'
}

function sectionToRows(section: ReportSection): (string | number)[][] {
  const rows: (string | number)[][] = [[section.title]]
  if (section.type === 'kpi-grid' && section.kpiItems) {
    rows.push(['항목', '값', '부가설명'])
    section.kpiItems.forEach(k => rows.push([k.label, k.value, k.sub ?? '']))
  } else if (section.type === 'bar-list' && section.barItems) {
    rows.push(['항목', '값', '비율(%)', '부가설명'])
    section.barItems.forEach(b => rows.push([b.label, b.value, b.pct, b.sub ?? '']))
  } else if (section.type === 'table' && section.tableHeaders && section.tableRows) {
    rows.push(section.tableHeaders)
    section.tableRows.forEach(r => rows.push(r.cells))
  } else if (section.type === 'slide-deck' && section.slides) {
    section.slides.forEach(slide => {
      rows.push([`${slide.slideNumber}. ${slide.slideTitle}`])
      rows.push(['항목', '값'])
      slide.items.forEach(item => rows.push([item.label, item.value]))
      rows.push([])
    })
  }
  rows.push([])
  return rows
}

export function downloadReportExcel(report: GeneratedReport): void {
  const wb = XLSX.utils.book_new()
  const rows: (string | number)[][] = [
    [report.title], [report.subtitle],
    [`기간: ${report.period}`], [`생성일: ${report.generatedAt}`], [`작성자: ${report.preparedBy}`], [],
  ]
  report.sections.forEach(s => rows.push(...sectionToRows(s)))

  rows.push(['AI 종합 의견'])
  report.actionPlan.headline.forEach(h => rows.push([h]))
  rows.push([])

  const groups: [string, string[]][] = [
    ['즉시 조치 필요', report.actionPlan.immediateActions],
    ['비용 / 결제 리스크', report.actionPlan.costRisk],
    ['반복 발생 경고', report.actionPlan.recurringWarning],
    ['관리자 결재 필요', report.actionPlan.approvalNeeded],
  ]
  groups.forEach(([label, items]) => {
    if (items.length === 0) return
    rows.push([label])
    items.forEach(t => rows.push([t]))
    rows.push([])
  })

  rows.push(['분석 대상', `${report.metadata.totalDefects}건`])
  rows.push(['처리 완료율', `${report.metadata.completionRate}%`])
  rows.push(['총 처리 비용', fmtKRW(report.metadata.totalCost)])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, '보고서')
  XLSX.writeFile(wb, fmtReportFilename(report, 'xlsx'))
}
