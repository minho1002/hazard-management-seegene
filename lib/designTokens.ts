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

// 반복 하자 판단 — 상세화면 배지, 대시보드 "반복 하자 TOP5", 운영현황 KPI 등 모든 화면이 이 함수 하나로
// 판단을 통일한다(과거에는 화면마다 recurrenceCount/recurringLevel을 따로 확인해 결과가 서로 달랐음).
// 1) 관리자가 "반복 확정"으로 명시적으로 확정했거나(recurringLevel), 처리 이력에 재발 기록(recurrenceCount)이
//    있으면 반복 하자다 — 둘 중 하나만 있어도 인정한다.
// 2) allDefects(삭제되지 않은 전체 하자 이력)를 함께 넘기면, 동일 위치+동일 카테고리로 전체 기간에 2건 이상
//    발생한 경우도 반복 하자로 추가 판단한다. allDefects는 반드시 조회기간으로 잘리지 않은 전체 이력이어야
//    하며(요구사항: "반복 여부 판단은 전체 과거 이력으로 계산"), 생략하면 1)만으로 판단한다(기존 호출부 호환).
export function isRecurring(defect: Defect, allDefects?: Defect[]): boolean {
  if (defect.recurringLevel === '반복 확정') return true
  if (defect.recurrenceCount > 0) return true
  if (!allDefects || !defect.locationText) return false
  const sameSpotCount = allDefects.filter(d =>
    !d.deletedAt && d.locationText === defect.locationText && d.categoryId === defect.categoryId
  ).length
  return sameSpotCount >= 2
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

// 처리기한(예상완료일)이 24시간 이내로 임박했지만 아직 지연되지는 않은 건 — Executive Dashboard 처리기한 임박 KPI용.
export function isSlaImminent(defect: Defect): boolean {
  if (!defect.expectedCompletionDate) return false
  if (defect.status === 'completed' || defect.status === 'hold' || defect.status === 'action_done') return false
  if (isOverdue(defect)) return false
  const deadline = new Date(`${defect.expectedCompletionDate}T23:59:59`).getTime()
  const hoursLeft = (deadline - Date.now()) / (1000 * 60 * 60)
  return hoursLeft >= 0 && hoursLeft <= 24
}

// 진행중·조치예정·지연·재점검 중 하나라도 해당하면 "미완결" (동일 건이 여러 조건에 겹쳐도 1건으로만 집계)
export function isUnresolved(defect: Defect): boolean {
  return isInProgressStatus(defect) || isScheduled(defect) || isOverdue(defect) || needsRecheck(defect)
}

// 위험 하자 — Dashboard "위험 하자 TOP5" 카드와 하자목록 "위험" 퀵필터가 공유하는 기준. 최종완료만
// 아니면 심각도/지연 여부와 무관하게 위험 순위 산정 대상이 된다(조치완료 상태도 포함). TOP5 화면은
// 여기에 심각도→지연일 정렬을 추가로 적용해 상위 5건만 보여준다.
export function isRiskDefect(defect: Defect): boolean {
  return defect.status !== 'completed'
}

// 완료 — 최종완료(completed) 상태만 완료로 집계한다. Dashboard/운영현황이 이 함수 하나만 써야
// 진행중·지연·재점검·반복과 마찬가지로 같은 데이터에서 항상 같은 완료 건수가 나온다.
export function isKpiCompleted(defect: Defect): boolean {
  return defect.status === 'completed'
}

// 조치완료 — action_done 상태만 집계한다. 최종완료(completed, isKpiCompleted)와는 다른 단계
// (조치는 끝났지만 관리자 최종완료 승인 전)이므로 섞어 쓰면 안 된다. "조치 완료" 라벨이 붙는
// KPI/카드는 반드시 이 함수를 써야 실제 조치완료 건수와 라벨이 일치한다.
export function isActionDoneStatus(defect: Defect): boolean {
  return defect.status === 'action_done'
}

// 발생일(firstOccurredAt) 기준 기간 필터 — Dashboard/운영현황 공용. 발생일이 없는 하자는 어느
// 기간에도(전체 기간 포함) 속할 수 없으므로 항상 제외한다. 두 화면이 이 함수 하나만 써야
// 같은 기간을 선택했을 때 진행중/완료/지연/재점검/반복/비용 숫자가 화면마다 달라지지 않는다.
export function filterByOccurredPeriod<T extends { firstOccurredAt: string | null }>(
  defects: T[], from: string | null, to: string | null
): T[] {
  return defects.filter(d => {
    if (!d.firstOccurredAt) return false
    const occ = d.firstOccurredAt.slice(0, 10)
    if (from && occ < from) return false
    if (to && occ > to) return false
    return true
  })
}

// ── 기간 필터 공통 기준 ────────────────────────────────────────────────────
// Dashboard/운영현황/AI보고서/보고서가 전부 이 6종·이 함수 하나만 써야 오늘/이번주/이번달/올해/
// 사용자지정/전체기간이 어느 화면에서도 같은 날짜 범위로 계산된다.
export type StandardPeriodType = 'today' | 'week' | 'month' | 'year' | 'custom' | 'all'

export const STANDARD_PERIOD_OPTIONS: { key: StandardPeriodType; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'year', label: '올해' },
  { key: 'custom', label: '사용자 지정' },
  { key: 'all', label: '전체 기간' },
]

export interface StandardPeriodRange { from: string | null; to: string | null; label: string }

function periodPad2(n: number) { return String(n).padStart(2, '0') }
function periodDateStr(d: Date) { return `${d.getFullYear()}-${periodPad2(d.getMonth() + 1)}-${periodPad2(d.getDate())}` }

// 주는 월요일~일요일, 월/연은 달력 기준 현재 달/해로 고정한다(과거 임의 연·월 선택은 '사용자 지정'으로 대체).
export function computeStandardPeriod(
  periodType: StandardPeriodType,
  customFrom: string | null,
  customTo: string | null,
  now: Date = new Date()
): StandardPeriodRange {
  if (periodType === 'today') {
    const t = periodDateStr(now)
    return { from: t, to: t, label: '오늘' }
  }
  if (periodType === 'week') {
    const day = now.getDay() // 0=일요일
    const diffToMonday = day === 0 ? 6 : day - 1
    const monday = new Date(now); monday.setDate(now.getDate() - diffToMonday)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    return { from: periodDateStr(monday), to: periodDateStr(sunday), label: '이번 주' }
  }
  if (periodType === 'month') {
    const from = `${now.getFullYear()}-${periodPad2(now.getMonth() + 1)}-01`
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const to = `${now.getFullYear()}-${periodPad2(now.getMonth() + 1)}-${periodPad2(lastDay)}`
    return { from, to, label: '이번 달' }
  }
  if (periodType === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31`, label: `${now.getFullYear()}년` }
  }
  if (periodType === 'custom') {
    if (!customFrom || !customTo) return { from: null, to: null, label: '사용자 지정 (시작·종료일을 선택하세요)' }
    return { from: customFrom, to: customTo, label: `${customFrom} ~ ${customTo}` }
  }
  return { from: null, to: null, label: '전체 기간' }
}

export type CostStatus = '예상' | '견적확인' | '확정' | '정산완료'

// 예상/확정 비용 공통 색상 — Dashboard/운영현황/하자목록/AI보고서/보고서 전부 이 두 값만 재사용한다.
// 예상(미확정)은 회색, 확정은 녹색(COLORS.success)으로 통일한다.
export const COST_ESTIMATED_COLOR = { text: COLORS.textMuted, bg: '#F3F4F6' }
export const COST_CONFIRMED_COLOR = { text: COLORS.success, bg: '#F0FDF4' }

export const COST_STATUS_META: Record<CostStatus, { label: string; color: string; bg: string }> = {
  예상: { label: '예상', color: COST_ESTIMATED_COLOR.text, bg: COST_ESTIMATED_COLOR.bg },
  견적확인: { label: '견적확인', color: '#1D4ED8', bg: '#EFF6FF' },
  확정: { label: '확정', color: COST_CONFIRMED_COLOR.text, bg: COST_CONFIRMED_COLOR.bg },
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

// 비용(확정/예상) 합계 — Dashboard/운영현황이 이 함수 하나만 써야 같은 하자 목록에서 항상
// 같은 확정·예상 합계가 나온다. getDisplayCost() 기준 그대로 누적한다.
export function sumCostSummary(defects: Defect[]): { confirmed: number; pending: number } {
  let confirmed = 0
  let pending = 0
  for (const d of defects) {
    const { amount, confirmed: isConfirmed } = getDisplayCost(d)
    if (amount == null) continue
    if (isConfirmed) confirmed += amount
    else pending += amount
  }
  return { confirmed, pending }
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

export function needsTodayAction(defect: Defect, allDefects?: Defect[]): boolean {
  // 조치가 이미 끝난 건(action_done)·최종완료·보류 건은 긴급/반복이어도 "오늘 우선처리" 대상이 아니다
  // (isOverdue/isScheduled와 동일한 제외 기준 — 조치완료 건이 TOP3·오늘 우선처리 필터에 잘못 노출되던 버그 수정).
  if (defect.status === 'completed' || defect.status === 'hold' || defect.status === 'action_done') return false
  if (defect.status === 'recheck_needed') return true
  if (isOverdue(defect)) return true
  if (defect.severity === 'critical') return true
  if (isRecurring(defect, allDefects)) return true
  return false
}

// 조치완료(action_done) 전환에 필요한 '조치 후' 사진이 아직 없는지 확인
export function needsAfterPhoto(defect: Defect, files: DefectFile[]): boolean {
  if (defect.status !== 'action_done') return false
  return !files.some(f => f.defectId === defect.id && f.photoType === 'after')
}

// "종결여부" — status 하나만 기준으로 판정하는 단일 소스. 운영현황/대시보드/보고서가 전부
// 이 함수 하나만 써야 "조치완료인데 조치중으로 표시" 같은 화면별 불일치가 생기지 않는다.
export type ClosureStatus = '조치중' | '조치완료' | '재점검' | '종결'
export const CLOSURE_STATUS_META: Record<ClosureStatus, { label: string; icon: string; color: string; bg: string }> = {
  조치중: { label: '조치중', icon: '⚠️', color: COLORS.warning, bg: '#FFF7ED' },
  조치완료: { label: '조치완료', icon: '🔧', color: COLORS.action, bg: '#EFF6FF' },
  재점검: { label: '재점검', icon: '🔁', color: COLORS.warning, bg: '#FFF7ED' },
  종결: { label: '종결', icon: '✅', color: COLORS.success, bg: '#F0FDF4' },
}
export function getClosureStatus(defect: Defect): ClosureStatus {
  if (defect.status === 'completed') return '종결'
  if (defect.status === 'action_done') return '조치완료'
  if (defect.status === 'recheck_needed') return '재점검'
  return '조치중' // open · reviewing · assigned · in_progress · hold
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
// 귀책판단(costBearer: 시공사/재단/외주업체/사용자/보험·기타/미정)이 서로 다른 옵션 목록을 갖고
// 공존한다. Dashboard/운영현황/하자목록/AI보고서/보고서가 전부 이 함수 하나만 기준으로 집계해야
// 화면마다 다른 숫자가 나오지 않는다.
// 우선순위: costBearer(관리자 확정·AI 귀책판단, 더 세분화된 값)가 있으면 그것을 최우선 사용하고,
// 없을 때만 costHandlingType(등록 시 입력한 처리방식)을 costBearer 체계로 환산해서 대신 쓴다.
export type CostBearerCategory = '시공사' | '재단' | '외주업체' | '사용자' | '보험/기타' | '미정'
export const COST_BEARER_CATEGORIES: CostBearerCategory[] = ['시공사', '재단', '외주업체', '사용자', '보험/기타', '미정']

const HANDLING_TYPE_TO_BEARER: Record<string, CostBearerCategory> = {
  '시공사 부담': '시공사',
  '우리측 부담': '재단',
  '타업체 청구': '외주업체',
}

// 등록 화면의 costHandlingType 선택값을 costBearer 체계 값으로 환산한다. 등록 시 두 필드를
// 함께 기록해두면(costBearer에 임의값을 그대로 넣는 게 아니라 이 함수로 변환한 값을 넣으면)
// 상세화면의 costBearer select·AI보고서처럼 costBearer를 직접 참조하는 곳도 정상 동작한다.
export function mapCostHandlingTypeToBearer(handlingType: string | null | undefined): CostBearerCategory | null {
  if (!handlingType) return null
  return HANDLING_TYPE_TO_BEARER[handlingType] ?? null
}

export function getCostBearerStatus(defect: Defect): CostBearerCategory {
  if (defect.costBearer && defect.costBearer !== '미정') return defect.costBearer as CostBearerCategory
  return mapCostHandlingTypeToBearer(defect.costHandlingType) ?? '미정'
}

export function getPaymentBadge(defect: Defect, files: DefectFile[]): PaymentBadge | null {
  // 예상비용만 있고 아직 확정 전인 건도 결제 수단은 미리 지정할 수 있으므로,
  // 확정비용(totalCost)뿐 아니라 예상비용까지 포함한 비용 정보 유무로 게이팅한다.
  if (getDisplayCost(defect).amount == null) return null
  const hasReceipt = files.some(f => f.defectId === defect.id && (f.photoType === 'quote' || f.photoType === 'work_confirmation'))
  if (!defect.paymentMethod || defect.paymentMethod === '미정') {
    return { label: '미정산', icon: '❌', tone: 'danger', hasReceipt: false }
  }
  // 증빙 여부(hasReceipt)는 배지 문구에 노출하지 않는다 — 결제 수단만 보여준다.
  return {
    label: defect.paymentMethod,
    icon: PAYMENT_METHOD_ICON[defect.paymentMethod] ?? '💰',
    tone: 'success',
    hasReceipt,
  }
}

// 상태 전환 시 필요한 값이 채워져 있는지 검증. null이면 전환 가능, 문자열이면 그 사유로 전환 불가.
export function getStatusTransitionError(
  defect: Defect,
  target: StatusKey,
  ctx: { files: DefectFile[]; role: Role; actionContent?: string | null; actualCost?: number | null; actionCompletedAt?: string | null }
): string | null {
  if (target === defect.status) return null

  // 조치완료일을 지정하지 않으면 "조치완료" 상태로 전환할 수 없다 — 조치예정일(계획일)과
  // 조치완료일(실제 완료일)이 혼동되어 완료일 없이 조치완료로 표시되던 문제를 막는다.
  if (target === 'action_done' && !ctx.actionCompletedAt) {
    return '조치완료일을 입력해야 조치완료로 전환할 수 있습니다.'
  }

  if (target === 'completed') {
    if (!canApproveCompletion(ctx.role)) return '최종완료 승인 권한이 없습니다.'
  }

  return null
}
