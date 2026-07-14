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
  // 조치가 이미 완료된 건(action_done)·최종완료·보류 건은 "조치 지연" 대상이 아니다.
  if (defect.status === 'completed' || defect.status === 'hold' || defect.status === 'action_done') return false
  // 예상완료일이 지정된 경우 그 날짜를 기준으로 지연 여부를 판단하고,
  // 지정되지 않은 경우에만 심각도별 기본 임계값(발생일 기준)을 사용한다.
  if (defect.expectedCompletionDate) {
    return daysSince(defect.expectedCompletionDate) > 0
  }
  const threshold = OVERDUE_DAYS_BY_SEVERITY[defect.severity as SeverityKey] ?? OVERDUE_DAYS_BY_SEVERITY.medium
  return daysSince(defect.firstOccurredAt) >= threshold
}

export function isRecurring(defect: Defect): boolean {
  return defect.recurrenceCount > 0
}

// 대시보드 "미완결 현황" 카드 — 접수·조치중 상태(최종완료/조치완료/재점검/보류 제외)
export function isInProgressStatus(defect: Defect): boolean {
  return defect.status === 'open' || defect.status === 'reviewing' || defect.status === 'assigned' || defect.status === 'in_progress'
}

// 조치예정일이 지정되어 있고 아직 지나지 않은(=지연 아님) 건
export function isScheduled(defect: Defect): boolean {
  if (!defect.expectedCompletionDate) return false
  if (defect.status === 'completed' || defect.status === 'hold' || defect.status === 'action_done') return false
  return !isOverdue(defect)
}

export function needsRecheck(defect: Defect): boolean {
  return defect.status === 'recheck_needed'
}

// 진행중·조치예정·지연·재점검 중 하나라도 해당하면 "미완결" (동일 건이 여러 조건에 겹쳐도 1건으로만 집계)
export function isUnresolved(defect: Defect): boolean {
  return isInProgressStatus(defect) || isScheduled(defect) || isOverdue(defect) || needsRecheck(defect)
}

export type CostStatus = '예상' | '견적확인' | '확정' | '정산완료'

export const COST_STATUS_META: Record<CostStatus, { label: string; color: string; bg: string }> = {
  예상: { label: '예상', color: '#B06B1A', bg: '#FFF7ED' },
  견적확인: { label: '견적확인', color: '#1D4ED8', bg: '#EFF6FF' },
  확정: { label: '확정', color: '#0F7850', bg: '#F0FDF4' },
  정산완료: { label: '정산완료', color: '#15803D', bg: '#DCFCE7' },
}

// 처리비용 표시값 — finalCost(확정비용)가 있으면 그 값을 최우선으로 사용한다.
// finalCost가 없더라도 totalCost(조치 이력에 누적된 실제 비용 — finalCost 도입 이전
// 데이터나 별도 경로로 기록된 비용)가 0보다 크면 이미 확정된 비용으로 간주하고,
// 그마저 없을 때만 등록 시 입력한 예상 처리비용(estimatedCost)을 미확정으로 보여준다.
// 0원은 "입력된 값이 없음"과 다르므로 반드시 null 체크로 구분한다.
export function getDisplayCost(defect: Defect): { amount: number | null; confirmed: boolean } {
  if (defect.finalCost != null) return { amount: defect.finalCost, confirmed: true }
  if (defect.totalCost > 0) return { amount: defect.totalCost, confirmed: true }
  if (defect.estimatedCost != null) return { amount: defect.estimatedCost, confirmed: false }
  return { amount: null, confirmed: false }
}

// 확정된 하자의 costStatus 배지 — 값이 없으면(예상비용조차 없으면) null.
export function getCostStatus(defect: Defect): CostStatus | null {
  if (defect.costStatus) return defect.costStatus
  if (defect.finalCost != null || defect.totalCost > 0) return '확정'
  if (defect.estimatedCost != null) return '예상'
  return null
}

// 예상 대비 확정 차액 (확정비용 - 예상비용) — 둘 다 있을 때만 계산.
export function getCostDiff(defect: Defect): number | null {
  if (defect.finalCost == null || defect.estimatedCost == null) return null
  return defect.finalCost - defect.estimatedCost
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

// "종결 여부" — 최종완료(completed) 상태만 완전히 끝난 건으로 취급한다.
export function isFullyClosed(defect: Defect): boolean {
  return defect.status === 'completed'
}

// 대시보드 상단 카테고리 탭(전체/누수/전기/배수/기타)을 위한 분야 그룹핑.
// 실제 카테고리는 사용자가 자유롭게 추가할 수 있어(누수/전기/HVAC/균열/배수/커스텀),
// 이름이 4개 고정 탭 중 하나와 일치하지 않으면 전부 "기타"로 묶는다.
export type FieldTab = '누수' | '전기' | '배수' | '기타'
export const FIELD_TABS: FieldTab[] = ['누수', '전기', '배수', '기타']
export function getFieldTab(categoryName: string | null | undefined): FieldTab {
  if (categoryName === '누수' || categoryName === '전기' || categoryName === '배수') return categoryName
  return '기타'
}

// "결제 증빙 및 수단" 배지 — 명시적 receiptStatus 필드 없이, paymentMethod와 첨부파일(견적서/작업확인서)
// 유무로부터 파생한다.
export interface PaymentBadge {
  label: string
  icon: string
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  hasReceipt: boolean
}
const PAYMENT_METHOD_ICON: Record<string, string> = {
  '법인카드': '💳', '계좌이체': '🏦', '세금계산서': '🧾', '미정': '❔',
}
// 비용 부담 주체 — 신규 등록(costHandlingType: 우리측 부담/타업체 청구/시공사 부담/미정)과
// 레거시 귀책판단(costBearer: 시공사/재단/외주업체/...)이 서로 다른 옵션 목록을 갖고 공존한다.
// 등록 시 한쪽 값을 다른 select에 그대로 넣으면 옵션이 없어 첫 옵션이 잘못 표시되므로
// (예: '우리측 부담'을 costBearer에 넣으면 select가 임의로 '시공사'를 보여주는 버그),
// 두 필드를 섞지 않고 "확정 여부" 판정은 이 함수로만 한다 — 신규 필드 우선, 없으면 레거시 폴백.
export function getCostBearerStatus(defect: Defect): string {
  return defect.costHandlingType ?? defect.costBearer ?? '미정'
}

export function getPaymentBadge(defect: Defect, files: DefectFile[]): PaymentBadge | null {
  if (!defect.totalCost || defect.totalCost <= 0) return null
  const hasReceipt = files.some(f => f.defectId === defect.id && (f.photoType === 'quote' || f.photoType === 'work_confirmation'))
  if (!defect.paymentMethod || defect.paymentMethod === '미정') {
    return { label: '미정산', icon: '❌', tone: 'danger', hasReceipt: false }
  }
  return {
    label: hasReceipt ? `${defect.paymentMethod} · 증빙완료` : `${defect.paymentMethod} · 증빙미첨부`,
    icon: PAYMENT_METHOD_ICON[defect.paymentMethod] ?? '💰',
    tone: hasReceipt ? 'success' : 'warning',
    hasReceipt,
  }
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
  }

  return null
}
