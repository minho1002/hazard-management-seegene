'use client'

import { useMemo, useState } from 'react'
import type { Defect } from '@/lib/store'
import { isOverdue, OVERDUE_DAYS_BY_SEVERITY, type SeverityKey } from '@/lib/designTokens'

export type CalendarEventType = 'occurred' | 'vendorVisit' | 'paymentDone' | 'overdue'

const EVENT_META: Record<CalendarEventType, { icon: string; color: string; label: string }> = {
  occurred: { icon: '🔴', color: '#DC2626', label: '하자 발생일' },
  vendorVisit: { icon: '🚚', color: '#2563EB', label: '업체 방문 예정일' },
  paymentDone: { icon: '💰', color: '#16A34A', label: '결제 완료일' },
  overdue: { icon: '⚠️', color: '#F97316', label: '조치 지연일' },
}

interface DayEvent { type: CalendarEventType; defect: Defect }

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function overdueSinceDate(d: Defect): string | null {
  if (!d.firstOccurredAt) return null
  const threshold = OVERDUE_DAYS_BY_SEVERITY[d.severity as SeverityKey] ?? OVERDUE_DAYS_BY_SEVERITY.medium
  const dt = new Date(d.firstOccurredAt)
  dt.setDate(dt.getDate() + threshold)
  return toDateStr(dt)
}

interface Props {
  defects: Defect[]
  selectedDate: string | null
  onSelectDate: (date: string | null) => void
}

export default function DefectCalendar({ defects, selectedDate, onSelectDate }: Props) {
  const [cursor, setCursor] = useState(() => new Date())

  const eventsByDate = useMemo(() => {
    const map: Record<string, DayEvent[]> = {}
    const push = (dateStr: string | null | undefined, type: CalendarEventType, defect: Defect) => {
      if (!dateStr) return
      const key = dateStr.slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push({ type, defect })
    }
    defects.forEach(d => {
      push(d.firstOccurredAt, 'occurred', d)
      push(d.vendorVisitDate, 'vendorVisit', d)
      push(d.paymentCompletedAt, 'paymentDone', d)
      if (isOverdue(d)) push(overdueSinceDate(d), 'overdue', d)
    })
    return map
  }, [defects])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = toDateStr(new Date())

  const cells: (string | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(toDateStr(new Date(year, month, day)))

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          style={{ width: 22, height: 22, border: '1px solid #e3e8ef', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#697386', fontSize: '0.7rem' }}
        ><i className="fa-solid fa-chevron-left" /></button>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540' }}>{year}년 {month + 1}월</span>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          style={{ width: 22, height: 22, border: '1px solid #e3e8ef', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#697386', fontSize: '0.7rem' }}
        ><i className="fa-solid fa-chevron-right" /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {['일', '월', '화', '수', '목', '금', '토'].map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: '0.62rem', color: '#b0bac6', fontWeight: 700, padding: '2px 0' }}>{w}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} />
          const dayEvents = eventsByDate[dateStr] ?? []
          const types = Array.from(new Set(dayEvents.map(e => e.type)))
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const dayNum = parseInt(dateStr.slice(8, 10), 10)
          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              style={{
                aspectRatio: '1 / 1', minHeight: 30, border: isSelected ? '1.5px solid #635bff' : isToday ? '1.5px solid #b0bac6' : '1px solid #f0f4f8',
                borderRadius: 6, background: isSelected ? 'rgba(99,91,255,.08)' : '#fff', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, padding: 2,
              }}
            >
              <span style={{ fontSize: '0.68rem', fontWeight: isToday ? 800 : 500, color: isToday ? '#635bff' : '#425466' }}>{dayNum}</span>
              {types.length > 0 && (
                <div style={{ display: 'flex', gap: 1 }}>
                  {types.slice(0, 4).map(t => (
                    <span key={t} style={{ width: 4, height: 4, borderRadius: '50%', background: EVENT_META[t].color, display: 'inline-block' }} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f4f8' }}>
        {(Object.keys(EVENT_META) as CalendarEventType[]).map(t => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', color: '#697386' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: EVENT_META[t].color, display: 'inline-block' }} />
            {EVENT_META[t].label}
          </span>
        ))}
      </div>

      {selectedDate && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f4f8' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0a2540', marginBottom: 6 }}>{selectedDate} 일정 ({selectedEvents.length}건)</div>
          {selectedEvents.length === 0 ? (
            <div style={{ fontSize: '0.72rem', color: '#b0bac6' }}>해당 날짜의 일정이 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
              {selectedEvents.map((e, i) => (
                <a
                  key={i}
                  href={`/defects/${e.defect.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#0a2540', textDecoration: 'none', padding: '4px 6px', borderRadius: 6, background: '#fafbfc' }}
                >
                  <span>{EVENT_META[e.type].icon}</span>
                  <span style={{ fontSize: '0.65rem', color: '#697386', flexShrink: 0 }}>{EVENT_META[e.type].label}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{e.defect.title}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
