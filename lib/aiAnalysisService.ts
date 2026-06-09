export interface AiAnalysisResult {
  location: string
  category: string
  facilityType: string
  symptom: string
  rootCause: string
  causeCategory: string
  riskLevel: '낮음' | '중' | '높음' | '긴급'
  recommendedActions: string[]
  estimatedCostMin: number
  estimatedCostAvg: number
  estimatedCostMax: number
  aiSummary: string
}

export const RISK_TO_SEVERITY: Record<string, string> = {
  낮음: 'low',
  중: 'medium',
  높음: 'high',
  긴급: 'critical',
}

// ── Mock Provider ──────────────────────────────────────────────────────────────

async function mockAnalyze(memo: string): Promise<AiAnalysisResult> {
  await new Promise<void>(r => setTimeout(r, 800))

  const t = memo

  // ─ Category ─
  const catScores: Record<string, number> = { 누수: 0, 전기: 0, HVAC: 0, 균열: 0 }
  const catKeywords: Record<string, string[]> = {
    누수: ['누수', '물샘', '물이 새', '물이새', '침수', '방수', '배관', '파이프', '조인트', '쪼인트', '우수', '빗물', '물방울', '젖어', '물흔적', '샘'],
    전기: ['전기', '차단기', '분전반', '배선', '콘센트', '누전', '전등', '스위치', '접지', 'mcb', '케이블'],
    HVAC: ['에어컨', '냉방', '난방', '공조', '환기', '덕트', 'hvac', '냉매', '팬코일', '열교환', '환기구'],
    균열: ['균열', '크랙', '금이', '금가', '파손', '부서', '깨진', '갈라진', '탈락'],
  }
  for (const [cat, kws] of Object.entries(catKeywords)) {
    for (const kw of kws) if (t.includes(kw)) catScores[cat]++
  }
  const category = Object.entries(catScores).sort((a, b) => b[1] - a[1])[0][0]

  // ─ Location ─
  const locPatterns = [
    /지하\s*\d+층[^\s,\.。]*/,
    /\d+층[^\s,\.。]*/,
    /RF층[^\s,\.。]*/,
    /(로비|주차장|화장실|전기실|기계실|계단실|복도|회의실|사무실|창고|옥상|탕비실|탈의실|검사실|채혈실)[^\s,\.。]*/,
  ]
  let location = '위치 미확인'
  for (const pat of locPatterns) {
    const m = t.match(pat)
    if (m) { location = m[0].trim(); break }
  }

  // ─ Facility type ─
  const facilityRules: [string[], string][] = [
    [['소방', '스프링클러', '소화'], '소방배관'],
    [['급수', '냉수', '온수', '급탕'], '급배수배관'],
    [['배관', '파이프', '조인트', '쪼인트'], '일반배관'],
    [['에어컨', '냉방', '냉매', '팬코일'], '냉난방 설비'],
    [['분전반', '차단기', '배선', '전선'], '전기 설비'],
    [['천장', '지붕', '옥상'], '천장/지붕'],
    [['바닥', '마루', '타일', '대리석'], '바닥 마감'],
    [['외벽', '내벽', '벽체'], '벽체'],
    [['엘리베이터', '승강기'], '승강 설비'],
    [['창문', '창호', '유리'], '창호'],
  ]
  let facilityType = category === '누수' ? '방수/배수 시설' : '일반 시설물'
  for (const [kws, type] of facilityRules) {
    if (kws.some(kw => t.includes(kw))) { facilityType = type; break }
  }

  // ─ Symptom ─
  const symptomRules: [string[], string][] = [
    [['천장 누수', '천장에서 물', '천장 물새', '천장 물샘', '천장 물'], '천장 누수'],
    [['바닥 누수', '바닥에서 물', '바닥 물'], '바닥 누수'],
    [['벽 누수', '벽에서 물', '외벽 누수'], '벽체 누수'],
    [['물샘', '물이 새', '물이새'], '누수 발생'],
    [['이상 소음', '소음 발생', '잡음', '소리'], '이상 소음'],
    [['냉방 불량', '냉방이 안', '냉방 안됨'], '냉방 불량'],
    [['균열', '크랙', '금이'], '균열 발생'],
    [['삭음', '부식', '녹슬', '녹이'], '부식/노후화'],
    [['누전', '스파크', '합선'], '전기 이상'],
  ]
  const defaultSymptom: Record<string, string> = { 누수: '누수 발생', 전기: '전기 이상', HVAC: '공조 불량', 균열: '균열 발생' }
  let symptom = defaultSymptom[category] || '이상 발생'
  for (const [kws, s] of symptomRules) {
    if (kws.some(kw => t.includes(kw))) { symptom = s; break }
  }

  // ─ Root cause & cause category ─
  const causeRules: [string[], string, string][] = [
    [['삭음', '부식', '녹', '노후', '오래', '낡은'], '노후 설비 부식 및 이음새 손상', '설비 노후'],
    [['시공', '공사 불량', '잘못 시공', '부실'], '시공 불량으로 인한 결함', '시공하자'],
    [['균열', '크랙', '구조'], '구조체 균열로 인한 결함', '구조적 결함'],
    [['막힘', '배수 불량', '역류', '막혀'], '배수구 막힘으로 인한 역류', '유지관리 미흡'],
    [['방수층', '방수 손상'], '방수층 파손 또는 노화', '방수층 결함'],
    [['누전', '전기 과부하'], '과부하 또는 절연 불량', '전기 결함'],
  ]
  const defaultCauses: Record<string, [string, string]> = {
    누수: ['방수층 손상 또는 배관 결함 추정', '설비 노후'],
    전기: ['전기 배선 또는 기기 결함 추정', '전기 결함'],
    HVAC: ['냉매 부족 또는 설비 노후 추정', '설비 노후'],
    균열: ['외부 하중 또는 침하 추정', '구조적 결함'],
  }
  let [rootCause, causeCategory] = defaultCauses[category] || ['원인 분석 필요', '미분류']
  for (const [kws, cause, cat] of causeRules) {
    if (kws.some(kw => t.includes(kw))) { rootCause = cause; causeCategory = cat; break }
  }

  // ─ Risk level ─
  let riskLevel: AiAnalysisResult['riskLevel'] = '중'
  if (t.match(/전기실|분전반|누전|화재|폭발|감전/)) riskLevel = '긴급'
  else if (t.match(/긴급|즉시|위험|심각|대형|넘침|범람/)) riskLevel = '높음'
  else if (t.match(/경미|작은|미세|소량|약간|조금/)) riskLevel = '낮음'
  else if (category === '전기') riskLevel = '높음'
  else if (category === '균열') riskLevel = '낮음'

  // ─ Recommended actions ─
  const baseActions: Record<string, string[]> = {
    누수: ['누수 구간 정밀 점검', '방수 처리 또는 배관 교체', '수분 피해 범위 확인 및 건조 처리'],
    전기: ['전원 차단 후 안전 확인', '전기 전문업체 즉시 출동', '인근 전기 설비 안전 점검'],
    HVAC: ['냉매 상태 점검', '필터 및 배수판 청소', '전문 업체 정기 점검 일정 수립'],
    균열: ['균열 범위 마킹 및 모니터링', '구조 안전 전문가 점검 의뢰', '균열 충전 보수 시공'],
  }
  const actions = [...(baseActions[category] || ['전문가 현장 점검', '원인 분석', '보수 시공'])]
  if (t.includes('조인트') || t.includes('쪼인트') || t.includes('삭음') || t.includes('부식')) {
    actions.unshift('부식 구간 즉시 교체')
    actions.splice(2, 0, '누수 테스트 실시')
  }
  if (t.includes('천장') && category === '누수') actions.push('천장 마감재 교체 검토')
  const recommendedActions = Array.from(new Set(actions)).slice(0, 5)

  // ─ Cost estimation ─
  const baseCost: Record<string, [number, number, number]> = {
    누수: [300000, 1500000, 4000000],
    전기: [500000, 2000000, 6000000],
    HVAC: [200000, 800000, 2500000],
    균열: [100000, 600000, 2000000],
  }
  const [baseMin, baseAvg, baseMax] = baseCost[category] || [200000, 1000000, 3000000]
  const mult = riskLevel === '긴급' ? 2.5 : riskLevel === '높음' ? 1.8 : riskLevel === '낮음' ? 0.5 : 1.0
  const round = (n: number) => Math.round((n * mult) / 10000) * 10000
  const estimatedCostMin = round(baseMin)
  const estimatedCostAvg = round(baseAvg)
  const estimatedCostMax = round(baseMax)

  // ─ AI Summary ─
  const costStr = `${(estimatedCostMin / 10000).toFixed(0)}만~${(estimatedCostMax / 10000).toFixed(0)}만원`
  const aiSummary = `[${location}] ${facilityType}에서 "${symptom}" 발생. 원인: ${rootCause}. 위험도 ${riskLevel} 판정. 예상 처리 비용 ${costStr}. 권고: ${recommendedActions.slice(0, 2).join(', ')}.`

  return { location, category, facilityType, symptom, rootCause, causeCategory, riskLevel, recommendedActions, estimatedCostMin, estimatedCostAvg, estimatedCostMax, aiSummary }
}

// ── Real AI Provider stub (추후 Claude API 또는 Gemini API로 교체) ─────────────
// async function realAnalyze(memo: string): Promise<AiAnalysisResult> {
//   const Anthropic = (await import('@anthropic-ai/sdk')).default
//   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
//   const msg = await client.messages.create({
//     model: 'claude-sonnet-4-6',
//     max_tokens: 1024,
//     messages: [{ role: 'user', content: buildPrompt(memo) }],
//   })
//   return JSON.parse((msg.content[0] as { text: string }).text) as AiAnalysisResult
// }

// ── Entry Point ────────────────────────────────────────────────────────────────
export async function analyzeFieldMemo(memo: string): Promise<AiAnalysisResult> {
  return mockAnalyze(memo)
  // 실제 AI 전환 시: return realAnalyze(memo)
}
