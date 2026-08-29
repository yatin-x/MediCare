import { prisma } from '@/lib/prisma'
import { extractInformation, preprocessText } from '@/lib/nlp'
import { predictUrgencyRules } from './rules.ts'
import type { UrgencyResult } from './types.ts'

const ML_API_URL = process.env.ML_API_URL ?? 'http://localhost:8001'
const ML_TIMEOUT_MS = 5000

export async function getVisit(args: { visitId?: string; roomId?: string }) {
  if (args.visitId) {
    return prisma.visit.findUnique({ where: { id: args.visitId } })
  }
  if (args.roomId) {
    return prisma.visit.findFirst({ where: { roomId: args.roomId }, orderBy: { createdAt: 'desc' } })
  }
  return null
}

export async function getPatientChart(patientId: string) {
  return prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, name: true, allergies: true, notes: true, bloodGroup: true },
  })
}

export async function listPriorVisits(patientId: string, excludeVisitId: string) {
  return prisma.visit.findMany({
    where: {
      patientId,
      id: { not: excludeVisitId },
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      summary: true,
      soapDraft: true,
      symptoms: true,
      medicines: true,
      urgency: true,
      noteStatus: true,
      status: true,
    },
  })
}

export async function countPatientVisits(patientId: string) {
  return prisma.visit.count({ where: { patientId } })
}

export async function findPatientByName(doctorId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return null
  return prisma.patient.findFirst({
    where: {
      doctorId,
      name: { equals: trimmed, mode: 'insensitive' },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function predictUrgencyML(text: string): Promise<UrgencyResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS)
  try {
    const res = await fetch(`${ML_API_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`ML ${res.status}`)
    const data = await res.json() as {
      urgency: 'low' | 'medium' | 'high'
      confidence: number
      probabilities?: Record<string, number>
    }
    return {
      urgency: data.urgency,
      confidence: data.confidence,
      source: 'ml',
      probabilities: data.probabilities,
    }
  } catch {
    clearTimeout(timer)
    throw new Error('ml_unavailable')
  }
}

export function keywordExtract(text: string) {
  const clean = preprocessText(text)
  return extractInformation(clean)
}

export { predictUrgencyRules }
