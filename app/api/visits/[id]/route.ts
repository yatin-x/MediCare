import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'
import { formatPriorLine, visitNumberFromPriorCount } from '@/lib/agent/patientContext'
import { listPriorVisits } from '@/lib/agent/tools'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      agentRuns: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          steps: { orderBy: { createdAt: 'asc' } },
          toolCalls: { orderBy: { createdAt: 'asc' } },
          approvals: { orderBy: { createdAt: 'asc' } },
        },
      },
      approvals: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'asc' }, take: 50 },
    },
  })
  if (!visit) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const doctorId = (session.user as { id?: string }).id
  if ((session.user as { role?: string }).role === 'patient') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (visit.doctorId && visit.doctorId !== doctorId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const prior = visit.patientId ? await listPriorVisits(visit.patientId, visit.id) : []
  return NextResponse.json({
    visit,
    visitNumber: visitNumberFromPriorCount(prior.length),
    priorVisits: prior.map((p, i) => ({
      id: p.id,
      visitIndex: i + 1,
      line: formatPriorLine(p, i + 1),
      createdAt: p.createdAt,
      symptoms: p.symptoms,
      medicines: p.medicines,
      urgency: p.urgency,
      summary: p.summary,
      noteStatus: p.noteStatus,
    })),
  })
}
