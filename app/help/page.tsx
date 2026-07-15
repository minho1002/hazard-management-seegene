'use client'

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e8ef', borderRadius: 10, boxShadow: '0 1px 3px rgba(10,37,64,0.06)' }

const TOC = [
  { id: 'start', label: '1. 시작하기 (로그인)' },
  { id: 'roles', label: '2. 권한과 역할' },
  { id: 'dashboard', label: '3. 대시보드 보는 법' },
  { id: 'list', label: '4. 하자 목록' },
  { id: 'register', label: '5. 하자 등록하기' },
  { id: 'detail', label: '6. 하자 상세 · 처리하기' },
  { id: 'cost', label: '7. 비용 관리 (예상 · 확정)' },
  { id: 'analytics', label: '8. 집계현황' },
  { id: 'reports', label: '9. 보고서 · AI 보고서' },
  { id: 'ai', label: '10. AI 어시스턴트' },
  { id: 'admin', label: '11. 관리자 전용 기능' },
  { id: 'glossary', label: '12. 용어 사전' },
  { id: 'faq', label: '13. 자주 묻는 질문' },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 12, marginBottom: 32 }}>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0a2540', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #e3e8ef' }}>{title}</h2>
      <div style={{ fontSize: '0.85rem', color: '#425466', lineHeight: 1.8 }}>{children}</div>
    </section>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: '#635bff', color: '#fff', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{n}</span>
      <div>{children}</div>
    </div>
  )
}

function Note({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: React.ReactNode }) {
  const style = tone === 'warn'
    ? { background: '#FFF7ED', border: '1px solid #FED7AA', color: '#B06B1A' }
    : { background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8' }
  return (
    <div style={{ ...style, borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', marginTop: 10, marginBottom: 10, lineHeight: 1.7 }}>
      <i className={`fa-solid ${tone === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-info'}`} style={{ marginRight: 6 }} />
      {children}
    </div>
  )
}

function Term({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div style={{ ...card, padding: '12px 16px', marginBottom: 8 }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#635bff', marginBottom: 4 }}>{term}</div>
      <div style={{ fontSize: '0.8rem', color: '#425466', lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem', fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: 5, marginRight: 6, whiteSpace: 'nowrap' as const }}>{children}</span>
}

export default function HelpPage() {
  return (
    // 페이지 전체를 뷰포트 높이에 고정하고(위쪽 RoleBanner 높이만큼 빼줌), 제목/목차는
    // 고정된 채로 두고 오른쪽 본문 영역 하나만 자체 스크롤되도록 한다 — 문서 전체 스크롤에
    // 기대는 방식(sticky/fixed)은 <main>의 overflowX:hidden 때문에 어긋나는 문제가 있었다.
    <div style={{ height: 'calc(100vh - 41px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 32px 16px', borderBottom: '1px solid #e3e8ef', background: '#fff', flexShrink: 0 }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0a2540' }}>사용자 가이드</h1>
        <div style={{ fontSize: '0.72rem', color: '#697386', marginTop: 2 }}>하자관리시스템을 처음 사용하시는 분도 쉽게 따라할 수 있도록 정리했습니다.</div>
      </div>

      <div style={{ display: 'flex', gap: 24, padding: '24px 32px', flex: 1, minHeight: 0 }}>
        {/* TOC — 고정. 클릭하면 오른쪽 본문 영역만 스크롤된다. */}
        <nav style={{ ...card, width: 220, flexShrink: 0, padding: '14px 8px', alignSelf: 'flex-start', maxHeight: '100%', overflowY: 'auto', display: 'none' }} className="help-toc">
          {TOC.map(t => (
            <a key={t.id} href={`#${t.id}`} style={{ display: 'block', padding: '6px 10px', fontSize: '0.76rem', color: '#425466', textDecoration: 'none', borderRadius: 6 }}>{t.label}</a>
          ))}
        </nav>

        {/* Content — 이 영역만 자체적으로 스크롤된다 */}
        <div className="help-content" style={{ flex: 1, minWidth: 0, maxWidth: 860, height: '100%', overflowY: 'auto', paddingRight: 4 }}>

          <div style={{ background: '#0a2540', color: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 28 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>하자관리시스템이란?</div>
            <div style={{ fontSize: '0.82rem', color: '#B4C1D9', lineHeight: 1.8 }}>
              대전충청검사센터 시설에서 발생하는 누수·전기·HVAC·균열·배수 등 각종 하자를 등록하고,
              처리 상태·업체 방문·비용·결제까지 한 화면에서 관리하는 시스템입니다. 이 가이드 하나만 읽어도
              하자 등록부터 최종 완료 처리까지 전체 흐름을 따라할 수 있도록 구성했습니다.
            </div>
          </div>

          <Section id="start" title="1. 시작하기 (로그인)">
            <Step n={1}>주소창에 접속 주소를 입력하고 로그인 화면으로 이동합니다.</Step>
            <Step n={2}>발급받은 아이디와 비밀번호를 입력하고 <b>로그인</b> 버튼을 누릅니다.</Step>
            <Step n={3}>로그인이 되면 왼쪽 사이드바 맨 아래에 내 이름과 역할(조회자 / 실무자 / 관리자)이 표시됩니다. 화면에 보이는 메뉴와 버튼은 이 역할에 따라 달라집니다.</Step>
            <Note>계정이 없거나 비밀번호를 잊어버렸다면 화면 하단의 로그인 폼이 아니라 <b>시스템 관리자</b>에게 문의하세요. 계정 발급·초기화는 관리자만 할 수 있습니다.</Note>
          </Section>

          <Section id="roles" title="2. 권한과 역할">
            <p style={{ marginBottom: 10 }}>시스템은 3단계 권한으로 나뉩니다. 내가 어떤 역할인지 모르겠다면 사이드바 맨 아래 내 이름 옆에 표시된 역할을 확인하세요.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#fafbfc' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', border: '1px solid #e3e8ef' }}>역할</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', border: '1px solid #e3e8ef' }}>할 수 있는 일</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', border: '1px solid #e3e8ef' }}>할 수 없는 일</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px 12px', border: '1px solid #e3e8ef', fontWeight: 700 }}>조회자</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e3e8ef' }}>모든 하자·집계현황·보고서 조회</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e3e8ef', color: '#697386' }}>등록·수정·상태변경·삭제 불가</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 12px', border: '1px solid #e3e8ef', fontWeight: 700 }}>실무자</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e3e8ef' }}>하자 등록, <b>본인이 담당인 하자</b>의 수정·상태변경·비용입력·사진첨부</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e3e8ef', color: '#697386' }}>최종완료 승인, 삭제, 반복하자 확정, 관리자 설정 메뉴 접근 불가</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 12px', border: '1px solid #e3e8ef', fontWeight: 700 }}>관리자</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e3e8ef' }}>모든 기능 (등록·수정·삭제·최종승인·사용자/권한 관리 등)</td>
                    <td style={{ padding: '8px 12px', border: '1px solid #e3e8ef', color: '#697386' }}>제한 없음</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="dashboard" title="3. 대시보드 보는 법">
            <p style={{ marginBottom: 10 }}>로그인 후 가장 먼저 보이는 화면입니다. <b>"오늘 무엇을 처리해야 하는지"</b>를 한눈에 파악하는 용도입니다.</p>
            <ul style={{ paddingLeft: 18, marginBottom: 10 }}>
              <li><b>조회기간 선택</b> — 오늘 / 이번 주 / 이번 달(기본값) / 올해 / 사용자 지정 / 전체 기간 중에서 고를 수 있고, 하자 발생일 기준으로 집계됩니다.</li>
              <li><b>카테고리 탭</b> — 누수·전기·HVAC 등 카테고리별로 필터링해서 볼 수 있습니다.</li>
              <li><b>미완결 현황</b> — 진행 중 / 조치 예정 / 지연 / 재점검 필요 4가지 상태와, 이를 중복 없이 합친 <b>미완결 합계</b>를 보여줍니다. 각 카드를 클릭하면 해당 조건의 하자 목록으로 바로 이동합니다.</li>
              <li><b>{'💰 집행 비용'}</b> — 조회기간 내 <b>확정비용</b>(실제로 얼마 들었는지 확정된 금액)과 <b>예상(미확정)비용</b>(아직 확정 전, 등록 시 입력한 견적)을 구분해서 보여줍니다.</li>
              <li><b>달력</b> — 하자 발생일(🔴) · 조치 완료일(✅) · 조치 지연일(⚠️) 세 가지만 표시해 실무에서 매일 확인할 핵심 일정만 남겼습니다.</li>
              <li><b>오늘 우선처리 Top 3</b> — 심각도·재발 여부를 기준으로 가장 먼저 처리해야 할 3건을 추천합니다.</li>
            </ul>
            <Note>화면 우측 상단의 <b>초기화</b> 버튼은 조회기간·카테고리 선택만 기본값으로 되돌립니다. 등록된 하자 데이터는 절대 지워지지 않습니다.</Note>
          </Section>

          <Section id="list" title="4. 하자 목록">
            <p style={{ marginBottom: 10 }}>등록된 모든 하자를 표로 확인하고 검색·필터링하는 화면입니다.</p>
            <ul style={{ paddingLeft: 18, marginBottom: 10 }}>
              <li><b>퀵필터 칩</b> (오늘 우선처리 / 긴급만 / 지연만 / 반복만 / 재점검 필요 / 조치후 사진 미첨부 / 확인 필요 / 비용부담 미정) — 자주 쓰는 조건을 버튼 하나로 필터링합니다.</li>
              <li><b>AI 검색</b> — "지난달 누수 하자"처럼 자연어로 검색할 수 있습니다.</li>
              <li><b>처리비용 컬럼</b> — 아직 확정 전이면 <Badge color="#B06B1A" bg="#FFF7ED">예상</Badge>, 확정되었으면 <Badge color="#0F7850" bg="#F0FDF4">확정</Badge> 배지와 함께 금액이 표시됩니다. (자세한 내용은 7장 "비용 관리" 참고)</li>
              <li><b>결제증빙/수단</b> — 결제 수단(법인카드·계좌이체·세금계산서)과 견적서·작업확인서 첨부 여부를 보여줍니다. 비용 정보(예상이든 확정이든)가 있어야 표시됩니다.</li>
              <li>행을 클릭하면 해당 하자의 상세 화면으로 이동합니다.</li>
            </ul>
          </Section>

          <Section id="register" title="5. 하자 등록하기">
            <p style={{ marginBottom: 10 }}>왼쪽 사이드바의 <b>하자 등록</b> 메뉴 또는 목록 화면 우측 상단의 <b>+ 하자 등록</b> 버튼으로 들어갑니다.</p>
            <Step n={1}>하자 발생일, 카테고리(누수/전기/HVAC 등), 심각도, 상태를 입력합니다. 대부분은 선택 입력이라 모르는 항목은 비워둬도 등록됩니다.</Step>
            <Step n={2}>외주업체·담당자·신고자·담당부서 등 정보를 입력합니다.</Step>
            <Step n={3}><b>예상 처리비용</b>에 대략적인 견적 금액을 입력해두면, 나중에 실제 금액이 정해졌을 때(확정비용) 비교해볼 수 있습니다.</Step>
            <Step n={4}>도면을 클릭해 정확한 위치를 지정할 수 있고, 발생 위치를 텍스트로도 적을 수 있습니다.</Step>
            <Step n={5}>제목·상세설명을 입력하면 <b>"하자 구분 및 귀책 판단"</b> 영역의 AI 분석 패널이 자동으로 실행되어 시공사/사용자/제조사 중 어디 책임일 가능성이 높은지 추천해줍니다. <b>AI 추천 적용</b>을 누르면 하자구분·귀책구분 선택란이 자동으로 채워집니다 — 다만 이 단계에서는 아직 확정된 것이 아니라 "제안"일 뿐입니다(최종 확정은 등록 후 상세 화면에서 관리자가 진행).</Step>
            <Step n={6}>사진을 첨부하고 <b>등록</b> 버튼을 누르면 완료됩니다.</Step>
          </Section>

          <Section id="detail" title="6. 하자 상세 · 처리하기">
            <p style={{ marginBottom: 10 }}>목록에서 하자를 클릭하면 상세 화면으로 들어갑니다. 하자 하나의 전체 처리 과정을 여기서 관리합니다.</p>

            <div style={{ ...card, padding: 16, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: '#0a2540', marginBottom: 8, fontSize: '0.85rem' }}>상태 흐름</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, alignItems: 'center', fontSize: '0.78rem' }}>
                <Badge color="#1D4ED8" bg="#EFF6FF">접수</Badge>→
                <Badge color="#1D4ED8" bg="#EFF6FF">검토중</Badge>→
                <Badge color="#1D4ED8" bg="#EFF6FF">담당자 배정</Badge>→
                <Badge color="#F97316" bg="#FFF7ED">진행중</Badge>→
                <Badge color="#16A34A" bg="#F0FDF4">조치완료</Badge>→
                <Badge color="#16A34A" bg="#F0FDF4">최종완료</Badge>
              </div>
              <div style={{ marginTop: 8, fontSize: '0.78rem' }}>
                <Badge color="#F97316" bg="#FFF7ED">재점검 필요</Badge>
                <Badge color="#EAB308" bg="#FEFCE8">보류</Badge>
                <span style={{ color: '#697386' }}>— 필요할 때 언제든 전환 가능한 별도 상태입니다.</span>
              </div>
            </div>

            <ul style={{ paddingLeft: 18, marginBottom: 10 }}>
              <li>상태를 <b>조치완료</b>로 바꿀 때 뜨는 창에서 "실제 비용"을 입력하면, 이 금액이 곧 <b>확정비용</b>이 되어 목록·대시보드 등 모든 화면에 반영됩니다. (입력란은 등록 시 적어둔 예상비용으로 미리 채워지며, 실제 금액에 맞게 수정 후 전환하면 됩니다.)</li>
              <li><b>최종완료</b>는 조치완료 이후 관리자가 마지막으로 승인하는 단계입니다. 실무자는 조치완료까지만 처리하고, 최종완료 승인은 관리자만 할 수 있습니다.</li>
              <li>도면 위치 영역에서 핀을 드래그해 정확한 위치를 다시 지정하거나, 사진을 추가로 첨부할 수 있습니다.</li>
              <li>"이력" 영역에서 점검·조치·재발 등 처리 과정을 기록으로 남길 수 있습니다.</li>
            </ul>

            <div style={{ ...card, padding: 16, marginBottom: 10, borderLeft: '3px solid #635bff' }}>
              <div style={{ fontWeight: 700, color: '#0a2540', marginBottom: 6, fontSize: '0.85rem' }}>"하자 구분 및 귀책 판단" 카드 — 가장 헷갈리는 부분</div>
              <p style={{ marginBottom: 8 }}>이 카드에는 AI 분석 패널과 함께 아래 항목을 고르는 선택란이 있습니다.</p>
              <ul style={{ paddingLeft: 18, marginBottom: 8 }}>
                <li><b>하자 구분</b> — 하자사항 / 일반사항 / 확인 필요</li>
                <li><b>귀책 구분</b> — 시공사 귀책 / 재단·운영측 부담 / 외주업체 부담 / 사용자 과실 / 소모품·노후 / 원인 불명 / 분쟁 가능</li>
                <li><b>비용 부담 주체</b> — 시공사 / 재단 / 외주업체 / 사용자 / 보험·기타 / 미정</li>
              </ul>
              <Note>
                <b>"관리자 최종 확정"</b> 버튼은 <b>비용을 확정하는 기능이 아닙니다.</b> 위 세 가지 — 하자구분 · 귀책구분 · 비용부담주체 —
                같은 <u>분류 정보를 확정</u>하는 버튼입니다. 실제 처리 금액(확정비용)은 이 버튼과 별개로, "조치완료" 전환 시 실제 비용을
                입력하거나 하자 수정 화면에서 확정비용을 직접 입력해야 반영됩니다. (실무자에게는 이 버튼이 "의견 제출"로 표시되며,
                최종 확정 권한은 관리자에게만 있습니다.)
              </Note>
            </div>
          </Section>

          <Section id="cost" title="7. 비용 관리 (예상 · 확정)">
            <p style={{ marginBottom: 10 }}>이 시스템은 비용을 <b>예상비용</b>과 <b>확정비용</b> 두 단계로 나누어 관리합니다. 등록 시점에는 정확한 금액을 모르는 경우가 많기 때문입니다.</p>
            <ul style={{ paddingLeft: 18, marginBottom: 10 }}>
              <li><b>예상비용</b> — 하자 등록 시(또는 수정 화면에서) 입력하는 대략적인 견적 금액. 아직 확정된 것이 아니므로 <Badge color="#B06B1A" bg="#FFF7ED">예상</Badge> 배지로 표시됩니다.</li>
              <li><b>확정비용</b> — 실제로 처리가 끝나고 정해진 최종 금액. "조치완료" 전환 시 실제 비용을 입력하거나, 하자 수정 화면의 "확정 처리비용"에 직접 입력하면 자동으로 확정 상태가 됩니다. 확정되면 목록·대시보드·집계현황·보고서 등 모든 화면이 확정비용을 우선해서 보여줍니다.</li>
              <li><b>차액</b> — 하자 상세 화면에서 확정비용과 예상비용의 차이를 자동으로 계산해 보여줍니다 (확정비용이 더 크면 +, 더 작으면 -).</li>
              <li><b>비용 확정일</b> — 확정비용이 처음 입력된 날짜가 자동으로 기록됩니다.</li>
            </ul>
            <Note>0원도 "값이 입력된 것"으로 정상 처리됩니다 — 무상 수리처럼 비용이 실제로 0원인 경우와, 아직 아무 금액도 입력하지 않은 경우는 다르게 구분해서 표시합니다.</Note>
          </Section>

          <Section id="analytics" title="8. 집계현황">
            <ul style={{ paddingLeft: 18 }}>
              <li>기간·위치·상태·카테고리별로 하자를 집계해서 보여주는 통계 화면입니다.</li>
              <li>상단 KPI에서 누적 확정비용과 누적 예상(미확정)비용을 구분해서 확인할 수 있습니다.</li>
              <li>"카테고리별 비용" 항목은 카테고리마다 확정된 금액과 아직 확정 안 된 예상 금액을 막대그래프로 함께 보여줍니다(진한 색 = 확정, 연한 색 = 예상).</li>
              <li>반복 하자 Top 10, 지연 하자, 고비용 하자 등은 하나의 통합 표에서 탭을 눌러 전환하며 볼 수 있습니다.</li>
            </ul>
          </Section>

          <Section id="reports" title="9. 보고서 · AI 보고서">
            <ul style={{ paddingLeft: 18 }}>
              <li><b>보고서</b> — 기간을 선택하면 A4 요약 보고서를 화면에서 미리보고, Excel(.xlsx) · PDF · Word(.doc) 파일로 내려받을 수 있습니다. 총 비용 중 확정비용과 예상(미확정)비용이 함께 표시됩니다.</li>
              <li><b>AI 보고서</b> — 분야별 분석 · 예산 정산 · 경영진 보고용 · 반복 하자 · 비용 부담 주체별 · 하자구분 보고서 등 목적별 보고서를 자동 생성합니다. 비용은 항상 확정된 금액을 우선 사용하고, 아직 확정 전인 건은 금액 옆에 "(예상)"이라고 표시해 구분합니다.</li>
            </ul>
          </Section>

          <Section id="ai" title="10. AI 어시스턴트">
            <p>등록된 하자 데이터를 바탕으로 궁금한 것을 채팅으로 물어볼 수 있는 화면입니다. 예: "이번 달 누수 하자 몇 건이야?", "가장 비용이 많이 든 하자는?" 같은 질문에 실시간으로 답해줍니다.</p>
          </Section>

          <Section id="admin" title="11. 관리자 전용 기능">
            <p style={{ marginBottom: 10 }}>사이드바 하단 <b>관리자 설정</b> 메뉴는 관리자 역할에게만 보입니다.</p>
            <ul style={{ paddingLeft: 18 }}>
              <li><b>사용자 관리</b> — 계정 생성/수정, 역할(조회자·실무자·관리자) 지정.</li>
              <li><b>권한 관리</b> — 역할별로 실제 가능한 작업 범위를 세부 조정.</li>
              <li><b>AI 하자 기준자료 관리</b> — 시공사별 유무상 구분 기준자료(PDF/Word/Excel)를 업로드해두면, 하자 등록·상세 화면의 AI 분석이 이 자료를 근거로 판단합니다. 같은 이름으로 다시 업로드하면 버전이 올라가고 이전 버전은 자동으로 비활성화됩니다.</li>
              <li><b>로그인 이력</b> — 누가 언제 로그인했는지 기록.</li>
              <li><b>계정 변경 이력</b> — 계정 생성·권한 변경 등 계정 관련 변경 기록.</li>
            </ul>
          </Section>

          <Section id="glossary" title="12. 용어 사전">
            <Term term="관리자 최종 확정">상세 화면의 "하자 구분 및 귀책 판단" 카드에서, 하자구분·귀책구분·비용부담주체 등 <b>분류 정보를 확정</b>하는 버튼입니다. 실제 처리 비용(확정비용)을 정하는 기능이 아닙니다.</Term>
            <Term term="예상비용 / 확정비용">예상비용은 등록 시 입력하는 견적, 확정비용은 실제 처리 후 정해진 최종 금액입니다. 확정비용이 입력되면 모든 화면에서 확정비용을 우선 표시합니다.</Term>
            <Term term="조치완료 / 최종완료">조치완료는 실무자가 현장 조치를 마쳤을 때 전환하는 상태, 최종완료는 그 내용을 관리자가 검토하고 승인해 완전히 종결하는 상태입니다.</Term>
            <Term term="재점검 필요">조치가 완료됐다고 판단했지만 문제가 재발했거나 불충분해 다시 확인이 필요한 상태입니다.</Term>
            <Term term="지연">등록된 예상완료일(또는 심각도별 기본 처리 기한)이 지났는데도 아직 완료되지 않은 하자입니다.</Term>
            <Term term="결제증빙/수단">비용을 어떤 방식(법인카드·계좌이체·세금계산서)으로 결제했는지, 그리고 견적서·작업확인서 같은 증빙 서류를 첨부했는지 여부입니다.</Term>
            <Term term="AI 추천 / AI 재분석">AI가 등록된 기준자료와 과거 유사 사례를 참고해 하자구분·귀책을 추천하는 기능입니다. 어디까지나 "제안"이며, 최종 결정은 관리자가 내립니다.</Term>
            <Term term="재발 / 반복 하자">같은 위치·설비에서 유사한 하자가 다시 발생한 경우입니다. 반복 횟수가 쌓이면 근본 원인 재점검이 필요합니다.</Term>
          </Section>

          <Section id="faq" title="13. 자주 묻는 질문">
            <div style={{ ...card, padding: 16, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Q. 하자 목록에 처리비용이 안 보여요.</div>
              <div>A. 예상비용이나 확정비용 중 하나라도 입력되어 있어야 표시됩니다. 하자 등록 시 예상 처리비용을 입력하지 않았다면 하자 수정 화면에서 나중에 추가할 수 있습니다.</div>
            </div>
            <div style={{ ...card, padding: 16, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Q. 초기화 버튼을 누르면 등록된 하자가 지워지나요?</div>
              <div>A. 아니요. 대시보드의 "초기화" 버튼은 조회기간·카테고리 선택 같은 화면 필터만 기본값으로 되돌립니다. 하자 데이터는 절대 삭제되지 않습니다.</div>
            </div>
            <div style={{ ...card, padding: 16, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Q. "관리자 최종 확정"을 누르면 비용도 확정되나요?</div>
              <div>A. 아니요. 이 버튼은 하자구분·귀책구분·비용부담주체 분류 정보만 확정합니다. 비용을 확정하려면 "조치완료" 전환 시 실제 비용을 입력하거나, 하자 수정 화면에서 확정 처리비용을 직접 입력해야 합니다.</div>
            </div>
            <div style={{ ...card, padding: 16, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Q. 실무자인데 일부 버튼이 안 보이거나 눌러지지 않아요.</div>
              <div>A. 정상입니다. 실무자는 본인이 담당인 하자만 수정할 수 있고, 삭제·최종완료 승인·반복하자 확정 등은 관리자만 가능합니다. 필요하면 관리자에게 요청하세요.</div>
            </div>
            <div style={{ ...card, padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Q. 더 궁금한 점이 있어요.</div>
              <div>A. 사이드바의 "AI 어시스턴트" 메뉴에서 궁금한 내용을 바로 질문하거나, 시스템 관리자에게 문의해주세요.</div>
            </div>
          </Section>

        </div>
      </div>

      <style>{`
        @media (min-width: 1100px) {
          .help-toc { display: block !important; }
        }
      `}</style>
    </div>
  )
}
