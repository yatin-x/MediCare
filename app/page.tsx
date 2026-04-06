'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [doctorName, setDoctorName] = useState('')
  const [patientName, setPatientName] = useState('')
  const [loading, setLoading] = useState(false)
  const [joinId, setJoinId] = useState('')
  const [tab, setTab] = useState<'create' | 'join'>('create')

  async function createRoom() {
    if (!doctorName.trim() || !patientName.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorName, patientName })
      })
          if (!res.ok) {
      const text = await res.text();
      console.error("API ERROR:", text); // 👈 THIS WILL SHOW REAL ISSUE
      throw new Error("Request failed");
}
      const { roomId } = await res.json()
      router.push(`/room/${roomId}?role=doctor&name=${encodeURIComponent(doctorName)}`)
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  function joinRoom() {
    if (!joinId.trim()) return
    router.push(`/room/${joinId.trim().toUpperCase()}?role=patient&name=Patient`)
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: 48, height: 48, background: 'var(--accent)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>⚕</div>
          <h1 className="font-display" style={{ fontSize: '2.5rem', color: 'var(--text-primary)' }}>MedAssist</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '400px' }}>
          AI-assisted clinical documentation. Consult, transcribe, and generate structured medical records automatically.
        </p>
      </div>

      {/* Card */}
      <div className="glass" style={{ width: '100%', maxWidth: '440px', padding: '32px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', background: 'var(--bg)', borderRadius: '8px', padding: '4px' }}>
          {(['create', 'join'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--accent)' : 'transparent',
                color: tab === t ? '#0a0f1e' : 'var(--text-secondary)',
                fontWeight: 600, fontSize: '14px', transition: 'all 0.2s'
              }}>
              {t === 'create' ? '+ New Consultation' : 'Join Room'}
            </button>
          ))}
        </div>

        {tab === 'create' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Doctor Name</label>
              <input value={doctorName} onChange={e => setDoctorName(e.target.value)}
                placeholder="Dr. Sharma"
                style={{ width: '100%', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '15px', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Patient Name</label>
              <input value={patientName} onChange={e => setPatientName(e.target.value)}
                placeholder="Rahul Mehta"
                style={{ width: '100%', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '15px', outline: 'none' }} />
            </div>
            <button onClick={createRoom} disabled={loading || !doctorName || !patientName}
              className="btn-primary"
              style={{ width: '100%', padding: '12px', marginTop: '8px', opacity: (!doctorName || !patientName) ? 0.5 : 1 }}>
              {loading ? 'Creating...' : 'Start Consultation →'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Room ID</label>
              <input value={joinId} onChange={e => setJoinId(e.target.value.toUpperCase())}
                placeholder="e.g. A3F9B2C1"
                className="font-mono"
                style={{ width: '100%', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--accent)', fontSize: '18px', letterSpacing: '0.1em', outline: 'none' }} />
            </div>
            <button onClick={joinRoom} disabled={!joinId.trim()}
              className="btn-primary"
              style={{ width: '100%', padding: '12px', opacity: !joinId.trim() ? 0.5 : 1 }}>
              Join Consultation →
            </button>
          </div>
        )}
      </div>

      {/* Dashboard link */}
      <div style={{ marginTop: '32px' }}>
        <a href="/dashboard" style={{ color: 'var(--text-secondary)', fontSize: '14px', textDecoration: 'none', borderBottom: '1px solid var(--border)', paddingBottom: '2px' }}>
          View Visit History →
        </a>
      </div>

      {/* Features */}
      <div style={{ display: 'flex', gap: '24px', marginTop: '48px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { icon: '🎤', label: 'Live Transcription' },
          { icon: '🧠', label: 'ML Urgency Classification' },
          { icon: '📋', label: 'Auto Documentation' },
          { icon: '🗄️', label: 'PostgreSQL Records' },
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
            <span>{f.icon}</span>
            <span>{f.label}</span>
          </div>
        ))}
      </div>
    </main>
  )
}
