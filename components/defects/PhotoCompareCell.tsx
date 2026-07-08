'use client'

import { useState } from 'react'
import type { DefectFile } from '@/lib/store'

interface Props {
  before?: DefectFile
  after?: DefectFile
}

// 목록 화면의 "사진대지 전/후" 컬럼 — hover 시 미니 미리보기, click 시 큰 비교 팝업.
// 사진이 전혀 없으면 null(아이콘 자체 숨김), 조치전만 있으면 "후사진 필요" 배지.
export default function PhotoCompareCell({ before, after }: Props) {
  const [hover, setHover] = useState(false)
  const [open, setOpen] = useState(false)

  if (!before && !after) return null

  if (before && !after) {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', fontWeight: 700,
          color: '#F97316', background: '#FFF7ED', padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap',
        }}
      >
        <i className="fa-solid fa-camera" style={{ fontSize: 9 }} /> 후사진 필요
      </span>
    )
  }

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        title="조치 전/후 사진 비교"
        style={{
          width: 26, height: 26, borderRadius: 6, border: '1px solid #e3e8ef', background: '#f5f7fa',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#635bff',
        }}
      >
        <i className="fa-solid fa-images" style={{ fontSize: '0.72rem' }} />
      </button>

      {hover && !open && (
        <div
          style={{
            position: 'absolute', zIndex: 200, top: '120%', left: 0, background: '#fff', border: '1px solid #e3e8ef',
            borderRadius: 8, boxShadow: '0 6px 20px rgba(10,37,64,.15)', padding: 6, display: 'flex', gap: 4,
          }}
        >
          {before && (
            <div style={{ textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={before.dataUrl} alt="조치전" style={{ width: 90, height: 70, objectFit: 'cover', borderRadius: 5, display: 'block' }} />
              <div style={{ fontSize: '0.58rem', color: '#697386', marginTop: 2 }}>조치전</div>
            </div>
          )}
          {after && (
            <div style={{ textAlign: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={after.dataUrl} alt="조치후" style={{ width: 90, height: 70, objectFit: 'cover', borderRadius: 5, display: 'block' }} />
              <div style={{ fontSize: '0.58rem', color: '#697386', marginTop: 2 }}>조치후</div>
            </div>
          )}
        </div>
      )}

      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,37,64,.5)', zIndex: 1000, display: 'flex',
            alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)',
          }}
          onClick={e => { e.stopPropagation(); setOpen(false) }}
        >
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0a2540', marginBottom: 12 }}>조치 전/후 비교</div>
            <div style={{ display: 'flex', gap: 16 }}>
              {before && (
                <div style={{ textAlign: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={before.dataUrl} alt="조치전" style={{ maxWidth: '40vw', maxHeight: '60vh', borderRadius: 8, display: 'block' }} />
                  <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 6, fontWeight: 600 }}>조치전</div>
                </div>
              )}
              {after && (
                <div style={{ textAlign: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={after.dataUrl} alt="조치후" style={{ maxWidth: '40vw', maxHeight: '60vh', borderRadius: 8, display: 'block' }} />
                  <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 6, fontWeight: 600 }}>조치후</div>
                </div>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ marginTop: 14, padding: '6px 14px', borderRadius: 7, border: '1px solid #e3e8ef', background: '#f5f7fa', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit' }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
