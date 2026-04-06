// ...existing code...
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: Request) {
  try {
    const { doctorId, doctorName, patientName } = await req.json()

    const roomId = uuidv4().slice(0, 8).toUpperCase()

    // Ensure we have a User to satisfy the required `doctor` relation on Visit.
    // If caller provided a doctorId, prefer it (but verify it exists).
    // Otherwise create a lightweight doctor account (placeholder email + random passwordHash).
    let doctorToConnectId: string | undefined = doctorId

    if (!doctorToConnectId) {
      const createdDoctor = await prisma.user.create({
        data: {
          email: `${roomId}-${Date.now()}@example.com`,
          name: doctorName ?? 'Doctor',
          passwordHash: uuidv4(), // placeholder hash; replace with real hash when creating real accounts
          role: 'doctor',
        },
      })
      doctorToConnectId = createdDoctor.id
    } else {
      const existing = await prisma.user.findUnique({ where: { id: doctorToConnectId } })
      if (!existing) {
        const createdDoctor = await prisma.user.create({
          data: {
            email: `${roomId}-${Date.now()}@example.com`,
            name: doctorName ?? 'Doctor',
            passwordHash: uuidv4(),
            role: 'doctor',
          },
        })
        doctorToConnectId = createdDoctor.id
      }
    }

    const visit = await prisma.visit.create({
      data: {
        roomId,
        status: 'active',
        // satisfy required relation
        doctor: {
          connect: { id: doctorToConnectId! },
        },
        // optional plain-name fields for guest/quick access
        doctorName: doctorName ?? undefined,
        patientName: patientName ?? undefined,
      },
    })

    return NextResponse.json({ roomId: visit.roomId, visitId: visit.id })
  } catch (error) {
    console.error('Room creation error:', error)
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }
}
// ...existing code...