import type { Defect, DefectFile } from '@/lib/store'
import { canApproveCompletion, type Role } from '@/lib/permissions'

export const COLORS = {
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  action: '#2563EB',
  danger: '#DC2626',
  critical: '#B91C1C',
  warning: '#F97316',
  success: '#16A34A',
  hold: '#EAB308',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',
} as const

export type StatusKey =
  | 'open' | 'reviewing' | 'assigned' | 'in_progress'
  | 'action_done' | 'recheck_needed' | 'hold' | 'completed'
export type SeverityKey = 'low' | 'medium' | 'high' | 'critical'

export const STATUS_META: Record<StatusKey, { label: string; color: string; bg: string }> = {
  open: { label: '접수', color: '#1D4ED8', bg: '#EFF6FF' },
  reviewing: { label: '검토중', color: '#1D4ED8', bg: '#EFF6FF' },
  assigned: { label: '담당자 배정', color: '#1D4ED8', bg: '#EFF6FF' },
  in_progress: { label: '진행중', color: COLORS.warning, bg: '#FFF7ED' },
  action_done: { label: '조치완료', color: COLORS.success, bg: '#F0FDF4' },
  recheck_needed: { label: '재점검 필요', color: COLORS.warning, bg: '#FFF7ED' },
  hold: { label: '보류', color: COLORS.hold, bg: '#FEFCE8' },
  completed: { label: '최종완료', color: COLORS.success, bg: '#F0FDF4' },
}

// 상태 select에 노출할 순서 ('삭제됨'은 일반 상태 전환이 아니라 별도 삭제 액션으로만 처리하므로 제외)
export const STATUS_FLOW: StatusKey[] = [
  'open', 'reviewing', 'assigned', 'in_progress', 'action_done', 'recheck_needed', 'completed', 'hold',
]

// 신규 상태값을 기존 4버킷 집계(대시보드/보고서 차트)에 안전하게 매핑
export function toLegacyBucket(status: string): 'open' | 'in_progress' | 'hold' | 'completed' {
  if (status === 'reviewing' || status === 'assigned') return 'open'
  if (status === 'action_done' || status === 'recheck_needed') return 'in_progress'
  if (status === 'hold') return 'hold'
  if (status === 'completed') return 'completed'
  return 'open'
}

export const SEVERITY_META: Record<SeverityKey, { label: string; color: string; bg: string }> = {
  low: { label: '낮음', color: COLORS.textMuted, bg: '#F9FAFB' },
  medium: { label: '보통', color: '#CA8A04', bg: '#FEFCE8' },
  high: { label: '높음', color: COLORS.danger, bg: '#FEF2F2' },
  critical: { label: '긴급', color: COLORS.critical, bg: '#FEF2F2' },
}

export const OVERDUE_DAYS_BY_SEVERITY: Record<SeverityKey, number> = {
  critical: 3,
  high: 7,
  medium: 14,
  low: 30,
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0
  const then = new Date(dateStr).getTime()
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24))
}

export function isOverdue(defect: Defect): boolean {
  if (defect.status === 'completed' || defect.status === 'hold') return false
  const threshold = OVERDUE_DAYS_BY_SEVERITY[defect.severity as SeverityKey] ?? OVERDUE_DAYS_BY_SEVERITY.medium
  return daysSince(defect.firstOccurredAt) >= threshold
}

export function isRecurring(defect: Defect): boolean {
  return defect.recurrenceCount > 0
}

export function needsTodayAction(defect: Defect): boolean {
  if (defect.status === 'completed') return false
  if (defect.status === 'recheck_needed') return true
  if (isOverdue(defect)) return true
  if (defect.severity === 'critical') return true
  if (isRecurring(defect)) return true
  return false
}

// 조치완료(action_done) 전환에 필요한 '조치 후' 사진이 아직 없는지 확인
export function needsAfterPhoto(defect: Defect, files: DefectFile[]): boolean {
  if (defect.status !== 'action_done') return false
  return !files.some(f => f.defectId === defect.id && f.photoType === 'after')
}

// 상태 전환 시 필요한 값이 채워져 있는지 검증. null이면 전환 가능, 문자열이면 그 사유로 전환 불가.
export function getStatusTransitionError(
  defect: Defect,
  target: StatusKey,
  ctx: { files: DefectFile[]; role: Role; actionContent?: string | null; actualCost?: number | null }
): string | null {
  if (target === defect.status) return null

  if (target === 'completed') {
    if (!canApproveCompletion(ctx.role)) return '최종완료 승인 권한이 없습니다.'
    if (!defect.costBearer || defect.costBearer === '미정') {
      return '비용 부담 주체를 확정해야 최종완료할 수 있습니다.'
    }
  }

  if (target === 'action_done') {
    const contentOk = !!(ctx.actionContent?.trim() || defect.lastActionContent?.trim())
    const costOk = (ctx.actualCost ?? defect.totalCost ?? 0) > 0
    const afterPhotoOk = ctx.files.some(f => f.defectId === defect.id && f.photoType === 'after')
    if (!contentOk) return '조치완료로 전환하려면 조치 내용을 입력해야 합니다.'
    if (!costOk) return '조치완료로 전환하려면 실제 비용을 입력해야 합니다.'
    if (!afterPhotoOk) return '조치완료로 전환하려면 조치 후 사진이 필요합니다.'
  }

  return null
}
