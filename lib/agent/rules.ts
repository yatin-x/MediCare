import type { UrgencyLevel, UrgencyResult } from './types.ts'

export const HIGH_KEYWORDS = [
  'chest pain', 'heart attack', 'stroke', 'difficulty breathing',
  'shortness of breath', 'severe', 'emergency', 'unconscious',
  'seizure', 'radiating', 'worst headache', 'anaphylaxis',
  'vomiting blood', 'suicidal', 'unresponsive',
]

export const MEDIUM_KEYWORDS = [
  'persistent', 'moderate', 'recurring', 'worsening',
  'fever', 'infection', 'inflammation', 'follow up',
]

export function predictUrgencyRules(text: string): UrgencyResult {
  const lower = text.toLowerCase()
  const highHits = HIGH_KEYWORDS.filter(k => lower.includes(k))
  const medHits = MEDIUM_KEYWORDS.filter(k => lower.includes(k))

  if (highHits.length >= 2) {
    return { urgency: 'high', confidence: 0.82, source: 'rule-based', hits: highHits }
  }
  if (highHits.length === 1) {
    return { urgency: 'high', confidence: 0.74, source: 'rule-based', hits: highHits }
  }
  if (medHits.length >= 1) {
    return { urgency: 'medium', confidence: 0.62, source: 'rule-based', hits: medHits }
  }
  return { urgency: 'low', confidence: 0.55, source: 'rule-based', hits: [] }
}

export function mentionsMedication(text: string): boolean {
  return /\b(amoxicillin|penicillin|ibuprofen|aspirin|paracetamol|antibiotic|tablet|mg)\b/i.test(text)
}

export function mergeUrgency(ml: UrgencyResult | undefined, rules: UrgencyResult): {
  urgency: UrgencyLevel
  confidence: number
  conflict: boolean
} {
  if (!ml) {
    return { urgency: rules.urgency, confidence: rules.confidence, conflict: false }
  }
  const rank = { low: 0, medium: 1, high: 2 }
  const conflict = ml.urgency !== rules.urgency
  const urgency = rank[rules.urgency] >= rank[ml.urgency] ? rules.urgency : ml.urgency
  const confidence = Math.max(ml.confidence, rules.confidence)
  return { urgency, confidence, conflict }
}
