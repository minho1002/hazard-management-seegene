export interface ClassificationSuggestion {
  defectType: '하자사항' | '일반사항' | '확인 필요'
  responsibilityType: string
  costBearer: string
  confidence: '낮음' | '중간' | '높음'
  reasoning: string
}

export interface ClassificationInput {
  causeCategory?: string | null
  rootCause?: string | null
  title: string
  description?: string | null
}

// ── Mock Provider ──────────────────────────────────────────────────────────────
// AI는 추천만 하고 확정하지 않는다 — 최종 확정은 관리자 권한(lib/permissions.ts)에서만 가능.

function mockSuggest(input: ClassificationInput): ClassificationSuggestion {
  const text = [input.title, input.description, input.rootCause].filter(Boolean).join(' ')

  const keywordRules: [string[], ClassificationSuggestion][] = [
    [['시공 불량', '시공불량', '자재 불량', '자재불량', '방수 하자', '마감 불량', '배관 시공', '부실 시공', '부실공사'],
      { defectType: '하자사항', responsibilityType: '시공사 귀책', costBearer: '시공사', confidence: '높음', reasoning: '시공/자재 불량 관련 키워드가 감지되어 시공사 귀책 하자사항으로 추정됩니다.' }],
    [['외주', '유지관리 계약', '점검 누락', '점검누락'],
      { defectType: '일반사항', responsibilityType: '외주업체 부담', costBearer: '외주업체', confidence: '중간', reasoning: '외주 유지관리 계약 범위 내 점검/조치 사항으로 추정됩니다.' }],
    [['사용자 과실', '사용 부주의', '파손', '고의'],
      { defectType: '일반사항', responsibilityType: '사용자 과실', costBearer: '사용자', confidence: '중간', reasoning: '사용 중 파손/부주의 관련 키워드가 감지되어 사용자 과실로 추정됩니다.' }],
    [['소모품', '노후', '수명', '교체 주기'],
      { defectType: '일반사항', responsibilityType: '소모품/노후', costBearer: '재단', confidence: '중간', reasoning: '소모품 교체·설비 노후로 인한 일반사항으로 추정됩니다.' }],
  ]

  for (const [kws, result] of keywordRules) {
    if (kws.some(kw => text.includes(kw))) return result
  }

  // 키워드 매칭이 없으면 AI 현장메모 분석의 원인분류(causeCategory)로 폴백
  const causeCategoryMap: Record<string, ClassificationSuggestion> = {
    '시공하자': { defectType: '하자사항', responsibilityType: '시공사 귀책', costBearer: '시공사', confidence: '중간', reasoning: 'AI 분석의 원인분류가 "시공하자"로 추정되어 시공사 귀책 가능성이 높습니다.' },
    '방수층 결함': { defectType: '하자사항', responsibilityType: '시공사 귀책', costBearer: '시공사', confidence: '중간', reasoning: 'AI 분석의 원인분류가 "방수층 결함"으로 추정되어 시공사 귀책 가능성이 높습니다.' },
    '구조적 결함': { defectType: '하자사항', responsibilityType: '시공사 귀책', costBearer: '시공사', confidence: '낮음', reasoning: '구조적 결함은 시공 문제일 가능성이 있으나 추가 확인이 필요합니다.' },
    '설비 노후': { defectType: '일반사항', responsibilityType: '소모품/노후', costBearer: '재단', confidence: '중간', reasoning: 'AI 분석의 원인분류가 "설비 노후"로 추정되어 일반사항(재단 부담) 가능성이 높습니다.' },
    '유지관리 미흡': { defectType: '일반사항', responsibilityType: '재단/운영측 부담', costBearer: '재단', confidence: '중간', reasoning: 'AI 분석의 원인분류가 "유지관리 미흡"으로 추정되어 재단/운영측 부담 가능성이 높습니다.' },
    '전기 결함': { defectType: '확인 필요', responsibilityType: '원인 불명', costBearer: '미정', confidence: '낮음', reasoning: '전기 결함은 원인 특정이 어려워 추가 확인이 필요합니다.' },
  }
  if (input.causeCategory && causeCategoryMap[input.causeCategory]) return causeCategoryMap[input.causeCategory]

  return { defectType: '확인 필요', responsibilityType: '원인 불명', costBearer: '미정', confidence: '낮음', reasoning: '원인을 특정할 수 있는 정보가 부족하여 확인이 필요합니다.' }
}

// ── Real AI Provider stub (추후 Claude API 또는 Gemini API로 교체) ─────────────
// async function realSuggest(input: ClassificationInput): Promise<ClassificationSuggestion> { ... }

// ── Entry Point ────────────────────────────────────────────────────────────────
export function suggestClassification(input: ClassificationInput): ClassificationSuggestion {
  return mockSuggest(input)
  // 실제 AI 전환 시: return realSuggest(input)
}
