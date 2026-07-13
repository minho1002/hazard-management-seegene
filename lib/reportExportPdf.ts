import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { GeneratedReport } from '@/lib/aiReportService'
import { buildReportPrintHTML, fmtReportFilename } from '@/lib/reportExportHtml'

export const A4_WIDTH_PX = 794 // 210mm @ 96dpi
export const A4_HEIGHT_PX = 1123 // 297mm @ 96dpi

const MM_TO_PX = 96 / 25.4
const HEADER_RESERVED_PX = Math.round(8 * MM_TO_PX)
const FOOTER_RESERVED_PX = Math.round(8 * MM_TO_PX)

function buildHeaderFooterOverlay(report: GeneratedReport, pageNum: number, totalPages: number): string {
  const canvas = document.createElement('canvas')
  const dpr = 2
  canvas.width = A4_WIDTH_PX * dpr
  canvas.height = A4_HEIGHT_PX * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.font = '8px "Malgun Gothic","맑은 고딕",-apple-system,sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgb(105,115,134)'
  ctx.strokeStyle = 'rgb(227,232,239)'
  ctx.lineWidth = 1

  ctx.textAlign = 'left'
  ctx.fillText(report.title, 12, 14)
  ctx.textAlign = 'right'
  ctx.fillText(report.period, A4_WIDTH_PX - 12, 14)
  ctx.beginPath()
  ctx.moveTo(12, 20)
  ctx.lineTo(A4_WIDTH_PX - 12, 20)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(12, A4_HEIGHT_PX - 20)
  ctx.lineTo(A4_WIDTH_PX - 12, A4_HEIGHT_PX - 20)
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.fillText(`대전충청검사센터 시설관리팀 · 생성: ${report.generatedAt}`, 12, A4_HEIGHT_PX - 10)
  ctx.textAlign = 'right'
  ctx.fillText(`${pageNum} / ${totalPages}`, A4_WIDTH_PX - 12, A4_HEIGHT_PX - 10)

  return canvas.toDataURL('image/png')
}

/**
 * atomicTops: 페이지 중간에서 잘리면 안 되는 요소(섹션/카드/슬라이드/표 행)들의
 *   캔버스 기준 top 좌표(오름차순 아닐 수 있음, 내부에서 정렬).
 * canvasHeight: 전체 캡처된 캔버스 높이(px)
 * pageHeightPx: 한 페이지에 들어갈 수 있는 높이(px, 캔버스 스케일 반영됨)
 * 반환값: 각 페이지의 종료 y좌표 오름차순 배열. 마지막 원소는 항상 canvasHeight.
 */
export function computePageBreaks(atomicTops: number[], canvasHeight: number, pageHeightPx: number): number[] {
  if (canvasHeight <= 1) return [canvasHeight]
  // Non-positive page height would keep hardLimit === sliceStart forever (infinite loop); treat it as one page.
  if (pageHeightPx <= 0) pageHeightPx = canvasHeight
  const sortedTops = [...atomicTops].sort((a, b) => a - b)
  const breaks: number[] = []
  let sliceStart = 0
  while (sliceStart < canvasHeight - 1) {
    const hardLimit = Math.min(sliceStart + pageHeightPx, canvasHeight)
    if (hardLimit >= canvasHeight) {
      breaks.push(canvasHeight)
      break
    }
    const candidates = sortedTops.filter(t => t > sliceStart && t <= hardLimit)
    const sliceEnd = candidates.length > 0 ? candidates[candidates.length - 1] : hardLimit
    breaks.push(sliceEnd)
    sliceStart = sliceEnd
  }
  return breaks
}

export async function downloadReportPDF(report: GeneratedReport): Promise<void> {
  const container = document.createElement('div')
  container.innerHTML = buildReportPrintHTML(report)
  Object.assign(container.style, { position: 'absolute', left: '-9999px', top: '0', width: `${A4_WIDTH_PX}px`, zIndex: '-1' })
  document.body.appendChild(container)

  try {
    const target = container.querySelector('.rpt-a4') as HTMLElement
    const canvas = await html2canvas(target, { scale: 2, useCORS: true, logging: false, windowWidth: A4_WIDTH_PX })
    const scale = canvas.width / A4_WIDTH_PX
    const contentHeightPx = A4_HEIGHT_PX - HEADER_RESERVED_PX - FOOTER_RESERVED_PX
    const pageHeightPx = contentHeightPx * scale

    const atomicEls = Array.from(target.querySelectorAll('.rpt-sec, .rpt-kpi, .rpt-barlist-row, .rpt-slide, .rpt-tbl tbody tr')) as HTMLElement[]
    const targetTop = target.getBoundingClientRect().top
    const atomicTops = atomicEls.map(el => (el.getBoundingClientRect().top - targetTop) * scale)

    const breaks = computePageBreaks(atomicTops, canvas.height, pageHeightPx)

    const pdf = new jsPDF({ unit: 'px', format: [A4_WIDTH_PX, A4_HEIGHT_PX] })
    let sliceStart = 0
    breaks.forEach((sliceEnd, i) => {
      const sliceHeight = sliceEnd - sliceStart
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = sliceHeight
      const ctx = sliceCanvas.getContext('2d')!
      ctx.drawImage(canvas, 0, sliceStart, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.98)
      if (i > 0) pdf.addPage([A4_WIDTH_PX, A4_HEIGHT_PX])
      pdf.addImage(imgData, 'JPEG', 0, HEADER_RESERVED_PX, A4_WIDTH_PX, sliceHeight / scale)
      const overlay = buildHeaderFooterOverlay(report, i + 1, breaks.length)
      pdf.addImage(overlay, 'PNG', 0, 0, A4_WIDTH_PX, A4_HEIGHT_PX)
      sliceStart = sliceEnd
    })

    pdf.save(fmtReportFilename(report, 'pdf'))
  } finally {
    document.body.removeChild(container)
  }
}
