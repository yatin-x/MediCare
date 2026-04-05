import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: Request) {
  try {
    const { doctorName, patientName } = await req.json()

    const roomId = uuidv4().slice(0, 8).toUpperCase()

    const visit = await prisma.visit.create({
      data: {
        roomId,
        doctorName: doctorName || 'Doctor',
        patientName: patientName || 'Patient',
        status: 'active'
      }
    })

    return NextResponse.json({ roomId: visit.roomId, visitId: visit.id })
  } catch (error) {
    console.error('Room creation error:', error)
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }
}
