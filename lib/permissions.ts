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

// 관리자 설정 메뉴(사용자관리/권한관리/로그인이력/계정변경이력) 전체 접근 게이트.
export function canAccessAdminSettings(role: Role): boolean {
  return role === '관리자'
}

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
