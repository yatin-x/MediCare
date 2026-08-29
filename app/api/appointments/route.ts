import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAppUser, isDoctor, isPatient } from '@/lib/session'
import { ensurePatientChart } from '@/lib/patientAccount'

export async function GET() {
  const user = await getAppUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isPatient(user)) {
    const chart = await ensurePatientChart(user)
    if (!chart) {
      return NextResponse.json({ appointments: [] })
    }
    const appointments = await prisma.appointment.findMany({
      where: { patientId: chart.id },
      orderBy: { scheduledAt: 'asc' },
      include: {
        doctor: { select: { id: true, name: true, speciality: true } },
        visit: { select: { id: true, roomId: true, status: true } },
      },
    })
    return NextResponse.json({ appointments })
  }

  if (!isDoctor(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const appointments = await prisma.appointment.findMany({
    where: { doctorId: user.id },
    orderBy: { scheduledAt: 'asc' },
    include: {
      patient: { select: { id: true, name: true, allergies: true } },
      visit: { select: { id: true, roomId: true, status: true } },
    },
  })
  return NextResponse.json({ appointments })
}

export async function POST(req: Request) {
  const user = await getAppUser()
  if (!user || !isPatient(user)) {
    return NextResponse.json({ error: 'Patients must be signed in to book' }, { status: 401 })
  }

  const chart = await ensurePatientChart(user)
  if (!chart) {
    return NextResponse.json({ error: 'Could not create patient chart' }, { status: 500 })
  }

  const body = await req.json()
  const doctorId = typeof body.doctorId === 'string' ? body.doctorId : ''
  const scheduledAt = typeof body.scheduledAt === 'string' ? new Date(body.scheduledAt) : null
  const reason = typeof body.reason === 'string' ? body.reason.trim() : undefined

  if (!doctorId || !scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'doctorId and scheduledAt are required' }, { status: 400 })
  }

  const doctor = await prisma.user.findFirst({
    where: { id: doctorId, role: 'doctor' },
  })
  if (!doctor) {
    return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
  }

  if (!chart.doctorId) {
    await prisma.patient.update({
      where: { id: chart.id },
      data: { doctorId },
    })
  }

  const appointment = await prisma.appointment.create({
    data: {
      doctorId,
      patientId: chart.id,
      scheduledAt,
      durationMins: 20,
      type: 'video',
      reason: reason || 'Video consult',
      status: 'scheduled',
    },
    include: {
      doctor: { select: { id: true, name: true, speciality: true } },
      visit: { select: { id: true, roomId: true, status: true } },
    },
  })

  return NextResponse.json({ appointment })
}
