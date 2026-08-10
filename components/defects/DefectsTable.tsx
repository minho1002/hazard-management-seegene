'use client'

import { useRouter } from 'next/navigation'
import { useStore, type Defect } from '@/lib/store'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import PhotoCompareCell from '@/components/defects/PhotoCompareCell'
import {
  isOverdue, getPaymentBadge, getDisplayCost, getCostStatus, COST_STATUS_META,
  COLORS, getClosureStatus, CLOSURE_STATUS_META,
} from '@/lib/designTokens'
import { useMediaQuery } from '@/lib/useMediaQuery'

function fmtDate(s: string | null): string {
  if (!s) return '-'
  return s.slice(0, 10)
}

function fmtCost(n: number): string {
  return n.toLocaleString('ko-KR') + '원'
}

const PAYMENT_TONE_STYLE: Record<string, { bg: string; color: string }> = {
  success: { bg: '#F0FDF4', color: '#16A34A' },
  warning: { bg: '#FFF7ED', color: '#F97316' },
  danger: { bg: '#FEF2F2', color: '#DC2626' },
  neutral: { bg: '#F3F5F7', color: '#425466' },
}

interface Props {
  defects: Defect[]
  filterActive: boolean
  canSeeDeleted: boolean
  showDeleted: boolean
  onRestore: (id: number) => void
}

// 하자 목록 테이블 — /defects(하자 목록)와 /analytics(운영현황 목록 보기 탭)가 공유하는
// 단일 렌더링 소스. 필터링은 각 페이지가 맡고, 이 컴포넌트는 필터링된 defects만 그린다.
export default function DefectsTable({ defects, filterActive, canSeeDeleted, showDeleted, onRestore }: Props) {
  const router = useRouter()
  const { state } = useStore()
  const isTablet = useMediaQuery('(max-width: 1024px)')

  const card = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 10, boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ overflowX: isTablet ? 'auto' : 'visible' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e3e8ef' }}>
              {[
                '종결여부', '발생일', '조치예정일', '분야/명', '사진대지', '외주업체', '처리비용', '결제증빙/수단', '상태', '위치', '작업',
              ].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '7px 12px', fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#697386', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {defects.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  <EmptyState
                    icon="fa-solid fa-inbox"
                    message={filterActive ? '조건에 맞는 하자가 없습니다.' : '등록된 하자가 없습니다.'}
                  />
                </td>
              </tr>
            ) : defects.map(d => {
              const cat = state.categories.find(c => c.id === d.categoryId)
              const overdue = isOverdue(d)
              const closure = getClosureStatus(d)
              const closureMeta = CLOSURE_STATUS_META[closure]
              const vendor = state.vendors.find(v => v.id === d.assignedVendorId)
              const files = state.files.filter(f => f.defectId === d.id)
              const latestBefore = [...files].filter(f => f.photoType === 'before').sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]
              const latestAfter = [...files].filter(f => f.photoType === 'after').sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]
              const paymentBadge = getPaymentBadge(d, state.files)
              return (
                <tr
                  key={d.id}
                  style={{
                    borderBottom: '1px solid #f0f4f8', cursor: 'pointer', transition: 'background 0.1s',
                    borderLeft: overdue ? `3px solid ${COLORS.warning}` : '3px solid transparent',
                    opacity: closure === '종결' ? 0.55 : 1,
                  }}
                  onClick={() => router.push(`/defects/${d.id}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafbff')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  {/* 종결여부 */}
                  <td style={{ padding: '7px 12px', verticalAlign: 'middle' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 700, color: closureMeta.color, background: closureMeta.bg, padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}>
                      {closureMeta.icon} {closureMeta.label}
                    </span>
                  </td>

                  {/* 발생일 */}
                  <td style={{ padding: '7px 12px', verticalAlign: 'middle', fontSize: '0.74rem', color: '#697386', whiteSpace: 'nowrap' }}>
                    {fmtDate(d.firstOccurredAt)}
                  </td>

                  {/* 조치예정일 */}
                  <td style={{ padding: '7px 12px', verticalAlign: 'middle', fontSize: '0.74rem', whiteSpace: 'nowrap', color: overdue ? COLORS.warning : '#697386', fontWeight: overdue ? 700 : 400 }}>
                    {d.expectedCompletionDate ? fmtDate(d.expectedCompletionDate) : '-'}
                  </td>

                  {/* 분야/명 */}
                  <td style={{ padding: '7px 12px', verticalAlign: 'middle', minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {cat && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 600, padding: '1px 7px', borderRadius: 4, background: cat.color + '18', color: cat.color, whiteSpace: 'nowrap' }}>
                          {cat.name}
                        </span>
                      )}
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0a2540' }}>{d.title}</span>
                      {d.recurrenceCount ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', color: '#be1044', fontWeight: 700, background: '#fef0f4', padding: '1px 5px', borderRadius: 4 }}>
                          <i className="fa-solid fa-rotate" />{d.recurrenceCount}회
                        </span>
                      ) : null}
                    </div>
                    {overdue && (
                      <span style={{ display: 'inline-flex', fontSize: '0.6rem', fontWeight: 700, color: COLORS.warning, background: '#FFF7ED', padding: '1px 6px', borderRadius: 4, marginTop: 3 }}>지연</span>
                    )}
                  </td>

                  {/* 사진대지 전/후 */}
                  <td style={{ padding: '7px 12px', verticalAlign: 'middle' }}>
                    <PhotoCompareCell before={latestBefore} after={latestAfter} />
                  </td>

                  {/* 외주업체 */}
                  <td style={{ padding: '7px 12px', verticalAlign: 'middle', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>
                    {vendor ? (
                      <span style={{ color: '#0a2540', fontWeight: 500 }}>{vendor.name}</span>
                    ) : (
                      <span style={{ color: '#b0bac6' }}>자체처리</span>
                    )}
                  </td>

                  {/* 처리비용 — 확정비용(finalCost)이 있으면 그 값을, 없으면 예상비용을 costStatus 배지와 함께 표시. 0원도 값으로 표시한다. */}
                  <td style={{ padding: '7px 12px', verticalAlign: 'middle', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                    {(() => {
                      const { amount } = getDisplayCost(d)
                      if (amount == null) return null
                      const cs = getCostStatus(d)
                      const meta = cs ? COST_STATUS_META[cs] : null
                      return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          {meta && (
                            <span style={{ fontSize: '0.64rem', fontWeight: 700, color: meta.color, background: meta.bg, padding: '1px 6px', borderRadius: 4 }}>{meta.label}</span>
                          )}
                          <span style={{ color: '#0a2540', fontWeight: 600 }}>{fmtCost(amount)}</span>
                        </span>
                      )
                    })()}
                  </td>

                  {/* 결제증빙/수단 */}
                  <td style={{ padding: '7px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                    {paymentBadge && (
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 700,
                          padding: '2px 8px', borderRadius: 5,
                          background: PAYMENT_TONE_STYLE[paymentBadge.tone].bg,
                          color: PAYMENT_TONE_STYLE[paymentBadge.tone].color,
                        }}
                      >
                        {paymentBadge.icon} {paymentBadge.label}
                      </span>
                    )}
                  </td>

                  {/* 상태 */}
                  <td style={{ padding: '7px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                    <StatusBadge status={d.status} />
                  </td>

                  {/* 위치 */}
                  <td style={{ padding: '7px 12px', verticalAlign: 'middle', fontSize: '0.73rem', color: '#697386' }}>
                    {d.locationText || '-'}
                  </td>

                  {/* 작업 */}
                  <td style={{ padding: '7px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                    {canSeeDeleted && showDeleted ? (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          if (confirm(`'${d.title}' 하자를 복구하시겠습니까?`)) onRestore(d.id)
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #cde5d6', background: '#f0fdf4', color: '#16A34A', fontFamily: 'inherit' }}
                      >
                        <i className="fa-solid fa-rotate-left" /> 복구
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/defects/${d.id}`) }}
                        title="상세보기"
                        style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e3e8ef', background: '#fff', cursor: 'pointer', color: '#697386', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <i className="fa-solid fa-chevron-right" style={{ fontSize: '0.62rem' }} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
