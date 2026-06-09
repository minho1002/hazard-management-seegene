import { NextRequest, NextResponse } from 'next/server'
import { analyzeFieldMemo } from '@/lib/aiAnalysisService'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const memo: string = body?.memo
    if (!memo?.trim()) {
      return NextResponse.json({ error: '메모를 입력해주세요.' }, { status: 400 })
    }
    const result = await analyzeFieldMemo(memo.trim())
    return NextResponse.json(result)
  } catch (_e) {
    console.error('[/api/ai/analyze]', _e)
    return NextResponse.json({ error: '분석 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
