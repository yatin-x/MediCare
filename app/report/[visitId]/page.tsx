'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

interface PriorVisit {
  id: string
  visitIndex: number
  line: string
}

interface ReportVisit {
  id: string
  roomId: string
  doctorName: string | null
  patientName: string | null
  symptoms: string[]
  medicines: string[]
  advice: string[]
  duration: string | null
  urgency: string | null
  confidence: number | null
  summary: string | null
  soapDraft: string | null
  patientSummary: string | null
  report: string | null
  createdAt: string
  visitNumber: number
}

export default function PatientReportPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const id = params.visitId as string
  const [visit, setVisit] = useState<ReportVisit | null>(null)
  const [priorVisits, setPriorVisits] = useState<PriorVisit[]>([])
  const [followUp, setFollowUp] = useState<{ status: string; scheduledAt: string; reason: string | null } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/visits/${id}/report`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Failed to load report')
        return d
      })
      .then(d => {
        setVisit(d.visit)
        setPriorVisits(d.priorVisits ?? [])
        setFollowUp(d.followUp ?? null)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [id])

  const isPatient = session?.user?.role === 'patient'
  const back = () => router.push(isPatient ? '/patient/visits' : '/dashboard')

  if (error) {
    return (
      <main className="pat-app" style={{ padding: 28 }}>
        <p role="alert">{error}</p>
        <button type="button" className="pat-ghost" style={{ marginTop: 12 }} onClick={() => router.push(isPatient ? '/patient/visits' : '/login?role=patient')}>
          Back
        </button>
      </main>
    )
  }
  if (!visit) {
    return (
      <main className="pat-app" style={{ padding: 28 }}>
        <p aria-busy="true">Loading report…</p>
      </main>
    )
  }

  const care = visit.patientSummary || visit.report || visit.soapDraft || visit.summary

  return (
    <main className="pat-app">
      <a className="pat-skip" href="#report">Skip to report</a>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 56px' }} id="report">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '1.7rem', marginBottom: 6 }}>Visit report</h1>
            <p style={{ color: 'var(--pat-muted)', fontSize: 15 }}>
              Visit #{visit.visitNumber} · {visit.doctorName ? `Dr. ${visit.doctorName}` : 'Consult'} · {new Date(visit.createdAt).toLocaleString('en-IN')}
            </p>
          </div>
          <button type="button" className="pat-ghost" onClick={back}>
            {isPatient ? 'All visits' : 'Dashboard'}
          </button>
        </div>

        {followUp && (
          <section className="pat-card" style={{ padding: 18, marginBottom: 16 }}>
            <h2 className="pat-label">Follow-up</h2>
            {followUp.status === 'pending_approval'
              ? <p>Requested — waiting for the doctor to confirm.</p>
              : <p>Confirmed {new Date(followUp.scheduledAt).toLocaleString('en-IN')}{followUp.reason ? ` · ${followUp.reason}` : ''}</p>}
          </section>
        )}

        <section className="pat-card" style={{ padding: 22, marginBottom: 16 }}>
          <h2 className="pat-label">Care summary (not a diagnosis)</h2>
          {care
            ? <pre style={{ whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 1.7, margin: 0, fontFamily: 'inherit' }}>{care}</pre>
            : <p style={{ color: 'var(--pat-muted)' }}>No written report yet. The consult may still be in progress.</p>}
        </section>

        <section className="pat-card" style={{ padding: 22, marginBottom: 16 }}>
          <h2 className="pat-label">From this visit (not a prescription)</h2>
          <p style={{ marginBottom: 8 }}><strong>Symptoms:</strong> {visit.symptoms.length ? visit.symptoms.join(', ') : 'none listed'}</p>
          <p style={{ marginBottom: 8 }}><strong>Medicines mentioned:</strong> {visit.medicines.length ? visit.medicines.join(', ') : 'none listed'}</p>
          <p><strong>Advice:</strong> {visit.advice.length ? visit.advice.join(', ') : 'none listed'}</p>
        </section>

        <section className="pat-card" style={{ padding: 22 }}>
          <h2 className="pat-label">Earlier visits</h2>
          {priorVisits.length === 0
            ? <p style={{ color: 'var(--pat-muted)' }}>This is your first visit on file.</p>
            : priorVisits.map(p => (
              <p key={p.id} style={{ marginBottom: 8, fontSize: 15 }}>{p.line}</p>
            ))}
        </section>
      </div>
    </main>
  )
}
