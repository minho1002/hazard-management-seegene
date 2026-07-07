import type { Defect } from '@/lib/store'

export interface RecurringAnalysisResult {
  level: '반복 아님' | '반복 의심' | '반복 확정'
  type: string | null
  matchedDefectIds: number[]
  reasonSummary: string
  recommendedAction: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY_MS
}

// ── Rule-Based 진입점 ────────────────────────────────────────────────────
// 관리자가 확정/해제하기 전까지는 저장하지 않고 매번 최신 데이터로 다시 계산한다
// (5단계 하자구분과 동일하게 "AI는 추천만, 확정은 관리자"라는 원칙을 따름).
export function analyzeRecurrence(defect: Defect, allDefects: Defect[]): RecurringAnalysisResult {
  const others = allDefects.filter(d => d.id !== defect.id && !d.deletedAt)

  if (defect.recurrenceCount > 0) {
    return {
      level: '반복 확정',
      type: '처리이력 기반 재발',
      matchedDefectIds: [],
      reasonSummary: `처리 이력에 재발 기록이 ${defect.recurrenceCount}회 있습니다.`,
      recommendedAction: '재발 원인 정밀 점검 및 예방조치 검토를 권장합니다.',
    }
  }

  const sameLocationCategory = defect.locationText
    ? others.filter(d => {
        if (d.locationText !== defect.locationText || d.categoryId !== defect.categoryId) return false
        const days = daysBetween(d.firstOccurredAt, defect.firstOccurredAt)
        return days != null && days <= 90
      })
    : []
  if (sameLocationCategory.length > 0) {
    return {
      level: '반복 의심',
      type: '동일 위치',
      matchedDefectIds: sameLocationCategory.map(d => d.id),
      reasonSummary: `동일 위치("${defect.locationText}")·동일 카테고리에서 90일 이내 유사 하자 ${sameLocationCategory.length}건이 확인됩니다.`,
      recommendedAction: '동일 위치에서 반복 발생 — 근본 원인 재점검을 권장합니다.',
    }
  }

  const sameFacility = defect.facilityName
    ? others.filter(d => {
        if (d.facilityName !== defect.facilityName) return false
        const days = daysBetween(d.firstOccurredAt, defect.firstOccurredAt)
        return days != null && days <= 180
      })
    : []
  if (sameFacility.length > 0) {
    return {
      level: '반복 의심',
      type: '동일 설비',
      matchedDefectIds: sameFacility.map(d => d.id),
      reasonSummary: `동일 설비("${defect.facilityName}")에서 180일 이내 유사 하자 ${sameFacility.length}건이 확인됩니다.`,
      recommendedAction: '설비 정밀점검 또는 교체 검토를 권장합니다.',
    }
  }

  return { level: '반복 아님', type: null, matchedDefectIds: [], reasonSummary: '반복 발생 이력이 확인되지 않았습니다.', recommendedAction: null }
}
