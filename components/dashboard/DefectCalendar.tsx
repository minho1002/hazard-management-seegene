'use client'

import { useMemo, useState } from 'react'
import type { Defect } from '@/lib/store'
import { isOverdue, OVERDUE_DAYS_BY_SEVERITY, type SeverityKey } from '@/lib/designTokens'

export type CalendarEventType = 'occurred' | 'vendorVisit' | 'paymentDone' | 'overdue'

const EVENT_META: Record<CalendarEventType, { icon: string; color: string; bg: string; label: string; priority: number }> = {
  overdue:     { icon: '⚠️', color: '#C2410C', bg: '#FFEDD5', label: '조치 지연일',     priority: 0 },
  occurred:    { icon: '🔴', color: '#B91C1C', bg: '#FEE2E2', label: '하자 발생일',     priority: 1 },
  vendorVisit: { icon: '🏢', color: '#1D4ED8', bg: '#DBEAFE', label: '업체 방문 예정일', priority: 2 },
  paymentDone: { icon: '💰', color: '#15803D', bg: '#DCFCE7', label: '결제 완료일',     priority: 3 },
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

// 셀 안에는 최대 2건까지 칩으로 보여주고, 나머지는 "+N건"으로 요약한다 (최대 2~3줄).
const MAX_VISIBLE_EVENTS = 2

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
    Object.values(map).forEach(events => events.sort((a, b) => EVENT_META[a.type].priority - EVENT_META[b.type].priority))
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
        {['일', '월', '화', '수', '목', '금', '토'].map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: '0.62rem', color: '#b0bac6', fontWeight: 700, padding: '2px 0' }}>{w}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} style={{ minHeight: 86 }} />
          const dayEvents = eventsByDate[dateStr] ?? []
          const visible = dayEvents.slice(0, MAX_VISIBLE_EVENTS)
          const extra = dayEvents.length - visible.length
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const dayNum = parseInt(dateStr.slice(8, 10), 10)
          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              style={{
                position: 'relative',
                minHeight: 86,
                border: isSelected ? '2px solid #4F46E5' : isToday ? '1.5px solid #A5B4FC' : '1px solid #eef0f4',
                background: isSelected ? 'rgba(79,70,229,.12)' : isToday ? 'rgba(99,102,241,.06)' : '#fff',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                textAlign: 'left',
                padding: '8px 10px',
                boxSizing: 'border-box',
                overflow: 'hidden',
                fontFamily: 'inherit',
              }}
            >
              <span
                style={{
                  fontSize: '0.92rem',
                  lineHeight: 1,
                  fontWeight: isSelected || isToday ? 700 : 600,
                  color: isSelected ? '#3730A3' : isToday ? '#4F46E5' : '#334155',
                  marginBottom: 5,
                }}
              >
                {dayNum}
              </span>
              {dayEvents.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  {visible.map((e, idx) => (
                    <span
                      key={idx}
                      title={`${EVENT_META[e.type].label} · ${e.defect.title}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 600,
                        padding: '1px 5px', borderRadius: 4, background: EVENT_META[e.type].bg, color: EVENT_META[e.type].color,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>{EVENT_META[e.type].icon}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.defect.title}</span>
                    </span>
                  ))}
                  {extra > 0 && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#697386', padding: '0 5px' }}>
                      +{extra}건
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid #f0f4f8' }}>
        {(Object.keys(EVENT_META) as CalendarEventType[]).map(t => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', color: '#697386' }}>
            <span>{EVENT_META[t].icon}</span>
            {EVENT_META[t].label}
          </span>
        ))}
      </div>

      {selectedDate && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f4f8' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0a2540' }}>{selectedDate} 일정 ({selectedEvents.length}건)</div>
            <a
              href={`/defects/new?date=${selectedDate}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.66rem', fontWeight: 700, color: '#fff', background: '#4F46E5', padding: '3px 9px', borderRadius: 6, textDecoration: 'none', flexShrink: 0 }}
            >
              <i className="fa-solid fa-plus" /> 이 날짜로 하자 등록
            </a>
          </div>
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
