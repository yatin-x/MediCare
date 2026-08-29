'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface Step { id: string; agent: string; action: string; thought: string | null; createdAt: string }
interface Tool { id: string; tool: string; ok: boolean; latencyMs: number; input: unknown; output: unknown }
interface Approval { id: string; type: string; status: string; payload: Record<string, unknown> }
interface Claim { id: string; kind: string; text: string; quote: string; start: number; end: number }

interface VisitPayload {
  id: string
  roomId: string
  patientName: string | null
  transcript: string | null
  summary: string | null
  soapDraft: string | null
  patientSummary?: string | null
  noteStatus: string
  urgency: string | null
  confidence: number | null
  symptoms: string[]
  medicines: string[]
  claims: Claim[] | null
  agentRuns: Array<{
    id: string
    status: string
    plan: { workers?: string[]; reasons?: string[] } | null
    result: Record<string, unknown> | null
    steps: Step[]
    toolCalls: Tool[]
    approvals: Approval[]
  }>
  approvals: Approval[]
}

export default function VisitCockpitPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.visitId as string
  const [visit, setVisit] = useState<VisitPayload | null>(null)
  const [visitNumber, setVisitNumber] = useState<number | null>(null)
  const [priorVisits, setPriorVisits] = useState<Array<{ id: string; line: string }>>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/visits/${id}`)
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Failed to load'); return }
    setVisit(data.visit)
    setVisitNumber(data.visitNumber ?? null)
    setPriorVisits(data.priorVisits ?? [])
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function decide(approvalId: string, status: 'approved' | 'rejected') {
    setBusy(approvalId)
    await fetch('/api/agent/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId, status }),
    })
    await load()
    setBusy(null)
  }

  if (error) {
    return <main style={{ padding: 24 }}><p>{error}</p></main>
  }
  if (!visit) {
    return <main style={{ padding: 24 }}>Loading cockpit...</main>
  }

  const run = visit.agentRuns[0]
  const claims = Array.isArray(visit.claims) ? visit.claims : []

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24 }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 className="font-display" style={{ fontSize: '1.6rem' }}>Doctor cockpit</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {visit.patientName} · visit #{visitNumber ?? '?'} · {visit.roomId} · note {visit.noteStatus} · urgency {visit.urgency ?? 'n/a'}
            </p>
          </div>
          <button onClick={() => router.push('/dashboard')}
            style={{ padding: '8px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
            Dashboard
          </button>
        </div>

        <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>SOAP DRAFT (not a diagnosis)</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{visit.soapDraft || visit.summary}</pre>
        </div>

        {visit.patientSummary && (
          <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>PATIENT CARE PACK (what they see)</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{visit.patientSummary}</pre>
          </div>
        )}

        <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>PRIOR VISITS</p>
          {priorVisits.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>First visit for this patient.</p>
            : priorVisits.map(p => (
              <p key={p.id} style={{ fontSize: 13, marginBottom: 6 }}>{p.line}</p>
            ))}
        </div>

        <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>GROUNDED CLAIMS</p>
          {claims.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>None</p> : claims.map(c => (
            <p key={c.id} style={{ fontSize: 13, marginBottom: 6 }}>
              <strong>{c.kind}</strong> {c.text} — “{c.quote}”
            </p>
          ))}
        </div>

        <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>AGENT TRACE</p>
          {run?.steps.map(s => (
            <div key={s.id} style={{ fontSize: 13, marginBottom: 8, borderLeft: '2px solid var(--border)', paddingLeft: 10 }}>
              <strong>{s.agent}</strong> · {s.action}
              {s.thought ? <div style={{ color: 'var(--text-secondary)' }}>{s.thought}</div> : null}
            </div>
          ))}
          {run?.toolCalls.map(t => (
            <div key={t.id} style={{ fontSize: 12, color: t.ok ? '#10b981' : '#ef4444', marginBottom: 4 }}>
              tool {t.tool} · {t.latencyMs}ms · {t.ok ? 'ok' : 'fail'}
            </div>
          ))}
        </div>

        <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>HUMAN APPROVALS</p>
          {(run?.approvals ?? visit.approvals).map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12 }}>
              <span style={{ fontSize: 13 }}>{a.type} · {a.status}</span>
              {a.status === 'pending' && (
                <span style={{ display: 'flex', gap: 8 }}>
                  <button disabled={busy === a.id} onClick={() => decide(a.id, 'approved')}
                    style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Approve</button>
                  <button disabled={busy === a.id} onClick={() => decide(a.id, 'rejected')}
                    style={{ padding: '6px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Reject</button>
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="glass" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>TRANSCRIPT</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{visit.transcript}</pre>
        </div>
      </div>
    </main>
  )
}
