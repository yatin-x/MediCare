import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const visitId = searchParams.get('visitId')
  if (!visitId) {
    return NextResponse.json({ error: 'visitId is required' }, { status: 400 })
  }

  const run = await prisma.agentRun.findFirst({
    where: { visitId },
    orderBy: { createdAt: 'desc' },
    include: {
      steps: { orderBy: { createdAt: 'asc' } },
      toolCalls: { orderBy: { createdAt: 'asc' } },
      approvals: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!run) {
    return NextResponse.json({ error: 'No agent run for visit' }, { status: 404 })
  }

  return NextResponse.json({ run })
}
