import type { Session } from './types'
import {
  ensureSeeded, loadUsers, persistUsers, findUserByUsername, verifyPassword,
  appendLoginHistory, appendUserAuditLog,
} from './userStorage'

export interface LoginResult {
  ok: boolean
  session?: Session
  error?: string
}

// 백엔드가 생기면(Supabase/Firebase/NextAuth/자체 API) 이 인터페이스만 구현하는
// 어댑터로 교체하면 되고, 세션·권한·UI 쪽 코드는 변경할 필요가 없도록 분리했다.
export interface AuthService {
  login(username: string, password: string): Promise<LoginResult>
  logout(): void
}

const SESSION_KEY = 'hajaSys2_session'

export function loadStoredSession(): Session | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(SESSION_KEY)
  return raw ? JSON.parse(raw) as Session : null
}

function persistSession(session: Session | null) {
  if (typeof window === 'undefined') return
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  else localStorage.removeItem(SESSION_KEY)
}

class LocalMockAuthService implements AuthService {
  async login(username: string, password: string): Promise<LoginResult> {
    await ensureSeeded()
    const users = loadUsers()
    const user = findUserByUsername(users, username)

    if (!user) {
      appendLoginHistory({ username, success: false, reason: '존재하지 않는 아이디' })
      return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' }
    }
    if (user.status === '비활성') {
      appendLoginHistory({ username, success: false, reason: '비활성 계정' })
      appendUserAuditLog({ targetUserId: user.id, targetUsername: user.username, action: 'LOGIN_FAIL', changedBy: username, beforeValue: null, afterValue: null, reason: '비활성 계정으로 로그인 시도' })
      return { ok: false, error: '비활성화된 계정입니다. 관리자에게 문의하세요.' }
    }
    if (user.status === '잠금') {
      appendLoginHistory({ username, success: false, reason: '잠긴 계정' })
      appendUserAuditLog({ targetUserId: user.id, targetUsername: user.username, action: 'LOGIN_FAIL', changedBy: username, beforeValue: null, afterValue: null, reason: '잠긴 계정으로 로그인 시도' })
      return { ok: false, error: '잠긴 계정입니다. 관리자에게 문의하세요.' }
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      const failedLoginCount = user.failedLoginCount + 1
      const shouldLock = failedLoginCount >= 5
      const next = users.map(u => u.id === user.id
        ? { ...u, failedLoginCount, status: shouldLock ? '잠금' as const : u.status, updatedAt: new Date().toISOString() }
        : u)
      persistUsers(next)
      appendLoginHistory({ username, success: false, reason: '비밀번호 불일치' })
      appendUserAuditLog({ targetUserId: user.id, targetUsername: user.username, action: 'LOGIN_FAIL', changedBy: username, beforeValue: null, afterValue: null, reason: `비밀번호 불일치 (${failedLoginCount}회 연속 실패)` })
      if (shouldLock) {
        return { ok: false, error: '비밀번호를 5회 연속 틀려 계정이 잠겼습니다. 관리자에게 문의하세요.' }
      }
      return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' }
    }

    const now = new Date().toISOString()
    const next = users.map(u => u.id === user.id ? { ...u, failedLoginCount: 0, lastLoginAt: now, updatedAt: now } : u)
    persistUsers(next)
    appendLoginHistory({ username, success: true, reason: null })
    appendUserAuditLog({ targetUserId: user.id, targetUsername: user.username, action: 'LOGIN_SUCCESS', changedBy: username, beforeValue: null, afterValue: null, reason: null })

    const session: Session = {
      userId: user.id, username: user.username, name: user.name,
      department: user.department, role: user.role, loginAt: now,
    }
    persistSession(session)
    return { ok: true, session }
  }

  logout() {
    persistSession(null)
  }
}

export const authService: AuthService = new LocalMockAuthService()
