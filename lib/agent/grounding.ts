export function isUnusableTranscriptChunk(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (/\[BLANK_AUDIO\]/i.test(t)) return true
  if (/^blank audio$/i.test(t)) return true
  return false
}

export function findQuoteSpan(transcript: string, needle: string): { quote: string; start: number; end: number } | null {
  const hay = transcript
  const idx = hay.toLowerCase().indexOf(needle.toLowerCase())
  if (idx < 0) return null
  return { quote: hay.slice(idx, idx + needle.length), start: idx, end: idx + needle.length }
}

export function groundClaims(
  transcript: string,
  extracted: { symptoms: string[]; medicines: string[]; advice: string[]; duration: string | null }
): { id: string; kind: 'symptom' | 'medicine' | 'advice' | 'duration'; text: string; quote: string; start: number; end: number }[] {
  const claims: { id: string; kind: 'symptom' | 'medicine' | 'advice' | 'duration'; text: string; quote: string; start: number; end: number }[] = []
  let n = 0
  const push = (kind: 'symptom' | 'medicine' | 'advice' | 'duration', text: string) => {
    const span = findQuoteSpan(transcript, text)
    if (!span) return
    n += 1
    claims.push({ id: `c${n}`, kind, text, ...span })
  }
  for (const s of extracted.symptoms) push('symptom', s)
  for (const m of extracted.medicines) push('medicine', m)
  for (const a of extracted.advice) push('advice', a)
  if (extracted.duration) push('duration', extracted.duration)
  return claims
}

export function claimCoverage(claimsCount: number, extractedCount: number): number {
  if (extractedCount === 0) return 1
  return claimsCount / extractedCount
}
