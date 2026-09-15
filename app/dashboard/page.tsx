'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'

interface Visit {
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
  patientSummary?: string | null
  report: string | null
  status: string
  createdAt: string
  visitNumber?: number
}

function pillClass(urgency: string | null) {
  if (urgency === 'high') return 'doc-pill doc-pill-high'
  if (urgency === 'medium') return 'doc-pill doc-pill-medium'
  if (urgency === 'low') return 'doc-pill doc-pill-low'
  return 'doc-pill doc-pill-pending'
}

function DashboardInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const roomFromUrl = searchParams.get('roomId')?.trim().toUpperCase() || ''

  const [roomLookup, setRoomLookup] = useState(roomFromUrl)
  const [mode, setMode] = useState<'doctor' | 'patient' | null>(null)
  const [patientName, setPatientName] = useState<string | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Visit | null>(null)
  const [filter, setFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all')
  const [appointments, setAppointments] = useState<Array<{
    id: string
    scheduledAt: string
    status: string
    reason: string | null
    patient: { name: string; email?: string | null }
    visit: { roomId: string } | null
  }>>([])
  const [walkInName, setWalkInName] = useState('')
  const [walkInAllergies, setWalkInAllergies] = useState('')
  const [starting, setStarting] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'patient') {
      router.replace('/patient')
    }
  }, [status, session, router])

  useEffect(() => {
    if (roomFromUrl) setRoomLookup(roomFromUrl)
  }, [roomFromUrl])

  useEffect(() => {
    const storedRole = typeof window !== 'undefined' ? sessionStorage.getItem('medassist.role') : null
    const storedRoom = typeof window !== 'undefined' ? sessionStorage.getItem('medassist.roomId') : null
    const roomId = roomFromUrl || (storedRole === 'patient' ? (storedRoom || '') : '')
    if (roomId && !roomFromUrl) setRoomLookup(roomId)

    const query = roomId ? `?roomId=${encodeURIComponent(roomId)}` : ''
    setLoading(true)
    setError('')
    fetch(`/api/visits${query}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Failed to load visits')
        return d
      })
      .then(d => {
        const list: Visit[] = d.visits || []
        setMode(d.mode === 'patient' ? 'patient' : 'doctor')
        setPatientName(d.patientName ?? null)
        setVisits(list)
        setSelected(list[0] ?? null)
        setLoading(false)
      })
      .catch(e => {
        setVisits([])
        setSelected(null)
        setMode(roomId ? 'patient' : null)
        setError(e instanceof Error ? e.message : 'Failed to load')
        setLoading(false)
      })
  }, [roomFromUrl, status])

  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role === 'patient') return
    fetch('/api/appointments').then(r => r.json()).then(d => setAppointments(d.appointments ?? []))
  }, [status, session])

  async function startAppointment(id: string) {
    setStarting(id)
    const res = await fetch(`/api/appointments/${id}/start`, { method: 'POST' })
    const data = await res.json()
    setStarting(null)
    if (!res.ok) {
      setError(data.error || 'Could not start')
      return
    }
    router.push(`/room/${data.roomId}?role=doctor&name=${encodeURIComponent(session?.user?.name || 'Doctor')}`)
  }

  async function walkIn() {
    if (!walkInName.trim()) return
    setStarting('walkin')
    const res = await fetch('/api/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientName: walkInName, allergies: walkInAllergies }),
    })
    const data = await res.json()
    setStarting(null)
    if (!res.ok) {
      setError(data.error || 'Could not create room')
      return
    }
    router.push(`/room/${data.roomId}?role=doctor&name=${encodeURIComponent(session?.user?.name || 'Doctor')}`)
  }

  function lookupRoom(e: React.FormEvent) {
    e.preventDefault()
    const id = roomLookup.trim().toUpperCase()
    if (!id) return
    sessionStorage.setItem('medassist.roomId', id)
    sessionStorage.setItem('medassist.role', 'patient')
    router.push(`/dashboard?roomId=${encodeURIComponent(id)}`)
  }

  const isPatient = mode === 'patient'
  const showPatientLookup = status !== 'authenticated'
  const filtered = filter === 'all' ? visits : visits.filter(v => v.urgency === filter)

  const counts = {
    all: visits.length,
    high: visits.filter(v => v.urgency === 'high').length,
    medium: visits.filter(v => v.urgency === 'medium').length,
    low: visits.filter(v => v.urgency === 'low').length,
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  }

  function visitOrdinal(visit: Visit) {
    return visit.visitNumber ?? 1
  }

  const reportText = selected ? (selected.patientSummary || selected.report || selected.soapDraft || selected.summary) : null
  const isDoctorWorkspace = session?.user?.role !== 'patient' && status === 'authenticated'
  const now = Date.now()
  const queue = appointments
    .filter(a => a.status !== 'cancelled')
    .filter(a => a.status === 'in_progress' || a.visit || new Date(a.scheduledAt).getTime() > now - 12 * 60 * 60 * 1000)
    .sort((a, b) => {
      const live = (x: typeof a) => (x.status === 'in_progress' || x.visit ? 0 : 1)
      if (live(a) !== live(b)) return live(a) - live(b)
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    })
    .slice(0, 12)

  return (
    <main className={isDoctorWorkspace ? 'doc-app' : undefined} style={isDoctorWorkspace ? undefined : { minHeight: '100vh', background: 'var(--bg)' }}>
      {isDoctorWorkspace && (
        <header className="doc-topbar">
          <a href="/dashboard" className="doc-brand">MedAssist clinic</a>
          <div className="doc-topbar-meta">
            <span>{session?.user?.name || 'Doctor'}</span>
            <button type="button" className="doc-ghost" onClick={() => signOut({ callbackUrl: '/' })}>Sign out</button>
          </div>
        </header>
      )}
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: isDoctorWorkspace ? '28px 24px 48px' : 24 }}>

        {!isDoctorWorkspace && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="font-display" style={{ fontSize: '2rem' }}>
              {isPatient ? 'Your visit history' : 'Visit History'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
              {isPatient
                ? `${patientName ? `${patientName} · ` : ''}reports from your consultations`
                : 'Sign in as a doctor to run today’s clinic.'}
            </p>
          </div>
          <button onClick={() => router.push('/')} style={{ padding: '8px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
            Home
          </button>
        </div>
        )}

        {isDoctorWorkspace && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
              <div>
                <h1 className="font-display" style={{ fontSize: '2rem', marginBottom: 6 }}>Today’s clinic</h1>
                <p style={{ color: 'var(--doc-muted)', fontSize: 14, maxWidth: 520 }}>
                  Start the booking that matches the waiting patient. They join from their Home screen, or with the room ID on the call.
                </p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.8fr)', gap: 16, marginBottom: 28 }}>
              <section className="doc-card" style={{ padding: 20 }}>
                <p className="doc-label">Queue</p>
                {queue.length === 0 ? (
                  <p style={{ color: 'var(--doc-muted)', fontSize: 14, lineHeight: 1.5 }}>
                    No live or upcoming bookings. Patients book this doctor account, then you start their row.
                  </p>
                ) : queue.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--doc-line)' }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600 }}>{a.patient.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--doc-muted)', marginTop: 3 }}>
                        {new Date(a.scheduledAt).toLocaleString('en-IN')} · {a.status.replace(/_/g, ' ')}
                        {a.visit?.roomId ? ` · ${a.visit.roomId}` : ''}
                        {a.reason ? ` · ${a.reason}` : ''}
                      </p>
                    </div>
                    <button disabled={starting === a.id} onClick={() => startAppointment(a.id)} className="doc-primary">
                      {a.visit ? 'Rejoin' : (starting === a.id ? 'Opening…' : 'Start')}
                    </button>
                  </div>
                ))}
              </section>
              <section className="doc-card" style={{ padding: 20 }}>
                <p className="doc-label">Walk-in</p>
                <input className="doc-input" value={walkInName} onChange={e => setWalkInName(e.target.value)} placeholder="Patient name" style={{ marginBottom: 8 }} />
                <input className="doc-input" value={walkInAllergies} onChange={e => setWalkInAllergies(e.target.value)} placeholder="Allergies (optional)" style={{ marginBottom: 12 }} />
                <button onClick={walkIn} disabled={!walkInName.trim() || starting === 'walkin'} className="doc-primary" style={{ width: '100%' }}>
                  {starting === 'walkin' ? 'Creating…' : 'Open walk-in room'}
                </button>
              </section>
            </div>
            <p className="doc-label">Charts</p>
          </>
        )}

        {showPatientLookup && (
          <form onSubmit={lookupRoom} className="glass" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Room ID</label>
            <input
              value={roomLookup}
              onChange={e => setRoomLookup(e.target.value.toUpperCase())}
              placeholder="e.g. A3F9B2C1"
              className="font-mono"
              style={{ flex: 1, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--accent)', letterSpacing: '0.08em' }}
            />
            <button type="submit" className="btn-primary" style={{ padding: '8px 14px' }}>Show my visits</button>
          </form>
        )}

        {error && (
          <div className="glass" style={{ padding: 16, marginBottom: 16, color: '#f59e0b' }}>{error}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {(['all', 'high', 'medium', 'low'] as const).map(key => (
            <button key={key} type="button" className={isDoctorWorkspace ? 'doc-stat' : undefined} data-on={filter === key ? 'true' : 'false'} onClick={() => setFilter(key)}
              style={isDoctorWorkspace ? undefined : {
                padding: 16, borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                background: filter === key ? 'var(--surface-2)' : 'var(--surface)',
                border: '1px solid var(--border)',
              }}>
              <p style={{ fontSize: 24, fontWeight: 700 }}>{counts[key]}</p>
              <p style={{ fontSize: 12, color: isDoctorWorkspace ? 'var(--doc-muted)' : 'var(--text-secondary)', marginTop: 2, textTransform: 'capitalize' }}>
                {key === 'all' ? 'All charts' : key}
              </p>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {loading ? (
              <div className="glass" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading visits...
              </div>
            ) : filtered.length === 0 ? (
              <div className="glass" style={{ padding: '48px', textAlign: 'center' }}>
                <p style={{ fontSize: '32px', marginBottom: '12px' }}>🏥</p>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {isPatient
                    ? 'No visits found for this room yet. Use the same room ID from your consult, or finish End & Analyze first.'
                    : 'No visits found. Log in as the doctor who created the rooms.'}
                </p>
                <button onClick={() => router.push('/')} className="btn-primary" style={{ marginTop: '16px' }}>
                  Back home
                </button>
              </div>
            ) : (
              filtered.map(visit => {
                const cfg = urgencyConfig[visit.urgency || 'low'] || urgencyConfig.low
                const isActive = selected?.id === visit.id
                return (
                  <div key={visit.id} onClick={() => setSelected(visit)}
                    style={{
                      padding: '16px 20px', borderRadius: '10px', cursor: 'pointer',
                      background: isActive ? cfg.bg : 'var(--surface)',
                      border: `1px solid ${isActive ? cfg.border : 'var(--border)'}`,
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: '16px'
                    }}>
                    <div style={{ fontSize: '24px' }}>{cfg.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <p style={{ fontWeight: 600, fontSize: '15px' }}>
                          {isPatient ? (visit.doctorName ? `Dr. ${visit.doctorName}` : 'Consultation') : (visit.patientName || 'Unknown Patient')}
                          <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}> · visit #{visitOrdinal(visit)}</span>
                        </p>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, textTransform: 'uppercase', fontWeight: 600 }}>
                          {visit.urgency || 'pending'}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        {isPatient ? visit.patientName : `Dr. ${visit.doctorName}`} · {formatDate(visit.createdAt)}
                      </p>
                      {visit.symptoms?.length > 0 && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {visit.symptoms.slice(0, 3).join(', ')}{visit.symptoms.length > 3 ? '...' : ''}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{visit.roomId}</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(isPatient ? `/report/${visit.id}` : `/visit/${visit.id}`)
                        }}
                        style={{ marginTop: 6, fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}
                      >
                        {isPatient ? 'Open report' : 'Cockpit'}
                      </button>
                      <p style={{ fontSize: '11px', color: cfg.color, marginTop: '4px' }}>
                        {visit.confidence ? `${(visit.confidence * 100).toFixed(0)}% conf.` : ''}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {selected && (
            <div className="glass" style={{ width: '380px', padding: '20px', height: 'fit-content', position: 'sticky', top: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <p style={{ fontWeight: 600, fontSize: '15px' }}>
                  Visit #{visitOrdinal(selected)} report
                </p>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>

              {(() => {
                const cfg = urgencyConfig[selected.urgency || 'low'] || urgencyConfig.low
                return (
                  <div style={{ padding: '10px 14px', background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '8px', marginBottom: '14px' }}>
                    <p style={{ color: cfg.color, fontWeight: 700, fontSize: '13px', textTransform: 'uppercase' }}>
                      {cfg.icon} {selected.urgency || 'pending'} urgency
                    </p>
                    {selected.confidence && (
                      <p style={{ color: cfg.color, fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                        {(selected.confidence * 100).toFixed(1)}% confidence
                      </p>
                    )}
                  </div>
                )
              })()}

              <div style={{ marginBottom: '14px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Report</p>
                {reportText ? (
                  <pre style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{reportText}</pre>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    No report yet. End the call and wait for analysis to finish.
                  </p>
                )}
              </div>

              {selected.symptoms?.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Symptoms</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {selected.symptoms.map(s => (
                      <span key={s} style={{ padding: '3px 10px', background: '#ef444418', color: '#ef4444', border: '1px solid #ef444430', borderRadius: '20px', fontSize: '12px' }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {selected.medicines?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Medicines</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {selected.medicines.map(m => (
                      <span key={m} style={{ padding: '3px 10px', background: '#3b82f618', color: '#3b82f6', border: '1px solid #3b82f630', borderRadius: '20px', fontSize: '12px' }}>{m}</span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => router.push(isPatient ? `/report/${selected.id}` : `/visit/${selected.id}`)}
                className="btn-primary"
                style={{ width: '100%', marginTop: 8, padding: '10px' }}
              >
                {isPatient ? 'Full visit report →' : 'Open doctor cockpit →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading dashboard...</main>}>
      <DashboardInner />
    </Suspense>
  )
}
