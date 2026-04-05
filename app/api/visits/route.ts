import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const visits = await prisma.visit.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    })
    return NextResponse.json({ visits })
  } catch (error) {
    console.error('Visits fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
  }
}
