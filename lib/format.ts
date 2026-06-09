import type { Severity, Status, CostType, LogType } from './types'

export function formatKRW(amount: number | null | undefined): string {
  if (!amount) return '0원'
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: '낮음', medium: '보통', high: '높음', critical: '긴급',
}

export const SEVERITY_COLORS: Record<Severity, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
}

export const STATUS_LABELS: Record<Status, string> = {
  open: '접수', in_progress: '처리중', completed: '완료',
}

export const STATUS_COLORS: Record<Status, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
}

export const COST_TYPE_LABELS: Record<CostType, string> = {
  gukbo: '국보', our: '자체', claim: '청구',
}

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  occurrence: '발생', inspection: '점검', action: '조치', recurrence: '재발',
}

export const LOG_TYPE_COLORS: Record<LogType, string> = {
  occurrence: 'bg-red-500',
  inspection: 'bg-blue-500',
  action: 'bg-green-500',
  recurrence: 'bg-amber-500',
}

export function generateCaseNumber(year: number, seq: number): string {
  return `DEF-${year}-${String(seq).padStart(3, '0')}`
}
