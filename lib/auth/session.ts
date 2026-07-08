import { useSyncExternalStore } from 'react'
import type { Role } from '@/lib/permissions'
import type { Session } from './types'
import { authService, loadStoredSession, type LoginResult } from './authService'

const DEFAULT_ROLE: Role = '조회자'

let currentSession: Session | null = loadStoredSession()
const listeners = new Set<() => void>()
function emitChange() {
  listeners.forEach(l => l())
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const result = await authService.login(username, password)
  if (result.ok && result.session) {
    currentSession = result.session
    emitChange()
  }
  return result
}

export function logout() {
  authService.logout()
  currentSession = null
  emitChange()
}

export function getSession(): Session | null {
  return currentSession
}

// 훅을 쓸 수 없는 순수 함수(예: lib/store.ts의 이벤트 핸들러)에서 현재 역할/사용자명을
// 동기적으로 읽을 때 사용한다. 렌더링 경로에서는 반드시 useCurrentRole/useCurrentUserName을 쓸 것.
export function getCurrentRole(): Role {
  return currentSession?.role ?? DEFAULT_ROLE
}

export function getCurrentUserName(): string {
  return currentSession?.name ?? ''
}

// AuthGate/SideNav/권한 훅이 전부 이 훅을 통해서만 세션을 읽는다.
// getServerSnapshot이 항상 null(비로그인 상태와 동일)을 반환해 서버 렌더와
// 클라이언트 최초 렌더가 일치하고, 마운트 이후에만 실제 로그인 세션으로 갱신되어
// 하이드레이션 불일치가 발생하지 않는다.
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, () => currentSession, () => null)
}

export function useCurrentRole(): Role {
  const session = useSession()
  return session?.role ?? DEFAULT_ROLE
}

export function useCurrentUserName(): string {
  const session = useSession()
  return session?.name ?? ''
}
