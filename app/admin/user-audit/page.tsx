'use client'

import { redirect } from 'next/navigation'

// 관리 메뉴 통합(2026-08) — 계정 변경 이력은 /admin/system-history의 "계정 변경 이력" 탭으로 이동했다.
// 기존 URL(/admin/user-audit)로 접근하는 경우를 위해 리다이렉트만 유지한다.
export default function UserAuditRedirectPage() {
  redirect('/admin/system-history?tab=account')
}
