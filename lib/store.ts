'use client'

import { useState, useEffect, useCallback } from 'react'
import { getStatusTransitionError, type StatusKey } from '@/lib/designTokens'
import { canConfirmRecurring, canFinalizeClassification, canDelete } from '@/lib/permissions'
import { getCurrentRole } from '@/lib/auth/session'

// ── Types ──────────────────────────────────────────────────────────────────
export interface Category {
  id: number
  name: string
  color: string
  icon: string
}

export interface Vendor {
  id: number
  name: string
  specialty: string
}

export interface Building {
  id: number
  name: string
  address: string
}

export interface FloorPlan {
  id: number
  buildingId: number
  name: string
  order: number
}

export interface Defect {
  id: number
  caseNumber: string
  title: string
  description: string | null
  buildingId: number
  floorPlanId: number | null
  locationX: number | null
  locationY: number | null
  locationText: string | null
  categoryId: number | null
  severity: string
  status: string
  costType: string
  reporterName: string | null
  assignedVendorId: number | null
  managerName: string | null
  recurrenceCount: number
  firstOccurredAt: string | null
  lastOccurredAt: string | null
  totalCost: number
  createdAt: string
  // AI 분석 필드 (등록 시 AI 분석을 했을 때만 저장됨)
  symptom?: string | null
  rootCause?: string | null
  causeCategory?: string | null
  aiSummary?: string | null
  aiRiskLevel?: string | null
  // AI 비용 예측 필드 (등록 시 예측을 했을 때만 저장됨)
  predictedCostMin?: number | null
  predictedCostAvg?: number | null
  predictedCostMax?: number | null
  predictionConfidence?: string | null
  predictionErrorRate?: number | null
  // 하자구분 / 귀책 판단 (Phase 1 신규)
  defectType?: '하자사항' | '일반사항' | '확인 필요'
  responsibilityType?: string | null
  costBearer?: string | null
  reviewStatus?: '미검토' | '검토중' | '확정' | '이견있음' | '분쟁가능' | '재검토필요'
  costApprovalStatus?: '미승인' | '승인대기' | '승인완료' | '반려' | '협의중'
  aiClassification?: {
    defectType?: string
    responsibilityType?: string
    costBearer?: string
    confidence?: string
    reasoning?: string
    suggestedAt?: string
  } | null
  lastActionContent?: string | null
  // Soft Delete (Phase 1 신규)
  deletedAt?: string | null
  deletedBy?: string | null
  deleteReason?: string | null
  // 생애주기 확장 필드 (Phase 2 신규)
  facilityName?: string | null
  facilityId?: string | null
  zone?: string | null
  roomName?: string | null
  department?: string | null
  expectedCompletionDate?: string | null
  estimatedCost?: number | null
  // 귀책판단 확장 필드 (Phase 2 신규 — 5단계)
  warrantyStatus?: '보증기간 내' | '보증기간 외' | '확인 필요'
  isWarrantyClaimTarget?: boolean
  relatedContract?: string | null
  classificationReason?: string | null
  // 반복 하자 분석 확장 필드 (Phase 2 신규 — 7단계, 관리자가 확정/해제했을 때만 값이 들어감)
  recurringLevel?: '반복 아님' | '반복 의심' | '반복 확정' | '재점검 필요' | '예방조치 진행중' | '예방조치 완료'
  recurringConfirmedReason?: string | null
  // 비용 처리 상세 / 일정 (2차 고도화 — 260708 요구사항)
  costHandlingType?: '우리측 부담' | '타업체 청구' | '시공사 부담' | '미정' | null
  ownCostEstimate?: number | null
  paymentMethod?: '법인카드' | '계좌이체' | '세금계산서' | '미정' | null
  claimCostEstimate?: number | null
  claimTargetVendor?: string | null
  constructorName?: string | null
  warrantyRequestYn?: boolean
  claimOrFreeRepair?: '청구' | '무상보수' | null
  costUndecidedReason?: string | null
  vendorVisitDate?: string | null
  paymentCompletedAt?: string | null
}

export interface DefectStatusHistory {
  id: number
  defectId: number
  fromStatus: string
  toStatus: string
  changedBy: string | null
  changedAt: string
  reason: string | null
}

export interface DefectDeleteLog {
  id: number
  defectId: number
  deletedBy: string | null
  deletedAt: string
  reason: string
}

// 확정 시점의 하자구분/귀책판단 스냅샷 (필드별 diff가 아니라 확정 이벤트 단위)
export interface DefectClassificationHistory {
  id: number
  defectId: number
  changedBy: string | null
  changedAt: string
  defectType: string
  responsibilityType: string | null
  costBearer: string | null
  reviewStatus: string | null
  costApprovalStatus: string | null
  reason: string | null
}

export interface DefectLog {
  id: number
  defectId: number
  logType: string
  title: string
  content: string | null
  costAmount: number | null
  occurredAt: string
}

export type PhotoType =
  | 'before' | 'during' | 'after'
  | 'quote' | 'work_confirmation' | 'inspection_sheet' | 'contract' | 'vendor_opinion'
  | 'other'

export interface DefectFile {
  id: number
  defectId: number
  photoType: PhotoType
  fileName: string
  fileType: string
  dataUrl: string
  uploadedAt: string
  uploadedBy?: string | null
}

// 삭제 시점의 파일 메타데이터 스냅샷 (무거운 dataUrl은 저장하지 않음 — 용량 회수 목적과 상충)
export interface DefectFileDeleteLog {
  id: number
  fileId: number
  defectId: number
  fileName: string
  photoType: PhotoType
  uploadedBy: string | null
  deletedBy: string | null
  deletedAt: string
  reason: string
}

// 관리자의 반복 하자 확정/해제 이력 (Phase 2 신규 — 7단계)
export interface DefectRecurringHistory {
  id: number
  defectId: number
  changedBy: string | null
  changedAt: string
  level: string
  reason: string | null
}

// 도면 위 다중 위치 마커 (Phase 2 신규 — 4단계). severity/status가 null이면 하자 자체 값을 상속한다.
export interface DefectLocation {
  id: number
  defectId: number
  floorPlanId: number
  x: number
  y: number
  label: string | null
  description: string | null
  severity: string | null
  status: string | null
  notes: string | null
  createdAt: string
  createdBy: string | null
}

export interface AppState {
  categories: Category[]
  vendors: Vendor[]
  buildings: Building[]
  floorPlans: FloorPlan[]
  floorPlanImages: Record<number, string>
  defects: Defect[]
  logs: DefectLog[]
  files: DefectFile[]
  statusHistory: DefectStatusHistory[]
  deleteLogs: DefectDeleteLog[]
  classificationHistory: DefectClassificationHistory[]
  fileDeleteLogs: DefectFileDeleteLog[]
  defectLocations: DefectLocation[]
  recurringHistory: DefectRecurringHistory[]
}

// ── SEED DATA ─────────────────────────────────────────────────────────────
const SEED: AppState = {
  categories: [
    { id: 1, name: '누수', color: '#2D7DD8', icon: 'fa-droplet' },
    { id: 2, name: '전기', color: '#CF7F2F', icon: 'fa-bolt' },
    { id: 3, name: 'HVAC', color: '#0D9167', icon: 'fa-wind' },
    { id: 4, name: '균열', color: '#CC2943', icon: 'fa-triangle-exclamation' },
    { id: 5, name: '배수', color: '#7C3AED', icon: 'fa-toilet' },
  ],
  vendors: [
    { id: 1, name: '국보디자인', specialty: '방수/누수' },
    { id: 2, name: '한국설비(주)', specialty: '기계설비' },
    { id: 3, name: '삼성전기서비스', specialty: '전기' },
    { id: 4, name: '쾌적공조(주)', specialty: 'HVAC/공조' },
  ],
  buildings: [
    { id: 1, name: '대전충청검사센터', address: '대전광역시 중구 대종로480번길 15' },
  ],
  floorPlans: [
    { id: 1, buildingId: 1, name: '지하2층', order: 1 },
    { id: 2, buildingId: 1, name: '지하1층', order: 2 },
    { id: 3, buildingId: 1, name: '1층', order: 3 },
    { id: 4, buildingId: 1, name: '2층', order: 4 },
    { id: 5, buildingId: 1, name: '3층', order: 5 },
    { id: 6, buildingId: 1, name: '4층', order: 6 },
    { id: 7, buildingId: 1, name: '5층', order: 7 },
    { id: 8, buildingId: 1, name: '6층', order: 8 },
    { id: 9, buildingId: 1, name: 'RF층', order: 9 },
  ],
  floorPlanImages: {},
  files: [],
  statusHistory: [],
  deleteLogs: [],
  classificationHistory: [],
  fileDeleteLogs: [],
  // 시드 하자 5건의 기존 locationX/Y를 그대로 마커 1개씩으로 반영 (loadState의 마이그레이션은
  // localStorage에 저장된 기존 데이터가 있을 때만 실행되므로, 시드 자체는 직접 채워둔다)
  defectLocations: [
    { id: 1, defectId: 1, floorPlanId: 2, x: 35.5, y: 60.2, label: '지하1층 주차장 A구역', description: null, severity: null, status: null, notes: null, createdAt: '2026-04-16', createdBy: null },
    { id: 2, defectId: 2, floorPlanId: 5, x: 70, y: 30, label: '3층 전기실', description: null, severity: null, status: null, notes: null, createdAt: '2026-04-16', createdBy: null },
    { id: 3, defectId: 3, floorPlanId: 4, x: 50, y: 50, label: '2층 201호 사무실', description: null, severity: null, status: null, notes: null, createdAt: '2026-04-16', createdBy: null },
    { id: 4, defectId: 4, floorPlanId: 3, x: 45, y: 75, label: '1층 로비 중앙', description: null, severity: null, status: null, notes: null, createdAt: '2026-04-16', createdBy: null },
    { id: 5, defectId: 5, floorPlanId: 1, x: 20, y: 40, label: '지하2층 기계실', description: null, severity: null, status: null, notes: null, createdAt: '2026-04-16', createdBy: null },
  ],
  recurringHistory: [],
  defects: [
    { id: 1, caseNumber: 'DEF-2024-001', title: '지하1층 주차장 누수', description: '주차장 천장에서 물이 새고 있음. 비가 올 때마다 심해짐', buildingId: 1, floorPlanId: 2, locationX: 35.5, locationY: 60.2, locationText: '지하1층 주차장 A구역', categoryId: 1, severity: 'high', status: 'in_progress', costType: 'gukbo', reporterName: '홍길동(시설팀)', assignedVendorId: 1, managerName: '김관리', recurrenceCount: 2, firstOccurredAt: '2024-03-15', lastOccurredAt: '2024-11-20', totalCost: 850000, createdAt: '2026-04-16' },
    { id: 2, caseNumber: 'DEF-2024-002', title: '3층 전기실 분전반 이상', description: '분전반에서 이상 소음 발생, 주기적 점검 필요', buildingId: 1, floorPlanId: 5, locationX: 70, locationY: 30, locationText: '3층 전기실', categoryId: 2, severity: 'critical', status: 'completed', costType: 'our', reporterName: '이시설(시설팀)', assignedVendorId: 3, managerName: '김관리', recurrenceCount: 0, firstOccurredAt: '2024-04-10', lastOccurredAt: '2024-09-05', totalCost: 1200000, createdAt: '2026-04-16' },
    { id: 3, caseNumber: 'DEF-2024-003', title: '2층 사무실 에어컨 냉방 불량', description: '냉방 효율 저하, 여름철 실내 온도 유지 어려움', buildingId: 1, floorPlanId: 4, locationX: 50, locationY: 50, locationText: '2층 201호 사무실', categoryId: 3, severity: 'medium', status: 'open', costType: 'our', reporterName: '박시설(시설팀)', assignedVendorId: 4, managerName: '김관리', recurrenceCount: 1, firstOccurredAt: '2024-06-01', lastOccurredAt: '2024-08-15', totalCost: 320000, createdAt: '2026-04-16' },
    { id: 4, caseNumber: 'DEF-2024-004', title: '1층 로비 바닥 균열', description: '로비 대리석 바닥 균열 발생', buildingId: 1, floorPlanId: 3, locationX: 45, locationY: 75, locationText: '1층 로비 중앙', categoryId: 4, severity: 'low', status: 'completed', costType: 'claim', reporterName: '홍길동(시설팀)', assignedVendorId: null, managerName: '김관리', recurrenceCount: 0, firstOccurredAt: '2024-07-20', lastOccurredAt: '2024-07-20', totalCost: 0, createdAt: '2026-04-16' },
    { id: 5, caseNumber: 'DEF-2025-001', title: '지하2층 기계실 배관 누수', description: '기계실 급수배관 조인트 누수', buildingId: 1, floorPlanId: 1, locationX: 20, locationY: 40, locationText: '지하2층 기계실', categoryId: 1, severity: 'high', status: 'in_progress', costType: 'gukbo', reporterName: '이시설(시설팀)', assignedVendorId: 2, managerName: '김관리', recurrenceCount: 0, firstOccurredAt: '2025-01-10', lastOccurredAt: '2025-01-10', totalCost: 0, createdAt: '2026-04-16' },
  ],
  logs: [
    { id: 1, defectId: 1, logType: 'occurrence', title: '최초 누수 발생 신고', content: '지하1층 주차장 A구역 천장 누수 신고 접수', costAmount: null, occurredAt: '2024-03-15T09:00' },
    { id: 2, defectId: 1, logType: 'inspection', title: '국보디자인 현장 방문', content: '현장 점검 및 누수 원인 분석 완료', costAmount: null, occurredAt: '2024-04-02T14:00' },
    { id: 3, defectId: 1, logType: 'action', title: '방수 공사 1차 시공', content: '우레탄 방수 도포 1차 시공 완료', costAmount: 650000, occurredAt: '2024-05-10T10:00' },
    { id: 4, defectId: 1, logType: 'recurrence', title: '누수 재발 확인', content: '우천 시 동일 구역 재누수 확인', costAmount: null, occurredAt: '2024-07-25T09:00' },
    { id: 5, defectId: 1, logType: 'action', title: '방수 공사 2차 보강', content: '크랙 부위 실링 + 방수 보강 완료', costAmount: 200000, occurredAt: '2024-08-15T11:00' },
    { id: 6, defectId: 2, logType: 'occurrence', title: '분전반 이상 소음 신고', content: null, costAmount: null, occurredAt: '2024-04-10T11:00' },
    { id: 7, defectId: 2, logType: 'inspection', title: '삼성전기서비스 점검', content: '차단기 노후화 확인', costAmount: null, occurredAt: '2024-05-15T10:00' },
    { id: 8, defectId: 2, logType: 'action', title: '차단기 교체 완료', content: null, costAmount: 1200000, occurredAt: '2024-09-05T16:00' },
    { id: 9, defectId: 3, logType: 'occurrence', title: '에어컨 냉방 불량 신고', content: null, costAmount: null, occurredAt: '2024-06-01T10:00' },
    { id: 10, defectId: 3, logType: 'inspection', title: '쾌적공조 점검', content: '냉매 부족 확인', costAmount: null, occurredAt: '2024-06-20T14:00' },
    { id: 11, defectId: 3, logType: 'action', title: '냉매 충전 완료', content: null, costAmount: 120000, occurredAt: '2024-06-25T10:00' },
    { id: 12, defectId: 3, logType: 'recurrence', title: '냉방 불량 재발', content: null, costAmount: null, occurredAt: '2024-08-15T09:00' },
    { id: 13, defectId: 4, logType: 'occurrence', title: '바닥 균열 신고', content: null, costAmount: null, occurredAt: '2024-07-20T13:00' },
    { id: 14, defectId: 4, logType: 'action', title: '균열 보수 완료 (claim)', content: null, costAmount: 0, occurredAt: '2024-08-01T11:00' },
    { id: 15, defectId: 5, logType: 'occurrence', title: '배관 조인트 누수 신고', content: null, costAmount: null, occurredAt: '2025-01-10T08:00' },
    { id: 16, defectId: 5, logType: 'inspection', title: '한국설비 현장 점검', content: null, costAmount: null, occurredAt: '2025-01-15T14:00' },
  ],
}

const STORAGE_KEY = 'hajaSys2'

function loadState(): AppState {
  if (typeof window === 'undefined') return JSON.parse(JSON.stringify(SEED))
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) {
      const parsed = JSON.parse(s) as AppState
      if (!parsed.floorPlanImages) parsed.floorPlanImages = {}
      if (!parsed.files) parsed.files = []
      if (!parsed.statusHistory) parsed.statusHistory = []
      if (!parsed.deleteLogs) parsed.deleteLogs = []
      if (!parsed.classificationHistory) parsed.classificationHistory = []
      if (!parsed.fileDeleteLogs) parsed.fileDeleteLogs = []
      if (!parsed.defectLocations) parsed.defectLocations = []
      if (!parsed.recurringHistory) parsed.recurringHistory = []
      // 레거시 단일좌표(locationX/Y) -> defectLocations 1회성 마이그레이션
      parsed.defects.forEach(d => {
        if (d.locationX != null && !parsed.defectLocations.some(l => l.defectId === d.id)) {
          parsed.defectLocations.push({
            id: nextId(parsed.defectLocations),
            defectId: d.id,
            floorPlanId: d.floorPlanId ?? 1,
            x: d.locationX,
            y: d.locationY ?? 0,
            label: d.locationText,
            description: null,
            severity: null,
            status: null,
            notes: null,
            createdAt: d.createdAt,
            createdBy: null,
          })
        }
      })
      // Merge new floor plans from SEED in case they are missing
      SEED.floorPlans.forEach(fp => {
        if (!parsed.floorPlans.find(f => f.id === fp.id)) parsed.floorPlans.push(fp)
      })
      parsed.floorPlans.sort((a, b) => a.order - b.order)
      // Merge new categories from SEED (e.g. 배수) in case they are missing
      SEED.categories.forEach(c => {
        if (!parsed.categories.find(existing => existing.name === c.name)) parsed.categories.push(c)
      })
      return parsed
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(SEED))
}

function persistState(s: AppState) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch (e) {
    // 저장 공간 초과 등 — 화면 상태(setState)는 계속 반영되지만 새로고침 시 유실될 수 있음
    console.error('localStorage 저장 실패(저장 공간 부족 가능):', e)
    alert('변경사항 저장에 실패했습니다(저장 공간 부족 가능). 새로고침 시 이 변경사항이 사라질 수 있으니, 관리자에게 문의하거나 불필요한 첨부파일을 정리해주세요.')
  }
}

function nextId(arr: { id: number }[]): number {
  return arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1
}

function nextCase(defects: Defect[]): string {
  const yr = new Date().getFullYear()
  const cnt = defects.filter(d => d.caseNumber.startsWith(`DEF-${yr}-`)).length
  return `DEF-${yr}-${String(cnt + 1).padStart(3, '0')}`
}

// 하위호환: defectLocations 중 가장 먼저 생성된 위치를 defect.locationX/Y에 미러링한다.
// (locationText는 사용자가 별도로 입력하는 자유 텍스트라 건드리지 않음)
function mirrorPrimaryLocation(defects: Defect[], locations: DefectLocation[], defectId: number): Defect[] {
  const primary = locations.filter(l => l.defectId === defectId).sort((a, b) => a.id - b.id)[0]
  return defects.map(d => d.id === defectId ? { ...d, locationX: primary?.x ?? null, locationY: primary?.y ?? null } : d)
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useStore() {
  const [state, setState] = useState<AppState>(() => {
    // During SSR return seed; hydration will sync
    if (typeof window === 'undefined') return JSON.parse(JSON.stringify(SEED))
    return loadState()
  })

  // On mount, sync from localStorage (handles SSR mismatch)
  useEffect(() => {
    setState(loadState())
  }, [])

  const save = useCallback((next: AppState) => {
    persistState(next)
    setState(next)
  }, [])

  const addCategory = useCallback((name: string): number => {
    const trimmed = name.trim()
    const current = loadState()
    const existing = current.categories.find(c => c.name === trimmed)
    if (existing) return existing.id
    const category: Category = { id: nextId(current.categories), name: trimmed, color: '#697386', icon: 'fa-tag' }
    const next = { ...current, categories: [...current.categories, category] }
    persistState(next)
    setState(next)
    return category.id
  }, [])

  // 외주업체는 고정 목록 대신 수기 입력을 받는다 — 같은 이름이 이미 있으면 재사용하고, 없으면 새로 만든다.
  const addVendor = useCallback((name: string): number => {
    const trimmed = name.trim()
    const current = loadState()
    const existing = current.vendors.find(v => v.name === trimmed)
    if (existing) return existing.id
    const vendor: Vendor = { id: nextId(current.vendors), name: trimmed, specialty: '' }
    const next = { ...current, vendors: [...current.vendors, vendor] }
    persistState(next)
    setState(next)
    return vendor.id
  }, [])

  const addDefect = useCallback((data: Omit<Defect, 'id' | 'caseNumber' | 'recurrenceCount' | 'totalCost' | 'createdAt'>) => {
    setState(prev => {
      const defect: Defect = {
        ...data,
        id: nextId(prev.defects),
        caseNumber: nextCase(prev.defects),
        recurrenceCount: 0,
        totalCost: 0,
        createdAt: new Date().toISOString().slice(0, 10),
        defectType: data.defectType ?? '확인 필요',
        reviewStatus: data.reviewStatus ?? '미검토',
        costApprovalStatus: data.costApprovalStatus ?? '미승인',
      }
      const next = { ...prev, defects: [...prev.defects, defect] }
      persistState(next)
      return next
    })
  }, [])

  const addDefectAndGetId = useCallback((data: Omit<Defect, 'id' | 'caseNumber' | 'recurrenceCount' | 'totalCost' | 'createdAt'>): number => {
    const current = loadState()
    const defect: Defect = {
      ...data,
      id: nextId(current.defects),
      caseNumber: nextCase(current.defects),
      recurrenceCount: 0,
      totalCost: 0,
      createdAt: new Date().toISOString().slice(0, 10),
      defectType: data.defectType ?? '확인 필요',
      reviewStatus: data.reviewStatus ?? '미검토',
      costApprovalStatus: data.costApprovalStatus ?? '미승인',
    }
    const next = { ...current, defects: [...current.defects, defect] }
    persistState(next)
    setState(next)
    return defect.id
  }, [])

  const updateDefect = useCallback((id: number, patch: Partial<Defect>) => {
    setState(prev => {
      const next = {
        ...prev,
        defects: prev.defects.map(d => d.id === id ? { ...d, ...patch } : d),
      }
      persistState(next)
      return next
    })
  }, [])

  const softDeleteDefect = useCallback((id: number, reason: string, deletedBy: string | null): { ok: boolean; error?: string } => {
    if (!canDelete(getCurrentRole())) return { ok: false, error: '삭제는 관리자만 처리할 수 있습니다.' }
    const current = loadState()
    const deletedAt = new Date().toISOString()
    const deleteLog: DefectDeleteLog = { id: nextId(current.deleteLogs), defectId: id, deletedBy, deletedAt, reason }
    const next: AppState = {
      ...current,
      defects: current.defects.map(d => d.id === id ? { ...d, deletedAt, deletedBy, deleteReason: reason } : d),
      deleteLogs: [...current.deleteLogs, deleteLog],
    }
    persistState(next)
    setState(next)
    return { ok: true }
  }, [])

  const restoreDefect = useCallback((id: number) => {
    setState(prev => {
      const next: AppState = {
        ...prev,
        defects: prev.defects.map(d => d.id === id ? { ...d, deletedAt: null, deletedBy: null, deleteReason: null } : d),
      }
      persistState(next)
      return next
    })
  }, [])

  const updateDefectStatus = useCallback((id: number, target: StatusKey, opts: {
    changedBy: string | null
    reason?: string | null
    actionContent?: string | null
    actualCost?: number | null
  }): { ok: boolean; error?: string } => {
    const current = loadState()
    const defect = current.defects.find(d => d.id === id)
    if (!defect) return { ok: false, error: '하자를 찾을 수 없습니다.' }

    const error = getStatusTransitionError(defect, target, {
      files: current.files,
      role: getCurrentRole(),
      actionContent: opts.actionContent,
      actualCost: opts.actualCost,
    })
    if (error) return { ok: false, error }

    let logs = current.logs
    if (target === 'action_done' && opts.actionContent) {
      logs = [...logs, {
        id: nextId(logs),
        defectId: id,
        logType: 'action',
        title: opts.actionContent,
        content: null,
        costAmount: opts.actualCost ?? null,
        occurredAt: new Date().toISOString(),
      }]
    }
    const totalCost = logs.filter(l => l.defectId === id && l.costAmount).reduce((s, l) => s + (l.costAmount || 0), 0)

    const patch: Partial<Defect> = { status: target, totalCost }
    if (opts.actionContent) patch.lastActionContent = opts.actionContent
    if (totalCost > 0 && defect.predictedCostAvg && defect.predictionErrorRate == null) {
      patch.predictionErrorRate = Math.round((Math.abs(totalCost - defect.predictedCostAvg) / totalCost) * 1000) / 10
    }

    const history: DefectStatusHistory = {
      id: nextId(current.statusHistory),
      defectId: id,
      fromStatus: defect.status,
      toStatus: target,
      changedBy: opts.changedBy,
      changedAt: new Date().toISOString(),
      reason: opts.reason ?? null,
    }

    const next: AppState = {
      ...current,
      defects: current.defects.map(d => d.id === id ? { ...d, ...patch } : d),
      logs,
      statusHistory: [...current.statusHistory, history],
    }
    persistState(next)
    setState(next)
    return { ok: true }
  }, [])

  const updateClassification = useCallback((id: number, patch: Partial<Pick<Defect,
    'defectType' | 'responsibilityType' | 'costBearer' | 'reviewStatus' | 'costApprovalStatus' |
    'warrantyStatus' | 'isWarrantyClaimTarget' | 'relatedContract' | 'classificationReason'
  >>, opts: { changedBy: string | null; reason?: string | null }): { ok: boolean; error?: string } => {
    const current = loadState()
    const defect = current.defects.find(d => d.id === id)
    if (!defect) return { ok: false, error: '하자를 찾을 수 없습니다.' }

    const wantsFinalize = patch.reviewStatus === '확정' || patch.costApprovalStatus === '승인완료'
    if (wantsFinalize && !canFinalizeClassification(getCurrentRole())) {
      return { ok: false, error: '하자구분/귀책판단 확정 권한이 없습니다.' }
    }

    const merged = { ...defect, ...patch }
    const history: DefectClassificationHistory = {
      id: nextId(current.classificationHistory),
      defectId: id,
      changedBy: opts.changedBy,
      changedAt: new Date().toISOString(),
      defectType: merged.defectType ?? '확인 필요',
      responsibilityType: merged.responsibilityType ?? null,
      costBearer: merged.costBearer ?? null,
      reviewStatus: merged.reviewStatus ?? null,
      costApprovalStatus: merged.costApprovalStatus ?? null,
      reason: opts.reason ?? null,
    }

    const next: AppState = {
      ...current,
      defects: current.defects.map(d => d.id === id ? { ...d, ...patch } : d),
      classificationHistory: [...current.classificationHistory, history],
    }
    persistState(next)
    setState(next)
    return { ok: true }
  }, [])

  const addDefectLocation = useCallback((defectId: number, floorPlanId: number, x: number, y: number, opts?: {
    label?: string | null
    description?: string | null
    severity?: string | null
    status?: string | null
    notes?: string | null
    createdBy?: string | null
  }): number => {
    const current = loadState()
    const location: DefectLocation = {
      id: nextId(current.defectLocations),
      defectId, floorPlanId, x, y,
      label: opts?.label ?? null,
      description: opts?.description ?? null,
      severity: opts?.severity ?? null,
      status: opts?.status ?? null,
      notes: opts?.notes ?? null,
      createdAt: new Date().toISOString(),
      createdBy: opts?.createdBy ?? null,
    }
    const locations = [...current.defectLocations, location]
    const next: AppState = {
      ...current,
      defectLocations: locations,
      defects: mirrorPrimaryLocation(current.defects, locations, defectId),
    }
    persistState(next)
    setState(next)
    return location.id
  }, [])

  const updateDefectLocation = useCallback((id: number, patch: Partial<Pick<DefectLocation, 'label' | 'description' | 'severity' | 'status' | 'notes'>>) => {
    setState(prev => {
      const next: AppState = { ...prev, defectLocations: prev.defectLocations.map(l => l.id === id ? { ...l, ...patch } : l) }
      persistState(next)
      return next
    })
  }, [])

  const updateDefectLocationPosition = useCallback((id: number, x: number, y: number) => {
    setState(prev => {
      const loc = prev.defectLocations.find(l => l.id === id)
      const locations = prev.defectLocations.map(l => l.id === id ? { ...l, x, y } : l)
      const next: AppState = {
        ...prev,
        defectLocations: locations,
        defects: loc ? mirrorPrimaryLocation(prev.defects, locations, loc.defectId) : prev.defects,
      }
      persistState(next)
      return next
    })
  }, [])

  const removeDefectLocation = useCallback((id: number) => {
    setState(prev => {
      const loc = prev.defectLocations.find(l => l.id === id)
      const locations = prev.defectLocations.filter(l => l.id !== id)
      const next: AppState = {
        ...prev,
        defectLocations: locations,
        defects: loc ? mirrorPrimaryLocation(prev.defects, locations, loc.defectId) : prev.defects,
      }
      persistState(next)
      return next
    })
  }, [])

  const clearDefectLocations = useCallback((defectId: number) => {
    setState(prev => {
      const locations = prev.defectLocations.filter(l => l.defectId !== defectId)
      const next: AppState = {
        ...prev,
        defectLocations: locations,
        defects: mirrorPrimaryLocation(prev.defects, locations, defectId),
      }
      persistState(next)
      return next
    })
  }, [])

  const updateRecurringStatus = useCallback((id: number, level: Defect['recurringLevel'], opts: {
    changedBy: string | null
    reason?: string | null
  }): { ok: boolean; error?: string } => {
    const current = loadState()
    const defect = current.defects.find(d => d.id === id)
    if (!defect) return { ok: false, error: '하자를 찾을 수 없습니다.' }

    const isConfirmOrRelease = level === '반복 확정' || (defect.recurringLevel === '반복 확정' && level === '반복 아님')
    if (isConfirmOrRelease && !canConfirmRecurring(getCurrentRole())) {
      return { ok: false, error: '반복 하자 확정/해제 권한이 없습니다.' }
    }
    if (isConfirmOrRelease && !opts.reason?.trim()) {
      return { ok: false, error: '반복 확정/해제는 사유 입력이 필수입니다.' }
    }

    const history: DefectRecurringHistory = {
      id: nextId(current.recurringHistory),
      defectId: id,
      changedBy: opts.changedBy,
      changedAt: new Date().toISOString(),
      level: level ?? '반복 아님',
      reason: opts.reason ?? null,
    }

    const next: AppState = {
      ...current,
      defects: current.defects.map(d => d.id === id ? { ...d, recurringLevel: level, recurringConfirmedReason: opts.reason ?? null } : d),
      recurringHistory: [...current.recurringHistory, history],
    }
    persistState(next)
    setState(next)
    return { ok: true }
  }, [])

  const addLog = useCallback((logData: Omit<DefectLog, 'id'>) => {
    setState(prev => {
      const log: DefectLog = { ...logData, id: nextId(prev.logs) }
      const newLogs = [...prev.logs, log]
      const defect = prev.defects.find(d => d.id === logData.defectId)
      if (!defect) return prev
      const defectLogs = newLogs.filter(l => l.defectId === logData.defectId && l.costAmount)
      const totalCost = defectLogs.reduce((s, l) => s + (l.costAmount || 0), 0)
      const patch: Partial<Defect> = {
        totalCost,
        lastOccurredAt: logData.occurredAt.slice(0, 10),
      }
      if (logData.logType === 'recurrence') {
        patch.recurrenceCount = (defect.recurrenceCount || 0) + 1
      }
      // 실제 비용이 처음 확정될 때 예측 오차율 계산
      if (totalCost > 0 && defect.predictedCostAvg && defect.predictionErrorRate == null) {
        patch.predictionErrorRate = Math.round(
          (Math.abs(totalCost - defect.predictedCostAvg) / totalCost) * 1000
        ) / 10
      }
      const next = {
        ...prev,
        logs: newLogs,
        defects: prev.defects.map(d => d.id === logData.defectId ? { ...d, ...patch } : d),
      }
      persistState(next)
      return next
    })
  }, [])

  const saveFloorImage = useCallback((fpId: number, base64: string) => {
    setState(prev => {
      const next = {
        ...prev,
        floorPlanImages: { ...prev.floorPlanImages, [fpId]: base64 },
      }
      persistState(next)
      return next
    })
  }, [])

  const addFile = useCallback((data: Omit<DefectFile, 'id' | 'uploadedAt'>) => {
    setState(prev => {
      const file: DefectFile = { ...data, id: nextId(prev.files), uploadedAt: new Date().toISOString() }
      const next = { ...prev, files: [...prev.files, file] }
      persistState(next)
      return next
    })
  }, [])

  const deleteFile = useCallback((id: number, reason: string, deletedBy: string | null) => {
    setState(prev => {
      const file = prev.files.find(f => f.id === id)
      if (!file) return prev
      const deleteLog: DefectFileDeleteLog = {
        id: nextId(prev.fileDeleteLogs),
        fileId: file.id,
        defectId: file.defectId,
        fileName: file.fileName,
        photoType: file.photoType,
        uploadedBy: file.uploadedBy ?? null,
        deletedBy,
        deletedAt: new Date().toISOString(),
        reason,
      }
      const next: AppState = {
        ...prev,
        files: prev.files.filter(f => f.id !== id),
        fileDeleteLogs: [...prev.fileDeleteLogs, deleteLog],
      }
      persistState(next)
      return next
    })
  }, [])

  return {
    state,
    addCategory,
    addVendor,
    addDefect,
    addDefectAndGetId,
    updateDefect,
    updateDefectStatus,
    updateClassification,
    softDeleteDefect,
    restoreDefect,
    addDefectLocation,
    updateDefectLocation,
    updateDefectLocationPosition,
    removeDefectLocation,
    clearDefectLocations,
    updateRecurringStatus,
    addLog,
    saveFloorImage,
    addFile,
    deleteFile,
    saveState: (s: AppState) => save(s),
  }
}
