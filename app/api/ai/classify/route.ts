import { NextRequest, NextResponse } from 'next/server'
import { eq, and, inArray, desc, sql } from 'drizzle-orm'
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
    const { title, description, location, facility, occurredAt, category, photos, referenceDocIds } = body

    // referenceDocIds가 배열로 전달되면(사용자가 "적용 기준자료"에서 선택/무선택을 확정한 경우) 그 목록만
    // 사용하고, 관련 없는 다른 기준자료는 절대 프롬프트에 포함하지 않는다. 빈 배열은 "기준자료 미적용"을
    // 사용자가 명시적으로 선택한 것이므로 그대로 존중한다(전체 자료로 되돌아가지 않음).
    // 필드 자체가 없는 경우(구버전 호출부와의 호환)에만 기존처럼 적용중인 전체 자료를 사용한다.
    const activeDocs = Array.isArray(referenceDocIds)
      ? referenceDocIds.length > 0
        ? await pgDb.select().from(referenceDocuments).where(and(eq(referenceDocuments.isActive, true), inArray(referenceDocuments.id, referenceDocIds)))
        : []
      : await pgDb.select().from(referenceDocuments).where(eq(referenceDocuments.isActive, true))
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
