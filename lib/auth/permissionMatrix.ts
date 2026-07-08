import { useSyncExternalStore } from 'react'
import type { Role } from '@/lib/permissions'

export type Capability =
  | 'register' | 'editOwn' | 'delete' | 'approveCompletion'
  | 'confirmRecurring' | 'finalizeClassification' | 'approveReport'
  | 'viewAudit' | 'adminSettings' | 'manageUsers'

export type PermissionMatrix = Record<Role, Record<Capability, boolean>>

const STORAGE_KEY = 'hajaSys2_permissionMatrix'
const ROLES: Role[] = ['조회자', '실무자', '관리자']

export const CAPABILITY_LABELS: Record<Capability, string> = {
  register: '하자 등록',
  editOwn: '하자 수정 · 사진/첨부파일 업로드 · 진행상태 변경 · 조치완료 요청 · 하자구분/비용 의견입력',
  delete: '하자 삭제 (Soft Delete)',
  approveCompletion: '최종완료 승인',
  confirmRecurring: '반복 하자 확정 · 해제',
  finalizeClassification: '하자구분 · 비용부담 · 비용승인 최종 확정',
  approveReport: '보고서 최종 승인',
  viewAudit: '감사이력(하자) 조회',
  adminSettings: '관리자 설정 화면 접근 (사용자관리/권한관리/로그인이력/계정변경이력)',
  manageUsers: '사용자 계정 생성 · 수정 · 삭제 · 비밀번호 초기화',
}

// 실무자의 editOwn은 담당(본인) 건에 한해서만 적용된다 — canEditDefect의 소유권 검증과 함께 쓰인다.
export const CAPABILITY_NOTES: Partial<Record<Capability, string>> = {
  editOwn: '실무자는 본인/담당 건에 한해 적용되며, 관리자는 항상 전체 건에 적용됩니다.',
  approveReport: '현재 보고서 승인 화면이 없어 아직 실제 동작에는 반영되지 않습니다(추후 확장용).',
}

export const DEFAULT_MATRIX: PermissionMatrix = {
  '조회자': { register: false, editOwn: false, delete: false, approveCompletion: false, confirmRecurring: false, finalizeClassification: false, approveReport: false, viewAudit: false, adminSettings: false, manageUsers: false },
  '실무자': { register: true, editOwn: true, delete: false, approveCompletion: false, confirmRecurring: false, finalizeClassification: false, approveReport: false, viewAudit: false, adminSettings: false, manageUsers: false },
  '관리자': { register: true, editOwn: true, delete: true, approveCompletion: true, confirmRecurring: true, finalizeClassification: true, approveReport: true, viewAudit: true, adminSettings: true, manageUsers: true },
}

// 관리자가 실수로 스스로를 관리 화면에서 잠가버리는 사고를 막기 위한 안전장치.
// 이 두 능력만큼은 관리자 역할에서 항상 true로 강제하고, UI에서도 편집 불가로 표시한다.
export const LOCKED_FOR_ADMIN: Capability[] = ['adminSettings', 'manageUsers']

function enforceLocks(matrix: PermissionMatrix): PermissionMatrix {
  const admin = { ...matrix['관리자'] }
  for (const cap of LOCKED_FOR_ADMIN) admin[cap] = true
  return { ...matrix, '관리자': admin }
}

function cloneDefault(): PermissionMatrix {
  const next = {} as PermissionMatrix
  for (const role of ROLES) next[role] = { ...DEFAULT_MATRIX[role] }
  return next
}

function loadFromStorage(): PermissionMatrix {
  if (typeof window === 'undefined') return DEFAULT_MATRIX
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULT_MATRIX
  try {
    const parsed = JSON.parse(raw) as PermissionMatrix
    const merged = cloneDefault()
    for (const role of ROLES) merged[role] = { ...merged[role], ...(parsed[role] ?? {}) }
    return enforceLocks(merged)
  } catch {
    return DEFAULT_MATRIX
  }
}

// 서버 렌더/최초 클라이언트 렌더 모두 이 기본값으로 시작해 하이드레이션 불일치를 피한다.
// 실제 저장된 값은 hydratePermissionMatrix()가 마운트 이후에만 반영한다.
let currentMatrix: PermissionMatrix = DEFAULT_MATRIX
let hydrated = false

const listeners = new Set<() => void>()
function emitChange() {
  listeners.forEach(l => l())
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function hydratePermissionMatrix() {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  currentMatrix = loadFromStorage()
  emitChange()
}

export function savePermissionMatrix(next: PermissionMatrix) {
  currentMatrix = enforceLocks(next)
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(currentMatrix))
  emitChange()
}

export function resetPermissionMatrix() {
  currentMatrix = DEFAULT_MATRIX
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
  emitChange()
}

export function getPermissionMatrix(): PermissionMatrix {
  return currentMatrix
}

// 렌더 경로에서 매트릭스가 바뀔 때 재렌더되도록 구독하려면 이 훅을 호출한다.
// 반환값을 직접 쓰지 않더라도, 호출 자체가 마운트 후 하이드레이션 반영 시 재렌더를 유발한다.
export function usePermissionMatrix(): PermissionMatrix {
  return useSyncExternalStore(subscribe, () => currentMatrix, () => DEFAULT_MATRIX)
}

// 훅을 쓸 수 없는 순수 함수(예: lib/store.ts 이벤트 핸들러)에서 사용.
export function can(role: Role, capability: Capability): boolean {
  return currentMatrix[role]?.[capability] ?? false
}
