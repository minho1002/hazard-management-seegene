'use client'

import { useEffect, useState } from 'react'

export interface AiClassificationResult {
  constructionPct: number
  usagePct: number
  warrantyPct: number
  reasoning: string
  citedDocs: { vendor: string; title: string; version: number }[]
  adminChecklist: string[]
  recommendedAction: string
  confidenceLabel: '낮음' | '중간' | '높음'
  confidencePct: number
  fallback: boolean
}

export function mapPctToDefectType(result: AiClassificationResult): { defectType: string; responsibilityType: string; costBearer: string } {
  const max = Math.max(result.constructionPct, result.usagePct, result.warrantyPct)
  if (max === result.constructionPct) return { defectType: '하자사항', responsibilityType: '시공사 귀책', costBearer: '시공사' }
  if (max === result.usagePct) return { defectType: '일반사항', responsibilityType: '사용자 과실', costBearer: '사용자' }
  return { defectType: '확인 필요', responsibilityType: '원인 불명', costBearer: '보험/기타' }
}

function confidenceColor(pct: number): string {
  if (pct >= 80) return '#059669'
  if (pct >= 60) return '#d97706'
  return '#be1044'
}

function ProbBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
        <span style={{ color: '#425466', fontWeight: 600 }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: '#f0f4f8', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} />
      </div>
    </div>
  )
}

export interface AiClassificationInput {
  title: string
  description: string
  location: string
  facility: string
  occurredAt: string
  category: string
  photos: string[]
}

export default function AiClassificationPanel({
  input, onApply, autoRun = true,
}: {
  input: AiClassificationInput
  onApply: (mapped: { defectType: string; responsibilityType: string; costBearer: string }, result: AiClassificationResult) => void
  autoRun?: boolean
}) {
  const [result, setResult] = useState<AiClassificationResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function runAnalysis() {
    if (!input.title.trim() && !input.description.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/ai/classify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      })
      if (res.ok) setResult(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!autoRun) return
    const t = setTimeout(() => { if (input.title.trim().length >= 2 || input.description.trim().length >= 5) runAnalysis() }, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.title, input.description])

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e3e8ef', padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0a2540' }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#635bff', marginRight: 6 }} />AI 분석 — 하자구분 및 귀책판단
        </div>
        <button onClick={runAnalysis} disabled={loading} style={{ padding: '5px 12px', borderRadius: 7, fontSize: '0.7rem', border: '1px solid #e3e8ef', background: '#f8fafc', color: '#425466', cursor: loading ? 'wait' : 'pointer' }}>
          <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} style={{ marginRight: 5 }} />{loading ? '분석 중...' : 'AI 재분석'}
        </button>
      </div>

      {!result && !loading && <div style={{ fontSize: '0.78rem', color: '#aab', padding: '20px 0', textAlign: 'center' }}>제목 또는 상세설명을 입력하면 자동으로 분석합니다.</div>}
      {loading && !result && <div style={{ fontSize: '0.78rem', color: '#697386', padding: '20px 0', textAlign: 'center' }}>AI가 기준자료와 과거 사례를 검토하고 있습니다...</div>}

      {result && (
        <div>
          {result.fallback && (
            <div style={{ padding: '6px 10px', background: '#fef3e2', color: '#b06b1a', borderRadius: 7, fontSize: '0.7rem', marginBottom: 12 }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 5 }} />AI 분석에 실패해 규칙 기반 추정치입니다.
            </div>
          )}

          <ProbBar label="시공사 하자 가능성" pct={result.constructionPct} color="#635bff" />
          <ProbBar label="사용상 하자 가능성" pct={result.usagePct} color="#d97706" />
          <ProbBar label="제조사 보증 대상 가능성" pct={result.warrantyPct} color="#059669" />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
            <span style={{ color: confidenceColor(result.confidencePct) }}>
              {'★'.repeat(Math.round(result.confidencePct / 20))}{'☆'.repeat(5 - Math.round(result.confidencePct / 20))}
            </span>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: confidenceColor(result.confidencePct) }}>
              신뢰도 {result.confidenceLabel} ({result.confidencePct}%)
            </span>
          </div>

          <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 9, fontSize: '0.76rem', color: '#425466', lineHeight: 1.6, marginBottom: 10 }}>
            {result.reasoning}
          </div>

          {result.citedDocs.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {result.citedDocs.map((d, i) => (
                <span key={i} style={{ fontSize: '0.68rem', padding: '3px 9px', background: 'rgba(99,91,255,.08)', color: '#635bff', borderRadius: 99 }}>
                  {d.vendor} · {d.title} v{d.version}
                </span>
              ))}
            </div>
          )}

          {result.adminChecklist.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#B06B1A', marginBottom: 4 }}>관리자 확인사항</div>
              {result.adminChecklist.map((c, i) => <div key={i} style={{ fontSize: '0.74rem', color: '#425466', lineHeight: 1.6 }}>· {c}</div>)}
            </div>
          )}

          <div style={{ fontSize: '0.74rem', color: '#0a2540', marginBottom: 14 }}>
            <strong>추천 조치:</strong> {result.recommendedAction}
          </div>

          <button
            onClick={() => onApply(mapPctToDefectType(result), result)}
            style={{ width: '100%', padding: '9px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, border: 'none', background: '#635bff', color: '#fff', cursor: 'pointer' }}
          >
            AI 추천 적용
          </button>
        </div>
      )}
    </div>
  )
}
