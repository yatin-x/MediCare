import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAppUser, isPatient } from '@/lib/session'
import { ensurePatientChart } from '@/lib/patientAccount'

function parseAllergies(raw: unknown): string[] | undefined {
  if (typeof raw !== 'string') return undefined
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export async function GET() {
  const user = await getAppUser()
  if (!user || !isPatient(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const chart = await ensurePatientChart(user)
  return NextResponse.json({ patient: chart })
}

export async function PATCH(req: Request) {
  const user = await getAppUser()
  if (!user || !isPatient(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const chart = await ensurePatientChart(user)
  if (!chart) {
    return NextResponse.json({ error: 'No chart' }, { status: 500 })
  }

  const body = await req.json()
  const name = typeof body.name === 'string' ? body.name.trim() : undefined
  const bloodGroup = typeof body.bloodGroup === 'string' ? body.bloodGroup.trim() : undefined
  const allergies = parseAllergies(body.allergies)

  const patient = await prisma.patient.update({
    where: { id: chart.id },
    data: {
      ...(name ? { name } : {}),
      ...(bloodGroup !== undefined ? { bloodGroup: bloodGroup || null } : {}),
      ...(allergies ? { allergies } : {}),
    },
  })

  if (name) {
    await prisma.user.update({
      where: { id: user.id },
      data: { name },
    })
  }

  return NextResponse.json({ patient })
}
