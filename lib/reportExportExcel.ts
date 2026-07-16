import type ExcelJS from 'exceljs'
import type { GeneratedReport, ReportSection } from '@/lib/aiReportService'
import { fmtReportFilename } from '@/lib/reportExportHtml'

// 만원/억원 단위로 반올림하면 확정 금액과 어긋나 보이므로 원 단위 실금액을 그대로 표기한다.
function fmtKRW(v: number): string {
  if (v > 0) return `${v.toLocaleString()}원`
  return '-'
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } }
  row.eachCell(cell => {
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE3E8EF' } } }
  })
}

function autoWidth(ws: ExcelJS.Worksheet, colCount: number): void {
  for (let i = 1; i <= colCount; i++) {
    let max = 8
    ws.getColumn(i).eachCell({ includeEmpty: false }, cell => {
      const len = String(cell.value ?? '').length
      if (len > max) max = len
    })
    ws.getColumn(i).width = Math.min(40, max + 4)
  }
}

function setupPrintArea(ws: ExcelJS.Worksheet): void {
  ws.pageSetup = {
    paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  }
}

function sanitizeSheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[\\/*?:[\]]/g, '').slice(0, 28).trim() || '상세'
  let name = base
  let n = 2
  while (used.has(name)) {
    name = `${base}_${n}`
    n++
  }
  used.add(name)
  return name
}

function addDetailSheet(wb: ExcelJS.Workbook, section: ReportSection, used: Set<string>): void {
  let headers: string[] = []
  let rows: (string | number)[][] = []
  let numericCols: number[] = []

  if (section.type === 'table' && section.tableHeaders && section.tableRows) {
    headers = section.tableHeaders
    rows = section.tableRows.map(r => r.cells)
  } else if (section.type === 'bar-list' && section.barItems) {
    headers = ['항목', '값', '비율(%)', '부가설명']
    rows = section.barItems.map(b => [b.label, b.value, b.pct, b.sub ?? ''])
    numericCols = [2, 3]
  } else if (section.type === 'kpi-grid' && section.kpiItems) {
    headers = ['항목', '값', '부가설명']
    rows = section.kpiItems.map(k => [k.label, k.value, k.sub ?? ''])
  } else if (section.type === 'slide-deck' && section.slides) {
    headers = ['슬라이드', '항목', '값']
    rows = section.slides.flatMap(slide =>
      slide.items.map(item => [`${slide.slideNumber}. ${slide.slideTitle}`, item.label, item.value]))
  } else {
    return
  }

  const ws = wb.addWorksheet(sanitizeSheetName(section.title, used))
  ws.addRow(headers)
  rows.forEach(r => ws.addRow(r))
  numericCols.forEach(col => { ws.getColumn(col).numFmt = '#,##0' })
  styleHeaderRow(ws.getRow(1))
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
  autoWidth(ws, headers.length)
  setupPrintArea(ws)
}

export async function buildReportExcelWorkbook(report: GeneratedReport): Promise<ExcelJS.Workbook> {
  const { default: ExcelJSLib } = await import('exceljs')
  const wb = new ExcelJSLib.Workbook()
  wb.creator = report.preparedBy
  wb.created = new Date()

  const summary = wb.addWorksheet('요약')
  summary.getColumn(1).width = 60
  summary.getColumn(2).width = 24
  summary.getColumn(3).width = 24

  summary.addRow([report.title])
  summary.getCell('A1').font = { bold: true, size: 14 }
  summary.addRow([report.subtitle])
  summary.addRow([])
  summary.addRow(['기준기간', report.period])
  summary.addRow(['생성일', report.generatedAt])
  summary.addRow(['작성자', report.preparedBy])
  summary.addRow(['집계 기준', report.aggBasis])
  summary.addRow([])

  summary.addRow(['핵심 요약'])
  summary.getCell(`A${summary.rowCount}`).font = { bold: true }
  summary.addRow(['분석 대상', `${report.metadata.totalDefects}건`])
  summary.addRow(['처리 완료율', `${report.metadata.completionRate}%`])
  summary.addRow(['총 처리 비용', fmtKRW(report.metadata.totalCost)])
  summary.addRow([])

  summary.addRow(['AI Action Plan'])
  summary.getCell(`A${summary.rowCount}`).font = { bold: true }
  report.actionPlan.headline.forEach(h => summary.addRow([h]))
  summary.addRow([])

  const groups: [string, string[]][] = [
    ['즉시 조치 필요', report.actionPlan.immediateActions],
    ['비용 / 결제 리스크', report.actionPlan.costRisk],
    ['반복 발생 경고', report.actionPlan.recurringWarning],
    ['관리자 결재 필요', report.actionPlan.approvalNeeded],
  ]
  groups.forEach(([label, items]) => {
    if (items.length === 0) return
    summary.addRow([label])
    summary.getCell(`A${summary.rowCount}`).font = { bold: true }
    items.forEach(t => summary.addRow([t]))
    summary.addRow([])
  })
  setupPrintArea(summary)

  const used = new Set<string>(['요약'])
  report.sections.forEach(section => addDetailSheet(wb, section, used))

  return wb
}

export async function downloadReportExcel(report: GeneratedReport): Promise<void> {
  const wb = await buildReportExcelWorkbook(report)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fmtReportFilename(report, 'xlsx')
  a.click()
  URL.revokeObjectURL(url)
}
