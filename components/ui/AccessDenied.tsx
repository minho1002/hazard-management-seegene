'use client'

import { useRouter } from 'next/navigation'

interface Props {
  message?: string
}

export default function AccessDenied({ message = '이 화면에 접근할 권한이 없습니다.' }: Props) {
  const router = useRouter()
  return (
    <div style={{ padding: 52, textAlign: 'center', color: '#697386' }}>
      <i className="fa-solid fa-lock" style={{ fontSize: '1.8rem', display: 'block', marginBottom: 10 }} />
      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0a2540', marginBottom: 4 }}>접근 권한이 없습니다</p>
      <p style={{ fontSize: '0.78rem' }}>{message}</p>
      <button
        onClick={() => router.push('/dashboard')}
        style={{ marginTop: 16, padding: '8px 16px', background: '#635bff', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.8rem' }}
      >
        대시보드로 이동
      </button>
    </div>
  )
}
