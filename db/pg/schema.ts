import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const referenceDocuments = pgTable('reference_documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  vendor: text('vendor').notNull(),
  trade: text('trade'),
  version: integer('version').notNull(),
  fileType: text('file_type').notNull(), // 'pdf' | 'docx' | 'xlsx'
  blobUrl: text('blob_url').notNull(),
  extractedText: text('extracted_text'),
  structuredRows: jsonb('structured_rows').$type<{ trade: string; item: string; free: string | null; paid: string | null; note: string | null }[]>(),
  extractionFailed: boolean('extraction_failed').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  supersedes: integer('supersedes'),
  uploadedBy: text('uploaded_by'),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
})

export type ReferenceDocumentRow = typeof referenceDocuments.$inferSelect
export type NewReferenceDocumentRow = typeof referenceDocuments.$inferInsert

export const aiClassificationLog = pgTable('ai_classification_log', {
  id: serial('id').primaryKey(),
  caseNumber: text('case_number').notNull(),
  inputSnapshot: jsonb('input_snapshot').$type<{
    title: string; description: string; location: string; facility: string; occurredAt: string; category: string
  }>().notNull(),
  aiSuggestion: jsonb('ai_suggestion').$type<{
    constructionPct: number; usagePct: number; warrantyPct: number
    reasoning: string
    citedDocs: { vendor: string; title: string; version: number }[]
    adminChecklist: string[]
    recommendedAction: string
    confidenceLabel: '낮음' | '중간' | '높음'
    confidencePct: number
    fallback: boolean
    // mapPctToDefectType()으로 계산된, 관리자 확정값과 비교하기 위한 AI 추천 매핑값(Task 10/12에서 채움)
    recommendedDefectType: string
    recommendedResponsibilityType: string
    recommendedCostBearer: string
    // 관리자가 이 판단을 확정할 당시 사용자가 선택해 AI 분석에 적용했던 기준자료 스냅샷.
    // jsonb라 스키마 변경(마이그레이션) 없이 추가 — 이후 기준자료가 수정/버전업되어도 이 기록은 바뀌지 않는다.
    appliedReferenceDocs?: { id: number; vendor: string; title: string; trade: string | null; version: number }[]
  }>().notNull(),
  adminFinal: jsonb('admin_final').$type<{
    defectType: string; responsibilityType: string; costBearer: string; reason: string | null
  }>(),
  wasAiAccepted: boolean('was_ai_accepted'),
  confirmedBy: text('confirmed_by'),
  confirmedAt: timestamp('confirmed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type AiClassificationLogRow = typeof aiClassificationLog.$inferSelect
export type NewAiClassificationLogRow = typeof aiClassificationLog.$inferInsert
