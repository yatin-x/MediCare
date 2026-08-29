import type { ExtractedInfo, SupervisorPlan, WorkerName } from './types.ts'
import { mentionsMedication, predictUrgencyRules } from './rules.ts'
import { isUnusableTranscriptChunk } from './grounding.ts'

export const TOOL_DESCRIPTORS = [
  {
    name: 'getVisit',
    description: 'Load visit record by id or roomId',
    inputSchema: { type: 'object', properties: { visitId: { type: 'string' }, roomId: { type: 'string' } } },
  },
  {
    name: 'getPatientChart',
    description: 'Load allergies and notes for the visit patient',
    inputSchema: { type: 'object', properties: { patientId: { type: 'string' } }, required: ['patientId'] },
  },
  {
    name: 'listPriorVisits',
    description: 'Approved prior visit summaries for the same patient',
    inputSchema: { type: 'object', properties: { patientId: { type: 'string' }, excludeVisitId: { type: 'string' } } },
  },
  {
    name: 'predictUrgencyML',
    description: 'Call FastAPI sklearn urgency model',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'predictUrgencyRules',
    description: 'Deterministic keyword urgency (no random fuzz)',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'keywordExtract',
    description: 'Keyword NER fallback for symptoms/meds/advice',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
] as const

export function decideWorkers(transcript: string, extracted: ExtractedInfo, allergies: string[]): SupervisorPlan {
  const reasons: string[] = []
  const usable = transcript.trim() && !isUnusableTranscriptChunk(transcript)
  if (!usable) {
    return { workers: [], reasons: ['empty or unusable transcript'], emptyTranscript: true }
  }

  const workers: WorkerName[] = ['documentation']
  reasons.push('transcript present → documentation')

  const rules = predictUrgencyRules(transcript)
  const hasMeds = extracted.medicines.length > 0 || mentionsMedication(transcript)
  const hasAllergies = allergies.length > 0

  if (hasMeds || hasAllergies) {
    workers.push('safety')
    reasons.push('meds or allergy list present → safety')
  }

  workers.push('risk')
  reasons.push(rules.urgency === 'high' ? 'rule hits require risk worker' : 'hybrid risk always compared to sklearn')

  if (rules.urgency === 'high' || extracted.advice.some(a => /follow up|come back|revisit/i.test(a))) {
    workers.push('follow_up')
    reasons.push('high urgency or follow-up language → follow-up draft')
  }

  workers.push('auditor')
  reasons.push('auditor always last')

  return { workers, reasons, emptyTranscript: false }
}

export function buildSoapDraft(
  extracted: ExtractedInfo,
  urgency: string,
  claimsCount: number,
  history?: { visitNumber: number; patientName: string; priorLines: string[] },
): string {
  const incomplete = claimsCount === 0 ? ' [DRAFT INCOMPLETE — no grounded claims]' : ''
  const header = history
    ? [
        `Patient: ${history.patientName} · this is visit #${history.visitNumber}.`,
        history.priorLines.length
          ? `Prior visits:\n${history.priorLines.join('\n')}`
          : 'No prior visits on file for this patient.',
      ].join('\n')
    : null
  return [
    ...(header ? [header, ''] : []),
    `S: ${extracted.symptoms.length ? extracted.symptoms.join(', ') : 'not stated in transcript'}`,
    'O: not captured (video consult; no vitals ingested).',
    `A: draft urgency ${urgency.toUpperCase()} — not a diagnosis.`,
    `P: ${extracted.advice.length ? extracted.advice.join(', ') : 'none extracted'}.`,
    extracted.duration ? `Duration mentioned: ${extracted.duration}.` : 'Duration not stated.',
  ].join('\n') + incomplete
}

export function buildPatientSummary(
  extracted: ExtractedInfo,
  urgency: string,
  visitNumber: number,
): string {
  const sx = extracted.symptoms.length ? extracted.symptoms.join(', ') : 'what you described on the call'
  const plan = extracted.advice.length
    ? extracted.advice.join(', ')
    : 'follow the instructions your doctor gave during the visit'
  const meds = extracted.medicines.length
    ? `Medicines mentioned on the call (not a prescription): ${extracted.medicines.join(', ')}.`
    : 'No medicines were picked up from the transcript.'
  return [
    `This was visit #${visitNumber}.`,
    `What you talked about: ${sx}.`,
    extracted.duration ? `How long it has been going on: ${extracted.duration}.` : null,
    meds,
    `What to do next (from the visit — not a diagnosis): ${plan}.`,
    `The system flagged urgency as ${urgency} for your doctor to review.`,
    'If you have chest pain, trouble breathing, or feel suddenly worse, seek emergency care.',
  ].filter(Boolean).join('\n')
}

export function auditorFlags(opts: {
  transcript: string
  extracted: ExtractedInfo
  claimsCount: number
  allergyConflicts: string[]
}): string[] {
  const flags: string[] = []
  if (!opts.extracted.duration) flags.push('missing duration')
  if (opts.extracted.symptoms.length === 0) flags.push('no symptoms grounded')
  const extractedCount =
    opts.extracted.symptoms.length +
    opts.extracted.medicines.length +
    opts.extracted.advice.length +
    (opts.extracted.duration ? 1 : 0)
  if (extractedCount > 0 && opts.claimsCount < extractedCount) {
    flags.push('some extracted items lack transcript spans')
  }
  if (opts.allergyConflicts.length > 0) flags.push('allergy conflict blocks finalize')
  return flags
}
