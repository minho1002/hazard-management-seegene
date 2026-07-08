'use client'

import { usePathname } from 'next/navigation'
import SideNav from './SideNav'
import RoleBanner from './RoleBanner'
import AuthGate from '@/components/auth/AuthGate'

const PUBLIC_ROUTES = ['/login']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = PUBLIC_ROUTES.includes(pathname)

  if (isPublic) return <>{children}</>

  return (
    <>
      <SideNav />
      <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
        <AuthGate>
          <RoleBanner />
          {children}
        </AuthGate>
      </main>
    </>
  )
}
