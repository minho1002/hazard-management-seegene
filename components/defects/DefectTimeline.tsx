'use client'

import { useState } from 'react'
import type { DefectLog } from '@/lib/types'
import { formatDateTime, formatKRW, LOG_TYPE_COLORS, LOG_TYPE_LABELS } from '@/lib/format'

interface Props {
  logs: DefectLog[]
  defectId: number
  onLogAdded?: () => void
}

const LOG_ICONS: Record<string, string> = {
  occurrence: '🔴', inspection: '🔵', action: '🟢', recurrence: '🟡',
}

export default function DefectTimeline({ logs, defectId, onLogAdded }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    logType: 'action',
    title: '',
    content: '',
    costAmount: '',
    occurredAt: new Date().toISOString().slice(0, 16),
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/defects/${defectId}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        costAmount: form.costAmount ? parseInt(form.costAmount) : null,
        occurredAt: new Date(form.occurredAt).toISOString(),
      }),
    })
    setSaving(false)
    setShowForm(false)
    setForm({ logType: 'action', title: '', content: '', costAmount: '', occurredAt: new Date().toISOString().slice(0, 16) })
    onLogAdded?.()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">처리 이력</h3>
        <button
          onClick={() => setShowForm(v => !v)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {showForm ? '취소' : '+ 이력 추가'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">유형</label>
              <select
                value={form.logType}
                onChange={e => setForm(f => ({ ...f, logType: e.target.value }))}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="occurrence">발생</option>
                <option value="inspection">점검</option>
                <option value="action">조치</option>
                <option value="recurrence">재발</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">발생일시</label>
              <input
                type="datetime-local"
                value={form.occurredAt}
                onChange={e => setForm(f => ({ ...f, occurredAt: e.target.value }))}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">제목 *</label>
            <input
              required
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full border rounded px-2 py-1.5 text-sm"
              placeholder="예: 방수공사 완료"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">내용</label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              className="w-full border rounded px-2 py-1.5 text-sm"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">비용 (원)</label>
            <input
              type="number"
              value={form.costAmount}
              onChange={e => setForm(f => ({ ...f, costAmount: e.target.value }))}
              className="w-full border rounded px-2 py-1.5 text-sm"
              placeholder="0"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-indigo-600 text-white rounded py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '이력 저장'}
          </button>
        </form>
      )}

      {logs.length === 0 ? (
        <p className="text-gray-400 text-sm py-4 text-center">이력이 없습니다.</p>
      ) : (
        <ol className="relative border-l border-gray-200 space-y-0">
          {[...logs].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).map((log, i) => (
            <li key={log.id} className="ml-4 pb-6">
              {/* dot */}
              <span
                className={`absolute -left-2 mt-1.5 w-4 h-4 rounded-full border-2 border-white ${LOG_TYPE_COLORS[log.logType as keyof typeof LOG_TYPE_COLORS]}`}
              />
              <div className="bg-white rounded-lg border border-gray-100 px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{formatDateTime(log.occurredAt)}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${LOG_TYPE_COLORS[log.logType as keyof typeof LOG_TYPE_COLORS]} text-white`}>
                    {LOG_ICONS[log.logType]} {LOG_TYPE_LABELS[log.logType as keyof typeof LOG_TYPE_LABELS]}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900">{log.title}</p>
                {log.content && <p className="text-xs text-gray-500 mt-1">{log.content}</p>}
                {log.costAmount != null && log.costAmount > 0 && (
                  <p className="text-xs text-emerald-700 font-medium mt-1">비용: {formatKRW(log.costAmount)}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
