import { useSyncExternalStore } from 'react'

export type Role = '조회자' | '실무자' | '관리자'

const ROLE_STORAGE_KEY = 'hajaSys2_role'
const USER_NAME_STORAGE_KEY = 'hajaSys2_userName'
const ROLE_ORDER: Role[] = ['조회자', '실무자', '관리자']
const DEFAULT_USER_NAME = '김관리'

// 5역할(관리자/운영관리자/담당자/일반등록자/조회자) → 3역할 통합 매핑.
// 과거 세션에서 저장된 localStorage 값도 그대로 승계되도록 하위호환 처리.
const LEGACY_ROLE_MAP: Record<string, Role> = {
  '관리자': '관리자',
  '운영관리자': '관리자',
  '담당자': '실무자',
  '일반등록자': '실무자',
  '조회자': '조회자',
}

function normalizeRole(value: string | null): Role {
  if (!value) return '관리자'
  if ((ROLE_ORDER as string[]).includes(value)) return value as Role
  return LEGACY_ROLE_MAP[value] ?? '관리자'
}

function loadRole(): Role {
  if (typeof window === 'undefined') return '관리자'
  return normalizeRole(localStorage.getItem(ROLE_STORAGE_KEY))
}

function loadUserName(): string {
  if (typeof window === 'undefined') return DEFAULT_USER_NAME
  return localStorage.getItem(USER_NAME_STORAGE_KEY) || DEFAULT_USER_NAME
}

// 로그인 없는 역할 전환기. ES 모듈의 named export는 라이브 바인딩이라
// setCurrentRole()로 값을 바꾸면 이미 이 값을 import해둔 다른 파일(예: lib/store.ts)도
// 다음 읽기 시점부터 최신 값을 그대로 참조한다 — 별도 Context/Provider가 필요 없다.
export let CURRENT_ROLE: Role = loadRole()
export let CURRENT_USER_NAME: string = loadUserName()

const listeners = new Set<() => void>()
function emitChange() {
  listeners.forEach(l => l())
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function setCurrentRole(role: Role) {
  CURRENT_ROLE = role
  if (typeof window !== 'undefined') localStorage.setItem(ROLE_STORAGE_KEY, role)
  emitChange()
}

export function setCurrentUserName(name: string) {
  const trimmed = name.trim() || DEFAULT_USER_NAME
  CURRENT_USER_NAME = trimmed
  if (typeof window !== 'undefined') localStorage.setItem(USER_NAME_STORAGE_KEY, trimmed)
  emitChange()
}

// 렌더링(JSX)에서 역할/사용자명을 참조할 때는 반드시 이 훅을 사용한다.
// CURRENT_ROLE/CURRENT_USER_NAME을 렌더 중 직접 읽으면, 브라우저에서는 모듈 로드 시점에
// 이미 localStorage 값이 반영되어 있는 반면 서버 렌더링은 항상 기본값('관리자')이므로
// 하이드레이션 시 텍스트/구조 불일치 에러(React #418/#425)가 발생한다.
// useSyncExternalStore의 getServerSnapshot으로 항상 서버와 동일한 기본값을 먼저 렌더링하고,
// 하이드레이션 이후에만 실제 값으로 갱신해 이 문제를 피한다.
export function useCurrentRole(): Role {
  return useSyncExternalStore(subscribe, () => CURRENT_ROLE, () => '관리자')
}

export function useCurrentUserName(): string {
  return useSyncExternalStore(subscribe, () => CURRENT_USER_NAME, () => DEFAULT_USER_NAME)
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  '조회자': '조회 전용 권한입니다.',
  '실무자': '담당 하자 등록 및 조치 입력 권한입니다.',
  '관리자': '전체 시스템 관리 권한입니다.',
}

export function isViewer(role: Role): boolean {
  return role === '조회자'
}

// 하자 등록 화면 접근 및 등록 실행
export function canRegister(role: Role): boolean {
  return role !== '조회자'
}

// 진행상태 변경(조치완료 요청 등). 최종완료 전환 자체는 canFinalize에서 별도 검증.
export function canEditStatus(role: Role): boolean {
  return role !== '조회자'
}

// 삭제, 최종완료 승인, 비용 승인, 반복하자 확정/해제 등 최종 판단은 관리자만.
export function canFinalize(role: Role): boolean {
  return role === '관리자'
}

export function canDelete(role: Role): boolean {
  return role === '관리자'
}

export function canAccessAudit(role: Role): boolean {
  return role === '관리자'
}

// 향후 확장 예정(사용자 권한관리/하자기준자료/카테고리 관리/보고서 승인) — 현재는
// 해당 화면이 없어 실제로 게이팅되는 곳은 없지만, 관리자 전용 API로 미리 노출해둔다.
export function canManageUsers(role: Role): boolean {
  return role === '관리자'
}

export function canManageReferenceData(role: Role): boolean {
  return role === '관리자'
}

export function canApproveReport(role: Role): boolean {
  return role === '관리자'
}

// 실무자는 담당자 미지정 건이거나 본인이 담당인 건만 등록/수정/조치 가능. 관리자는 전체.
export function canEditDefect(role: Role, managerName: string | null | undefined, currentUserName: string): boolean {
  if (role === '조회자') return false
  if (role === '관리자') return true
  return !managerName || managerName === currentUserName
}
