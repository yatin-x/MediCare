import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { preprocessText, extractInformation, generateSummary } from '@/lib/nlp'

export async function POST(req: Request) {
  try {
    const { roomId, transcript } = await req.json()

    if (!roomId || !transcript) {
      return NextResponse.json({ error: 'roomId and transcript required' }, { status: 400 })
    }

    // Step 3: Preprocess
    const cleanText = preprocessText(transcript)

    // Step 4: Extract information
    const extracted = extractInformation(cleanText)

    // Step 5: Urgency classification
    // Day 4: This will call ML FastAPI. For now → rule-based fallback
    let urgency = 'low'
    let confidence = 0.75

    try {
      const mlRes = await fetch(`${process.env.ML_API_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText }),
        signal: AbortSignal.timeout(3000)
      })
      if (mlRes.ok) {
        const mlData = await mlRes.json()
        urgency = mlData.urgency
        confidence = mlData.confidence
      }
    } catch {
      // ML server not up yet (Days 1-3) — use rule-based fallback
      const highWords = ['chest pain', 'difficulty breathing', 'seizure', 'bleeding', 'unconscious']
      const mediumWords = ['fever', 'infection', 'headache', 'vomiting', 'pain']
      if (highWords.some(w => cleanText.includes(w))) {
        urgency = 'high'; confidence = 0.80
      } else if (mediumWords.some(w => cleanText.includes(w))) {
        urgency = 'medium'; confidence = 0.78
      }
    }

    // Step 6: Generate summary
    const summary = generateSummary(extracted, urgency, confidence)

    // Step 7: Save to PostgreSQL
    const visit = await prisma.visit.update({
      where: { roomId },
      data: {
        transcript,
        cleanText,
        symptoms: extracted.symptoms,
        medicines: extracted.medicines,
        advice: extracted.advice,
        duration: extracted.duration ?? undefined,
        urgency,
        confidence,
        summary,
        status: 'completed'
      }
    })

    return NextResponse.json({
      success: true,
      visitId: visit.id,
      extracted,
      urgency,
      confidence,
      summary
    })
  } catch (error) {
    console.error('Analysis error:', error)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
