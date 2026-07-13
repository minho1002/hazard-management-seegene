# AI 보고서 다운로드 기능 보강 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/reports/ai`의 PDF·Excel·Word 다운로드는 이미 실제로 동작하지만(이전 세션에서 구현·병합됨), 사용자가 이번에 요청한 상세 스펙 중 "핵심만 보강" 범위 — Excel 다중 시트(요약+상세)/자동필터/틀고정, PDF·Word 페이지 번호·머리글·바닥글, `alert()` → 토스트 알림 교체, 파일명의 기간 표기를 ISO 스타일(`2026-07`)로 통일 — 를 구현한다.

**Architecture:** Excel은 기존 단일 시트(`xlsx` 패키지, 스타일링 불가)를 버리고 `exceljs`로 전면 재작성한다 — `buildReportExcelWorkbook(report)`(순수 함수, Node에서도 테스트 가능)가 "요약" 시트 1개 + `report.sections`의 각 섹션당 시트 1개(자동필터+틀고정 적용)를 만들고, `downloadReportExcel(report)`는 그 워크북을 브라우저에 다운로드만 한다(기존 `buildReportDocxDocument`/`downloadReportWord` 분리 패턴과 동일). PDF는 페이지마다 이미지 위/아래에 8mm씩 여백을 새로 확보해 그 안에 jsPDF `text()`로 머리글·바닥글·쪽번호를 직접 그린다(캡처된 스크린샷 이미지 자체는 손대지 않음). Word는 `docx`의 `Header`/`Footer`/`PageNumber` API를 섹션에 추가한다. 토스트는 이 페이지 전용의 작은 컴포넌트 하나로 구현하고(앱 전역 토스트 시스템은 만들지 않음), 기존 3개의 `alert()` 호출부만 교체한다.

**Tech Stack:** Next.js 14 / React 18 / TypeScript. 신규 의존성: `exceljs`(브라우저 번들 동작 확인 완료 — 웹팩 빌드 성공 + 실제 브라우저에서 `Workbook.xlsx.writeBuffer()` 호출해 6388바이트 버퍼 생성 성공, 콘솔 에러 없음). 기존 `xlsx` 패키지는 더 이상 이 파일에서 쓰지 않지만 다른 화면에서 쓸 수도 있으니 `package.json`에서 제거하지 않는다(사용처 확인 없이 의존성을 지우지 않는다).

## Global Constraints

- **절대 수정 금지**: 이 프로젝트(`02_하자관리시스템`) 디렉터리 밖의 모든 다른 프로젝트 — 운영관리현황시스템, seegene-ops-dashboard, 에너지 사용량 분석, 점검현황, 외주업체관리, 별도 데이터관리 프로젝트.
- 이 프로젝트 내에서도 `app/reports/ai/page.tsx`, `lib/reportExportPdf.ts`, `lib/reportExportWord.ts`, `lib/reportExportExcel.ts`, `lib/aiReportService.ts`(단 `periodFilenameSuffix` 함수 1개만), `package.json`, 신규 파일 `components/common/ReportToast.tsx` 외에는 수정하지 않는다. `app/reports/page.tsx`(일반 보고서), `app/analytics/page.tsx`, `app/dashboard/page.tsx`, `lib/reportExportHtml.ts`, `lib/aiReportService.ts`의 나머지 함수는 그대로 둔다.
- 이 프로젝트에는 자동화된 단위테스트 프레임워크가 없다. 새로 도입하지 않는다. 검증은 `tsc --noEmit` / `next build` / `npx tsx`로 실행하는 스크래치 스모크 스크립트 / 실제 브라우저 Playwright 조작으로 한다.
- `downloadReportExcel`, `downloadReportPDF`, `downloadReportWord`는 모두 브라우저 전용 API(`document`, `Blob`, `URL.createObjectURL`)를 쓰므로 Node 스모크 테스트로 직접 호출하지 않는다 — 대신 각 파일의 "build" 계열 순수 함수(`buildReportExcelWorkbook`, `buildReportPrintHTML`, `buildReportDocxDocument`)만 Node에서 테스트한다.
- 모든 사용자 노출 텍스트는 한국어 유지.
- QA(Task 8)가 전부 통과하기 전에는 commit이 있더라도 push/deploy 금지.
- 스크래치 스모크 스크립트/테스트 페이지는 검증 후 반드시 삭제하고 커밋하지 않는다.

---

### Task 1: `lib/reportExportExcel.ts` — exceljs 기반 다중 시트 재작성

**Files:**
- Modify: `package.json` (exceljs 추가)
- Modify: `lib/reportExportExcel.ts` (전체 재작성)

**Interfaces:**
- Consumes: `GeneratedReport`, `ReportSection` from `@/lib/aiReportService`(기존, 무수정); `fmtReportFilename` from `@/lib/reportExportHtml`(기존, 무수정)
- Produces:
  - `export async function buildReportExcelWorkbook(report: GeneratedReport): Promise<ExcelJS.Workbook>` — 순수 함수(브라우저 API 없음). Task 8 QA와 스모크 테스트가 사용.
  - `export async function downloadReportExcel(report: GeneratedReport): Promise<void>` — 시그니처가 동기(`void`)에서 `Promise<void>`로 변경됨. Task 2에서 호출부를 `await`로 바꿔야 함.

- [ ] **Step 1: exceljs 설치**

Run: `npm install exceljs`
Expected: `package.json`의 `dependencies`에 `"exceljs": "^4.4.0"` 라인 추가, `node_modules/exceljs` 생성.

- [ ] **Step 2: `lib/reportExportExcel.ts` 전체 교체**

파일 전체를 다음으로 교체:

```ts
import ExcelJS from 'exceljs'
import type { GeneratedReport, ReportSection } from '@/lib/aiReportService'
import { fmtReportFilename } from '@/lib/reportExportHtml'

function fmtKRW(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`
  if (v >= 10_000) return `${Math.round(v / 10_000)}만원`
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
  const wb = new ExcelJS.Workbook()
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
  summary.addRow(['보고서 유형', report.reportType])
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
```

- [ ] **Step 3: 스모크 스크립트로 검증(스크래치, 커밋 안 함)**

`.superpowers/sdd/scratch/smoke-excel.ts`:

```ts
import { buildReportExcelWorkbook } from '../../../lib/reportExportExcel'
import type { GeneratedReport } from '../../../lib/aiReportService'

const sample: GeneratedReport = {
  reportType: 'field-analysis', title: '분야별 분석 보고서', subtitle: '테스트',
  period: '2026년 7월', periodType: '월별', aggBasis: '하자 발생일', periodFilenameSuffix: '2026-07',
  generatedAt: '2026-07-13', preparedBy: '시설관리팀', basedOn: 'rule-based',
  sections: [
    { id: 'kpi', title: '요약 KPI', type: 'kpi-grid', kpiItems: [{ label: '전기', value: '12건', sub: '완료율 50%' }] },
    { id: 'freq', title: '분야별 발생 빈도', type: 'bar-list', barItems: [{ label: '전기', value: 12, pct: 60, sub: '전체의 30%' }] },
    { id: 'cost-table', title: '분야별 비용 분석', type: 'table', tableHeaders: ['분야', '건수'], tableRows: [{ cells: ['전기', '12건'], highlight: true }] },
  ],
  actionPlan: { headline: ['테스트 헤드라인'], immediateActions: ['즉시조치 A'], costRisk: [], recurringWarning: [], approvalNeeded: [] },
  metadata: { totalDefects: 12, completionRate: 50, totalCost: 1000000 },
}

async function main() {
  const wb = await buildReportExcelWorkbook(sample)
  const names = wb.worksheets.map(ws => ws.name)
  if (names[0] !== '요약') throw new Error(`FAIL: first sheet should be 요약, got ${names[0]}`)
  if (!names.includes('요약 KPI')) throw new Error(`FAIL: missing kpi sheet, got ${JSON.stringify(names)}`)
  if (!names.includes('분야별 발생 빈도')) throw new Error('FAIL: missing bar-list sheet')
  if (!names.includes('분야별 비용 분석')) throw new Error('FAIL: missing table sheet')

  const detailWs = wb.getWorksheet('분야별 비용 분석')!
  if (!detailWs.autoFilter) throw new Error('FAIL: autofilter missing on detail sheet')
  if (!detailWs.views?.[0] || (detailWs.views[0] as { state?: string }).state !== 'frozen') {
    throw new Error('FAIL: freeze pane missing')
  }

  const buf = await wb.xlsx.writeBuffer()
  if (buf.byteLength < 1000) throw new Error('FAIL: buffer too small')
  console.log('PASS: excel workbook has', names.length, 'sheets:', names.join(', '))
}
main()
```

Run: `cd "C:\Users\신민호\Desktop\씨젠_핵심프로젝트\02_하자관리시스템" && npx tsx .superpowers/sdd/scratch/smoke-excel.ts`
Expected: `PASS: excel workbook has 4 sheets: 요약, 요약 KPI, 분야별 발생 빈도, 분야별 비용 분석` 출력, 에러 없음. 통과 후 스크래치 파일 삭제(커밋 안 함).

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (`app/reports/ai/page.tsx`의 `downloadReportExcel(report)` 동기 호출부에서 "Promise가 처리되지 않음(unused Promise)" 경고는 나지 않지만 — Task 2에서 `await`로 바꿀 것이므로 여기서는 `lib/reportExportExcel.ts` 자체의 타입 오류만 없으면 됨.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/reportExportExcel.ts
git commit -m "feat: rebuild AI report Excel export with per-section sheets, autofilter, and frozen header"
```

---

### Task 2: `app/reports/ai/page.tsx` — Excel 다운로드 비동기화 + 로딩 상태

**Files:**
- Modify: `app/reports/ai/page.tsx`

**Interfaces:**
- Consumes: `downloadReportExcel(report): Promise<void>`(Task 1에서 시그니처 변경됨)
- Produces: 없음(UI 배선만)

- [ ] **Step 1: 로딩 상태 추가**

기존(194번째 줄 부근):
```tsx
  const [pdfLoading, setPdfLoading] = useState(false)
  const [wordLoading, setWordLoading] = useState(false)
```
를:
```tsx
  const [pdfLoading, setPdfLoading] = useState(false)
  const [wordLoading, setWordLoading] = useState(false)
  const [excelLoading, setExcelLoading] = useState(false)
```
로 교체.

- [ ] **Step 2: `handleDownloadExcel`을 비동기 + 로딩 상태로 교체**

기존:
```tsx
  function handleDownloadExcel() {
    if (!report) return
    try {
      downloadReportExcel(report)
    } catch (err) {
      console.error(err)
      alert('Excel 생성 중 오류가 발생했습니다.')
    }
  }
```
를:
```tsx
  async function handleDownloadExcel() {
    if (!report) return
    setExcelLoading(true)
    try {
      await downloadReportExcel(report)
    } catch (err) {
      console.error(err)
      alert('Excel 생성 중 오류가 발생했습니다.')
    } finally {
      setExcelLoading(false)
    }
  }
```
로 교체. (이 Task에서는 `alert` 그대로 둔다 — Task 3에서 PDF/Excel/Word 3개를 한 번에 토스트로 교체.)

- [ ] **Step 3: Excel 버튼에 로딩 스피너 + disabled 반영**

기존:
```tsx
                <button
                  onClick={handleDownloadExcel}
                  disabled={isEmptyReport}
                  title={isEmptyReport ? '데이터가 없어 다운로드할 파일이 없습니다.' : 'Excel 다운로드'}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: isEmptyReport ? 'not-allowed' : 'pointer', fontSize: '0.71rem', color: '#425466', opacity: isEmptyReport ? 0.6 : 1 }}
                >
                  <i className="fa-solid fa-file-excel" style={{ color: '#059669', fontSize: 13 }} />
                  Excel
                </button>
```
를:
```tsx
                <button
                  onClick={handleDownloadExcel}
                  disabled={excelLoading || isEmptyReport}
                  title={isEmptyReport ? '데이터가 없어 다운로드할 파일이 없습니다.' : 'Excel 다운로드'}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: (excelLoading || isEmptyReport) ? 'not-allowed' : 'pointer', fontSize: '0.71rem', color: '#425466', opacity: (excelLoading || isEmptyReport) ? 0.6 : 1 }}
                >
                  <i className={excelLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-excel'} style={{ color: '#059669', fontSize: 13 }} />
                  Excel
                </button>
```
로 교체.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add app/reports/ai/page.tsx
git commit -m "feat: add loading state to Excel download to match PDF/Word buttons"
```

---

### Task 3: 토스트 알림 컴포넌트 — `alert()` 3개 교체

**Files:**
- Create: `components/common/ReportToast.tsx`
- Modify: `app/reports/ai/page.tsx`

**Interfaces:**
- Produces:
  - `export interface ToastMessage { type: 'success' | 'error'; text: string }`
  - `export function ReportToast({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }): JSX.Element | null`

- [ ] **Step 1: `components/common/ReportToast.tsx` 생성**

```tsx
'use client'

import { useEffect } from 'react'

export interface ToastMessage {
  type: 'success' | 'error'
  text: string
}

export function ReportToast({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [toast, onClose])

  if (!toast) return null

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 100,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '11px 16px', borderRadius: 10,
        background: toast.type === 'success' ? '#0F7850' : '#be1044',
        color: '#fff', fontSize: '0.78rem', fontWeight: 600,
        boxShadow: '0 8px 28px rgba(10,37,64,.18)',
        maxWidth: 360,
      }}
    >
      <i className={`fa-solid ${toast.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
      <span>{toast.text}</span>
    </div>
  )
}
```

- [ ] **Step 2: `app/reports/ai/page.tsx`에 import + 상태 추가**

기존:
```tsx
import { downloadReportPDF } from '@/lib/reportExportPdf'
import { downloadReportExcel } from '@/lib/reportExportExcel'
import { downloadReportWord } from '@/lib/reportExportWord'
```
를:
```tsx
import { downloadReportPDF } from '@/lib/reportExportPdf'
import { downloadReportExcel } from '@/lib/reportExportExcel'
import { downloadReportWord } from '@/lib/reportExportWord'
import { ReportToast, type ToastMessage } from '@/components/common/ReportToast'
```
로 교체.

기존(Task 2에서 추가한 줄 바로 다음):
```tsx
  const [excelLoading, setExcelLoading] = useState(false)
```
뒤에 추가:
```tsx
  const [excelLoading, setExcelLoading] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
```

- [ ] **Step 3: 3개 다운로드 핸들러의 `alert` → `setToast` 교체 + 성공 토스트 추가**

기존:
```tsx
  async function handleDownloadPDF() {
    if (!report) return
    setPdfLoading(true)
    try {
      await downloadReportPDF(report)
    } catch (err) {
      console.error(err)
      alert('PDF 생성 중 오류가 발생했습니다.')
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleDownloadExcel() {
    if (!report) return
    setExcelLoading(true)
    try {
      await downloadReportExcel(report)
    } catch (err) {
      console.error(err)
      alert('Excel 생성 중 오류가 발생했습니다.')
    } finally {
      setExcelLoading(false)
    }
  }

  async function handleDownloadWord() {
    if (!report) return
    setWordLoading(true)
    try {
      await downloadReportWord(report)
    } catch (err) {
      console.error(err)
      alert('Word 생성 중 오류가 발생했습니다.')
    } finally {
      setWordLoading(false)
    }
  }
```
를:
```tsx
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
```
로 교체.

- [ ] **Step 4: 토스트 렌더링 추가**

파일 끝부분, 기존:
```tsx
        )}
      </div>
    </div>
  )
```
를:
```tsx
        )}
      </div>
      <ReportToast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
```
로 교체. (이 블록은 `<div style={{ padding: '28px 32px'...}}>...</div>`을 닫는 부분과 가장 바깥 `<div style={{ minHeight: '100vh'...}}>`을 닫는 부분 사이 — 파일 맨 끝에서 4~5번째 줄 근처. 정확한 위치는 `grep -n "^      </div>$" app/reports/ai/page.tsx`로 확인 후 마지막 두 개의 `</div>` 사이에 삽입.)

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 6: 개발 서버로 수동 확인**

Run: `npm run dev`
브라우저로 `/reports/ai` 접속 → 보고서 생성 → PDF 다운로드 클릭 → 우측 하단에 초록색 "PDF 다운로드가 완료되었습니다." 토스트가 떴다가 약 3.5초 후 사라지는지 확인. 개발 서버 중지.

- [ ] **Step 7: Commit**

```bash
git add components/common/ReportToast.tsx app/reports/ai/page.tsx
git commit -m "feat: replace alert() with toast notifications for AI report downloads"
```

---

### Task 4: `lib/reportExportPdf.ts` — 페이지 머리글·바닥글·쪽번호

**Files:**
- Modify: `lib/reportExportPdf.ts`

**Interfaces:**
- Consumes: `report.title`, `report.period`, `report.generatedAt`(기존 필드, 무수정)
- Produces: `downloadReportPDF` 시그니처 불변(`(report: GeneratedReport) => Promise<void>`) — 내부 렌더링만 변경.

- [ ] **Step 1: 여백 상수 추가 + 페이지 높이 예산 축소**

기존:
```ts
export async function downloadReportPDF(report: GeneratedReport): Promise<void> {
  const container = document.createElement('div')
  container.innerHTML = buildReportPrintHTML(report)
  Object.assign(container.style, { position: 'absolute', left: '-9999px', top: '0', width: `${A4_WIDTH_PX}px`, zIndex: '-1' })
  document.body.appendChild(container)

  try {
    const target = container.querySelector('.rpt-a4') as HTMLElement
    const canvas = await html2canvas(target, { scale: 2, useCORS: true, logging: false, windowWidth: A4_WIDTH_PX })
    const scale = canvas.width / A4_WIDTH_PX
    const pageHeightPx = A4_HEIGHT_PX * scale

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
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_WIDTH_PX, sliceHeight / scale)
      sliceStart = sliceEnd
    })

    pdf.save(fmtReportFilename(report, 'pdf'))
  } finally {
    document.body.removeChild(container)
  }
}
```
를:
```ts
const MM_TO_PX = 96 / 25.4
const HEADER_RESERVED_PX = Math.round(8 * MM_TO_PX)
const FOOTER_RESERVED_PX = Math.round(8 * MM_TO_PX)

function drawRunningHeaderFooter(pdf: jsPDF, report: GeneratedReport, pageNum: number, totalPages: number): void {
  pdf.setFontSize(8)
  pdf.setTextColor(105, 115, 134)
  pdf.text(report.title, 12, 14)
  pdf.text(report.period, A4_WIDTH_PX - 12, 14, { align: 'right' })
  pdf.setDrawColor(227, 232, 239)
  pdf.line(12, 20, A4_WIDTH_PX - 12, 20)

  pdf.line(12, A4_HEIGHT_PX - 20, A4_WIDTH_PX - 12, A4_HEIGHT_PX - 20)
  pdf.text(`대전충청검사센터 시설관리팀 · 생성: ${report.generatedAt}`, 12, A4_HEIGHT_PX - 10)
  pdf.text(`${pageNum} / ${totalPages}`, A4_WIDTH_PX - 12, A4_HEIGHT_PX - 10, { align: 'right' })
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
      drawRunningHeaderFooter(pdf, report, i + 1, breaks.length)
      sliceStart = sliceEnd
    })

    pdf.save(fmtReportFilename(report, 'pdf'))
  } finally {
    document.body.removeChild(container)
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: `computePageBreaks` 기존 로직 회귀 확인**

`computePageBreaks` 함수 자체는 이 Task에서 수정하지 않는다 — 호출 시 넘기는 `pageHeightPx` 값만 작아졌을 뿐이므로, 기존 경계/축퇴 입력 가드(a0659fb 커밋)는 그대로 유효하다. 별도 스모크 테스트 불필요(함수 시그니처·동작 불변).

- [ ] **Step 4: Commit**

```bash
git add lib/reportExportPdf.ts
git commit -m "feat: add repeating header, footer, and page numbers to AI report PDF export"
```

---

### Task 5: `lib/reportExportWord.ts` — 페이지 머리글·바닥글·쪽번호

**Files:**
- Modify: `lib/reportExportWord.ts`

**Interfaces:**
- Consumes: `report.title`, `report.preparedBy`, `report.generatedAt`(기존 필드, 무수정)
- Produces: `buildReportDocxDocument`/`downloadReportWord` 시그니처 불변.

- [ ] **Step 1: import에 `Header`, `Footer`, `PageNumber`, `AlignmentType` 추가**

기존:
```ts
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, ShadingType, PageOrientation,
} from 'docx'
```
를:
```ts
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, ShadingType, PageOrientation,
  Header, Footer, PageNumber, AlignmentType,
} from 'docx'
```
로 교체.

- [ ] **Step 2: `buildReportDocxDocument`의 `sections` 배열에 `headers`/`footers` 추가**

기존:
```ts
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
```
를:
```ts
  return new Document({
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT, width: 11906, height: 16838 },
          margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [new TextRun({ text: report.title, bold: true, size: 16, color: '697386' })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: `${report.preparedBy} · 생성: ${report.generatedAt} · 페이지 `, size: 16, color: '697386' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '697386' }),
                new TextRun({ text: ' / ', size: 16, color: '697386' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '697386' }),
              ],
            }),
          ],
        }),
      },
      children,
    }],
  })
```
로 교체.

- [ ] **Step 3: 스모크 스크립트로 검증(스크래치, 커밋 안 함)**

`.superpowers/sdd/scratch/smoke-word-header.ts`:

```ts
import { Packer } from 'docx'
import { buildReportDocxDocument } from '../../../lib/reportExportWord'
import type { GeneratedReport } from '../../../lib/aiReportService'

const sample: GeneratedReport = {
  reportType: 'field-analysis', title: '분야별 분석 보고서', subtitle: '테스트',
  period: '2026년 7월', periodType: '월별', aggBasis: '하자 발생일', periodFilenameSuffix: '2026-07',
  generatedAt: '2026-07-13', preparedBy: '시설관리팀', basedOn: 'rule-based',
  sections: [
    { id: 'kpi', title: '요약', type: 'kpi-grid', kpiItems: [{ label: '전기', value: '12건' }] },
  ],
  actionPlan: { headline: ['테스트'], immediateActions: [], costRisk: [], recurringWarning: [], approvalNeeded: [] },
  metadata: { totalDefects: 12, completionRate: 50, totalCost: 1000000 },
}

async function main() {
  const doc = buildReportDocxDocument(sample)
  const buf = await Packer.toBuffer(doc)
  if (buf.length < 1000) throw new Error('FAIL: docx buffer too small')
  console.log('PASS: docx generated with header/footer,', buf.length, 'bytes')
}
main()
```

Run: `npx tsx .superpowers/sdd/scratch/smoke-word-header.ts`
Expected: `PASS: docx generated with header/footer, N bytes` 출력, 에러 없음. 통과 후 스크래치 파일 삭제(커밋 안 함).

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add lib/reportExportWord.ts
git commit -m "feat: add running header, footer, and page numbers to AI report Word export"
```

---

### Task 6: `lib/aiReportService.ts` — 월별 파일명 기간 표기를 ISO 스타일로 변경

**Files:**
- Modify: `lib/aiReportService.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `periodFilenameSuffix` 반환값 형식만 변경(함수 시그니처 불변) — `fmtReportFilename`(lib/reportExportHtml.ts, 무수정)이 그대로 사용.

- [ ] **Step 1: 월별 케이스만 교체**

기존:
```ts
function periodFilenameSuffix(period: ReportPeriod): string {
  if (period.type === '전체') return '전체기간'
  if (period.type === '연도별') return `${(period.from ?? '').slice(0, 4)}년`
  if (period.type === '월별') return `${(period.from ?? '').slice(0, 4)}년_${(period.from ?? '').slice(5, 7)}월`
  if (period.type === '일별') return period.from ?? '전체기간'
  return `${period.from ?? ''}_${period.to ?? ''}`
}
```
를:
```ts
function periodFilenameSuffix(period: ReportPeriod): string {
  if (period.type === '전체') return '전체기간'
  if (period.type === '연도별') return `${(period.from ?? '').slice(0, 4)}년`
  if (period.type === '월별') return `${(period.from ?? '').slice(0, 4)}-${(period.from ?? '').slice(5, 7)}`
  if (period.type === '일별') return period.from ?? '전체기간'
  return `${period.from ?? ''}_${period.to ?? ''}`
}
```
로 교체. (월별 파일명이 `..._2026년_07월.ext`에서 `..._2026-07.ext`로 바뀐다. 화면에 보이는 `report.period`/`ReportPeriod.label`은 그대로 `"2026년 7월"`이라 UI 문구는 변하지 않는다 — 파일명 스킴만 바뀐다.)

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add lib/aiReportService.ts
git commit -m "feat: use ISO-style YYYY-MM period suffix in monthly AI report filenames"
```

---

### Task 7: 전체 타입체크 + 프로덕션 빌드 게이트

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: `Compiled successfully`, `/reports/ai` 라우트 정상 빌드, `app/reports/page.tsx`/`app/analytics/page.tsx`/`app/dashboard/page.tsx` 라우트도 그대로 빌드됨(무수정 확인)

- [ ] **Step 3: Commit 없음(검증 전용 Task)**

---

### Task 8: Playwright QA — 실제 다운로드 파일 내용 검증 + 회귀 확인

**Files:** 없음(검증 전용)

- [ ] **Step 1: 개발 서버 기동, Playwright 준비**

`npm run dev` 백그라운드 실행. `npm install --no-save playwright@1.61.1 exceljs`(exceljs는 다운로드된 xlsx 파일을 QA 스크립트에서 직접 열어 시트를 검증하기 위함 — Task 1에서 이미 의존성으로 추가됐다면 `--no-save` 불필요, 중복 설치는 무해함).

- [ ] **Step 2: 6개 보고서 유형 각각 생성 → PDF/Excel/Word 다운로드 → 콘솔 에러 확인**

로그인(`admin`/`admin1234`) 후 `/reports/ai`에서, 6개 보고서 유형(분야별 분석/예산 정산/경영진 보고용 PT/반복 하자/비용 부담 주체별/하자사항·일반사항 구분) 각각에 대해:
- 보고기간 "전체"로 설정 → 보고서 생성하기
- `page.on('console', ...)`으로 `error` 레벨 콘솔 메시지 없는지 확인
- PDF 다운로드 클릭 → `download.path()`로 저장된 파일 크기 > 1000바이트 확인, 파일명이 `_전체기간.pdf`로 끝나는지 확인
- Excel 다운로드 클릭 → 저장된 파일을 `exceljs`의 `Workbook.xlsx.load(buffer)`로 열어 시트 이름 목록에 `'요약'`이 포함되는지, 시트 개수가 2개 이상인지 확인(경영진 보고용 PT는 `slide-deck` 섹션 1개 → 요약+1 = 2개, 나머지 유형은 섹션이 여러 개라 3개 이상)
- Word 다운로드 클릭 → 저장된 파일 크기 > 1000바이트 확인
- 각 다운로드 후 우측 하단에 성공 토스트(`"다운로드가 완료되었습니다"` 계열 문구) 노출 확인
- 인쇄 미리보기(`page.emulateMedia({ media: 'print' })` 후 `.no-print` 요소들이 `display: none`인지, `.rpt-a4`가 보이는지 스타일 확인)

- [ ] **Step 3: 빈 데이터 기간 처리 확인**

보고기간을 "월별"(오늘이 속한 현재 연/월, 시드 데이터 없음)으로 설정 → 데이터 없음 안내 카드 노출, PDF/Excel/Word 버튼 모두 `disabled` 확인(기존 동작 유지 회귀 확인).

- [ ] **Step 4: 대시보드 회귀 확인**

`/dashboard` 접속 → AI 종합의견 텍스트가 여전히 "오늘 …"으로 시작하는지 확인(이번 변경으로 건드리지 않은 `generateActionPlanOpinion` 호출부 — 회귀 없어야 함).

- [ ] **Step 5: 정리 및 보고**

스크래치 스크립트/스크린샷/다운로드 파일 삭제, dev 서버 종료(포트 기준으로 타겟 프로세스만 종료 — 전체 node 프로세스를 죽이지 말 것). 실패 항목이 있으면 해당 Task로 돌아가 수정 후 Task 7부터 재검증. **QA 전 항목이 모두 통과하기 전에는 commit이 이미 되어 있더라도 push/deploy하지 않는다.**
