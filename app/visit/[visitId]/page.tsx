'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'

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

function pillClass(urgency: string | null) {
  if (urgency === 'high') return 'doc-pill doc-pill-high'
  if (urgency === 'medium') return 'doc-pill doc-pill-medium'
  if (urgency === 'low') return 'doc-pill doc-pill-low'
  return 'doc-pill doc-pill-pending'
}

export default function VisitCockpitPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
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
    return (
      <main className="doc-app">
        <header className="doc-topbar">
          <a href="/dashboard" className="doc-brand">MedAssist clinic</a>
        </header>
        <p style={{ padding: 28 }}>{error}</p>
      </main>
    )
  }
  if (!visit) {
    return (
      <main className="doc-app">
        <header className="doc-topbar">
          <a href="/dashboard" className="doc-brand">MedAssist clinic</a>
        </header>
        <p style={{ padding: 28, color: 'var(--doc-muted)' }}>Loading note…</p>
      </main>
    )
  }

  const run = visit.agentRuns[0]
  const claims = Array.isArray(visit.claims) ? visit.claims : []
  const approvals = run?.approvals ?? visit.approvals
  const pending = approvals.filter(a => a.status === 'pending')

  return (
    <main className="doc-app">
      <header className="doc-topbar">
        <a href="/dashboard" className="doc-brand">MedAssist clinic</a>
        <div className="doc-topbar-meta">
          <span>{session?.user?.name || 'Doctor'}</span>
          <button type="button" className="doc-ghost" onClick={() => router.push('/dashboard')}>Queue</button>
          <button type="button" className="doc-ghost" onClick={() => signOut({ callbackUrl: '/' })}>Sign out</button>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 56px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <div>
            <h1 className="font-display" style={{ fontSize: '1.85rem', marginBottom: 8 }}>
              {visit.patientName || 'Patient'} · visit #{visitNumber ?? '—'}
            </h1>
            <p style={{ color: 'var(--doc-muted)', fontSize: 14 }}>
              Room {visit.roomId} · note {visit.noteStatus.replace(/_/g, ' ')}
            </p>
          </div>
          <span className={pillClass(visit.urgency)}>{visit.urgency || 'draft'}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, 0.85fr)', gap: 16 }} className="doc-queue">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className="doc-card" style={{ padding: 22 }}>
              <p className="doc-label">SOAP draft · not a diagnosis</p>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.7, fontFamily: 'inherit', margin: 0 }}>
                {visit.soapDraft || visit.summary || 'No draft yet.'}
              </pre>
            </section>

            {visit.patientSummary && (
              <section className="doc-card" style={{ padding: 22 }}>
                <p className="doc-label">What the patient will see</p>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.65, fontFamily: 'inherit', margin: 0 }}>{visit.patientSummary}</pre>
              </section>
            )}

            <section className="doc-card" style={{ padding: 22 }}>
              <p className="doc-label">Transcript</p>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', margin: 0, color: 'var(--doc-muted)' }}>
                {visit.transcript || 'Empty'}
              </pre>
            </section>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className="doc-card" style={{ padding: 20, borderColor: pending.length ? 'var(--doc-pine)' : undefined }}>
              <p className="doc-label">Approvals {pending.length ? `(${pending.length} waiting)` : ''}</p>
              {approvals.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--doc-muted)' }}>Nothing to sign off.</p>
              ) : approvals.map(a => (
                <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--doc-line)' }}>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{a.type.replace(/_/g, ' ')}</p>
                  <p style={{ fontSize: 12, color: 'var(--doc-muted)', margin: '4px 0 8px' }}>{a.status}</p>
                  {a.status === 'pending' && (
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button disabled={busy === a.id} onClick={() => decide(a.id, 'approved')} className="doc-approve">Approve</button>
                      <button disabled={busy === a.id} onClick={() => decide(a.id, 'rejected')} className="doc-reject">Reject</button>
                    </span>
                  )}
                </div>
              ))}
            </section>

            <section className="doc-card" style={{ padding: 20 }}>
              <p className="doc-label">Prior visits</p>
              {priorVisits.length === 0
                ? <p style={{ color: 'var(--doc-muted)', fontSize: 13 }}>First visit for this patient.</p>
                : priorVisits.map(p => (
                  <p key={p.id} style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.45 }}>{p.line}</p>
                ))}
            </section>

            <section className="doc-card" style={{ padding: 20 }}>
              <p className="doc-label">Grounded claims</p>
              {claims.length === 0 ? (
                <p style={{ color: 'var(--doc-muted)', fontSize: 13 }}>None recorded.</p>
              ) : claims.map(c => (
                <p key={c.id} style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.45 }}>
                  <strong>{c.kind}</strong> {c.text}
                  {c.quote ? <span style={{ color: 'var(--doc-muted)' }}> — “{c.quote}”</span> : null}
                </p>
              ))}
            </section>

            <details className="doc-card" style={{ padding: 20 }}>
              <summary className="doc-label" style={{ cursor: 'pointer', marginBottom: 0 }}>Agent trace</summary>
              <div style={{ marginTop: 12 }}>
                {run?.steps.map(s => (
                  <div key={s.id} style={{ fontSize: 13, marginBottom: 10, borderLeft: '2px solid var(--doc-line)', paddingLeft: 10 }}>
                    <strong>{s.agent}</strong> · {s.action}
                    {s.thought ? <div style={{ color: 'var(--doc-muted)' }}>{s.thought}</div> : null}
                  </div>
                ))}
                {run?.toolCalls.map(t => (
                  <div key={t.id} style={{ fontSize: 12, color: t.ok ? 'var(--doc-low)' : 'var(--doc-high)', marginBottom: 4 }}>
                    {t.tool} · {t.latencyMs}ms · {t.ok ? 'ok' : 'fail'}
                  </div>
                ))}
              </div>
            </details>
          </div>
        </div>
      </div>
    </main>
  )
}
