import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { eq, and, desc } from 'drizzle-orm'
import { pgDb } from '@/db/pg/client'
import { referenceDocuments } from '@/db/pg/schema'
import { extractReferenceDoc } from '@/lib/referenceDocExtract'

export async function GET(req: NextRequest) {
  const activeOnly = req.nextUrl.searchParams.get('activeOnly') === 'true'
  const rows = activeOnly
    ? await pgDb.select().from(referenceDocuments).where(eq(referenceDocuments.isActive, true)).orderBy(desc(referenceDocuments.uploadedAt))
    : await pgDb.select().from(referenceDocuments).orderBy(desc(referenceDocuments.uploadedAt))
  return NextResponse.json(rows)
}

function detectFileType(fileName: string): 'pdf' | 'docx' | 'xlsx' | null {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'xlsx') return 'xlsx'
  return null
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const title = String(form.get('title') ?? '').trim()
    const vendor = String(form.get('vendor') ?? '').trim()
    const trade = form.get('trade') ? String(form.get('trade')) : null
    const uploadedBy = form.get('uploadedBy') ? String(form.get('uploadedBy')) : null

    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    if (!title || !vendor) return NextResponse.json({ error: '자료명과 업체명은 필수입니다.' }, { status: 400 })

    const fileType = detectFileType(file.name)
    if (!fileType) return NextResponse.json({ error: 'PDF, Word(.docx), Excel(.xlsx) 파일만 업로드할 수 있습니다.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const blob = await put(`reference-docs/${Date.now()}-${file.name}`, buffer, { access: 'public' })
    const extracted = await extractReferenceDoc(buffer, fileType)

    const existing = await pgDb.select().from(referenceDocuments)
      .where(and(eq(referenceDocuments.vendor, vendor), eq(referenceDocuments.title, title), eq(referenceDocuments.isActive, true)))
    let version = 1
    let supersedes: number | null = null
    if (existing.length > 0) {
      const prev = existing[0]
      version = prev.version + 1
      supersedes = prev.id
      await pgDb.update(referenceDocuments).set({ isActive: false }).where(eq(referenceDocuments.id, prev.id))
    }

    const [inserted] = await pgDb.insert(referenceDocuments).values({
      title, vendor, trade, version, fileType, blobUrl: blob.url,
      extractedText: extracted.extractedText,
      structuredRows: extracted.structuredRows,
      extractionFailed: extracted.extractionFailed,
      isActive: true, supersedes, uploadedBy,
    }).returning()

    return NextResponse.json(inserted)
  } catch (err) {
    console.error('reference-docs upload failed:', err)
    return NextResponse.json({ error: '업로드 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
