'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useState } from 'react'
import { useCurrentRole, canRegister, canAccessAudit, canAccessAdminSettings } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'
import UserPanel from './UserPanel'

const menuItems = [
  { href: '/dashboard',   label: '대시보드', icon: 'fa-solid fa-table-cells-large' },
  { href: '/analytics',   label: '운영현황', icon: 'fa-solid fa-calendar-days' },
  { href: '/defects',     label: '하자 목록', icon: 'fa-solid fa-list-check' },
  { href: '/defects/new', label: '하자 등록', icon: 'fa-solid fa-circle-plus' },
]

const analysisItems = [
  { href: '/reports',    label: '보고서',       icon: 'fa-solid fa-chart-bar' },
  { href: '/reports/ai', label: 'AI 보고서',    icon: 'fa-solid fa-wand-magic-sparkles' },
  { href: '/ai',         label: 'AI 어시스턴트', icon: 'fa-solid fa-robot' },
]

const adminItems = [
  { href: '/admin/ai-reference-docs', label: 'AI 하자 기준자료 관리', icon: 'fa-solid fa-file-shield' },
  { href: '/admin/users',            label: '사용자 관리',       icon: 'fa-solid fa-users-gear' },
  { href: '/admin/permissions',      label: '권한 관리',         icon: 'fa-solid fa-shield-halved' },
  { href: '/admin/login-history',    label: '로그인 이력',       icon: 'fa-solid fa-right-to-bracket' },
  { href: '/admin/user-audit',       label: '계정 변경 이력',     icon: 'fa-solid fa-clock-rotate-left' },
]

// 감사이력은 관리 섹션 항목이지만, canAccessAdminSettings와는 별개인 canAccessAudit 권한으로
// 독립적으로 게이팅된다(관리자 설정 접근 권한이 없어도 감사이력만 볼 수 있는 역할이 있을 수 있음).
// adminItems 배열에 합치지 않고 별도로 두어 이 독립 게이팅을 그대로 유지한다.
const auditItem = { href: '/audit', label: '감사이력', icon: 'fa-solid fa-clipboard-list' }

// 역할과 무관하게 모든 사용자에게 노출 — 관리자 설정 섹션 바로 아래에 배치되지만
// canAccessAdminSettings 게이트 밖에서 항상 렌더링한다.
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
          메뉴
        </p>
        {menuItems.filter(item => item.href !== '/defects/new' || canRegister(role)).map(item => (
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

        {(canAccessAdminSettings(role) || canAccessAudit(role)) && (
          <>
            <p
              className="font-bold uppercase px-2"
              style={{ fontSize: '0.6rem', letterSpacing: '0.09em', color: 'rgba(255,255,255,0.25)', paddingTop: 14, paddingBottom: 5 }}
            >
              관리
            </p>
            {canAccessAdminSettings(role) && adminItems.map(item => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
            {canAccessAudit(role) && (
              <NavItem key={auditItem.href} {...auditItem} active={isActive(auditItem.href)} />
            )}
          </>
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
