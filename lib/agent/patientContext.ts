export type PriorVisitSummary = {
  id: string
  createdAt: Date
  summary: string | null
  soapDraft: string | null
  symptoms: string[]
  medicines: string[]
  urgency: string | null
  noteStatus: string
  status: string
}

export function visitNumberFromPriorCount(priorCount: number): number {
  return priorCount + 1
}

export function formatPriorLine(v: PriorVisitSummary, indexFromOldest: number): string {
  const date = v.createdAt.toISOString().slice(0, 10)
  const sx = v.symptoms.length ? v.symptoms.join(', ') : 'no symptoms stored'
  const meds = v.medicines.length ? v.medicines.join(', ') : 'no meds stored'
  return `Visit ${indexFromOldest}: ${date} · ${v.urgency ?? 'n/a'} · ${sx} · ${meds}`
}
