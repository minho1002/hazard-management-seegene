'use client'

import { useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useStore, type Defect } from '@/lib/store'
import { FLOOR_SVGS } from '@/lib/floorSvgs'
import { compressImage } from '@/lib/imageCompress'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { canEditDefect, useCurrentRole, useCurrentUserName } from '@/lib/permissions'
import { usePermissionMatrix } from '@/lib/auth/permissionMatrix'
import AccessDenied from '@/components/ui/AccessDenied'

export default function EditDefectPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { state, addCategory, updateDefect, saveFloorImage } = useStore()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const modalMapContainerRef = useRef<HTMLDivElement>(null)
  const [floorZoomOpen, setFloorZoomOpen] = useState(false)
  const isTablet = useMediaQuery('(max-width: 1024px)')
  const [customCategoryName, setCustomCategoryName] = useState('')
  const role = useCurrentRole()
  usePermissionMatrix() // 권한 매트릭스 변경 시 재렌더 구독
  const userName = useCurrentUserName()

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
    costType: defectRaw?.costType ?? 'our',
    estimatedCost: defectRaw?.estimatedCost != null ? String(defectRaw.estimatedCost) : '',
    finalCost: defectRaw?.finalCost != null ? String(defectRaw.finalCost) : '',
    costConfirmedAt: defectRaw?.costConfirmedAt ?? '',
    costStatus: defectRaw?.costStatus ?? '예상',
    reporterName: defectRaw?.reporterName ?? '',
    assignedVendorId: defectRaw?.assignedVendorId ?? ('' as string | number),
    managerName: defectRaw?.managerName ?? '김관리',
    firstOccurredAt: defectRaw?.firstOccurredAt ?? new Date().toISOString().slice(0, 10),
    expectedCompletionDate: defectRaw?.expectedCompletionDate ?? '',
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

  if (!canEditDefect(role, defect.managerName, userName)) {
    return <AccessDenied message="본인 또는 담당 하자만 수정할 수 있습니다." />
  }

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

  // 작은 미리보기 도면은 클릭해도 바로 찍기엔 오차가 크므로, 클릭하면 확대 모달을 연다.
  function onMapClick() {
    setFloorZoomOpen(true)
  }

  // 확대 모달 안의 큰 도면 클릭 — 실제 위치 지정은 여기서 한다.
  function onModalMapClick(e: React.MouseEvent<HTMLDivElement>) {
    const cont = modalMapContainerRef.current
    if (!cont) return
    const r = cont.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10
    setForm(f => ({ ...f, locationX: x, locationY: y }))
  }

  async function handleFloorImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('5MB 이하 이미지만 업로드 가능합니다.'); return }
    const dataUrl = await compressImage(file)
    saveFloorImage(form.floorPlanId, dataUrl)
    e.target.value = ''
  }

  function submit() {
    if (form.categoryId === '__custom__' && !customCategoryName.trim()) { alert('카테고리를 입력하세요.'); return }
    if (form.expectedCompletionDate && form.firstOccurredAt && form.expectedCompletionDate < form.firstOccurredAt) {
      alert('예상완료일은 발생일보다 이후여야 합니다.')
      return
    }
    const categoryId = form.categoryId === '__custom__'
      ? addCategory(customCategoryName)
      : (form.categoryId ? Number(form.categoryId) : null)
    // costStatus는 관리자가 드롭다운을 직접 바꿨을 때만 명시적으로 보낸다 — 그렇지 않으면
    // finalCost 입력만으로 store의 자동 확정 전환(예상→확정)이 정상 동작하지 않는다.
    const initialCostStatus = defectRaw?.costStatus ?? '예상'
    const costStatusPatch = form.costStatus !== initialCostStatus
      ? { costStatus: form.costStatus as Defect['costStatus'] }
      : {}
    updateDefect(defect.id, {
      title: form.title,
      description: form.description || null,
      buildingId: form.buildingId,
      floorPlanId: form.floorPlanId || null,
      locationX: form.locationX,
      locationY: form.locationY,
      locationText: form.locationText || null,
      categoryId,
      severity: form.severity,
      costType: form.costType,
      estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : null,
      finalCost: form.finalCost ? Number(form.finalCost) : null,
      costConfirmedAt: form.costConfirmedAt || null,
      ...costStatusPatch,
      reporterName: form.reporterName || null,
      assignedVendorId: form.assignedVendorId ? Number(form.assignedVendorId) : null,
      managerName: form.managerName || '김관리',
      firstOccurredAt: form.firstOccurredAt || null,
      expectedCompletionDate: form.expectedCompletionDate || null,
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
        <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 320px', gap: 18, alignItems: 'start' }}>

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
                    <label style={labelCls}>제목</label>
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
                      <option value="__custom__">+ 직접 입력</option>
                    </select>
                    {form.categoryId === '__custom__' && (
                      <input
                        style={{ ...inputCls, marginTop: 8 }}
                        placeholder="예: 방수층 손상"
                        value={customCategoryName}
                        onChange={e => setCustomCategoryName(e.target.value)}
                      />
                    )}
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
                    <label style={labelCls}>비용유형</label>
                    <select style={selectCls} value={form.costType} onChange={e => setField('costType', e.target.value)}>
                      <option value="our">자체</option>
                      <option value="gukbo">국보</option>
                      <option value="claim">청구</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>예상 처리비용 (원)</label>
                    <input type="number" style={inputCls} placeholder="0" value={form.estimatedCost} onChange={e => setField('estimatedCost', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>확정 처리비용 (원)</label>
                    <input type="number" style={inputCls} placeholder="0" value={form.finalCost} onChange={e => setField('finalCost', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>비용 확정일</label>
                    <input type="date" style={inputCls} value={form.costConfirmedAt} onChange={e => setField('costConfirmedAt', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>비용 상태</label>
                    <select style={selectCls} value={form.costStatus} onChange={e => setField('costStatus', e.target.value)}>
                      <option value="예상">예상</option>
                      <option value="견적확인">견적확인</option>
                      <option value="확정">확정</option>
                      <option value="정산완료">정산완료</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>발생일</label>
                    <input type="date" style={inputCls} value={form.firstOccurredAt ?? ''} onChange={e => setField('firstOccurredAt', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>예상완료일</label>
                    <input type="date" style={inputCls} value={form.expectedCompletionDate ?? ''} onChange={e => setField('expectedCompletionDate', e.target.value)} />
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
                    <i className="fa-solid fa-magnifying-glass-plus" /> 도면 클릭하여 확대 후 위치 지정
                  </span>
                  <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: '#635bff', fontWeight: 600, padding: '4px 10px', border: '1.5px solid #635bff', borderRadius: 6 }}>
                    <i className="fa-solid fa-upload" /> 도면 이미지 업로드
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFloorImageUpload} />
                  </label>
                </div>

                <div
                  ref={mapContainerRef}
                  style={{ position: 'relative', cursor: 'zoom-in', border: '1px solid #e3e8ef', borderRadius: 8 }}
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
                  <div style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%', background: 'rgba(10,37,64,.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', pointerEvents: 'none' }}>
                    <i className="fa-solid fa-expand" />
                  </div>
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
                <li>• 상태 변경은 하자 상세 화면에서 진행합니다</li>
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

      {floorZoomOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,37,64,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setFloorZoomOpen(false) }}
        >
          <div style={{ width: 'min(980px,94vw)', maxHeight: '92vh', background: '#fff', borderRadius: 14, boxShadow: '0 12px 40px rgba(10,37,64,.28)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #eef0f4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0a2540' }}>
                <i className="fa-solid fa-crosshairs" style={{ color: '#635bff', marginRight: 6 }} />
                도면 클릭으로 위치 지정 — {floorPlans.find(f => f.id === form.floorPlanId)?.name ?? ''}
              </div>
              <button
                onClick={() => setFloorZoomOpen(false)}
                style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #e3e8ef', background: '#fff', cursor: 'pointer', color: '#697386', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div style={{ padding: 18, overflow: 'auto' }}>
              <div
                ref={modalMapContainerRef}
                style={{ position: 'relative', cursor: 'crosshair', border: '1px solid #e3e8ef', borderRadius: 8 }}
                onClick={onModalMapClick}
              >
                <div dangerouslySetInnerHTML={{ __html: floorSvg }} />
                {form.locationX != null && (
                  <div style={{ position: 'absolute', left: `${form.locationX}%`, top: `${form.locationY ?? 0}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2.5px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.25)', background: '#635bff', color: '#fff', fontSize: 13 }}>
                      <i className="fa-solid fa-location-dot" />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid #eef0f4', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button
                onClick={() => setFloorZoomOpen(false)}
                style={{ padding: '7px 18px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
