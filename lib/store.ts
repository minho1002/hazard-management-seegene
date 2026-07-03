'use client'

import { useState, useEffect, useCallback } from 'react'

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

export type PhotoType = 'before' | 'after' | 'other'

export interface DefectFile {
  id: number
  defectId: number
  photoType: PhotoType
  fileName: string
  fileType: string
  dataUrl: string
  uploadedAt: string
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
}

// ── SEED DATA ─────────────────────────────────────────────────────────────
const SEED: AppState = {
  categories: [
    { id: 1, name: '누수', color: '#2D7DD8', icon: 'fa-droplet' },
    { id: 2, name: '전기', color: '#CF7F2F', icon: 'fa-bolt' },
    { id: 3, name: 'HVAC', color: '#0D9167', icon: 'fa-wind' },
    { id: 4, name: '균열', color: '#CC2943', icon: 'fa-triangle-exclamation' },
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
      // Merge new floor plans from SEED in case they are missing
      SEED.floorPlans.forEach(fp => {
        if (!parsed.floorPlans.find(f => f.id === fp.id)) parsed.floorPlans.push(fp)
      })
      parsed.floorPlans.sort((a, b) => a.order - b.order)
      return parsed
    }
  } catch (_) {}
  return JSON.parse(JSON.stringify(SEED))
}

function persistState(s: AppState) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

function nextId(arr: { id: number }[]): number {
  return arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1
}

function nextCase(defects: Defect[]): string {
  const yr = new Date().getFullYear()
  const cnt = defects.filter(d => d.caseNumber.startsWith(`DEF-${yr}-`)).length
  return `DEF-${yr}-${String(cnt + 1).padStart(3, '0')}`
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

  const addDefect = useCallback((data: Omit<Defect, 'id' | 'caseNumber' | 'recurrenceCount' | 'totalCost' | 'createdAt'>) => {
    setState(prev => {
      const defect: Defect = {
        ...data,
        id: nextId(prev.defects),
        caseNumber: nextCase(prev.defects),
        recurrenceCount: 0,
        totalCost: 0,
        createdAt: new Date().toISOString().slice(0, 10),
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

  const deleteDefect = useCallback((id: number) => {
    setState(prev => {
      const next = {
        ...prev,
        defects: prev.defects.filter(d => d.id !== id),
        logs: prev.logs.filter(l => l.defectId !== id),
      }
      persistState(next)
      return next
    })
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

  const deleteFile = useCallback((id: number) => {
    setState(prev => {
      const next = { ...prev, files: prev.files.filter(f => f.id !== id) }
      persistState(next)
      return next
    })
  }, [])

  return {
    state,
    addDefect,
    addDefectAndGetId,
    updateDefect,
    deleteDefect,
    addLog,
    saveFloorImage,
    addFile,
    deleteFile,
    saveState: (s: AppState) => save(s),
  }
}
