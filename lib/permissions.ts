export type Role = '일반등록자' | '담당자' | '운영관리자' | '관리자' | '조회자'

const ROLE_STORAGE_KEY = 'hajaSys2_role'
const ROLE_ORDER: Role[] = ['조회자', '일반등록자', '담당자', '운영관리자', '관리자']

function loadRole(): Role {
  if (typeof window === 'undefined') return '관리자'
  const stored = localStorage.getItem(ROLE_STORAGE_KEY) as Role | null
  return stored && ROLE_ORDER.includes(stored) ? stored : '관리자'
}

// 로그인 없는 역할 전환기(8단계). ES 모듈의 named export는 라이브 바인딩이라
// setCurrentRole()로 값을 바꾸면 이미 이 값을 import해둔 다른 파일(예: lib/store.ts)도
// 다음 읽기 시점부터 최신 값을 그대로 참조한다 — 별도 Context/Provider가 필요 없다.
export let CURRENT_ROLE: Role = loadRole()

export function setCurrentRole(role: Role) {
  CURRENT_ROLE = role
  if (typeof window !== 'undefined') localStorage.setItem(ROLE_STORAGE_KEY, role)
}

function roleRank(role: Role): number {
  return ROLE_ORDER.indexOf(role)
}

export function canFinalize(role: Role): boolean {
  return role === '관리자'
}

export function canDelete(role: Role): boolean {
  return role === '관리자'
}

export function canRegister(role: Role): boolean {
  return role !== '조회자'
}

export function canEditStatus(role: Role): boolean {
  return roleRank(role) >= roleRank('담당자')
}

export function canAssign(role: Role): boolean {
  return roleRank(role) >= roleRank('운영관리자')
}
