import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isUnusableTranscriptChunk } from '@/lib/agent/grounding'

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      roomId?: string
      type?: string
      role?: string
      payload?: string
    }
    if (!body.roomId?.trim() || !body.payload?.trim() || !body.type) {
      return NextResponse.json({ error: 'roomId, type, and payload are required' }, { status: 400 })
    }
    if (body.type === 'transcript_chunk' && isUnusableTranscriptChunk(body.payload)) {
      return NextResponse.json({ skipped: true })
    }

    const visit = await prisma.visit.findFirst({
      where: { roomId: body.roomId },
      orderBy: { createdAt: 'desc' },
    })
    if (!visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
    }

    const event = await prisma.visitEvent.create({
      data: {
        visitId: visit.id,
        type: body.type,
        role: body.role ?? null,
        payload: body.payload,
      },
    })
    return NextResponse.json({ ok: true, eventId: event.id })
  } catch (err) {
    console.error('[visit-events]', err)
    return NextResponse.json({ error: 'Failed to store event' }, { status: 500 })
  }
}
