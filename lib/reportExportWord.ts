import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, ShadingType, PageOrientation,
} from 'docx'
import type { GeneratedReport, ReportSection } from '@/lib/aiReportService'
import { fmtReportFilename } from '@/lib/reportExportHtml'

function fmtKRW(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`
  if (v >= 10_000) return `${Math.round(v / 10_000)}만원`
  if (v > 0) return `${v.toLocaleString()}원`
  return '-'
}

function cell(text: string, opts: { header?: boolean; color?: string } = {}): TableCell {
  return new TableCell({
    shading: opts.header ? { fill: 'F5F7FA', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.header, color: opts.color })] })],
  })
}

function tableFromMatrix(matrix: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: matrix.map((cells, ri) => new TableRow({ children: cells.map(c => cell(c, { header: ri === 0 })) })),
  })
}

function barText(pct: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(pct / 10)))
  return '■'.repeat(filled) + '□'.repeat(10 - filled)
}

function sectionToBlocks(section: ReportSection): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [
    new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2, keepNext: true }),
  ]
  if (section.type === 'kpi-grid' && section.kpiItems) {
    blocks.push(tableFromMatrix([['항목', '값', '부가설명'], ...section.kpiItems.map(k => [k.label, k.value, k.sub ?? '-'])]))
  } else if (section.type === 'bar-list' && section.barItems) {
    blocks.push(tableFromMatrix([
      ['항목', '값', '비율', '분포'],
      ...section.barItems.map(b => [b.label, b.value >= 10000 ? fmtKRW(b.value) : `${b.value}건`, `${b.pct}%`, barText(b.pct)]),
    ]))
  } else if (section.type === 'table' && section.tableHeaders && section.tableRows) {
    blocks.push(tableFromMatrix([section.tableHeaders, ...section.tableRows.map(r => r.cells)]))
  } else if (section.type === 'slide-deck' && section.slides) {
    section.slides.forEach(slide => {
      blocks.push(new Paragraph({ text: `${slide.slideNumber}. ${slide.slideTitle}`, heading: HeadingLevel.HEADING_3, keepNext: true }))
      blocks.push(tableFromMatrix([['항목', '값'], ...slide.items.map(i => [i.label, i.value])]))
    })
  }
  return blocks
}

export function buildReportDocxDocument(report: GeneratedReport): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: report.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: report.subtitle, bold: true, color: '635BFF' })] }),
    new Paragraph({ text: `기간: ${report.period}   생성일: ${report.generatedAt}   작성자: ${report.preparedBy}` }),
  ]

  report.sections.forEach(s => children.push(...sectionToBlocks(s)))

  children.push(new Paragraph({ text: 'AI 종합 의견', heading: HeadingLevel.HEADING_2, keepNext: true }))
  report.actionPlan.headline.forEach(h => children.push(new Paragraph({ text: `• ${h}` })))

  const groups: [string, string[]][] = [
    ['즉시 조치 필요', report.actionPlan.immediateActions],
    ['비용 / 결제 리스크', report.actionPlan.costRisk],
    ['반복 발생 경고', report.actionPlan.recurringWarning],
    ['관리자 결재 필요', report.actionPlan.approvalNeeded],
  ]
  groups.forEach(([label, items]) => {
    if (items.length === 0) return
    children.push(new Paragraph({ text: label, heading: HeadingLevel.HEADING_3, keepNext: true }))
    items.forEach(t => children.push(new Paragraph({ text: `· ${t}` })))
  })

  children.push(new Paragraph({
    text: `분석 대상 ${report.metadata.totalDefects}건 · 처리 완료율 ${report.metadata.completionRate}% · 총 처리 비용 ${fmtKRW(report.metadata.totalCost)}`,
  }))

  return new Document({
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT, width: 11906, height: 16838 },
          margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
        },
      },
      children,
    }],
  })
}

export async function downloadReportWord(report: GeneratedReport): Promise<void> {
  const doc = buildReportDocxDocument(report)
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fmtReportFilename(report, 'docx')
  a.click()
  URL.revokeObjectURL(url)
}
