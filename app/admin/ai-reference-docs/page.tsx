'use client'

import { useEffect, useState } from 'react'
import { canAccessAdminSettings, useCurrentRole, useCurrentUserName } from '@/lib/permissions'
import AccessDenied from '@/components/ui/AccessDenied'

interface ReferenceDocumentRow {
  id: number
  title: string
  vendor: string
  trade: string | null
  version: number
  fileType: string
  blobUrl: string
  extractionFailed: boolean
  isActive: boolean
  supersedes: number | null
  uploadedBy: string | null
  uploadedAt: string
}

const TRADE_OPTIONS = ['건축/인테리어', '전기', '설비 냉난방', '방수', '엘리베이터', '조경', '기타']

export default function AiReferenceDocsPage() {
  const role = useCurrentRole()
  const userName = useCurrentUserName()
  const [docs, setDocs] = useState<ReferenceDocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ title: '', vendor: '', trade: TRADE_OPTIONS[0] })
  const [file, setFile] = useState<File | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/reference-docs')
    setDocs(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (!canAccessAdminSettings(role)) {
    return <AccessDenied message="관리자만 AI 기준자료를 관리할 수 있습니다." />
  }

  async function submitUpload() {
    if (!file || !form.title.trim() || !form.vendor.trim()) { alert('자료명, 업체명, 파일을 모두 입력하세요.'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', form.title.trim())
      fd.append('vendor', form.vendor.trim())
      fd.append('trade', form.trade)
      fd.append('uploadedBy', userName)
      const res = await fetch('/api/reference-docs', { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); alert(e.error ?? '업로드 실패'); return }
      setShowUpload(false)
      setForm({ title: '', vendor: '', trade: TRADE_OPTIONS[0] })
      setFile(null)
      await load()
    } finally {
      setUploading(false)
    }
  }

  async function toggleActive(id: number, isActive: boolean) {
    await fetch(`/api/reference-docs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) })
    await load()
  }

  async function removeDoc(id: number) {
    if (!confirm('이 기준자료를 완전히 삭제하시겠습니까?')) return
    await fetch(`/api/reference-docs/${id}`, { method: 'DELETE' })
    await load()
  }

  const cell: React.CSSProperties = { padding: '10px 14px', fontSize: '0.78rem', color: '#425466', borderBottom: '1px solid #f0f4f8' }

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>AI 하자 기준자료 관리</h1>
          <div style={{ fontSize: '0.75rem', color: '#697386', marginTop: 3 }}>
            여러 시공사의 유무상 구분 기준자료를 업로드·버전관리합니다. 적용(활성) 상태인 자료만 AI 분석에 사용됩니다.
          </div>
        </div>
        <button onClick={() => setShowUpload(true)} style={{ padding: '9px 18px', background: '#635bff', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
          <i className="fa-solid fa-upload" style={{ marginRight: 6 }} />새 기준자료 업로드
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafbfc' }}>
              {['자료명', '업체명', '공종', '버전', '등록일', '적용여부', '동작'].map(h => (
                <th key={h} style={{ ...cell, fontWeight: 700, color: '#0a2540', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && docs.length === 0 && (
              <tr><td colSpan={7} style={{ ...cell, textAlign: 'center', padding: 40 }}>등록된 기준자료가 없습니다.</td></tr>
            )}
            {docs.map(d => (
              <tr key={d.id}>
                <td style={cell}>
                  <a href={d.blobUrl} target="_blank" rel="noreferrer" style={{ color: '#635bff', textDecoration: 'none' }}>{d.title}</a>
                  {d.extractionFailed && <span style={{ marginLeft: 6, color: '#be1044', fontSize: '0.68rem' }}>⚠ 추출 실패</span>}
                </td>
                <td style={cell}>{d.vendor}</td>
                <td style={cell}>{d.trade ?? '-'}</td>
                <td style={cell}>v{d.version}</td>
                <td style={cell}>{new Date(d.uploadedAt).toLocaleDateString('ko-KR')}</td>
                <td style={cell}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={d.isActive} onChange={e => toggleActive(d.id, e.target.checked)} />
                    <span style={{ color: d.isActive ? '#059669' : '#aab' }}>{d.isActive ? '적용중' : '비활성'}</span>
                  </label>
                </td>
                <td style={cell}>
                  <button onClick={() => removeDoc(d.id)} style={{ padding: '4px 10px', background: '#fef0f4', color: '#be1044', border: '1px solid #fecdd3', borderRadius: 6, fontSize: '0.7rem', cursor: 'pointer' }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,37,64,.42)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setShowUpload(false) }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 420, boxShadow: '0 8px 28px rgba(10,37,64,.13)' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0a2540', marginBottom: 16 }}>새 기준자료 업로드</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>자료명</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: 유무상안내구분자료" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e3e8ef', borderRadius: 7, fontSize: '0.82rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>업체명 (제한 없음, 직접 입력)</label>
                <input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="예: 국보디자인" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e3e8ef', borderRadius: 7, fontSize: '0.82rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>공종</label>
                <select value={form.trade} onChange={e => setForm(f => ({ ...f, trade: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e3e8ef', borderRadius: 7, fontSize: '0.82rem' }}>
                  {TRADE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466', display: 'block', marginBottom: 5 }}>파일 (PDF, Word, Excel)</label>
                <input type="file" accept=".pdf,.docx,.xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ width: '100%', fontSize: '0.8rem' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowUpload(false)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', cursor: 'pointer' }}>취소</button>
              <button onClick={submitUpload} disabled={uploading} style={{ padding: '8px 16px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 700, border: 'none', background: '#635bff', color: '#fff', cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.7 : 1 }}>
                {uploading ? '업로드 중...' : '업로드'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
