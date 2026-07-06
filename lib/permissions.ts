// 8단계(권한관리)에서 실제 역할 전환 UI로 교체될 임시 스텁.
// 로그인 없는 단일 사용자 앱이므로 지금은 고정값이며, 인터페이스(Role/canX)만 먼저 확정한다.
export type Role = '일반등록자' | '담당자' | '운영관리자' | '관리자' | '조회자'

export const CURRENT_ROLE: Role = '관리자'

export function canFinalize(role: Role): boolean {
  return role === '관리자'
}

export function canDelete(role: Role): boolean {
  return role === '관리자'
}
