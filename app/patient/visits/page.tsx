'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Visit = {
  id: string
  visitNumber?: number
  doctorName: string | null
  urgency: string | null
  createdAt: string
  patientSummary: string | null
  report: string | null
  symptoms: string[]
}

function pill(urgency: string | null) {
  if (urgency === 'high') return 'pat-pill pat-pill-high'
  if (urgency === 'medium') return 'pat-pill pat-pill-medium'
  if (urgency === 'low') return 'pat-pill pat-pill-low'
  return 'pat-pill'
}

export default function PatientVisitsPage() {
  const router = useRouter()
  const [visits, setVisits] = useState<Visit[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/visits')
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Failed')
        setVisits(d.visits ?? [])
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed'))
  }, [])

  return (
    <main>
      <h1 style={{ fontSize: '1.75rem', marginBottom: 8 }}>Your visits</h1>
      <p style={{ color: 'var(--pat-muted)', marginBottom: 20 }}>Every consult on this account, newest first.</p>
      {error && <p role="alert" style={{ color: 'var(--pat-warn)' }}>{error}</p>}
      {visits === null && !error && (
        <div className="pat-card" style={{ padding: 24, minHeight: 88, color: 'var(--pat-muted)' }} aria-busy="true">Loading visits…</div>
      )}
      {visits && visits.length === 0 && !error && (
        <div className="pat-card" style={{ padding: 24 }}>
          <p style={{ color: 'var(--pat-muted)' }}>No visits yet.</p>
          <Link href="/patient/book" className="pat-cta" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', marginTop: 14 }}>
            Book a consult
          </Link>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visits?.map(v => (
          <button
            key={v.id}
            type="button"
            onClick={() => router.push(`/report/${v.id}`)}
            className="pat-card"
            style={{ textAlign: 'left', padding: 18, cursor: 'pointer', color: 'inherit', width: '100%' }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <p style={{ fontWeight: 700 }}>
                Visit #{v.visitNumber ?? '—'} · {v.doctorName ? `Dr. ${v.doctorName}` : 'Consult'}
              </p>
              <span className={pill(v.urgency)}>{v.urgency || 'pending'}</span>
            </div>
            <p style={{ fontSize: 14, color: 'var(--pat-muted)', marginTop: 6 }}>{new Date(v.createdAt).toLocaleString('en-IN')}</p>
            <p style={{ fontSize: 15, marginTop: 8 }}>
              {(v.patientSummary || v.report || 'No written report yet').slice(0, 160)}
            </p>
          </button>
        ))}
      </div>
    </main>
  )
}
