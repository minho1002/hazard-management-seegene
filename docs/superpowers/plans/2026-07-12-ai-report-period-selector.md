# AI 보고서 "보고기간 설정" 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/reports/ai` 화면에 보고서 유형 선택 전에 "보고기간"(전체/연도별/월별/일별/사용자 지정)을 지정하는 기능을 추가하고, 화면·PDF·Excel·Word·인쇄가 모두 그 기간에 해당하는 하자 데이터만 동일하게 반영하도록 한다.

**Architecture:** `lib/aiReportService.ts`의 `mockGenerate()` 진입부 한 곳에서만 `input.defects`를 기간+보고서유형별 기준일로 필터링한 뒤, 그 결과(`scopedDefects`)를 기존 6개 섹션 빌더에 그대로 넘긴다(빌더 함수 자체는 무수정). 화면(`app/reports/ai/page.tsx`)은 기간 선택 UI 상태를 관리해 `ReportInput.period`로 변환·전달하고, PDF/Excel/Word는 이미 화면의 단일 `report` state만 읽는 구조이므로 `report`에 필드 몇 개(`aggBasis`, `periodFilenameSuffix`, `periodType`)만 추가하면 3개 다운로드 파일 자체는 무수정으로 요구사항을 만족한다.

**Tech Stack:** 기존 Next.js 14 / React 18 / TypeScript. 신규 npm 의존성 없음.

## Global Constraints

- **절대 수정 금지**: `app/reports/page.tsx`(일반 보고서), `app/analytics/page.tsx`(집계현황), `app/dashboard/page.tsx`(대시보드), `lib/reportExportPdf.ts`, `lib/reportExportExcel.ts`, `lib/reportExportWord.ts`, 그리고 이 프로젝트 디렉터리(`02_하자관리시스템`) 밖의 모든 다른 프로젝트(운영관리현황시스템/seegene-ops-dashboard 등).
- `app/dashboard/page.tsx`는 `generateActionPlanOpinion(defects, state.files, state.floorPlans)`를 인자 3개로 호출 중이다 — 이번 변경으로 이 호출의 출력 문구가 단 한 글자도 달라지면 안 된다(4번째 인자는 반드시 선택적이어야 하고, 생략 시 기존과 동일한 문장을 내야 한다).
- 이 프로젝트에는 자동화된 단위테스트 프레임워크가 없다. 새로 도입하지 않는다. 검증은 `tsc --noEmit` / `next build` / 실제 브라우저 Playwright 조작으로 한다.
- 기준일 필드 매핑(사용자 확인 완료, 변경 금지): `field-analysis`/`executive-ppt`/`recurring-defects`/`defect-classification` → `firstOccurredAt`. `budget-settlement`/`cost-bearer` → `paymentCompletedAt ?? firstOccurredAt`.
- 6개 섹션 빌더 함수(`buildFieldAnalysisSections` 등)는 수정하지 않는다 — 필터링된 `ReportInput`을 그대로 넣어주기만 한다.
- 모든 사용자 노출 텍스트는 한국어 유지.
- QA(Task 5)가 전부 통과하기 전에는 commit/push/deploy 금지.

---

### Task 1: `lib/aiReportService.ts` — 기간 타입·필터링·Action Plan 문구

**Files:**
- Modify: `lib/aiReportService.ts`

**Interfaces:**
- Consumes: 없음(신규 타입/로직)
- Produces:
  - `export type ReportPeriodType = '전체' | '연도별' | '월별' | '일별' | '사용자 지정'`
  - `export interface ReportPeriod { type: ReportPeriodType; from: string | null; to: string | null; label: string }`
  - `ReportInput`에 `period: ReportPeriod` 필드 추가 — Task 3(page.tsx)에서 채워 넣는다.
  - `GeneratedReport`에 `aggBasis: string`, `periodFilenameSuffix: string`, `periodType: ReportPeriodType` 필드 추가 — Task 2(파일명), Task 3(화면 표시)에서 사용.
  - `generateActionPlanOpinion(defects, files, floorPlans, periodLabel?: string): ActionPlanOpinion` — 4번째 인자는 선택적(생략 시 기존과 동일 동작, `app/dashboard/page.tsx` 호출 보호).

- [ ] **Step 1: 타입 추가**

`lib/aiReportService.ts`의 `export type ReportType = ...` 줄 바로 다음에 추가:

```ts
export type ReportPeriodType = '전체' | '연도별' | '월별' | '일별' | '사용자 지정'

export interface ReportPeriod {
  type: ReportPeriodType
  from: string | null
  to: string | null
  label: string
}
```

- [ ] **Step 2: `ReportInput`에 `period` 추가**

기존:
```ts
export interface ReportInput {
  defects: Defect[]
  categories: Category[]
  vendors: Vendor[]
  files: DefectFile[]
  floorPlans: FloorPlan[]
}
```
를:
```ts
export interface ReportInput {
  defects: Defect[]
  categories: Category[]
  vendors: Vendor[]
  files: DefectFile[]
  floorPlans: FloorPlan[]
  period: ReportPeriod
}
```
로 교체.

- [ ] **Step 3: `GeneratedReport`에 필드 3개 추가**

기존:
```ts
export interface GeneratedReport {
  reportType: ReportType
  title: string
  subtitle: string
  period: string
  generatedAt: string
  sections: ReportSection[]
  actionPlan: ActionPlanOpinion
  basedOn: 'rule-based' | 'llm'
  metadata: { totalDefects: number; completionRate: number; totalCost: number }
  preparedBy: string
}
```
를:
```ts
export interface GeneratedReport {
  reportType: ReportType
  title: string
  subtitle: string
  period: string
  periodType: ReportPeriodType
  aggBasis: string
  periodFilenameSuffix: string
  generatedAt: string
  sections: ReportSection[]
  actionPlan: ActionPlanOpinion
  basedOn: 'rule-based' | 'llm'
  metadata: { totalDefects: number; completionRate: number; totalCost: number }
  preparedBy: string
}
```
로 교체.

- [ ] **Step 4: 기간 필터링 헬퍼 추가**

`fmtMan` 함수 바로 다음(주석 `// ── Action-Plan 종합의견 ...` 앞)에 추가:

```ts
function dateFieldFor(type: ReportType): (d: Defect) => string | null {
  if (type === 'budget-settlement' || type === 'cost-bearer') {
    return d => d.paymentCompletedAt ?? d.firstOccurredAt
  }
  return d => d.firstOccurredAt
}

function inPeriod(dateStr: string | null, period: ReportPeriod): boolean {
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

function periodFilenameSuffix(period: ReportPeriod): string {
  if (period.type === '전체') return '전체기간'
  if (period.type === '연도별') return `${(period.from ?? '').slice(0, 4)}년`
  if (period.type === '월별') return `${(period.from ?? '').slice(0, 4)}년_${(period.from ?? '').slice(5, 7)}월`
  if (period.type === '일별') return period.from ?? '전체기간'
  return `${period.from ?? ''}_${period.to ?? ''}`
}

const AGG_BASIS_LABEL: Record<ReportType, string> = {
  'field-analysis':        '하자 발생일',
  'budget-settlement':     '결제 완료일 (없으면 하자 발생일)',
  'executive-ppt':         '하자 발생일',
  'recurring-defects':     '하자 발생일',
  'cost-bearer':           '결제 완료일 (없으면 하자 발생일)',
  'defect-classification': '하자 발생일',
}
```

- [ ] **Step 5: `generateActionPlanOpinion`에 선택적 4번째 인자 추가**

기존 시그니처:
```ts
export function generateActionPlanOpinion(defects: Defect[], files: DefectFile[], floorPlans: FloorPlan[]): ActionPlanOpinion {
```
를:
```ts
export function generateActionPlanOpinion(defects: Defect[], files: DefectFile[], floorPlans: FloorPlan[], periodLabel?: string): ActionPlanOpinion {
  const prefix = periodLabel ? `${periodLabel} 기준` : '오늘'
```
로 교체(함수 본문 첫 줄로 `prefix` 선언 추가, 기존 `const open = ...` 줄 앞에 위치).

그 다음, 함수 본문 안의 다음 두 줄:
```ts
    headline.push(`오늘 우선처리 대상은 ${overdue.length > 0 ? `지연 ${overdue.length}건` : ''}${overdue.length > 0 && unresolvedCost.length > 0 ? ', ' : ''}${unresolvedCost.length > 0 ? `비용부담 미정 ${unresolvedCost.length}건` : ''}${overdue.length === 0 && unresolvedCost.length === 0 ? `${todayItems.length}건` : ''}이며, 우선순위대로 처리하지 않으면 지연이 누적됩니다.`)
```
와
```ts
    headline.push('오늘 시급하게 처리할 미완결 건은 없습니다.')
```
를 각각:
```ts
    headline.push(`${prefix} 우선처리 대상은 ${overdue.length > 0 ? `지연 ${overdue.length}건` : ''}${overdue.length > 0 && unresolvedCost.length > 0 ? ', ' : ''}${unresolvedCost.length > 0 ? `비용부담 미정 ${unresolvedCost.length}건` : ''}${overdue.length === 0 && unresolvedCost.length === 0 ? `${todayItems.length}건` : ''}이며, 우선순위대로 처리하지 않으면 지연이 누적됩니다.`)
```
와
```ts
    headline.push(`${prefix} 시급하게 처리할 미완결 건은 없습니다.`)
```
로 교체(문자열 리터럴 `'오늘'`을 템플릿 리터럴 `` `${prefix}` ``로 바꾸는 것 외에는 동일). 함수의 나머지 부분(immediateActions/costRisk/recurringWarning/approvalNeeded 계산)은 전혀 수정하지 않는다.

**검증**: `grep -n "오늘" lib/aiReportService.ts`를 실행했을 때, 주석(`// 오늘 처리해야 할 미완결 건`)과 `prefix` 선언(`: '오늘'`) 외에 `headline.push('오늘 ...')` 형태의 리터럴이 더 이상 없어야 한다.

- [ ] **Step 6: `mockGenerate`에서 필터링 적용 + 신규 필드 채우기**

기존:
```ts
function mockGenerate(type: ReportType, input: ReportInput): GeneratedReport {
  const now = new Date()
  const TITLES: Record<ReportType, [string, string]> = {
    'field-analysis':         ['분야별 분석 보고서',        '카테고리별 하자 발생 현황 및 비용 분석'],
    'budget-settlement':      ['예산 정산 보고서',          '처리 비용 집행 현황 및 AI 예측 정확도 분석'],
    'executive-ppt':          ['경영진 보고용 PT',          '시설 관리 종합 현황 및 전략적 권고사항'],
    'recurring-defects':      ['반복 하자 보고서',          '반복 발생 하자 현황 및 근본원인 재점검 권고'],
    'cost-bearer':            ['비용 부담 주체별 보고서',    '시공사·재단·외주업체 부담 예상 금액 및 미정 현황'],
    'defect-classification':  ['하자사항/일반사항 구분 보고서', '귀책 구분 및 관리자 검토 필요 항목'],
  }
  const [title, subtitle] = TITLES[type]
  const actionPlan = generateActionPlanOpinion(opinionScopeFor(type, input.defects), input.files, input.floorPlans)
  const sections =
    type === 'field-analysis'        ? buildFieldAnalysisSections(input) :
    type === 'budget-settlement'     ? buildBudgetSections(input) :
    type === 'recurring-defects'     ? buildRecurringSections(input) :
    type === 'cost-bearer'           ? buildCostBearerSections(input) :
    type === 'defect-classification' ? buildClassificationSections(input) :
    buildExecutiveSections(input)

  return {
    reportType: type, title, subtitle,
    period: `${now.getFullYear()}년 ${now.getMonth() + 1}월 기준`,
    generatedAt: now.toLocaleString('ko-KR'),
    sections,
    actionPlan,
    basedOn: 'rule-based',
    preparedBy: '시설관리팀',
    metadata: {
      totalDefects: input.defects.length,
      completionRate: input.defects.length > 0
        ? Math.round(input.defects.filter(d => d.status === 'completed').length / input.defects.length * 100)
        : 0,
      totalCost: input.defects.reduce((s, d) => s + d.totalCost, 0),
    },
  }
}
```
를:
```ts
function mockGenerate(type: ReportType, input: ReportInput): GeneratedReport {
  const now = new Date()
  const TITLES: Record<ReportType, [string, string]> = {
    'field-analysis':         ['분야별 분석 보고서',        '카테고리별 하자 발생 현황 및 비용 분석'],
    'budget-settlement':      ['예산 정산 보고서',          '처리 비용 집행 현황 및 AI 예측 정확도 분석'],
    'executive-ppt':          ['경영진 보고용 PT',          '시설 관리 종합 현황 및 전략적 권고사항'],
    'recurring-defects':      ['반복 하자 보고서',          '반복 발생 하자 현황 및 근본원인 재점검 권고'],
    'cost-bearer':            ['비용 부담 주체별 보고서',    '시공사·재단·외주업체 부담 예상 금액 및 미정 현황'],
    'defect-classification':  ['하자사항/일반사항 구분 보고서', '귀책 구분 및 관리자 검토 필요 항목'],
  }
  const [title, subtitle] = TITLES[type]
  const scopedDefects = filterDefectsForReport(type, input)
  const scopedInput: ReportInput = { ...input, defects: scopedDefects }
  const actionPlan = generateActionPlanOpinion(opinionScopeFor(type, scopedDefects), input.files, input.floorPlans, input.period.label)
  const sections =
    type === 'field-analysis'        ? buildFieldAnalysisSections(scopedInput) :
    type === 'budget-settlement'     ? buildBudgetSections(scopedInput) :
    type === 'recurring-defects'     ? buildRecurringSections(scopedInput) :
    type === 'cost-bearer'           ? buildCostBearerSections(scopedInput) :
    type === 'defect-classification' ? buildClassificationSections(scopedInput) :
    buildExecutiveSections(scopedInput)

  return {
    reportType: type, title, subtitle,
    period: input.period.label,
    periodType: input.period.type,
    aggBasis: AGG_BASIS_LABEL[type],
    periodFilenameSuffix: periodFilenameSuffix(input.period),
    generatedAt: now.toLocaleString('ko-KR'),
    sections,
    actionPlan,
    basedOn: 'rule-based',
    preparedBy: '시설관리팀',
    metadata: {
      totalDefects: scopedDefects.length,
      completionRate: scopedDefects.length > 0
        ? Math.round(scopedDefects.filter(d => d.status === 'completed').length / scopedDefects.length * 100)
        : 0,
      totalCost: scopedDefects.reduce((s, d) => s + d.totalCost, 0),
    },
  }
}
```
로 교체. (`generateReport()` 함수 자체는 수정하지 않는다 — `mockGenerate` 내부만 바뀐다.)

- [ ] **Step 7: 스모크 스크립트로 검증(스크래치패드, 커밋 안 함)**

`.superpowers/sdd/scratch/smoke-period.ts`(경로는 작업 디렉터리 기준 상대 경로로 조정):

```ts
import { generateReport, generateActionPlanOpinion, type ReportInput } from '../../../lib/aiReportService'

const baseDefects: ReportInput['defects'] = [
  // @ts-expect-error 테스트용 최소 필드만 채움
  { id: 1, caseNumber: 'A', title: '누수', description: null, buildingId: 1, floorPlanId: 1, locationX: 0, locationY: 0, locationText: '-', categoryId: 1, severity: 'high', status: 'open', costType: 'our', reporterName: null, assignedVendorId: null, managerName: null, recurrenceCount: 0, firstOccurredAt: '2024-03-15', lastOccurredAt: '2024-03-15', totalCost: 100000, createdAt: '2024-03-15', paymentCompletedAt: null },
  // @ts-expect-error 테스트용 최소 필드만 채움
  { id: 2, caseNumber: 'B', title: '전기', description: null, buildingId: 1, floorPlanId: 1, locationX: 0, locationY: 0, locationText: '-', categoryId: 1, severity: 'high', status: 'open', costType: 'our', reporterName: null, assignedVendorId: null, managerName: null, recurrenceCount: 0, firstOccurredAt: '2026-07-05', lastOccurredAt: '2026-07-05', totalCost: 200000, createdAt: '2026-07-05', paymentCompletedAt: '2026-07-10' },
]

async function main() {
  // 케이스 1: 연도별 2024 → 1건만 포함
  const r1 = await generateReport('field-analysis', {
    defects: baseDefects, categories: [], vendors: [], files: [], floorPlans: [],
    period: { type: '연도별', from: '2024-01-01', to: '2024-12-31', label: '2024년' },
  })
  if (r1.metadata.totalDefects !== 1) throw new Error(`FAIL case1: expected 1, got ${r1.metadata.totalDefects}`)
  if (r1.periodFilenameSuffix !== '2024년') throw new Error(`FAIL case1 suffix: ${r1.periodFilenameSuffix}`)

  // 케이스 2: 전체 → 2건 모두 포함
  const r2 = await generateReport('field-analysis', {
    defects: baseDefects, categories: [], vendors: [], files: [], floorPlans: [],
    period: { type: '전체', from: null, to: null, label: '전체 기간' },
  })
  if (r2.metadata.totalDefects !== 2) throw new Error(`FAIL case2: expected 2, got ${r2.metadata.totalDefects}`)

  // 케이스 3: budget-settlement는 paymentCompletedAt 우선 — 2026-07-05 firstOccurredAt인 건이 paymentCompletedAt=2026-07-10이므로 7월 필터에 포함되어야 함
  const r3 = await generateReport('budget-settlement', {
    defects: baseDefects, categories: [], vendors: [], files: [], floorPlans: [],
    period: { type: '월별', from: '2026-07-01', to: '2026-07-31', label: '2026년 7월' },
  })
  if (r3.metadata.totalDefects !== 1) throw new Error(`FAIL case3: expected 1, got ${r3.metadata.totalDefects}`)
  if (r3.aggBasis !== '결제 완료일 (없으면 하자 발생일)') throw new Error(`FAIL case3 aggBasis: ${r3.aggBasis}`)

  // 케이스 4: generateActionPlanOpinion — periodLabel 없이 호출 시 기존과 동일하게 '오늘'로 시작 (대시보드 보호 확인)
  const opinionNoPeriod = generateActionPlanOpinion([], [], [])
  if (opinionNoPeriod.headline[0] !== '오늘 시급하게 처리할 미완결 건은 없습니다.') {
    throw new Error(`FAIL case4: dashboard-compatible wording broken: ${opinionNoPeriod.headline[0]}`)
  }
  const opinionWithPeriod = generateActionPlanOpinion([], [], [], '2026년 7월')
  if (opinionWithPeriod.headline[0] !== '2026년 7월 기준 시급하게 처리할 미완결 건은 없습니다.') {
    throw new Error(`FAIL case4b: period wording wrong: ${opinionWithPeriod.headline[0]}`)
  }

  console.log('PASS: all aiReportService period-filter cases')
}
main()
```

Run: `cd "C:\Users\신민호\Desktop\씨젠_핵심프로젝트\02_하자관리시스템" && npx tsx .superpowers/sdd/scratch/smoke-period.ts`
Expected: `PASS: all aiReportService period-filter cases` 출력, 에러 없음. 통과 후 스크래치 스크립트/디렉터리 삭제(커밋 안 함).

- [ ] **Step 8: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (이 시점에는 `app/reports/ai/page.tsx`가 아직 `period`를 넘기지 않아 타입 에러가 날 수 있음 — Task 3에서 함께 고쳐지므로, 이 Task에서는 `lib/aiReportService.ts` 자체의 문법/타입 오류만 없으면 된다. `app/reports/ai/page.tsx`의 `generateReport(...)` 호출 부분에서 나는 "Property 'period' is missing" 류 에러는 Task 3에서 해소됨을 리뷰어에게 알린다.)

- [ ] **Step 9: Commit**

```bash
git add lib/aiReportService.ts
git commit -m "feat: add period filtering and period-aware action plan to aiReportService"
```

---

### Task 2: `lib/reportExportHtml.ts` — 파일명을 기준기간 기반으로 변경

**Files:**
- Modify: `lib/reportExportHtml.ts`

**Interfaces:**
- Consumes: `GeneratedReport.title`, `GeneratedReport.periodFilenameSuffix` (Task 1에서 추가됨)
- Produces: `fmtReportFilename(report: GeneratedReport, ext: string): string` — 시그니처는 그대로, 내부 로직만 변경. Task 3(page.tsx)의 다운로드 핸들러와 `lib/reportExportPdf.ts`/`reportExportExcel.ts`/`reportExportWord.ts`가 그대로 사용(이 3개 파일은 무수정).

- [ ] **Step 1: `fmtReportFilename` 교체**

기존:
```ts
export function fmtReportFilename(report: GeneratedReport, ext: string): string {
  const date = new Date().toISOString().slice(0, 10)
  return `AI보고서_${report.reportType}_${date}.${ext}`
}
```
를:
```ts
export function fmtReportFilename(report: GeneratedReport, ext: string): string {
  const titlePart = report.title.replace(/\s+/g, '_')
  return `${titlePart}_${report.periodFilenameSuffix}.${ext}`
}
```
로 교체.

- [ ] **Step 2: 스모크 스크립트로 검증**

`.superpowers/sdd/scratch/smoke-filename.ts`:

```ts
import { fmtReportFilename } from '../../../lib/reportExportHtml'
import type { GeneratedReport } from '../../../lib/aiReportService'

const sample = {
  title: '분야별 분석 보고서',
  periodFilenameSuffix: '2026년_07월',
} as GeneratedReport

const name = fmtReportFilename(sample, 'pdf')
if (name !== '분야별_분석_보고서_2026년_07월.pdf') throw new Error(`FAIL: got ${name}`)
console.log('PASS:', name)
```

Run: `npx tsx .superpowers/sdd/scratch/smoke-filename.ts`
Expected: `PASS: 분야별_분석_보고서_2026년_07월.pdf`. 통과 후 스크래치 파일 삭제(커밋 안 함).

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: `lib/reportExportHtml.ts` 관련 에러 없음(Task 1이 먼저 적용되어 있어야 `GeneratedReport.periodFilenameSuffix`가 존재함).

- [ ] **Step 4: Commit**

```bash
git add lib/reportExportHtml.ts
git commit -m "feat: derive AI report filename from report period instead of generation date"
```

---

### Task 3: `app/reports/ai/page.tsx` — 보고기간 설정 UI 및 연동

**Files:**
- Modify: `app/reports/ai/page.tsx`

**Interfaces:**
- Consumes: `ReportPeriod`, `ReportPeriodType` from `@/lib/aiReportService` (Task 1); `report.periodType`, `report.aggBasis`, `report.metadata.totalDefects` (Task 1)
- Produces: 없음(최종 UI 조립)

- [ ] **Step 1: import에 타입 추가**

```tsx
import {
  generateReport,
  type GeneratedReport,
  type ReportType,
  type ReportSection,
  type ReportPeriod,
  type ReportPeriodType,
} from '@/lib/aiReportService'
```

- [ ] **Step 2: 기간 상태 추가**

`AiReportPage` 컴포넌트 최상단, 기존 `const { state } = useStore()` 다음에 추가:

```tsx
const now = new Date()
const [periodType, setPeriodType] = useState<ReportPeriodType>('월별')
const [periodYear, setPeriodYear] = useState(now.getFullYear())
const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1)
const [periodDate, setPeriodDate] = useState(now.toISOString().slice(0, 10))
const [customFrom, setCustomFrom] = useState('')
const [customTo, setCustomTo] = useState('')
const [reportPeriodKey, setReportPeriodKey] = useState<string | null>(null)
```

- [ ] **Step 3: 기간 계산 헬퍼 추가**

컴포넌트 함수 본문, Step 2에서 추가한 상태들 바로 다음에 추가:

```tsx
function pad2(n: number) { return String(n).padStart(2, '0') }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate() }

function computePeriod(): ReportPeriod {
  if (periodType === '전체') return { type: '전체', from: null, to: null, label: '전체 기간' }
  if (periodType === '연도별') return { type: '연도별', from: `${periodYear}-01-01`, to: `${periodYear}-12-31`, label: `${periodYear}년` }
  if (periodType === '월별') {
    const from = `${periodYear}-${pad2(periodMonth)}-01`
    const to = `${periodYear}-${pad2(periodMonth)}-${pad2(daysInMonth(periodYear, periodMonth))}`
    return { type: '월별', from, to, label: `${periodYear}년 ${periodMonth}월` }
  }
  if (periodType === '일별') return { type: '일별', from: periodDate, to: periodDate, label: periodDate }
  return {
    type: '사용자 지정',
    from: customFrom || null,
    to: customTo || null,
    label: customFrom && customTo ? `${customFrom} ~ ${customTo}` : '',
  }
}

const period = computePeriod()
const periodKeyNow = JSON.stringify({ type: period.type, from: period.from, to: period.to })
const isPeriodValid =
  periodType === '전체' ? true :
  periodType === '연도별' ? !!periodYear :
  periodType === '월별' ? !!periodYear && !!periodMonth :
  periodType === '일별' ? !!periodDate :
  !!customFrom && !!customTo && customFrom <= customTo
const periodStale = report !== null && reportPeriodKey !== null && reportPeriodKey !== periodKeyNow

function applyThisMonth() { setPeriodType('월별'); setPeriodYear(now.getFullYear()); setPeriodMonth(now.getMonth() + 1) }
function applyLastMonth() {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  setPeriodType('월별'); setPeriodYear(d.getFullYear()); setPeriodMonth(d.getMonth() + 1)
}
function applyThisYear() { setPeriodType('연도별'); setPeriodYear(now.getFullYear()) }
function applyLast30Days() {
  const from = new Date(now); from.setDate(from.getDate() - 30)
  setPeriodType('사용자 지정'); setCustomFrom(from.toISOString().slice(0, 10)); setCustomTo(now.toISOString().slice(0, 10))
}

const selectStyle: React.CSSProperties = { padding: '7px 10px', borderRadius: 7, border: '1px solid #e3e8ef', outline: 'none', fontSize: '0.8rem', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }
const inputStyle: React.CSSProperties = { padding: '7px 10px', borderRadius: 7, border: '1px solid #e3e8ef', outline: 'none', fontSize: '0.8rem', fontFamily: 'inherit' }
```

- [ ] **Step 4: `handleGenerate`에 기간 전달 + 유효성 검사 + stale 리셋**

기존:
```tsx
async function handleGenerate() {
  if (!selectedType) return
  setLoading(true)
  setReport(null)
  try {
    const result = await generateReport(selectedType, {
      defects: state.defects.filter(d => !d.deletedAt),
      categories: state.categories,
      vendors: state.vendors,
      files: state.files,
      floorPlans: state.floorPlans,
    })
    setReport(result)
  } finally {
    setLoading(false)
  }
}
```
를:
```tsx
async function handleGenerate() {
  if (!selectedType || !isPeriodValid) return
  setLoading(true)
  setReport(null)
  try {
    const result = await generateReport(selectedType, {
      defects: state.defects.filter(d => !d.deletedAt),
      categories: state.categories,
      vendors: state.vendors,
      files: state.files,
      floorPlans: state.floorPlans,
      period,
    })
    setReport(result)
    setReportPeriodKey(periodKeyNow)
  } finally {
    setLoading(false)
  }
}
```
로 교체.

- [ ] **Step 5: "보고기간 설정" 카드를 "보고서 유형 선택" 카드 위에 추가**

기존:
```tsx
        {/* ── Report type selection ── */}
        <div className="no-print" style={{ marginBottom: 22 }}>
```
바로 앞에 삽입:

```tsx
        {/* ── Period settings ── */}
        <div className="no-print" style={{ marginBottom: 22 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#425466', marginBottom: 11 }}>보고기간 설정</div>
          <div style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: 14, padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {(['전체', '연도별', '월별', '일별', '사용자 지정'] as ReportPeriodType[]).map(pt => (
                <button
                  key={pt}
                  onClick={() => setPeriodType(pt)}
                  style={{
                    padding: '7px 16px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                    border: periodType === pt ? '1.5px solid #635bff' : '1.5px solid #e3e8ef',
                    background: periodType === pt ? '#635bff' : '#fff',
                    color: periodType === pt ? '#fff' : '#425466',
                    fontFamily: 'inherit',
                  }}
                >
                  {pt}
                </button>
              ))}
            </div>

            {periodType === '연도별' && (
              <select value={periodYear} onChange={e => setPeriodYear(Number(e.target.value))} style={selectStyle}>
                {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2, now.getFullYear() - 3].map(y => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            )}

            {periodType === '월별' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={periodYear} onChange={e => setPeriodYear(Number(e.target.value))} style={selectStyle}>
                  {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2, now.getFullYear() - 3].map(y => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
                <select value={periodMonth} onChange={e => setPeriodMonth(Number(e.target.value))} style={selectStyle}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
              </div>
            )}

            {periodType === '일별' && (
              <input type="date" value={periodDate} onChange={e => setPeriodDate(e.target.value)} style={inputStyle} />
            )}

            {periodType === '사용자 지정' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={inputStyle} />
                <span style={{ color: '#b0bac6' }}>~</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={inputStyle} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {[
                { label: '이번 달', fn: applyThisMonth },
                { label: '지난 달', fn: applyLastMonth },
                { label: '올해', fn: applyThisYear },
                { label: '최근 30일', fn: applyLast30Days },
              ].map(q => (
                <button
                  key={q.label}
                  onClick={q.fn}
                  style={{ padding: '5px 12px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', border: '1px solid #e3e8ef', background: '#f8fafc', color: '#697386', fontFamily: 'inherit' }}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </div>

```

- [ ] **Step 6: 생성 버튼 비활성화 조건 + 안내문 + 재생성 필요 배너**

기존:
```tsx
          <button
            onClick={handleGenerate}
            disabled={!selectedType || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 26px',
              background: selectedType && !loading ? (selectedCfg?.color ?? '#635bff') : '#e3e8ef',
              color: selectedType && !loading ? '#fff' : '#aab',
              border: 'none', borderRadius: 10,
              fontSize: '0.82rem', fontWeight: 700,
              cursor: selectedType && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
```
를:
```tsx
          <button
            onClick={handleGenerate}
            disabled={!selectedType || !isPeriodValid || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 26px',
              background: selectedType && isPeriodValid && !loading ? (selectedCfg?.color ?? '#635bff') : '#e3e8ef',
              color: selectedType && isPeriodValid && !loading ? '#fff' : '#aab',
              border: 'none', borderRadius: 10,
              fontSize: '0.82rem', fontWeight: 700,
              cursor: selectedType && isPeriodValid && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
```
로 교체.

기존:
```tsx
          {!selectedType && !loading && (
            <span style={{ fontSize: '0.72rem', color: '#aab' }}>보고서 유형을 먼저 선택하세요</span>
          )}
          {report && !loading && (
            <span style={{ fontSize: '0.72rem', color: '#059669' }}>
              <i className="fa-solid fa-circle-check" style={{ marginRight: 5 }} />
              생성 완료 — {report.generatedAt}
            </span>
          )}
```
를:
```tsx
          {(!selectedType || !isPeriodValid) && !loading && (
            <span style={{ fontSize: '0.72rem', color: '#aab' }}>보고기간과 보고서 유형을 선택해 주세요.</span>
          )}
          {report && !loading && !periodStale && (
            <span style={{ fontSize: '0.72rem', color: '#059669' }}>
              <i className="fa-solid fa-circle-check" style={{ marginRight: 5 }} />
              생성 완료 — {report.generatedAt}
            </span>
          )}
          {periodStale && !loading && (
            <span style={{ fontSize: '0.72rem', color: '#d97706', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="fa-solid fa-triangle-exclamation" />
              기간이 변경되었습니다 — 보고서를 다시 생성해주세요.
            </span>
          )}
```
로 교체.

- [ ] **Step 7: 헤더 뱃지에 집계 기준 추가 + 기준일/기준기간 라벨 분기**

기존:
```tsx
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: '#f0f4f8', borderRadius: 99, color: '#425466' }}>{report.period}</span>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: '#f0f4f8', borderRadius: 99, color: '#425466' }}>생성: {report.generatedAt}</span>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: '#f0f4f8', borderRadius: 99, color: '#425466' }}>작성자: {report.preparedBy}</span>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: 'rgba(99,91,255,.1)', borderRadius: 99, color: '#635bff', fontWeight: 600 }}>
                    ✨ {report.basedOn === 'rule-based' ? 'Rule-Based AI' : 'LLM 분석'}
                  </span>
                </div>
```
를:
```tsx
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: '#f0f4f8', borderRadius: 99, color: '#425466' }}>
                    {report.periodType === '일별' ? '기준일' : '기준기간'}: {report.period}
                  </span>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: '#f0f4f8', borderRadius: 99, color: '#425466' }}>생성: {report.generatedAt}</span>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: '#f0f4f8', borderRadius: 99, color: '#425466' }}>작성자: {report.preparedBy}</span>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: 'rgba(5,150,105,.1)', borderRadius: 99, color: '#059669', fontWeight: 600 }}>집계 기준: {report.aggBasis}</span>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: 'rgba(99,91,255,.1)', borderRadius: 99, color: '#635bff', fontWeight: 600 }}>
                    ✨ {report.basedOn === 'rule-based' ? 'Rule-Based AI' : 'LLM 분석'}
                  </span>
                </div>
```
로 교체.

- [ ] **Step 8: 다운로드 버튼에 데이터 없음 비활성화 추가**

컴포넌트 안, 보고서 미리보기 블록(`{report && !loading && (`) 시작 부분에 추가:

```tsx
        {report && !loading && (
          <div className="rpt-print-area">
            {(() => { return null })()}
```
위 줄은 삽입하지 않는다 — 대신 JSX 바로 아래에서 사용할 상수를 준비하기 위해, 컴포넌트 함수 최상단(Step 3에서 만든 헬퍼들 근처)에 다음을 추가:

```tsx
const isEmptyReport = report ? report.metadata.totalDefects === 0 : false
```

그 다음 PDF/Excel/Word 버튼의 `disabled`/`title`을 각각 다음과 같이 교체:

```tsx
                <button
                  onClick={handleDownloadPDF}
                  disabled={pdfLoading || isEmptyReport}
                  title={isEmptyReport ? '데이터가 없어 다운로드할 파일이 없습니다.' : 'PDF 다운로드'}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: (pdfLoading || isEmptyReport) ? 'not-allowed' : 'pointer', fontSize: '0.71rem', color: '#425466', opacity: (pdfLoading || isEmptyReport) ? 0.6 : 1 }}
                >
```
(Excel/Word도 동일 패턴 — `disabled={isEmptyReport}` / `disabled={wordLoading || isEmptyReport}`, `title` 동일 문구, `opacity`/`cursor`도 `isEmptyReport` 반영. 인쇄 버튼은 그대로 둔다 — 비활성화 대상 아님.)

- [ ] **Step 9: 데이터 없음일 때 섹션 대신 안내 카드 표시**

기존(섹션 렌더링 ~ 메타데이터 푸터까지):
```tsx
            {/* Content sections */}
            {report.sections.map(section => (
              <div key={section.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e3e8ef', padding: '18px 24px', marginBottom: 14 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f0f4f8' }}>
                  {section.title}
                </div>
                <SectionRenderer section={section} />
              </div>
            ))}

            {/* AI 종합 의견 */}
            <div style={{ background: 'linear-gradient(135deg,rgba(99,91,255,.08),rgba(99,91,255,.03))', ... }}>
              ...
            </div>

            {/* Metadata footer */}
            <div style={{ ... }}>
              ...
            </div>
```

이 전체 블록을 `{isEmptyReport ? (...) : (<>...</>)}`로 감싼다. 즉:

```tsx
            {isEmptyReport ? (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e3e8ef', padding: '40px 24px', textAlign: 'center', color: '#697386', fontSize: '0.85rem' }}>
                <i className="fa-solid fa-inbox" style={{ fontSize: 28, color: '#d0d5dd', marginBottom: 10, display: 'block' }} />
                선택한 기간에 해당하는 하자 데이터가 없습니다.
              </div>
            ) : (
              <>
                {/* Content sections */}
                {report.sections.map(section => (
                  <div key={section.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e3e8ef', padding: '18px 24px', marginBottom: 14 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f0f4f8' }}>
                      {section.title}
                    </div>
                    <SectionRenderer section={section} />
                  </div>
                ))}

                {/* AI 종합 의견 */}
                <div style={{ background: 'linear-gradient(135deg,rgba(99,91,255,.08),rgba(99,91,255,.03))', borderRadius: 14, border: '1px solid rgba(99,91,255,.2)', padding: '20px 24px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#635bff,#8b85ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#fff', fontSize: 12 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540' }}>AI 종합 의견</div>
                      <div style={{ fontSize: '0.66rem', color: '#697386', marginTop: 1 }}>Rule-Based 분석 · LLM API 연동 시 더욱 정교한 분석 제공 가능</div>
                    </div>
                  </div>
                  <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,.75)', borderRadius: 10, border: '1px solid rgba(99,91,255,.12)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      {report.actionPlan.headline.map((line, i) => (
                        <div key={i} style={{ fontSize: '0.82rem', color: '#0a2540', lineHeight: 1.7, marginBottom: 2 }}>• {line}</div>
                      ))}
                    </div>
                    {report.actionPlan.immediateActions.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: COLORS.danger, marginBottom: 4 }}>즉시 조치 필요</div>
                        {report.actionPlan.immediateActions.map((t, i) => <div key={i} style={{ fontSize: '0.76rem', color: '#425466', lineHeight: 1.65 }}>· {t}</div>)}
                      </div>
                    )}
                    {report.actionPlan.costRisk.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#B06B1A', marginBottom: 4 }}>비용 / 결제 리스크</div>
                        {report.actionPlan.costRisk.map((t, i) => <div key={i} style={{ fontSize: '0.76rem', color: '#425466', lineHeight: 1.65 }}>· {t}</div>)}
                      </div>
                    )}
                    {report.actionPlan.recurringWarning.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#635bff', marginBottom: 4 }}>반복 발생 경고</div>
                        {report.actionPlan.recurringWarning.map((t, i) => <div key={i} style={{ fontSize: '0.76rem', color: '#425466', lineHeight: 1.65 }}>· {t}</div>)}
                      </div>
                    )}
                    {report.actionPlan.approvalNeeded.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#0F7850', marginBottom: 4 }}>관리자 결재 필요</div>
                        {report.actionPlan.approvalNeeded.map((t, i) => <div key={i} style={{ fontSize: '0.76rem', color: '#425466', lineHeight: 1.65 }}>· {t}</div>)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Metadata footer */}
                <div style={{ padding: '10px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e3e8ef', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.67rem', color: '#697386' }}>분석 대상: <strong style={{ color: '#425466' }}>{report.metadata.totalDefects}건</strong></span>
                  <span style={{ fontSize: '0.67rem', color: '#697386' }}>처리 완료율: <strong style={{ color: '#425466' }}>{report.metadata.completionRate}%</strong></span>
                  <span style={{ fontSize: '0.67rem', color: '#697386' }}>총 처리 비용: <strong style={{ color: '#425466' }}>{fmtKRW(report.metadata.totalCost)}</strong></span>
                  <span style={{ fontSize: '0.67rem', color: '#697386' }}>분석 방식: <strong style={{ color: '#635bff' }}>Rule-Based (LLM 교체 가능)</strong></span>
                </div>
              </>
            )}
```

- [ ] **Step 10: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(Task 1의 `period` 필수 필드가 이제 채워지므로 이전 Task의 "Property 'period' is missing" 에러가 해소되어야 함).

- [ ] **Step 11: 개발 서버로 수동 확인**

Run: `npm run dev`
브라우저로 `http://localhost:3000/reports/ai` 접속 → "보고기간 설정" 카드가 유형 선택 위에 보이는지, 기간 유형 버튼 5개가 인디고로 강조되는지, 연도별/월별/일별/사용자 지정 각각 클릭 시 알맞은 입력 컨트롤이 나오는지, 빠른 선택 4개 버튼이 동작하는지 육안 확인. 개발 서버 중지.

- [ ] **Step 12: Commit**

```bash
git add app/reports/ai/page.tsx
git commit -m "feat: add report period selector UI to AI report page"
```

---

### Task 4: 전체 타입체크 + 프로덕션 빌드 게이트

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: `Compiled successfully`, `/reports/ai` 라우트 정상 빌드, `app/reports/page.tsx`/`app/analytics/page.tsx`/`app/dashboard/page.tsx` 라우트도 그대로 빌드됨(무수정 확인)

- [ ] **Step 3: Commit 없음(검증 전용 Task)**

---

### Task 5: Playwright QA — 기간별 데이터 반영 + 대시보드 회귀 확인

**Files:** 없음(검증 전용)

- [ ] **Step 1: 개발 서버 기동, Playwright 준비**

`npm run dev` 백그라운드 실행. `npm install --no-save playwright@1.61.1`(캐시된 Chromium 재사용, 커밋 안 함).

- [ ] **Step 2: 시드 데이터 기준 기간별 필터링 확인**

로그인(`admin`/`admin1234`) 후 `/reports/ai`에서:
- `field-analysis` 유형 + **연도별 2024** 선택 → 생성 → `분석 대상: 4건`(시드 데이터 중 2024년 발생 4건과 일치) 확인
- 동일 유형 + **연도별 2025** → `분석 대상: 1건`
- 동일 유형 + **전체** → `분석 대상: 5건`(시드 전체)
- 동일 유형 + **월별(2024년 3월)** → `분석 대상: 1건`
- 동일 유형 + **일별(2024-03-15)** → `분석 대상: 1건`
- 동일 유형 + **사용자 지정(2024-01-01~2026-12-31)** → `분석 대상: 5건`
- 동일 유형 + **월별(오늘이 속한 현재 연/월, 기본값)** → 데이터 없음 안내 카드 노출 + PDF/Excel/Word 버튼이 비활성화(`disabled`)되는지 확인 — 이것이 사용자가 원래 보고했던 "KPI 전부 0" 증상이 이제 명확한 안내로 대체됐는지의 핵심 검증 포인트

- [ ] **Step 3: 재생성 필요 배너 확인**

위 상태에서 보고서 생성 후 기간을 다른 값으로 바꾸면 "기간이 변경되었습니다 — 보고서를 다시 생성해주세요." 배너가 뜨는지, "보고서 생성하기" 클릭 후 사라지는지 확인.

- [ ] **Step 4: 파일명 확인**

연도별 2024 선택 상태에서 PDF/Excel/Word 다운로드 클릭 → 파일명이 각각 `분야별_분석_보고서_2024년.pdf` / `.xlsx` / `.docx` 형태인지 확인(`page.on('download', ...)`의 `suggestedFilename()`으로 검증).

- [ ] **Step 5: 대시보드 회귀 확인**

`/dashboard` 접속 → AI 종합의견(또는 관련 위젯) 텍스트가 여전히 "오늘 …"으로 시작하는지 확인(기존과 동일해야 함 — `periodLabel` 미전달 시 원문 그대로 유지되는지의 실제 회귀 검증).

- [ ] **Step 6: 정리 및 보고**

스크래치 스크립트/스크린샷 삭제, dev 서버 종료(포트 기준으로 타겟 프로세스만 종료 — 전체 node 프로세스를 죽이지 말 것). 결과를 표로 정리해 보고. 실패 항목이 있으면 해당 Task로 돌아가 수정 후 Task 4부터 재검증. **QA 전 항목이 모두 통과하기 전에는 commit이 이미 되어 있더라도 push/deploy하지 않는다.**
