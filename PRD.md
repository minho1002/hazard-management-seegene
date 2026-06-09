# PRD — 시설 하자관리 시스템 (AI 고도화)
**Product Requirements Document**
작성일: 2026-04-28 | 최종수정: 2026-06-09 | 작성: 시설관리팀 | 버전: 2.0

---

## 개정 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| 1.0 | 2026-04-28 | 최초 작성 |
| 1.1 | 2026-05-20 | 도면 업로드, AI 어시스턴트 기능 명세 추가 |
| 2.0 | 2026-06-09 | AI 고도화 6단계 구현 반영 (3.6~3.8 신규, 데이터 모델 확장) |

---

## 1. 제품 개요

**제품명**: 대전충청검사센터 시설 하자관리 시스템  
**형태**: Next.js 14 App Router (Vercel 배포)  
**배포 URL**: https://hazard-management-seegene.vercel.app  
**기술 스택**: Next.js 14 + TypeScript + localStorage 상태관리 + Rule-Based AI Service

| 패키지 | 버전 | 용도 |
|---|---|---|
| next | 14.2.29 | 프레임워크 |
| react | ^18.3.1 | UI |
| typescript | ^5 | 타입 안전성 |
| better-sqlite3 | ^11.10.0 | DB (스키마 정의 — API 미사용) |
| drizzle-orm | ^0.41.0 | ORM |
| @anthropic-ai/sdk | 설치됨 | LLM 연동 준비 (현재 미사용) |
| @google/generative-ai | ^0.24.1 | AI 어시스턴트 (Gemini) |
| chart.js | ^4.4.8 | 차트 |
| xlsx | ^0.18.5 | Excel 다운로드 |

> **상태 관리**: 모든 하자 데이터는 `localStorage` (`hajaSys2` 키)에 저장된다. API Route는 AI 분석(`/api/ai/analyze`)에만 사용된다.

---

## 2. 사용자 스토리

### 시설관리팀 담당자 — 기존 기능

| ID | 스토리 | 우선순위 | 상태 |
|---|---|---|---|
| US-01 | 층별 도면 위에 클릭해서 하자 위치를 표시하고 등록한다 | 높음 | ✅ 완료 |
| US-02 | 하자 목록에서 상태/카테고리/심각도로 필터링한다 | 높음 | ✅ 완료 |
| US-03 | 하자 상세 화면에서 이력을 타임라인으로 확인한다 | 높음 | ✅ 완료 |
| US-04 | 이력 추가 버튼으로 조치 내역과 비용을 기록한다 | 높음 | ✅ 완료 |
| US-05 | 보고서 기간을 선택하고 PDF/Excel/Word로 다운로드한다 | 높음 | ✅ 완료 |
| US-06 | 미리보기로 인쇄 레이아웃을 확인하고 인쇄한다 | 높음 | ✅ 완료 |
| US-07 | 실제 도면 이미지를 업로드해서 SVG 플레이스홀더를 교체한다 | 중간 | ✅ 완료 |
| US-08 | AI 어시스턴트에게 하자 현황을 자연어로 질문한다 | 중간 | ✅ 완료 |

### 시설관리팀 담당자 — AI 고도화 기능 *(v2.0 신규)*

| ID | 스토리 | 우선순위 | 상태 |
|---|---|---|---|
| US-09 | 현장에서 메모한 내용을 입력하면 AI가 하자 등록 폼을 자동으로 채워준다 | 높음 | ✅ 완료 |
| US-10 | AI 분석 결과(증상·원인·위험도)가 하자 이력과 함께 저장되어 추후 조회 가능하다 | 높음 | ✅ 완료 |
| US-11 | 하자 목록에서 AI가 분석한 원인분류 뱃지를 확인할 수 있다 | 중간 | ✅ 완료 |
| US-12 | "지난달 누수 하자", "HVAC 비용 많이 사용한 건" 등 자연어로 검색할 수 있다 | 높음 | ✅ 완료 |
| US-13 | 자연어 검색어가 어떻게 파싱됐는지 카테고리·위치·기간·정렬 칩으로 확인한다 | 중간 | ✅ 완료 |
| US-14 | 신규 하자 등록 시 과거 유사 사례를 기반으로 예상 수리 비용과 신뢰도를 확인한다 | 높음 | ✅ 완료 |

---

## 3. 기능 명세

### 3.1 대시보드 (`/dashboard`)

**KPI 카드 (4개)**
- 전체 하자 건수 / 진행중 건수 / 완료 건수 / 이번 달 신규 등록 건수

**차트 (4개)**
- 월별 발생 추이 — area line chart (최근 12개월)
- 카테고리별 분포 — horizontal insight bars
- 심각도 분포 — horizontal insight bars
- 협력업체별 누적 비용 — bar chart

---

### 3.2 하자 목록 (`/defects`)

**필터 행 1 — AI 자연어 검색** *(v2.0 신규)*
- `✨ AI 검색` 레이블 + 자유 텍스트 입력창 (보라색 테두리)
- 입력 시 파싱 결과를 카테고리/위치/원인/키워드/기간/정렬 칩으로 표시
- `×` 버튼으로 초기화

**필터 행 2 — 기존 필터 (유지)**
- 텍스트 검색 (제목), 상태·심각도·카테고리 드롭다운, 초기화 버튼
- 두 행의 필터는 AND 조건으로 동작

**테이블 컬럼** (기존 + v2.0 변경)
- 케이스번호 / 하자명 + 위치 + **원인분류 뱃지** *(v2.0)* / 카테고리 / 심각도 / 상태 / 위치 / 비용유형 / 최초발생일

**하자 상세 (`/defects/:id`)** *(v2.0 변경)*
- 기존: 제목·상태·배지·메타 정보·도면핀·이력 타임라인
- 신규 카드: **AI 분석 결과** — 증상·원인분류·근본원인·AI 위험도 배지·AI 요약 (AI 분석 데이터가 있을 때만 표시)

---

### 3.3 하자 등록 (`/defects/new`) *(v2.0 대폭 변경)*

**카드 1 — AI 현장 메모 분석** *(v2.0 신규)*

| 항목 | 내용 |
|---|---|
| 입력 | 현장 메모 텍스트 영역 (자유 형식) |
| 버튼 | `✨ AI 분석` — 800ms 딜레이 후 결과 반환 |
| 결과 그리드 | 위치·카테고리·설비유형·증상·근본원인·원인분류 (6칸) |
| 위험도 배지 | 낮음/중/높음/긴급 색상 배지 |
| 비용 표시 | AI 분석 기반 예상 처리 비용 범위 (min ~ max, avg) |
| 권장 조치 | 최대 5개 조치 칩 |
| AI 요약 | 한 줄 요약 텍스트 |
| 자동 입력 | 분석 완료 시 제목·설명·위치·카테고리·심각도 폼 자동 반영 |

**카드 2 — AI 비용 예측** *(v2.0 신규, AI 분석 완료 후 자동 표시)*

| 항목 | 내용 |
|---|---|
| 평균 예측 비용 | 크게 표시 |
| 비용 범위 | min ~ max |
| 신뢰도 배지 | 낮음(회색) / 중간(주황) / 높음(초록) |
| 근거 배지 | 이력 기반 / 이력+기준표 혼합 / 기준표 기반 |
| 유사 사례 목록 | 상위 5건 (제목·심각도·실제 비용) |

**카드 3 — 기본 정보** (기존 유지)

**카드 4 — 위치 지정** (기존 유지)

---

### 3.4 보고서 (`/reports`)

(기존 명세 유지 — v2.0 변경 없음)

#### 3.4.1 기간 선택 컨트롤
| 옵션 | 동작 |
|---|---|
| 이번 달 | 이번 달 1일 ~ 오늘 |
| 지난 달 | 지난 달 1일 ~ 말일 |
| 최근 3개월 | 오늘 기준 -3개월 ~ 오늘 |
| 최근 6개월 | 오늘 기준 -6개월 ~ 오늘 |
| 사용자 지정 | 날짜 직접 입력 |

#### 3.4.2 다운로드/출력
| 버튼 | 형식 |
|---|---|
| 미리보기 | A4 비율 화면 표시 |
| PDF 다운로드 | .pdf (A4, 300dpi) |
| Excel 다운로드 | .xlsx (요약/하자목록 시트) |
| Word 다운로드 | .doc (Word 호환) |
| 인쇄 | @media print A4 |

---

### 3.5 AI 어시스턴트 (`/ai`)

(기존 명세 유지)

---

### 3.6 AI 현장 메모 분석 서비스 *(v2.0 신규)*

**파일**: `lib/aiAnalysisService.ts`, `app/api/ai/analyze/route.ts`

#### 서비스 계층 구조
```
클라이언트 (new/page.tsx)
  → POST /api/ai/analyze
  → analyzeFieldMemo(memo)   ← entry point
  → mockAnalyze(memo)        ← 현재 구현 (Rule-Based)
  // → realAnalyze(memo)     ← 교체 준비 (LLM stub 주석 처리)
```

#### 분석 항목 및 규칙

| 항목 | 방식 |
|---|---|
| 카테고리 | 키워드 점수 합산 → 최고점 선택 (누수/전기/HVAC/균열) |
| 위치 | 정규식 패턴 매칭 (지하N층, N층, 시설명칭) |
| 설비유형 | 키워드 규칙 배열 순차 매칭 |
| 증상 | 키워드 규칙 배열 순차 매칭 |
| 근본원인 + 원인분류 | 키워드 규칙 배열 순차 매칭 |
| 위험도 | 전기실/누전 → 긴급, 긴급/위험 → 높음, 경미/소량 → 낮음, else → 중 |
| 권장조치 | 카테고리별 기본 배열 + 추가 키워드 조건 |
| 예상 비용 | 카테고리별 기준 × 위험도 배수 (0.5~2.5) |

#### 출력 인터페이스
```typescript
interface AiAnalysisResult {
  location: string; category: string; facilityType: string
  symptom: string; rootCause: string; causeCategory: string
  riskLevel: '낮음' | '중' | '높음' | '긴급'
  recommendedActions: string[]
  estimatedCostMin: number; estimatedCostAvg: number; estimatedCostMax: number
  aiSummary: string
}
```

---

### 3.7 자연어 검색 *(v2.0 신규)*

**파일**: `lib/searchParser.ts`

#### 파서 구조
```
analyzeSearchQuery(text)   ← entry point (LLM 교체 포인트)
  → parseNaturalQuery(text)  ← 현재 구현 (Rule-Based)
```

#### SearchCondition 출력
```typescript
interface SearchCondition {
  keyword: string | null       // 설비·부품 키워드
  category: string | null      // 누수 | 전기 | HVAC | 균열
  location: string | null      // 층·시설명칭
  rootCause: string | null     // 설비 노후 | 시공하자 | 유지관리 미흡 | ...
  dateRange: { start: Date | null; end: Date | null }
  sortBy: 'recurrenceCount' | 'totalCost' | 'createdAt' | null
}
```

#### 인식 패턴

| 구분 | 예시 입력 | 파싱 결과 |
|---|---|---|
| 날짜 | 지난달, 이번달, 올해, 지난주, 최근N일 | dateRange |
| 정렬 | 많이 발생, 재발, 비용, 금액, 많이 사용 | sortBy |
| 카테고리 | 누수, 전기, HVAC/공조/냉방, 균열/크랙 | category |
| 위치 | 전기실, 기계실, N층, 지하N층, 옥상 등 | location |
| 원인 | 부식/노후, 시공/부실, 막힘/역류, 방수층, 누전 | rootCause |
| 키워드 | 배관, 천장, 외벽, 창호, 엘리베이터, 소방 등 | keyword |

#### 필터링 적용 방식
- 자연어 조건 + 기존 드롭다운 필터: AND 조건
- `location` → `defect.locationText` 포함 여부
- `rootCause` → `defect.rootCause` (AI 필드) 또는 제목/설명 포함 여부
- `category` → `state.categories` 이름 정확 매칭 → `categoryId` 비교
- `sortBy` → 기본 `id desc` 정렬 대체

---

### 3.8 AI 비용 예측 *(v2.0 신규)*

**파일**: `lib/costPredictionService.ts`

#### 예측 엔진 구조
```
estimateCost(defects, input)   ← entry point (ML 교체 포인트)
  → predictCost(defects, input)  ← 현재 구현 (Rule-Based + Similarity)
```

#### 유사도 점수 (Similarity Score)

| 기준 | 가중치 |
|---|---|
| severity 일치 | +3 |
| causeCategory 일치 | +4 |
| rootCause 부분 일치 | +3 |
| locationText 키워드 포함 | +2 |

#### 비용 계산 방식

| 조건 | 방식 | 신뢰도 |
|---|---|---|
| 이력 ≥ 3건 | 이력 통계만 사용 (p10 / 평균 / p90) | 높음 (≥5건) / 중간 (3~4건) |
| 이력 1~2건 | 이력 50% + 카테고리×심각도 기준표 50% 혼합 | 낮음 |
| 이력 0건 | 카테고리×심각도 기준표만 사용 | 낮음 |

#### 출력 인터페이스
```typescript
interface CostPrediction {
  estimatedCostMin: number
  estimatedCostAvg: number
  estimatedCostMax: number
  confidence: '낮음' | '중간' | '높음'
  similarCount: number
  similarCases: SimilarCase[]
  basedOn: 'history' | 'baseline' | 'combined'
}
```

#### 예측 오차율 자동 계산
- 하자 등록 시 예측값 저장 → 이후 실제 비용 입력(addLog) 시 자동 계산
- 공식: `(|실제비용 - 예측평균| / 실제비용) × 100` (소수점 1자리, %)
- 최초 비용 확정 시 1회만 계산하여 저장 (이후 재계산 없음)

---

## 4. UI 디자인 시스템

### 색상 토큰
```
--accent:    #635bff  (AI/강조 — 보라)
--ai-green:  #059669  (AI 비용 예측 — 초록)
--bg:        #f5f7fa
--surface:   #ffffff
--border:    #e3e8ef
--t1:        #0a2540
--t2:        #425466
--t3:        #697386
--sidebar:   #0d1f35
```

### 배지 색상
| 상태 | 배경 | 텍스트 |
|---|---|---|
| 접수 | #ebf3fe | #1d6dc2 |
| 처리중 | #fef3e2 | #b06b1a |
| 완료 | #e6f6f0 | #0f7850 |
| 긴급 | #fef0f4 | #be1044 |
| 높음 | #fef3ee | #c2440c |
| 보통 | #fefae8 | #9a6c00 |
| 낮음 | #f3f5f7 | #697386 |

### AI 전용 배지
| 구분 | 배경 | 텍스트 |
|---|---|---|
| AI 분석 위험도 — 긴급 | #fff1f2 | #be123c |
| AI 분석 위험도 — 높음 | #fff7ed | #c2410c |
| AI 분석 위험도 — 중 | #fffbeb | #b45309 |
| AI 분석 위험도 — 낮음 | #f0fdf4 | #15803d |
| 비용 예측 신뢰도 — 높음 | #e6f6f0 | #0f7850 |
| 비용 예측 신뢰도 — 중간 | #fef3e2 | #b06b1a |
| 비용 예측 신뢰도 — 낮음 | #f3f5f7 | #697386 |
| 자연어 검색 파싱칩 — 카테고리 | rgba(99,91,255,.1) | #635bff |
| 자연어 검색 파싱칩 — 위치 | #ebf3fe | #1d6dc2 |
| 자연어 검색 파싱칩 — 원인 | #fef3ee | #c2440c |
| 자연어 검색 파싱칩 — 기간 | #e6f6f0 | #0f7850 |
| 자연어 검색 파싱칩 — 정렬 | #fef3e2 | #b06b1a |

---

## 5. 데이터 모델

### 저장소: `localStorage` (`hajaSys2` 키)

```typescript
// Defect (v2.0 — AI 필드 추가)
interface Defect {
  // ── 기존 필드 ──
  id: number
  caseNumber: string           // DEF-YYYY-NNN
  title: string
  description: string | null
  buildingId: number
  floorPlanId: number | null
  locationX: number | null     // 0~100 (%)
  locationY: number | null
  locationText: string | null
  categoryId: number | null
  severity: string             // low|medium|high|critical
  status: string               // open|in_progress|completed
  costType: string             // gukbo|our|claim
  reporterName: string | null
  assignedVendorId: number | null
  managerName: string | null
  recurrenceCount: number
  firstOccurredAt: string | null
  lastOccurredAt: string | null
  totalCost: number
  createdAt: string

  // ── AI 분석 필드 (v2.0 신규, 선택적) ──
  symptom?: string | null
  rootCause?: string | null
  causeCategory?: string | null
  aiSummary?: string | null
  aiRiskLevel?: string | null

  // ── AI 비용 예측 필드 (v2.0 신규, 선택적) ──
  predictedCostMin?: number | null
  predictedCostAvg?: number | null
  predictedCostMax?: number | null
  predictionConfidence?: string | null  // 낮음|중간|높음
  predictionErrorRate?: number | null   // % (실제비용 확정 후 자동 계산)
}

// DefectLog (기존 유지)
interface DefectLog {
  id: number
  defectId: number
  logType: string    // occurrence|inspection|action|recurrence
  title: string
  content: string | null
  costAmount: number | null
  occurredAt: string
}
```

> **하위 호환**: AI 필드는 모두 `?: string | null` 또는 `?: number | null`로 선언되어 기존 시드 데이터 및 AI 분석 없이 등록된 하자에 영향이 없다.

---

## 6. 파일 구조 (AI 고도화 관련)

```
lib/
  store.ts                  # Defect 인터페이스 + localStorage 상태 관리
  aiAnalysisService.ts      # AI 현장 메모 분석 서비스 (Mock → LLM 교체 가능)
  searchParser.ts           # 자연어 검색 파서 (Rule-Based → LLM 교체 가능)
  costPredictionService.ts  # AI 비용 예측 서비스 (Rule-Based → ML 교체 가능)
  format.ts                 # formatKRW 등 포맷 유틸

app/
  api/ai/analyze/route.ts   # POST /api/ai/analyze (AI 분석 API)
  defects/
    page.tsx                # 하자 목록 (자연어 검색 포함)
    new/page.tsx            # 하자 등록 (AI 분석 + 비용 예측 카드)
    [id]/page.tsx           # 하자 상세 (AI 분석 결과 카드)
```

---

## 7. 화면 흐름

```
대시보드
  ├── 하자 목록  ──→ [AI 자연어 검색] + [기존 필터]
  │     └── 하자 상세  ──→ [AI 분석 결과 카드]
  │                    └── 이력 추가 모달 → 비용 입력 → 예측 오차율 자동 계산
  ├── 하자 등록
  │     ├── [AI 현장 메모 분석] → 폼 자동 입력
  │     ├── [AI 비용 예측 카드] → 유사 사례 + 신뢰도 표시
  │     └── 도면 클릭 → 좌표 입력 → 저장
  ├── 보고서
  │     ├── 기간 선택 → 차트 필터링
  │     └── 미리보기 모달 → PDF/Excel/Word/인쇄
  └── AI 어시스턴트
```

---

## 8. 시드 데이터

초기 실행 시 localStorage에 자동 저장된다.

- 카테고리 4개: 누수(파란), 전기(주황), HVAC(초록), 균열(빨강)
- 협력업체 4개: 국보디자인, 한국설비(주), 삼성전기서비스, 쾌적공조(주)
- 건물 1동: 대전충청검사센터
- 도면 9개: 지하2층 ~ RF층
- 하자 5건: DEF-2024-001 ~ DEF-2025-001 (AI 필드 없음 — 정상 표시)
- 이력 로그 16건

---

## 9. 완료 기준 (Definition of Done)

### 기존 기능
- [x] 5개 메뉴가 오류 없이 전환된다
- [x] 하자 등록 후 목록에 즉시 반영된다
- [x] 도면 핀이 올바른 위치에 표시된다
- [x] 보고서 기간 변경 시 차트와 요약이 갱신된다
- [x] PDF/Excel/Word 다운로드, 인쇄가 정상 동작한다
- [x] localStorage 초기화 후 시드 데이터로 복원된다

### AI 고도화 기능 (v2.0)
- [x] **Stage 3** — AI 메모 입력 → 분석 → 폼 자동 입력 동작
- [x] **Stage 4** — AI 분석 결과가 하자 데이터에 저장되고 목록·상세에 표시
- [x] **Stage 5** — 자연어 검색어 입력 시 파싱 칩 표시 + 목록 필터링 동작
- [x] **Stage 6** — AI 분석 완료 후 비용 예측 카드 표시, 유사 사례 렌더링
- [x] **Stage 6** — 이력에 비용 입력 시 `predictionErrorRate` 자동 계산·저장
- [x] 기존 시드 데이터(AI 필드 없음)가 목록·상세에서 정상 렌더링
- [x] AI 조건 없이 기존 필터만 사용해도 정상 동작
