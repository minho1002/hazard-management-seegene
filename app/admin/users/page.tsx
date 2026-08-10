'use client'

import { redirect } from 'next/navigation'

// 관리 메뉴 통합(2026-08) — 사용자 관리는 /admin/users-permissions의 "사용자 계정" 탭으로 이동했다.
// 기존 URL(/admin/users)로 접근하는 경우를 위해 리다이렉트만 유지한다.
export default function UsersRedirectPage() {
  redirect('/admin/users-permissions?tab=users')
}
