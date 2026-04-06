import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { preprocessText, extractInformation, generateSummary } from "@/lib/nlp";
 
// ── Types ─────────────────────────────────────────────────────────────────────
interface MLPredictResponse {
  urgency: "low" | "medium" | "high";
  confidence: number;
  probabilities: Record<string, number>;
  model_version: string;
}
 
interface AnalyzeRequestBody {
  roomId: string;
  transcript: string;
  patientId?: string;   // optional until Day 5 auth is wired
}
 
// ── ML call with timeout + fallback ──────────────────────────────────────────
const ML_API_URL = process.env.ML_API_URL ?? "http://localhost:8000";
const ML_TIMEOUT_MS = 5000;
 
async function callMLService(cleanText: string): Promise<{
  urgency: "low" | "medium" | "high";
  confidence: number;
  source: "ml" | "rule-based";
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
 
    const res = await fetch(`${ML_API_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleanText }),
      signal: controller.signal,
    });
    clearTimeout(timer);
 
    if (!res.ok) {
      throw new Error(`ML service responded with status ${res.status}`);
    }
 
    const data: MLPredictResponse = await res.json();
    return {
      urgency: data.urgency,
      confidence: data.confidence,
      source: "ml",
    };
  } catch (err) {
    // ML service is down or timed out → fall back silently
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(`[analyze] ML service unavailable (${errorMessage}) — using rule-based fallback`);
    return ruleBasedUrgency(cleanText);
  }
}
 
// ── Rule-based urgency fallback ───────────────────────────────────────────────
function ruleBasedUrgency(text: string): {
  urgency: "low" | "medium" | "high";
  confidence: number;
  source: "rule-based";
} {
  const HIGH_KEYWORDS = [
    "chest pain", "heart attack", "stroke", "difficulty breathing",
    "shortness of breath", "severe", "emergency", "unconscious",
    "seizure", "blood pressure", "radiating", "worst headache",
  ];
  const MEDIUM_KEYWORDS = [
    "persistent", "moderate", "recurring", "worsening",
    "fever", "infection", "inflammation", "follow up",
  ];
 
  const lower = text.toLowerCase();
  const highScore  = HIGH_KEYWORDS.filter(k => lower.includes(k)).length;
  const medScore   = MEDIUM_KEYWORDS.filter(k => lower.includes(k)).length;
 
  if (highScore >= 2)  return { urgency: "high",   confidence: 0.70, source: "rule-based" };
  if (highScore === 1) return { urgency: "medium",  confidence: 0.60, source: "rule-based" };
  if (medScore  >= 1)  return { urgency: "medium",  confidence: 0.55, source: "rule-based" };
  return                      { urgency: "low",     confidence: 0.65, source: "rule-based" };
}
 
// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequestBody = await req.json();
    const { roomId, transcript, patientId } = body;
 
    // ── Validation ────────────────────────────────────────────────────────────
    if (!roomId?.trim()) {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }
    if (!transcript?.trim()) {
      return NextResponse.json({ error: "transcript is required" }, { status: 400 });
    }
 
    // ── NLP pipeline ──────────────────────────────────────────────────────────
    const cleanText  = preprocessText(transcript);
    const extracted  = extractInformation(cleanText);   // { symptoms, medicines, advice, duration }
 
    // ── ML prediction (with fallback) ─────────────────────────────────────────
    const { urgency, confidence, source } = await callMLService(cleanText);
    console.log(`[analyze] urgency=${urgency} confidence=${confidence} source=${source}`);
 
    // ── Summary generation ────────────────────────────────────────────────────
    const summary = generateSummary(extracted, urgency, confidence);
 
    // ── Find the Visit record created when the room was opened ────────────────
    const visit = await prisma.visit.findFirst({
      where: { roomId },
      orderBy: { createdAt: "desc" },
    });
 
    if (!visit) {
      return NextResponse.json(
        { error: `No visit found for roomId: ${roomId}` },
        { status: 404 }
      );
    }
 
    // ── Persist analysis results ──────────────────────────────────────────────
    const updated = await prisma.visit.update({
      where: { id: visit.id },
      data: {
        transcript,
        cleanText,
        symptoms:  extracted.symptoms,
        medicines: extracted.medicines,
        advice:    extracted.advice,
        urgency,
        confidence,
        summary,
        // Link patient if provided (Day 5: always provided after auth)
        ...(patientId ? { patientId } : {}),
      },
    });
 
    return NextResponse.json({
      success: true,
      visitId: updated.id,
      urgency,
      confidence,
      predictionSource: source,   // "ml" or "rule-based" — useful for dashboard debug
      extracted,
      summary,
    });
  } catch (err) {
    console.error("[analyze] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error during analysis" },
      { status: 500 }
    );
  }
}