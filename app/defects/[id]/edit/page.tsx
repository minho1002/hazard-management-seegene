'use client'

import { useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { FLOOR_SVGS } from '@/lib/floorSvgs'

const STATUS_OPTIONS = [
  { value: 'open', label: '접수' },
  { value: 'in_progress', label: '처리중' },
  { value: 'completed', label: '완료' },
]

export default function EditDefectPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { state, updateDefect, saveFloorImage } = useStore()
  const mapContainerRef = useRef<HTMLDivElement>(null)

  const defectRaw = state.defects.find(d => d.id === parseInt(id))

  const [form, setForm] = useState(() => ({
    title: defectRaw?.title ?? '',
    description: defectRaw?.description ?? '',
    buildingId: defectRaw?.buildingId ?? 1,
    floorPlanId: defectRaw?.floorPlanId ?? (state.floorPlans[0]?.id || 1),
    locationX: defectRaw?.locationX ?? null as number | null,
    locationY: defectRaw?.locationY ?? null as number | null,
    locationText: defectRaw?.locationText ?? '',
    categoryId: defectRaw?.categoryId ?? ('' as string | number),
    severity: defectRaw?.severity ?? 'medium',
    status: defectRaw?.status ?? 'open',
    costType: defectRaw?.costType ?? 'our',
    reporterName: defectRaw?.reporterName ?? '',
    assignedVendorId: defectRaw?.assignedVendorId ?? ('' as string | number),
    managerName: defectRaw?.managerName ?? '김관리',
    firstOccurredAt: defectRaw?.firstOccurredAt ?? new Date().toISOString().slice(0, 10),
  }))

  if (!defectRaw) {
    return (
      <div style={{ padding: 52, textAlign: 'center', color: '#697386' }}>
        <i className="fa-solid fa-inbox" style={{ fontSize: '1.8rem', display: 'block', marginBottom: 10 }} />
        <p>하자를 찾을 수 없습니다.</p>
        <button onClick={() => router.push('/defects')} style={{ marginTop: 16, padding: '8px 16px', background: '#635bff', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.8rem' }}>목록으로</button>
      </div>
    )
  }
  const defect = defectRaw

  const floorPlans = state.floorPlans.filter(f => f.buildingId === form.buildingId)

  function setField(k: string, v: string | number | null) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function onBuildingChange(bid: number) {
    const fps = state.floorPlans.filter(f => f.buildingId === bid)
    setForm(f => ({ ...f, buildingId: bid, floorPlanId: fps[0]?.id || 1, locationX: null, locationY: null }))
  }

  function onFloorChange(fid: number) {
    setForm(f => ({ ...f, floorPlanId: fid, locationX: null, locationY: null }))
  }

  function onMapClick(e: React.MouseEvent<HTMLDivElement>) {
    const cont = mapContainerRef.current
    if (!cont) return
    const r = cont.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10
    setForm(f => ({ ...f, locationX: x, locationY: y }))
  }

  function handleFloorImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('5MB 이하 이미지만 업로드 가능합니다.'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      if (ev.target?.result) saveFloorImage(form.floorPlanId, ev.target.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function submit() {
    if (!form.title.trim()) { alert('제목을 입력하세요.'); return }
    updateDefect(defect.id, {
      title: form.title,
      description: form.description || null,
      buildingId: form.buildingId,
      floorPlanId: form.floorPlanId || null,
      locationX: form.locationX,
      locationY: form.locationY,
      locationText: form.locationText || null,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      severity: form.severity,
      status: form.status,
      costType: form.costType,
      reporterName: form.reporterName || null,
      assignedVendorId: form.assignedVendorId ? Number(form.assignedVendorId) : null,
      managerName: form.managerName || '김관리',
      firstOccurredAt: form.firstOccurredAt || null,
    })
    router.push(`/defects/${defect.id}`)
  }

  const floorSvg = state.floorPlanImages[form.floorPlanId]
    ? `<img src="${state.floorPlanImages[form.floorPlanId]}" style="width:100%;height:auto;display:block">`
    : (FLOOR_SVGS[form.floorPlanId] || FLOOR_SVGS[1])

  const card = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 12, boxShadow: '0 1px 3px rgba(10,37,64,0.06)', overflow: 'hidden' as const, marginBottom: 14 }
  const inputCls: React.CSSProperties = { border: '1px solid #e3e8ef', borderRadius: 7, padding: '8px 12px', fontSize: '0.82rem', fontFamily: 'inherit', color: '#0a2540', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' as const }
  const selectCls: React.CSSProperties = { ...inputCls, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='5'%3E%3Cpath d='M0 0l4.5 5L9 0z' fill='%23697386'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28, cursor: 'pointer' }
  const labelCls: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 600, color: '#425466', marginBottom: 5, display: 'block' }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Page Header */}
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#697386', marginBottom: 6 }}>
          <Link href="/defects" style={{ color: '#697386', textDecoration: 'none' }}>하자 목록</Link>
          <i className="fa-solid fa-chevron-right" style={{ fontSize: '.55rem' }} />
          <Link href={`/defects/${defect.id}`} style={{ color: '#697386', textDecoration: 'none' }}>{defect.caseNumber}</Link>
          <i className="fa-solid fa-chevron-right" style={{ fontSize: '.55rem' }} />
          <span style={{ color: '#0a2540', fontWeight: 600 }}>수정</span>
        </div>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>하자 수정</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>{defect.caseNumber} — {defect.title}</div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, alignItems: 'start' }}>

          {/* Left: Form */}
          <div>
            {/* 기본 정보 */}
            <div style={card}>
              <div style={{ padding: '12px 18px', background: '#fafbfc', borderBottom: '1px solid #f0f4f8' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#425466' }}>기본 정보</div>
              </div>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelCls}>제목 *</label>
                    <input style={inputCls} placeholder="예: 3층 화장실 천장 누수" value={form.title} onChange={e => setField('title', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelCls}>설명</label>
                    <textarea style={{ ...inputCls, resize: 'vertical', lineHeight: 1.6 }} rows={2} placeholder="상세 내용..." value={form.description} onChange={e => setField('description', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>카테고리</label>
                    <select style={selectCls} value={form.categoryId} onChange={e => setField('categoryId', e.target.value)}>
                      <option value="">선택</option>
                      {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>심각도</label>
                    <select style={selectCls} value={form.severity} onChange={e => setField('severity', e.target.value)}>
                      <option value="low">낮음</option>
                      <option value="medium">보통</option>
                      <option value="high">높음</option>
                      <option value="critical">긴급</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>상태</label>
                    <select style={selectCls} value={form.status} onChange={e => setField('status', e.target.value)}>
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>비용유형</label>
                    <select style={selectCls} value={form.costType} onChange={e => setField('costType', e.target.value)}>
                      <option value="our">자체</option>
                      <option value="gukbo">국보</option>
                      <option value="claim">청구</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>발생일</label>
                    <input type="date" style={inputCls} value={form.firstOccurredAt ?? ''} onChange={e => setField('firstOccurredAt', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>신고자</label>
                    <input style={inputCls} placeholder="홍길동(시설팀)" value={form.reporterName ?? ''} onChange={e => setField('reporterName', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>담당자</label>
                    <input style={inputCls} value={form.managerName ?? ''} onChange={e => setField('managerName', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelCls}>협력업체</label>
                    <select style={selectCls} value={form.assignedVendorId ?? ''} onChange={e => setField('assignedVendorId', e.target.value)}>
                      <option value="">미지정</option>
                      {state.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 위치 선택 */}
            <div style={card}>
              <div style={{ padding: '12px 18px', background: '#fafbfc', borderBottom: '1px solid #f0f4f8' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#425466' }}>위치 선택</div>
              </div>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
                  <div>
                    <label style={labelCls}>건물</label>
                    <select style={selectCls} value={form.buildingId} onChange={e => onBuildingChange(Number(e.target.value))}>
                      {state.buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>층 / 도면</label>
                    <select style={selectCls} value={form.floorPlanId ?? ''} onChange={e => onFloorChange(Number(e.target.value))}>
                      {floorPlans.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelCls}>위치 설명</label>
                    <input style={inputCls} placeholder="예: 3층 남쪽 화장실 천장" value={form.locationText ?? ''} onChange={e => setField('locationText', e.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#635bff', fontWeight: 600, background: 'rgba(99,91,255,.09)', padding: '5px 10px', borderRadius: 6 }}>
                    <i className="fa-solid fa-crosshairs" /> 도면 클릭으로 위치 선택
                  </span>
                  <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: '#635bff', fontWeight: 600, padding: '4px 10px', border: '1.5px solid #635bff', borderRadius: 6 }}>
                    <i className="fa-solid fa-upload" /> 도면 이미지 업로드
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFloorImageUpload} />
                  </label>
                </div>

                <div
                  ref={mapContainerRef}
                  style={{ position: 'relative', cursor: 'crosshair', border: '1px solid #e3e8ef', borderRadius: 8 }}
                  onClick={onMapClick}
                >
                  <div dangerouslySetInnerHTML={{ __html: floorSvg }} />
                  {form.locationX != null && (
                    <div style={{ position: 'absolute', left: `${form.locationX}%`, top: `${form.locationY ?? 0}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2.5px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.25)', background: '#635bff', color: '#fff', fontSize: 11 }}>
                        <i className="fa-solid fa-location-dot" />
                      </div>
                    </div>
                  )}
                </div>

                {form.locationX != null && (
                  <div style={{ fontSize: '0.72rem', color: '#635bff', fontWeight: 600, marginTop: 8, minHeight: 18 }}>
                    선택 좌표: ({form.locationX}%, {form.locationY}%)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Sidebar */}
          <div style={{ position: 'sticky', top: 80 }}>
            <div style={{ background: 'rgba(99,91,255,.09)', border: '1px solid rgba(99,91,255,.2)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#635bff', marginBottom: 8 }}>수정 안내</div>
              <ul style={{ fontSize: '0.73rem', color: '#4f46e5', lineHeight: 2, listStyle: 'none' }}>
                <li>• 상태(접수/처리중/완료)도 함께 변경할 수 있습니다</li>
                <li>• 도면을 다시 클릭하면 위치가 이동합니다</li>
                <li>• 사진 추가/삭제는 상세 페이지에서 진행합니다</li>
              </ul>
            </div>
            <button
              onClick={submit}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #635bff', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}
            >
              <i className="fa-solid fa-floppy-disk" /> 수정 저장
            </button>
            <button
              onClick={() => router.push(`/defects/${defect.id}`)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #e3e8ef', background: '#fff', color: '#425466', fontFamily: 'inherit', marginTop: 8 }}
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
