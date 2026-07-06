# 하자관리시스템 UI/UX 개선 — 관제형 화면 전환

## 배경 / 목적

현재 하자관리시스템(`hazard-management-seegene`)은 일반적인 SaaS 대시보드 톤(보라색 액센트, 카드형 KPI, 하단에 AI 인사이트 6개 위젯 몰아넣기)으로 만들어져 있다. 실제 사용자는 씨젠의료재단 운영관리팀으로, "예쁜 화면"보다 **긴급/지연/반복/비용리스크를 즉시 판단**할 수 있는 시설관리 관제 화면이 필요하다.

목표:
1. 운영관리자가 접속 즉시 "오늘 뭘 먼저 봐야 하는지" 판단할 수 있는 화면
2. 하자 위치·긴급도·반복여부·지연여부·비용부담주체를 한눈에
3. 지정된 팔레트(배경 #F5F6F8, 카드 #FFFFFF, 액션 #2563EB, 위험 #DC2626, 긴급 #B91C1C, 지연 #F97316, 완료 #16A34A, 보류 #EAB308)로 통일
4. 기존 기능·데이터·메뉴는 삭제하지 않고 재배치/고도화
5. 태블릿·데스크탑 중심 반응형 (현장 태블릿 사용 고려)

## 현재 상태 요약 (조사 결과)

- 스타일: 전부 인라인 `style={{}}` 객체, hex 하드코딩. `app/layout.tsx`의 `<head>`에 CSS 변수(`:root`)가 정의돼 있으나 어떤 페이지도 참조하지 않음 (죽은 토큰).
- 배지 정의 중복: `SEV_LABELS`/`STAT_LABELS`/색상 매핑이 `app/defects/page.tsx`, `app/defects/[id]/page.tsx`, `app/defects/[id]/edit/page.tsx`에 각각 따로 존재.
- 상태값: `open` / `in_progress` / `completed` 3단계뿐 (보류 없음).
- 지연/마감기한 필드 없음 (`firstOccurredAt`만 있음).
- AI 인사이트 6개 위젯(`app/dashboard/page.tsx`)은 대시보드 최하단에 위치.
- 사이드바(`components/layout/SideNav.tsx`)는 고정 216px, 반응형 없음. 메뉴 구성: 메인(대시보드/하자목록/하자등록) + 분석(보고서/AI보고서/AI어시스턴트).
- 데이터: `lib/store.ts`의 `useStore()` 훅이 브라우저 localStorage에 저장 (`hajaSys2` 키). `Defect.status`는 `string` 타입(런타임 문자열, 유니언 타입 강제 없음) → 새 상태값 추가가 타입 변경 없이 가능.

## 신규 비즈니스 규칙

### 지연(overdue) 판정
심각도별 기준일 경과 + 미완료 상태일 때 지연으로 판정한다. `firstOccurredAt` 기준.

| 심각도 | 기준일 |
|---|---|
| 긴급(critical) | 3일 |
| 높음(high) | 7일 |
| 보통(medium) | 14일 |
| 낮음(low) | 30일 |

`status === 'hold'`(보류)인 하자는 지연 판정에서 제외한다 (의도적으로 대기 중인 상태이므로). `status === 'completed'`도 제외.

### "오늘 우선처리" 판정
다음 중 하나라도 해당하면 오늘 우선처리 대상:
- 지연 판정된 하자
- 심각도 `critical`이면서 미완료
- 재발(`recurrenceCount > 0`)이면서 미완료

### 상태값 확장
`open`(접수) → `in_progress`(처리중) → `hold`(보류) → `completed`(완료) 4단계로 확장. 보류는 "자재대기/손보상 대기/원사 회신 대기" 같은 상황을 표현.

## 아키텍처

### 신규 파일

**`lib/designTokens.ts`** — 단일 진실 공급원(SSOT)
- `COLORS` 상수: 배경/카드/액션/위험/긴급/지연/완료/보류/텍스트/보더 (지정 팔레트 그대로)
- `STATUS_META`: `{ open, in_progress, hold, completed }` 각각 `{ label, color, bg }`
- `SEVERITY_META`: `{ low, medium, high, critical }` 각각 `{ label, color, bg }`
- `OVERDUE_DAYS_BY_SEVERITY` 상수
- `isOverdue(defect): boolean`
- `needsTodayAction(defect): boolean`
- `isRecurring(defect): boolean`

**`components/ui/StatusBadge.tsx`, `SeverityBadge.tsx`** — `designTokens`의 메타 참조, 4화면 공용
**`components/ui/PriorityStatCard.tsx`** — 클릭 가능한 상단 통계 카드 (아이콘, 라벨, 카운트, 강조색, onClick)
**`components/ui/EmptyState.tsx`** — 아이콘 + 안내문구 + CTA 버튼(옵션)

### 수정 파일

- `app/layout.tsx`: `:root` CSS 변수 값을 지정 팔레트로 교체 (사이드바 전용 변수는 유지, 다크 네이비 톤 유지 — 사이드바는 관제실 느낌을 위해 다크 유지하고 본문 영역만 밝은 톤 전환)
- `lib/store.ts`: 상태값 런타임에 `'hold'` 허용 (타입은 `string`이라 강제 변경 불필요, 문서화 주석만 추가)
- `app/dashboard/page.tsx`: 최상단에 새 행 하나 추가 — 좌측 3/4에 `PriorityStatCard` 4개(오늘 우선처리/긴급/지연/반복, 각각 클릭 시 `/defects?filter=...`로 이동), 우측 1/4에 AI 인사이트 요약 카드(최다반복원인 1위, 최고위험구역 1위, 3개월 비용예측 헤드라인 3줄 + "전체 인사이트 보기" 링크 — 클릭 시 페이지 내 기존 AI 인사이트 섹션으로 스크롤). 그 아래 기존 KPI 4카드/차트는 색상만 교체하여 유지. 기존 AI 인사이트 6위젯 섹션은 삭제 없이 그 아래 위치 그대로 유지.
- `app/defects/page.tsx`: 배지 컴포넌트 교체, 지연 표시, 퀵필터 칩, `?filter=` 쿼리파라미터로 대시보드에서 진입 시 자동 필터 적용
- `app/defects/[id]/page.tsx`: 판단근거 칩 스트립 추가, 배지 컴포넌트 교체, 상태 선택에 `보류` 추가
- `app/defects/[id]/edit/page.tsx`, `app/defects/new/page.tsx`: 배지/색상 교체, 상태 선택에 `보류` 추가, 등록 폼 필드 순서 재배치(빠른입력 상단, 사진첨부 상향, AI메모 접기 가능)
- `components/layout/SideNav.tsx`: 900px 이하 오프캔버스 토글 추가 (기존 메뉴 항목·구조는 변경 없음)

### 데이터 흐름

우선순위 배너 카드 클릭 → `/defects?filter=overdue|critical|recurring|today` 이동 → 목록 페이지가 쿼리파라미터를 읽어 기존 필터 상태(`statusFilter` 등)에 매핑 → 동일한 `filtered` 로직 재사용 (신규 필터 조건만 `designTokens`의 판정 함수 사용).

### 반응형 브레이크포인트

- ≥1024px: 현재 레이아웃(4열 KPI, 2단 그리드) 유지
- 768–1024px(태블릿): KPI 4열→2열, 2단 그리드→1단, 사이드바 아이콘 전용 축소(라벨 숨김)
- <768px: 사이드바 오프캔버스(햄버거로 토글), 모든 그리드 1열 스택, 테이블은 카드형으로 전환(안전망, 주 타겟 아님)

인라인 스타일 기반이므로 브레이크포인트는 각 페이지에 작은 `useMediaQuery` 훅(신규 `lib/useMediaQuery.ts`, `window.matchMedia` 기반) 하나로 처리하고 조건부로 style 객체를 바꾼다. Tailwind 반응형 유틸리티는 도입하지 않는다(기존 코드 패턴과의 일관성을 위해 인라인 스타일 접근을 그대로 유지).

### 빈 상태 처리

`EmptyState` 컴포넌트를 다음 위치에 적용: 우선순위 배너(모두 0건일 때 "오늘 처리할 긴급/지연 항목이 없습니다"), 하자목록 테이블(기존에도 있었음, 컴포넌트로 교체), AI 인사이트 각 위젯(기존 로직 유지), 대시보드 차트(데이터 0건 시).

## 범위 밖 (Out of scope)

- Tailwind 유틸리티 클래스로의 전체 전환 (인라인 스타일 패턴 유지)
- 실제 SLA/마감기한 필드의 DB 스키마화 (이번엔 심각도 기반 자동 계산으로 대체)
- 모바일 전용 별도 UI 컴포넌트 세트 (반응형 CSS로만 대응)
- 알림/푸시 기능 (배너는 화면 진입 시에만 계산, 실시간 알림 없음)

## 검증 방법

1. `npm run build` 통과 확인 (참고: 이 PC는 better-sqlite3 네이티브 컴파일 이슈로 로컬 빌드가 막혀 있어, Vercel 배포 빌드로 검증)
2. 대시보드: 우선순위 배너 4개 카드 클릭 시 목록 페이지로 이동 + 올바른 필터 적용 확인
3. 하자 상태를 `보류`로 변경 → 목록/상세/대시보드 KPI에 정상 반영, 지연 판정에서 제외되는지 확인
4. 심각도 `긴급`으로 등록 후 3일 경과 시나리오(시스템 날짜 조작 또는 seed 데이터 조정)로 지연 배지 노출 확인
5. 브라우저 창 크기를 1024px, 768px, 480px로 줄여 각 브레이크포인트에서 레이아웃 확인
6. 데이터 없는 상태(localStorage 초기화 후 신규 하자 0건)에서 각 화면의 빈 상태 문구/버튼 노출 확인
7. 기존 기능(등록/수정/삭제/이력추가/사진첨부/도면업로드/AI분석/AI검색) 전부 정상 동작 확인 — 회귀 없음
