# AI 보고서 "보고기간 설정" 기능 — 설계 스펙

- 작성일: 2026-07-12
- 대상 화면: `/reports/ai` (`app/reports/ai/page.tsx`)

## 1. 배경 / 목표

현재 AI 보고서 화면(`/reports/ai`)은 보고서 유형만 선택할 수 있고 기간 개념이 없어, `lib/aiReportService.ts`의 `generateReport()`가 `state.defects` 전체(삭제되지 않은 전체 누적 데이터)를 그대로 집계한다. 화면·PDF·Excel·Word·인쇄가 언제 기준으로 만들어진 데이터인지 알 수 없다는 문제를 해결하기 위해, 보고서 유형 선택 전에 "보고기간"을 먼저 지정하고, 그 기간에 해당하는 하자만 집계·표시·다운로드되도록 한다.

## 2. 범위

**수정 파일(3개만):**
- `app/reports/ai/page.tsx` — 보고기간 설정 UI, 상태 관리, 유효성 검사, 재생성 필요 배너, 데이터 없음 처리
- `lib/aiReportService.ts` — `ReportInput.period` 추가, 단일 필터 지점(`mockGenerate` 진입부)에서 기준일로 defects 필터링, 헤더 표시용 필드(`period` 라벨, `aggBasis`, `periodFilenameSuffix`) 추가, `generateActionPlanOpinion`에 **선택적** `periodLabel` 파라미터 추가
- `lib/reportExportHtml.ts` — `fmtReportFilename()`을 "생성일" 기준에서 "보고서의 기준기간" 기준으로 변경

**절대 수정 안 함:**
- `app/reports/page.tsx`(일반 보고서), `app/analytics/page.tsx`(집계현황), `app/dashboard/page.tsx`(대시보드 — `generateActionPlanOpinion`을 인자 없이 그대로 호출 중이며, 이 화면의 출력 문구는 한 글자도 바뀌면 안 됨)
- `lib/reportExportPdf.ts`, `lib/reportExportExcel.ts`, `lib/reportExportWord.ts` — 이미 화면의 단일 `report` state를 그대로 받아 렌더링하는 구조이므로, `report` 안의 필드(`period`, `aggBasis`, `periodFilenameSuffix`, `metadata.totalDefects===0`)만 늘어나면 이 3개 파일은 무수정으로 요구사항을 만족한다. (단, `metadata.totalDefects === 0`일 때 다운로드 버튼 자체를 비활성화하는 조건은 `page.tsx` 쪽에서 처리 — 이 3개 파일 내부에는 빈 리포트 방어 로직을 추가하지 않는다.)
- 운영관리현황시스템, seegene-ops-dashboard, 에너지 사용량 분석, 점검현황, 외주업체관리 관련 프로젝트 — 전혀 손대지 않음(애초에 다른 프로젝트 디렉터리)

## 3. 기간 유형 및 UI

`보고서 유형 선택` 카드 **위에** `보고기간 설정` 카드를 추가한다.

```
보고기간 설정
[전체] [연도별] [월별] [일별] [사용자 지정]
(유형별 입력 컨트롤)
[이번 달] [지난 달] [올해] [최근 30일]
```

- 선택된 기간 유형 버튼: 인디고 배경(`#635bff`) 강조 — 기존 보고서 유형 카드의 활성 스타일과 톤 일치.
- 기간 유형별 입력:
  - **전체**: 추가 입력 없음. `from=null, to=null`.
  - **연도별**: 연도 드롭다운(현재연도, 현재연도-1, -2, -3 총 4개). `from={year}-01-01`, `to={year}-12-31`.
  - **월별**: 연도 드롭다운(위와 동일 4개) + 월 드롭다운(1~12). `from={year}-{month:02}-01`, `to={year}-{month:02}-{해당월마지막일}`.
  - **일별**: `<input type="date">` 1개. `from=to=선택일`.
  - **사용자 지정**: `<input type="date">` 2개(시작/종료) — `app/analytics/page.tsx`가 이미 쓰는 것과 동일한 순수 date input 2개 방식(새 date-range-picker 라이브러리 도입 안 함).
- 빠른 선택 버튼(사용자 지정 상태에서도 계속 사용 가능): `이번 달`(→ 월별로 전환, 현재 연/월) / `지난 달`(→ 월별, 전월) / `올해`(→ 연도별, 현재연도) / `최근 30일`(→ 사용자 지정, `오늘-30일` ~ `오늘`).
- 기본값: `periodType='월별'`, `year`/`month` = 오늘 날짜 기준.
- 검증:
  - 연도별: 연도 미선택 시(있을 수 없지만 방어적으로) 무효 처리
  - 월별: 연도·월 모두 필요
  - 일별: 날짜 필요
  - 사용자 지정: 시작일·종료일 모두 필요 + `종료일 >= 시작일`
  - 무효 상태에서는 "보고서 생성하기" 버튼 비활성화

## 4. 기준일(집계 기준) 필드 매핑 — 사용자 확인 완료

| 보고서 유형 | 기준일 필드 | 집계 기준 표시 문구 |
|---|---|---|
| 분야별 분석 보고서 | `firstOccurredAt` | 하자 발생일 |
| 예산 정산 보고서 | `paymentCompletedAt ?? firstOccurredAt` | 결제 완료일 (없으면 하자 발생일) |
| 경영진 보고용 PT | `firstOccurredAt` (단일 기준으로 통일 — 비용 보조집계 없음, 사용자 확인 완료) | 하자 발생일 |
| 반복 하자 보고서 | `firstOccurredAt` (반복 전용 날짜 필드가 코드에 없어 최초발생일로 통일 — 사용자 확인 완료) | 하자 발생일 |
| 비용 부담 주체별 보고서 | `paymentCompletedAt ?? firstOccurredAt` | 결제 완료일 (없으면 하자 발생일) |
| 하자사항/일반사항 구분 보고서 | `firstOccurredAt` | 하자 발생일 |

`Defect.paymentCompletedAt?: string | null`은 `lib/store.ts`에 이미 존재하는 필드(결제 처리 시 채워짐). 새 필드를 만들 필요 없음.

## 5. 데이터 흐름 (`lib/aiReportService.ts`)

```ts
export interface ReportInput {
  defects: Defect[]
  categories: Category[]
  vendors: Vendor[]
  files: DefectFile[]
  floorPlans: FloorPlan[]
  period: { from: string | null; to: string | null; label: string; type: ReportPeriodType }  // 신규
}
```

`mockGenerate(type, input)` 진입부에서 **한 곳에서만** 필터링:

```ts
function dateFieldFor(type: ReportType): (d: Defect) => string | null {
  if (type === 'budget-settlement' || type === 'cost-bearer') {
    return d => d.paymentCompletedAt ?? d.firstOccurredAt
  }
  return d => d.firstOccurredAt
}

function inPeriod(dateStr: string | null, period: ReportInput['period']): boolean {
  if (!period.from && !period.to) return true
  if (!dateStr) return false
  const d = dateStr.slice(0, 10)
  if (period.from && d < period.from) return false
  if (period.to && d > period.to) return false
  return true
}

function filterDefectsForReport(type: ReportType, input: ReportInput): Defect[] {
  const dateOf = dateFieldFor(type)
  return input.defects.filter(d => inPeriod(dateOf(d), input.period))
}
```

`mockGenerate`는 이 필터링 결과(`scopedDefects`)로 만든 `scopedInput`을 각 `buildXSections(scopedInput)`에 전달하고, `metadata.totalDefects`/`completionRate`/`totalCost`도 `scopedDefects` 기준으로 계산한다(**필터 적용 전 전체 집계 금지** 요구사항 충족). 6개 섹션 빌더 함수 자체는 수정하지 않는다(이미 `input.defects`만 사용하므로 필터링된 배열을 넣어주기만 하면 됨).

`GeneratedReport`에 필드 3개 추가:
- `period: string` — 기존에도 있던 필드지만 지금은 `"2026년 7월 기준"` 하드코딩. 이제 `input.period.label`을 그대로 사용.
- `aggBasis: string` — 위 표의 "집계 기준 표시 문구".
- `periodFilenameSuffix: string` — 파일명용 (아래 7절).

## 6. AI 종합 의견(Action Plan) 기간 연동 — 대시보드 보호

`generateActionPlanOpinion(defects, files, floorPlans, periodLabel?: string)` — **4번째 인자를 선택적으로 추가**.

- `periodLabel`이 주어지면: 기존 "오늘 우선처리 대상은 …" 류 문장에서 "오늘"을 `periodLabel` 기준 문구로 교체(예: `"2026년 7월 기준 우선처리 대상은 …"`).
- `periodLabel`이 없으면(= `app/dashboard/page.tsx`의 기존 호출): **지금과 완전히 동일한 문장**을 출력 — 대시보드 화면은 이 함수를 인자 3개로 호출 중이므로 아무 영향 없음.

기간 밖 데이터는 애초에 `mockGenerate`에서 필터링된 `scopedDefects`만 `generateActionPlanOpinion`에 넘기므로 자동으로 기간 밖 데이터가 배제된다.

## 7. 파일명 (`lib/reportExportHtml.ts`)

`fmtReportFilename(report, ext)`을 다음으로 변경:

```ts
export function fmtReportFilename(report: GeneratedReport, ext: string): string {
  const titlePart = report.title.replace(/\s+/g, '_')
  return `${titlePart}_${report.periodFilenameSuffix}.${ext}`
}
```

`periodFilenameSuffix` 예시:
- 전체 → `전체기간`
- 연도별(2026) → `2026년`
- 월별(2026-07) → `2026년_07월`
- 일별(2026-07-12) → `2026-07-12`
- 사용자 지정(2026-06-01~2026-07-12) → `2026-06-01_2026-07-12`

## 8. 화면 표시

보고서 헤더 카드에 다음을 추가 표시(기존 `period`/`생성일`/`작성자`/`Rule-Based AI` 뱃지 옆):
- 기준기간 뱃지(일별인 경우 라벨을 "기준일:"로): 이미 있는 `report.period` 뱃지 자리를 그대로 사용(값만 새 라벨로 교체되므로 레이아웃 변경 없음)
- 집계 기준 뱃지: `report.aggBasis` 신규 표시

## 9. 재생성 필요 상태

- 보고서가 이미 생성된 상태(`report !== null`)에서 기간 관련 상태(`periodType`/`year`/`month`/`date`/`customFrom`/`customTo`)가 변경되면 `report`는 그대로 유지하되 `periodStale=true`로 표시.
- `periodStale`이면 생성 버튼 근처에 "기간이 변경되었습니다 — 보고서를 다시 생성해주세요." 배너 노출.
- "보고서 생성하기" 클릭 시 `periodStale=false`로 리셋.
- 보고서 **유형**을 바꾸는 기존 동작(`setReport(null)` 즉시 초기화)은 변경하지 않는다 — 이번 요구사항은 "기간" 변경에만 해당.

## 10. 데이터 없음 처리

`report.metadata.totalDefects === 0`인 경우:
- KPI 그리드/막대/표/슬라이드 섹션을 렌더링하는 대신 "선택한 기간에 해당하는 하자 데이터가 없습니다." 안내 카드 1개만 표시(헤더 카드는 그대로 표시 — 어떤 기간·유형으로 시도했는지는 보여줌).
- PDF/Excel/Word/인쇄 버튼은 `disabled` 처리(빈 파일 생성 방지) + `title` 툴팁으로 "데이터가 없어 다운로드할 파일이 없습니다." 안내.
- 보고서 생성 자체는 실패시키지 않는다(요청사항 "생성은 가능하되"를 그대로 따름).

## 11. 권한 (역할별 동작)

현재 `/reports/ai` 화면은 역할 제한이 없고, 조회자/실무자/관리자에 대한 요청 설명도 서로 다른 제약을 명시하지 않는다(모두 "기간 선택·생성·다운로드 가능"). **새로운 권한 제한을 추가하지 않고 현행(무제한) 유지**로 확정한다 — 불명확한 제약을 임의로 만들어 넣지 않는다(YAGNI).

## 12. 테스트 계획

1. `npx tsc --noEmit`, `npm run build`
2. Playwright(MCP 방식, 이전 작업과 동일하게 임시 `npm install --no-save playwright` 후 실제 브라우저로):
   - 전체/연도별/월별/일별/사용자 지정 각각 선택 → 해당 기간에 맞는 defects만 KPI/차트/표에 반영되는지 확인
   - 기간 변경 후 "재생성 필요" 배너 노출 확인
   - 데이터 없음(예: 존재하지 않는 미래 연도) 선택 시 안내 카드 + 다운로드 버튼 비활성화 확인
   - PDF/Excel/Word 파일명에 기준기간이 반영되는지 확인
   - 인쇄 미리보기에 기준기간·집계기준이 표시되는지 확인
   - `app/dashboard/page.tsx`의 AI 종합의견 문구가 이번 변경 전후로 동일한지 확인(회귀 방지)
3. QA 통과 전 commit/push/deploy 금지(사용자 명시 요구사항)

## 13. 범위 밖

- 운영관리현황시스템/seegene-ops-dashboard 등 다른 프로젝트 — 대상 아님
- 일반 보고서(`app/reports/page.tsx`)·집계현황(`app/analytics/page.tsx`)에 기간 UX 통일 — 이번 요청 범위 아님(대상은 AI 보고서 화면 하나)
- 역할별 세분화된 다운로드 제한 — 요청 문구가 구체적 제약을 특정하지 않아 이번에는 구현하지 않음(11절 참조)
