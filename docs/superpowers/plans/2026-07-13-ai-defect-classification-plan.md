# 하자구분 및 귀책판단 AI 고도화 (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 여러 시공사의 유무상 기준자료(PDF/Word/Excel)를 업로드·버전관리하고, 하자 등록/상세 화면에서 Gemini 3.1 Flash-Lite가 그 기준자료 + 과거 관리자 확정사례 + 사진을 종합 분석해 시공사/사용상/제조사보증 확률과 근거를 제시하며, 관리자가 그 추천을 적용하거나 수정해 최종 확정하는 흐름을 구현한다. 스펙: `docs/superpowers/specs/2026-07-13-ai-defect-classification-design.md`.

**Architecture:** 기존 앱(하자 데이터 = 브라우저 localStorage)은 건드리지 않고, 완전히 새로운 서버 인프라(Vercel Postgres + Vercel Blob) 위에 기준자료·AI판단이력만 얹는다. Gemini 호출은 신규 파일 `lib/aiDefectClassifier.ts` 하나에 캡슐화하고, 실패 시 기존 `lib/defectClassificationService.ts`의 규칙기반 로직으로 자동 폴백한다. UI는 신규 공유 컴포넌트 `AiClassificationPanel`을 등록 화면과 상세 화면 양쪽에서 재사용한다.

**Tech Stack:** Next.js 14 App Router API Routes, `drizzle-orm/node-postgres` + `pg`(신규, Vercel Postgres용 — 기존 `db/db.ts`의 sqlite와는 완전히 별도), `@vercel/blob`(신규), `@google/generative-ai`(기존 의존성, 최초로 실제 사용), `pdf-parse` v2(신규), `mammoth`(신규), `xlsx`(기존, 읽기 전용 파싱에 재사용).

## Global Constraints

- **절대 수정 금지**: `db/db.ts`, `db/schema.ts`, `db/seed.ts`, `drizzle.config.ts`(기존 sqlite 설정), `lib/store.ts`, `lib/gemini.ts`(미사용 방치 코드, import 시 `GEMINI_API_KEY` 없으면 즉시 throw하므로 이번 신규 코드에서 **import하지 않는다** — 새 파일에서 별도로 안전하게 클라이언트를 만든다), `app/reports/*`, `app/analytics/*`, `app/dashboard/*`, `lib/aiReportService.ts`, `lib/reportExportPdf.ts`, `lib/reportExportWord.ts`, `lib/reportExportExcel.ts`, 그리고 이 프로젝트(`02_하자관리시스템`) 밖의 모든 다른 프로젝트.
- 이 프로젝트에는 자동화된 단위테스트 프레임워크가 없다. 새로 도입하지 않는다. 검증은 `tsc --noEmit` / `next build` / `npx tsx` 스크래치 스모크 스크립트 / 실제 브라우저 Playwright로 한다.
- Gemini 관련 코드는 **모듈 최상단에서 `GoogleGenerativeAI` 인스턴스를 만들지 않는다** — `GEMINI_API_KEY`가 없어도 앱이 죽지 않고 폴백 경로로 넘어가야 하므로, 함수 내부에서 키 존재를 확인한 뒤에만 인스턴스를 생성한다.
- 새 Postgres 테이블명은 스펙 문서의 `classification_history`를 **`ai_classification_log`로 변경**한다 — `lib/store.ts`에 이미 로컬(localStorage) `classificationHistory`/`DefectClassificationHistory`가 존재해 이름이 겹치면 혼란을 준다(이번 계획 작성 중 발견, 스펙 문서보다 이 계획이 최신 기준).
- 모든 사용자 노출 텍스트는 한국어 유지.
- `GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `DATABASE_URL`은 Task 1에서 사용자가 직접 발급/연동해야 하는 값이다 — Task 1 완료 전에는 Task 4 이후의 실제 API 호출 검증(Playwright 포함)이 불가능하다. Task 1이 막히면 그 뒤 Task들의 **코드 작성**은 계속 진행하되(타입체크만으로 검증), 실제 브라우저 동작 검증은 Task 1 완료 후로 미룬다.
- QA(마지막 Task)가 전부 통과하기 전에는 commit이 있더라도 push/deploy 금지.

---

### Task 1: 인프라 프로비저닝 (Vercel Blob + Postgres + Gemini API 키)

**Files:** 없음(인프라/환경변수 작업). `.env.local`에 값 추가(커밋 대상 아님, `.gitignore` 확인만).

**Interfaces:**
- Produces: 로컬 `.env.local`과 Vercel 프로젝트 환경변수에 `GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `DATABASE_URL` 3개가 존재하게 됨. Task 2 이후 모든 서버 코드가 이 값들을 `process.env`로 읽는다.

- [ ] **Step 1: `.env.local`이 gitignore 대상인지 확인**

Run: `cat .gitignore | grep -i env`
Expected: `.env*.local` 또는 `.env.local` 패턴이 존재. 없으면 이 단계에서 `echo ".env.local" >> .gitignore` 후 커밋(다른 파일 건드리지 않음).

- [ ] **Step 2: Vercel Blob 스토어 생성**

Run(프로젝트 루트에서):
```bash
npx vercel blob create-store hazard-management-refdocs
```
Expected: 스토어 생성 성공 메시지와 함께 `BLOB_READ_WRITE_TOKEN` 값이 출력됨(또는 `npx vercel env pull .env.local`로 Vercel이 프로젝트에 자동 연동한 토큰을 로컬로 가져옴 — 이 프로젝트가 이미 Vercel에 링크되어 있으므로(`.vercel/project.json` 존재 확인됨) `vercel blob create-store`가 자동으로 프로젝트에 스토어를 연결한다).

- [ ] **Step 3: Vercel Postgres(Neon) 마켓플레이스 연동 — 사용자 확인 필요**

이 단계는 청구/약관 동의가 걸려있어 **사용자에게 먼저 안내하고 진행 여부를 확인한다**(자동 실행하지 않음):
```bash
npx vercel integration add neon
```
사용자가 대시보드(vercel.com → 프로젝트 → Storage 탭 → Neon Postgres 추가)에서 직접 눌러도 동일하다. 완료 후:
```bash
npx vercel env pull .env.local
```
Expected: `.env.local`에 `DATABASE_URL`(또는 `POSTGRES_URL`류 변수, Neon 통합이 실제로 붙이는 이름을 그대로 사용 — 이후 Task 2 코드는 `process.env.DATABASE_URL`을 읽으므로, 변수명이 다르게 붙으면 `.env.local`에 `DATABASE_URL=<Neon이 붙인 값>`을 한 줄 추가해 이름을 통일한다)이 채워짐.

- [ ] **Step 4: Gemini API 키 발급 — 사용자 액션**

사용자가 https://aistudio.google.com (또는 Google Cloud Console)에서 API 키를 발급해 알려준다. 받은 값을 `.env.local`에 추가:
```
GEMINI_API_KEY=<발급받은 키>
```
Vercel 프로덕션에도 동일하게 등록:
```bash
npx vercel env add GEMINI_API_KEY production
```
(대화형으로 값 입력 요구 — 사용자가 직접 붙여넣거나, 값을 전달받아 stdin으로 흘려보낸다.)

- [ ] **Step 5: 신규 npm 의존성 설치**

Run:
```bash
npm install pg @vercel/blob @vercel/functions pdf-parse mammoth
npm install -D @types/pg
```
Expected: `package.json`의 `dependencies`에 5개, `devDependencies`에 1개 추가.

- [ ] **Step 6: 연결 확인 스모크 스크립트(스크래치, 커밋 안 함)**

`.superpowers/sdd/scratch/smoke-env.ts`:
```ts
import { Pool } from 'pg'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('FAIL: DATABASE_URL not set')
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('FAIL: BLOB_READ_WRITE_TOKEN not set')
  if (!process.env.GEMINI_API_KEY) throw new Error('FAIL: GEMINI_API_KEY not set')

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const res = await pool.query('SELECT 1 as ok')
  if (res.rows[0].ok !== 1) throw new Error('FAIL: postgres query did not return 1')
  await pool.end()
  console.log('PASS: DATABASE_URL / BLOB_READ_WRITE_TOKEN / GEMINI_API_KEY all set, Postgres connection works')
}
main()
```
Run: `npx tsx --env-file=.env.local .superpowers/sdd/scratch/smoke-env.ts`
Expected: `PASS: ...` 출력. 통과 후 스크래치 파일 삭제(커밋 안 함).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add Postgres/Blob/Gemini dependencies for AI defect classification"
```
(`.env.local`은 커밋하지 않는다 — gitignore 대상.)

---

### Task 2: Postgres 스키마 (`ai_classification_log`, `reference_documents`) + DB 클라이언트

**Files:**
- Create: `db/pg/schema.ts`
- Create: `db/pg/client.ts`
- Create: `drizzle.pg.config.ts`
- Modify: `package.json` (스크립트 2개 추가)

**Interfaces:**
- Produces:
  - `export const referenceDocuments` (drizzle pgTable)
  - `export const aiClassificationLog` (drizzle pgTable)
  - `export const pgDb: NodePgDatabase<typeof schema>` from `db/pg/client.ts`
  - `export type ReferenceDocumentRow`, `export type AiClassificationLogRow` (drizzle `$inferSelect` 타입) — Task 4/6/7/8/9가 이 타입들을 그대로 가져다 쓴다.

- [ ] **Step 1: `db/pg/schema.ts` 작성**

```ts
import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const referenceDocuments = pgTable('reference_documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  vendor: text('vendor').notNull(),
  trade: text('trade'),
  version: integer('version').notNull(),
  fileType: text('file_type').notNull(), // 'pdf' | 'docx' | 'xlsx'
  blobUrl: text('blob_url').notNull(),
  extractedText: text('extracted_text'),
  structuredRows: jsonb('structured_rows').$type<{ trade: string; item: string; free: string | null; paid: string | null; note: string | null }[]>(),
  extractionFailed: boolean('extraction_failed').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  supersedes: integer('supersedes'),
  uploadedBy: text('uploaded_by'),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
})

export type ReferenceDocumentRow = typeof referenceDocuments.$inferSelect
export type NewReferenceDocumentRow = typeof referenceDocuments.$inferInsert

export const aiClassificationLog = pgTable('ai_classification_log', {
  id: serial('id').primaryKey(),
  caseNumber: text('case_number').notNull(),
  inputSnapshot: jsonb('input_snapshot').$type<{
    title: string; description: string; location: string; facility: string; occurredAt: string; category: string
  }>().notNull(),
  aiSuggestion: jsonb('ai_suggestion').$type<{
    constructionPct: number; usagePct: number; warrantyPct: number
    reasoning: string
    citedDocs: { vendor: string; title: string; version: number }[]
    adminChecklist: string[]
    recommendedAction: string
    confidenceLabel: '낮음' | '중간' | '높음'
    confidencePct: number
    fallback: boolean
    // mapPctToDefectType()으로 계산된, 관리자 확정값과 비교하기 위한 AI 추천 매핑값(Task 10/12에서 채움)
    recommendedDefectType: string
    recommendedResponsibilityType: string
    recommendedCostBearer: string
  }>().notNull(),
  adminFinal: jsonb('admin_final').$type<{
    defectType: string; responsibilityType: string; costBearer: string; reason: string | null
  }>(),
  wasAiAccepted: boolean('was_ai_accepted'),
  confirmedBy: text('confirmed_by'),
  confirmedAt: timestamp('confirmed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type AiClassificationLogRow = typeof aiClassificationLog.$inferSelect
export type NewAiClassificationLogRow = typeof aiClassificationLog.$inferInsert
```

- [ ] **Step 2: `db/pg/client.ts` 작성**

```ts
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { attachDatabasePool } from '@vercel/functions'
import * as schema from './schema'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
attachDatabasePool(pool)

export const pgDb = drizzle(pool, { schema })
```

- [ ] **Step 3: `drizzle.pg.config.ts` 작성(프로젝트 루트, 기존 `drizzle.config.ts`와 별개 파일)**

```ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './db/pg/schema.ts',
  out: './db/pg/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config
```

- [ ] **Step 4: `package.json`에 스크립트 추가**

기존 `"scripts"` 블록에 추가(기존 `db:push`/`db:seed`는 sqlite용이므로 그대로 두고, pg 전용 이름으로 새로 추가):
```json
    "db:pg:generate": "drizzle-kit generate --config=drizzle.pg.config.ts",
    "db:pg:push": "drizzle-kit push --config=drizzle.pg.config.ts",
```

- [ ] **Step 5: 실제 테이블 생성**

Run: `npx drizzle-kit push --config=drizzle.pg.config.ts`
Expected: `reference_documents`, `ai_classification_log` 두 테이블이 Neon Postgres에 생성됨(대화형 프롬프트가 나오면 "Yes, I want to..." 선택).

- [ ] **Step 6: 스모크 스크립트로 검증(스크래치, 커밋 안 함)**

`.superpowers/sdd/scratch/smoke-pg-schema.ts`:
```ts
import { pgDb } from '../../../db/pg/client'
import { referenceDocuments, aiClassificationLog } from '../../../db/pg/schema'

async function main() {
  const inserted = await pgDb.insert(referenceDocuments).values({
    title: '테스트자료', vendor: '테스트업체', trade: '전기', version: 1,
    fileType: 'pdf', blobUrl: 'https://example.com/test.pdf', extractedText: '테스트 내용',
  }).returning()
  if (inserted[0].isActive !== true) throw new Error('FAIL: default isActive should be true')

  const log = await pgDb.insert(aiClassificationLog).values({
    caseNumber: 'DEF-TEST-001',
    inputSnapshot: { title: 't', description: 'd', location: 'l', facility: 'f', occurredAt: '2026-07-13', category: '전기' },
    aiSuggestion: { constructionPct: 70, usagePct: 20, warrantyPct: 10, reasoning: 'r', citedDocs: [], adminChecklist: [], recommendedAction: 'a', confidenceLabel: '중간', confidencePct: 65, fallback: false, recommendedDefectType: '하자사항', recommendedResponsibilityType: '시공사 귀책', recommendedCostBearer: '시공사' },
  }).returning()
  if (log[0].wasAiAccepted !== null) throw new Error('FAIL: wasAiAccepted should default to null')

  await pgDb.delete(referenceDocuments).where(pgDb.$dynamic ? undefined as never : undefined as never).catch(() => {})
  console.log('PASS: reference_documents + ai_classification_log insert/select works, defaults correct')
}
main()
```
Run: `npx tsx --env-file=.env.local .superpowers/sdd/scratch/smoke-pg-schema.ts`
Expected: `PASS: ...` 출력. (테스트 행은 정리하지 않아도 무방 — 실제 데이터 없는 상태에서의 스키마 검증용. 통과 후 스크래치 파일 삭제.)

- [ ] **Step 7: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 8: Commit**

```bash
git add db/pg drizzle.pg.config.ts package.json
git commit -m "feat: add Postgres schema for reference_documents and ai_classification_log"
```

---

### Task 3: 기준자료 텍스트/표 추출 유틸리티

**Files:**
- Create: `lib/referenceDocExtract.ts`

**Interfaces:**
- Consumes: 없음(순수 함수, Buffer 입력)
- Produces:
  - `export interface ExtractedContent { extractedText: string | null; structuredRows: StructuredRow[] | null; extractionFailed: boolean }`
  - `export interface StructuredRow { trade: string; item: string; free: string | null; paid: string | null; note: string | null }`
  - `export async function extractReferenceDoc(buffer: Buffer, fileType: 'pdf' | 'docx' | 'xlsx'): Promise<ExtractedContent>` — Task 4(업로드 라우트)가 이 함수 하나만 호출한다.

- [ ] **Step 1: `lib/referenceDocExtract.ts` 작성**

```ts
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
```

- [ ] **Step 2: 스모크 스크립트로 검증(스크래치, 커밋 안 함) — 실제 국보디자인 파일로 테스트**

`.superpowers/sdd/scratch/smoke-extract.ts`:
```ts
import { readFileSync } from 'fs'
import { extractReferenceDoc } from '../../../lib/referenceDocExtract'

async function main() {
  const pdfBuf = readFileSync('C:\\Users\\신민호\\Downloads\\2026.05.22_유무상안내구분자료_국보디자인 (1).pdf')
  const pdfResult = await extractReferenceDoc(pdfBuf, 'pdf')
  if (pdfResult.extractionFailed) throw new Error('FAIL: pdf extraction failed')
  if (!pdfResult.extractedText?.includes('시공상 문제')) throw new Error('FAIL: pdf text missing expected content')
  console.log('PASS pdf: extracted', pdfResult.extractedText!.length, 'chars')

  const xlsxBuf = readFileSync('C:\\Users\\신민호\\Downloads\\하자보증(유 무상)구분표_국보디자인.xlsx')
  const xlsxResult = await extractReferenceDoc(xlsxBuf, 'xlsx')
  if (xlsxResult.extractionFailed) throw new Error('FAIL: xlsx extraction failed')
  if (!xlsxResult.structuredRows || xlsxResult.structuredRows.length < 50) {
    throw new Error(`FAIL: expected 50+ rows, got ${xlsxResult.structuredRows?.length}`)
  }
  const sample = xlsxResult.structuredRows.find(r => r.item === '박리')
  if (!sample || sample.trade !== '도장' || sample.free !== '무상') {
    throw new Error(`FAIL: expected 도장/박리/무상 row, got ${JSON.stringify(sample)}`)
  }
  console.log('PASS xlsx:', xlsxResult.structuredRows.length, 'rows, sample row correct:', JSON.stringify(sample))
}
main()
```
Run: `npx tsx .superpowers/sdd/scratch/smoke-extract.ts`
Expected: 두 개의 `PASS ...` 라인. xlsx 쪽 행이 50개 미만이거나 샘플 행이 다르면, `extractXlsxRows`의 헤더 스킵/컬럼 인덱스 가정이 실제 파일과 안 맞는 것이므로 — 이 스텝의 담당자가 직접 `console.log(rows.slice(0,10))`로 실제 셀 배열을 찍어보고 컬럼 인덱스(cells[1]/[2]/[3]/[4]/[5])를 실물에 맞게 조정한다(파일이 실존하며 이미 한 차례 실제로 파싱해본 결과 5~6열 구조가 확인됨 — 스프레드시트 병합 셀 특성상 라이브러리 버전에 따라 빈 문자열 `''`이 아닌 `undefined`로 나올 수 있으니 두 경우 모두 `null` 처리되는지 확인).

통과 후 스크래치 파일 삭제(커밋 안 함).

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add lib/referenceDocExtract.ts
git commit -m "feat: add PDF/Word/Excel text and table extraction for reference documents"
```

---

### Task 4: 기준자료 API — 업로드 + 목록 (`/api/reference-docs`)

**Files:**
- Create: `app/api/reference-docs/route.ts`

**Interfaces:**
- Consumes: `pgDb`, `referenceDocuments` from `db/pg/schema.ts`/`db/pg/client.ts`(Task 2); `extractReferenceDoc` from `lib/referenceDocExtract.ts`(Task 3)
- Produces: `GET /api/reference-docs?activeOnly=true|false` → `ReferenceDocumentRow[]`; `POST /api/reference-docs`(multipart/form-data: file, title, vendor, trade?, uploadedBy?) → 생성된 `ReferenceDocumentRow` — Task 6(관리자 UI)이 이 두 엔드포인트를 호출한다.

- [ ] **Step 1: `app/api/reference-docs/route.ts` 작성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { eq, and, desc } from 'drizzle-orm'
import { pgDb } from '@/db/pg/client'
import { referenceDocuments } from '@/db/pg/schema'
import { extractReferenceDoc } from '@/lib/referenceDocExtract'

export async function GET(req: NextRequest) {
  const activeOnly = req.nextUrl.searchParams.get('activeOnly') === 'true'
  const rows = activeOnly
    ? await pgDb.select().from(referenceDocuments).where(eq(referenceDocuments.isActive, true)).orderBy(desc(referenceDocuments.uploadedAt))
    : await pgDb.select().from(referenceDocuments).orderBy(desc(referenceDocuments.uploadedAt))
  return NextResponse.json(rows)
}

function detectFileType(fileName: string): 'pdf' | 'docx' | 'xlsx' | null {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'xlsx') return 'xlsx'
  return null
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const title = String(form.get('title') ?? '').trim()
    const vendor = String(form.get('vendor') ?? '').trim()
    const trade = form.get('trade') ? String(form.get('trade')) : null
    const uploadedBy = form.get('uploadedBy') ? String(form.get('uploadedBy')) : null

    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    if (!title || !vendor) return NextResponse.json({ error: '자료명과 업체명은 필수입니다.' }, { status: 400 })

    const fileType = detectFileType(file.name)
    if (!fileType) return NextResponse.json({ error: 'PDF, Word(.docx), Excel(.xlsx) 파일만 업로드할 수 있습니다.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const blob = await put(`reference-docs/${Date.now()}-${file.name}`, buffer, { access: 'public' })
    const extracted = await extractReferenceDoc(buffer, fileType)

    const existing = await pgDb.select().from(referenceDocuments)
      .where(and(eq(referenceDocuments.vendor, vendor), eq(referenceDocuments.title, title), eq(referenceDocuments.isActive, true)))
    let version = 1
    let supersedes: number | null = null
    if (existing.length > 0) {
      const prev = existing[0]
      version = prev.version + 1
      supersedes = prev.id
      await pgDb.update(referenceDocuments).set({ isActive: false }).where(eq(referenceDocuments.id, prev.id))
    }

    const [inserted] = await pgDb.insert(referenceDocuments).values({
      title, vendor, trade, version, fileType, blobUrl: blob.url,
      extractedText: extracted.extractedText,
      structuredRows: extracted.structuredRows,
      extractionFailed: extracted.extractionFailed,
      isActive: true, supersedes, uploadedBy,
    }).returning()

    return NextResponse.json(inserted)
  } catch (err) {
    console.error('reference-docs upload failed:', err)
    return NextResponse.json({ error: '업로드 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 개발 서버로 수동 확인**

Run: `npm run dev`
`curl -F "file=@C:\Users\신민호\Downloads\하자보증(유 무상)구분표_국보디자인.xlsx" -F "title=유무상구분표" -F "vendor=국보디자인" http://localhost:3000/api/reference-docs`
Expected: JSON 응답에 `id`, `version: 1`, `structuredRows`(150+ 개 배열), `isActive: true` 포함.
동일 업체+자료명으로 한 번 더 같은 명령 실행 → 두 번째 응답이 `version: 2`, `supersedes: <첫 응답 id>`인지 확인. `GET http://localhost:3000/api/reference-docs?activeOnly=true`가 두 번째(버전2)만 반환하는지 확인. 개발 서버 중지.

- [ ] **Step 4: Commit**

```bash
git add app/api/reference-docs/route.ts
git commit -m "feat: add reference document upload/list API with automatic versioning"
```

---

### Task 5: 기준자료 API — 적용여부 토글 + 삭제 (`/api/reference-docs/[id]`)

**Files:**
- Create: `app/api/reference-docs/[id]/route.ts`

**Interfaces:**
- Consumes: `pgDb`, `referenceDocuments`(Task 2)
- Produces: `PATCH /api/reference-docs/:id`(`{ isActive: boolean }`) → 갱신된 row; `DELETE /api/reference-docs/:id` → `{ ok: true, restoredId: number | null }` — Task 6이 호출.

- [ ] **Step 1: `app/api/reference-docs/[id]/route.ts` 작성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { pgDb } from '@/db/pg/client'
import { referenceDocuments } from '@/db/pg/schema'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const body = await req.json()
  if (typeof body.isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive(boolean)가 필요합니다.' }, { status: 400 })
  }
  const [updated] = await pgDb.update(referenceDocuments).set({ isActive: body.isActive }).where(eq(referenceDocuments.id, id)).returning()
  if (!updated) return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const [target] = await pgDb.select().from(referenceDocuments).where(eq(referenceDocuments.id, id))
  if (!target) return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })

  await pgDb.delete(referenceDocuments).where(eq(referenceDocuments.id, id))

  let restoredId: number | null = null
  if (target.isActive && target.supersedes != null) {
    await pgDb.update(referenceDocuments).set({ isActive: true }).where(eq(referenceDocuments.id, target.supersedes))
    restoredId = target.supersedes
  }
  return NextResponse.json({ ok: true, restoredId })
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 개발 서버로 수동 확인**

Run: `npm run dev`. Task 4에서 만든 두 버전(v1 비활성, v2 활성) 중 v2의 `DELETE /api/reference-docs/<v2 id>` 호출 → 응답 `restoredId`가 v1의 id인지 확인, `GET ?activeOnly=true`에 v1이 다시 나오는지 확인. 개발 서버 중지.

- [ ] **Step 4: Commit**

```bash
git add "app/api/reference-docs/[id]/route.ts"
git commit -m "feat: add reference document activation toggle and delete-with-version-restore"
```

---

### Task 6: 관리자 화면 — "AI 하자 기준자료 관리"

**Files:**
- Create: `app/admin/ai-reference-docs/page.tsx`
- Modify: `components/layout/SideNav.tsx`

**Interfaces:**
- Consumes: `/api/reference-docs`(GET/POST), `/api/reference-docs/[id]`(PATCH/DELETE) from Task 4/5; `canAccessAdminSettings`, `useCurrentRole`, `useCurrentUserName` from `@/lib/permissions`(기존, 무수정)
- Produces: 없음(최종 화면)

- [ ] **Step 1: `components/layout/SideNav.tsx`의 `adminItems`에 항목 추가**

기존:
```tsx
const adminItems = [
  { href: '/admin/users',         label: '사용자 관리',   icon: 'fa-solid fa-users-gear' },
  { href: '/admin/permissions',   label: '권한 관리',     icon: 'fa-solid fa-shield-halved' },
  { href: '/admin/login-history', label: '로그인 이력',   icon: 'fa-solid fa-right-to-bracket' },
  { href: '/admin/user-audit',    label: '계정 변경 이력', icon: 'fa-solid fa-clock-rotate-left' },
]
```
를:
```tsx
const adminItems = [
  { href: '/admin/users',            label: '사용자 관리',       icon: 'fa-solid fa-users-gear' },
  { href: '/admin/permissions',      label: '권한 관리',         icon: 'fa-solid fa-shield-halved' },
  { href: '/admin/ai-reference-docs', label: 'AI 하자 기준자료 관리', icon: 'fa-solid fa-file-shield' },
  { href: '/admin/login-history',    label: '로그인 이력',       icon: 'fa-solid fa-right-to-bracket' },
  { href: '/admin/user-audit',       label: '계정 변경 이력',     icon: 'fa-solid fa-clock-rotate-left' },
]
```
로 교체.

- [ ] **Step 2: `app/admin/ai-reference-docs/page.tsx` 작성**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { canAccessAdminSettings, useCurrentRole, useCurrentUserName } from '@/lib/permissions'
import AccessDenied from '@/components/ui/AccessDenied'

interface ReferenceDocumentRow {
  id: number
  title: string
  vendor: string
  trade: string | null
  version: number
  fileType: string
  blobUrl: string
  extractionFailed: boolean
  isActive: boolean
  supersedes: number | null
  uploadedBy: string | null
  uploadedAt: string
}

const TRADE_OPTIONS = ['건축/인테리어', '전기', '설비 냉난방', '방수', '엘리베이터', '조경', '기타']

export default function AiReferenceDocsPage() {
  const role = useCurrentRole()
  const userName = useCurrentUserName()
  const [docs, setDocs] = useState<ReferenceDocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ title: '', vendor: '', trade: TRADE_OPTIONS[0] })
  const [file, setFile] = useState<File | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/reference-docs')
    setDocs(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (!canAccessAdminSettings(role)) {
    return <AccessDenied message="관리자만 AI 기준자료를 관리할 수 있습니다." />
  }

  async function submitUpload() {
    if (!file || !form.title.trim() || !form.vendor.trim()) { alert('자료명, 업체명, 파일을 모두 입력하세요.'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', form.title.trim())
      fd.append('vendor', form.vendor.trim())
      fd.append('trade', form.trade)
      fd.append('uploadedBy', userName)
      const res = await fetch('/api/reference-docs', { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); alert(e.error ?? '업로드 실패'); return }
      setShowUpload(false)
      setForm({ title: '', vendor: '', trade: TRADE_OPTIONS[0] })
      setFile(null)
      await load()
    } finally {
      setUploading(false)
    }
  }

  async function toggleActive(id: number, isActive: boolean) {
    await fetch(`/api/reference-docs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) })
    await load()
  }

  async function removeDoc(id: number) {
    if (!confirm('이 기준자료를 완전히 삭제하시겠습니까?')) return
    await fetch(`/api/reference-docs/${id}`, { method: 'DELETE' })
    await load()
  }

  const cell: React.CSSProperties = { padding: '10px 14px', fontSize: '0.78rem', color: '#425466', borderBottom: '1px solid #f0f4f8' }

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>AI 하자 기준자료 관리</h1>
          <div style={{ fontSize: '0.75rem', color: '#697386', marginTop: 3 }}>
            여러 시공사의 유무상 구분 기준자료를 업로드·버전관리합니다. 적용(활성) 상태인 자료만 AI 분석에 사용됩니다.
          </div>
        </div>
        <button onClick={() => setShowUpload(true)} style={{ padding: '9px 18px', background: '#635bff', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
          <i className="fa-solid fa-upload" style={{ marginRight: 6 }} />새 기준자료 업로드
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafbfc' }}>
              {['자료명', '업체명', '공종', '버전', '등록일', '적용여부', '동작'].map(h => (
                <th key={h} style={{ ...cell, fontWeight: 700, color: '#0a2540', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && docs.length === 0 && (
              <tr><td colSpan={7} style={{ ...cell, textAlign: 'center', padding: 40 }}>등록된 기준자료가 없습니다.</td></tr>
            )}
            {docs.map(d => (
              <tr key={d.id}>
                <td style={cell}>
                  <a href={d.blobUrl} target="_blank" rel="noreferrer" style={{ color: '#635bff', textDecoration: 'none' }}>{d.title}</a>
                  {d.extractionFailed && <span style={{ marginLeft: 6, color: '#be1044', fontSize: '0.68rem' }}>⚠ 추출 실패</span>}
                </td>
                <td style={cell}>{d.vendor}</td>
                <td style={cell}>{d.trade ?? '-'}</td>
                <td style={cell}>v{d.version}</td>
                <td style={cell}>{new Date(d.uploadedAt).toLocaleDateString('ko-KR')}</td>
                <td style={cell}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={d.isActive} onChange={e => toggleActive(d.id, e.target.checked)} />
                    <span style={{ color: d.isActive ? '#059669' : '#aab' }}>{d.isActive ? '적용중' : '비활성'}</span>
                  </label>
                </td>
                <td style={cell}>
                  <button onClick={() => removeDoc(d.id)} style={{ padding: '4px 10px', background: '#fef0f4', color: '#be1044', border: '1px solid #fecdd3', borderRadius: 6, fontSize: '0.7rem', cursor: 'pointer' }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,37,64,.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setShowUpload(false) }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 420, boxShadow: '0 8px 28px rgba(10,37,64,.13)' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0a2540', marginBottom: 16 }}>새 기준자료 업로드</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>자료명</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: 유무상안내구분자료" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e3e8ef', borderRadius: 7, fontSize: '0.82rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>업체명 (제한 없음, 직접 입력)</label>
                <input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="예: 국보디자인" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e3e8ef', borderRadius: 7, fontSize: '0.82rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>공종</label>
                <select value={form.trade} onChange={e => setForm(f => ({ ...f, trade: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e3e8ef', borderRadius: 7, fontSize: '0.82rem' }}>
                  {TRADE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>파일 (PDF, Word, Excel)</label>
                <input type="file" accept=".pdf,.docx,.xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ width: '100%', fontSize: '0.8rem' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowUpload(false)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', cursor: 'pointer' }}>취소</button>
              <button onClick={submitUpload} disabled={uploading} style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 700, border: 'none', background: '#635bff', color: '#fff', cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.7 : 1 }}>
                {uploading ? '업로드 중...' : '업로드'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 개발 서버로 수동 확인**

Run: `npm run dev`. `admin`/`admin1234`로 로그인 → 사이드바 "관리자 설정"에 "AI 하자 기준자료 관리" 메뉴가 보이는지, 클릭 시 화면 진입하는지, 업로드 모달에서 실제 국보디자인 xlsx/pdf 파일 업로드가 표(자료명/업체명/공종/버전/등록일/적용여부)에 나타나는지, 체크박스로 적용여부 토글이 되는지, 삭제 버튼이 동작하는지 확인. 개발 서버 중지.

- [ ] **Step 5: Commit**

```bash
git add app/admin/ai-reference-docs/page.tsx components/layout/SideNav.tsx
git commit -m "feat: add admin UI for AI defect reference document management"
```

---

### Task 7: Gemini 분석 서비스 (`lib/aiDefectClassifier.ts`)

**Files:**
- Create: `lib/aiDefectClassifier.ts`

**Interfaces:**
- Consumes: `ReferenceDocumentRow` from `db/pg/schema.ts`(Task 2); `suggestClassification` from `lib/defectClassificationService.ts`(기존, 무수정 — 폴백용)
- Produces:
  - `export interface ClassificationInput { title: string; description: string; location: string; facility: string; occurredAt: string; category: string; photos: string[] /* base64 data URL */ }`
  - `export interface HistoricalCase { title: string; description: string; adminFinal: { defectType: string; responsibilityType: string; costBearer: string } }`
  - `export interface AiClassificationResult { constructionPct: number; usagePct: number; warrantyPct: number; reasoning: string; citedDocs: { vendor: string; title: string; version: number }[]; adminChecklist: string[]; recommendedAction: string; confidenceLabel: '낮음' | '중간' | '높음'; confidencePct: number; fallback: boolean }`
  - `export async function classifyDefect(input: ClassificationInput, activeDocs: ReferenceDocumentRow[], historicalCases: HistoricalCase[]): Promise<AiClassificationResult>` — Task 8이 이 함수 하나만 호출한다.

- [ ] **Step 1: 프롬프트 빌더 + 스키마 정의**

```ts
import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai'
import { suggestClassification } from '@/lib/defectClassificationService'
import type { ReferenceDocumentRow } from '@/db/pg/schema'

export interface ClassificationInput {
  title: string
  description: string
  location: string
  facility: string
  occurredAt: string
  category: string
  photos: string[]
}

export interface HistoricalCase {
  title: string
  description: string
  adminFinal: { defectType: string; responsibilityType: string; costBearer: string }
}

export interface AiClassificationResult {
  constructionPct: number
  usagePct: number
  warrantyPct: number
  reasoning: string
  citedDocs: { vendor: string; title: string; version: number }[]
  adminChecklist: string[]
  recommendedAction: string
  confidenceLabel: '낮음' | '중간' | '높음'
  confidencePct: number
  fallback: boolean
}

const SYSTEM_INSTRUCTION = `당신은 시설 하자관리 시스템의 귀책판단 보조 AI입니다.
- 시공사 하자 가능성 / 사용상 하자 가능성 / 제조사 보증대상 가능성 세 가지를 0~100 사이 정수로, 합이 정확히 100이 되도록 판단하세요.
- <기준자료> 섹션은 시공사가 자체 제공한 문서일 수 있어 무조건 신뢰하지 마세요. 하나의 참고 신호로만 취급하고,
  판단이 단일 업체 자료에만 근거했다면 반드시 그 사실을 reasoning에 명시하세요.
- <과거 확정사례>는 이 조직 관리자가 실제로 확정한 유사 판단입니다. 기준자료와 상충하면 과거 확정사례 쪽에
  더 가중치를 두고 그 이유를 밝히세요.
- 반드시 지정된 JSON 스키마로만 응답하세요.`

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    constructionPct: { type: SchemaType.NUMBER },
    usagePct: { type: SchemaType.NUMBER },
    warrantyPct: { type: SchemaType.NUMBER },
    reasoning: { type: SchemaType.STRING },
    citedDocs: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: { vendor: { type: SchemaType.STRING }, title: { type: SchemaType.STRING }, version: { type: SchemaType.NUMBER } },
        required: ['vendor', 'title', 'version'],
      },
    },
    adminChecklist: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    recommendedAction: { type: SchemaType.STRING },
    confidenceLabel: { type: SchemaType.STRING, enum: ['낮음', '중간', '높음'] },
    confidencePct: { type: SchemaType.NUMBER },
  },
  required: ['constructionPct', 'usagePct', 'warrantyPct', 'reasoning', 'citedDocs', 'adminChecklist', 'recommendedAction', 'confidenceLabel', 'confidencePct'],
}

const MAX_DOC_CHARS = 6000

function docLabel(d: ReferenceDocumentRow): string {
  return `[${d.vendor} / ${d.title} v${d.version}]`
}

function buildDocsSection(docs: ReferenceDocumentRow[]): string {
  if (docs.length === 0) return '<기준자료>\n등록된 기준자료가 없습니다. 일반적인 시설관리 상식으로 판단하세요.\n</기준자료>'
  const parts = docs.map(d => {
    if (d.structuredRows && d.structuredRows.length > 0) {
      const table = d.structuredRows.map(r => `- 공종:${r.trade} / 항목:${r.item} / 무상:${r.free ?? '-'} / 유상:${r.paid ?? '-'} / 비고:${r.note ?? '-'}`).join('\n')
      return `${docLabel(d)}\n${table}`
    }
    const text = (d.extractedText ?? '').slice(0, MAX_DOC_CHARS)
    return `${docLabel(d)}\n${text}`
  })
  return `<기준자료>\n${parts.join('\n\n')}\n</기준자료>`
}

function buildHistorySection(cases: HistoricalCase[]): string {
  if (cases.length === 0) return '<과거 확정사례>\n과거 유사 확정사례가 없습니다.\n</과거 확정사례>'
  const parts = cases.map((c, i) =>
    `사례 ${i + 1}: "${c.title}" — ${c.description}\n→ 관리자 최종 판단: 하자구분=${c.adminFinal.defectType}, 귀책=${c.adminFinal.responsibilityType}, 비용부담=${c.adminFinal.costBearer}`
  )
  return `<과거 확정사례>\n${parts.join('\n\n')}\n</과거 확정사례>`
}

function buildPrompt(input: ClassificationInput, docs: ReferenceDocumentRow[], cases: HistoricalCase[]): string {
  return `<하자 정보>
제목: ${input.title}
상세설명: ${input.description}
위치: ${input.location}
설비: ${input.facility}
발생일: ${input.occurredAt}
공종: ${input.category}
</하자 정보>

${buildDocsSection(docs)}

${buildHistorySection(cases)}`
}

function renormalize(result: AiClassificationResult): AiClassificationResult {
  const sum = result.constructionPct + result.usagePct + result.warrantyPct
  if (sum === 100 || sum === 0) return result
  const scale = 100 / sum
  return {
    ...result,
    constructionPct: Math.round(result.constructionPct * scale),
    usagePct: Math.round(result.usagePct * scale),
    warrantyPct: Math.round(result.warrantyPct * scale),
  }
}

function toFallback(input: ClassificationInput): AiClassificationResult {
  const suggestion = suggestClassification({ title: input.title, description: input.description })
  const pctByConfidence: Record<string, number> = { 낮음: 30, 중간: 55, 높음: 75 }
  const isConstruction = suggestion.responsibilityType === '시공사 귀책'
  return {
    constructionPct: isConstruction ? 70 : 15,
    usagePct: isConstruction ? 15 : 70,
    warrantyPct: 15,
    reasoning: `AI 분석을 사용할 수 없어 규칙 기반 추정치입니다. ${suggestion.reasoning}`,
    citedDocs: [],
    adminChecklist: ['AI 분석이 실패했으므로 관리자가 직접 검토 후 확정하세요.'],
    recommendedAction: '기준자료와 현장 사진을 직접 확인해 최종 판단하세요.',
    confidenceLabel: '낮음',
    confidencePct: pctByConfidence[suggestion.confidence] ?? 30,
    fallback: true,
  }
}

export async function classifyDefect(input: ClassificationInput, activeDocs: ReferenceDocumentRow[], historicalCases: HistoricalCase[]): Promise<AiClassificationResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return toFallback(input)

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite',
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
    })

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: buildPrompt(input, activeDocs, historicalCases) },
    ]
    for (const photo of input.photos) {
      const match = photo.match(/^data:(image\/[a-z]+);base64,(.+)$/)
      if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
    }

    const result = await model.generateContent(parts)
    const parsed = JSON.parse(result.response.text()) as Omit<AiClassificationResult, 'fallback'>
    return renormalize({ ...parsed, fallback: false })
  } catch (err) {
    console.error('Gemini classification failed:', err)
    return toFallback(input)
  }
}
```

- [ ] **Step 2: 스모크 스크립트로 검증(스크래치, 커밋 안 함) — 폴백 경로(키 없이) + 재정규화**

`.superpowers/sdd/scratch/smoke-classifier.ts`:
```ts
import { classifyDefect } from '../../../lib/aiDefectClassifier'

async function main() {
  // GEMINI_API_KEY를 일부러 지워서 폴백 경로 테스트
  delete process.env.GEMINI_API_KEY
  const result = await classifyDefect(
    { title: '시공 불량으로 인한 벽 균열', description: '시공 불량', location: '3층', facility: '벽체', occurredAt: '2026-07-13', category: '건축/인테리어', photos: [] },
    [], []
  )
  if (!result.fallback) throw new Error('FAIL: expected fallback=true when GEMINI_API_KEY missing')
  if (result.constructionPct + result.usagePct + result.warrantyPct !== 100) {
    throw new Error(`FAIL: fallback percentages should sum to 100, got ${result.constructionPct + result.usagePct + result.warrantyPct}`)
  }
  console.log('PASS: fallback path works, percentages sum to 100:', JSON.stringify(result))
}
main()
```
Run: `npx tsx .superpowers/sdd/scratch/smoke-classifier.ts`
Expected: `PASS: ...` 출력. (실제 Gemini 호출 경로는 Task 1의 `GEMINI_API_KEY`가 준비된 뒤 Task 8~9의 개발 서버 수동 확인 단계에서 검증한다 — 이 스텝은 키가 없을 때의 안전한 폴백만 확인.)

통과 후 스크래치 파일 삭제(커밋 안 함).

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add lib/aiDefectClassifier.ts
git commit -m "feat: add Gemini-based defect classification service with rule-based fallback"
```

---

### Task 8: `/api/ai/classify` 라우트

**Files:**
- Create: `app/api/ai/classify/route.ts`

**Interfaces:**
- Consumes: `classifyDefect`, `ClassificationInput`(Task 7); `pgDb`, `referenceDocuments`, `aiClassificationLog`(Task 2)
- Produces: `POST /api/ai/classify`(body: `{ title, description, location, facility, occurredAt, category, photos }`) → `AiClassificationResult` JSON — Task 10(AiClassificationPanel)이 호출.

- [ ] **Step 1: 유사 과거사례 조회 + 라우트 작성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { eq, or, and, desc, sql } from 'drizzle-orm'
import { pgDb } from '@/db/pg/client'
import { referenceDocuments, aiClassificationLog } from '@/db/pg/schema'
import { classifyDefect, type HistoricalCase } from '@/lib/aiDefectClassifier'

async function findSimilarCases(category: string, facility: string, keywords: string[]): Promise<HistoricalCase[]> {
  const rows = await pgDb.select().from(aiClassificationLog)
    .where(sql`${aiClassificationLog.adminFinal} is not null`)
    .orderBy(desc(aiClassificationLog.confirmedAt))
    .limit(50)

  const matched = rows.filter(r => {
    const snap = r.inputSnapshot
    const sameCategoryAndKeyword = snap.category === category && keywords.filter(k => snap.title.includes(k) || snap.description.includes(k)).length >= 3
    const sameFacility = snap.facility === facility
    return sameCategoryAndKeyword || sameFacility
  }).slice(0, 5)

  return matched.map(r => ({
    title: r.inputSnapshot.title,
    description: r.inputSnapshot.description,
    adminFinal: r.adminFinal!,
  }))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, description, location, facility, occurredAt, category, photos } = body

    const activeDocs = await pgDb.select().from(referenceDocuments).where(eq(referenceDocuments.isActive, true))
    const keywords = `${title} ${description}`.split(/\s+/).filter(w => w.length >= 2)
    const historicalCases = await findSimilarCases(category ?? '', facility ?? '', keywords)

    const result = await classifyDefect(
      { title: title ?? '', description: description ?? '', location: location ?? '', facility: facility ?? '', occurredAt: occurredAt ?? '', category: category ?? '', photos: photos ?? [] },
      activeDocs, historicalCases
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('/api/ai/classify failed:', err)
    return NextResponse.json({ error: '분석 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 개발 서버로 수동 확인 (`GEMINI_API_KEY` 준비된 상태 가정)**

Run: `npm run dev`
```bash
curl -X POST http://localhost:3000/api/ai/classify -H "Content-Type: application/json" -d "{\"title\":\"천장 누수\",\"description\":\"우천시 3층 천장에서 누수 발생\",\"location\":\"3층\",\"facility\":\"천장\",\"occurredAt\":\"2026-07-13\",\"category\":\"방수\",\"photos\":[]}"
```
Expected: `constructionPct`+`usagePct`+`warrantyPct`가 100, `reasoning`에 실제 문장, `fallback: false`(키가 정상이면). `GEMINI_API_KEY`가 아직 없다면 `fallback: true`로 응답하는 것으로 대체 확인.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/classify/route.ts
git commit -m "feat: add /api/ai/classify endpoint combining reference docs and historical cases"
```

---

### Task 9: `/api/ai/confirm` 라우트

**Files:**
- Create: `app/api/ai/confirm/route.ts`

**Interfaces:**
- Consumes: `pgDb`, `aiClassificationLog`(Task 2)
- Produces: `POST /api/ai/confirm`(body: `{ caseNumber, inputSnapshot, aiSuggestion, adminFinal }`) → `{ ok: true }` — Task 11/12(등록/상세 화면의 "관리자 최종 확정")가 호출.

- [ ] **Step 1: `app/api/ai/confirm/route.ts` 작성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { pgDb } from '@/db/pg/client'
import { aiClassificationLog } from '@/db/pg/schema'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { caseNumber, inputSnapshot, aiSuggestion, adminFinal, confirmedBy } = body
    if (!caseNumber || !inputSnapshot || !aiSuggestion || !adminFinal) {
      return NextResponse.json({ error: 'caseNumber, inputSnapshot, aiSuggestion, adminFinal이 모두 필요합니다.' }, { status: 400 })
    }

    const wasAiAccepted =
      adminFinal.defectType === aiSuggestion.recommendedDefectType &&
      adminFinal.responsibilityType === aiSuggestion.recommendedResponsibilityType &&
      adminFinal.costBearer === aiSuggestion.recommendedCostBearer

    const existing = await pgDb.select().from(aiClassificationLog).where(eq(aiClassificationLog.caseNumber, caseNumber))
    if (existing.length > 0) {
      await pgDb.update(aiClassificationLog).set({
        inputSnapshot, aiSuggestion, adminFinal, wasAiAccepted, confirmedBy, confirmedAt: new Date(),
      }).where(eq(aiClassificationLog.caseNumber, caseNumber))
    } else {
      await pgDb.insert(aiClassificationLog).values({
        caseNumber, inputSnapshot, aiSuggestion, adminFinal, wasAiAccepted, confirmedBy, confirmedAt: new Date(),
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('/api/ai/confirm failed:', err)
    return NextResponse.json({ error: '확정 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
```

`wasAiAccepted` 판정을 위해 Task 10의 `AiClassificationResult`에 AI가 추천한 defectType/responsibilityType/costBearer 3개 필드가 필요하다 — Task 7의 `AiClassificationResult`에는 확률/근거만 있고 구체적 defectType 추천값이 없다. 이 갭을 Task 10에서 클라이언트 측 매핑 함수(`mapPctToDefectType` 등, 확률 최댓값 기준 defectType 결정)로 메꾸고, `/api/ai/confirm` 호출 시 클라이언트가 계산한 `aiSuggestion.recommendedDefectType/recommendedResponsibilityType/recommendedCostBearer` 3개를 함께 보낸다 — 위 코드의 `aiSuggestion.recommendedDefectType` 등 참조가 그 계산된 값을 가리킨다(Task 10에서 정의).

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add app/api/ai/confirm/route.ts
git commit -m "feat: add /api/ai/confirm endpoint to log admin final classification decisions"
```

---

### Task 10: `AiClassificationPanel` 공유 컴포넌트

**Files:**
- Create: `components/defects/AiClassificationPanel.tsx`

**Interfaces:**
- Consumes: `AiClassificationResult` shape from Task 7/8(중복 정의하지 않고 이 컴포넌트 파일에서 재선언 — lib 파일을 클라이언트 컴포넌트가 import하면 서버 전용 `@google/generative-ai`가 브라우저 번들에 포함될 위험이 있으므로, 타입만 별도로 이 파일에 선언한다)
- Produces:
  - `export interface AiClassificationResult { ...(Task 7과 동일 shape) }`
  - `export function mapPctToDefectType(result: AiClassificationResult): { defectType: string; responsibilityType: string; costBearer: string }` — 확률 최댓값을 실제 select 옵션 값으로 매핑(시공사 최댓값→"하자사항"/"시공사 귀책"/"시공사", 사용상 최댓값→"일반사항"/"사용자 과실"/"사용자", 제조사보증 최댓값→"확인 필요"/"원인 불명"/"제조사" — 기존 `app/defects/[id]/page.tsx`의 select `<option>` 목록과 정확히 일치하는 문자열이어야 한다).
  - `export default function AiClassificationPanel(props: { input: {...}; onApply: (mapped) => void; caseNumber: string }): JSX.Element` — Task 11/12가 이 컴포넌트 하나를 임포트해서 쓴다.

- [ ] **Step 1: 상세페이지의 select 옵션 문자열 확인**

Run: `grep -n "DEFECT_TYPE_OPTIONS\|RESPONSIBILITY_OPTIONS" "app/defects/new/page.tsx"`
Expected(이미 Task 착수 전 확인됨, 참고용): `DEFECT_TYPE_OPTIONS = ['하자사항', '일반사항', '확인 필요']`, `RESPONSIBILITY_OPTIONS = ['시공사 귀책', '재단/운영측 부담', '외주업체 부담', '사용자 과실', '소모품/노후', '원인 불명', '분쟁 가능']`. `costBearer`는 상세페이지의 `classifyForm.costBearer` select 옵션(예: '시공사', '재단', '외주업체', '사용자', '보험/기타', '미정' — `lib/aiReportService.ts`의 `buildCostBearerSections`가 쓰는 동일 목록, `bearers` 배열)을 그대로 따른다.

- [ ] **Step 2: `components/defects/AiClassificationPanel.tsx` 작성**

```tsx
'use client'

import { useEffect, useState } from 'react'

export interface AiClassificationResult {
  constructionPct: number
  usagePct: number
  warrantyPct: number
  reasoning: string
  citedDocs: { vendor: string; title: string; version: number }[]
  adminChecklist: string[]
  recommendedAction: string
  confidenceLabel: '낮음' | '중간' | '높음'
  confidencePct: number
  fallback: boolean
}

export function mapPctToDefectType(result: AiClassificationResult): { defectType: string; responsibilityType: string; costBearer: string } {
  const max = Math.max(result.constructionPct, result.usagePct, result.warrantyPct)
  if (max === result.constructionPct) return { defectType: '하자사항', responsibilityType: '시공사 귀책', costBearer: '시공사' }
  if (max === result.usagePct) return { defectType: '일반사항', responsibilityType: '사용자 과실', costBearer: '사용자' }
  return { defectType: '확인 필요', responsibilityType: '원인 불명', costBearer: '보험/기타' }
}

function confidenceColor(pct: number): string {
  if (pct >= 80) return '#059669'
  if (pct >= 60) return '#d97706'
  return '#be1044'
}

function ProbBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
        <span style={{ color: '#425466', fontWeight: 600 }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: '#f0f4f8', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} />
      </div>
    </div>
  )
}

export interface AiClassificationInput {
  title: string
  description: string
  location: string
  facility: string
  occurredAt: string
  category: string
  photos: string[]
}

export default function AiClassificationPanel({
  input, onApply, autoRun = true,
}: {
  input: AiClassificationInput
  onApply: (mapped: { defectType: string; responsibilityType: string; costBearer: string }, result: AiClassificationResult) => void
  autoRun?: boolean
}) {
  const [result, setResult] = useState<AiClassificationResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function runAnalysis() {
    if (!input.title.trim() && !input.description.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/ai/classify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      })
      if (res.ok) setResult(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!autoRun) return
    const t = setTimeout(() => { if (input.title.trim().length >= 2 || input.description.trim().length >= 5) runAnalysis() }, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.title, input.description])

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e3e8ef', padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0a2540' }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#635bff', marginRight: 6 }} />AI 분석 — 하자구분 및 귀책판단
        </div>
        <button onClick={runAnalysis} disabled={loading} style={{ padding: '5px 12px', borderRadius: 7, fontSize: '0.7rem', border: '1px solid #e3e8ef', background: '#f8fafc', color: '#425466', cursor: loading ? 'wait' : 'pointer' }}>
          <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} style={{ marginRight: 5 }} />{loading ? '분석 중...' : 'AI 재분석'}
        </button>
      </div>

      {!result && !loading && <div style={{ fontSize: '0.78rem', color: '#aab', padding: '20px 0', textAlign: 'center' }}>제목 또는 상세설명을 입력하면 자동으로 분석합니다.</div>}
      {loading && !result && <div style={{ fontSize: '0.78rem', color: '#697386', padding: '20px 0', textAlign: 'center' }}>AI가 기준자료와 과거 사례를 검토하고 있습니다...</div>}

      {result && (
        <div>
          {result.fallback && (
            <div style={{ padding: '6px 10px', background: '#fef3e2', color: '#b06b1a', borderRadius: 7, fontSize: '0.7rem', marginBottom: 12 }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 5 }} />AI 분석에 실패해 규칙 기반 추정치입니다.
            </div>
          )}

          <ProbBar label="시공사 하자 가능성" pct={result.constructionPct} color="#635bff" />
          <ProbBar label="사용상 하자 가능성" pct={result.usagePct} color="#d97706" />
          <ProbBar label="제조사 보증 대상 가능성" pct={result.warrantyPct} color="#059669" />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
            <span style={{ color: confidenceColor(result.confidencePct) }}>
              {'★'.repeat(Math.round(result.confidencePct / 20))}{'☆'.repeat(5 - Math.round(result.confidencePct / 20))}
            </span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: confidenceColor(result.confidencePct) }}>
              신뢰도 {result.confidenceLabel} ({result.confidencePct}%)
            </span>
          </div>

          <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 9, fontSize: '0.76rem', color: '#425466', lineHeight: 1.6, marginBottom: 10 }}>
            {result.reasoning}
          </div>

          {result.citedDocs.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {result.citedDocs.map((d, i) => (
                <span key={i} style={{ fontSize: '0.68rem', padding: '3px 9px', background: 'rgba(99,91,255,.08)', color: '#635bff', borderRadius: 99 }}>
                  {d.vendor} · {d.title} v{d.version}
                </span>
              ))}
            </div>
          )}

          {result.adminChecklist.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#B06B1A', marginBottom: 4 }}>관리자 확인사항</div>
              {result.adminChecklist.map((c, i) => <div key={i} style={{ fontSize: '0.74rem', color: '#425466', lineHeight: 1.6 }}>· {c}</div>)}
            </div>
          )}

          <div style={{ fontSize: '0.74rem', color: '#0a2540', marginBottom: 14 }}>
            <strong>추천 조치:</strong> {result.recommendedAction}
          </div>

          <button
            onClick={() => onApply(mapPctToDefectType(result), result)}
            style={{ width: '100%', padding: '9px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, border: 'none', background: '#635bff', color: '#fff', cursor: 'pointer' }}
          >
            AI 추천 적용
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add components/defects/AiClassificationPanel.tsx
git commit -m "feat: add shared AiClassificationPanel component for defect classification UI"
```

---

### Task 11: 등록 화면 연동 (`app/defects/new/page.tsx`)

**Files:**
- Modify: `app/defects/new/page.tsx`

**Interfaces:**
- Consumes: `AiClassificationPanel`, `mapPctToDefectType`, `AiClassificationResult`(Task 10)
- Produces: 없음(최종 연동)

- [ ] **Step 1: import 추가**

기존 import 블록 맨 아래에 추가:
```tsx
import AiClassificationPanel, { type AiClassificationResult } from '@/components/defects/AiClassificationPanel'
```

- [ ] **Step 2: 기존 "AI 기준자료 판단결과" 배너를 새 패널로 교체**

`grep -n "classificationSuggestion" app/defects/new/page.tsx`로 현재 배너가 렌더링되는 정확한 JSX 위치를 찾는다(이 배너는 `suggestClassification()` 호출 결과를 보여주는 블록 — Task 담당자가 실제 파일에서 그 블록 전체를 찾아, 다음으로 교체):

```tsx
<AiClassificationPanel
  input={{
    title: form.title, description: form.description, location: form.locationText,
    facility: form.facilityName, occurredAt: form.firstOccurredAt, category: getFieldTab(
      form.categoryId === '__custom__' ? customCategoryName : (state.categories.find(c => c.id === Number(form.categoryId))?.name ?? '')
    ),
    photos: photoPreviews,
  }}
  onApply={(mapped) => {
    setForm(f => ({ ...f, defectType: mapped.defectType, responsibilityType: mapped.responsibilityType }))
  }}
/>
```
(`photoPreviews`는 파일 상단에 이미 `useMemo`로 정의된 `photoFiles.map(f => URL.createObjectURL(f))` — object URL이라 `fetch` 본문으로 그대로 보내면 서버에서 못 읽으므로, **Step 3에서 base64로 바꾼다**.)

기존의 `classificationSuggestion` state/관련 `suggestClassification()` 호출은 그대로 둔다(다른 곳에서 `defect.aiClassification` 저장용으로 여전히 쓰이므로 무수정 — 이번 Task는 화면에 보이는 배너만 교체).

- [ ] **Step 3: 사진을 base64로 넘기기 위한 헬퍼 추가**

`photoPreviews`(object URL)는 서버로 못 보내므로, `AiClassificationPanel`에 넘길 `photos`는 `photoFiles`를 base64로 변환해서 써야 한다. 컴포넌트 함수 안, `photoPreviews` 정의 바로 다음에 추가:
```tsx
const [photoBase64, setPhotoBase64] = useState<string[]>([])
useEffect(() => {
  Promise.all(photoFiles.map(f => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(f)
  }))).then(setPhotoBase64)
}, [photoFiles])
```
그리고 Step 2의 `photos: photoPreviews`를 `photos: photoBase64`로 교체.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 5: 개발 서버로 수동 확인**

Run: `npm run dev`. `/defects/new`에서 제목 입력 → 약 1초 후 AI 분석 패널이 자동으로 동작하는지(로딩 → 결과), 사진 첨부 후 재분석 시 사진이 함께 전송되는지(Network 탭에서 `/api/ai/classify` payload의 `photos` 배열에 data URL이 들어있는지), "AI 추천 적용" 클릭 시 하자구분/귀책 select가 채워지는지 확인. 개발 서버 중지.

- [ ] **Step 6: Commit**

```bash
git add app/defects/new/page.tsx
git commit -m "feat: wire AI classification panel into defect registration form"
```

---

### Task 12: 상세 화면 연동 + 관리자 최종 확정 시 이력 저장 (`app/defects/[id]/page.tsx`)

**Files:**
- Modify: `app/defects/[id]/page.tsx`

**Interfaces:**
- Consumes: `AiClassificationPanel`, `mapPctToDefectType`, `AiClassificationResult`(Task 10); `/api/ai/confirm`(Task 9)
- Produces: 없음(최종 연동)

- [ ] **Step 1: import 추가**

```tsx
import AiClassificationPanel, { type AiClassificationResult } from '@/components/defects/AiClassificationPanel'
```

- [ ] **Step 2: 최근 AI 결과를 보관할 state 추가**

`classifyForm` state 선언 바로 다음에 추가:
```tsx
const [lastAiResult, setLastAiResult] = useState<AiClassificationResult | null>(null)
```

- [ ] **Step 3: 기존 "하자구분 및 귀책판단" 카드의 AI 추천 표시 블록을 `AiClassificationPanel`로 교체**

`grep -n "defect.aiClassification" "app/defects/[id]/page.tsx"`로 현재 "AI 추천 (신뢰도 ...)" 배너 JSX를 찾아, 다음으로 교체:
```tsx
<AiClassificationPanel
  input={{
    title: defect.title, description: defect.description ?? '', location: defect.locationText ?? '',
    facility: defect.facilityName ?? '', occurredAt: defect.firstOccurredAt ?? '', category: state.categories.find(c => c.id === defect.categoryId)?.name ?? '',
    photos: [],
  }}
  autoRun={false}
  onApply={(mapped, result) => {
    setLastAiResult(result)
    setClassifyField('defectType', mapped.defectType)
    setClassifyField('responsibilityType', mapped.responsibilityType)
    setClassifyField('costBearer', mapped.costBearer)
  }}
/>
```
(상세 화면은 등록 화면과 달리 자동 실행하지 않는다 — 이미 등록 시점에 분석이 이뤄졌을 것이므로, 관리자가 "AI 재분석" 버튼을 눌렀을 때만 최신 활성 기준자료로 다시 조회한다. 사진은 Phase 1에서는 상세화면에서 재전송하지 않는다 — 첨부파일 조회/base64 변환은 범위 밖.)

- [ ] **Step 4: `submitClassification()`에서 확정 시 `/api/ai/confirm` 호출 추가**

기존:
```tsx
function submitClassification() {
    const result = updateClassification(defect.id, {
```
을 찾아, 그 함수를 `async function submitClassification()`으로 바꾸고, 기존 `updateClassification(...)` 호출이 `{ ok: true }`를 반환한 뒤(기존 `if (!result.ok) alert(result.error)` 로직 유지) 그 다음에 추가:
```tsx
    if (result.ok && lastAiResult) {
      const mapped = mapPctToDefectType(lastAiResult)
      fetch('/api/ai/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseNumber: defect.caseNumber,
          inputSnapshot: { title: defect.title, description: defect.description ?? '', location: defect.locationText ?? '', facility: defect.facilityName ?? '', occurredAt: defect.firstOccurredAt ?? '', category: state.categories.find(c => c.id === defect.categoryId)?.name ?? '' },
          aiSuggestion: { ...lastAiResult, recommendedDefectType: mapped.defectType, recommendedResponsibilityType: mapped.responsibilityType, recommendedCostBearer: mapped.costBearer },
          adminFinal: { defectType: classifyForm.defectType, responsibilityType: classifyForm.responsibilityType, costBearer: classifyForm.costBearer, reason: classifyForm.classificationReason || null },
          confirmedBy: defect.managerName ?? null,
        }),
      }).catch(err => console.error('AI confirm log failed (non-blocking):', err))
    }
```
(`import { mapPctToDefectType } from '@/components/defects/AiClassificationPanel'`도 Step 1의 import에 함께 추가. 이 호출은 `.catch`로만 처리하고 `await`하지 않는다 — 이력 로깅 실패가 실제 하자구분 확정을 막으면 안 되므로 fire-and-forget.)

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 6: 개발 서버로 수동 확인**

Run: `npm run dev`. 상세 페이지에서 "AI 재분석" 클릭 → 패널이 결과를 보여주는지, "AI 추천 적용" → select들이 채워지는지, "관리자 최종 확정" 클릭 후 Network 탭에서 `/api/ai/confirm` 호출이 200을 반환하는지 확인. Postgres에 직접 `SELECT * FROM ai_classification_log`로 행이 쌓였는지 확인(가능하면 `psql` 또는 Neon 대시보드 SQL 편집기). 개발 서버 중지.

- [ ] **Step 7: Commit**

```bash
git add "app/defects/[id]/page.tsx"
git commit -m "feat: wire AI classification panel into defect detail page, log confirmations"
```

---

### Task 13: 전체 타입체크 + 프로덕션 빌드 게이트

**Files:** 없음(검증 전용)

- [ ] **Step 1: 전체 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 2: 프로덕션 빌드**

Run: `npm run build`
Expected: `Compiled successfully`, 신규 라우트(`/admin/ai-reference-docs`, `/api/reference-docs`, `/api/reference-docs/[id]`, `/api/ai/classify`, `/api/ai/confirm`)가 모두 정상 빌드됨. `app/reports/*`, `app/analytics/*`, `app/dashboard/*` 등 무수정 대상 라우트도 그대로 빌드됨(First Load JS 크기가 그 라우트들에서 갑자기 커지지 않았는지 빌드 출력 표로 확인 — `@google/generative-ai`/`pg`/`pdf-parse`/`mammoth`는 전부 서버 전용 API 라우트에서만 쓰이므로 클라이언트 번들에 절대 포함되면 안 된다).

- [ ] **Step 3: Commit 없음(검증 전용 Task)**

---

### Task 14: Playwright QA — 전체 흐름 검증

**Files:** 없음(검증 전용)

- [ ] **Step 1: 개발 서버 기동, Playwright 준비**

`npm run dev` 백그라운드 실행. `npm install --no-save playwright@1.61.1`(캐시된 Chromium 재사용).

- [ ] **Step 2: 기준자료 관리 화면 QA**

로그인(`admin`/`admin1234`) 후 `/admin/ai-reference-docs`에서:
- 국보디자인 xlsx 업로드 → 표에 1행 추가, 적용여부 "적용중" 확인
- 같은 업체+자료명으로 pdf도 업로드 → 별도 자료명으로 등록되므로 2개 행 확인(자료명이 다르면 버전 체인이 아니라 별개 문서)
- xlsx를 한 번 더(자료명 동일) 업로드 → 버전 2가 되고 버전 1이 "비활성"으로 표시되는지
- 버전 1 체크박스를 다시 켜서 두 버전이 동시에 활성 상태가 될 수 있는지(의도된 예외 동작) 확인 후 다시 끔

- [ ] **Step 3: 하자 등록 화면 AI 분석 QA**

`/defects/new`에서 제목 "천장 도장 박리", 상세설명 "3층 복도 천장 도장면이 벗겨짐" 입력 → AI 분석 패널이 자동으로 동작해 결과를 표시하는지(로딩 → 확률 게이지 3개 → 신뢰도 → 근거 → 참고자료 chip에 "국보디자인" 포함 여부 — 업로드된 xlsx의 "도장/박리/무상" 행과 관련된 근거가 언급되는지 reasoning 텍스트로 확인) → "AI 추천 적용" 클릭 후 하자구분/귀책 select 값이 채워지는지 → 등록 완료.

- [ ] **Step 4: 상세 화면 재분석 + 확정 이력 QA**

방금 등록한 하자의 상세 페이지에서 "AI 재분석" → 결과 재확인 → "관리자 최종 확정" 클릭 → 성공 알럿/문구 확인. `/api/reference-docs`에서 방금 쓴 xlsx 문서를 비활성화한 뒤 다시 "AI 재분석" → reasoning에 "등록된 기준자료 없음"류 문구가 섞이거나, 활성 자료가 국보디자인 pdf 하나뿐이라면 그것만 인용되는지 확인(최신 활성 자료 기준으로 판단이 바뀌는지의 핵심 검증).

- [ ] **Step 5: 폴백 경로 회귀 확인**

`.env.local`에서 `GEMINI_API_KEY`를 임시로 주석 처리 → 개발 서버 재기동 → `/defects/new`에서 AI 패널이 여전히 동작하며 주황색 "AI 분석에 실패해 규칙 기반 추정치입니다" 배지와 함께 결과를 보여주는지(등록 자체가 막히지 않는지) 확인. 확인 후 `.env.local`을 원복.

- [ ] **Step 6: 콘솔 에러 + 무수정 대상 회귀 확인**

Playwright `page.on('console', ...)`로 위 모든 단계에서 콘솔 에러 0건 확인. `/reports/ai`, `/dashboard`, `/analytics`가 여전히 정상 동작하는지(이번 Task들이 그 파일들을 건드리지 않았음을 최종 확인).

- [ ] **Step 7: 정리 및 보고**

스크래치 스크립트/스크린샷 삭제, dev 서버 종료(타겟 프로세스만, 전체 node 프로세스 죽이지 말 것). 결과를 표로 정리해 보고. 실패 항목이 있으면 해당 Task로 돌아가 수정 후 Task 13부터 재검증. **QA 전 항목이 모두 통과하기 전에는 commit이 이미 되어 있더라도 push/deploy하지 않는다.**
