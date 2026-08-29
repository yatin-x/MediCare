import { prisma } from '@/lib/prisma'
import type { AppUser } from '@/lib/session'

export async function ensurePatientChart(user: AppUser) {
  if (user.role !== 'patient') return null

  const existing = await prisma.patient.findUnique({ where: { userId: user.id } })
  if (existing) return existing

  if (user.email) {
    const byEmail = await prisma.patient.findFirst({
      where: { email: { equals: user.email, mode: 'insensitive' }, userId: null },
      orderBy: { createdAt: 'asc' },
    })
    if (byEmail) {
      return prisma.patient.update({
        where: { id: byEmail.id },
        data: { userId: user.id, name: byEmail.name || user.name || 'Patient' },
      })
    }
  }

  return prisma.patient.create({
    data: {
      name: user.name?.trim() || 'Patient',
      email: user.email ?? undefined,
      userId: user.id,
    },
  })
}

export async function getPatientChartForUser(userId: string) {
  return prisma.patient.findUnique({ where: { userId } })
}
