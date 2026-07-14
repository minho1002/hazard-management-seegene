import { NextRequest, NextResponse } from 'next/server'
import { eq, desc, sql } from 'drizzle-orm'
import { pgDb } from '@/db/pg/client'
import { referenceDocuments, aiClassificationLog } from '@/db/pg/schema'
import { classifyDefect, type HistoricalCase } from '@/lib/aiDefectClassifier'

async function findSimilarCases(category: string, facility: string, keywords: string[]): Promise<HistoricalCase[]> {
  const rows = await pgDb.select().from(aiClassificationLog)
    .where(sql`${aiClassificationLog.adminFinal} is not null`)
    .orderBy(desc(aiClassificationLog.confirmedAt))
    .limit(50)

  const matched = rows.filter(r => {
    const snap = r.inputSnapshot
    const sameCategoryAndKeyword = snap.category === category && keywords.filter(k => snap.title.includes(k) || snap.description.includes(k)).length >= 3
    const sameFacility = snap.facility === facility
    return sameCategoryAndKeyword || sameFacility
  }).slice(0, 5)

  return matched.map(r => ({
    title: r.inputSnapshot.title,
    description: r.inputSnapshot.description,
    adminFinal: r.adminFinal!,
  }))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, description, location, facility, occurredAt, category, photos } = body

    const activeDocs = await pgDb.select().from(referenceDocuments).where(eq(referenceDocuments.isActive, true))
    const keywords = `${title} ${description}`.split(/\s+/).filter((w: string) => w.length >= 2)
    const historicalCases = await findSimilarCases(category ?? '', facility ?? '', keywords)

    const result = await classifyDefect(
      { title: title ?? '', description: description ?? '', location: location ?? '', facility: facility ?? '', occurredAt: occurredAt ?? '', category: category ?? '', photos: photos ?? [] },
      activeDocs, historicalCases
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('/api/ai/classify failed:', err)
    return NextResponse.json({ error: '분석 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
