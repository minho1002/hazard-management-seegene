import type { Role } from '@/lib/permissions'

export type AccountStatus = '활성' | '비활성' | '잠금' | '삭제됨'

export interface User {
  id: string
  username: string
  passwordHash: string
  name: string
  department: string
  position: string
  phone: string
  email: string
  role: Role
  status: AccountStatus
  mustChangePassword: boolean
  failedLoginCount: number
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export type UserAuditAction =
  | 'CREATE' | 'UPDATE' | 'ROLE_CHANGE' | 'PASSWORD_RESET'
  | 'DISABLE' | 'ENABLE' | 'DELETE' | 'LOGIN_SUCCESS' | 'LOGIN_FAIL'
  | 'PERMISSION_CHANGE'

export interface UserAuditLog {
  id: string
  targetUserId: string
  targetUsername: string
  action: UserAuditAction
  changedBy: string
  beforeValue: Record<string, unknown> | null
  afterValue: Record<string, unknown> | null
  reason: string | null
  createdAt: string
}

export interface LoginHistoryEntry {
  id: string
  username: string
  success: boolean
  reason: string | null
  createdAt: string
}

export interface Session {
  userId: string
  username: string
  name: string
  department: string
  role: Role
  loginAt: string
}
