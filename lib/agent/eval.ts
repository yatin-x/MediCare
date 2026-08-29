import { decideWorkers } from './policy.ts'
import { groundClaims, isUnusableTranscriptChunk } from './grounding.ts'
import { detectAllergyConflicts } from './safety.ts'
import { mergeUrgency, predictUrgencyRules } from './rules.ts'
import { extractInformation, preprocessText } from '../nlp.ts'

export interface GoldenCase {
  id: string
  transcript: string
  allergies: string[]
  expectedWorkersIncludes: string[]
  expectedAllergyConflict: boolean
  expectedUrgencyAtLeast: 'low' | 'medium' | 'high'
}

export function replayGolden(g: GoldenCase) {
  const extracted = extractInformation(preprocessText(g.transcript))
  const plan = decideWorkers(g.transcript, extracted, g.allergies)
  const claims = groundClaims(g.transcript, extracted)
  const conflicts = detectAllergyConflicts(g.allergies, extracted.medicines)
  const rules = predictUrgencyRules(g.transcript)
  const merged = mergeUrgency(undefined, rules)

  const rank = { low: 0, medium: 1, high: 2 }
  const unusable = isUnusableTranscriptChunk(g.transcript) || !g.transcript.trim()
  const workersOk = g.expectedWorkersIncludes.every(w => plan.workers.includes(w as never))
  const conflictOk = g.expectedAllergyConflict === conflicts.length > 0
  const urgencyOk = plan.emptyTranscript || rank[merged.urgency] >= rank[g.expectedUrgencyAtLeast]
  const emptyOk = plan.emptyTranscript === unusable

  return {
    id: g.id,
    plan,
    extracted,
    claims,
    conflicts,
    rules,
    pass: workersOk && conflictOk && urgencyOk && emptyOk,
    metrics: {
      claimCount: claims.length,
      workerCount: plan.workers.length,
    },
  }
}

export function evaluateGoldens(cases: GoldenCase[]) {
  const results = cases.map(replayGolden)
  const pass = results.filter(r => r.pass).length
  return {
    total: cases.length,
    pass,
    fail: cases.length - pass,
    claimGroundingAvg:
      results.reduce((s, r) => s + r.metrics.claimCount, 0) / Math.max(cases.length, 1),
    results,
  }
}
