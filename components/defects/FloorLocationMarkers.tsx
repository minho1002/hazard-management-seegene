'use client'

import { useEffect, useRef } from 'react'
import { SEVERITY_META, COLORS, type SeverityKey } from '@/lib/designTokens'

export interface FloorMarkerData {
  id: number
  x: number
  y: number
  label?: string | null
  status?: string | null
  severity?: string | null
}

interface Props {
  markers: FloorMarkerData[]
  onMove: (id: number, x: number, y: number) => void
  onSelect?: (id: number) => void
  selectedId?: number | null
  containerRef: React.RefObject<HTMLDivElement | null>
}

/**
 * 도면 컨테이너(부모가 이미 클릭 좌표 계산 + onClick으로 마커 추가를 처리하는 div) 내부에
 * 오버레이로 마운트되는 다중 마커 레이어. 마커 자체의 클릭/드래그는 stopPropagation으로
 * 부모의 "새 마커 추가" 클릭 핸들러가 겹쳐 실행되지 않게 막는다.
 */
export default function FloorLocationMarkers({ markers, onMove, onSelect, selectedId, containerRef }: Props) {
  const draggingId = useRef<number | null>(null)

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      if (draggingId.current == null || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10))
      const y = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10))
      onMove(draggingId.current, x, y)
    }
    function handleUp() {
      draggingId.current = null
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [containerRef, onMove])

  return (
    <>
      {markers.map((m, i) => {
        const color = SEVERITY_META[(m.severity as SeverityKey) ?? 'high']?.color ?? COLORS.danger
        const isSelected = m.id === selectedId
        return (
          <div
            key={m.id}
            title={[m.label, m.status].filter(Boolean).join(' · ') || `위치 ${i + 1}`}
            onMouseDown={e => { e.stopPropagation(); draggingId.current = m.id }}
            onClick={e => { e.stopPropagation(); onSelect?.(m.id) }}
            style={{
              position: 'absolute', left: `${m.x}%`, top: `${m.y}%`, transform: 'translate(-50%,-50%)',
              zIndex: isSelected ? 20 : 10, cursor: 'grab',
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              border: isSelected ? '3px solid #2563EB' : '2.5px solid #fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,.3)', background: color, color: '#fff', fontSize: 11, fontWeight: 700,
            }}>
              {i + 1}
            </div>
          </div>
        )
      })}
    </>
  )
}
