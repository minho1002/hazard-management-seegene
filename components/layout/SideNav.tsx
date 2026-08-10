'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useState } from 'react'
import { useCurrentRole, canRegister, canAccessAudit, canAccessAdminSettings } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'
import UserPanel from './UserPanel'

// 운영 — 대시보드/운영현황/하자등록 (하자 목록은 운영현황의 "목록 보기" 탭으로 통합됨 — 메뉴만 제거,
// /defects 라우트 자체는 다른 화면의 필터 링크(예: 대시보드 KPI → /defects?filter=…)를 위해 유지한다)
const operationsItems = [
  { href: '/dashboard',   label: '대시보드', icon: 'fa-solid fa-table-cells-large' },
  { href: '/analytics',   label: '운영현황', icon: 'fa-solid fa-calendar-days' },
  { href: '/defects/new', label: '하자 등록', icon: 'fa-solid fa-circle-plus' },
]

// 분석 — 보고서/AI보고서/AI어시스턴트/AI 하자 기준자료
const analysisItems = [
  { href: '/reports',    label: '보고서',       icon: 'fa-solid fa-chart-bar' },
  { href: '/reports/ai', label: 'AI 보고서',    icon: 'fa-solid fa-wand-magic-sparkles' },
  { href: '/ai',         label: 'AI 어시스턴트', icon: 'fa-solid fa-robot' },
]
// 관리 메뉴 통합(2026-08) — AI 하자 기준자료/사용자 관리/권한 관리/로그인 이력/계정 변경 이력/감사이력
// 6개로 세분화되어 있던 관리 메뉴를 4개로 단순화한다. 각 항목이 가리키는 화면 자체는 그대로이고
// (사용자·권한 관리, 시스템 이력은 탭 구조로 통합된 새 화면), 권한 게이팅도 원래 화면 기준을 유지한다.
// AI 기준자료 관리 — canAccessAdminSettings로 게이팅(기존과 동일).
const aiReferenceItem = { href: '/admin/ai-reference-docs', label: 'AI 기준자료 관리', icon: 'fa-solid fa-file-shield' }
// 사용자·권한 관리 — 구 사용자 관리 + 권한 관리, 둘 다 canAccessAdminSettings로 게이팅되던 화면이라
// 게이팅 조건은 그대로 유지된다.
const usersPermissionsItem = { href: '/admin/users-permissions', label: '사용자·권한 관리', icon: 'fa-solid fa-users-gear' }
// 시스템 이력 — 구 로그인 이력·계정 변경 이력(canAccessAdminSettings) + 감사이력(canAccessAudit,
// 독립 권한). 메뉴 항목 자체는 둘 중 하나라도 있으면 노출하고, 실제 각 탭의 표시 여부는
// /admin/system-history 내부에서 원래 권한 기준 그대로 다시 판단한다.
const systemHistoryItem = { href: '/admin/system-history', label: '시스템 이력', icon: 'fa-solid fa-clock-rotate-left' }

// 역할과 무관하게 모든 사용자에게 노출 — 관리 섹션의 일부로 표시되지만
// 권한 게이트 밖에서 항상 렌더링한다.
const helpItems = [
  { href: '/help', label: '사용자 가이드', icon: 'fa-solid fa-circle-question' },
]

function NavItem({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[0.8rem] font-medium mb-0.5 transition-all
        ${active
          ? 'text-white'
          : 'text-white/60 hover:text-white/85'}`}
      style={active ? { background: 'rgba(255,255,255,0.1)' } : undefined}
    >
      <i
        className={`${icon} text-center text-[0.8rem]`}
        style={{ width: 17, opacity: active ? 1 : 0.6, color: active ? '#818cf8' : undefined }}
      />
      {label}
    </Link>
  )
}

export default function SideNav() {
  const path = usePathname()
  const isMobile = useMediaQuery('(max-width: 900px)')
  const [open, setOpen] = useState(false)
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스가 마운트 후 갱신될 때 메뉴를 다시 계산하기 위한 구독

  const isActive = (href: string) => {
    if (href === '/defects')
      return path === '/defects' || (path.startsWith('/defects/') && path !== '/defects/new')
    if (href === '/reports')
      return path === '/reports'
    return path.startsWith(href)
  }

  return (
    <>
      {isMobile && (
        <button
          onClick={() => setOpen(true)}
          style={{ position: 'fixed', top: 12, left: 12, zIndex: 30, width: 36, height: 36, borderRadius: 8, background: '#0d1f35', color: '#fff', border: 'none', display: open ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <i className="fa-solid fa-bars" />
        </button>
      )}
      {isMobile && open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 19 }} />
      )}
      <aside
        className="app-sidenav flex flex-col flex-shrink-0 sticky top-0 z-10"
        style={{
          width: 216, minHeight: '100vh', background: '#0d1f35',
          position: isMobile ? 'fixed' : 'sticky',
          zIndex: 20,
          transform: isMobile && !open ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform .2s ease',
        }}
      >
      {/* Brand */}
      <div
        className="flex items-center gap-2.5 px-4"
        style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/seegene-logo.png"
          alt="씨젠의료재단"
          className="flex-shrink-0 rounded-lg"
          style={{ width: 32, height: 32, objectFit: 'contain' }}
        />
        <div>
          <p className="text-white font-bold leading-tight" style={{ fontSize: '0.8rem' }}>하자관리</p>
          <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>대전충청검사센터</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1" style={{ padding: 8, overflowY: 'auto' }}>
        <p
          className="font-bold uppercase px-2"
          style={{ fontSize: '0.6rem', letterSpacing: '0.09em', color: 'rgba(255,255,255,0.25)', paddingTop: 14, paddingBottom: 5 }}
        >
          운영
        </p>
        {operationsItems.filter(item => item.href !== '/defects/new' || canRegister(role)).map(item => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        <p
          className="font-bold uppercase px-2"
          style={{ fontSize: '0.6rem', letterSpacing: '0.09em', color: 'rgba(255,255,255,0.25)', paddingTop: 14, paddingBottom: 5 }}
        >
          분석
        </p>
        {analysisItems.map(item => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        {/* 사용자 가이드는 역할과 무관하게 항상 노출되므로 관리 섹션 헤더도 항상 표시한다 */}
        <p
          className="font-bold uppercase px-2"
          style={{ fontSize: '0.6rem', letterSpacing: '0.09em', color: 'rgba(255,255,255,0.25)', paddingTop: 14, paddingBottom: 5 }}
        >
          관리
        </p>
        {canAccessAdminSettings(role) && (
          <NavItem key={aiReferenceItem.href} {...aiReferenceItem} active={isActive(aiReferenceItem.href)} />
        )}
        {canAccessAdminSettings(role) && (
          <NavItem key={usersPermissionsItem.href} {...usersPermissionsItem} active={isActive(usersPermissionsItem.href)} />
        )}
        {(canAccessAdminSettings(role) || canAccessAudit(role)) && (
          <NavItem key={systemHistoryItem.href} {...systemHistoryItem} active={isActive(systemHistoryItem.href)} />
        )}
        {helpItems.map(item => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>

      {/* 로그인 사용자 정보 */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8 }}>
        <UserPanel />
      </div>

      {/* Footer */}
      <div
        className="flex items-center gap-1.5 px-4"
        style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.35)' }}>시설관리팀 운영중</span>
      </div>
    </aside>
    </>
  )
}
