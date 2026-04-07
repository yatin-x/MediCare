// Step 3: Text Preprocessing
export function preprocessText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')     // remove punctuation
    .replace(/\s+/g, ' ')         // normalize whitespace
    .trim()
}

// Step 4: Information Extraction (Rule-based NER)
const SYMPTOM_KEYWORDS = [
  'fever', 'cough', 'headache', 'pain', 'nausea', 'vomiting',
  'diarrhea', 'fatigue', 'dizziness', 'rash', 'swelling',
  'shortness of breath', 'chest pain', 'sore throat', 'runny nose',
  'chills', 'weakness', 'loss of appetite', 'insomnia', 'anxiety',
  'bleeding', 'seizure', 'numbness', 'blurred vision', 'palpitations'
]

const MEDICINE_KEYWORDS = [
  'paracetamol', 'ibuprofen', 'aspirin', 'amoxicillin', 'azithromycin',
  'metformin', 'atorvastatin', 'omeprazole', 'cetirizine', 'pantoprazole',
  'ciprofloxacin', 'dolo', 'crocin', 'combiflam', 'montair', 'levocet',
  'antibiotics', 'antibiotic', 'tablet', 'capsule', 'syrup', 'injection'
]

const ADVICE_KEYWORDS = [
  'rest', 'drink water', 'stay hydrated', 'avoid spicy', 'light diet',
  'exercise', 'follow up', 'come back', 'revisit', 'sleep well',
  'avoid stress', 'bland diet', 'warm fluids', 'steam inhalation',
  'monitor temperature', 'blood test', 'x-ray', 'scan', 'ultrasound'
]

const DURATION_PATTERNS = [
  /(\d+)\s*(day|days|week|weeks|month|months|hour|hours)/gi,
  /(since\s+\w+)/gi,
  /(for\s+\d+\s+\w+)/gi
]

export interface ExtractedInfo {
  symptoms: string[]
  medicines: string[]
  advice: string[]
  duration: string | null
}

export function extractInformation(text: string): ExtractedInfo {
  const lower = text.toLowerCase()

  const symptoms = SYMPTOM_KEYWORDS.filter(s => lower.includes(s))
  const medicines = MEDICINE_KEYWORDS.filter(m => lower.includes(m))
  const advice = ADVICE_KEYWORDS.filter(a => lower.includes(a))

  let duration: string | null = null
  for (const pattern of DURATION_PATTERNS) {
    const match = lower.match(pattern)
    if (match) {
      duration = match[0]
      break
    }
  }

  return { symptoms, medicines, advice, duration }
}

// Step 6: Template-based Summary Generation
export function generateSummary(
  extracted: ExtractedInfo,
  urgency: string,
  confidence: number
): string {
  const { symptoms, medicines, advice, duration } = extracted

  const urgencyText = {
    low: 'LOW urgency',
    medium: 'MEDIUM urgency',
    high: 'HIGH urgency'
  }[urgency] ?? 'MEDIUM urgency'

  const parts: string[] = []

  // Introductory sentence for a richer summary
  if (symptoms.length > 0) {
    const symptomList = symptoms.join(', ')
    const durationStr = duration ? ` extending over a period of ${duration}` : ''
    parts.push(`The patient reports presenting with the following primary symptoms: ${symptomList}${durationStr}.`)
  } else {
    parts.push('The patient presented for a general consultation with no specific severe symptoms detected in the transcript.')
  }

  if (medicines.length > 0) {
    parts.push(`Following the evaluation, the medical professional has prescribed ${medicines.join(' and ')} for treatment.`)
  } else {
    parts.push('No specific medications were explicitly prescribed during this session.')
  }

  parts.push(`Based on the clinical parameters discussed, this case is classified entirely as ${urgencyText}.`)

  if (advice.length > 0) {
    parts.push(`The doctor strongly advised the patient to ${advice.join(', ')} to ensure a supportive recovery.`)
  }

  return parts.join(' ')
}
