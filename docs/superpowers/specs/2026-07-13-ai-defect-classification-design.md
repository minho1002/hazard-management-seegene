# 하자구분 및 귀책판단 AI 고도화 — 설계 스펙 (Phase 1)

- 작성일: 2026-07-13
- 대상 화면: `app/defects/new/page.tsx`(등록), `app/defects/[id]/page.tsx`(상세 — 하자구분 및 귀책판단 패널), 신규 `app/admin/ai-reference-docs/page.tsx`(관리자 설정)
- 범위: **Phase 1만** — 기준자료 관리 + AI 분석 엔진 + 등록/상세 화면 연동 + 관리자 확정. 학습 정확도 통계·AI 보고서 집계 위젯은 Phase 2(별도 스펙, Phase 1의 `classification_history` 데이터가 쌓인 뒤 설계)로 미룬다.

## 1. 배경 / 목표

현재 "하자구분 및 귀책판단"은 `lib/defectClassificationService.ts`의 `suggestClassification()`이 제목/설명 문자열에 대한 순수 키워드 매칭으로 1차 추천을 만들고, 관리자가 `app/defects/[id]/page.tsx`의 select들로 직접 확정하는 구조다. 실제 LLM 호출은 전혀 없다 — 이 프로젝트의 모든 "AI" 기능(`aiReportService`, `aiAnalysisService`, `defectClassificationService`, AI 어시스턴트 챗봇)이 규칙 기반이며, `lib/gemini.ts`(`@google/generative-ai`, 기본 모델 `gemini-3.1-flash-lite`)는 코드에 존재하지만 **어디에서도 import되지 않는 미사용 스캐폴딩**이다(`GEMINI_API_KEY` 미설정).

이번 작업은:
1. 시공사가 제공한 유무상 기준자료(PDF/Excel/Word, 여러 업체분 동시 관리)를 관리자가 업로드·버전관리할 수 있는 화면을 새로 만들고,
2. 하자 등록 시 제목/상세설명/사진/위치/설비/발생일을 입력하면 **Gemini 3.1 Flash-Lite**가 활성 기준자료 전체 + 과거 관리자 확정 이력을 함께 검토해 시공사 하자/사용상/제조사보증 3개 확률과 근거·참고자료·추천조치를 실시간으로 제시하고,
3. 관리자가 그 추천을 그대로 적용하거나 수정한 뒤 "관리자 최종 확정"으로 마무리하며, 이 확정 결과가 다음 판단의 참고자료로 쓰이게 한다.

시공사 자료는 **자사에 유리하게 작성됐을 수 있어 그대로 신뢰하지 않는다** — AI 프롬프트에 이 전제를 명시하고, 단일 업체 자료에만 근거한 판단은 반드시 근거 카드에서 그 사실을 밝히도록 강제한다.

### 핵심 전제(사용자 확인 완료)
- 기준자료는 **조직 전체가 공유**해야 하므로 신규 공유 인프라(Vercel Blob + Vercel Postgres)를 도입한다. 기존 앱의 하자 데이터 자체(브라우저 `localStorage`, `lib/store.ts`)는 건드리지 않는다 — AI 판단 이력만 서버에 케이스번호로 기록해 여러 관리자/기기에서 조회 가능하게 한다.
- LLM은 **Gemini 3.1 Flash-Lite**(`@google/generative-ai`, 이미 `package.json`에 존재). 텍스트/이미지/PDF 멀티모달을 지원하나, Word/Excel은 멀티모달 입력 목록에 없으므로 **PDF/Word/Excel 셋 다 서버에서 텍스트(또는 표)로 추출**해 일관된 파이프라인으로 다룬다.
- 사진은 실제로 시각 분석한다(base64 inline image part로 Gemini에 전달).
- 기준자료가 새 버전으로 교체되면, 이후 모든 분석(재분석 포함)은 최신 활성 버전만 사용한다.
- 방금 확인한 실제 자료 예시: `국보디자인` 유무상 구분자료(PDF: 텍스트 위주 설명, Excel: `구분표` 시트 151행 — `공종 | 내용(하위항목) | 무상(시공상 불량) | 유상(유지관리미비·사용상파손) | 비고` 표) — 이 구조가 아래 데이터 모델의 `structured_rows` 설계 근거다.

## 2. 신규 인프라

| 항목 | 선택 | 사유 |
|---|---|---|
| 파일 저장 | Vercel Blob | 업로드 원본(PDF/Word/Excel) 보관. Vercel 배포와 동일 계정에서 바로 provisioning 가능 |
| 메타데이터/추출텍스트/이력 DB | Vercel Postgres (Marketplace, Neon) | 관계형 쿼리(업체별/공종별/버전 체인, 유사사례 검색)가 자연스러움. `db/db.ts`(sqlite, 미사용 방치 코드)는 그대로 두고 건드리지 않음 — 완전히 별도의 새 스키마 |
| LLM | `@google/generative-ai` (Gemini 3.1 Flash-Lite) | 이미 의존성 존재. `GEMINI_API_KEY` 신규 발급 필요 |
| PDF 텍스트 추출 | `pdf-parse` (신규 npm) | Vercel 서버리스에서 셔틀아웃 없이 순수 JS로 동작 |
| Word 텍스트 추출 | `mammoth` (신규 npm) | `.docx` → plain text |
| Excel 표 추출 | `xlsx` (기존 의존성 재사용) | 이미 `lib/reportExportExcel.ts`... 는 `exceljs`로 바뀌었으나, **읽기 전용 파싱**은 기존 `xlsx` 패키지로 충분(현재 `app/reports/page.tsx`가 아직 씀 — 삭제 금지 사유였던 그 패키지) |

신규 환경변수: `GEMINI_API_KEY`, `BLOB_READ_WRITE_TOKEN`(Vercel Blob 연동 시 자동 주입), `POSTGRES_URL`류(Vercel Postgres 연동 시 자동 주입). 로컬 개발 시 `.env.local`에 동일 키 추가.

## 3. 데이터 모델 (신규 Postgres 스키마, Drizzle)

```ts
// db/schema/aiClassification.ts (신규 파일 — 기존 db/schema.ts는 무수정)

export const referenceDocuments = pgTable('reference_documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),            // 자료명, 예: "유무상안내구분자료"
  vendor: text('vendor').notNull(),           // 업체명, 예: "국보디자인" — 자유 입력, 화이트리스트 없음
  trade: text('trade'),                       // 공종, 예: "건축/인테리어", "전기", "설비 냉난방" — nullable(문서 전체가 여러 공종을 아우를 수 있음)
  version: integer('version').notNull(),      // 1부터 증가
  fileType: text('file_type').notNull(),      // 'pdf' | 'docx' | 'xlsx'
  blobUrl: text('blob_url').notNull(),        // Vercel Blob 원본 URL
  extractedText: text('extracted_text'),      // PDF/Word 추출 텍스트 (xlsx는 null)
  structuredRows: jsonb('structured_rows'),    // xlsx 전용: [{ trade, item, free, paid, note }][]
  isActive: boolean('is_active').notNull().default(true),
  supersedes: integer('supersedes'),           // 이전 버전의 id (버전 체인)
  uploadedBy: text('uploaded_by'),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
})

export const classificationHistory = pgTable('classification_history', {
  id: serial('id').primaryKey(),
  caseNumber: text('case_number').notNull(),   // 하자 케이스번호(DEF-2026-001) — defects는 localStorage라 id 대신 케이스번호로 연결
  inputSnapshot: jsonb('input_snapshot').notNull(), // { title, description, location, facility, occurredAt, category } — 분석 시점 입력값 보관(재현/디버깅용). category(공종)는 4.3의 유사사례 매칭 키로 쓰임
  aiSuggestion: jsonb('ai_suggestion').notNull(),   // { constructionPct, usagePct, warrantyPct, reasoning, citedDocs[], adminChecklist[], recommendedAction, confidenceLabel, confidencePct }
  adminFinal: jsonb('admin_final'),                 // { defectType, responsibilityType, costBearer, reason } — 확정 전에는 null
  wasAiAccepted: boolean('was_ai_accepted'),        // 관리자가 AI 추천을 그대로 썼는지 여부(확정 시점에 계산)
  confirmedBy: text('confirmed_by'),
  confirmedAt: timestamp('confirmed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

`structuredRows`의 행 형태는 국보디자인 Excel 실물 구조를 그대로 반영한다:
```ts
interface StructuredRow { trade: string; item: string; free: string | null; paid: string | null; note: string | null }
// 예: { trade: "도장", item: "박리", free: "무상", paid: null, note: "도장면의 박리(운영상 자외선 또는 온습도에 의한 박리는 유상)" }
```

## 4. API 라우트 (신규, 기존 스텁 라우트는 무수정)

### 4.1 `app/api/reference-docs/route.ts`
- `GET`: 전체 목록 조회(관리자 화면 테이블용). `?activeOnly=true` 쿼리로 활성본만 필터.
- `POST`: 파일 업로드. `multipart/form-data`(file, title, vendor, trade). 처리:
  1. 파일을 Vercel Blob에 업로드
  2. `fileType`에 따라 텍스트/표 추출(`pdf-parse` / `mammoth` / `xlsx`)
  3. 같은 `vendor`+`title` 조합의 기존 활성 문서가 있으면: 그 문서를 `isActive=false`로 내리고, 새 행의 `version = 기존.version + 1`, `supersedes = 기존.id`로 저장(자동 버전 체인). 없으면 `version = 1`.

### 4.2 `app/api/reference-docs/[id]/route.ts`
- `PATCH`: `{ isActive: boolean }` — 적용여부 토글(과거 버전을 다시 활성화하는 경우 등, 예외적 수동 조작 허용).
- `DELETE`: 완전 삭제(오탈자 업로드 등 실수 회수용 — 버전 히스토리에서 지우는 게 아니라 진짜 삭제. 활성 버전 삭제 시 이전 버전이 있으면 자동으로 그 버전을 `isActive=true`로 복원, 없으면 그냥 삭제).

### 4.3 `app/api/ai/classify/route.ts` (신규 — 기존 `app/api/ai/analyze/route.ts`는 무수정, 별도 엔드포인트)
- `POST` body: `{ title, description, location, facility, occurredAt, category, photos: string[] /* base64 data URL */ }`
- 처리 순서:
  1. `referenceDocuments`에서 `isActive=true` 전체 조회 (업체 제한 없음)
  2. `classificationHistory`에서 유사 과거 확정사례 조회 — Phase 1 유사도 기준(OR 조건, 하나라도 만족하면 후보에 포함): (a) `category`(공종) 동일 AND `title`/`description` 키워드 3개 이상 일치, 또는 (b) `facility`(설비) 동일. 후보 중 `confirmedAt` 최신순 최대 5건
  3. Gemini 프롬프트 구성(아래 5장)
  4. Gemini 응답을 구조화 스키마로 강제 파싱(`responseSchema` 사용, JSON 강제) — `constructionPct + usagePct + warrantyPct`가 100이 아니면 서버에서 비례 재정규화
  5. 클라이언트에 결과 반환. **이 시점에는 아직 `classificationHistory`에 저장하지 않는다** — 관리자가 "관리자 최종 확정"을 눌러야 비로소 1행이 생성/갱신된다(중간에 여러 번 재분석해도 이력이 쌓이지 않도록).
- 실패(키 누락/타임아웃/Gemini 에러) 시: 500이 아니라 `{ fallback: true, suggestion: <suggestClassification() 결과> }`를 200으로 반환 — 클라이언트가 "AI 분석 실패 — 규칙 기반 추정치" 배지와 함께 기존 로직 결과를 보여줌. 등록/판단 흐름이 AI 장애로 막히지 않는다.

### 4.4 `app/api/ai/confirm/route.ts` (신규)
- `POST` body: `{ caseNumber, aiSuggestion, adminFinal }` — 관리자가 확정을 누른 순간 호출. `classificationHistory`에 upsert(같은 `caseNumber`로 재확정 시 갱신), `wasAiAccepted`는 `adminFinal`이 `aiSuggestion`이 제안한 defectType/responsibilityType/costBearer와 정확히 같은지로 서버에서 계산.

## 5. Gemini 프롬프트 설계

시스템 지침(고정):
```
당신은 시설 하자관리 시스템의 귀책판단 보조 AI입니다.
- 시공사 하자 가능성 / 사용상 하자 가능성 / 제조사 보증대상 가능성 세 가지를 0~100 사이 정수로, 합이 정확히 100이 되도록 판단하세요.
- <기준자료> 섹션은 시공사가 자체 제공한 문서일 수 있어 무조건 신뢰하지 마세요. 하나의 참고 신호로만 취급하고,
  판단이 단일 업체 자료에만 근거했다면 반드시 그 사실을 reasoning에 명시하세요.
- <과거 확정사례>는 이 조직 관리자가 실제로 확정한 유사 판단입니다. 기준자료와 상충하면 과거 확정사례 쪽에
  더 가중치를 두고 그 이유를 밝히세요.
- 반드시 지정된 JSON 스키마로만 응답하세요.
```
사용자 메시지 구성: 등록 입력값(제목/설명/위치/설비/발생일) → `<기준자료>`(업체명·자료명·버전 라벨과 함께 `extractedText` 또는 `structuredRows`를 업체별로 구분해 나열, 총량이 너무 크면 문서당 6000자 컷) → `<과거 확정사례>`(최대 5건, 제목/설명 요약 + 당시 관리자 최종 판단) → 사진(있으면 inline image part로 각각 첨부).

출력 스키마(`responseSchema`):
```ts
{
  constructionPct: number, usagePct: number, warrantyPct: number,
  reasoning: string,
  citedDocs: { vendor: string; title: string; version: number }[],
  adminChecklist: string[],
  recommendedAction: string,
  confidenceLabel: '낮음' | '중간' | '높음',
  confidencePct: number,   // 0~100
}
```
신뢰도 배지 색상: 80%+ 초록, 60~79% 주황, 60 미만 빨강(요청 스펙 그대로).

## 6. UI

### 6.1 관리자 설정 — "AI 하자 기준자료 관리" (`app/admin/ai-reference-docs/page.tsx`, `SideNav.tsx`에 링크 추가)
- 기존 `app/admin/users/page.tsx` 톤의 테이블: 자료명 / 업체명 / 공종 / 버전 / 등록일 / 적용여부(토글) / 동작(새 버전 업로드·삭제)
- 상단 "새 기준자료 업로드" 버튼 → 모달(자료명, 업체명 자유 입력 — 화이트리스트 없음, 공종 선택 또는 직접입력, 파일 선택 .pdf/.docx/.xlsx)
- 같은 업체+자료명으로 재업로드하면 자동으로 새 버전(이전 버전은 목록에 "v1 (비활성)"으로 남음, 클릭하면 원문 다운로드 가능)

### 6.2 등록 화면 (`app/defects/new/page.tsx`)
- 기존 "AI 기준자료 판단결과" 배너를 새 "AI 분석 패널" 컴포넌트(`components/defects/AiClassificationPanel.tsx`, 신규)로 교체
- 제목+상세설명이 일정 길이 이상 채워지면 기존 `analyzeFieldMemo` 디바운스 패턴과 동일하게 자동 트리거(수동 "다시 분석" 버튼도 제공)
- 패널 구성(요청 스펙 그대로): 3개 확률 게이지(시공사/사용상/제조사보증) → 신뢰도 별점+%+색상 배지 → 근거 카드(reasoning + 무엇을 검색했는지 불릿) → 참고 기준자료 chip(업체명·자료명·버전) → 관리자 확인사항 체크리스트 → 추천 조치 → "AI 추천 적용"(원클릭으로 defectType/responsibilityType/costBearer 필드 채움) 버튼. 수동 수정은 기존 select들 그대로 사용.
- 폴백 상태(AI 실패): 패널 상단에 주황 배지 "AI 분석에 실패해 규칙 기반 추정치입니다" + 기존 `suggestClassification()` 결과 표시.

### 6.3 상세 화면 (`app/defects/[id]/page.tsx`)
- "하자구분 및 귀책판단" 카드를 6.2와 동일한 `AiClassificationPanel` 컴포넌트로 교체(공유 컴포넌트).
- "AI 재분석" 버튼 추가 — 클릭 시 그 시점 최신 활성 기준자료로 `/api/ai/classify` 재호출(기준자료가 갱신됐으면 새 결과가 반영됨, 요청 스펙의 핵심 요구사항).
- "관리자 최종 확정" 버튼은 기존과 동일한 권한 체크(`canFinalizeClassification`)를 유지하되, 확정 시 `/api/ai/confirm`도 함께 호출해 이력을 남긴다.

## 7. 에러/장애 대응

- `GEMINI_API_KEY` 미설정 또는 Gemini 호출 실패/타임아웃(8초 초과) → 4.3의 폴백 경로로 즉시 전환, 등록/확정 자체는 절대 막지 않음.
- 활성 기준자료가 0건인 상태 → AI는 사진/텍스트만으로 판단하고 reasoning에 "등록된 기준자료 없음 — 일반 판단" 명시.
- 업로드 파일 텍스트 추출 실패(손상 파일 등) → 업로드 자체는 저장하되 `extractedText`/`structuredRows`를 null로 두고 관리자 화면에 "⚠ 추출 실패" 표시, AI 분석 시 그 문서는 스킵(전체 분석이 막히지 않음).

## 8. 범위 제외 (Phase 2)

- `classification_history` 기반 AI 정확도/관리자 수정률 자동 통계
- AI 보고서(`/reports/ai`)에 시공사/사용상/제조사보증/미확정 자동 집계 위젯 추가
- 유사사례 검색 고도화(현재는 키워드+공종 매칭, Phase 2에서 임베딩 기반 유사도로 개선 검토)
