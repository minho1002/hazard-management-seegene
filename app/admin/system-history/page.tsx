'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { canAccessAdminSettings, canAccessAudit, useCurrentRole } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'
import AccessDenied from '@/components/ui/AccessDenied'
import LoginHistoryPanel from '@/components/admin/LoginHistoryPanel'
import UserAuditPanel from '@/components/admin/UserAuditPanel'
import AuditPanel from '@/components/admin/AuditPanel'

type TabKey = 'login' | 'account' | 'audit'

// 관리 메뉴 통합(2026-08) — 구 /admin/login-history, /admin/user-audit, /audit 세 개의 독립
// 이력 화면을 "시스템 이력" 하나의 화면 아래 탭으로 합친다. 각 탭은 그대로 이동한
// components/admin/LoginHistoryPanel · UserAuditPanel · AuditPanel을 재사용하고, 원래 화면별로
// 달랐던 권한 체크(로그인 이력·계정 변경 이력 → canAccessAdminSettings, 감사이력 → canAccessAudit
// 독립 권한)도 그대로 유지한다 — 탭 자체도 접근 가능한 것만 노출한다.
function SystemHistoryPageInner() {
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독
  const searchParams = useSearchParams()

  const canAdmin = canAccessAdminSettings(role)
  const canAudit = canAccessAudit(role)

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    ...(canAdmin ? [{ key: 'login' as const, label: '로그인 이력', icon: 'fa-solid fa-right-to-bracket' }] : []),
    ...(canAdmin ? [{ key: 'account' as const, label: '계정 변경 이력', icon: 'fa-solid fa-clock-rotate-left' }] : []),
    ...(canAudit ? [{ key: 'audit' as const, label: '감사이력', icon: 'fa-solid fa-clipboard-list' }] : []),
  ]

  const initialTab = searchParams.get('tab') as TabKey | null
  const defaultTab = TABS.some(t => t.key === initialTab) ? (initialTab as TabKey) : TABS[0]?.key
  const [tab, setTab] = useState<TabKey | undefined>(defaultTab)

  if (TABS.length === 0) {
    return <AccessDenied message="시스템 이력은 관리자만 접근할 수 있습니다." />
  }
  const activeTab = TABS.some(t => t.key === tab) ? tab : TABS[0].key

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ padding: '14px 20px 0', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540', marginBottom: 12 }}>시스템 이력</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: '8px 8px 0 0', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid #e3e8ef', borderBottom: activeTab === t.key ? '1px solid #fff' : '1px solid #e3e8ef',
                background: activeTab === t.key ? '#fff' : '#f5f7fa',
                color: activeTab === t.key ? '#635bff' : '#697386',
                position: 'relative', top: 1,
              }}
            >
              <i className={t.icon} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'login' && <LoginHistoryPanel />}
      {activeTab === 'account' && <UserAuditPanel />}
      {activeTab === 'audit' && <AuditPanel />}
    </div>
  )
}

export default function SystemHistoryPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#6B7280', fontSize: '.9rem' }}>로딩 중...</div>}>
      <SystemHistoryPageInner />
    </Suspense>
  )
}
