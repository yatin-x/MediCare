import { NextResponse } from 'next/server'
import { evaluateGoldens } from '@/lib/agent/eval'
import { GOLDEN_CASES } from '@/lib/agent/golden'

export async function GET() {
  const report = evaluateGoldens(GOLDEN_CASES)
  return NextResponse.json(report)
}
