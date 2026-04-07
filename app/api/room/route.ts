// ...existing code...
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/authOptions"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized: Please log in first' }, { status: 401 })
    }

    const { patientName } = await req.json()
    if (!patientName) {
      return NextResponse.json({ error: 'Patient name is required' }, { status: 400 })
    }

    const roomId = uuidv4().slice(0, 8).toUpperCase()
    const doctorId = (session.user as any).id
    const doctorName = session.user.name

    // Upsert Patient -> ensure patientId is populated
    let patient = await prisma.patient.findFirst({
      where: { name: patientName, doctorId: doctorId }
    })

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          name: patientName,
          doctorId: doctorId
        }
      })
    }

    const visit = await prisma.visit.create({
      data: {
        roomId,
        status: 'active',
        doctor: { connect: { id: doctorId } },
        patient: { connect: { id: patient.id } },
        doctorName: doctorName ?? undefined,
        patientName: patientName,
      },
    })

    return NextResponse.json({ roomId: visit.roomId, visitId: visit.id })
  } catch (error) {
    console.error('Room creation error:', error)
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }
}
// ...existing code...