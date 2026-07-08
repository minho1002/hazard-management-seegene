import type { User, UserAuditLog, LoginHistoryEntry } from './types'

const USERS_KEY = 'hajaSys2_users'
const USER_AUDIT_KEY = 'hajaSys2_userAuditLogs'
const LOGIN_HISTORY_KEY = 'hajaSys2_loginHistory'

// 브라우저 전용 클라이언트 앱이라 서버 해시(bcrypt/argon2)를 쓸 수 없어 Web Crypto의
// SHA-256으로 평문 저장을 피한다. 실제 백엔드 도입 시 이 함수만 서버측 해시 호출로
// 교체하면 되도록 다른 코드는 해시 문자열의 알고리즘을 알지 못하게 격리했다.
export async function hashPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return (await hashPassword(plain)) === hash
}

function nextUserId(users: User[]): string {
  const nums = users.map(u => parseInt(u.id.replace('user-', ''), 10)).filter(n => !isNaN(n))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `user-${String(next).padStart(3, '0')}`
}

function nextLogId(prefix: string, arr: { id: string }[]): string {
  const nums = arr.map(x => parseInt(x.id.replace(`${prefix}-`, ''), 10)).filter(n => !isNaN(n))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `${prefix}-${String(next).padStart(4, '0')}`
}

// 최초 부팅 시 관리자 계정이 하나도 없으면 로그인 자체가 불가능해지므로 기본 관리자를
// 시드로 심어둔다. 초기 비밀번호는 로그인 화면에 안내 문구로도 노출한다.
export const SEED_ADMIN_USERNAME = 'admin'
export const SEED_ADMIN_PASSWORD = 'admin1234'

async function buildSeedUsers(): Promise<User[]> {
  const now = new Date().toISOString()
  return [{
    id: 'user-001',
    username: SEED_ADMIN_USERNAME,
    passwordHash: await hashPassword(SEED_ADMIN_PASSWORD),
    name: '관리자',
    department: '시설관리팀',
    position: '팀장',
    phone: '010-0000-0000',
    email: 'admin@example.com',
    role: '관리자',
    status: '활성',
    mustChangePassword: false,
    failedLoginCount: 0,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  }]
}

let seededUsers: User[] | null = null

export function loadUsers(): User[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(USERS_KEY)
  if (raw) {
    try { return JSON.parse(raw) as User[] } catch { /* fall through to reseed */ }
  }
  if (seededUsers) return seededUsers
  return []
}

// 최초 1회 비동기로 시드 관리자 계정을 만들어야 하므로 loadUsers()와 분리된 초기화 함수.
export async function ensureSeeded(): Promise<User[]> {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(USERS_KEY)
  if (raw) {
    try { return JSON.parse(raw) as User[] } catch { /* reseed below */ }
  }
  const seed = await buildSeedUsers()
  seededUsers = seed
  persistUsers(seed)
  return seed
}

export function persistUsers(users: User[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export function findUserByUsername(users: User[], username: string): User | undefined {
  return users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.status !== '삭제됨')
}

export function loadUserAuditLogs(): UserAuditLog[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(USER_AUDIT_KEY)
  return raw ? JSON.parse(raw) : []
}

export function appendUserAuditLog(entry: Omit<UserAuditLog, 'id' | 'createdAt'>): UserAuditLog {
  const logs = loadUserAuditLogs()
  const full: UserAuditLog = { ...entry, id: nextLogId('log', logs), createdAt: new Date().toISOString() }
  const next = [...logs, full]
  if (typeof window !== 'undefined') localStorage.setItem(USER_AUDIT_KEY, JSON.stringify(next))
  return full
}

export function loadLoginHistory(): LoginHistoryEntry[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(LOGIN_HISTORY_KEY)
  return raw ? JSON.parse(raw) : []
}

export function appendLoginHistory(entry: Omit<LoginHistoryEntry, 'id' | 'createdAt'>): LoginHistoryEntry {
  const history = loadLoginHistory()
  const full: LoginHistoryEntry = { ...entry, id: nextLogId('login', history), createdAt: new Date().toISOString() }
  const next = [...history, full]
  if (typeof window !== 'undefined') localStorage.setItem(LOGIN_HISTORY_KEY, JSON.stringify(next))
  return full
}

export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export { nextUserId }
