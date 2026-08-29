import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { findPatientByName } from '@/lib/agent/tools'
import { visitNumberFromPriorCount } from '@/lib/agent/patientContext'

function parseAllergies(raw: unknown): string[] | undefined {
  if (typeof raw !== 'string') return undefined
  const items = raw.split(',').map(s => s.trim()).filter(Boolean)
  return items.length ? items : []
}

export async function GET(req: Request) {
  const roomId = new URL(req.url).searchParams.get('roomId')?.trim()
  if (!roomId) {
    return NextResponse.json({ error: 'roomId is required' }, { status: 400 })
  }
  const visit = await prisma.visit.findFirst({
    where: { roomId },
    select: { patientName: true, roomId: true },
  })
  if (!visit) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(visit)
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized: Please log in first' }, { status: 401 })
    }
    if ((session.user as { role?: string }).role === 'patient') {
      return NextResponse.json({ error: 'Patients join from Home after the doctor starts the visit' }, { status: 403 })
    }

    const body = await req.json()
    const patientName = typeof body.patientName === 'string' ? body.patientName.trim() : ''
    if (!patientName) {
      return NextResponse.json({ error: 'Patient name is required' }, { status: 400 })
    }

    const roomId = uuidv4().slice(0, 8).toUpperCase()
    const doctorId = (session.user as { id: string }).id
    const doctorName = session.user.name
    const allergies = parseAllergies(body.allergies)

    let patient = await findPatientByName(doctorId, patientName)

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          name: patientName,
          doctorId,
          ...(allergies ? { allergies } : {}),
        },
      })
    } else if (allergies && allergies.length > 0) {
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: { allergies },
      })
    }

    const priorCount = await prisma.visit.count({ where: { patientId: patient.id } })
    const visitNumber = visitNumberFromPriorCount(priorCount)

    const visit = await prisma.visit.create({
      data: {
        roomId,
        status: 'active',
        doctor: { connect: { id: doctorId } },
        patient: { connect: { id: patient.id } },
        doctorName: doctorName ?? undefined,
        patientName: patient.name,
      },
    })

    return NextResponse.json({
      roomId: visit.roomId,
      visitId: visit.id,
      visitNumber,
      priorVisitCount: priorCount,
      patientId: patient.id,
    })
  } catch (error) {
    console.error('Room creation error:', error)
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }
}
