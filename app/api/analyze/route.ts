import { NextRequest, NextResponse } from 'next/server'
import { runEncounterOrchestrator } from '@/lib/agent/orchestrator'

interface AnalyzeRequestBody {
  roomId: string
  transcript: string
  patientId?: string
}

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequestBody = await req.json()
    const { roomId, transcript } = body

    if (!roomId?.trim()) {
      return NextResponse.json({ error: 'roomId is required' }, { status: 400 })
    }

    const result = await runEncounterOrchestrator({ roomId, transcript })
    return NextResponse.json({
      success: true,
      visitId: result.visitId,
      agentRunId: result.runId,
      status: result.status,
      urgency: result.urgency,
      confidence: result.confidence,
      predictionSource: result.predictionSource,
      extracted: result.extracted,
      summary: result.summary,
      claims: result.claims,
      auditorFlags: result.auditorFlags,
      visitNumber: result.visitNumber,
      priorLines: result.priorLines,
      patientSummary: result.patientSummary,
    })
  } catch (err) {
    console.error('[analyze] Unexpected error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error during analysis'
    const status = message.includes('No visit found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
