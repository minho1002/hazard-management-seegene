'use client'

import { useState, useRef, useEffect } from 'react'
import { useStore, type AppState } from '@/lib/store'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SEV_LABELS: Record<string, string> = { low: '낮음', medium: '보통', high: '높음', critical: '긴급' }
const STAT_LABELS: Record<string, string> = { open: '접수', in_progress: '처리중', completed: '완료' }

function fmtKRW(n: number | null | undefined) {
  if (!n) return '0원'
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}

function generateAIResponse(q: string, state: AppState): string {
  const defects = state.defects
  const total = defects.length
  const open = defects.filter(d => d.status === 'open').length
  const inProg = defects.filter(d => d.status === 'in_progress').length
  const done = defects.filter(d => d.status === 'completed').length
  const ql = q.toLowerCase()

  if (ql.includes('요약') || ql.includes('현황') || ql.includes('진행')) {
    const prog = defects.filter(d => d.status === 'in_progress')
    return `📊 하자 현황 요약\n\n전체 ${total}건:\n• 접수: ${open}건\n• 처리중: ${inProg}건\n• 완료: ${done}건\n\n처리중 하자:\n` + prog.map(d => `• [${d.caseNumber}] ${d.title}`).join('\n')
  }
  if (ql.includes('심각') || ql.includes('긴급')) {
    const crit = defects.filter(d => d.severity === 'critical' || d.severity === 'high')
    return `⚠️ 심각도 높은 하자 ${crit.length}건:\n` + crit.map(d => `• [${d.caseNumber}] ${d.title} — ${SEV_LABELS[d.severity]} / ${STAT_LABELS[d.status]}`).join('\n')
  }
  if (ql.includes('누수')) {
    const leaks = defects.filter(d => d.categoryId === 1)
    return `💧 누수 관련 ${leaks.length}건\n누적비용: ${fmtKRW(leaks.reduce((s, d) => s + (d.totalCost || 0), 0))}\n` + leaks.map(d => `• [${d.caseNumber}] ${d.title} (${STAT_LABELS[d.status]}, 재발 ${d.recurrenceCount}회)`).join('\n')
  }
  if (ql.includes('비용')) {
    const sorted = [...defects].sort((a, b) => (b.totalCost || 0) - (a.totalCost || 0))
    return `💰 비용 상위 하자:\n` + sorted.slice(0, 3).map((d, i) => `${i + 1}. [${d.caseNumber}] ${d.title} — ${fmtKRW(d.totalCost)}`).join('\n')
  }
  if (ql.includes('재발')) {
    const rec = defects.filter(d => d.recurrenceCount > 0).sort((a, b) => b.recurrenceCount - a.recurrenceCount)
    if (!rec.length) return '재발 이력이 있는 하자가 없습니다.'
    return `🔄 재발 이력 하자 ${rec.length}건:\n` + rec.map(d => `• [${d.caseNumber}] ${d.title} — 재발 ${d.recurrenceCount}회`).join('\n')
  }
  if (ql.includes('완료')) {
    const comp = defects.filter(d => d.status === 'completed')
    return `✅ 완료 처리 ${comp.length}건:\n` + comp.map(d => `• [${d.caseNumber}] ${d.title} (${fmtKRW(d.totalCost)})`).join('\n')
  }
  return `현재 현황:\n• 전체 ${total}건 / 접수 ${open}건 / 처리중 ${inProg}건 / 완료 ${done}건\n\n질문 예시:\n• 진행중인 하자 요약해줘\n• 누수 현황 알려줘\n• 비용이 많이 든 하자는?\n• 재발 이력 있는 하자는?`
}

const QUICK_CHIPS = [
  '현재 진행중인 하자를 요약해줘',
  '심각도가 높은 하자는?',
  '누수 관련 하자 현황 알려줘',
  '가장 비용이 많이 든 하자는?',
  '재발 이력이 있는 하자는?',
]

export default function ChatPanel() {
  const { state } = useStore()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '안녕하세요! 하자관리 AI 어시스턴트입니다.\n등록된 하자 데이터를 기반으로 질문에 답변드립니다.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function send(text?: string) {
    const q = (text ?? input).trim()
    if (!q) return
    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content: q }]
    setMessages(newMessages)
    setLoading(true)
    setTimeout(() => {
      const answer = generateAIResponse(q, state)
      setMessages(m => [...m, { role: 'assistant', content: answer }])
      setLoading(false)
    }, 500 + Math.random() * 700)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 0px)', background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }}>
      {/* AI Top */}
      <div style={{ padding: '13px 18px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 34, height: 34, background: '#635bff', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1rem', flexShrink: 0 }}>
          <i className="fa-solid fa-robot" />
        </div>
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0a2540' }}>하자관리 AI</div>
          <div style={{ fontSize: '0.67rem', color: '#697386', marginTop: 1 }}>실시간 데이터 연동 · 데모 모드</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.67rem', color: '#697386' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,.15)' }} />
          온라인
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 11 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', maxWidth: '80%', justifyContent: m.role === 'user' ? 'flex-end' : undefined, alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ padding: '10px 13px', borderRadius: 12, fontSize: '0.82rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: m.role === 'user' ? '#635bff' : '#f5f7fa', color: m.role === 'user' ? '#fff' : '#0a2540', border: m.role === 'assistant' ? '1px solid #e3e8ef' : 'none', borderBottomRightRadius: m.role === 'user' ? 3 : undefined, borderBottomLeftRadius: m.role === 'assistant' ? 3 : undefined }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', maxWidth: '80%', alignSelf: 'flex-start' }}>
            <div style={{ padding: '10px 13px', borderRadius: 12, fontSize: '0.82rem', background: '#f5f7fa', color: '#697386', border: '1px solid #e3e8ef', borderBottomLeftRadius: 3 }}>
              답변 생성 중...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick Chips */}
      <div style={{ padding: '8px 14px', display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid #f0f4f8', background: '#fafbfc' }}>
        {QUICK_CHIPS.map(q => (
          <button
            key={q}
            onClick={() => send(q)}
            disabled={loading}
            style={{ fontSize: '0.7rem', background: '#fff', color: '#425466', border: '1px solid #e3e8ef', borderRadius: 999, padding: '4px 11px', cursor: loading ? 'not-allowed' : 'pointer', transition: 'all .12s', fontFamily: 'inherit', opacity: loading ? 0.5 : 1 }}
            onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,91,255,.09)'; (e.currentTarget as HTMLButtonElement).style.color = '#635bff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#635bff' } }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; (e.currentTarget as HTMLButtonElement).style.color = '#425466'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#e3e8ef' }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div style={{ padding: '11px 14px', borderTop: '1px solid #e3e8ef', display: 'flex', gap: 9 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="하자 현황에 대해 질문하세요..."
          disabled={loading}
          style={{ flex: 1, border: '1.5px solid #e3e8ef', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', background: '#f5f7fa', color: '#0a2540' }}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          style={{ background: loading || !input.trim() ? 'rgba(99,91,255,0.4)' : '#635bff', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 17px', fontSize: '0.8rem', fontWeight: 600, cursor: loading || !input.trim() ? 'default' : 'pointer', transition: 'background .14s', fontFamily: 'inherit' }}
        >
          전송
        </button>
      </div>
    </div>
  )
}
