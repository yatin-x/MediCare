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
    setSaved('Saved. Allergies will be used on the next visit for safety checks.')
  }

  return (
    <main>
      <h1 className="font-display" style={{ fontSize: '1.8rem', marginBottom: 8 }}>Profile</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Allergies here feed the safety worker on your next consult.</p>
      <form onSubmit={save} className="glass" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Blood group</label>
          <input value={bloodGroup} onChange={e => setBloodGroup(e.target.value)} placeholder="e.g. O+"
            style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Allergies (comma separated)</label>
          <input value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="e.g. penicillin"
            style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
        </div>
        {error && <p style={{ color: '#f59e0b', fontSize: 13 }}>{error}</p>}
        {saved && <p style={{ color: 'var(--accent)', fontSize: 13 }}>{saved}</p>}
        <button type="submit" className="btn-primary">Save profile</button>
      </form>
    </main>
  )
}
