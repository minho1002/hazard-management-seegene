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

// AI 하자 기준자료 관리(app/admin/ai-reference-docs)에 등록된, 현재 "적용중"(isActive) 자료 하나.
// 필드는 db/pg/schema.ts referenceDocuments의 부분집합 — 이 패널에서 선택 목록/이력 저장에 필요한 것만.
export interface AppliedReferenceDoc {
  id: number
  vendor: string
  title: string
  trade: string | null
  version: number
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

function docLabel(d: AppliedReferenceDoc): string {
  return `${d.vendor} / ${d.title} / ${d.trade ?? '공종 미지정'} / v${d.version}`
}

// 하자 제목·상세설명·공종과 기준자료(업체명/자료명/공종)를 간단히 겹치는 키워드 수로 채점한다.
// 새로운 AI 호출을 만들지 않고 이미 불러온 기준자료 목록만으로 "추천"을 계산하기 위한 가벼운 휴리스틱.
function scoreDoc(doc: AppliedReferenceDoc, input: AiClassificationInput): number {
  let score = 0
  const cat = input.category?.trim()
  if (cat && doc.trade && (doc.trade.includes(cat) || cat.includes(doc.trade))) score += 40
  const text = `${input.title} ${input.description}`.toLowerCase()
  const words = Array.from(new Set(text.split(/\s+/).filter(w => w.length >= 2)))
  const docText = `${doc.vendor} ${doc.title} ${doc.trade ?? ''}`.toLowerCase()
  const hits = words.filter(w => docText.includes(w)).length
  score += Math.min(60, hits * 15)
  return Math.min(100, score)
}

export default function AiClassificationPanel({
  input, onApply, autoRun = true,
}: {
  input: AiClassificationInput
  onApply: (mapped: { defectType: string; responsibilityType: string; costBearer: string }, result: AiClassificationResult, usedReferenceDocs: AppliedReferenceDoc[]) => void
  autoRun?: boolean
}) {
  const [result, setResult] = useState<AiClassificationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [docs, setDocs] = useState<AppliedReferenceDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([])
  // 실제로 분석에 사용된(요청 시점에 스냅샷된) 기준자료 id — 체크박스 상태(selectedDocIds)와는 별개로,
  // "이 결과가 어떤 자료를 근거로 했는지"를 결과 화면에 정확히 표시하기 위함.
  const [lastRunDocIds, setLastRunDocIds] = useState<number[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/reference-docs?activeOnly=true')
      .then(res => res.json())
      .then((rows: { id: number; vendor: string; title: string; trade: string | null; version: number }[]) => {
        if (cancelled) return
        setDocs(rows.map(r => ({ id: r.id, vendor: r.vendor, title: r.title, trade: r.trade, version: r.version })))
      })
      .catch(err => console.error('기준자료 목록 로드 실패:', err))
      .finally(() => { if (!cancelled) setDocsLoading(false) })
    return () => { cancelled = true }
  }, [])

  function toggleDoc(id: number) {
    setSelectedDocIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  async function runAnalysis(manual: boolean) {
    if (!input.title.trim() && !input.description.trim()) return
    if (manual && selectedDocIds.length === 0) {
      const proceed = confirm('적용할 기준자료가 선택되지 않았습니다.\n기준자료 없이 일반 분석을 진행하시겠습니까?')
      if (!proceed) return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/ai/classify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, referenceDocIds: selectedDocIds }),
      })
      if (res.ok) {
        setResult(await res.json())
        setLastRunDocIds(selectedDocIds)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!autoRun) return
    const t = setTimeout(() => { if (input.title.trim().length >= 2 || input.description.trim().length >= 5) runAnalysis(false) }, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.title, input.description])

  const recommendedDocs = docs
    .map(d => ({ doc: d, score: scoreDoc(d, input) }))
    .filter(x => x.score >= 30)
    .sort((a, b) => b.score - a.score)
  const recommendedIds = new Set(recommendedDocs.map(x => x.doc.id))
  const sortedDocs = [
    ...recommendedDocs.map(x => x.doc),
    ...docs.filter(d => !recommendedIds.has(d.id)),
  ]
  const usedDocsForResult = lastRunDocIds !== null ? docs.filter(d => lastRunDocIds.includes(d.id)) : []
  const noReferenceDocsUsed = lastRunDocIds !== null && lastRunDocIds.length === 0

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e3e8ef', padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0a2540' }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#635bff', marginRight: 6 }} />AI 분석 — 하자구분 및 귀책판단
        </div>
        <button onClick={() => runAnalysis(true)} disabled={loading} style={{ padding: '5px 12px', borderRadius: 7, fontSize: '0.7rem', border: '1px solid #e3e8ef', background: '#f8fafc', color: '#425466', cursor: loading ? 'wait' : 'pointer' }}>
          <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} style={{ marginRight: 5 }} />{loading ? '분석 중...' : 'AI 재분석'}
        </button>
      </div>

      {/* 적용 기준자료 선택 — AI 하자 기준자료 관리에 등록되어 "적용중"인 자료만 표시. 여기서 체크한
          자료만 AI 분석의 근거로 전달되며, 체크하지 않은 자료는 프롬프트에 절대 포함되지 않는다. */}
      <div style={{ border: '1px solid #eef1f5', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#425466', marginBottom: 6 }}>
          적용 기준자료 {selectedDocIds.length > 0 && <span style={{ color: '#635bff' }}>({selectedDocIds.length}개 선택)</span>}
        </div>
        {docsLoading && <div style={{ fontSize: '0.72rem', color: '#aab' }}>기준자료를 불러오는 중...</div>}
        {!docsLoading && docs.length === 0 && (
          <div style={{ fontSize: '0.72rem', color: '#aab' }}>적용중인 기준자료가 없습니다. (관리자 &gt; AI 기준자료 관리에서 먼저 등록하세요)</div>
        )}
        {!docsLoading && docs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
            {sortedDocs.map(d => {
              const score = recommendedIds.has(d.id) ? (recommendedDocs.find(x => x.doc.id === d.id)?.score ?? 0) : 0
              return (
                <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.75rem', color: '#425466', cursor: 'pointer', padding: '3px 4px', borderRadius: 6 }}>
                  <input type="checkbox" checked={selectedDocIds.includes(d.id)} onChange={() => toggleDoc(d.id)} />
                  <span style={{ flex: 1, minWidth: 0 }}>{docLabel(d)}</span>
                  {score > 0 && (
                    <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#b06b1a', background: '#fef3e2', padding: '1px 7px', borderRadius: 99, whiteSpace: 'nowrap' as const }}>
                      ★ 추천 · 매칭률 {score}%
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        )}
      </div>

      {!result && !loading && <div style={{ fontSize: '0.78rem', color: '#aab', padding: '20px 0', textAlign: 'center' }}>제목 또는 상세설명을 입력하면 자동으로 분석합니다.</div>}
      {loading && !result && <div style={{ fontSize: '0.78rem', color: '#697386', padding: '20px 0', textAlign: 'center' }}>AI가 선택한 기준자료와 과거 사례를 검토하고 있습니다...</div>}

      {result && (
        <div>
          {noReferenceDocsUsed && (
            <div style={{ padding: '6px 10px', background: '#fef2f2', color: '#be1044', borderRadius: 7, fontSize: '0.7rem', fontWeight: 700, marginBottom: 12 }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 5 }} />기준자료 미적용 / 관리자 검토 필요 — 선택된 기준자료 없이 일반 분석한 결과입니다.
            </div>
          )}
          {result.fallback && (
            <div style={{ padding: '6px 10px', background: '#fef3e2', color: '#b06b1a', borderRadius: 7, fontSize: '0.7rem', marginBottom: 12 }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 5 }} />AI 분석에 실패해 규칙 기반 추정치입니다.
            </div>
          )}

          {usedDocsForResult.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#425466', marginBottom: 4 }}>적용 기준자료</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {usedDocsForResult.map(d => (
                  <div key={d.id} style={{ fontSize: '0.72rem', color: '#425466' }}>· {docLabel(d)}</div>
                ))}
              </div>
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
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#425466', marginBottom: 4 }}>매칭 항목</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {result.citedDocs.map((d, i) => (
                  <span key={i} style={{ fontSize: '0.68rem', padding: '3px 9px', background: 'rgba(99,91,255,.08)', color: '#635bff', borderRadius: 99 }}>
                    {d.vendor} · {d.title} v{d.version}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.adminChecklist.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#B06B1A', marginBottom: 4 }}>관리자 확인사항</div>
              {result.adminChecklist.map((c, i) => <div key={i} style={{ fontSize: '0.74rem', color: '#425466', lineHeight: 1.6 }}>· {c}</div>)}
            </div>
          )}

          <div style={{ fontSize: '0.74rem', color: '#0a2540', marginBottom: 8 }}>
            <strong>추천 조치:</strong> {result.recommendedAction}
          </div>

          <div style={{ fontSize: '0.72rem', color: noReferenceDocsUsed ? '#be1044' : '#697386', marginBottom: 14 }}>
            <strong>관리자 검토 필요:</strong> {noReferenceDocsUsed ? '예 (기준자료 미적용)' : '아니오'}
          </div>

          <button
            onClick={() => onApply(mapPctToDefectType(result), result, usedDocsForResult)}
            style={{ width: '100%', padding: '9px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, border: 'none', background: '#635bff', color: '#fff', cursor: 'pointer' }}
          >
            AI 추천 적용
          </button>
        </div>
      )}
    </div>
  )
}
