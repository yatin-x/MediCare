'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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
      <h1 className="font-display" style={{ fontSize: '1.8rem', marginBottom: 8 }}>Book a consult</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
        Pick the doctor who will actually open Dashboard and click Start consult. If two doctors have similar names, use the email.
      </p>

      {doctors.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No doctors are registered yet. Ask someone to create a doctor account first.</p>
      ) : (
        <form onSubmit={book} className="glass" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Doctor</label>
            <select value={doctorId} onChange={e => setDoctorId(e.target.value)}
              style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>{d.name}{d.email ? ` · ${d.email}` : ''}{d.speciality ? ` · ${d.speciality}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Date & time</label>
            <input type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
              style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Reason (optional)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. follow-up cough"
              style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
          </div>
          {error && <p style={{ color: '#f59e0b', fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={busy || !doctorId} className="btn-primary">
            {busy ? 'Booking…' : 'Confirm booking'}
          </button>
        </form>
      )}
    </main>
  )
}
