'use client'

import { useEffect } from 'react'

export interface ToastMessage {
  type: 'success' | 'error'
  text: string
}

export function ReportToast({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [toast, onClose])

  if (!toast) return null

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 100,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '11px 16px', borderRadius: 10,
        background: toast.type === 'success' ? '#0F7850' : '#be1044',
        color: '#fff', fontSize: '0.78rem', fontWeight: 600,
        boxShadow: '0 8px 28px rgba(10,37,64,.18)',
        maxWidth: 360,
      }}
    >
      <i className={`fa-solid ${toast.type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
      <span>{toast.text}</span>
    </div>
  )
}
