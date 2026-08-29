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

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <p>{error}</p>
        <button onClick={() => router.push(session?.user?.role === 'patient' ? '/patient/visits' : '/login?role=patient')} style={{ marginTop: 12 }}>
          Back
        </button>
      </main>
    )
  }
  if (!visit) {
    return <main style={{ padding: 24 }}>Loading report...</main>
  }

  const care = visit.patientSummary || visit.report || visit.soapDraft || visit.summary
  const isPatient = session?.user?.role === 'patient'

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
          <div>
            <h1 className="font-display" style={{ fontSize: '1.6rem' }}>Visit report</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {visit.patientName} · visit #{visit.visitNumber} · {visit.doctorName ? `Dr. ${visit.doctorName}` : 'consult'} · {new Date(visit.createdAt).toLocaleString('en-IN')}
            </p>
          </div>
          <button onClick={() => router.push(isPatient ? '/patient/visits' : '/dashboard')}
            style={{ padding: '8px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
            {isPatient ? 'All my visits' : 'Dashboard'}
          </button>
        </div>

        {followUp && (
          <div className="glass" style={{ padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>FOLLOW-UP</p>
            {followUp.status === 'pending_approval'
              ? <p>Requested follow-up (waiting for doctor).</p>
              : <p>Confirmed {new Date(followUp.scheduledAt).toLocaleString('en-IN')}{followUp.reason ? ` · ${followUp.reason}` : ''}</p>}
          </div>
        )}

        <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>CARE SUMMARY (not a diagnosis)</p>
          {care
            ? <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, margin: 0, fontFamily: 'inherit' }}>{care}</pre>
            : <p style={{ color: 'var(--text-muted)' }}>No written report yet. The consult may still be in progress.</p>}
        </div>

        <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>FROM THIS VISIT (not a legal prescription)</p>
          <p style={{ fontSize: 13, marginBottom: 6 }}><strong>Symptoms:</strong> {visit.symptoms.length ? visit.symptoms.join(', ') : 'none'}</p>
          <p style={{ fontSize: 13, marginBottom: 6 }}><strong>Medicines mentioned:</strong> {visit.medicines.length ? visit.medicines.join(', ') : 'none'}</p>
          <p style={{ fontSize: 13 }}><strong>Advice:</strong> {visit.advice.length ? visit.advice.join(', ') : 'none'}</p>
        </div>

        <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>EARLIER VISITS</p>
          {priorVisits.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>This is your first visit on file.</p>
            : priorVisits.map(p => (
              <p key={p.id} style={{ fontSize: 13, marginBottom: 8 }}>{p.line}</p>
            ))}
        </div>
      </div>
    </main>
  )
}
