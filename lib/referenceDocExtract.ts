import './pdfDomPolyfills'
import { PDFParse } from 'pdf-parse'
import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'

export interface StructuredRow {
  trade: string
  item: string
  free: string | null
  paid: string | null
  note: string | null
}

export interface ExtractedContent {
  extractedText: string | null
  structuredRows: StructuredRow[] | null
  extractionFailed: boolean
}

async function extractPdf(buffer: Buffer): Promise<ExtractedContent> {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return { extractedText: result.text, structuredRows: null, extractionFailed: false }
  } finally {
    await parser.destroy()
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractedContent> {
  const result = await mammoth.extractRawText({ buffer })
  return { extractedText: result.value, structuredRows: null, extractionFailed: false }
}

interface HeaderColumns {
  headerRowIndex: number
  trade: number | null
  item: number
  free: number | null
  paid: number | null
  note: number | null
}

// 업체마다 유무상 구분표의 실제 열 배치(순서/개수)가 다르므로, 고정 위치 대신 헤더 행의
// 텍스트를 인식해 각 열의 의미를 찾는다. "내용/항목" 열과 "무상"·"유상" 열 중 최소 하나가
// 함께 발견된 행을 헤더로 확정한다.
function detectHeaderColumns(rows: unknown[][]): HeaderColumns | null {
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].map(c => (c == null ? '' : String(c).trim()))
    let trade: number | null = null
    let item: number | null = null
    let free: number | null = null
    let paid: number | null = null
    let note: number | null = null
    // "공종"을 trade 열로 우선 채택 — "구분"은 대분류 라벨로만 쓰이고 실제 업체/전문분야는
    // "공종" 열에 담기는 경우(국보디자인 실물 구조)가 있어, 두 라벨이 함께 있으면 "공종"을 우선한다.
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c]
      if (!cell) continue
      if (item === null && /내용|항목/.test(cell)) item = c
      else if (free === null && /무상/.test(cell)) free = c
      else if (paid === null && /유상/.test(cell)) paid = c
      else if (note === null && /비고/.test(cell)) note = c
      else if (trade === null && /공종/.test(cell)) trade = c
    }
    if (trade === null) {
      for (let c = 0; c < cells.length; c++) {
        if ([item, free, paid, note].includes(c)) continue
        if (cells[c] && /구분/.test(cells[c])) { trade = c; break }
      }
    }
    if (item !== null && (free !== null || paid !== null)) {
      return { headerRowIndex: r, trade, item, free, paid, note }
    }
  }
  return null
}

// 국보디자인 "하자보증(유 무상)구분표" 실물 구조 기준: 5~6열(구분/공종/내용/무상/유상/비고),
// 앞의 구분/공종 셀은 병합되어 이후 행에서 null로 이어짐 — 마지막으로 본 값을 캐리해온다.
function extractXlsxRowsLegacy(rows: unknown[][]): StructuredRow[] {
  const out: StructuredRow[] = []
  let lastTrade = ''
  for (const row of rows) {
    const cells = row.map(c => (c == null ? null : String(c).trim()))
    // 헤더/빈 행/제목 행 스킵: "내용" 컬럼이 없으면(2번째 유효 텍스트 컬럼 없음) 건너뜀
    const nonEmpty = cells.filter((c): c is string => !!c)
    if (nonEmpty.length < 2) continue
    if (cells[0] && /구분|공종/.test(cells[0]) && cells[2] && /내용/.test(cells[2] ?? '')) continue // 헤더 행

    const trade = cells[1] ?? lastTrade
    const item = cells[2]
    if (!item) continue
    lastTrade = trade || lastTrade
    out.push({
      trade: trade || '미분류',
      item,
      free: cells[3] ?? null,
      paid: cells[4] ?? null,
      note: cells[5] ?? null,
    })
  }
  return out
}

function extractXlsxRows(rows: unknown[][]): StructuredRow[] {
  const header = detectHeaderColumns(rows)
  if (!header) return extractXlsxRowsLegacy(rows)

  const out: StructuredRow[] = []
  let lastTrade = ''
  for (let r = header.headerRowIndex + 1; r < rows.length; r++) {
    const cells = rows[r].map(c => (c == null ? null : String(c).trim()))
    const nonEmpty = cells.filter((c): c is string => !!c)
    if (nonEmpty.length < 1) continue

    const item = cells[header.item]
    if (!item) continue
    const trade = (header.trade !== null ? cells[header.trade] : null) ?? lastTrade
    lastTrade = trade || lastTrade
    out.push({
      trade: trade || '미분류',
      item,
      free: header.free !== null ? cells[header.free] ?? null : null,
      paid: header.paid !== null ? cells[header.paid] ?? null : null,
      note: header.note !== null ? cells[header.note] ?? null : null,
    })
  }
  return out
}

async function extractXlsx(buffer: Buffer): Promise<ExtractedContent> {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const allRows: StructuredRow[] = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][]
    allRows.push(...extractXlsxRows(rows))
  }
  return { extractedText: null, structuredRows: allRows, extractionFailed: allRows.length === 0 }
}

export async function extractReferenceDoc(buffer: Buffer, fileType: 'pdf' | 'docx' | 'xlsx'): Promise<ExtractedContent> {
  try {
    if (fileType === 'pdf') return await extractPdf(buffer)
    if (fileType === 'docx') return await extractDocx(buffer)
    return await extractXlsx(buffer)
  } catch (err) {
    console.error('reference doc extraction failed:', err)
    return { extractedText: null, structuredRows: null, extractionFailed: true }
  }
}
