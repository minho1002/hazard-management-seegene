'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import {
  generateReport,
  type GeneratedReport,
  type ReportType,
  type ReportSection,
  type ReportPeriod,
  type ReportPeriodType,
} from '@/lib/aiReportService'
import { COLORS, STANDARD_PERIOD_OPTIONS, computeStandardPeriod } from '@/lib/designTokens'
import { downloadReportPDF } from '@/lib/reportExportPdf'
import { downloadReportExcel } from '@/lib/reportExportExcel'
import { downloadReportWord } from '@/lib/reportExportWord'
import { ReportToast, type ToastMessage } from '@/components/common/ReportToast'

// ── Helpers ────────────────────────────────────────────────────────────────

// 만/억 단위로 반올림하면 확정 금액과 어긋나 보이므로 원 단위 실금액을 그대로 표기한다.
const fmtKRW = (v: number) => v > 0 ? `${v.toLocaleString()}원` : '-'

// ── Report type configs ────────────────────────────────────────────────────

const REPORT_TYPES: {
  type: ReportType; icon: string; title: string; desc: string
  features: string[]; color: string; bg: string; border: string
}[] = [
  {
    type: 'field-analysis',
    icon: 'fa-solid fa-chart-bar',
    title: '분야별 분석 보고서',
    desc: '카테고리별 하자 현황·빈도·비용 분석',
    features: ['분야별 발생 빈도 분석', '처리 현황 및 완료율', '재발 위험 분야 도출', 'AI 분야별 개선 제언'],
    color: '#635bff', bg: 'rgba(99,91,255,.07)', border: 'rgba(99,91,255,.25)',
  },
  {
    type: 'budget-settlement',
    icon: 'fa-solid fa-coins',
    title: '예산 정산 보고서',
    desc: '비용 집행 현황·AI 예측 정확도·월별 추이',
    features: ['총 처리 비용 집계', '분야별 예산 집행', 'AI 예측 vs 실제 오차', '연간 예산 추정'],
    color: '#059669', bg: 'rgba(5,150,105,.07)', border: 'rgba(5,150,105,.25)',
  },
  {
    type: 'executive-ppt',
    icon: 'fa-solid fa-file-powerpoint',
    title: '경영진 보고용 PT',
    desc: '시설 건강도·위험 요소·예산·권고사항 5장',
    features: ['시설 건강도 점수', '주요 위험 현황', '예산 집행 요약', '향후 계획 및 권고사항'],
    color: '#d97706', bg: 'rgba(217,119,6,.07)', border: 'rgba(217,119,6,.25)',
  },
  {
    type: 'recurring-defects',
    icon: 'fa-solid fa-rotate',
    title: '반복 하자 보고서',
    desc: '반복 발생 하자 현황·근본원인 재점검 권고',
    features: ['반복 확정/의심 건수', '반복 관련 누적 비용', '반복 하자 목록', '재점검 권고사항'],
    color: '#be1044', bg: 'rgba(190,16,68,.07)', border: 'rgba(190,16,68,.25)',
  },
  {
    type: 'cost-bearer',
    icon: 'fa-solid fa-scale-balanced',
    title: '비용 부담 주체별 보고서',
    desc: '시공사·재단·외주업체 부담 예상 금액·미정 현황',
    features: ['주체별 건수·금액 집계', '비용 부담 미정 건수', '주체별 상세 테이블', '확정 필요 항목 권고'],
    color: '#0d9167', bg: 'rgba(13,145,103,.07)', border: 'rgba(13,145,103,.25)',
  },
  {
    type: 'defect-classification',
    icon: 'fa-solid fa-code-compare',
    title: '하자사항/일반사항 구분 보고서',
    desc: '귀책 구분 현황 및 관리자 검토 필요 항목',
    features: ['하자구분 비율', '시공사 귀책 가능 목록', '재단 부담 예상 목록', '외주업체 확인 필요 목록'],
    color: '#635bff', bg: 'rgba(99,91,255,.07)', border: 'rgba(99,91,255,.25)',
  },
]

const SLIDE_HEADER_COLORS = ['#1e3a5f', '#9f1239', '#3730a3', '#065f46', '#78350f']

// ── Section renderer ───────────────────────────────────────────────────────

function SectionRenderer({ section }: { section: ReportSection }) {
  if (section.type === 'kpi-grid' && section.kpiItems) {
    const cols = Math.min(section.kpiItems.length, 4)
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
        {section.kpiItems.map((item, i) => (
          <div key={i} style={{ padding: '12px 14px', background: '#fafafa', borderRadius: 10, border: '1px solid #eef0f4', borderLeft: `3px solid ${item.color ?? '#635bff'}` }}>
            <div style={{ fontSize: '0.67rem', color: '#697386', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>{item.value}</div>
            {item.sub && <div style={{ fontSize: '0.63rem', color: '#697386', marginTop: 3 }}>{item.sub}</div>}
          </div>
        ))}
      </div>
    )
  }

  if (section.type === 'bar-list' && section.barItems) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {section.barItems.map((item, i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: '0.78rem', color: '#0a2540', fontWeight: 500 }}>{item.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {item.sub && <span style={{ fontSize: '0.68rem', color: '#697386' }}>{item.sub}</span>}
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#425466' }}>
                  {item.value >= 10000 ? fmtKRW(item.value) : `${item.value}건`}
                </span>
              </div>
            </div>
            <div style={{ height: 7, background: '#f0f4f8', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${item.pct}%`, background: item.color ?? '#635bff', borderRadius: 999, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (section.type === 'table' && section.tableHeaders && section.tableRows) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {section.tableHeaders.map((h, i) => (
                <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#425466', borderBottom: '1px solid #e3e8ef', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.tableRows.map((row, ri) => (
              <tr key={ri} style={{ background: row.highlight ? 'rgba(99,91,255,.04)' : ri % 2 === 0 ? '#fff' : '#fafbfc' }}>
                {row.cells.map((cell, ci) => (
                  <td key={ci} style={{ padding: '7px 12px', color: row.highlight && ci === 0 ? '#635bff' : '#0a2540', fontWeight: row.highlight && ci === 0 ? 700 : 400, borderBottom: '1px solid #f0f4f8' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (section.type === 'slide-deck' && section.slides) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {section.slides.map(slide => {
          const hdrColor = SLIDE_HEADER_COLORS[slide.slideNumber - 1] ?? '#0a2540'
          return (
            <div key={slide.slideNumber} style={{ border: '1px solid #e3e8ef', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 6px rgba(10,37,64,.06)' }}>
              <div style={{ background: hdrColor, padding: '13px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#fff' }}>{slide.slideNumber}</span>
                  </div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>{slide.slideTitle}</span>
                </div>
                {slide.note && (
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,.9)', background: 'rgba(255,255,255,.18)', padding: '3px 9px', borderRadius: 99, fontWeight: 600 }}>{slide.note}</span>
                )}
              </div>
              <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                {slide.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f4f8' }}>
                    <span style={{ fontSize: '0.73rem', color: '#697386' }}>{item.label}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: item.accent ? hdrColor : '#0a2540' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return null
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AiReportPage() {
  const { state } = useStore()
  const [selectedType, setSelectedType] = useState<ReportType | null>(null)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<GeneratedReport | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [wordLoading, setWordLoading] = useState(false)
  const [excelLoading, setExcelLoading] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  // Dashboard/운영현황/보고서와 동일한 6종(오늘/이번주/이번달/올해/사용자지정/전체기간) + 공용 계산 함수.
  const [periodType, setPeriodType] = useState<ReportPeriodType>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [reportPeriodKey, setReportPeriodKey] = useState<string | null>(null)

  const period: ReportPeriod = { type: periodType, ...computeStandardPeriod(periodType, customFrom || null, customTo || null) }
  const periodKeyNow = JSON.stringify({ type: period.type, from: period.from, to: period.to })
  const isPeriodValid = periodType === 'custom' ? (!!customFrom && !!customTo && customFrom <= customTo) : true
  const periodStale = report !== null && reportPeriodKey !== null && reportPeriodKey !== periodKeyNow

  const inputStyle: React.CSSProperties = { padding: '7px 10px', borderRadius: 7, border: '1px solid #e3e8ef', outline: 'none', fontSize: '0.8rem', fontFamily: 'inherit' }

  const isEmptyReport = report ? report.metadata.totalDefects === 0 : false

  const selectedCfg = REPORT_TYPES.find(r => r.type === selectedType)

  async function handleGenerate() {
    if (!selectedType || !isPeriodValid) return
    setLoading(true)
    setReport(null)
    try {
      const result = await generateReport(selectedType, {
        defects: state.defects.filter(d => !d.deletedAt),
        categories: state.categories,
        vendors: state.vendors,
        files: state.files,
        floorPlans: state.floorPlans,
        period,
      })
      setReport(result)
      setReportPeriodKey(periodKeyNow)
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadPDF() {
    if (!report) return
    setPdfLoading(true)
    try {
      await downloadReportPDF(report)
      setToast({ type: 'success', text: 'PDF 다운로드가 완료되었습니다.' })
    } catch (err) {
      console.error(err)
      setToast({ type: 'error', text: 'PDF 생성 중 오류가 발생했습니다.' })
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleDownloadExcel() {
    if (!report) return
    setExcelLoading(true)
    try {
      await downloadReportExcel(report)
      setToast({ type: 'success', text: 'Excel 다운로드가 완료되었습니다.' })
    } catch (err) {
      console.error(err)
      setToast({ type: 'error', text: 'Excel 생성 중 오류가 발생했습니다.' })
    } finally {
      setExcelLoading(false)
    }
  }

  async function handleDownloadWord() {
    if (!report) return
    setWordLoading(true)
    try {
      await downloadReportWord(report)
      setToast({ type: 'success', text: 'Word 다운로드가 완료되었습니다.' })
    } catch (err) {
      console.error(err)
      setToast({ type: 'error', text: 'Word 생성 중 오류가 발생했습니다.' })
    } finally {
      setWordLoading(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <style>{`
        @media print {
          .app-sidenav, .app-rolebanner, .no-print { display: none !important; }
          body { background: #fff !important; }
          .rpt-print-area { padding: 0 !important; max-width: none !important; margin: 0 !important; }
        }
      `}</style>

      {/* ── Sticky header ── */}
      <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid #e3e8ef', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/reports" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.73rem', color: '#697386', textDecoration: 'none' }}>
            <i className="fa-solid fa-arrow-left" style={{ fontSize: 10 }} />보고서
          </Link>
          <span style={{ color: '#d0d5dd', fontSize: '0.8rem' }}>/</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#635bff,#8b85ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#fff', fontSize: 11 }} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0a2540' }}>AI 보고서 생성</span>
          </div>
        </div>
        <span style={{ fontSize: '0.67rem', color: '#697386', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#635bff', display: 'inline-block' }} />
          Rule-Based 분석 · LLM 교체 가능 아키텍처
        </span>
      </div>

      <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>

        {/* ── Period settings ── */}
        <div className="no-print" style={{ marginBottom: 22 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#425466', marginBottom: 11 }}>보고기간 설정</div>
          <div style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: 14, padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {STANDARD_PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setPeriodType(opt.key)}
                  style={{
                    padding: '7px 16px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                    border: periodType === opt.key ? '1.5px solid #635bff' : '1.5px solid #e3e8ef',
                    background: periodType === opt.key ? '#635bff' : '#fff',
                    color: periodType === opt.key ? '#fff' : '#425466',
                    fontFamily: 'inherit',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {periodType === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={inputStyle} />
                <span style={{ color: '#b0bac6' }}>~</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={inputStyle} />
              </div>
            )}
          </div>
        </div>

        {/* ── Report type selection ── */}
        <div className="no-print" style={{ marginBottom: 22 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#425466', marginBottom: 11 }}>보고서 유형 선택</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            {REPORT_TYPES.map(rt => {
              const active = selectedType === rt.type
              return (
                <button
                  key={rt.type}
                  onClick={() => { setSelectedType(rt.type); setReport(null) }}
                  style={{
                    padding: '18px 20px', textAlign: 'left', cursor: 'pointer',
                    background: active ? rt.bg : '#fff',
                    border: `2px solid ${active ? rt.color : '#e3e8ef'}`,
                    borderRadius: 14,
                    boxShadow: active ? `0 0 0 3px ${rt.bg}` : '0 1px 3px rgba(10,37,64,.06)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: active ? rt.color : '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className={rt.icon} style={{ color: active ? '#fff' : '#697386', fontSize: 14 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540' }}>{rt.title}</div>
                      <div style={{ fontSize: '0.66rem', color: '#697386', marginTop: 2 }}>{rt.desc}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {rt.features.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: active ? rt.color : '#d0d5dd', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.69rem', color: '#697386' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Generate button ── */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button
            onClick={handleGenerate}
            disabled={!selectedType || !isPeriodValid || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 26px',
              background: selectedType && isPeriodValid && !loading ? (selectedCfg?.color ?? '#635bff') : '#e3e8ef',
              color: selectedType && isPeriodValid && !loading ? '#fff' : '#aab',
              border: 'none', borderRadius: 10,
              fontSize: '0.82rem', fontWeight: 700,
              cursor: selectedType && isPeriodValid && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
            <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`} style={{ fontSize: 13 }} />
            {loading ? '보고서 생성 중...' : '보고서 생성하기'}
          </button>
          {(!selectedType || !isPeriodValid) && !loading && (
            <span style={{ fontSize: '0.72rem', color: '#aab' }}>보고기간과 보고서 유형을 선택해 주세요.</span>
          )}
          {report && !loading && !periodStale && (
            <span style={{ fontSize: '0.72rem', color: '#059669' }}>
              <i className="fa-solid fa-circle-check" style={{ marginRight: 5 }} />
              생성 완료 — {report.generatedAt}
            </span>
          )}
          {periodStale && !loading && (
            <span style={{ fontSize: '0.72rem', color: '#d97706', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="fa-solid fa-triangle-exclamation" />
              기간이 변경되었습니다 — 보고서를 다시 생성해주세요.
            </span>
          )}
        </div>

        {/* ── Loading state ── */}
        {loading && (
          <div className="no-print" style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(99,91,255,.2)', padding: '36px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(99,91,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <i className="fa-solid fa-wand-magic-sparkles fa-beat" style={{ color: '#635bff', fontSize: 20 }} />
            </div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0a2540' }}>AI 보고서를 생성하고 있습니다...</div>
            <div style={{ fontSize: '0.72rem', color: '#697386' }}>데이터를 분석하고 인사이트를 도출하는 중</div>
          </div>
        )}

        {/* ── Report preview ── */}
        {report && !loading && (
          <div className="rpt-print-area">

            {/* Report header card */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e3e8ef', padding: '20px 24px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: selectedCfg?.color ?? '#635bff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className={selectedCfg?.icon ?? 'fa-solid fa-file'} style={{ color: '#fff', fontSize: 12 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0a2540' }}>{report.title}</div>
                    <div style={{ fontSize: '0.71rem', color: '#697386' }}>{report.subtitle}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: '#f0f4f8', borderRadius: 99, color: '#425466' }}>
                    {report.periodType === 'today' ? '기준일' : '기준기간'}: {report.period}
                  </span>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: '#f0f4f8', borderRadius: 99, color: '#425466' }}>생성: {report.generatedAt}</span>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: '#f0f4f8', borderRadius: 99, color: '#425466' }}>작성자: {report.preparedBy}</span>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: 'rgba(5,150,105,.1)', borderRadius: 99, color: '#059669', fontWeight: 600 }}>집계 기준: {report.aggBasis}</span>
                  <span style={{ fontSize: '0.67rem', padding: '2px 8px', background: 'rgba(99,91,255,.1)', borderRadius: 99, color: '#635bff', fontWeight: 600 }}>
                    ✨ {report.basedOn === 'rule-based' ? 'Rule-Based AI' : 'LLM 분석'}
                  </span>
                </div>
              </div>

              {/* Download & print actions */}
              <div className="no-print" style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                <button
                  onClick={handleDownloadPDF}
                  disabled={pdfLoading || isEmptyReport}
                  title={isEmptyReport ? '데이터가 없어 다운로드할 파일이 없습니다.' : 'PDF 다운로드'}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: (pdfLoading || isEmptyReport) ? 'not-allowed' : 'pointer', fontSize: '0.71rem', color: '#425466', opacity: (pdfLoading || isEmptyReport) ? 0.6 : 1 }}
                >
                  <i className={pdfLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-pdf'} style={{ color: '#e11d48', fontSize: 13 }} />
                  PDF
                </button>
                <button
                  onClick={handleDownloadExcel}
                  disabled={excelLoading || isEmptyReport}
                  title={isEmptyReport ? '데이터가 없어 다운로드할 파일이 없습니다.' : 'Excel 다운로드'}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: (excelLoading || isEmptyReport) ? 'not-allowed' : 'pointer', fontSize: '0.71rem', color: '#425466', opacity: (excelLoading || isEmptyReport) ? 0.6 : 1 }}
                >
                  <i className={excelLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-excel'} style={{ color: '#059669', fontSize: 13 }} />
                  Excel
                </button>
                <button
                  onClick={handleDownloadWord}
                  disabled={wordLoading || isEmptyReport}
                  title={isEmptyReport ? '데이터가 없어 다운로드할 파일이 없습니다.' : 'Word 다운로드'}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: (wordLoading || isEmptyReport) ? 'not-allowed' : 'pointer', fontSize: '0.71rem', color: '#425466', opacity: (wordLoading || isEmptyReport) ? 0.6 : 1 }}
                >
                  <i className={wordLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-word'} style={{ color: '#2563eb', fontSize: 13 }} />
                  Word
                </button>
                <button
                  onClick={handlePrint}
                  title="인쇄"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f8fafc', border: '1px solid #e3e8ef', borderRadius: 8, cursor: 'pointer', fontSize: '0.71rem', color: '#425466' }}
                >
                  <i className="fa-solid fa-print" style={{ color: '#0d1f35', fontSize: 13 }} />
                  인쇄
                </button>
              </div>
            </div>

            {isEmptyReport ? (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e3e8ef', padding: '40px 24px', textAlign: 'center', color: '#697386', fontSize: '0.85rem' }}>
                <i className="fa-solid fa-inbox" style={{ fontSize: 28, color: '#d0d5dd', marginBottom: 10, display: 'block' }} />
                선택한 기간에 해당하는 하자 데이터가 없습니다.
              </div>
            ) : (
              <>
                {/* Content sections */}
                {report.sections.map(section => (
                  <div key={section.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e3e8ef', padding: '18px 24px', marginBottom: 14 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f0f4f8' }}>
                      {section.title}
                    </div>
                    <SectionRenderer section={section} />
                  </div>
                ))}

                {/* AI 종합 의견 */}
                <div style={{ background: 'linear-gradient(135deg,rgba(99,91,255,.08),rgba(99,91,255,.03))', borderRadius: 14, border: '1px solid rgba(99,91,255,.2)', padding: '20px 24px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#635bff,#8b85ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#fff', fontSize: 12 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0a2540' }}>AI 종합 의견</div>
                      <div style={{ fontSize: '0.66rem', color: '#697386', marginTop: 1 }}>Rule-Based 분석 · LLM API 연동 시 더욱 정교한 분석 제공 가능</div>
                    </div>
                  </div>
                  <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,.75)', borderRadius: 10, border: '1px solid rgba(99,91,255,.12)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      {report.actionPlan.headline.map((line, i) => (
                        <div key={i} style={{ fontSize: '0.82rem', color: '#0a2540', lineHeight: 1.7, marginBottom: 2 }}>• {line}</div>
                      ))}
                    </div>
                    {report.actionPlan.immediateActions.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: COLORS.danger, marginBottom: 4 }}>즉시 조치 필요</div>
                        {report.actionPlan.immediateActions.map((t, i) => <div key={i} style={{ fontSize: '0.76rem', color: '#425466', lineHeight: 1.65 }}>· {t}</div>)}
                      </div>
                    )}
                    {report.actionPlan.costRisk.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#B06B1A', marginBottom: 4 }}>비용 / 결제 리스크</div>
                        {report.actionPlan.costRisk.map((t, i) => <div key={i} style={{ fontSize: '0.76rem', color: '#425466', lineHeight: 1.65 }}>· {t}</div>)}
                      </div>
                    )}
                    {report.actionPlan.recurringWarning.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#635bff', marginBottom: 4 }}>반복 발생 경고</div>
                        {report.actionPlan.recurringWarning.map((t, i) => <div key={i} style={{ fontSize: '0.76rem', color: '#425466', lineHeight: 1.65 }}>· {t}</div>)}
                      </div>
                    )}
                    {report.actionPlan.approvalNeeded.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#0F7850', marginBottom: 4 }}>관리자 결재 필요</div>
                        {report.actionPlan.approvalNeeded.map((t, i) => <div key={i} style={{ fontSize: '0.76rem', color: '#425466', lineHeight: 1.65 }}>· {t}</div>)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Metadata footer */}
                <div style={{ padding: '10px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e3e8ef', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.67rem', color: '#697386' }}>분석 대상: <strong style={{ color: '#425466' }}>{report.metadata.totalDefects}건</strong></span>
                  <span style={{ fontSize: '0.67rem', color: '#697386' }}>처리 완료율: <strong style={{ color: '#425466' }}>{report.metadata.completionRate}%</strong></span>
                  <span style={{ fontSize: '0.67rem', color: '#697386' }}>총 처리 비용: <strong style={{ color: '#425466' }}>{fmtKRW(report.metadata.totalCost)}</strong></span>
                  <span style={{ fontSize: '0.67rem', color: '#697386' }}>분석 방식: <strong style={{ color: '#635bff' }}>Rule-Based (LLM 교체 가능)</strong></span>
                </div>
              </>
            )}

          </div>
        )}
      </div>
      <ReportToast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
