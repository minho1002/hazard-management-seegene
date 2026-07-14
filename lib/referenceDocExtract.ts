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

// 국보디자인 "하자보증(유 무상)구분표" 실물 구조 기준: 5~6열(구분/공종/내용/무상/유상/비고),
// 앞의 구분/공종 셀은 병합되어 이후 행에서 null로 이어짐 — 마지막으로 본 값을 캐리해온다.
function extractXlsxRows(rows: unknown[][]): StructuredRow[] {
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
