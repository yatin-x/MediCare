'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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

export default function PatientVisitsPage() {
  const router = useRouter()
  const [visits, setVisits] = useState<Visit[]>([])
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
      <h1 className="font-display" style={{ fontSize: '1.8rem', marginBottom: 8 }}>Your visits</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Timeline for this account — visit numbers and reports.</p>
      {error && <p style={{ color: '#f59e0b' }}>{error}</p>}
      {visits.length === 0 && !error && <p style={{ color: 'var(--text-muted)' }}>No visits yet. Book a consult, then join when the doctor starts.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visits.map(v => (
          <button key={v.id} onClick={() => router.push(`/report/${v.id}`)}
            className="glass"
            style={{ textAlign: 'left', padding: 18, cursor: 'pointer', color: 'inherit', width: '100%' }}>
            <p style={{ fontWeight: 600 }}>Visit #{v.visitNumber ?? '?'} · {v.doctorName ? `Dr. ${v.doctorName}` : 'Consult'} · {v.urgency || 'pending'}</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{new Date(v.createdAt).toLocaleString('en-IN')}</p>
            <p style={{ fontSize: 13, marginTop: 8, color: 'var(--text-secondary)' }}>
              {(v.patientSummary || v.report || 'No written report yet').slice(0, 160)}
            </p>
          </button>
        ))}
      </div>
    </main>
  )
}
