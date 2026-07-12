# AI 보고서 PDF·Excel·Word 다운로드 및 인쇄 기능 — 설계 스펙

- 작성일: 2026-07-12
- 대상 화면: `/reports/ai` (`app/reports/ai/page.tsx`)
- 배포: https://hazard-management-seegene.vercel.app/reports/ai

## 1. 배경 / 목표

현재 `app/reports/ai/page.tsx`의 PDF/Excel/Word 버튼은 클릭 시 `alert('추후 지원 예정입니다.')`만 띄우는 스텁이다. "보고서 생성하기"로 만들어진 단일 `GeneratedReport`(`report` state)를 실제 PDF·XLSX·DOCX 파일로 다운로드할 수 있게 하고, 별도 인쇄 버튼을 추가해 사이드바·조작영역을 제외한 보고서 본문만 A4로 인쇄되도록 한다.

같은 코드베이스의 `app/reports/page.tsx`(일반 "보고서" 화면)에 이미 유사한 PDF(html2pdf.js CDN)/Excel(xlsx)/Word(HTML→.doc)/인쇄(새 창) 구현이 있으나, 이번 작업은 다음 두 가지를 개선한다(사용자 확인 완료):
1. Word는 `docx` npm 패키지로 **진짜 .docx**(OOXML) 생성 — 기존처럼 HTML을 `.doc`로 감싸는 방식 아님.
2. PDF는 `jsPDF` + `html2canvas`를 **npm 설치**해 사용 — 기존처럼 CDN 런타임 로드 방식 아님.
3. 인쇄는 새 창을 띄우지 않고, **현재 화면에서** 사이드바/역할배너/조작영역만 숨기고 보고서 본문을 인쇄한다 (기존 `reports/page.tsx`는 새 창을 띄우는 방식이라 이 부분은 참고하지 않음).

## 2. 데이터 모델 (변경 없음)

`lib/aiReportService.ts`의 `GeneratedReport`를 그대로 사용한다:

```ts
interface GeneratedReport {
  reportType: ReportType
  title: string; subtitle: string; period: string; generatedAt: string
  sections: ReportSection[]        // kpi-grid | bar-list | table | slide-deck
  actionPlan: ActionPlanOpinion
  basedOn: 'rule-based' | 'llm'
  metadata: { totalDefects: number; completionRate: number; totalCost: number }
  preparedBy: string
}
```

PDF/Excel/Word/인쇄 4개 기능 모두 화면에 이미 표시된 동일한 `report` 객체 하나만 입력으로 받는다 (재계산·재호출 없음).

## 3. 신규 모듈: `lib/reportExport.ts`

섹션 렌더링 로직을 3가지 출력 포맷이 공유할 수 있도록 다음 함수들을 순수 함수로 분리한다.

### 3.1 `buildReportPrintHTML(report: GeneratedReport): string`
- 화면에 렌더링되는 순서(헤더 카드 → `sections` 각각 → AI 종합의견 → 메타데이터 푸터)를 그대로 A4 인쇄용 HTML 문자열로 만든다.
- 기존 `app/globals.css`의 `.rpt-*` 클래스 패밀리(`.rpt-a4`, `.rpt-hd`, `.rpt-sec`, `.rpt-tbl` 등)를 그대로 재사용하고, AI 보고서 전용 섹션 타입을 위해 아래 클래스를 `globals.css`에 추가한다:
  - `.rpt-barlist-row` / `.rpt-barlist-bar` — `bar-list` 섹션(라벨+값 위, 전체 너비 막대 아래) 표현용. 기존 `.rpt-bar-wrap`(인라인 소형 바)과는 레이아웃이 달라 별도 클래스 필요.
  - `.rpt-slide` / `.rpt-slide-hd` / `.rpt-slide-grid` — `slide-deck` 섹션(경영진 PT 5장)의 카드형 표현용.
  - `.rpt-action` 계열 — AI 종합의견(headline/immediateActions/costRisk/recurringWarning/approvalNeeded) 표현용.
- 페이지 분할 관련 CSS(공용, 이미 존재):
  ```css
  @media print{
    @page{size:A4 portrait;margin:0}
    .rpt-sec{break-inside:avoid}
    .rpt-tbl tr{break-inside:avoid}
    .rpt-barlist-row{break-inside:avoid}
    .rpt-slide{break-inside:avoid}
    .rpt-kpi-row{break-inside:avoid}
  }
  ```
  표/카드/막대 섹션은 `break-inside:avoid`로 페이지 경계에서 잘리지 않도록 하고, 섹션이 페이지 하단에 다 들어가지 못하면 통째로 다음 페이지로 넘어간다(자연 분할).

### 3.2 PDF — `downloadReportPDF(report: GeneratedReport): Promise<void>`
- 패키지: `jspdf`, `html2canvas` (신규 npm 설치, devDependencies 아님 — 런타임에 사용되므로 dependencies).
- 동작:
  1. `buildReportPrintHTML(report)`를 화면 밖(`position:absolute; left:-9999px`) 컨테이너에 삽입, 폭을 210mm(px 환산, 예: 794px @96dpi 또는 mm 단위 렌더 후 canvas 변환)로 고정.
  2. `html2canvas(el, { scale: 2, useCORS: true })`로 전체 컨테이너를 하나의 캔버스로 캡처.
  3. 캔버스를 297mm(A4 세로 높이)에 해당하는 px 단위로 분할해 `jsPDF`에 페이지 단위로 `addImage` — 이미 `break-inside:avoid`로 섹션 내부가 안 잘리게 CSS 처리되어 있으므로, 슬라이스 경계가 섹션 내부와 겹치지 않는지 여백을 검사해(섹션 DOM `getBoundingClientRect()` 기준) 필요 시 슬라이스 위치를 섹션 상단으로 당겨 빈 여백을 남기고 다음 페이지로 넘긴다.
  4. `pdf.save(`AI보고서_${report.reportType}_${날짜}.pdf`)`.
  5. `try/finally`로 임시 DOM 정리, 실패 시 `alert`로 사용자에게 안내.

### 3.3 Excel — `downloadReportExcel(report: GeneratedReport): void`
- 패키지: `xlsx` (이미 설치됨, 신규 설치 불필요).
- 시트 1장(요약) 구성:
  - 제목/부제/기간/생성일/작성자
  - 각 섹션을 타입별로 표 변환:
    - `kpi-grid` → `[라벨, 값, 부가설명]` 표
    - `bar-list` → `[라벨, 값, 비율(%), 부가설명]` 표
    - `table` → `tableHeaders` + `tableRows.cells` 그대로
    - `slide-deck` → 슬라이드별로 `[슬라이드 제목]` 소제목 행 + `[항목라벨, 값]` 표
  - AI 종합의견(`actionPlan`)의 headline/immediateActions/costRisk/recurringWarning/approvalNeeded를 구분 제목과 함께 텍스트 행으로 추가
  - 메타데이터(총 하자 건수/완료율/총 비용) 마지막 행
- 파일명: `AI보고서_${report.reportType}_${날짜}.xlsx`

### 3.4 Word — `downloadReportWord(report: GeneratedReport): Promise<void>`
- 패키지: `docx` (신규 npm 설치).
- 진짜 `.docx`(OOXML) 생성. `Document` → 1개 `Section`, A4 페이지 크기(`Page.Size.A4`, portrait) 지정.
- 구성 요소 매핑:
  - 제목/부제/기간/생성일/작성자 → `Heading1` + `Paragraph`
  - `kpi-grid` → `Table`(N열, 라벨/값/부가설명 셀에 배경색(`shading`) 적용)
  - `bar-list` → `Table`(라벨 | 값 | 비율 | 문자 기반 막대 `"■".repeat(n) + "□".repeat(10-n)`를 해당 섹션 색상으로 착색한 `TextRun`)
  - `table` → `Table` 그대로(헤더 행 배경 회색, `highlight` 행 텍스트 강조색)
  - `slide-deck` → 슬라이드별 `Heading2`(슬라이드 제목) + 2열 `Table`(항목 라벨/값)
  - AI 종합의견 → `Heading2` + 구분별 불릿 리스트(`Paragraph` with bullet numbering)
  - 각 `Table`/섹션 블록에 `Paragraph`의 `keepLines: true`, `keepNext: true`를 적용해 표/카드 내부가 페이지 경계에서 분리되지 않도록 함(자연 분할, 강제 페이지 나눔 없음).
- 파일명: `AI보고서_${report.reportType}_${날짜}.docx`, `Packer.toBlob()` → `URL.createObjectURL` → 다운로드.

## 4. 인쇄 기능 (사이드바/조작영역 숨김)

- `components/layout/SideNav.tsx`의 최상위 `<aside>`에 `className="app-sidenav"` 추가.
- `components/layout/RoleBanner.tsx`의 최상위 `<div>`에 `className="app-rolebanner"` 추가.
- `app/reports/ai/page.tsx`에서:
  - 보고서 유형 선택 카드 + "보고서 생성하기" 버튼 영역을 `className="no-print"`로 감쌈.
  - 보고서 미리보기 전체(헤더 카드~메타데이터 푸터)를 `className="rpt-print-area"`로 감쌈.
  - 헤더의 다운로드 버튼 그룹(PDF/Excel/Word) 옆에 "인쇄" 버튼 추가, 클릭 시 `window.print()` 호출. 버튼 자체도 `no-print`에 포함되어 인쇄물에는 나타나지 않음.
  - 페이지 컴포넌트 내부에 이 페이지가 마운트된 동안만 적용되는 `<style>` 삽입:
    ```css
    @media print {
      .app-sidenav, .app-rolebanner, .no-print { display: none !important; }
      body { background: #fff !important; }
      .rpt-print-area { padding: 0; max-width: none; }
    }
    ```
  - React 컴포넌트에 종속된 `<style>` 태그이므로 다른 라우트로 이동하면 자동으로 사라져 전역 인쇄 스타일을 오염시키지 않음.
- 새 창(`window.open`)을 띄우지 않고 현재 문서를 그대로 인쇄하므로 팝업 차단 이슈가 없다.

## 5. UI 변경 (`app/reports/ai/page.tsx`)

- 다운로드 버튼 3개의 `onClick={() => alert(...)}` 스텁 제거 → 각각 `downloadReportPDF(report)` / `downloadReportExcel(report)` / `downloadReportWord(report)` 호출.
- PDF/Word는 비동기이므로 버튼에 개별 로딩 스피너 상태(`pdfLoading`, `wordLoading`) 추가, 진행 중 중복 클릭 방지.
- "인쇄" 버튼 신규 추가(PDF/Excel/Word 옆).
- 실패 시 `alert`로 사용자에게 안내(다른 페이지의 기존 관례와 동일).

## 6. 에러 처리

- `report`가 없으면(아직 생성 전) 버튼 자체가 렌더링되지 않음(현재도 `report && !loading` 블록 안에서만 버튼이 보임 — 동일 유지).
- html2canvas/jsPDF 실패, docx Packer 실패 시 `try/catch` + `alert('OO 생성 중 오류가 발생했습니다.')`, `console.error`로 원인 로깅.
- 임시로 DOM에 추가한 오프스크린 컨테이너는 `finally`에서 항상 제거.

## 7. 신규 의존성

`package.json` dependencies 추가: `jspdf`, `html2canvas`, `docx`.

## 8. 테스트 계획

1. `npx tsc --noEmit` — 타입 오류 없음 확인
2. `npm run build` — 빌드 성공 확인
3. Playwright(`.playwright-mcp` 기존 활용 또는 신규 스펙 파일)로 6개 보고서 유형(`field-analysis`, `budget-settlement`, `executive-ppt`, `recurring-defects`, `cost-bearer`, `defect-classification`) 각각에 대해:
   - 유형 선택 → "보고서 생성하기" 클릭 → 결과 렌더 확인
   - PDF 다운로드 클릭 → 다운로드 이벤트 캡처, 파일 확장자(`.pdf`)와 0바이트 초과 확인
   - Excel 다운로드 클릭 → `.xlsx` 다운로드 확인
   - Word 다운로드 클릭 → `.docx` 다운로드 확인
   - 인쇄 버튼 클릭 전 `page.emulateMedia({ media: 'print' })`로 전환 후 스크린샷 — 사이드바/역할배너/조작영역이 안 보이고 보고서 본문만 보이는지 시각 확인
4. 모든 테스트 통과(QA 완료) 전에는 `vercel --prod` 등 배포 명령 실행 금지.

## 9. 범위 밖

- LLM 실시간 연동(현재 rule-based 유지, 관련 없음)
- 기존 `app/reports/page.tsx`(일반 보고서 화면)의 PDF/Excel/Word 방식 변경 — 이번 작업 대상 아님(그대로 둠)
- 이메일 발송 등 배포/공유 기능 — 요청 범위 밖
