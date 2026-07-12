# AI 보고서 PDF·Excel·Word 다운로드 및 인쇄 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/reports/ai` 화면의 PDF/Excel/Word 다운로드 버튼(현재 alert 스텁)을 실제 파일 생성으로 교체하고, 사이드바·조작영역을 숨기고 보고서 본문만 A4로 인쇄하는 버튼을 추가한다.

**Architecture:** 화면에 이미 생성된 단일 `GeneratedReport` 객체를 입력으로 받는 순수 변환 함수들(`lib/reportExport*.ts`)을 만든다. PDF는 오프스크린 HTML을 `html2canvas`로 캡처 후 섹션 경계를 넘지 않는 지점에서 잘라 `jsPDF`로 페이지를 구성한다. Excel은 `xlsx`(기존 설치됨)로 시트 1장에 텍스트 표 형태로 기록한다. Word는 `docx` 패키지로 진짜 OOXML `.docx`를 만든다. 인쇄는 새 창 없이, 현재 페이지에 스코프된 `<style>`로 사이드바/역할배너/조작영역을 `display:none`시켜 보고서 본문만 인쇄한다.

**Tech Stack:** Next.js 14 (App Router) / React 18 / TypeScript, 신규 npm 패키지 `jspdf`, `html2canvas`, `docx` (Excel은 기존 `xlsx` 재사용).

## Global Constraints

- 기존 `app/reports/page.tsx`(일반 보고서 화면)는 이번 작업 대상이 아니며 수정하지 않는다.
- Word는 HTML→`.doc` 방식이 아니라 `docx` 패키지로 만든 진짜 `.docx`여야 한다.
- PDF는 CDN 동적 로드가 아니라 `jspdf`/`html2canvas`를 npm 의존성으로 설치해 빌드에 포함해야 한다.
- 인쇄는 `window.open()`으로 새 창을 띄우지 않고, 현재 페이지에서 사이드바(`.app-sidenav`)·역할배너(`.app-rolebanner`)·조작영역(`.no-print`)만 숨기고 보고서 본문(`.rpt-print-area`)만 인쇄되어야 한다.
- 이 프로젝트에는 자동화된 단위테스트 프레임워크(jest/vitest 등)가 없다. 새로 도입하지 않는다. 검증은 (1) `npx tsx`로 실행하는 임시 스모크 스크립트(스크래치패드 디렉터리에 작성, 커밋하지 않음), (2) `tsc --noEmit`/`next build`, (3) 마지막 단계의 Playwright(MCP) 브라우저 조작으로 수행한다.
- 모든 파일명은 `AI보고서_{reportType}_{YYYY-MM-DD}.{ext}` 형식(한글 포함)이어야 한다.
- 다운로드/인쇄 버튼 라벨, 안내 문구 등 사용자 노출 텍스트는 한국어를 유지한다(기존 UI 관례).
- 모든 Task가 끝나고 Task 9(Playwright QA)를 통과하기 전에는 배포(`vercel --prod` 등)하지 않는다.
- 스크래치패드 경로: `C:\Users\신민호\AppData\Local\Temp\claude\C--Users-----Desktop----------\beb92ae8-3e81-459b-abdc-f10c1cdca985\scratchpad` (임시 스모크 스크립트 전용, 프로젝트 파일 아님).

---

### Task 1: 인쇄 시 숨길 레이아웃 요소에 클래스 훅 추가

**Files:**
- Modify: `components/layout/SideNav.tsx` (최상위 `<aside>` 태그, 현재 79번째 줄 부근)
- Modify: `components/layout/RoleBanner.tsx` (최상위 `<div>` 태그, 현재 10번째 줄)

**Interfaces:**
- Consumes: 없음
- Produces: CSS 셀렉터 `.app-sidenav`(SideNav 루트), `.app-rolebanner`(RoleBanner 루트) — Task 2, Task 7에서 이 클래스명을 그대로 사용한다.

- [ ] **Step 1: `SideNav.tsx`의 `<aside>` 루트에 클래스 추가**

`components/layout/SideNav.tsx`에서 `<aside` 로 시작하는 루트 엘리먼트를 찾아 `className` 속성을 추가한다(기존에 className이 없으면 새로 추가, 있으면 앞에 이어붙임):

```tsx
<aside
  className="app-sidenav"
  ...기존 props 유지...
>
```

- [ ] **Step 2: `RoleBanner.tsx`의 루트 `<div>`에 클래스 추가**

```tsx
export default function RoleBanner() {
  const role = useCurrentRole()
  const userName = useCurrentUserName()

  return (
    <div
      className="app-rolebanner"
      style={{
        padding: '5px 24px', background: '#eef1ff', borderBottom: '1px solid #dde1fb',
        fontSize: '0.68rem', color: '#4f46e5', display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
```

- [ ] **Step 3: 클래스가 실제로 존재하는지 확인**

Run: `grep -n "app-sidenav" components/layout/SideNav.tsx && grep -n "app-rolebanner" components/layout/RoleBanner.tsx`
Expected: 두 파일 모두 클래스명이 포함된 줄이 출력됨(각 1건 이상)

- [ ] **Step 4: 타입체크로 JSX 문법 오류 없는지 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없이 종료(코드 0). 기존에 이미 있던 무관한 에러가 있다면 이번 변경으로 새로 생긴 에러만 없으면 됨.

- [ ] **Step 5: Commit**

```bash
git add components/layout/SideNav.tsx components/layout/RoleBanner.tsx
git commit -m "feat: add print-scoping class hooks to SideNav and RoleBanner"
```

---

### Task 2: AI 보고서 전용 인쇄용 CSS 클래스 추가

**Files:**
- Modify: `app/globals.css` (기존 `.rpt-*` 클래스 블록 뒤, 현재 61번째 줄의 `@media print{...}` 앞/뒤)

**Interfaces:**
- Consumes: 없음 (순수 CSS)
- Produces: CSS 클래스 `.rpt-barlist-row`, `.rpt-barlist-top`, `.rpt-barlist-lbl`, `.rpt-barlist-val`, `.rpt-barlist-sub`, `.rpt-barlist-track`, `.rpt-barlist-bar`, `.rpt-slide`, `.rpt-slide-hd`, `.rpt-slide-note`, `.rpt-slide-grid`, `.rpt-slide-item`, `.rpt-action`, `.rpt-action-headline`, `.rpt-action-group`, `.rpt-action-group-h`, `.rpt-action-item` — Task 3(`buildReportPrintHTML`)에서 그대로 사용한다.

- [ ] **Step 1: 기존 `.rpt-footer` 규칙과 `@media print` 규칙 사이에 신규 클래스 추가**

`app/globals.css`의 다음 줄:
```css
.rpt-footer{text-align:center;font-size:8pt;color:#b0bac6;margin-top:28px;padding-top:10px;border-top:1px solid #e3e8ef}
@media print{@page{size:A4 portrait;margin:0}.rpt-page-break{break-before:page;page-break-before:always;padding-top:0}.rpt-sec{break-inside:avoid}.rpt-tbl tr{break-inside:avoid}.rpt-2col{break-inside:avoid}}
```
를 아래로 교체한다(기존 두 줄 + 신규 클래스 + 확장된 print 규칙):

```css
.rpt-footer{text-align:center;font-size:8pt;color:#b0bac6;margin-top:28px;padding-top:10px;border-top:1px solid #e3e8ef}
.rpt-barlist-row{margin-bottom:10px}
.rpt-barlist-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.rpt-barlist-lbl{font-size:9pt;color:#0a2540;font-weight:500}
.rpt-barlist-val{font-size:9pt;font-weight:700;color:#425466}
.rpt-barlist-sub{font-size:8pt;color:#697386;margin-right:6px}
.rpt-barlist-track{height:6px;background:#f0f4f8;border-radius:99px;overflow:hidden}
.rpt-barlist-bar{height:100%;border-radius:99px}
.rpt-slide{border:1px solid #e3e8ef;border-radius:10px;overflow:hidden;margin-bottom:12px}
.rpt-slide-hd{padding:9px 16px;display:flex;justify-content:space-between;align-items:center;color:#fff;font-size:9.5pt;font-weight:700}
.rpt-slide-note{font-size:7.5pt;background:rgba(255,255,255,.2);padding:2px 8px;border-radius:99px;font-weight:600}
.rpt-slide-grid{padding:10px 16px;display:grid;grid-template-columns:1fr 1fr;gap:2px 16px}
.rpt-slide-item{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f4f8;font-size:8.5pt}
.rpt-action{background:rgba(99,91,255,.04)}
.rpt-action-headline{font-size:9.5pt;color:#0a2540;line-height:1.7;margin-bottom:2px}
.rpt-action-group{margin-top:10px}
.rpt-action-group-h{font-size:8pt;font-weight:700;margin-bottom:4px}
.rpt-action-item{font-size:8.5pt;color:#425466;line-height:1.65}
@media print{@page{size:A4 portrait;margin:0}.rpt-page-break{break-before:page;page-break-before:always;padding-top:0}.rpt-sec{break-inside:avoid}.rpt-tbl tr{break-inside:avoid}.rpt-2col{break-inside:avoid}.rpt-kpi-row{break-inside:avoid}.rpt-barlist-row{break-inside:avoid}.rpt-slide{break-inside:avoid}}
```

- [ ] **Step 2: 신규 클래스가 실제로 추가됐는지 확인**

Run: `grep -c "rpt-slide-grid\|rpt-barlist-track\|rpt-action-group" app/globals.css`
Expected: `3` (세 클래스 모두 최소 1회 이상 등장)

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add AI report bar-list/slide-deck/action-plan print CSS classes"
```

---

### Task 3: 공용 HTML 빌더 — `lib/reportExportHtml.ts`

**Files:**
- Create: `lib/reportExportHtml.ts`

**Interfaces:**
- Consumes: `GeneratedReport`, `ReportSection`, `KpiItem`, `BarItem`, `TableRow`, `Slide` from `@/lib/aiReportService` (읽기 전용, 이미 정의됨)
- Produces:
  - `buildReportPrintHTML(report: GeneratedReport): string` — Task 6(PDF)에서 오프스크린 캡처 대상으로 사용
  - `fmtReportFilename(report: GeneratedReport, ext: string): string` — Task 4/5/6에서 파일명 생성에 공용으로 사용

- [ ] **Step 1: 파일 생성**

`lib/reportExportHtml.ts`:

```ts
import type { GeneratedReport, ReportSection } from '@/lib/aiReportService'

function fmtKRW(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`
  if (v >= 10_000) return `${Math.round(v / 10_000)}만원`
  if (v > 0) return `${v.toLocaleString()}원`
  return '-'
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const SLIDE_HEADER_COLORS = ['#1e3a5f', '#9f1239', '#3730a3', '#065f46', '#78350f']

function renderSection(section: ReportSection): string {
  if (section.type === 'kpi-grid' && section.kpiItems) {
    return `<div class="rpt-kpi-row">${section.kpiItems.map(item => `
      <div class="rpt-kpi" style="border-left:3px solid ${item.color ?? '#635bff'}">
        <div class="rpt-kpi-lbl">${esc(item.label)}</div>
        <div class="rpt-kpi-v">${esc(item.value)}</div>
        ${item.sub ? `<div class="rpt-kpi-u">${esc(item.sub)}</div>` : ''}
      </div>`).join('')}</div>`
  }
  if (section.type === 'bar-list' && section.barItems) {
    return `<div>${section.barItems.map(item => `
      <div class="rpt-barlist-row">
        <div class="rpt-barlist-top">
          <span class="rpt-barlist-lbl">${esc(item.label)}</span>
          <span class="rpt-barlist-val">${item.sub ? `<span class="rpt-barlist-sub">${esc(item.sub)}</span>` : ''}${item.value >= 10000 ? esc(fmtKRW(item.value)) : `${item.value}건`}</span>
        </div>
        <div class="rpt-barlist-track"><div class="rpt-barlist-bar" style="width:${item.pct}%;background:${item.color ?? '#635bff'}"></div></div>
      </div>`).join('')}</div>`
  }
  if (section.type === 'table' && section.tableHeaders && section.tableRows) {
    return `<table class="rpt-tbl">
      <thead><tr>${section.tableHeaders.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${section.tableRows.map(row => `<tr${row.highlight ? ' style="background:rgba(99,91,255,.05)"' : ''}>${row.cells.map((c, ci) => `<td${row.highlight && ci === 0 ? ' style="color:#635bff;font-weight:700"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`
  }
  if (section.type === 'slide-deck' && section.slides) {
    return section.slides.map(slide => {
      const hdrColor = SLIDE_HEADER_COLORS[slide.slideNumber - 1] ?? '#0a2540'
      return `<div class="rpt-slide">
        <div class="rpt-slide-hd" style="background:${hdrColor}">
          <span>${slide.slideNumber}. ${esc(slide.slideTitle)}</span>
          ${slide.note ? `<span class="rpt-slide-note">${esc(slide.note)}</span>` : ''}
        </div>
        <div class="rpt-slide-grid">${slide.items.map(item => `
          <div class="rpt-slide-item">
            <span>${esc(item.label)}</span>
            <span${item.accent ? ` style="color:${hdrColor};font-weight:700"` : ''}>${esc(item.value)}</span>
          </div>`).join('')}</div>
      </div>`
    }).join('')
  }
  return ''
}

export function buildReportPrintHTML(report: GeneratedReport): string {
  const sectionsHtml = report.sections.map(section => `
    <div class="rpt-sec">
      <div class="rpt-sec-h">${esc(section.title)}</div>
      ${renderSection(section)}
    </div>`).join('')

  const actionGroups: { label: string; color: string; items: string[] }[] = [
    { label: '즉시 조치 필요', color: '#be1044', items: report.actionPlan.immediateActions },
    { label: '비용 / 결제 리스크', color: '#B06B1A', items: report.actionPlan.costRisk },
    { label: '반복 발생 경고', color: '#635bff', items: report.actionPlan.recurringWarning },
    { label: '관리자 결재 필요', color: '#0F7850', items: report.actionPlan.approvalNeeded },
  ].filter(g => g.items.length > 0)

  return `<div class="rpt-a4">
    <div class="rpt-hd">
      <div class="rpt-hd-left">
        <div class="rpt-title">${esc(report.title)}</div>
        <div class="rpt-org">${esc(report.subtitle)}</div>
      </div>
      <div class="rpt-hd-right">
        <div class="rpt-hd-meta"><strong>기간</strong>&nbsp;${esc(report.period)}</div>
        <div class="rpt-hd-meta"><strong>생성일</strong>&nbsp;${esc(report.generatedAt)}</div>
        <div class="rpt-hd-meta"><strong>작성자</strong>&nbsp;${esc(report.preparedBy)}</div>
      </div>
    </div>
    <hr class="rpt-rule">
    ${sectionsHtml}
    <div class="rpt-sec rpt-action">
      <div class="rpt-sec-h">AI 종합 의견</div>
      <div>${report.actionPlan.headline.map(line => `<div class="rpt-action-headline">• ${esc(line)}</div>`).join('')}</div>
      ${actionGroups.map(g => `
        <div class="rpt-action-group">
          <div class="rpt-action-group-h" style="color:${g.color}">${g.label}</div>
          ${g.items.map(t => `<div class="rpt-action-item">· ${esc(t)}</div>`).join('')}
        </div>`).join('')}
    </div>
    <div class="rpt-sec">
      <div class="rpt-hd-meta">분석 대상: <strong>${report.metadata.totalDefects}건</strong> &nbsp;|&nbsp; 처리 완료율: <strong>${report.metadata.completionRate}%</strong> &nbsp;|&nbsp; 총 처리 비용: <strong>${esc(fmtKRW(report.metadata.totalCost))}</strong></div>
    </div>
    <div class="rpt-footer">대전충청검사센터 시설관리팀&nbsp;|&nbsp;AI 보고서&nbsp;|&nbsp;생성: ${esc(report.generatedAt)}</div>
  </div>`
}

export function fmtReportFilename(report: GeneratedReport, ext: string): string {
  const date = new Date().toISOString().slice(0, 10)
  return `AI보고서_${report.reportType}_${date}.${ext}`
}
```

- [ ] **Step 2: 스모크 스크립트 작성(스크래치패드, 커밋 안 함)**

`C:\Users\신민호\AppData\Local\Temp\claude\C--Users-----Desktop----------\beb92ae8-3e81-459b-abdc-f10c1cdca985\scratchpad\smoke-html.ts`:

```ts
import { buildReportPrintHTML, fmtReportFilename } from '../../../02_하자관리시스템/lib/reportExportHtml'
// 경로는 실제 프로젝트 절대 경로로 조정: 'C:/Users/신민호/Desktop/씨젠_핵심프로젝트/02_하자관리시스템/lib/reportExportHtml'
import type { GeneratedReport } from 'C:/Users/신민호/Desktop/씨젠_핵심프로젝트/02_하자관리시스템/lib/aiReportService'

const sample: GeneratedReport = {
  reportType: 'field-analysis',
  title: '분야별 분석 보고서', subtitle: '테스트', period: '2026년 7월 기준',
  generatedAt: '2026-07-12', preparedBy: '시설관리팀', basedOn: 'rule-based',
  sections: [
    { id: 'kpi', title: '요약', type: 'kpi-grid', kpiItems: [{ label: '전기', value: '12건', sub: '완료율 50%' }] },
    { id: 'bar', title: '빈도', type: 'bar-list', barItems: [{ label: '전기', value: 12, pct: 60, sub: '전체의 30%' }] },
    { id: 'tbl', title: '비용', type: 'table', tableHeaders: ['분야', '건수'], tableRows: [{ cells: ['전기', '12건'], highlight: true }] },
  ],
  actionPlan: { headline: ['테스트 헤드라인'], immediateActions: ['즉시조치 A'], costRisk: [], recurringWarning: [], approvalNeeded: [] },
  metadata: { totalDefects: 12, completionRate: 50, totalCost: 1000000 },
}

const html = buildReportPrintHTML(sample)
if (!html.includes('분야별 분석 보고서')) throw new Error('FAIL: title missing')
if (!html.includes('즉시조치 A')) throw new Error('FAIL: action item missing')
if (!html.includes('<table class="rpt-tbl">')) throw new Error('FAIL: table missing')
console.log('PASS filename:', fmtReportFilename(sample, 'pdf'))
```

- [ ] **Step 3: 스모크 스크립트가 실패하는지 먼저 확인(파일 생성 전 상태로)**

파일 생성 전에는 import 대상이 없으므로 아래 명령이 모듈 not found로 실패하는 것이 정상이다. (Step 1을 이미 완료했다면 이 단계는 건너뛰고 Step 4로 진행)

- [ ] **Step 4: 스모크 스크립트 실행 — 통과 확인**

Run (프로젝트 루트에서): `cd "C:\Users\신민호\Desktop\씨젠_핵심프로젝트\02_하자관리시스템" && npx tsx "C:\Users\신민호\AppData\Local\Temp\claude\C--Users-----Desktop----------\beb92ae8-3e81-459b-abdc-f10c1cdca985\scratchpad\smoke-html.ts"`
Expected: `PASS filename: AI보고서_field-analysis_2026-07-12.pdf` 출력, 에러 없음

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: Commit**

```bash
git add lib/reportExportHtml.ts
git commit -m "feat: add shared A4 HTML builder for AI report export"
```

---

### Task 4: Excel 다운로드 — `lib/reportExportExcel.ts`

**Files:**
- Create: `lib/reportExportExcel.ts`

**Interfaces:**
- Consumes: `GeneratedReport`, `ReportSection` from `@/lib/aiReportService`; `fmtReportFilename` from `@/lib/reportExportHtml`; `xlsx`(이미 설치됨)
- Produces: `downloadReportExcel(report: GeneratedReport): void` — Task 7에서 다운로드 버튼 핸들러로 사용

- [ ] **Step 1: 파일 생성**

`lib/reportExportExcel.ts`:

```ts
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
```

- [ ] **Step 2: 스모크 스크립트 작성(스크래치패드)**

`downloadReportExcel`은 `XLSX.writeFile`(다운로드 트리거)까지 호출하는데, Node의 `xlsx` 패키지는 파일시스템에 직접 쓰는 폴백을 제공하므로 `npx tsx`로 그대로 실행해 예외 없이 끝나는지 확인한다:

`.../scratchpad/smoke-excel.ts`:

```ts
import { downloadReportExcel } from 'C:/Users/신민호/Desktop/씨젠_핵심프로젝트/02_하자관리시스템/lib/reportExportExcel'
import type { GeneratedReport } from 'C:/Users/신민호/Desktop/씨젠_핵심프로젝트/02_하자관리시스템/lib/aiReportService'

const sample: GeneratedReport = {
  reportType: 'budget-settlement', title: '예산 정산 보고서', subtitle: '테스트', period: '2026년 7월',
  generatedAt: '2026-07-12', preparedBy: '시설관리팀', basedOn: 'rule-based',
  sections: [{ id: 'kpi', title: '예산 요약', type: 'kpi-grid', kpiItems: [{ label: '총비용', value: '1,000,000원' }] }],
  actionPlan: { headline: ['헤드라인'], immediateActions: [], costRisk: ['비용 리스크 A'], recurringWarning: [], approvalNeeded: [] },
  metadata: { totalDefects: 5, completionRate: 80, totalCost: 1000000 },
}

downloadReportExcel(sample) // Node에는 XLSX.writeFile의 파일시스템 폴백이 있어 로컬에 .xlsx가 생성됨
console.log('PASS: downloadReportExcel executed without throwing')
```

- [ ] **Step 3: 실행 확인**

Run: `cd "C:\Users\신민호\Desktop\씨젠_핵심프로젝트\02_하자관리시스템" && npx tsx ".../scratchpad/smoke-excel.ts"`
Expected: `PASS: downloadReportExcel executed without throwing` 출력, 현재 디렉터리에 `AI보고서_budget-settlement_2026-07-12.xlsx` 파일 생성됨 (생성 확인 후 삭제해도 무방)

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: Commit**

```bash
git add lib/reportExportExcel.ts
git commit -m "feat: add AI report Excel export"
```

---

### Task 5: Word(.docx) 다운로드 — `lib/reportExportWord.ts`

**Files:**
- Create: `lib/reportExportWord.ts`
- Modify: `package.json` (docx 의존성 추가, `npm install`로 자동 반영)

**Interfaces:**
- Consumes: `GeneratedReport`, `ReportSection` from `@/lib/aiReportService`; `fmtReportFilename` from `@/lib/reportExportHtml`; `docx` 패키지
- Produces:
  - `buildReportDocxDocument(report: GeneratedReport): Document` (docx의 `Document`) — Node/브라우저 모두에서 순수 생성 가능, 스모크 테스트 대상
  - `downloadReportWord(report: GeneratedReport): Promise<void>` — Task 7에서 다운로드 버튼 핸들러로 사용(브라우저 전용, `Packer.toBlob` 사용)

- [ ] **Step 1: `docx` 패키지 설치**

Run: `npm install docx`
Expected: `package.json` dependencies에 `"docx": "^..."` 추가됨

- [ ] **Step 2: 파일 생성**

`lib/reportExportWord.ts`:

```ts
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
```

- [ ] **Step 3: 스모크 스크립트 작성(스크래치패드)**

`.../scratchpad/smoke-word.ts`:

```ts
import { Packer } from 'docx'
import { buildReportDocxDocument } from 'C:/Users/신민호/Desktop/씨젠_핵심프로젝트/02_하자관리시스템/lib/reportExportWord'
import type { GeneratedReport } from 'C:/Users/신민호/Desktop/씨젠_핵심프로젝트/02_하자관리시스템/lib/aiReportService'

const sample: GeneratedReport = {
  reportType: 'executive-ppt', title: '경영진 보고용 PT', subtitle: '테스트', period: '2026년 7월',
  generatedAt: '2026-07-12', preparedBy: '시설관리팀', basedOn: 'rule-based',
  sections: [{
    id: 'slides', title: '경영진 보고 슬라이드', type: 'slide-deck',
    slides: [{ slideNumber: 1, slideTitle: '종합 현황', items: [{ label: '전체', value: '10건', accent: true }] }],
  }],
  actionPlan: { headline: ['헤드라인'], immediateActions: [], costRisk: [], recurringWarning: [], approvalNeeded: [] },
  metadata: { totalDefects: 10, completionRate: 70, totalCost: 500000 },
}

async function main() {
  const doc = buildReportDocxDocument(sample)
  const buf = await Packer.toBuffer(doc)
  if (buf.length === 0) throw new Error('FAIL: empty docx buffer')
  console.log('PASS: docx buffer length =', buf.length)
}
main()
```

- [ ] **Step 4: 실행 확인**

Run: `cd "C:\Users\신민호\Desktop\씨젠_핵심프로젝트\02_하자관리시스템" && npx tsx ".../scratchpad/smoke-word.ts"`
Expected: `PASS: docx buffer length = <0보다 큰 숫자>` 출력

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: Commit**

```bash
git add lib/reportExportWord.ts package.json package-lock.json
git commit -m "feat: add AI report Word(.docx) export via docx package"
```

---

### Task 6: PDF 다운로드 — `lib/reportExportPdf.ts`

**Files:**
- Create: `lib/reportExportPdf.ts`
- Modify: `package.json` (jspdf, html2canvas 의존성 추가)

**Interfaces:**
- Consumes: `GeneratedReport` from `@/lib/aiReportService`; `buildReportPrintHTML`, `fmtReportFilename` from `@/lib/reportExportHtml`; `jspdf`, `html2canvas` 패키지
- Produces:
  - `computePageBreaks(atomicTops: number[], canvasHeight: number, pageHeightPx: number): number[]` — 순수 함수, 오름차순 슬라이스 종료 지점 배열(마지막 값 = canvasHeight) 반환. 스모크 테스트 대상.
  - `downloadReportPDF(report: GeneratedReport): Promise<void>` — Task 7에서 다운로드 버튼 핸들러로 사용(브라우저 전용, Task 9 Playwright로 최종 검증)

- [ ] **Step 1: 패키지 설치**

Run: `npm install jspdf html2canvas`
Expected: `package.json` dependencies에 `jspdf`, `html2canvas` 추가됨

- [ ] **Step 2: 파일 생성**

`lib/reportExportPdf.ts`:

```ts
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { GeneratedReport } from '@/lib/aiReportService'
import { buildReportPrintHTML, fmtReportFilename } from '@/lib/reportExportHtml'

export const A4_WIDTH_PX = 794   // 210mm @ 96dpi
export const A4_HEIGHT_PX = 1123 // 297mm @ 96dpi

/**
 * atomicTops: 페이지 중간에서 잘리면 안 되는 요소(섹션/카드/슬라이드/표 행)들의
 *   캔버스 기준 top 좌표(오름차순 아닐 수 있음, 내부에서 정렬).
 * canvasHeight: 전체 캡처된 캔버스 높이(px)
 * pageHeightPx: 한 페이지에 들어갈 수 있는 높이(px, 캔버스 스케일 반영됨)
 * 반환값: 각 페이지의 종료 y좌표 오름차순 배열. 마지막 원소는 항상 canvasHeight.
 */
export function computePageBreaks(atomicTops: number[], canvasHeight: number, pageHeightPx: number): number[] {
  const sortedTops = [...atomicTops].sort((a, b) => a - b)
  const breaks: number[] = []
  let sliceStart = 0
  while (sliceStart < canvasHeight - 1) {
    const hardLimit = Math.min(sliceStart + pageHeightPx, canvasHeight)
    if (hardLimit >= canvasHeight) {
      breaks.push(canvasHeight)
      break
    }
    const candidates = sortedTops.filter(t => t > sliceStart + 1 && t <= hardLimit)
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

- [ ] **Step 3: `computePageBreaks` 스모크 스크립트 작성(스크래치패드)**

`.../scratchpad/smoke-pdf.ts`:

```ts
import { computePageBreaks } from 'C:/Users/신민호/Desktop/씨젠_핵심프로젝트/02_하자관리시스템/lib/reportExportPdf'

// 케이스 1: 섹션 경계가 페이지 경계 근처에 있으면 그 경계에서 잘라야 함
const breaks1 = computePageBreaks([0, 500, 1150, 2000], 2400, 1200)
if (breaks1[0] !== 1150) throw new Error(`FAIL case1: expected first break 1150, got ${breaks1[0]}`)
if (breaks1[breaks1.length - 1] !== 2400) throw new Error('FAIL case1: last break must equal canvasHeight')

// 케이스 2: 경계 후보가 전혀 없으면 하드컷
const breaks2 = computePageBreaks([], 3000, 1000)
if (breaks2.join(',') !== '1000,2000,3000') throw new Error(`FAIL case2: got ${breaks2.join(',')}`)

// 케이스 3: 캔버스가 한 페이지보다 작으면 페이지 1개
const breaks3 = computePageBreaks([100, 200], 900, 1200)
if (breaks3.join(',') !== '900') throw new Error(`FAIL case3: got ${breaks3.join(',')}`)

console.log('PASS: all computePageBreaks cases')
```

- [ ] **Step 4: 실행 확인**

Run: `cd "C:\Users\신민호\Desktop\씨젠_핵심프로젝트\02_하자관리시스템" && npx tsx ".../scratchpad/smoke-pdf.ts"`
Expected: `PASS: all computePageBreaks cases` 출력

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (`downloadReportPDF`는 브라우저 DOM API에 의존하므로 Node 스모크 대상에서 제외, Task 9 Playwright에서 실제 다운로드로 검증)

- [ ] **Step 6: Commit**

```bash
git add lib/reportExportPdf.ts package.json package-lock.json
git commit -m "feat: add AI report PDF export with section-aware page breaks"
```

---

### Task 7: `app/reports/ai/page.tsx` 연결 — 다운로드 버튼, 인쇄 버튼, 인쇄 CSS

**Files:**
- Modify: `app/reports/ai/page.tsx`

**Interfaces:**
- Consumes: `downloadReportPDF` from `@/lib/reportExportPdf`, `downloadReportExcel` from `@/lib/reportExportExcel`, `downloadReportWord` from `@/lib/reportExportWord`
- Produces: 없음(최종 UI 조립)

- [ ] **Step 1: import 추가**

`app/reports/ai/page.tsx` 상단 import 블록에 추가:

```tsx
import { downloadReportPDF } from '@/lib/reportExportPdf'
import { downloadReportExcel } from '@/lib/reportExportExcel'
import { downloadReportWord } from '@/lib/reportExportWord'
```

- [ ] **Step 2: 다운로드/인쇄 로딩 상태 추가**

`AiReportPage` 컴포넌트 내 기존 `const [report, setReport] = useState<GeneratedReport | null>(null)` 아래에 추가:

```tsx
const [pdfLoading, setPdfLoading] = useState(false)
const [wordLoading, setWordLoading] = useState(false)
```

- [ ] **Step 3: 다운로드 핸들러 추가**

`handleGenerate` 함수 아래에 추가:

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

function handleDownloadExcel() {
  if (!report) return
  try {
    downloadReportExcel(report)
  } catch (err) {
    console.error(err)
    alert('Excel 생성 중 오류가 발생했습니다.')
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

function handlePrint() {
  window.print()
}
```

- [ ] **Step 4: 페이지 최상위 반환문에 인쇄 전용 `<style>` 추가**

`return (` 바로 다음 줄(`<div style={{ minHeight: '100vh', background: '#f5f7fa' }}>` 바로 앞)에 추가:

```tsx
<style>{`
  @media print {
    .app-sidenav, .app-rolebanner, .no-print { display: none !important; }
    body { background: #fff !important; }
    .rpt-print-area { padding: 0 !important; max-width: none !important; margin: 0 !important; }
  }
`}</style>
```

- [ ] **Step 5: 조작 영역(유형 선택 + 생성 버튼)에 `no-print` 클래스 부여**

기존:
```tsx
{/* ── Report type selection ── */}
<div style={{ marginBottom: 22 }}>
```
를:
```tsx
{/* ── Report type selection ── */}
<div className="no-print" style={{ marginBottom: 22 }}>
```
로, 그리고 바로 다음의:
```tsx
{/* ── Generate button ── */}
<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
```
를:
```tsx
{/* ── Generate button ── */}
<div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
```
로 변경한다.

- [ ] **Step 6: 로딩 상태 블록에도 `no-print` 부여**

```tsx
{/* ── Loading state ── */}
{loading && (
  <div className="no-print" style={{ background: '#fff', ... }}>
```

- [ ] **Step 7: 보고서 미리보기 전체를 `rpt-print-area`로 감싸고 다운로드/인쇄 버튼 교체**

기존:
```tsx
{/* ── Report preview ── */}
{report && !loading && (
  <div>
```
를:
```tsx
{/* ── Report preview ── */}
{report && !loading && (
  <div className="rpt-print-area">
```
로 변경.

기존 다운로드 버튼 블록(`{/* Download stubs */}` 부터 해당 `</div>` 까지):
```tsx
{/* Download stubs */}
<div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
  {[
    { icon: 'fa-solid fa-file-pdf',   label: 'PDF',  color: '#e11d48' },
    { icon: 'fa-solid fa-file-excel', label: 'Excel', color: '#059669' },
    { icon: 'fa-solid fa-file-word',  label: 'Word', color: '#2563eb' },
  ].map(btn => (
    <button
      key={btn.label}
      onClick={() => alert(`${btn.label} 다운로드는 추후 지원 예정입니다.`)}
      title={`${btn.label} 다운로드 (준비 중)`}
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: 'pointer', fontSize: '0.71rem', color: '#697386' }}
    >
      <i className={btn.icon} style={{ color: btn.color, fontSize: 13 }} />
      {btn.label}
    </button>
  ))}
</div>
```

를 다음으로 교체:

```tsx
{/* Download & print actions */}
<div className="no-print" style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
  <button
    onClick={handleDownloadPDF}
    disabled={pdfLoading}
    title="PDF 다운로드"
    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: pdfLoading ? 'not-allowed' : 'pointer', fontSize: '0.71rem', color: '#425466', opacity: pdfLoading ? 0.6 : 1 }}
  >
    <i className={pdfLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-pdf'} style={{ color: '#e11d48', fontSize: 13 }} />
    PDF
  </button>
  <button
    onClick={handleDownloadExcel}
    title="Excel 다운로드"
    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: 'pointer', fontSize: '0.71rem', color: '#425466' }}
  >
    <i className="fa-solid fa-file-excel" style={{ color: '#059669', fontSize: 13 }} />
    Excel
  </button>
  <button
    onClick={handleDownloadWord}
    disabled={wordLoading}
    title="Word 다운로드"
    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: wordLoading ? 'not-allowed' : 'pointer', fontSize: '0.71rem', color: '#425466', opacity: wordLoading ? 0.6 : 1 }}
  >
    <i className={wordLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-word'} style={{ color: '#2563eb', fontSize: 13 }} />
    Word
  </button>
  <button
    onClick={handlePrint}
    title="인쇄"
    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: 'pointer', fontSize: '0.71rem', color: '#425466' }}
  >
    <i className="fa-solid fa-print" style={{ color: '#0d1f35', fontSize: 13 }} />
    인쇄
  </button>
</div>
```

- [ ] **Step 8: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 9: 개발 서버로 수동 확인**

Run: `npm run dev` (백그라운드 실행)
브라우저로 `http://localhost:3000/reports/ai` 접속 → 유형 선택 → "보고서 생성하기" → PDF/Excel/Word 버튼이 더 이상 alert을 띄우지 않고 각각 파일 다운로드를 시도하는지, "인쇄" 버튼이 보이는지 육안 확인. (전체 6종 회귀 확인은 Task 9에서 Playwright로 수행)

- [ ] **Step 10: Commit**

```bash
git add app/reports/ai/page.tsx
git commit -m "feat: wire up real PDF/Excel/Word export and in-place print for AI reports"
```

---

### Task 8: 전체 타입체크 + 프로덕션 빌드 게이트

**Files:** 없음(검증 전용)

**Interfaces:**
- Consumes: Task 1~7의 모든 변경사항
- Produces: 없음

- [ ] **Step 1: 전체 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없이 종료(코드 0)

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: `Compiled successfully` 및 `/reports/ai` 라우트가 빌드 결과 라우트 목록에 정상 표시됨, 빌드 실패 없음

- [ ] **Step 3: 빌드 산출물에 신규 의존성이 포함됐는지 간단 확인**

Run: `grep -rl "jsPDF\|html2canvas" .next/static/chunks 2>/dev/null | head -3`
Expected: 최소 1개 이상의 청크 파일에서 매치 (번들에 포함되어 있음을 의미)

- [ ] **Step 4: Commit(빌드 산출물은 커밋하지 않음 — 검증 전용 Task이므로 커밋 없음)**

이 Task는 코드 변경이 없으므로 별도 커밋 없음. Task 8 통과가 Task 9 진입 조건이다.

---

### Task 9: Playwright(MCP)로 6개 보고서 유형 × PDF/Excel/Word/인쇄 실측 QA

**Files:** 없음(검증 전용, 코드/문서 변경 없음)

**Interfaces:**
- Consumes: Task 1~8 결과물 전체
- Produces: QA 결과 요약(사용자에게 보고), 실패 발견 시 해당 Task로 회귀하여 수정

이 프로젝트에는 커밋된 Playwright 테스트 스위트가 없으므로, Playwright MCP 브라우저 도구로 개발 서버(`npm run dev`, `http://localhost:3000/reports/ai`)를 직접 조작하며 검증한다.

- [ ] **Step 1: 개발 서버 기동 확인**

Run: `npm run dev` (백그라운드), 브라우저로 `http://localhost:3000/reports/ai` 접속 확인

- [ ] **Step 2: 6개 유형 각각에 대해 반복**

유형 목록: `field-analysis`, `budget-settlement`, `executive-ppt`, `recurring-defects`, `cost-bearer`, `defect-classification`

각 유형마다:
1. 유형 카드 클릭 → "보고서 생성하기" 클릭 → "생성 완료" 텍스트 노출 확인
2. PDF 버튼 클릭 → 다운로드 이벤트 발생 확인, 저장된 파일 확장자 `.pdf` 및 크기 > 0 확인
3. Excel 버튼 클릭 → 다운로드 이벤트 발생 확인, 확장자 `.xlsx` 및 크기 > 0 확인
4. Word 버튼 클릭 → 다운로드 이벤트 발생 확인, 확장자 `.docx` 및 크기 > 0 확인
5. `page.emulateMedia({ media: 'print' })` 적용 후 스크린샷 캡처 → 사이드바/역할배너/유형선택/생성버튼/다운로드버튼이 보이지 않고 보고서 본문만 보이는지 확인 → `page.emulateMedia({ media: 'screen' })`로 원복

- [ ] **Step 3: 실패 항목 있으면 해당 Task(3~7)로 돌아가 수정 후 Task 8부터 재검증**

- [ ] **Step 4: 결과 요약을 사용자에게 보고**

각 유형별 PDF/Excel/Word/인쇄 통과 여부, `tsc`/`build` 결과, 발견된 이슈와 수정 내역을 정리해 보고한다. **QA 전 항목이 모두 통과하기 전에는 배포하지 않는다.**
