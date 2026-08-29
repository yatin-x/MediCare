export type UrgencyLevel = 'low' | 'medium' | 'high'

export type WorkerName =
  | 'documentation'
  | 'safety'
  | 'risk'
  | 'follow_up'
  | 'auditor'

export interface ClinicalClaim {
  id: string
  kind: 'symptom' | 'medicine' | 'advice' | 'duration' | 'other'
  text: string
  quote: string
  start: number
  end: number
}

export interface ExtractedInfo {
  symptoms: string[]
  medicines: string[]
  advice: string[]
  duration: string | null
}

export interface UrgencyResult {
  urgency: UrgencyLevel
  confidence: number
  source: 'ml' | 'rule-based' | 'hybrid'
  hits?: string[]
  probabilities?: Record<string, number>
}

export interface SupervisorPlan {
  workers: WorkerName[]
  reasons: string[]
  emptyTranscript: boolean
}

export interface EncounterState {
  visitId: string
  roomId: string
  transcript: string
  extracted: ExtractedInfo
  claims: ClinicalClaim[]
  chart: {
    allergies: string[]
    priorSymptoms: string[]
    priorMedicines: string[]
  }
  ml?: UrgencyResult
  rules?: UrgencyResult
  urgency: UrgencyLevel
  confidence: number
  allergyConflicts: string[]
  soapDraft: string
  auditorFlags: string[]
  followUpAppointmentId?: string
  needsApproval: Array<{ type: string; payload: Record<string, unknown> }>
  visitNumber: number
  patientName: string
  priorLines: string[]
}

export interface ToolDescriptor {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}
