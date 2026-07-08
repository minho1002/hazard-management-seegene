'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { login, useSession } from '@/lib/auth/session'

export default function LoginPage() {
  const router = useRouter()
  const session = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (session) router.replace('/dashboard')
  }, [session, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) { setError('아이디와 비밀번호를 입력하세요.'); return }
    setSubmitting(true)
    setError(null)
    const result = await login(username.trim(), password)
    setSubmitting(false)
    if (!result.ok) { setError(result.error ?? '로그인에 실패했습니다.'); return }
    router.push('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F6F8', padding: 20 }}>
      <div style={{ width: 380, maxWidth: '100%', background: '#fff', border: '1px solid #e3e8ef', borderRadius: 14, boxShadow: '0 8px 28px rgba(10,37,64,.08)', padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#635bff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fa-solid fa-building-shield" style={{ color: '#fff', fontSize: 16 }} />
          </div>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0a2540' }}>하자관리 시스템</div>
            <div style={{ fontSize: '0.7rem', color: '#697386' }}>대전충청검사센터</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>아이디</label>
            <input
              autoFocus
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="아이디를 입력하세요"
              style={{ width: '100%', border: '1px solid #e3e8ef', borderRadius: 7, padding: '9px 12px', fontSize: '0.85rem', fontFamily: 'inherit', color: '#0a2540', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              style={{ width: '100%', border: '1px solid #e3e8ef', borderRadius: 7, padding: '9px 12px', fontSize: '0.85rem', fontFamily: 'inherit', color: '#0a2540', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {error && (
            <div style={{ marginTop: 10, padding: '9px 12px', background: '#fef0f4', border: '1px solid #fecdd3', borderRadius: 7, fontSize: '0.78rem', color: '#be1044', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-circle-exclamation" /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{ width: '100%', marginTop: 18, padding: 11, borderRadius: 7, fontSize: '0.85rem', fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', border: 'none', background: submitting ? 'rgba(99,91,255,.6)' : '#635bff', color: '#fff', fontFamily: 'inherit' }}
          >
            {submitting ? '로그인 중...' : '로그인'}
          </button>

          <button
            type="button"
            onClick={() => alert('비밀번호 찾기 기능은 추후 제공될 예정입니다. 관리자에게 문의하세요.')}
            style={{ width: '100%', marginTop: 8, padding: 9, borderRadius: 7, fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', border: 'none', background: 'none', color: '#697386', fontFamily: 'inherit', textDecoration: 'underline' }}
          >
            비밀번호를 잊으셨나요?
          </button>
        </form>
      </div>
    </div>
  )
}
