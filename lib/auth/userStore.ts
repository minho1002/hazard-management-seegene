import { useCallback, useEffect, useState } from 'react'
import { canManageUsers, type Role } from '@/lib/permissions'
import type { User, AccountStatus, UserAuditLog, LoginHistoryEntry } from './types'
import { getCurrentRole } from './session'
import {
  loadUsers, persistUsers, ensureSeeded, hashPassword,
  appendUserAuditLog, loadUserAuditLogs, loadLoginHistory,
  persistLoginHistory, persistUserAuditLogs,
  generateTempPassword, nextUserId,
} from './userStorage'

const NO_PERMISSION_ERROR = '사용자 계정을 관리할 권한이 없습니다.'

export interface NewUserInput {
  username: string
  password: string
  name: string
  department: string
  position: string
  phone: string
  email: string
  role: Role
  status: AccountStatus
}

export type UserUpdateInput = Partial<Pick<User, 'name' | 'department' | 'position' | 'phone' | 'email' | 'role' | 'status'>>

type Result = { ok: true } | { ok: false; error: string }

function activeAdminCount(users: User[], excludeId?: string): number {
  return users.filter(u => u.role === '관리자' && u.status !== '삭제됨' && u.id !== excludeId).length
}

export function useUserStore() {
  const [users, setUsers] = useState<User[]>([])
  const [auditLogs, setAuditLogs] = useState<UserAuditLog[]>([])
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([])
  const [ready, setReady] = useState(false)

  const refresh = useCallback(() => {
    setUsers(loadUsers())
    setAuditLogs(loadUserAuditLogs())
    setLoginHistory(loadLoginHistory())
  }, [])

  useEffect(() => {
    ensureSeeded().then(() => { refresh(); setReady(true) })
  }, [refresh])

  const createUser = useCallback(async (input: NewUserInput, createdBy: string): Promise<Result> => {
    if (!canManageUsers(getCurrentRole())) return { ok: false, error: NO_PERMISSION_ERROR }
    const current = loadUsers()
    if (current.some(u => u.username.toLowerCase() === input.username.toLowerCase() && u.status !== '삭제됨')) {
      return { ok: false, error: '이미 사용 중인 아이디입니다.' }
    }
    const now = new Date().toISOString()
    const user: User = {
      id: nextUserId(current),
      username: input.username,
      passwordHash: await hashPassword(input.password),
      name: input.name,
      department: input.department,
      position: input.position,
      phone: input.phone,
      email: input.email,
      role: input.role,
      status: input.status,
      mustChangePassword: true,
      failedLoginCount: 0,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    }
    persistUsers([...current, user])
    appendUserAuditLog({
      targetUserId: user.id, targetUsername: user.username, action: 'CREATE', changedBy: createdBy,
      beforeValue: null, afterValue: { name: user.name, role: user.role, status: user.status, department: user.department },
      reason: null,
    })
    refresh()
    return { ok: true }
  }, [refresh])

  const updateUser = useCallback((id: string, patch: UserUpdateInput, changedBy: string, reason?: string): Result => {
    if (!canManageUsers(getCurrentRole())) return { ok: false, error: NO_PERMISSION_ERROR }
    const current = loadUsers()
    const target = current.find(u => u.id === id)
    if (!target) return { ok: false, error: '사용자를 찾을 수 없습니다.' }

    if (patch.role && patch.role !== '관리자' && target.role === '관리자' && activeAdminCount(current, id) === 0) {
      return { ok: false, error: '마지막 관리자 계정의 역할은 변경할 수 없습니다.' }
    }
    if (patch.status && patch.status !== '활성' && target.role === '관리자' && activeAdminCount(current, id) === 0) {
      return { ok: false, error: '마지막 관리자 계정은 비활성화/잠금할 수 없습니다.' }
    }

    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const k of Object.keys(patch) as (keyof UserUpdateInput)[]) {
      if (patch[k] !== undefined && patch[k] !== target[k]) { before[k] = target[k]; after[k] = patch[k] }
    }

    const next = current.map(u => u.id === id ? { ...u, ...patch, updatedAt: new Date().toISOString() } : u)
    persistUsers(next)

    if ('role' in after) {
      appendUserAuditLog({ targetUserId: id, targetUsername: target.username, action: 'ROLE_CHANGE', changedBy, beforeValue: { role: before.role }, afterValue: { role: after.role }, reason: reason ?? null })
    }
    if ('status' in after && after.status === '비활성') {
      appendUserAuditLog({ targetUserId: id, targetUsername: target.username, action: 'DISABLE', changedBy, beforeValue: { status: before.status }, afterValue: { status: after.status }, reason: reason ?? null })
    } else if ('status' in after && after.status === '활성' && before.status !== undefined) {
      appendUserAuditLog({ targetUserId: id, targetUsername: target.username, action: 'ENABLE', changedBy, beforeValue: { status: before.status }, afterValue: { status: after.status }, reason: reason ?? null })
    }
    if (Object.keys(after).length > 0) {
      appendUserAuditLog({ targetUserId: id, targetUsername: target.username, action: 'UPDATE', changedBy, beforeValue: before, afterValue: after, reason: reason ?? null })
    }
    refresh()
    return { ok: true }
  }, [refresh])

  const deleteUser = useCallback((id: string, changedBy: string, currentSessionUserId: string, reason: string): Result => {
    if (!canManageUsers(getCurrentRole())) return { ok: false, error: NO_PERMISSION_ERROR }
    const current = loadUsers()
    const target = current.find(u => u.id === id)
    if (!target) return { ok: false, error: '사용자를 찾을 수 없습니다.' }
    if (id === currentSessionUserId) return { ok: false, error: '로그인 중인 본인 계정은 삭제할 수 없습니다.' }
    if (target.role === '관리자' && activeAdminCount(current, id) === 0) {
      return { ok: false, error: '마지막 관리자 계정은 삭제할 수 없습니다.' }
    }
    const next = current.map(u => u.id === id ? { ...u, status: '삭제됨' as const, updatedAt: new Date().toISOString() } : u)
    persistUsers(next)
    appendUserAuditLog({ targetUserId: id, targetUsername: target.username, action: 'DELETE', changedBy, beforeValue: { status: target.status }, afterValue: { status: '삭제됨' }, reason })
    refresh()
    return { ok: true }
  }, [refresh])

  const resetPassword = useCallback(async (id: string, changedBy: string): Promise<Result & { tempPassword?: string }> => {
    if (!canManageUsers(getCurrentRole())) return { ok: false, error: NO_PERMISSION_ERROR }
    const current = loadUsers()
    const target = current.find(u => u.id === id)
    if (!target) return { ok: false, error: '사용자를 찾을 수 없습니다.' }
    const tempPassword = generateTempPassword()
    const next = current.map(u => u.id === id
      ? { ...u, passwordHash: '', mustChangePassword: true, updatedAt: new Date().toISOString() }
      : u)
    const hashed = await hashPassword(tempPassword)
    const finalNext = next.map(u => u.id === id ? { ...u, passwordHash: hashed } : u)
    persistUsers(finalNext)
    appendUserAuditLog({ targetUserId: id, targetUsername: target.username, action: 'PASSWORD_RESET', changedBy, beforeValue: null, afterValue: null, reason: null })
    refresh()
    return { ok: true, tempPassword }
  }, [refresh])

  const deleteLoginHistory = useCallback((ids: string[]): Result => {
    if (!canManageUsers(getCurrentRole())) return { ok: false, error: NO_PERMISSION_ERROR }
    const current = loadLoginHistory()
    const idSet = new Set(ids)
    persistLoginHistory(current.filter(h => !idSet.has(h.id)))
    refresh()
    return { ok: true }
  }, [refresh])

  const deleteUserAuditLogs = useCallback((ids: string[]): Result => {
    if (!canManageUsers(getCurrentRole())) return { ok: false, error: NO_PERMISSION_ERROR }
    const current = loadUserAuditLogs()
    const idSet = new Set(ids)
    persistUserAuditLogs(current.filter(l => !idSet.has(l.id)))
    refresh()
    return { ok: true }
  }, [refresh])

  return { users, auditLogs, loginHistory, ready, createUser, updateUser, deleteUser, resetPassword, deleteLoginHistory, deleteUserAuditLogs, refresh }
}
