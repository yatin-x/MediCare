import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '@/lib/prisma'
import { getAppUser, isDoctor } from '@/lib/session'
import { visitNumberFromPriorCount } from '@/lib/agent/patientContext'

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getAppUser()
  if (!user || !isDoctor(user)) {
    return NextResponse.json({ error: 'Only the doctor can start this consult' }, { status: 401 })
  }

  const { id } = await ctx.params
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      patient: true,
      visit: true,
      doctor: { select: { name: true } },
    },
  })
  if (!appointment || appointment.doctorId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (appointment.status === 'cancelled') {
    return NextResponse.json({ error: 'Appointment was cancelled' }, { status: 400 })
  }

  if (appointment.visit) {
    return NextResponse.json({
      roomId: appointment.visit.roomId,
      visitId: appointment.visit.id,
    })
  }

  const roomId = uuidv4().slice(0, 8).toUpperCase()
  const priorCount = await prisma.visit.count({ where: { patientId: appointment.patientId } })

  const visit = await prisma.visit.create({
    data: {
      roomId,
      status: 'active',
      doctor: { connect: { id: user.id } },
      patient: { connect: { id: appointment.patientId } },
      appointment: { connect: { id: appointment.id } },
      doctorName: appointment.doctor.name,
      patientName: appointment.patient.name,
    },
  })

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'in_progress' },
  })

  return NextResponse.json({
    roomId: visit.roomId,
    visitId: visit.id,
    visitNumber: visitNumberFromPriorCount(priorCount),
  })
}
