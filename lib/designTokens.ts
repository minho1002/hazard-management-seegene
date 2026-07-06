import type { Defect } from '@/lib/store'

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

export type StatusKey = 'open' | 'in_progress' | 'hold' | 'completed'
export type SeverityKey = 'low' | 'medium' | 'high' | 'critical'

export const STATUS_META: Record<StatusKey, { label: string; color: string; bg: string }> = {
  open: { label: '접수', color: '#1D4ED8', bg: '#EFF6FF' },
  in_progress: { label: '처리중', color: COLORS.warning, bg: '#FFF7ED' },
  hold: { label: '보류', color: COLORS.hold, bg: '#FEFCE8' },
  completed: { label: '완료', color: COLORS.success, bg: '#F0FDF4' },
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
  if (isOverdue(defect)) return true
  if (defect.severity === 'critical') return true
  if (isRecurring(defect)) return true
  return false
}
