import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const doctors = await prisma.user.findMany({
    where: { role: 'doctor', isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, speciality: true },
  })
  return NextResponse.json({ doctors })
}
