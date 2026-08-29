import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const doctorId = (session.user as { id?: string }).id
  if (!doctorId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const patients = await prisma.patient.findMany({
    where: { doctorId },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { visits: true } },
    },
  })

  return NextResponse.json({
    patients: patients.map(p => ({
      id: p.id,
      name: p.name,
      visitCount: p._count.visits,
      allergies: p.allergies,
    })),
  })
}
