import { can } from './auth/permissionMatrix'

export type Role = '조회자' | '실무자' | '관리자'

// 실제 로그인 세션(누가 로그인했는지)은 lib/auth/session.ts가 소유한다.
// 과거에는 이 파일이 로그인 없는 역할 전환기 상태를 직접 들고 있었지만,
// 계정 로그인 기능이 생기면서 "현재 사용자가 누구인지"는 세션의 책임이고
// 이 파일은 "역할별로 무엇을 할 수 있는지"라는 순수 권한 로직만 담당한다.
// 기존 호출부(app/*, components/*)의 import 경로를 그대로 유지하기 위해
// useCurrentRole/useCurrentUserName은 세션 모듈에서 재노출한다.
export { useCurrentRole, useCurrentUserName } from './auth/session'

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  '조회자': '조회 전용 권한입니다.',
  '실무자': '담당 하자 등록 및 조치 입력 권한입니다.',
  '관리자': '전체 시스템 관리 권한입니다.',
}

export function isViewer(role: Role): boolean {
  return role === '조회자'
}

// 아래 canXxx 함수들은 모두 lib/auth/permissionMatrix.ts의 편집 가능한 매트릭스를
// 조회한다. 실제 값은 관리자 설정 > 권한 관리 화면에서 역할별로 바꿀 수 있다.

// 하자 등록 화면 접근 및 등록 실행
export function canRegister(role: Role): boolean {
  return can(role, 'register')
}

// 삭제(Soft Delete)
export function canDelete(role: Role): boolean {
  return can(role, 'delete')
}

// 최종완료 승인
export function canApproveCompletion(role: Role): boolean {
  return can(role, 'approveCompletion')
}

// 반복 하자 확정/해제
export function canConfirmRecurring(role: Role): boolean {
  return can(role, 'confirmRecurring')
}

// 하자구분/귀책/비용부담/비용승인 최종 확정
export function canFinalizeClassification(role: Role): boolean {
  return can(role, 'finalizeClassification')
}

// 보고서 최종 승인 (현재 승인 화면 없음 — 추후 확장용)
export function canApproveReport(role: Role): boolean {
  return can(role, 'approveReport')
}

export function canAccessAudit(role: Role): boolean {
  return can(role, 'viewAudit')
}

// 관리자 설정 메뉴(사용자관리/권한관리/로그인이력/계정변경이력) 전체 접근 게이트.
export function canAccessAdminSettings(role: Role): boolean {
  return can(role, 'adminSettings')
}

// 사용자 계정 생성/수정/삭제/비밀번호초기화 실행 (adminSettings와 별개로,
// 관리자 설정 화면에는 들어오되 계정 변경은 못 하게 하는 것도 가능하도록 분리)
export function canManageUsers(role: Role): boolean {
  return can(role, 'manageUsers')
}

// 실무자는 담당자 미지정 건이거나 본인이 담당인 건만 등록/수정/조치 가능. 관리자는 전체.
export function canEditDefect(role: Role, managerName: string | null | undefined, currentUserName: string): boolean {
  if (!can(role, 'editOwn')) return false
  if (role === '관리자') return true
  return !managerName || managerName === currentUserName
}
