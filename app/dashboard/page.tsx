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
            <div className="doc-queue" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.8fr)', gap: 16, marginBottom: 28 }}>
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
          <div className={isDoctorWorkspace ? 'doc-card' : 'glass'} style={{ padding: 16, marginBottom: 16, color: isDoctorWorkspace ? 'var(--doc-high)' : '#f59e0b' }}>{error}</div>
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
              <div className={isDoctorWorkspace ? 'doc-card' : 'glass'} style={{ padding: 48, textAlign: 'center', color: isDoctorWorkspace ? 'var(--doc-muted)' : 'var(--text-secondary)' }}>
                Loading charts…
              </div>
            ) : filtered.length === 0 ? (
              <div className={isDoctorWorkspace ? 'doc-card' : 'glass'} style={{ padding: 48, textAlign: 'center' }}>
                <p style={{ color: isDoctorWorkspace ? 'var(--doc-muted)' : 'var(--text-secondary)' }}>
                  {isPatient
                    ? 'No visits found for this room yet. Use the same room ID from your consult, or finish End & Analyze first.'
                    : 'No charts yet. Finish a consult, or sign in as the doctor who ran the rooms.'}
                </p>
              </div>
            ) : (
              filtered.map(visit => {
                const isActive = selected?.id === visit.id
                return (
                  <div key={visit.id} onClick={() => setSelected(visit)} className={isDoctorWorkspace ? 'doc-row' : undefined} data-on={isActive ? 'true' : 'false'}
                    style={isDoctorWorkspace ? undefined : {
                      padding: '16px 20px', borderRadius: 10, cursor: 'pointer',
                      background: isActive ? 'var(--surface-2)' : 'var(--surface)',
                      border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', gap: 16
                    }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <p style={{ fontWeight: 600, fontSize: 15 }}>
                          {isPatient ? (visit.doctorName ? `Dr. ${visit.doctorName}` : 'Consultation') : (visit.patientName || 'Unnamed patient')}
                          <span style={{ fontWeight: 400, color: isDoctorWorkspace ? 'var(--doc-muted)' : 'var(--text-muted)', fontSize: 12 }}> · #{visitOrdinal(visit)}</span>
                        </p>
                        <span className={isDoctorWorkspace ? pillClass(visit.urgency) : undefined} style={isDoctorWorkspace ? undefined : { fontSize: 11, textTransform: 'uppercase' }}>
                          {visit.urgency || 'draft'}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: isDoctorWorkspace ? 'var(--doc-muted)' : 'var(--text-secondary)', marginTop: 4 }}>
                        {formatDate(visit.createdAt)}
                        {visit.symptoms?.length ? ` · ${visit.symptoms.slice(0, 3).join(', ')}` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p className="font-mono" style={{ fontSize: 11, color: isDoctorWorkspace ? 'var(--doc-muted)' : 'var(--text-muted)' }}>{visit.roomId}</p>
                      <button
                        className={isDoctorWorkspace ? 'doc-ghost' : undefined}
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(isPatient ? `/report/${visit.id}` : `/visit/${visit.id}`)
                        }}
                        style={{ marginTop: 6, fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
                      >
                        {isPatient ? 'Report' : 'Open note'}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {selected && (
            <aside className={isDoctorWorkspace ? 'doc-card' : 'glass'} style={{ width: 360, padding: 20, height: 'fit-content', position: 'sticky', top: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 15 }}>{selected.patientName || 'Patient'} · #{visitOrdinal(selected)}</p>
                  <p style={{ fontSize: 12, color: isDoctorWorkspace ? 'var(--doc-muted)' : 'var(--text-muted)', marginTop: 4 }}>{formatDate(selected.createdAt)}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>Close</button>
              </div>
              <span className={isDoctorWorkspace ? pillClass(selected.urgency) : undefined}>{selected.urgency || 'draft'}</span>
              {selected.confidence != null && (
                <p style={{ fontSize: 12, margin: '10px 0 14px', color: isDoctorWorkspace ? 'var(--doc-muted)' : 'var(--text-secondary)' }}>
                  Model confidence {(selected.confidence * 100).toFixed(0)}%
                </p>
              )}
              <p className={isDoctorWorkspace ? 'doc-label' : undefined} style={{ marginTop: 12 }}>Note preview</p>
              {reportText ? (
                <pre style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', maxHeight: 280, overflow: 'auto' }}>{reportText}</pre>
              ) : (
                <p style={{ fontSize: 13, color: isDoctorWorkspace ? 'var(--doc-muted)' : 'var(--text-muted)' }}>No note yet. End the call and wait for analysis.</p>
              )}
              <button
                onClick={() => router.push(isPatient ? `/report/${selected.id}` : `/visit/${selected.id}`)}
                className={isDoctorWorkspace ? 'doc-primary' : 'btn-primary'}
                style={{ width: '100%', marginTop: 16, padding: 10 }}
              >
                {isPatient ? 'Full report' : 'Review in cockpit'}
              </button>
            </aside>
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
