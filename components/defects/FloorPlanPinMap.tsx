'use client'

import { useRef } from 'react'
import type { Defect } from '@/lib/types'

interface Props {
  imagePath: string | null
  defects?: Defect[]
  selectedId?: number
  onPinClick?: (defect: Defect) => void
  // Edit mode: clicking on the map sets coordinates
  editMode?: boolean
  pinX?: number | null
  pinY?: number | null
  onCoordSelect?: (x: number, y: number) => void
}

export default function FloorPlanPinMap({
  imagePath, defects = [], selectedId, onPinClick,
  editMode = false, pinX, pinY, onCoordSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!editMode || !onCoordSelect) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    onCoordSelect(Math.round(x * 10) / 10, Math.round(y * 10) / 10)
  }

  const severityColor: Record<string, string> = {
    low: '#6b7280', medium: '#f59e0b', high: '#f97316', critical: '#ef4444',
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-slate-50 rounded-lg overflow-hidden border border-gray-200 select-none
        ${editMode ? 'cursor-crosshair' : ''}`}
      style={{ aspectRatio: '4/3' }}
      onClick={handleClick}
    >
      {imagePath ? (
        <img
          src={imagePath}
          alt="floor plan"
          className="w-full h-full object-contain pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
          도면 이미지 없음
        </div>
      )}

      {/* Existing defect pins */}
      {defects.map(d => {
        if (d.locationX == null || d.locationY == null) return null
        const isSelected = d.id === selectedId
        return (
          <div
            key={d.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${d.locationX}%`, top: `${d.locationY}%` }}
            onClick={e => { e.stopPropagation(); onPinClick?.(d) }}
          >
            <div
              className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-white text-xs shadow-lg cursor-pointer
                transition-transform hover:scale-125 ${isSelected ? 'scale-125 ring-2 ring-indigo-400' : ''}`}
              style={{ backgroundColor: d.categoryColor ?? severityColor[d.severity] ?? '#6366f1' }}
              title={`${d.caseNumber}: ${d.title}`}
            >
              {d.categoryIcon ? (
                <i className={`fa-solid ${d.categoryIcon}`} style={{ fontSize: 10 }} />
              ) : '●'}
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 pointer-events-none">
              <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
                {d.caseNumber}: {d.title}
              </div>
            </div>
          </div>
        )
      })}

      {/* Edit-mode preview pin */}
      {editMode && pinX != null && pinY != null && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${pinX}%`, top: `${pinY}%` }}
        >
          <div className="w-7 h-7 rounded-full bg-indigo-500 border-2 border-white shadow-lg flex items-center justify-center">
            <span className="text-white text-xs">📍</span>
          </div>
        </div>
      )}

      {editMode && (
        <div className="absolute bottom-2 left-2 bg-indigo-600 text-white text-xs px-2 py-1 rounded">
          도면을 클릭하여 위치를 선택하세요
        </div>
      )}
    </div>
  )
}
