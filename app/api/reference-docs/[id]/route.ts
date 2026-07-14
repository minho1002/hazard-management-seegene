import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { pgDb } from '@/db/pg/client'
import { referenceDocuments } from '@/db/pg/schema'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const body = await req.json()
  if (typeof body.isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive(boolean)가 필요합니다.' }, { status: 400 })
  }
  const [updated] = await pgDb.update(referenceDocuments).set({ isActive: body.isActive }).where(eq(referenceDocuments.id, id)).returning()
  if (!updated) return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const [target] = await pgDb.select().from(referenceDocuments).where(eq(referenceDocuments.id, id))
  if (!target) return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })

  await pgDb.delete(referenceDocuments).where(eq(referenceDocuments.id, id))

  let restoredId: number | null = null
  if (target.isActive && target.supersedes != null) {
    await pgDb.update(referenceDocuments).set({ isActive: true }).where(eq(referenceDocuments.id, target.supersedes))
    restoredId = target.supersedes
  }
  return NextResponse.json({ ok: true, restoredId })
}
