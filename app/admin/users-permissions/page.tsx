'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import UserManagementPanel from '@/components/admin/UserManagementPanel'
import PermissionsPanel from '@/components/admin/PermissionsPanel'

const TABS = [
  { key: 'users', label: '사용자 계정', icon: 'fa-solid fa-users-gear' },
  { key: 'roles', label: '역할/권한', icon: 'fa-solid fa-shield-halved' },
] as const
type TabKey = typeof TABS[number]['key']

// 관리 메뉴 통합(2026-08) — 구 /admin/users(사용자 관리)와 /admin/permissions(권한 관리)를
// "사용자·권한 관리" 하나의 화면 아래 탭으로 합친다. 각 탭의 내용은 그대로 이동한
// components/admin/UserManagementPanel · PermissionsPanel을 재사용하며, 두 화면의 기능/권한
// 체크는 전혀 수정하지 않았다.
function UsersPermissionsPageInner() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabKey) ?? 'users'
  const [tab, setTab] = useState<TabKey>(TABS.some(t => t.key === initialTab) ? initialTab : 'users')

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ padding: '14px 20px 0', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540', marginBottom: 12 }}>사용자·권한 관리</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: '8px 8px 0 0', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid #e3e8ef', borderBottom: tab === t.key ? '1px solid #fff' : '1px solid #e3e8ef',
                background: tab === t.key ? '#fff' : '#f5f7fa',
                color: tab === t.key ? '#635bff' : '#697386',
                position: 'relative', top: 1,
              }}
            >
              <i className={t.icon} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'users' ? <UserManagementPanel /> : <PermissionsPanel />}
    </div>
  )
}

export default function UsersPermissionsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#6B7280', fontSize: '.9rem' }}>로딩 중...</div>}>
      <UsersPermissionsPageInner />
    </Suspense>
  )
}
