import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/authOptions"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const doctorId = (session.user as any).id
    const visits = await prisma.visit.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'desc' },
      take: 50
    })
    return NextResponse.json({ visits })
  } catch (error) {
    console.error('Visits fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
  }
}
