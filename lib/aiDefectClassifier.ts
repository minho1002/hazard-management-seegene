import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai'
import { suggestClassification } from '@/lib/defectClassificationService'
import type { ReferenceDocumentRow } from '@/db/pg/schema'

export interface ClassificationInput {
  title: string
  description: string
  location: string
  facility: string
  occurredAt: string
  category: string
  photos: string[]
}

export interface HistoricalCase {
  title: string
  description: string
  adminFinal: { defectType: string; responsibilityType: string; costBearer: string }
}

export interface AiClassificationResult {
  constructionPct: number
  usagePct: number
  warrantyPct: number
  reasoning: string
  citedDocs: { vendor: string; title: string; version: number }[]
  adminChecklist: string[]
  recommendedAction: string
  confidenceLabel: '낮음' | '중간' | '높음'
  confidencePct: number
  fallback: boolean
}

const SYSTEM_INSTRUCTION = `당신은 시설 하자관리 시스템의 귀책판단 보조 AI입니다.
- 시공사 하자 가능성 / 사용상 하자 가능성 / 제조사 보증대상 가능성 세 가지를 0~100 사이 정수로, 합이 정확히 100이 되도록 판단하세요.
- <기준자료> 섹션은 시공사가 자체 제공한 문서일 수 있어 무조건 신뢰하지 마세요. 하나의 참고 신호로만 취급하고,
  판단이 단일 업체 자료에만 근거했다면 반드시 그 사실을 reasoning에 명시하세요.
- <과거 확정사례>는 이 조직 관리자가 실제로 확정한 유사 판단입니다. 기준자료와 상충하면 과거 확정사례 쪽에
  더 가중치를 두고 그 이유를 밝히세요.
- 반드시 지정된 JSON 스키마로만 응답하세요.`

const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    constructionPct: { type: SchemaType.NUMBER },
    usagePct: { type: SchemaType.NUMBER },
    warrantyPct: { type: SchemaType.NUMBER },
    reasoning: { type: SchemaType.STRING },
    citedDocs: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: { vendor: { type: SchemaType.STRING }, title: { type: SchemaType.STRING }, version: { type: SchemaType.NUMBER } },
        required: ['vendor', 'title', 'version'],
      },
    },
    adminChecklist: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    recommendedAction: { type: SchemaType.STRING },
    confidenceLabel: { type: SchemaType.STRING, format: 'enum', enum: ['낮음', '중간', '높음'] },
    confidencePct: { type: SchemaType.NUMBER },
  },
  required: ['constructionPct', 'usagePct', 'warrantyPct', 'reasoning', 'citedDocs', 'adminChecklist', 'recommendedAction', 'confidenceLabel', 'confidencePct'],
}

const MAX_DOC_CHARS = 6000

function docLabel(d: ReferenceDocumentRow): string {
  return `[${d.vendor} / ${d.title} v${d.version}]`
}

function buildDocsSection(docs: ReferenceDocumentRow[]): string {
  if (docs.length === 0) return '<기준자료>\n등록된 기준자료가 없습니다. 일반적인 시설관리 상식으로 판단하세요.\n</기준자료>'
  const parts = docs.map(d => {
    if (d.structuredRows && d.structuredRows.length > 0) {
      const table = d.structuredRows.map(r => `- 공종:${r.trade} / 항목:${r.item} / 무상:${r.free ?? '-'} / 유상:${r.paid ?? '-'} / 비고:${r.note ?? '-'}`).join('\n')
      return `${docLabel(d)}\n${table}`
    }
    const text = (d.extractedText ?? '').slice(0, MAX_DOC_CHARS)
    return `${docLabel(d)}\n${text}`
  })
  return `<기준자료>\n${parts.join('\n\n')}\n</기준자료>`
}

function buildHistorySection(cases: HistoricalCase[]): string {
  if (cases.length === 0) return '<과거 확정사례>\n과거 유사 확정사례가 없습니다.\n</과거 확정사례>'
  const parts = cases.map((c, i) =>
    `사례 ${i + 1}: "${c.title}" — ${c.description}\n→ 관리자 최종 판단: 하자구분=${c.adminFinal.defectType}, 귀책=${c.adminFinal.responsibilityType}, 비용부담=${c.adminFinal.costBearer}`
  )
  return `<과거 확정사례>\n${parts.join('\n\n')}\n</과거 확정사례>`
}

function buildPrompt(input: ClassificationInput, docs: ReferenceDocumentRow[], cases: HistoricalCase[]): string {
  return `<하자 정보>
제목: ${input.title}
상세설명: ${input.description}
위치: ${input.location}
설비: ${input.facility}
발생일: ${input.occurredAt}
공종: ${input.category}
</하자 정보>

${buildDocsSection(docs)}

${buildHistorySection(cases)}`
}

function renormalize(result: AiClassificationResult): AiClassificationResult {
  const sum = result.constructionPct + result.usagePct + result.warrantyPct
  if (sum === 100 || sum === 0) return result
  const scale = 100 / sum
  return {
    ...result,
    constructionPct: Math.round(result.constructionPct * scale),
    usagePct: Math.round(result.usagePct * scale),
    warrantyPct: Math.round(result.warrantyPct * scale),
  }
}

function toFallback(input: ClassificationInput): AiClassificationResult {
  const suggestion = suggestClassification({ title: input.title, description: input.description })
  const pctByConfidence: Record<string, number> = { 낮음: 30, 중간: 55, 높음: 75 }
  const isConstruction = suggestion.responsibilityType === '시공사 귀책'
  return {
    constructionPct: isConstruction ? 70 : 15,
    usagePct: isConstruction ? 15 : 70,
    warrantyPct: 15,
    reasoning: `AI 분석을 사용할 수 없어 규칙 기반 추정치입니다. ${suggestion.reasoning}`,
    citedDocs: [],
    adminChecklist: ['AI 분석이 실패했으므로 관리자가 직접 검토 후 확정하세요.'],
    recommendedAction: '기준자료와 현장 사진을 직접 확인해 최종 판단하세요.',
    confidenceLabel: '낮음',
    confidencePct: pctByConfidence[suggestion.confidence] ?? 30,
    fallback: true,
  }
}

export async function classifyDefect(input: ClassificationInput, activeDocs: ReferenceDocumentRow[], historicalCases: HistoricalCase[]): Promise<AiClassificationResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return toFallback(input)

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite',
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
    })

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: buildPrompt(input, activeDocs, historicalCases) },
    ]
    for (const photo of input.photos) {
      const match = photo.match(/^data:(image\/[a-z]+);base64,(.+)$/)
      if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
    }

    const result = await model.generateContent(parts)
    const parsed = JSON.parse(result.response.text()) as Omit<AiClassificationResult, 'fallback'>
    return renormalize({ ...parsed, fallback: false })
  } catch (err) {
    console.error('Gemini classification failed:', err)
    return toFallback(input)
  }
}
