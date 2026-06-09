'use client'

import ChatPanel from '@/components/ai/ChatPanel'

export default function AIPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Page Header */}
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>AI 어시스턴트</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>하자 데이터 기반 실시간 분석</div>
      </div>
      <div style={{ padding: '24px 32px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ChatPanel />
        </div>
      </div>
    </div>
  )
}
