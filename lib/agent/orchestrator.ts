import { Prisma } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { preprocessText } from '@/lib/nlp'
import { logStep, timedTool } from './audit.ts'
import { groundClaims, isUnusableTranscriptChunk } from './grounding.ts'
import { auditorFlags, buildPatientSummary, buildSoapDraft, decideWorkers } from './policy.ts'
import { mergeUrgency } from './rules.ts'
import { detectAllergyConflicts } from './safety.ts'
import {
  getPatientChart,
  getVisit,
  keywordExtract,
  listPriorVisits,
  predictUrgencyML,
  predictUrgencyRules,
} from './tools.ts'
import { formatPriorLine, visitNumberFromPriorCount } from './patientContext.ts'
import type { ClinicalClaim, EncounterState, ExtractedInfo } from './types.ts'

async function createApprovals(
  visitId: string,
  runId: string,
  items: Array<{ type: string; payload: Record<string, unknown> }>,
) {
  for (const item of items) {
    await prisma.approval.create({
      data: {
        visitId,
        runId,
        type: item.type,
        status: 'pending',
        payload: item.payload as Prisma.InputJsonValue,
      },
    })
  }
}

export async function runEncounterOrchestrator(opts: {
  roomId: string
  transcript: string
}): Promise<{
  visitId: string
  runId: string
  status: string
  urgency: string
  confidence: number
  summary: string
  extracted: ExtractedInfo
  claims: ClinicalClaim[]
  predictionSource: string
  auditorFlags: string[]
  visitNumber: number
  priorLines: string[]
  patientSummary?: string
}> {
  const visit = await getVisit({ roomId: opts.roomId })
  if (!visit) {
    throw new Error(`No visit found for roomId: ${opts.roomId}`)
  }

  const transcript = opts.transcript.trim()
  const run = await prisma.agentRun.create({
    data: {
      visitId: visit.id,
      goal: 'close_encounter',
      status: 'running',
    },
  })

  await logStep(run.id, 'supervisor', 'observe', 'Loaded visit and transcript')

  const plan = decideWorkers(transcript, keywordExtract(transcript), [])
  await prisma.agentRun.update({
    where: { id: run.id },
    data: { plan: plan as unknown as Prisma.InputJsonValue },
  })
  await logStep(run.id, 'supervisor', 'plan', plan.reasons.join('; '))

  let visitNumber = 1
  let priorLines: string[] = []
  let priorRows: Awaited<ReturnType<typeof listPriorVisits>> = []
  if (visit.patientId) {
    priorRows = await listPriorVisits(visit.patientId, visit.id)
    visitNumber = visitNumberFromPriorCount(priorRows.length)
    priorLines = priorRows.map((p, i) => formatPriorLine(p, i + 1))
  }

  if (plan.emptyTranscript || isUnusableTranscriptChunk(transcript)) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'empty_transcript',
        result: { error: 'empty_transcript' },
      },
    })
    await prisma.visit.update({
      where: { id: visit.id },
      data: {
        transcript,
        status: 'ended',
        summary: 'No usable conversation was recorded. Check microphone permissions.',
        noteStatus: 'draft',
      },
    })
    return {
      visitId: visit.id,
      runId: run.id,
      status: 'empty_transcript',
      urgency: 'low',
      confidence: 1,
      summary: 'No usable conversation was recorded. Check microphone permissions.',
      extracted: { symptoms: [], medicines: [], advice: [], duration: null },
      claims: [],
      predictionSource: 'none',
      auditorFlags: ['empty transcript'],
      visitNumber,
      priorLines,
    }
  }

  const state: EncounterState = {
    visitId: visit.id,
    roomId: visit.roomId,
    transcript,
    extracted: { symptoms: [], medicines: [], advice: [], duration: null },
    claims: [],
    chart: { allergies: [], priorSymptoms: [], priorMedicines: [] },
    urgency: 'low',
    confidence: 0.5,
    allergyConflicts: [],
    soapDraft: '',
    auditorFlags: [],
    needsApproval: [],
    visitNumber,
    patientName: visit.patientName ?? 'Patient',
    priorLines,
  }

  // Chart tools (always available; supervisor may skip safety but we still load chart for policy)
  await logStep(run.id, 'supervisor', 'tool_call', 'getVisit + getPatientChart')
  const visitRow = await timedTool(run.id, 'getVisit', { roomId: opts.roomId }, async () => visit)

  if (visitRow.patientId) {
    const chart = await timedTool(run.id, 'getPatientChart', { patientId: visitRow.patientId }, () =>
      getPatientChart(visitRow.patientId!),
    )
    state.chart.allergies = chart?.allergies ?? []
    const prior = await timedTool(
      run.id,
      'listPriorVisits',
      { patientId: visitRow.patientId, excludeVisitId: visit.id },
      async () => priorRows,
    )
    state.chart.priorSymptoms = prior.flatMap(p => p.symptoms)
    state.chart.priorMedicines = prior.flatMap(p => p.medicines)
    await logStep(
      run.id,
      'supervisor',
      'observe',
      `${state.patientName} is on visit #${state.visitNumber} (${prior.length} prior)`,
    )
  }

  // Re-plan with allergies
  const extractedPreview = keywordExtract(transcript)
  const livePlan = decideWorkers(transcript, extractedPreview, state.chart.allergies)
  await logStep(run.id, 'supervisor', 'replan', livePlan.reasons.join('; '))

  for (const worker of livePlan.workers) {
    if (worker === 'documentation') {
      await logStep(run.id, 'documentation', 'extract', 'keywordExtract + ground claims')
      state.extracted = await timedTool(run.id, 'keywordExtract', { text: transcript }, async () =>
        keywordExtract(transcript),
      )
      state.claims = groundClaims(transcript, state.extracted)
      state.soapDraft = buildSoapDraft(state.extracted, 'pending', state.claims.length, {
        visitNumber: state.visitNumber,
        patientName: state.patientName,
        priorLines: state.priorLines,
      })
    }

    if (worker === 'safety') {
      await logStep(run.id, 'safety', 'verify', 'allergy vs extracted medicines')
      state.allergyConflicts = detectAllergyConflicts(state.chart.allergies, state.extracted.medicines)
      if (state.allergyConflicts.length > 0) {
        state.needsApproval.push({
          type: 'allergy_conflict',
          payload: { conflicts: state.allergyConflicts, medicines: state.extracted.medicines },
        })
      }
    }

    if (worker === 'risk') {
      await logStep(run.id, 'risk', 'hybrid', 'sklearn + rules; escalate on disagreement')
      const clean = preprocessText(transcript)
      state.rules = await timedTool(run.id, 'predictUrgencyRules', { text: transcript }, async () =>
        predictUrgencyRules(transcript),
      )
      try {
        state.ml = await timedTool(run.id, 'predictUrgencyML', { text: clean }, () => predictUrgencyML(clean))
      } catch {
        await logStep(run.id, 'risk', 'ml_error', 'FastAPI unavailable — rules only')
      }
      const merged = mergeUrgency(state.ml, state.rules)
      state.urgency = merged.urgency
      state.confidence = merged.confidence
      if (merged.conflict) {
        state.needsApproval.push({
          type: 'urgency_conflict',
          payload: { ml: state.ml, rules: state.rules },
        })
      }
      if (state.urgency === 'high') {
        state.needsApproval.push({
          type: 'urgency_high',
          payload: { urgency: state.urgency, confidence: state.confidence },
        })
      }
      state.soapDraft = buildSoapDraft(state.extracted, state.urgency, state.claims.length, {
        visitNumber: state.visitNumber,
        patientName: state.patientName,
        priorLines: state.priorLines,
      })
    }

    if (worker === 'follow_up' && visit.doctorId && visit.patientId) {
      await logStep(run.id, 'follow_up', 'draft', 'Create pending_approval appointment — never auto-notify')
      const appt = await prisma.appointment.create({
        data: {
          doctorId: visit.doctorId,
          patientId: visit.patientId,
          scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          durationMins: 20,
          type: 'video',
          reason: 'CLEA follow-up draft (requires doctor approval)',
          status: 'pending_approval',
        },
      })
      state.followUpAppointmentId = appt.id
      state.needsApproval.push({
        type: 'follow_up',
        payload: { appointmentId: appt.id },
      })
    }

    if (worker === 'auditor') {
      await logStep(run.id, 'auditor', 'verify', 'completeness + claim coverage')
      state.auditorFlags = auditorFlags({
        transcript,
        extracted: state.extracted,
        claimsCount: state.claims.length,
        allergyConflicts: state.allergyConflicts,
      })
    }
  }

  state.needsApproval.push({
    type: 'note',
    payload: { noteStatus: 'draft' },
  })

  await createApprovals(visit.id, run.id, state.needsApproval)

  const summary = state.soapDraft
  const patientSummary = buildPatientSummary(state.extracted, state.urgency, state.visitNumber)
  const runStatus = state.allergyConflicts.length > 0 || state.needsApproval.some(a => a.type === 'urgency_conflict')
    ? 'needs_approval'
    : 'needs_approval'

  await prisma.visit.update({
    where: { id: visit.id },
    data: {
      transcript,
      cleanText: preprocessText(transcript),
      symptoms: state.extracted.symptoms,
      medicines: state.extracted.medicines,
      advice: state.extracted.advice,
      duration: state.extracted.duration,
      urgency: state.urgency,
      confidence: state.confidence,
      summary,
      soapDraft: state.soapDraft,
      patientSummary,
      noteStatus: 'draft',
      claims: state.claims as unknown as Prisma.InputJsonValue,
      status: 'ended',
    },
  })

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: runStatus,
      result: {
        workers: livePlan.workers,
        urgency: state.urgency,
        confidence: state.confidence,
        allergyConflicts: state.allergyConflicts,
        auditorFlags: state.auditorFlags,
        followUpAppointmentId: state.followUpAppointmentId ?? null,
        visitNumber: state.visitNumber,
        priorVisitCount: state.priorLines.length,
        priorLines: state.priorLines,
      } as Prisma.InputJsonValue,
    },
  })

  return {
    visitId: visit.id,
    runId: run.id,
    status: runStatus,
    urgency: state.urgency,
    confidence: state.confidence,
    summary,
    extracted: state.extracted,
    claims: state.claims,
    predictionSource: state.ml ? (state.rules && state.ml.urgency !== state.rules.urgency ? 'hybrid' : 'ml') : 'rule-based',
    auditorFlags: state.auditorFlags,
    visitNumber: state.visitNumber,
    priorLines: state.priorLines,
    patientSummary,
  }
}
