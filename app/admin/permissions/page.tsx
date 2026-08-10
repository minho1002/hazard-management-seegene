'use client'

import { redirect } from 'next/navigation'

// 관리 메뉴 통합(2026-08) — 권한 관리는 /admin/users-permissions의 "역할/권한" 탭으로 이동했다.
// 기존 URL(/admin/permissions)로 접근하는 경우를 위해 리다이렉트만 유지한다.
export default function PermissionsRedirectPage() {
  redirect('/admin/users-permissions?tab=roles')
}
