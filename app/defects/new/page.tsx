'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { FLOOR_SVGS } from '@/lib/floorSvgs'
import type { AiAnalysisResult } from '@/lib/aiAnalysisService'
import { estimateCost } from '@/lib/costPredictionService'
import type { CostPrediction } from '@/lib/costPredictionService'
import { formatKRW } from '@/lib/format'
import { compressImage } from '@/lib/imageCompress'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { suggestClassification, type ClassificationSuggestion } from '@/lib/defectClassificationService'
import FloorLocationMarkers from '@/components/defects/FloorLocationMarkers'

const DEFECT_TYPE_OPTIONS = ['하자사항', '일반사항', '확인 필요'] as const
const RESPONSIBILITY_OPTIONS = ['시공사 귀책', '재단/운영측 부담', '외주업체 부담', '사용자 과실', '소모품/노후', '원인 불명', '분쟁 가능']
const COST_BEARER_OPTIONS = ['시공사', '재단', '외주업체', '사용자', '보험/기타', '미정']
const WARRANTY_OPTIONS = ['보증기간 내', '보증기간 외', '확인 필요'] as const

const CONFIDENCE_COLORS: Record<string, { bg: string; text: string }> = {
  낮음: { bg: '#f3f5f7', text: '#697386' },
  중간: { bg: '#fef3e2', text: '#b06b1a' },
  높음: { bg: '#e6f6f0', text: '#0f7850' },
}
const SEV_KO: Record<string, string> = { low: '낮음', medium: '보통', high: '높음', critical: '긴급' }

const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  낮음: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  중: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  높음: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  긴급: { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
}

export default function NewDefectPage() {
  const router = useRouter()
  const { state, addDefectAndGetId, addDefectLocation, saveFloorImage, addFile } = useStore()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const isTablet = useMediaQuery('(max-width: 1024px)')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [locations, setLocations] = useState<{ id: number; x: number; y: number; label: string }[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const nextTempId = useRef(1)

  const [form, setForm] = useState({
    title: '',
    description: '',
    buildingId: 1,
    floorPlanId: state.floorPlans[0]?.id || 1,
    locationText: '',
    categoryId: '' as string | number,
    severity: 'medium',
    costType: 'our',
    reporterName: '',
    assignedVendorId: '' as string | number,
    managerName: '김관리',
    firstOccurredAt: new Date().toISOString().slice(0, 10),
    zone: '',
    roomName: '',
    facilityName: '',
    facilityId: '',
    department: '',
    expectedCompletionDate: '',
    estimatedCost: '',
    defectType: '확인 필요' as typeof DEFECT_TYPE_OPTIONS[number],
    responsibilityType: '원인 불명',
    costBearer: '미정',
    warrantyStatus: '확인 필요' as typeof WARRANTY_OPTIONS[number],
    isWarrantyClaimTarget: false,
    relatedContract: '',
    classificationReason: '',
  })

  const [aiMemo, setAiMemo] = useState('')
  const [aiMemoExpanded, setAiMemoExpanded] = useState(false)
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [costPrediction, setCostPrediction] = useState<CostPrediction | null>(null)
  const [classificationSuggestion, setClassificationSuggestion] = useState<ClassificationSuggestion | null>(null)

  const floorPlans = state.floorPlans.filter(f => f.buildingId === form.buildingId)

  function setField(k: string, v: string | number | null | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function onBuildingChange(bid: number) {
    const fps = state.floorPlans.filter(f => f.buildingId === bid)
    setForm(f => ({ ...f, buildingId: bid, floorPlanId: fps[0]?.id || 1 }))
    setLocations([])
    setSelectedLocationId(null)
  }

  function onFloorChange(fid: number) {
    setForm(f => ({ ...f, floorPlanId: fid }))
    setLocations([])
    setSelectedLocationId(null)
  }

  function onMapClick(e: React.MouseEvent<HTMLDivElement>) {
    const cont = mapContainerRef.current
    if (!cont) return
    const r = cont.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10
    const id = nextTempId.current++
    setLocations(prev => [...prev, { id, x, y, label: '' }])
    setSelectedLocationId(id)
  }

  function moveLocation(id: number, x: number, y: number) {
    setLocations(prev => prev.map(l => l.id === id ? { ...l, x, y } : l))
  }

  function setLocationLabel(id: number, label: string) {
    setLocations(prev => prev.map(l => l.id === id ? { ...l, label } : l))
  }

  function removeLocation(id: number) {
    setLocations(prev => prev.filter(l => l.id !== id))
    if (selectedLocationId === id) setSelectedLocationId(null)
  }

  function handleFloorImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('5MB 이하 이미지만 업로드 가능합니다.'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      if (ev.target?.result) {
        saveFloorImage(form.floorPlanId, ev.target.result as string)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function onPhotoFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files
    if (!selected) return
    setPhotoFiles(prev => [...prev, ...Array.from(selected)])
    e.target.value = ''
  }

  function removePhotoFile(idx: number) {
    setPhotoFiles(prev => prev.filter((_, i) => i !== idx))
  }

  function validate(): string | null {
    if (!form.title.trim()) return '하자명을 입력하세요.'
    if (!form.locationText.trim()) return '발생 위치(위치 설명)를 입력하세요.'
    if (!form.categoryId) return '카테고리를 선택하세요.'
    if (!form.severity) return '심각도를 선택하세요.'
    if (!form.description.trim()) return '상세 설명을 입력하세요.'
    if (form.expectedCompletionDate && form.firstOccurredAt && form.expectedCompletionDate < form.firstOccurredAt) {
      return '예상 완료일은 발생일보다 이전일 수 없습니다.'
    }
    return null
  }

  async function submit() {
    const error = validate()
    if (error) { alert(error); return }
    const id = addDefectAndGetId({
      title: form.title,
      description: form.description || null,
      buildingId: form.buildingId,
      floorPlanId: form.floorPlanId || null,
      locationX: null,
      locationY: null,
      locationText: form.locationText || null,
      zone: form.zone || null,
      roomName: form.roomName || null,
      facilityName: form.facilityName || null,
      facilityId: form.facilityId || null,
      department: form.department || null,
      expectedCompletionDate: form.expectedCompletionDate || null,
      estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : null,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      severity: form.severity,
      status: 'open',
      costType: form.costType,
      reporterName: form.reporterName || null,
      assignedVendorId: form.assignedVendorId ? Number(form.assignedVendorId) : null,
      managerName: form.managerName || '김관리',
      firstOccurredAt: form.firstOccurredAt || null,
      lastOccurredAt: form.firstOccurredAt || null,
      symptom: aiResult?.symptom ?? null,
      rootCause: aiResult?.rootCause ?? null,
      causeCategory: aiResult?.causeCategory ?? null,
      aiSummary: aiResult?.aiSummary ?? null,
      aiRiskLevel: aiResult?.riskLevel ?? null,
      predictedCostMin: costPrediction?.estimatedCostMin ?? null,
      predictedCostAvg: costPrediction?.estimatedCostAvg ?? null,
      predictedCostMax: costPrediction?.estimatedCostMax ?? null,
      predictionConfidence: costPrediction?.confidence ?? null,
      defectType: form.defectType,
      responsibilityType: form.responsibilityType || null,
      costBearer: form.costBearer || null,
      warrantyStatus: form.warrantyStatus,
      isWarrantyClaimTarget: form.isWarrantyClaimTarget,
      relatedContract: form.relatedContract || null,
      classificationReason: form.classificationReason || null,
      aiClassification: classificationSuggestion ? {
        defectType: classificationSuggestion.defectType,
        responsibilityType: classificationSuggestion.responsibilityType,
        costBearer: classificationSuggestion.costBearer,
        confidence: classificationSuggestion.confidence,
        reasoning: classificationSuggestion.reasoning,
        suggestedAt: new Date().toISOString(),
      } : null,
    })
    for (const loc of locations) {
      addDefectLocation(id, form.floorPlanId, loc.x, loc.y, { label: loc.label || null, createdBy: form.managerName || null })
    }
    for (const file of photoFiles) {
      const dataUrl = await compressImage(file)
      addFile({ defectId: id, photoType: 'before', fileName: file.name, fileType: file.type, dataUrl })
    }
    router.push(`/defects/${id}`)
  }

  async function handleAiAnalyze() {
    if (!aiMemo.trim()) { alert('현장 메모를 입력하세요.'); return }
    setAiAnalyzing(true)
    setAiError(null)
    setAiResult(null)
    setCostPrediction(null)
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo: aiMemo }),
      })
      if (!res.ok) throw new Error('분석 실패')
      const result: AiAnalysisResult = await res.json()
      setAiResult(result)
      const sevMap: Record<string, string> = { 낮음: 'low', 중: 'medium', 높음: 'high', 긴급: 'critical' }
      const catId = state.categories.find(c => c.name === result.category)?.id
      const matchedFloor = floorPlans.find(fp => result.location.startsWith(fp.name))
      if (matchedFloor && matchedFloor.id !== form.floorPlanId) {
        setLocations([])
        setSelectedLocationId(null)
      }
      setForm(f => ({
        ...f,
        title: `${result.location} ${result.symptom}`,
        description: result.aiSummary,
        locationText: result.location,
        categoryId: catId ?? '',
        severity: sevMap[result.riskLevel] ?? 'medium',
        floorPlanId: matchedFloor ? matchedFloor.id : f.floorPlanId,
      }))
      // 이력 기반 비용 예측 자동 수행
      const prediction = estimateCost(state.defects, {
        categoryId: catId ?? null,
        severity: sevMap[result.riskLevel] ?? 'medium',
        causeCategory: result.causeCategory,
        rootCause: result.rootCause,
        locationText: result.location,
      })
      setCostPrediction(prediction)
      // AI 하자구분/귀책 추천 (관리자 확정 전까지는 추천값일 뿐)
      const suggestion = suggestClassification({
        causeCategory: result.causeCategory,
        rootCause: result.rootCause,
        title: `${result.location} ${result.symptom}`,
        description: result.aiSummary,
      })
      setClassificationSuggestion(suggestion)
      setForm(f => ({
        ...f,
        defectType: suggestion.defectType,
        responsibilityType: suggestion.responsibilityType,
        costBearer: suggestion.costBearer,
      }))
    } catch (_e) {
      setAiError('AI 분석 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setAiAnalyzing(false)
    }
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
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>하자 등록</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>도면을 클릭해 위치를 지정하세요 (여러 곳 클릭 가능)</div>
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
                    <label style={labelCls}>제목 *</label>
                    <input style={inputCls} placeholder="예: 3층 화장실 천장 누수" value={form.title} onChange={e => setField('title', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelCls}>상세 설명 *</label>
                    <textarea style={{ ...inputCls, resize: 'vertical', lineHeight: 1.6 }} rows={2} placeholder="상세 내용..." value={form.description} onChange={e => setField('description', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>카테고리 *</label>
                    <select style={selectCls} value={form.categoryId} onChange={e => setField('categoryId', e.target.value)}>
                      <option value="">선택</option>
                      {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>심각도 *</label>
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
                    <label style={labelCls}>발생일</label>
                    <input type="date" style={inputCls} value={form.firstOccurredAt} onChange={e => setField('firstOccurredAt', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>예상 완료일</label>
                    <input type="date" style={inputCls} value={form.expectedCompletionDate} onChange={e => setField('expectedCompletionDate', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>신고자</label>
                    <input style={inputCls} placeholder="홍길동(시설팀)" value={form.reporterName} onChange={e => setField('reporterName', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>담당자</label>
                    <input style={inputCls} value={form.managerName} onChange={e => setField('managerName', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>담당부서</label>
                    <input style={inputCls} placeholder="예: 시설관리팀" value={form.department} onChange={e => setField('department', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>예상 처리비용 (원)</label>
                    <input type="number" style={inputCls} placeholder="0" value={form.estimatedCost} onChange={e => setField('estimatedCost', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>설비명</label>
                    <input style={inputCls} placeholder="예: 공조기 AHU-3" value={form.facilityName} onChange={e => setField('facilityName', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>설비 ID</label>
                    <input style={inputCls} placeholder="예: AHU-3F-01" value={form.facilityId} onChange={e => setField('facilityId', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelCls}>협력업체</label>
                    <select style={selectCls} value={form.assignedVendorId} onChange={e => setField('assignedVendorId', e.target.value)}>
                      <option value="">미지정</option>
                      {state.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 사진 첨부 */}
            <div style={card}>
              <div style={{ padding: '12px 18px', background: '#fafbfc', borderBottom: '1px solid #f0f4f8' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#425466' }}>사진 첨부 (선택, 조치전)</div>
              </div>
              <div style={{ padding: 18 }}>
                <label style={{
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: '0.75rem', color: '#635bff', fontWeight: 600,
                  padding: '7px 12px', border: '1.5px solid #635bff', borderRadius: 7,
                }}>
                  <i className="fa-solid fa-camera" /> 사진 선택
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPhotoFilesSelected} />
                </label>
                {photoFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {photoFiles.map((f, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f5f7fa', borderRadius: 6, padding: '4px 8px' }}>
                        <span style={{ fontSize: '.7rem', color: '#425466' }}>{f.name}</span>
                        <button type="button" onClick={() => removePhotoFile(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b0bac6', fontSize: '.7rem' }}>
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: '.68rem', color: '#b0bac6', marginTop: 10 }}>등록 후에도 상세 페이지에서 조치전/조치중/조치후 사진과 견적서·작업확인서 등 첨부파일을 계속 추가할 수 있습니다.</p>
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
                    <select style={selectCls} value={form.floorPlanId} onChange={e => onFloorChange(Number(e.target.value))}>
                      {floorPlans.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>구역</label>
                    <input style={inputCls} placeholder="예: A구역" value={form.zone} onChange={e => setField('zone', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelCls}>실명</label>
                    <input style={inputCls} placeholder="예: 201호 사무실" value={form.roomName} onChange={e => setField('roomName', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelCls}>발생 위치(위치 설명) *</label>
                    <input style={inputCls} placeholder="예: 3층 남쪽 화장실 천장" value={form.locationText} onChange={e => setField('locationText', e.target.value)} />
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
                  <FloorLocationMarkers
                    markers={locations}
                    onMove={moveLocation}
                    onSelect={setSelectedLocationId}
                    selectedId={selectedLocationId}
                    containerRef={mapContainerRef}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontSize: '0.72rem', color: '#635bff', fontWeight: 600 }}>
                    총 {locations.length}개 위치가 선택되었습니다
                  </span>
                  {locations.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setLocations([]); setSelectedLocationId(null) }}
                      style={{ fontSize: '0.7rem', color: '#697386', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      위치 초기화
                    </button>
                  )}
                </div>

                {locations.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {locations.map((loc, i) => (
                      <div
                        key={loc.id}
                        onClick={() => setSelectedLocationId(loc.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${selectedLocationId === loc.id ? '#635bff' : '#e3e8ef'}`, cursor: 'pointer' }}
                      >
                        <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                        <input
                          style={{ ...inputCls, border: 'none', padding: '2px 4px', flex: 1 }}
                          placeholder={`위치 ${i + 1} 라벨 (예: 천장 누수 지점)`}
                          value={loc.label}
                          onClick={e => e.stopPropagation()}
                          onChange={e => setLocationLabel(loc.id, e.target.value)}
                        />
                        <button type="button" onClick={e => { e.stopPropagation(); removeLocation(loc.id) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b0bac6', fontSize: '.75rem' }}>
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 하자 구분 및 귀책 판단 */}
            <div style={card}>
              <div style={{ padding: '12px 18px', background: '#fafbfc', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#425466' }}>하자 구분 및 귀책 판단</div>
                {classificationSuggestion && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', fontWeight: 700, color: '#635bff', background: 'rgba(99,91,255,.09)', padding: '2px 8px', borderRadius: 20 }}>
                    <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: 9 }} /> AI 추천
                  </span>
                )}
              </div>
              <div style={{ padding: 18 }}>
                {classificationSuggestion && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(99,91,255,.05)', border: '1px solid rgba(99,91,255,.15)', borderRadius: 8, fontSize: '0.73rem', color: '#425466', lineHeight: 1.6 }}>
                    <strong style={{ color: '#635bff' }}>AI 추천 근거</strong> (신뢰도 {classificationSuggestion.confidence}): {classificationSuggestion.reasoning} 최종 확정은 등록 후 상세 화면에서 관리자가 진행합니다.
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelCls}>하자 구분</label>
                    <select style={selectCls} value={form.defectType} onChange={e => setField('defectType', e.target.value)}>
                      {DEFECT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>귀책 구분</label>
                    <select style={selectCls} value={form.responsibilityType} onChange={e => setField('responsibilityType', e.target.value)}>
                      {RESPONSIBILITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>비용 부담 주체</label>
                    <select style={selectCls} value={form.costBearer} onChange={e => setField('costBearer', e.target.value)}>
                      {COST_BEARER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelCls}>보증기간 여부</label>
                    <select style={selectCls} value={form.warrantyStatus} onChange={e => setField('warrantyStatus', e.target.value)}>
                      {WARRANTY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="isWarrantyClaimTarget" checked={form.isWarrantyClaimTarget} onChange={e => setField('isWarrantyClaimTarget', e.target.checked)} />
                    <label htmlFor="isWarrantyClaimTarget" style={{ fontSize: '0.78rem', color: '#425466', cursor: 'pointer' }}>하자보수 청구 대상</label>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelCls}>관련 계약/공종</label>
                    <input style={inputCls} placeholder="예: 방수공사 계약 (2024)" value={form.relatedContract} onChange={e => setField('relatedContract', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelCls}>판단 근거</label>
                    <textarea style={{ ...inputCls, resize: 'vertical', lineHeight: 1.6 }} rows={2} placeholder="하자구분/귀책 판단의 근거를 입력하세요." value={form.classificationReason} onChange={e => setField('classificationReason', e.target.value)} />
                  </div>
                </div>
                <p style={{ fontSize: '.68rem', color: '#b0bac6', marginTop: 10 }}>귀책·비용부담 판단은 민감한 결정이므로 최종 확정은 등록 후 상세 화면에서 관리자 권한으로 처리합니다.</p>
              </div>
            </div>

            {/* AI 현장 메모 분석 */}
            <div style={{ ...card, borderColor: 'rgba(99,91,255,.35)', marginBottom: 14 }}>
              <div
                onClick={() => setAiMemoExpanded(v => !v)}
                style={{ padding: '12px 18px', background: 'linear-gradient(135deg,rgba(99,91,255,.08),rgba(99,91,255,.04))', borderBottom: '1px solid rgba(99,91,255,.2)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#635bff', fontSize: 13 }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#635bff' }}>AI 현장 메모 분석</span>
                <span style={{ fontSize: '0.67rem', color: '#8b97b0' }}>· 메모 입력 시 양식을 자동으로 채워드립니다</span>
                <i className={`fa-solid ${aiMemoExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ marginLeft: 'auto', color: '#635bff', fontSize: 12 }} />
              </div>
              {aiMemoExpanded && (
              <div style={{ padding: 18 }}>
                <label style={labelCls}>현장 메모</label>
                <textarea
                  style={{ ...inputCls, resize: 'vertical', lineHeight: 1.7 }}
                  rows={3}
                  placeholder="예: 지하2층 전기실 천장 물샘. 배관 쪼인트 삭음"
                  value={aiMemo}
                  onChange={e => setAiMemo(e.target.value)}
                />
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={handleAiAnalyze}
                    disabled={aiAnalyzing || !aiMemo.trim()}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: aiAnalyzing ? 'wait' : 'pointer', border: '1.5px solid #635bff', background: (aiAnalyzing || !aiMemo.trim()) ? 'rgba(99,91,255,.45)' : '#635bff', color: '#fff', fontFamily: 'inherit' }}
                  >
                    {aiAnalyzing
                      ? <><i className="fa-solid fa-spinner fa-spin" /> 분석 중...</>
                      : <><i className="fa-solid fa-wand-magic-sparkles" /> AI 분석</>
                    }
                  </button>
                  {aiResult && !aiAnalyzing && (
                    <span style={{ fontSize: '0.7rem', color: '#0d9167', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <i className="fa-solid fa-circle-check" /> 양식에 자동 반영됨
                    </span>
                  )}
                </div>

                {aiError && (
                  <div style={{ marginTop: 10, padding: '8px 12px', background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 6, fontSize: '0.73rem', color: '#cf1322' }}>
                    <i className="fa-solid fa-circle-exclamation" /> {aiError}
                  </div>
                )}

                {aiResult && !aiAnalyzing && (
                  <div style={{ marginTop: 14, padding: 14, background: '#fafbfc', border: '1px solid rgba(99,91,255,.2)', borderRadius: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {([
                        ['위치', aiResult.location],
                        ['카테고리', aiResult.category],
                        ['설비유형', aiResult.facilityType],
                        ['증상', aiResult.symptom],
                        ['근본원인', aiResult.rootCause],
                        ['원인분류', aiResult.causeCategory],
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label} style={{ padding: '7px 10px', background: '#fff', border: '1px solid #e3e8ef', borderRadius: 7 }}>
                          <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#697386', marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: '0.73rem', color: '#0a2540', fontWeight: 500 }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#425466' }}>위험도</span>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: (RISK_COLORS[aiResult.riskLevel] ?? RISK_COLORS['중']).bg, color: (RISK_COLORS[aiResult.riskLevel] ?? RISK_COLORS['중']).text, border: `1px solid ${(RISK_COLORS[aiResult.riskLevel] ?? RISK_COLORS['중']).border}` }}>
                        {aiResult.riskLevel}
                      </span>
                    </div>

                    <div style={{ padding: '10px 12px', background: '#fff', border: '1px solid #e3e8ef', borderRadius: 8, marginBottom: 10 }}>
                      <div style={{ fontSize: '0.67rem', fontWeight: 600, color: '#697386', marginBottom: 4 }}>예상 처리 비용</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0a2540' }}>{formatKRW(aiResult.estimatedCostMin)} ~ {formatKRW(aiResult.estimatedCostMax)}</span>
                        <span style={{ fontSize: '0.67rem', color: '#697386' }}>평균 {formatKRW(aiResult.estimatedCostAvg)}</span>
                      </div>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: '0.67rem', fontWeight: 600, color: '#697386', marginBottom: 6 }}>권장 조치</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {aiResult.recommendedActions.map((a, i) => (
                          <span key={i} style={{ padding: '3px 9px', background: '#fff', border: '1px solid #e3e8ef', borderRadius: 20, fontSize: '0.68rem', color: '#425466' }}>{a}</span>
                        ))}
                      </div>
                    </div>

                    <div style={{ padding: '8px 12px', background: 'rgba(99,91,255,.05)', border: '1px solid rgba(99,91,255,.15)', borderRadius: 7 }}>
                      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#635bff', marginBottom: 3 }}>AI 요약</div>
                      <div style={{ fontSize: '0.73rem', color: '#425466', lineHeight: 1.65 }}>{aiResult.aiSummary}</div>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* AI 비용 예측 */}
            {aiResult && costPrediction && !aiAnalyzing && (
              <div style={{ ...card, borderColor: 'rgba(5,150,105,.3)', marginBottom: 14 }}>
                <div style={{ padding: '12px 18px', background: 'linear-gradient(135deg,rgba(5,150,105,.07),rgba(5,150,105,.03))', borderBottom: '1px solid rgba(5,150,105,.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-chart-line" style={{ color: '#059669', fontSize: 13 }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#059669' }}>AI 비용 예측</span>
                  <span style={{ fontSize: '0.67rem', color: '#8b97b0' }}>· 이력 {costPrediction.similarCount}건 기반</span>
                </div>
                <div style={{ padding: 18 }}>
                  {/* 예측 비용 */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0a2540' }}>{formatKRW(costPrediction.estimatedCostAvg)}</span>
                    <span style={{ fontSize: '0.72rem', color: '#697386' }}>{formatKRW(costPrediction.estimatedCostMin)} ~ {formatKRW(costPrediction.estimatedCostMax)}</span>
                  </div>
                  {/* 신뢰도 + 근거 */}
                  <div style={{ display: 'flex', gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: CONFIDENCE_COLORS[costPrediction.confidence]?.bg ?? '#f3f5f7', color: CONFIDENCE_COLORS[costPrediction.confidence]?.text ?? '#697386' }}>
                      <i className="fa-solid fa-circle-dot" style={{ fontSize: '0.55rem' }} />
                      신뢰도 {costPrediction.confidence}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: '#f3f5f7', color: '#697386' }}>
                      {costPrediction.basedOn === 'history' ? '이력 기반' : costPrediction.basedOn === 'combined' ? '이력+기준표 혼합' : '기준표 기반'}
                    </span>
                  </div>
                  {/* 유사 사례 */}
                  {costPrediction.similarCases.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#697386', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>유사 사례</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {costPrediction.similarCases.map(c => (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#fafbfc', border: '1px solid #e3e8ef', borderRadius: 7 }}>
                            <span style={{ fontSize: '0.72rem', color: '#0a2540', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{c.title}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <span style={{ fontSize: '0.65rem', color: '#697386' }}>{SEV_KO[c.severity] ?? c.severity}</span>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0a2540' }}>{formatKRW(c.totalCost)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Sidebar */}
          <div style={{ position: 'sticky', top: 80 }}>
            <div style={{ background: 'rgba(99,91,255,.09)', border: '1px solid rgba(99,91,255,.2)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#635bff', marginBottom: 8 }}>등록 안내</div>
              <ul style={{ fontSize: '0.73rem', color: '#4f46e5', lineHeight: 2, listStyle: 'none' }}>
                <li>• 케이스번호는 자동 생성됩니다</li>
                <li>• 도면 클릭 시 위치가 추가됩니다(여러 개 가능)</li>
                <li>• 마커는 드래그로 위치를 옮길 수 있습니다</li>
                <li>• 등록 후 이력을 추가할 수 있습니다</li>
              </ul>
            </div>
            <button
              onClick={submit}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #635bff', background: '#635bff', color: '#fff', fontFamily: 'inherit' }}
            >
              <i className="fa-solid fa-floppy-disk" /> 하자 등록
            </button>
            <button
              onClick={() => router.push('/defects')}
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
