import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { approvalId?: string; status?: 'approved' | 'rejected' }
  if (!body.approvalId || (body.status !== 'approved' && body.status !== 'rejected')) {
    return NextResponse.json({ error: 'approvalId and status are required' }, { status: 400 })
  }

  const approval = await prisma.approval.update({
    where: { id: body.approvalId },
    data: { status: body.status, decidedAt: new Date() },
  })

  if (approval.type === 'note' && body.status === 'approved') {
    await prisma.visit.update({
      where: { id: approval.visitId },
      data: { noteStatus: 'approved' },
    })
  }

  if (approval.type === 'follow_up' && body.status === 'approved') {
    const payload = approval.payload as { appointmentId?: string }
    if (payload.appointmentId) {
      await prisma.appointment.update({
        where: { id: payload.appointmentId },
        data: { status: 'scheduled' },
      })
    }
  }

  if (approval.type === 'follow_up' && body.status === 'rejected') {
    const payload = approval.payload as { appointmentId?: string }
    if (payload.appointmentId) {
      await prisma.appointment.update({
        where: { id: payload.appointmentId },
        data: { status: 'cancelled' },
      })
    }
  }

  return NextResponse.json({ approval })
}
