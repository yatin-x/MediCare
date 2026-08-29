import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'
import { formatPriorLine, visitNumberFromPriorCount } from '@/lib/agent/patientContext'
import { listPriorVisits } from '@/lib/agent/tools'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const roomId = req.nextUrl.searchParams.get('roomId')
  if (!roomId?.trim()) {
    return NextResponse.json({ error: 'roomId is required' }, { status: 400 })
  }

  const visit = await prisma.visit.findFirst({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
  })
  if (!visit) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const doctorId = (session.user as { id?: string }).id
  if (visit.doctorId !== doctorId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const prior = visit.patientId ? await listPriorVisits(visit.patientId, visit.id) : []
  const visitNumber = visitNumberFromPriorCount(prior.length)

  return NextResponse.json({
    visitId: visit.id,
    patientName: visit.patientName,
    visitNumber,
    priorVisitCount: prior.length,
    allergies: visit.patientId
      ? (await prisma.patient.findUnique({
          where: { id: visit.patientId },
          select: { allergies: true },
        }))?.allergies ?? []
      : [],
    priorVisits: prior.map((p, i) => ({
      id: p.id,
      visitIndex: i + 1,
      line: formatPriorLine(p, i + 1),
      createdAt: p.createdAt,
      symptoms: p.symptoms,
      medicines: p.medicines,
      urgency: p.urgency,
      summary: p.summary,
      soapDraft: p.soapDraft,
      noteStatus: p.noteStatus,
    })),
  })
}
