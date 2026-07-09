'use client'

import { useEffect, useRef, useState } from 'react'

export interface CategoryTab {
  key: string
  label: string
  icon: string | null // FontAwesome 클래스(예: 'fa-droplet'). null이면 점(dot)으로 대체.
  count: number
}

interface Props {
  tabs: CategoryTab[]
  activeKey: string
  onSelect: (key: string) => void
}

const ARROW_BTN_STYLE: React.CSSProperties = {
  flexShrink: 0, width: 24, height: 24, borderRadius: 6, border: '1px solid #e3e8ef', background: '#fff',
  color: '#697386', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem',
}

function fadeStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: 0, bottom: 0, [side]: 0, width: 24,
    background: side === 'left' ? 'linear-gradient(90deg,#fff,rgba(255,255,255,0))' : 'linear-gradient(270deg,#fff,rgba(255,255,255,0))',
    pointerEvents: 'none', zIndex: 2,
  }
}

// 대시보드 상단 카테고리 탭 — 실데이터 기준으로 동적 생성된 탭 목록을 가로 스크롤 pill 형태로 표시한다.
// 탭이 화면 폭을 넘으면 줄바꿈 대신 스크롤(휠/트랙패드/터치 스와이프 전부 네이티브로 동작)되고,
// 좌우에 더 볼 탭이 있으면 fade 힌트 + 화살표 버튼을 보여준다.
export default function CategoryTabBar({ tabs, activeKey, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  function updateScrollState() {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }

  useEffect(() => {
    updateScrollState()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
    }
  }, [tabs.length])

  function scrollByAmount(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' })
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
      {canScrollLeft && (
        <button onClick={() => scrollByAmount(-1)} style={ARROW_BTN_STYLE} aria-label="이전 카테고리">
          <i className="fa-solid fa-chevron-left" />
        </button>
      )}

      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        {canScrollLeft && <div style={fadeStyle('left')} />}
        <div
          ref={scrollRef}
          className="dash-cat-tabs-scroll"
          style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}
        >
          {tabs.map(t => {
            const active = t.key === activeKey
            return (
              <button
                key={t.key}
                onClick={() => onSelect(t.key)}
                style={{
                  flexShrink: 0, padding: '7px 14px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                  border: active ? '1.5px solid #4F46E5' : '1.5px solid #e3e8ef',
                  background: active ? '#4F46E5' : '#fff', color: active ? '#fff' : '#425466',
                  display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontFamily: 'inherit',
                }}
              >
                {t.icon ? (
                  <i className={`fa-solid ${t.icon}`} style={{ fontSize: '0.72rem' }} />
                ) : t.key !== '__all__' ? (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? '#fff' : '#b0bac6', display: 'inline-block' }} />
                ) : null}
                {t.label}
                <span
                  style={{
                    fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999, fontWeight: 700,
                    background: active ? 'rgba(255,255,255,.25)' : '#f3f5f7', color: active ? '#fff' : '#697386',
                  }}
                >
                  {t.count}
                </span>
              </button>
            )
          })}
        </div>
        {canScrollRight && <div style={fadeStyle('right')} />}
      </div>

      {canScrollRight && (
        <button onClick={() => scrollByAmount(1)} style={ARROW_BTN_STYLE} aria-label="다음 카테고리">
          <i className="fa-solid fa-chevron-right" />
        </button>
      )}

      <style>{`
        .dash-cat-tabs-scroll { scrollbar-width: thin; }
        .dash-cat-tabs-scroll::-webkit-scrollbar { height: 4px; }
        .dash-cat-tabs-scroll::-webkit-scrollbar-thumb { background: #d8dce3; border-radius: 999px; }
        .dash-cat-tabs-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  )
}
