import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { visitNumberFromPriorCount } from '@/lib/agent/patientContext'
import { getAppUser, isDoctor, isPatient } from '@/lib/session'
import { ensurePatientChart } from '@/lib/patientAccount'

function visitNumberInSet(
  visitId: string,
  all: Array<{ id: string; createdAt: Date }>,
) {
  const ordered = [...all].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const idx = ordered.findIndex(v => v.id === visitId)
  return idx >= 0 ? visitNumberFromPriorCount(idx) : 1
}

function asReport(visit: {
  id: string
  roomId: string
  doctorName: string | null
  patientName: string | null
  symptoms: string[]
  medicines: string[]
  advice: string[]
  duration: string | null
  urgency: string | null
  confidence: number | null
  summary: string | null
  soapDraft: string | null
  patientSummary?: string | null
  status: string
  createdAt: Date
  patientId: string | null
}) {
  return {
    id: visit.id,
    roomId: visit.roomId,
    doctorName: visit.doctorName,
    patientName: visit.patientName,
    symptoms: visit.symptoms,
    medicines: visit.medicines,
    advice: visit.advice,
    duration: visit.duration,
    urgency: visit.urgency,
    confidence: visit.confidence,
    summary: visit.summary,
    soapDraft: visit.soapDraft,
    patientSummary: visit.patientSummary ?? null,
    report: visit.patientSummary || visit.soapDraft || visit.summary,
    status: visit.status,
    createdAt: visit.createdAt,
    patientId: visit.patientId,
  }
}

export async function GET(req: NextRequest) {
  try {
    const roomId = req.nextUrl.searchParams.get('roomId')?.trim().toUpperCase()
    const user = await getAppUser()

    if (roomId) {
      const seed = await prisma.visit.findFirst({ where: { roomId } })
      if (!seed) {
        return NextResponse.json({ error: 'Visit not found for that room ID' }, { status: 404 })
      }
      if (user) {
        const chart = isPatient(user) ? await ensurePatientChart(user) : null
        const allowed = isDoctor(user)
          ? seed.doctorId === user.id
          : Boolean(chart && seed.patientId === chart.id)
        if (!allowed) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }

      const visits = seed.patientId
        ? await prisma.visit.findMany({
          where: { patientId: seed.patientId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
        : [seed]

      return NextResponse.json({
        mode: 'patient',
        patientName: seed.patientName,
        visits: visits.map(v => ({
          ...asReport(v),
          visitNumber: visitNumberInSet(v.id, visits),
        })),
      })
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (isPatient(user)) {
      const chart = await ensurePatientChart(user)
      if (!chart) {
        return NextResponse.json({ mode: 'patient', visits: [] })
      }
      const visits = await prisma.visit.findMany({
        where: { patientId: chart.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      return NextResponse.json({
        mode: 'patient',
        patientName: chart.name,
        visits: visits.map(v => ({
          ...asReport(v),
          visitNumber: visitNumberInSet(v.id, visits),
        })),
      })
    }

    if (!isDoctor(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const visits = await prisma.visit.findMany({
      where: { doctorId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const byPatient = new Map<string, typeof visits>()
    for (const v of visits) {
      const key = v.patientId || v.patientName || v.id
      const list = byPatient.get(key) ?? []
      list.push(v)
      byPatient.set(key, list)
    }

    return NextResponse.json({
      mode: 'doctor',
      visits: visits.map(v => {
        const key = v.patientId || v.patientName || v.id
        const cohort = byPatient.get(key) ?? [v]
        return {
          ...asReport(v),
          visitNumber: visitNumberInSet(v.id, cohort),
        }
      }),
    })
  } catch (error) {
    console.error('Visits fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
  }
}
