import { NextResponse } from 'next/server'
import { replayGolden } from '@/lib/agent/eval'
import { GOLDEN_CASES } from '@/lib/agent/golden'

export async function POST(req: Request) {
  const body = await req.json() as { id?: string }
  const g = GOLDEN_CASES.find(c => c.id === body.id) ?? GOLDEN_CASES[0]
  return NextResponse.json(replayGolden(g))
}
