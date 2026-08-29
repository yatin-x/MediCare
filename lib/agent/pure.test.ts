import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectAllergyConflicts } from './safety.ts'
import { predictUrgencyRules } from './rules.ts'
import { groundClaims, isUnusableTranscriptChunk } from './grounding.ts'
import { decideWorkers } from './policy.ts'
import { extractInformation } from '../nlp.ts'
import { evaluateGoldens } from './eval.ts'
import { GOLDEN_CASES } from './golden.ts'

test('BLANK_AUDIO is unusable', () => {
  assert.equal(isUnusableTranscriptChunk('[BLANK_AUDIO]'), true)
})

test('rules urgency has no random fuzz', () => {
  const a = predictUrgencyRules('chest pain and shortness of breath')
  const b = predictUrgencyRules('chest pain and shortness of breath')
  assert.equal(a.urgency, 'high')
  assert.equal(a.confidence, b.confidence)
})

test('penicillin vs amoxicillin conflict', () => {
  const c = detectAllergyConflicts(['penicillin'], ['amoxicillin'])
  assert.ok(c.length > 0)
})

test('claims require transcript span', () => {
  const extracted = extractInformation('patient has fever and cough for 3 days')
  const claims = groundClaims('patient has fever and cough for 3 days', extracted)
  assert.ok(claims.length >= 2)
  const missing = groundClaims('hello world', extracted)
  assert.equal(missing.length, 0)
})

test('supervisor skips workers on empty transcript', () => {
  const plan = decideWorkers('', { symptoms: [], medicines: [], advice: [], duration: null }, [])
  assert.equal(plan.emptyTranscript, true)
  assert.equal(plan.workers.length, 0)
})

test('visit numbering is prior count plus one', async () => {
  const { visitNumberFromPriorCount, formatPriorLine } = await import('./patientContext.ts')
  assert.equal(visitNumberFromPriorCount(0), 1)
  assert.equal(visitNumberFromPriorCount(2), 3)
  const line = formatPriorLine({
    id: 'v1',
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    summary: null,
    soapDraft: null,
    symptoms: ['fever'],
    medicines: ['paracetamol'],
    urgency: 'low',
    noteStatus: 'draft',
    status: 'ended',
  }, 1)
  assert.match(line, /Visit 1/)
  assert.match(line, /fever/)
})

test('patient summary is not a diagnosis', async () => {
  const { buildPatientSummary } = await import('./policy.ts')
  const text = buildPatientSummary(
    { symptoms: ['cough'], medicines: ['paracetamol'], advice: ['rest'], duration: '3 days' },
    'low',
    2,
  )
  assert.match(text, /visit #2/)
  assert.match(text, /not a diagnosis/)
  assert.match(text, /not a prescription/)
})

test('golden suite mostly passes', () => {
  const report = evaluateGoldens(GOLDEN_CASES)
  assert.equal(report.fail, 0, JSON.stringify(report.results.map(r => ({ id: r.id, pass: r.pass, workers: r.plan.workers }))))
})
