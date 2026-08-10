import type { GeneratedReport, ReportSection } from '@/lib/aiReportService'

function safeColor(c: string | undefined, fallback: string): string {
  return c && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback
}

// 만원/억원 단위로 반올림하면 확정 금액과 어긋나 보이므로 원 단위 실금액을 그대로 표기한다.
function fmtKRW(v: number): string {
  if (v > 0) return `${v.toLocaleString()}원`
  return '-'
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const SLIDE_HEADER_COLORS = ['#1e3a5f', '#9f1239', '#3730a3', '#065f46', '#78350f']

function renderSection(section: ReportSection): string {
  if (section.type === 'kpi-grid' && section.kpiItems) {
    return `<div class="rpt-kpi-row">${section.kpiItems.map(item => `
      <div class="rpt-kpi" style="border-left:3px solid ${safeColor(item.color, '#635bff')}">
        <div class="rpt-kpi-lbl">${esc(item.label)}</div>
        <div class="rpt-kpi-v">${esc(item.value)}</div>
        ${item.sub ? `<div class="rpt-kpi-u">${esc(item.sub)}</div>` : ''}
      </div>`).join('')}</div>`
  }
  if (section.type === 'bar-list' && section.barItems) {
    return `<div>${section.barItems.map(item => `
      <div class="rpt-barlist-row">
        <div class="rpt-barlist-top">
          <span class="rpt-barlist-lbl">${esc(item.label)}</span>
          <span class="rpt-barlist-val">${item.sub ? `<span class="rpt-barlist-sub">${esc(item.sub)}</span>` : ''}${item.value >= 10000 ? esc(fmtKRW(item.value)) : `${item.value}건`}</span>
        </div>
        <div class="rpt-barlist-track"><div class="rpt-barlist-bar" style="width:${item.pct}%;background:${safeColor(item.color, '#635bff')}"></div></div>
      </div>`).join('')}</div>`
  }
  if (section.type === 'table' && section.tableHeaders && section.tableRows) {
    return `<table class="rpt-tbl">
      <thead><tr>${section.tableHeaders.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${section.tableRows.map(row => `<tr${row.highlight ? ' style="background:rgba(99,91,255,.05)"' : ''}>${row.cells.map((c, ci) => `<td${row.highlight && ci === 0 ? ' style="color:#635bff;font-weight:700"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`
  }
  if (section.type === 'slide-deck' && section.slides) {
    return section.slides.map(slide => {
      const hdrColor = SLIDE_HEADER_COLORS[slide.slideNumber - 1] ?? '#0a2540'
      return `<div class="rpt-slide">
        <div class="rpt-slide-hd" style="background:${hdrColor}">
          <span>${slide.slideNumber}. ${esc(slide.slideTitle)}</span>
          ${slide.note ? `<span class="rpt-slide-note">${esc(slide.note)}</span>` : ''}
        </div>
        <div class="rpt-slide-grid">${slide.items.map(item => `
          <div class="rpt-slide-item">
            <span>${esc(item.label)}</span>
            <span${item.accent ? ` style="color:${hdrColor};font-weight:700"` : ''}>${esc(item.value)}</span>
          </div>`).join('')}</div>
      </div>`
    }).join('')
  }
  return ''
}

export function buildReportPrintHTML(report: GeneratedReport): string {
  const sectionsHtml = report.sections.map(section => `
    <div class="rpt-sec">
      <div class="rpt-sec-h">${esc(section.title)}</div>
      ${renderSection(section)}
    </div>`).join('')

  const actionGroups: { label: string; color: string; items: string[] }[] = [
    { label: '즉시 조치 필요', color: '#be1044', items: report.actionPlan.immediateActions },
    { label: '비용 / 결제 리스크', color: '#B06B1A', items: report.actionPlan.costRisk },
    { label: '반복 발생 경고', color: '#635bff', items: report.actionPlan.recurringWarning },
    { label: '관리자 결재 필요', color: '#0F7850', items: report.actionPlan.approvalNeeded },
  ].filter(g => g.items.length > 0)
  // actionPlan을 통째로 비워서(모든 배열 length:0) "AI Insight/Action Plan" 섹션을 선택적으로 끄는
  // 화면(app/reports/page.tsx)이 있으므로, 내용이 전혀 없을 때는 빈 제목만 남는 섹션을 아예 생략한다.
  // headline이 항상 채워지는 기존 6개 리포트 타입(/reports/ai)의 출력은 이 가드로 바뀌지 않는다.
  const hasActionPlanContent = report.actionPlan.headline.length > 0 || actionGroups.length > 0
  const actionPlanHtml = hasActionPlanContent ? `
    <div class="rpt-sec rpt-action">
      <div class="rpt-sec-h">AI 종합 의견</div>
      <div>${report.actionPlan.headline.map(line => `<div class="rpt-action-headline">• ${esc(line)}</div>`).join('')}</div>
      ${actionGroups.map(g => `
        <div class="rpt-action-group">
          <div class="rpt-action-group-h" style="color:${g.color}">${g.label}</div>
          ${g.items.map(t => `<div class="rpt-action-item">· ${esc(t)}</div>`).join('')}
        </div>`).join('')}
    </div>` : ''

  return `<div class="rpt-a4">
    <div class="rpt-hd">
      <div class="rpt-hd-left">
        <div class="rpt-title">${esc(report.title)}</div>
        <div class="rpt-org">${esc(report.subtitle)}</div>
      </div>
      <div class="rpt-hd-right">
        <div class="rpt-hd-meta"><strong>기간</strong>&nbsp;${esc(report.period)}</div>
        <div class="rpt-hd-meta"><strong>생성일</strong>&nbsp;${esc(report.generatedAt)}</div>
        <div class="rpt-hd-meta"><strong>작성자</strong>&nbsp;${esc(report.preparedBy)}</div>
      </div>
    </div>
    <hr class="rpt-rule">
    ${sectionsHtml}
    ${actionPlanHtml}
    <div class="rpt-sec">
      <div class="rpt-hd-meta">분석 대상: <strong>${report.metadata.totalDefects}건</strong> &nbsp;|&nbsp; 처리 완료율: <strong>${report.metadata.completionRate}%</strong> &nbsp;|&nbsp; 총 처리 비용: <strong>${esc(fmtKRW(report.metadata.totalCost))}</strong></div>
    </div>
    <div class="rpt-footer">대전충청검사센터 시설관리팀&nbsp;|&nbsp;AI 보고서&nbsp;|&nbsp;생성: ${esc(report.generatedAt)}</div>
  </div>`
}

export function fmtReportFilename(report: GeneratedReport, ext: string): string {
  const titlePart = report.title.replace(/\s+/g, '_')
  return `${titlePart}_${report.periodFilenameSuffix}.${ext}`
}
