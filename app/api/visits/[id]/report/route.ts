import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatPriorLine, visitNumberFromPriorCount } from '@/lib/agent/patientContext'
import { listPriorVisits } from '@/lib/agent/tools'
import { getAppUser, isDoctor, isPatient } from '@/lib/session'
import { ensurePatientChart } from '@/lib/patientAccount'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAppUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const visit = await prisma.visit.findUnique({
    where: { id },
    select: {
      id: true,
      roomId: true,
      doctorId: true,
      doctorName: true,
      patientName: true,
      patientId: true,
      symptoms: true,
      medicines: true,
      advice: true,
      duration: true,
      urgency: true,
      confidence: true,
      summary: true,
      soapDraft: true,
      patientSummary: true,
      status: true,
      createdAt: true,
    },
  })
  if (!visit) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (isDoctor(user) && visit.doctorId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (isPatient(user)) {
    const chart = await ensurePatientChart(user)
    if (!chart || visit.patientId !== chart.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const prior = visit.patientId ? await listPriorVisits(visit.patientId, visit.id) : []
  const followUp = visit.patientId
    ? await prisma.appointment.findFirst({
      where: {
        patientId: visit.patientId,
        doctorId: visit.doctorId,
        status: { in: ['pending_approval', 'scheduled'] },
        createdAt: { gte: visit.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, scheduledAt: true, reason: true },
    })
    : null

  return NextResponse.json({
    visit: {
      ...visit,
      report: visit.patientSummary || visit.soapDraft || visit.summary,
      visitNumber: visitNumberFromPriorCount(prior.length),
    },
    followUp,
    priorVisits: prior.map((p, i) => ({
      id: p.id,
      visitIndex: i + 1,
      line: formatPriorLine(p, i + 1),
      createdAt: p.createdAt,
      symptoms: p.symptoms,
      medicines: p.medicines,
      urgency: p.urgency,
      summary: p.summary,
    })),
  })
}
