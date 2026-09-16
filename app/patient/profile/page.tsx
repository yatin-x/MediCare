'use client'

import { useEffect, useState } from 'react'

export default function PatientProfilePage() {
  const [name, setName] = useState('')
  const [bloodGroup, setBloodGroup] = useState('')
  const [allergies, setAllergies] = useState('')
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/me/profile').then(r => r.json()).then(d => {
      const p = d.patient
      if (!p) return
      setName(p.name || '')
      setBloodGroup(p.bloodGroup || '')
      setAllergies((p.allergies || []).join(', '))
    })
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaved('')
    const res = await fetch('/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, bloodGroup, allergies }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Save failed')
      return
    }
    setSaved('Saved. Allergies will be used for safety checks on your next visit.')
  }

  return (
    <main>
      <h1 style={{ fontSize: '1.75rem', marginBottom: 8 }}>Profile</h1>
      <p style={{ color: 'var(--pat-muted)', marginBottom: 20 }}>
        These details help the doctor see allergies during a consult. They are not a medical record by themselves.
      </p>
      <form onSubmit={save} className="pat-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label htmlFor="name" className="pat-label">Name</label>
          <input id="name" className="pat-input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="blood" className="pat-label">Blood group</label>
          <input id="blood" className="pat-input" value={bloodGroup} onChange={e => setBloodGroup(e.target.value)} placeholder="e.g. O+" />
        </div>
        <div>
          <label htmlFor="allergies" className="pat-label">Allergies (comma separated)</label>
          <input id="allergies" className="pat-input" value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="e.g. penicillin" />
        </div>
        {error && <p role="alert" style={{ color: 'var(--pat-warn)', fontSize: 14 }}>{error}</p>}
        {saved && <p role="status" style={{ color: 'var(--pat-cta)', fontSize: 14 }}>{saved}</p>}
        <button type="submit" className="pat-cta">Save profile</button>
      </form>
    </main>
  )
}
