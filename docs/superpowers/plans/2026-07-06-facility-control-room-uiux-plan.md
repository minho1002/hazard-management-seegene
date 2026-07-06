# 시설관리 관제형 UI/UX 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하자관리시스템(`hazard-management-seegene`)의 대시보드/등록/목록/상세 4개 화면을 SaaS 톤에서 시설관리 관제형(우선순위·긴급도·지연·반복·비용주체 즉시 판단) 톤으로 전환하고, 지정된 색상 팔레트와 반응형(태블릿 중심)을 적용한다. 기존 기능·데이터·메뉴는 삭제하지 않는다.

**Architecture:** 색상/상태/심각도/지연판정 로직을 `lib/designTokens.ts` 한 곳으로 통일하고, 배지·통계카드·빈상태를 `components/ui/`의 공용 컴포넌트로 추출한다. 기존 페이지들은 인라인 `style={{}}` 패턴을 유지하되 하드코딩된 hex 값을 토큰 참조로 교체하고, 대시보드 상단에 클릭 가능한 우선순위 배너 + AI 인사이트 요약을 신설한다. 데이터 계층(`lib/store.ts`의 `useStore()`, localStorage)은 변경하지 않고 `status`에 새 값 `'hold'`만 런타임으로 추가 허용한다.

**Tech Stack:** Next.js 14 (App Router) · React 18 · TypeScript · 인라인 스타일(Tailwind는 SideNav 일부에만 부분 사용, 이번 작업은 인라인 스타일 패턴 유지) · Chart.js · localStorage 기반 상태(`lib/store.ts`)

## Global Constraints

- 지정 팔레트를 정확히 사용: 배경 `#F5F6F8`, 카드 `#FFFFFF`, 액션 `#2563EB`, 위험 `#DC2626`, 긴급 `#B91C1C`, 지연/주의 `#F97316`, 완료 `#16A34A`, 보류 `#EAB308`, 텍스트 `#111827`, 보조텍스트 `#6B7280`, 보더 `#E5E7EB`.
- 기존 데이터·메뉴·기능을 삭제하지 않는다 (재배치/고도화만).
- 모든 카드/차트는 클릭 가능한 구조를 고려한다(우선순위 카드는 필수, 나머지는 최소 `cursor:pointer` + hover 스타일).
- 데이터 0건인 곳은 빈 화면 대신 안내문구 + 등록 버튼(`components/ui/EmptyState.tsx`)을 표시한다.
- 이 PC는 `better-sqlite3` 네이티브 컴파일이 막혀 있어 로컬 `npm run build`가 실패한다(환경 문제, 이번 작업과 무관). 각 태스크의 코드 검증은 `npx tsc --noEmit`(타입 체크만, 네이티브 모듈 실행 없음)로 하고, 최종 시각적 검증은 Vercel 배포 후 실제 사이트에서 확인한다.
- 신규 상태값 `'hold'`는 `lib/store.ts`의 `Defect.status`가 이미 `string` 타입이므로 타입 변경 없이 런타임 문자열로만 추가하면 된다.

---

## Task 1: 디자인 토큰 + 공용 UI 컴포넌트 + 반응형 훅

**Files:**
- Create: `lib/designTokens.ts`
- Create: `lib/useMediaQuery.ts`
- Create: `components/ui/StatusBadge.tsx`
- Create: `components/ui/SeverityBadge.tsx`
- Create: `components/ui/PriorityStatCard.tsx`
- Create: `components/ui/EmptyState.tsx`

**Interfaces:**
- Produces: `COLORS` (object literal, 10개 키), `StatusKey = 'open'|'in_progress'|'hold'|'completed'`, `SeverityKey = 'low'|'medium'|'high'|'critical'`, `STATUS_META: Record<StatusKey,{label,color,bg}>`, `SEVERITY_META: Record<SeverityKey,{label,color,bg}>`, `OVERDUE_DAYS_BY_SEVERITY: Record<SeverityKey,number>`, `isOverdue(defect): boolean`, `isRecurring(defect): boolean`, `needsTodayAction(defect): boolean` — 이후 모든 태스크가 이 이름들을 그대로 import한다.
- Produces: `useMediaQuery(query: string): boolean` — 태스크 7(반응형)에서 사용.
- Produces: `<StatusBadge status={string} />`, `<SeverityBadge severity={string} />`, `<PriorityStatCard label icon count color bg href description? />`, `<EmptyState icon message actionLabel? actionHref? />` — 태스크 3~6에서 기존 인라인 배지 코드를 대체.

- [ ] **Step 1: `lib/designTokens.ts` 작성**

```ts
import type { Defect } from '@/lib/store'

export const COLORS = {
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  action: '#2563EB',
  danger: '#DC2626',
  critical: '#B91C1C',
  warning: '#F97316',
  success: '#16A34A',
  hold: '#EAB308',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',
} as const

export type StatusKey = 'open' | 'in_progress' | 'hold' | 'completed'
export type SeverityKey = 'low' | 'medium' | 'high' | 'critical'

export const STATUS_META: Record<StatusKey, { label: string; color: string; bg: string }> = {
  open: { label: '접수', color: '#1D4ED8', bg: '#EFF6FF' },
  in_progress: { label: '처리중', color: COLORS.warning, bg: '#FFF7ED' },
  hold: { label: '보류', color: COLORS.hold, bg: '#FEFCE8' },
  completed: { label: '완료', color: COLORS.success, bg: '#F0FDF4' },
}

export const SEVERITY_META: Record<SeverityKey, { label: string; color: string; bg: string }> = {
  low: { label: '낮음', color: COLORS.textMuted, bg: '#F9FAFB' },
  medium: { label: '보통', color: '#CA8A04', bg: '#FEFCE8' },
  high: { label: '높음', color: COLORS.danger, bg: '#FEF2F2' },
  critical: { label: '긴급', color: COLORS.critical, bg: '#FEF2F2' },
}

export const OVERDUE_DAYS_BY_SEVERITY: Record<SeverityKey, number> = {
  critical: 3,
  high: 7,
  medium: 14,
  low: 30,
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0
  const then = new Date(dateStr).getTime()
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24))
}

export function isOverdue(defect: Defect): boolean {
  if (defect.status === 'completed' || defect.status === 'hold') return false
  const threshold = OVERDUE_DAYS_BY_SEVERITY[defect.severity as SeverityKey] ?? OVERDUE_DAYS_BY_SEVERITY.medium
  return daysSince(defect.firstOccurredAt) >= threshold
}

export function isRecurring(defect: Defect): boolean {
  return defect.recurrenceCount > 0
}

export function needsTodayAction(defect: Defect): boolean {
  if (defect.status === 'completed') return false
  if (isOverdue(defect)) return true
  if (defect.severity === 'critical') return true
  if (isRecurring(defect)) return true
  return false
}
```

- [ ] **Step 2: 타입체크로 확인**

Run: `npx tsc --noEmit`
Expected: `lib/designTokens.ts` 관련 에러 없음 (다른 기존 파일의 에러는 이 단계에서 무시 — 아직 손대지 않았으므로 이번 파일 관련 에러만 없으면 통과).

- [ ] **Step 3: `lib/useMediaQuery.ts` 작성**

```ts
'use client'

import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}
```

- [ ] **Step 4: `components/ui/StatusBadge.tsx` 작성**

```tsx
import { STATUS_META, type StatusKey } from '@/lib/designTokens'

export default function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as StatusKey] ?? { label: status, color: '#6B7280', bg: '#F9FAFB' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 5,
      fontSize: '0.68rem', fontWeight: 600, color: meta.color, background: meta.bg,
    }}>
      {meta.label}
    </span>
  )
}
```

- [ ] **Step 5: `components/ui/SeverityBadge.tsx` 작성**

```tsx
import { SEVERITY_META, type SeverityKey } from '@/lib/designTokens'

export default function SeverityBadge({ severity }: { severity: string }) {
  const meta = SEVERITY_META[severity as SeverityKey] ?? { label: severity, color: '#6B7280', bg: '#F9FAFB' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 5,
      fontSize: '0.68rem', fontWeight: 600, color: meta.color, background: meta.bg,
    }}>
      {meta.label}
    </span>
  )
}
```

- [ ] **Step 6: `components/ui/PriorityStatCard.tsx` 작성**

```tsx
import Link from 'next/link'

interface Props {
  label: string
  icon: string
  count: number
  color: string
  bg: string
  href: string
  description?: string
}

export default function PriorityStatCard({ label, icon, count, color, bg, href, description }: Props) {
  return (
    <Link
      href={href}
      style={{
        display: 'block', textDecoration: 'none', background: '#FFFFFF',
        border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 18px',
        position: 'relative', overflow: 'hidden', transition: 'box-shadow .15s, transform .15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 14px rgba(17,24,39,.10)'; (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'none'; (e.currentTarget as HTMLAnchorElement).style.transform = 'none' }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={icon} style={{ fontSize: 12, color }} />
        </div>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#111827' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', lineHeight: 1 }}>{count}</div>
      {description && <div style={{ fontSize: '0.7rem', color: '#6B7280', marginTop: 6 }}>{description}</div>}
    </Link>
  )
}
```

- [ ] **Step 7: `components/ui/EmptyState.tsx` 작성**

```tsx
import Link from 'next/link'

interface Props {
  icon: string
  message: string
  actionLabel?: string
  actionHref?: string
}

export default function EmptyState({ icon, message, actionLabel, actionHref }: Props) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6B7280' }}>
      <i className={icon} style={{ fontSize: '1.8rem', display: 'block', marginBottom: 10, opacity: 0.35 }} />
      <p style={{ fontSize: '0.82rem', marginBottom: actionLabel ? 14 : 0 }}>{message}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, background: '#2563EB', color: '#fff', textDecoration: 'none' }}
        >
          <i className="fa-solid fa-plus" /> {actionLabel}
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 8: 전체 타입체크**

Run: `npx tsc --noEmit`
Expected: 신규 6개 파일 관련 에러 없음.

- [ ] **Step 9: Commit**

```bash
git add lib/designTokens.ts lib/useMediaQuery.ts components/ui/StatusBadge.tsx components/ui/SeverityBadge.tsx components/ui/PriorityStatCard.tsx components/ui/EmptyState.tsx
git commit -m "feat: 관제형 UI 디자인 토큰 및 공용 컴포넌트 추가"
```

---

## Task 2: 팔레트 전역 적용 + 사이드바 반응형

**Files:**
- Modify: `app/layout.tsx:24-63` (`:root` CSS 변수)
- Modify: `components/layout/SideNav.tsx`

**Interfaces:**
- Consumes: Task 1의 `useMediaQuery`
- Produces: 사이드바가 900px 이하에서 오프캔버스로 토글되는 `data-open` 상태 (다른 태스크는 이 파일을 더 건드리지 않으므로 후속 의존 없음)

- [ ] **Step 1: `app/layout.tsx`의 `:root` 변수를 지정 팔레트로 교체**

`app/layout.tsx:24-63`의 `<style>{\`:root {...}\`}</style>` 블록에서 본문(콘텐츠 영역) 관련 변수만 교체하고, 사이드바 전용 변수(`--sb-*`)는 그대로 둔다(관제실 느낌 유지를 위해 사이드바는 다크 유지):

```
--bg: #F5F6F8;
--surface: #FFFFFF;
--border: #E5E7EB;
--border-sub: #F3F4F6;
--accent: #2563EB;
--accent-dk: #1D4ED8;
--accent-bg: rgba(37,99,235,.08);
--t1: #111827;
--t2: #374151;
--t3: #6B7280;
--t4: #9CA3AF;
--open: #1D4ED8;
--open-bg: #EFF6FF;
--prog: #F97316;
--prog-bg: #FFF7ED;
--hold: #EAB308;
--hold-bg: #FEFCE8;
--done: #16A34A;
--done-bg: #F0FDF4;
--crit: #B91C1C;
--crit-bg: #FEF2F2;
--high: #DC2626;
--high-bg: #FEF2F2;
--med: #CA8A04;
--med-bg: #FEFCE8;
--low: #6B7280;
--low-bg: #F9FAFB;
```

(`--r`, `--r-lg`, `--shadow-*`, `--sb-*` 변수는 기존 값 유지)

`body` 태그의 인라인 `background: '#f5f7fa'`도 `'#F5F6F8'`로 교체.

- [ ] **Step 2: `components/layout/SideNav.tsx`에 반응형 오프캔버스 추가**

`'use client'` 파일 상단에 `useMediaQuery` import 추가, `SideNav` 함수 내부에 상태 추가:

```tsx
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useState } from 'react'
```

```tsx
export default function SideNav() {
  const path = usePathname()
  const isMobile = useMediaQuery('(max-width: 900px)')
  const [open, setOpen] = useState(false)
  // ...isActive 함수는 그대로 유지
```

`<aside>` 태그를 다음과 같이 조건부 스타일로 교체(모바일에서는 `fixed` + `translateX`로 오프캔버스):

```tsx
  return (
    <>
      {isMobile && (
        <button
          onClick={() => setOpen(true)}
          style={{ position: 'fixed', top: 12, left: 12, zIndex: 30, width: 36, height: 36, borderRadius: 8, background: '#0d1f35', color: '#fff', border: 'none', display: open ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <i className="fa-solid fa-bars" />
        </button>
      )}
      {isMobile && open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 19 }} />
      )}
      <aside
        className="flex flex-col flex-shrink-0 sticky top-0 z-10"
        style={{
          width: 216, minHeight: '100vh', background: '#0d1f35',
          position: isMobile ? 'fixed' : 'sticky',
          zIndex: 20,
          transform: isMobile && !open ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform .2s ease',
        }}
      >
```

기존 `</aside>` 바로 앞의 콘텐츠(Brand/Nav/Footer)는 그대로 두고, 최종 닫는 태그를 `</aside></>`로 변경.

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: `app/layout.tsx`, `components/layout/SideNav.tsx` 관련 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx components/layout/SideNav.tsx
git commit -m "feat: 관제형 팔레트 전역 적용 및 사이드바 반응형(오프캔버스)"
```

---

## Task 3: 대시보드 — 우선순위 배너 + AI 인사이트 요약 + 리컬러

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `needsTodayAction`, `isOverdue`, `isRecurring`, `COLORS`, `components/ui/PriorityStatCard`, `components/ui/EmptyState`
- Produces: 없음 (최종 소비 화면)

- [ ] **Step 1: import 추가**

`app/dashboard/page.tsx:1-12` 상단에 추가:

```tsx
import Link from 'next/link'
import PriorityStatCard from '@/components/ui/PriorityStatCard'
import EmptyState from '@/components/ui/EmptyState'
import { needsTodayAction, isOverdue, isRecurring, COLORS } from '@/lib/designTokens'
```

(`Link`는 이미 import돼 있으므로 중복 추가하지 않도록 확인)

- [ ] **Step 2: 우선순위 집계 변수 추가**

`const defects = state.defects` 바로 아래(`app/dashboard/page.tsx:24` 이후)에 추가:

```tsx
  const todayItems = defects.filter(d => needsTodayAction(d))
  const criticalItems = defects.filter(d => d.severity === 'critical' && d.status !== 'completed')
  const overdueItems = defects.filter(d => isOverdue(d))
  const recurringItems = defects.filter(d => isRecurring(d) && d.status !== 'completed')
```

- [ ] **Step 3: Page Header 바로 아래(Body 진입 직전)에 우선순위 배너 + AI 요약 삽입**

`app/dashboard/page.tsx:224-225`의 `{/* Body */}` `<div style={{ padding: '24px 32px' }}>` 여는 태그 다음, `{/* KPI Grid */}` 앞에 삽입:

```tsx
        {/* 우선순위 배너 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1.2fr', gap: 12, marginBottom: 20 }}>
          <PriorityStatCard
            label="오늘 우선처리" icon="fa-solid fa-bolt" count={todayItems.length}
            color={COLORS.danger} bg="#FEF2F2" href="/defects?filter=today"
            description="지연·긴급·반복 포함"
          />
          <PriorityStatCard
            label="긴급 하자" icon="fa-solid fa-triangle-exclamation" count={criticalItems.length}
            color={COLORS.critical} bg="#FEF2F2" href="/defects?filter=critical"
          />
          <PriorityStatCard
            label="지연 하자" icon="fa-solid fa-clock" count={overdueItems.length}
            color={COLORS.warning} bg="#FFF7ED" href="/defects?filter=overdue"
          />
          <PriorityStatCard
            label="반복 하자" icon="fa-solid fa-rotate" count={recurringItems.length}
            color={COLORS.action} bg="#EFF6FF" href="/defects?filter=recurring"
          />
          {/* AI 인사이트 요약 */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>✨</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#111827' }}>AI 인사이트 요약</span>
            </div>
            {topCauses.length === 0 && floorRanking.length === 0 ? (
              <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>분석할 데이터가 아직 없습니다.</span>
            ) : (
              <>
                {topCauses[0] && (
                  <div style={{ fontSize: '0.72rem', color: '#374151' }}>최다 반복원인: <strong>{topCauses[0][0]}</strong></div>
                )}
                {floorRanking[0] && (
                  <div style={{ fontSize: '0.72rem', color: '#374151' }}>최고 위험구역: <strong>{floorRanking[0].name}</strong></div>
                )}
                <div style={{ fontSize: '0.72rem', color: '#374151' }}>3개월 비용예측: <strong>{fmtKRW(forecast3m)}</strong></div>
              </>
            )}
            <a href="#ai-insight-section" style={{ fontSize: '0.68rem', color: '#2563EB', marginTop: 4, textDecoration: 'none' }}>전체 인사이트 보기 →</a>
          </div>
        </div>

        {todayItems.length === 0 && (
          <div style={{ marginBottom: 20 }}>
            <EmptyState icon="fa-solid fa-circle-check" message="오늘 처리할 긴급·지연 항목이 없습니다." />
          </div>
        )}

```

`topCauses`, `floorRanking`, `forecast3m`, `fmtKRW`는 이미 이 파일 하단(233번째 줄 이후)에서 계산되고 있으므로, **이 삽입 코드가 참조하는 변수들의 선언부를 우선순위 배너 코드보다 위로 옮겨야 한다** — `app/dashboard/page.tsx:117-189`에 있는 "AI 분석 인사이트 데이터" 계산 블록 전체(`causeCounts`부터 `forecast12m`까지)를 `const defects = state.defects` 바로 아래, 우선순위 집계 변수(Step 2) 바로 다음으로 이동시킨다. 계산 로직 자체는 한 글자도 수정하지 않고 파일 내 위치만 위로 옮긴다.

- [ ] **Step 4: 기존 AI 인사이트 섹션에 앵커 id 추가**

`app/dashboard/page.tsx`의 `{/* ── AI 분석 인사이트 ── */}` 주석이 붙은 `<div style={{ marginTop: 24 }}>`를 `<div id="ai-insight-section" style={{ marginTop: 24 }}>`로 변경. 그 아래 6개 위젯은 삭제하지 않고 그대로 둔다.

- [ ] **Step 5: KPI/차트 색상 교체**

- KPI 카드 상단 컬러바: `#635bff`→`#2563EB`, `#e8960c`→`#F97316`, `#0f7850`→`#16A34A`, `#1d6dc2`→`#2563EB` (4개 KPI 카드의 `background: '#635bff'` 등 색상 4곳)
- "처리 진행중" 배지 `background: '#fef3e2', color: '#b06b1a'` → `background: '#FFF7ED', color: '#F97316'`
- "처리 완료" 배지 `background: '#e6f6f0', color: '#0f7850'` → `background: '#F0FDF4', color: '#16A34A'`
- 월별추이 라인차트 `borderColor: '#635bff'` → `'#2563EB'`, `backgroundColor: 'rgba(99,91,255,0.12)'` → `'rgba(37,99,235,0.12)'`, `pointBackgroundColor: '#635bff'` → `'#2563EB'`
- 협력업체 바차트 `backgroundColor: 'rgba(99,91,255,.7)'` → `'rgba(37,99,235,.7)'`
- 심각도 분포의 `sevCfg` 배열 색상: `critical:'#be1044'`→`'#B91C1C'`, `high:'#c2440c'`→`'#DC2626'`, `medium:'#9a6c00'`→`'#CA8A04'`, `low:'#697386'`→`'#6B7280'`
- 페이지 전체 배경/텍스트는 `layout.tsx`의 CSS 변수 교체(Task 2)로 이미 반영되므로 이 파일에서 추가 수정 불필요. `#0a2540`(제목 텍스트), `#697386`(보조 텍스트) 등 로컬 하드코딩은 이번 태스크 범위에서는 그대로 둔다(전면 치환은 범위 밖 — 배너/KPI/차트 핵심 색상만 교체).

- [ ] **Step 6: 타입체크**

Run: `npx tsc --noEmit`
Expected: `app/dashboard/page.tsx` 관련 에러 없음.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: 대시보드 상단에 우선순위 배너 + AI 인사이트 요약 추가, 팔레트 교체"
```

---

## Task 4: 하자목록 — 배지 교체 · 지연표시 · 퀵필터 · 쿼리파라미터

**Files:**
- Modify: `app/defects/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `StatusBadge`, `SeverityBadge`, `EmptyState`, `isOverdue`, `isRecurring`, `needsTodayAction`
- Produces: 없음

- [ ] **Step 1: import 추가 및 로컬 배지 상수 제거**

`app/defects/page.tsx:1-23`의 `SEV_LABELS`, `SEV_CLASS`, `STAT_LABELS`, `STAT_CLASS` 상수 선언(10~22줄)을 삭제하고 다음으로 교체:

```tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { analyzeSearchQuery, hasConditions, fmtDateRange, SORT_BY_LABELS } from '@/lib/searchParser'
import type { SearchCondition } from '@/lib/searchParser'
import StatusBadge from '@/components/ui/StatusBadge'
import SeverityBadge from '@/components/ui/SeverityBadge'
import EmptyState from '@/components/ui/EmptyState'
import { isOverdue, isRecurring, needsTodayAction, COLORS } from '@/lib/designTokens'

const COST_LABELS: Record<string, string> = { gukbo: '국보', our: '자체', claim: '청구' }
```

- [ ] **Step 2: URL 쿼리파라미터로 진입 필터 적용**

`export default function DefectsPage() {` 함수 본문 최상단(`const router = useRouter()` 다음)에 추가:

```tsx
  const searchParams = useSearchParams()
  const urlFilter = searchParams.get('filter')
```

`const [statusFilter, setStatusFilter] = useState('')` 등 4개 useState 선언 아래에 추가:

```tsx
  const [quickFilter, setQuickFilter] = useState<string | null>(urlFilter)
```

- [ ] **Step 3: 필터링 로직에 퀵필터 조건 추가**

`const filtered = [...state.defects]`로 시작하는 필터 체인의 `.filter(d => {` 블록 맨 앞(`if (search && ...)` 이전)에 추가:

```tsx
      if (quickFilter === 'today' && !needsTodayAction(d)) return false
      if (quickFilter === 'critical' && !(d.severity === 'critical' && d.status !== 'completed')) return false
      if (quickFilter === 'overdue' && !isOverdue(d)) return false
      if (quickFilter === 'recurring' && !(isRecurring(d) && d.status !== 'completed')) return false
```

- [ ] **Step 4: 퀵필터 칩 UI 추가**

Filter Row(`{/* Filter Row */}` 주석이 붙은 `<div>`) 바로 위에 삽입:

```tsx
        {/* 퀵필터 칩 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {([
            { key: 'today', label: '오늘 우선처리', color: COLORS.danger },
            { key: 'critical', label: '긴급만', color: COLORS.critical },
            { key: 'overdue', label: '지연만', color: COLORS.warning },
            { key: 'recurring', label: '반복만', color: COLORS.action },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setQuickFilter(quickFilter === f.key ? null : f.key)}
              style={{
                padding: '5px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${quickFilter === f.key ? f.color : '#E5E7EB'}`,
                background: quickFilter === f.key ? f.color : '#fff',
                color: quickFilter === f.key ? '#fff' : '#374151',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

```

- [ ] **Step 5: 초기화 버튼에 퀵필터 리셋 추가**

`onClick={() => { setSearch(''); setStatusFilter(''); setSeverityFilter(''); setCategoryFilter(''); setNlQuery('') }}`를 다음으로 교체:

```tsx
onClick={() => { setSearch(''); setStatusFilter(''); setSeverityFilter(''); setCategoryFilter(''); setNlQuery(''); setQuickFilter(null) }}
```

- [ ] **Step 6: 테이블 행에 지연 표시 + 배지 컴포넌트로 교체**

테이블 `<tbody>` 안의 `filtered.map(d => {` 블록에서:

```tsx
              ) : filtered.map(d => {
                const cat = state.categories.find(c => c.id === d.categoryId)
                const overdue = isOverdue(d)
                return (
                  <tr
                    key={d.id}
                    style={{ borderBottom: '1px solid #f0f4f8', cursor: 'pointer', transition: 'background 0.1s', borderLeft: overdue ? `3px solid ${COLORS.warning}` : '3px solid transparent' }}
                    onClick={() => router.push(`/defects/${d.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafbff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
```

기존 `SEV_CLASS[d.severity]`/`STAT_CLASS[d.status]`를 참조하던 두 개의 `<td>`(심각도, 상태 컬럼)를 다음으로 교체:

```tsx
                    <td style={{ padding: '11px 16px', verticalAlign: 'middle' }}>
                      <SeverityBadge severity={d.severity} />
                    </td>
                    <td style={{ padding: '11px 16px', verticalAlign: 'middle', display: 'flex', gap: 4, alignItems: 'center' }}>
                      <StatusBadge status={d.status} />
                      {overdue && (
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: COLORS.warning, background: '#FFF7ED', padding: '1px 6px', borderRadius: 4 }}>지연</span>
                      )}
                    </td>
```

- [ ] **Step 7: 빈 상태를 `EmptyState`로 교체**

기존:
```tsx
                <tr>
                  <td colSpan={8} style={{ padding: 52, textAlign: 'center', color: '#697386' }}>
                    <i className="fa-solid fa-inbox" style={{ fontSize: '1.8rem', display: 'block', marginBottom: 10, opacity: 0.35 }} />
                    <p style={{ fontSize: '0.82rem' }}>등록된 하자가 없습니다.</p>
                  </td>
                </tr>
```
교체:
```tsx
                <tr>
                  <td colSpan={8}>
                    <EmptyState icon="fa-solid fa-inbox" message="등록된 하자가 없습니다." actionLabel="하자 등록" actionHref="/defects/new" />
                  </td>
                </tr>
```

- [ ] **Step 8: 타입체크**

Run: `npx tsc --noEmit`
Expected: `app/defects/page.tsx` 관련 에러 없음. (`useSearchParams`는 클라이언트 컴포넌트에서 `next/navigation`가 제공하는 훅이며 기존 파일이 이미 `'use client'`이므로 추가 설정 불필요)

- [ ] **Step 9: Commit**

```bash
git add app/defects/page.tsx
git commit -m "feat: 하자목록에 지연표시·퀵필터·쿼리파라미터 연동, 배지 공용화"
```

---

## Task 5: 하자상세 + 수정 페이지 — 판단근거 스트립 · 보류상태 · 배지 교체

**Files:**
- Modify: `app/defects/[id]/page.tsx`
- Modify: `app/defects/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `StatusBadge`, `SeverityBadge`, `isOverdue`, `isRecurring`, `COLORS`

- [ ] **Step 1: `app/defects/[id]/page.tsx` — import 및 로컬 배지 상수 제거**

`SEV_LABELS`, `SEV_STYLE`, `STAT_LABELS`, `STAT_STYLE`(9~27줄) 중 `SEV_LABELS`/`SEV_STYLE`/`STAT_LABELS`/`STAT_STYLE`은 삭제. `AI_RISK_COLORS`, `COST_LABELS`, `LOG_LABELS`, `LOG_COLORS`는 그대로 유지. 파일 상단 import 블록에 추가:

```tsx
import StatusBadge from '@/components/ui/StatusBadge'
import SeverityBadge from '@/components/ui/SeverityBadge'
import { isOverdue, isRecurring, COLORS } from '@/lib/designTokens'
```

`STATUS_OPTIONS`처럼 상태 select의 `<option>` 목록에도 보류 추가 필요 — 상세 페이지의 상태 `<select>` (`<option value="open">접수</option>` 등 3개)에 추가:

```tsx
            <option value="open">접수</option>
            <option value="in_progress">처리중</option>
            <option value="hold">보류</option>
            <option value="completed">완료</option>
```

- [ ] **Step 2: 배지 사용부 교체**

`<span style={{...SEV_STYLE[defect.severity]}}>{SEV_LABELS[defect.severity]}</span>`를 `<SeverityBadge severity={defect.severity} />`로, `<span style={{...STAT_STYLE[defect.status]}}>{STAT_LABELS[defect.status]}</span>`를 `<StatusBadge status={defect.status} />`로 교체 (Detail Header 영역, 총 2곳).

- [ ] **Step 3: 판단근거 칩 스트립 추가**

Detail Header `<div>`(제목+배지가 있는 영역) 바로 아래, "Detail Grid" 시작 전에 삽입:

```tsx
        {/* 판단 근거 */}
        {(isOverdue(defect) || defect.recurrenceCount > 0 || defect.costType !== 'our') && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {isOverdue(defect) && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: COLORS.warning, background: '#FFF7ED', padding: '5px 10px', borderRadius: 999, border: '1px solid #FED7AA' }}>
                🔶 지연 발생 ({defect.firstOccurredAt ? Math.floor((Date.now() - new Date(defect.firstOccurredAt).getTime()) / 86400000) : 0}일 경과)
              </span>
            )}
            {isRecurring(defect) && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: COLORS.danger, background: '#FEF2F2', padding: '5px 10px', borderRadius: 999, border: '1px solid #FECACA' }}>
                🔁 재발 {defect.recurrenceCount}회
              </span>
            )}
            {defect.costType !== 'our' && (
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', background: '#F3F4F6', padding: '5px 10px', borderRadius: 999, border: '1px solid #E5E7EB' }}>
                💰 {defect.costType === 'gukbo' ? '국보 부담' : '청구 대상'}
              </span>
            )}
          </div>
        )}

```

- [ ] **Step 4: `app/defects/[id]/edit/page.tsx` — 상태 select에 보류 추가**

`const STATUS_OPTIONS = [...]` 배열에 추가:

```tsx
const STATUS_OPTIONS = [
  { value: 'open', label: '접수' },
  { value: 'in_progress', label: '처리중' },
  { value: 'hold', label: '보류' },
  { value: 'completed', label: '완료' },
]
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 두 파일 관련 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add "app/defects/[id]/page.tsx" "app/defects/[id]/edit/page.tsx"
git commit -m "feat: 하자상세에 판단근거 스트립 추가, 보류 상태 지원, 배지 공용화"
```

---

## Task 6: 하자등록 페이지 — 필드 재배치 및 보류 옵션 일관성

**Files:**
- Modify: `app/defects/new/page.tsx`

**Interfaces:**
- Consumes: 없음 (등록 시 상태는 항상 `'open'`으로 시작하므로 select 자체는 추가하지 않음 — 아래 Step 1 참고)

- [ ] **Step 1: AI 현장 메모 분석 카드를 접을 수 있게 변경**

`app/defects/new/page.tsx`에서 `const [aiMemo, setAiMemo] = useState('')` 근처에 접기 상태 추가:

```tsx
  const [aiMemoExpanded, setAiMemoExpanded] = useState(false)
```

"AI 현장 메모 분석" 카드의 헤더(`<div style={{ padding: '12px 18px', background: 'linear-gradient(...)' ...}}>`)를 클릭 가능하게 만들고, 본문(`<div style={{ padding: 18 }}>` 이하 textarea부터 AI 결과 표시까지)을 `{aiMemoExpanded && (...)}`로 감싼다. 헤더에 `onClick={() => setAiMemoExpanded(v => !v)}`와 우측에 펼침/접힘 화살표 아이콘(`<i className={\`fa-solid ${aiMemoExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}\`} />`)을 추가. 기본값은 `false`(접힌 상태)로 시작해 현장에서 사진/기본정보 입력이 먼저 보이게 한다.

- [ ] **Step 2: 사진 첨부 카드를 AI 메모 분석 카드보다 앞으로 이동**

현재 순서는 "AI 현장 메모 분석" → "AI 비용 예측(조건부)" → "기본 정보" → "위치 선택" → "사진 첨부". 다음 순서로 재배치:

1. "기본 정보" 카드
2. "사진 첨부 (선택, 조치전)" 카드
3. "위치 선택" 카드
4. "AI 현장 메모 분석" 카드 (Step 1에서 접힌 상태로)
5. "AI 비용 예측" 카드 (AI 분석 결과가 있을 때만 조건부 렌더, 기존 로직 유지)

JSX 블록 4개(기본정보/사진첨부/위치선택/AI메모)를 통째로 잘라내어 이 순서로 재배치한다. 각 블록의 내부 코드는 수정하지 않고 순서만 바꾼다.

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: `app/defects/new/page.tsx` 관련 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add app/defects/new/page.tsx
git commit -m "feat: 하자등록 화면 현장입력 중심으로 재배치 (사진첨부 상향, AI메모 접기)"
```

---

## Task 7: 반응형 마무리 + 최종 검증 및 배포

**Files:**
- Modify: `app/dashboard/page.tsx` (반응형 그리드)
- Modify: `app/defects/page.tsx` (반응형 필터바)
- Modify: `app/defects/[id]/page.tsx` (반응형 2단 → 1단)
- Modify: `app/defects/new/page.tsx`, `app/defects/[id]/edit/page.tsx` (반응형 2단 → 1단)

**Interfaces:**
- Consumes: Task 1의 `useMediaQuery`

- [ ] **Step 1: 각 페이지에 반응형 훅 적용**

4개 페이지 공통 패턴 — 컴포넌트 최상단에 추가:

```tsx
import { useMediaQuery } from '@/lib/useMediaQuery'
```

```tsx
  const isTablet = useMediaQuery('(max-width: 1024px)')
```

- **`app/dashboard/page.tsx`**: 우선순위 배너 `gridTemplateColumns: '1fr 1fr 1fr 1fr 1.2fr'` → `isTablet ? 'repeat(2,1fr)' : '1fr 1fr 1fr 1fr 1.2fr'`. KPI Grid `gridTemplateColumns: 'repeat(4,1fr)'` → `isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)'`. Row 1/Row 2/Row B/Row C의 `gridTemplateColumns: '3fr 2fr'` 및 `'1fr 1fr'` → `isTablet ? '1fr' : '3fr 2fr'` / `isTablet ? '1fr' : '1fr 1fr'`.
- **`app/defects/page.tsx`**: Filter Row의 `display: 'flex', flexWrap: 'wrap'`는 이미 랩되므로 추가 수정 불필요. 테이블은 `<div style={{ overflowX: isTablet ? 'auto' : 'visible' }}>`로 테이블 전체를 감싸 가로 스크롤 허용(카드형 전환은 범위 밖).
- **`app/defects/[id]/page.tsx`**: `gridTemplateColumns: '1fr 360px'` (Detail Grid) → `isTablet ? '1fr' : '1fr 360px'`.
- **`app/defects/new/page.tsx`**, **`app/defects/[id]/edit/page.tsx`**: `gridTemplateColumns: '1fr 320px'` → `isTablet ? '1fr' : '1fr 320px'`.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 5개 파일 관련 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx app/defects/page.tsx "app/defects/[id]/page.tsx" app/defects/new/page.tsx "app/defects/[id]/edit/page.tsx"
git commit -m "feat: 4개 화면 태블릿 반응형 대응 (1024px 브레이크포인트)"
```

- [ ] **Step 4: 원격 push + Vercel 배포**

```bash
git push origin master
```

이어서 (사용자 승인 후) `npx vercel --prod` 실행. `.vercel/project.json`의 `projectName`이 `hazard-management-seegene`인지 반드시 먼저 확인.

- [ ] **Step 5: 실사이트 검증**

배포된 `https://hazard-management-seegene.vercel.app`에서:
- `/dashboard`: 우선순위 배너 4카드 노출, 클릭 시 `/defects?filter=...`로 이동하며 목록이 해당 조건으로 필터링되는지 확인
- `/defects`: 퀵필터 칩 동작, 지연 항목에 좌측 주황 바 표시 확인
- `/defects/[id]`: 상태를 `보류`로 변경 후 판단근거 스트립·목록·대시보드 KPI에 반영되는지 확인
- `/defects/new`: 사진첨부가 기본정보 다음에 보이는지, AI 메모 카드가 접혀서 시작하는지 확인
- 브라우저 창을 1024px 이하로 줄여 그리드가 1~2열로 재배열되는지 확인
- 기존 기능(등록/수정/삭제/이력추가/사진첨부/도면업로드/AI분석/AI검색/보고서) 전부 정상 동작 확인 — 회귀 없음

---

## Self-Review 결과

- **스펙 커버리지**: 디자인 토큰(Task1) · 팔레트 전역 적용(Task2) · 대시보드 우선순위+AI요약(Task3) · 목록 지연/퀵필터(Task4) · 상세 판단근거+보류(Task5) · 등록 재배치(Task6) · 반응형+최종검증(Task7) — 스펙의 9개 섹션 모두 태스크로 매핑됨.
- **placeholder 스캔**: "TBD"/"추가 검증 필요" 등 표현 없음. 모든 스타일 변경은 정확한 색상 hex와 대상 라인/블록을 명시함.
- **타입 일치**: `StatusKey`/`SeverityKey`는 Task1에서 정의된 그대로 Task4·5에서 동일하게 참조. `isOverdue`/`isRecurring`/`needsTodayAction` 함수 시그니처(`(defect: Defect) => boolean`)는 모든 태스크에서 동일하게 사용.
