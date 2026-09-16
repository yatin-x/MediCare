'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Doctor = { id: string; name: string; email?: string | null; speciality: string | null }

export default function BookPage() {
  const router = useRouter()
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [doctorId, setDoctorId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/doctors').then(r => r.json()).then(d => {
      const list = d.doctors ?? []
      setDoctors(list)
      if (list[0]) setDoctorId(list[0].id)
    })
  }, [])

  async function book(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorId, scheduledAt, reason }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) {
      setError(data.error || 'Could not book')
      return
    }
    router.push('/patient')
  }

  return (
    <main>
      <h1 style={{ fontSize: '1.75rem', marginBottom: 8 }}>Book a consult</h1>
      <p style={{ color: 'var(--pat-muted)', marginBottom: 20 }}>
        Choose the doctor who will start your call. If two names look similar, pick by email.
      </p>

      {doctors.length === 0 ? (
        <div className="pat-card" style={{ padding: 24 }}>
          <p style={{ color: 'var(--pat-muted)' }}>No doctors are listed yet. Ask your clinic to create a doctor account, then come back here.</p>
          <Link href="/patient" className="pat-ghost" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', marginTop: 16 }}>
            Back home
          </Link>
        </div>
      ) : (
        <form onSubmit={book} className="pat-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="doctor" className="pat-label">Doctor</label>
            <select id="doctor" className="pat-select" value={doctorId} onChange={e => setDoctorId(e.target.value)}>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.email ? ` · ${d.email}` : ''}{d.speciality ? ` · ${d.speciality}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="when" className="pat-label">Date and time</label>
            <input id="when" className="pat-input" type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
          </div>
          <div>
            <label htmlFor="reason" className="pat-label">Reason (optional)</label>
            <input id="reason" className="pat-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. follow-up cough" />
          </div>
          {error && <p role="alert" style={{ color: 'var(--pat-warn)', fontSize: 14 }}>{error}</p>}
          <button type="submit" disabled={busy || !doctorId} className="pat-cta">
            {busy ? 'Booking…' : 'Confirm booking'}
          </button>
        </form>
      )}
    </main>
  )
}
