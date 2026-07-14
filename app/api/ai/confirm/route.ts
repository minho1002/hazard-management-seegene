import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { pgDb } from '@/db/pg/client'
import { aiClassificationLog } from '@/db/pg/schema'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { caseNumber, inputSnapshot, aiSuggestion, adminFinal, confirmedBy } = body
    if (!caseNumber || !inputSnapshot || !aiSuggestion || !adminFinal) {
      return NextResponse.json({ error: 'caseNumber, inputSnapshot, aiSuggestion, adminFinal이 모두 필요합니다.' }, { status: 400 })
    }

    const wasAiAccepted =
      adminFinal.defectType === aiSuggestion.recommendedDefectType &&
      adminFinal.responsibilityType === aiSuggestion.recommendedResponsibilityType &&
      adminFinal.costBearer === aiSuggestion.recommendedCostBearer

    const existing = await pgDb.select().from(aiClassificationLog).where(eq(aiClassificationLog.caseNumber, caseNumber))
    if (existing.length > 0) {
      await pgDb.update(aiClassificationLog).set({
        inputSnapshot, aiSuggestion, adminFinal, wasAiAccepted, confirmedBy, confirmedAt: new Date(),
      }).where(eq(aiClassificationLog.caseNumber, caseNumber))
    } else {
      await pgDb.insert(aiClassificationLog).values({
        caseNumber, inputSnapshot, aiSuggestion, adminFinal, wasAiAccepted, confirmedBy, confirmedAt: new Date(),
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('/api/ai/confirm failed:', err)
    return NextResponse.json({ error: '확정 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
