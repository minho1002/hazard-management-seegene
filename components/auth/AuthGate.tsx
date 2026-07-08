'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth/session'

// 미로그인 사용자가 보호된 페이지에 직접 URL로 접근하는 것을 막는다.
//
// useSession()은 하이드레이션 안전을 위해 서버와 일치하는 최초 렌더에서 항상 null을
// 반환한다(useSyncExternalStore의 getServerSnapshot). 문제는 "정말 로그인 안 함"과
// "아직 실제 세션값을 확인 전"이 첫 렌더에서 둘 다 null로 보인다는 점이다. mounted
// 플래그 없이 곧바로 `if (!session) router.replace('/login')`를 실행하면, 실제로는
// 로그인되어 있어도 새로고침/직접 URL 접근(하드 내비게이션) 시 항상 로그인 페이지로
// 튕겨나가는 버그가 생긴다. mounted 상태를 한 번 더 거쳐 useSyncExternalStore가
// 실제 클라이언트 값으로 갱신된 뒤에만 리다이렉트 여부를 판단한다.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const session = useSession()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (mounted && !session) router.replace('/login')
  }, [mounted, session, router])

  if (!mounted || !session) return null

  return <>{children}</>
}
