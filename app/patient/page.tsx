'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

type Appointment = {
  id: string
  scheduledAt: string
  status: string
  reason: string | null
  doctor: { name: string; email?: string | null; speciality: string | null }
  visit: { id: string; roomId: string; status: string } | null
}

type Visit = {
  id: string
  roomId?: string
  status?: string
  visitNumber?: number
  doctorName: string | null
  patientSummary: string | null
  report: string | null
  urgency: string | null
  createdAt: string
}

export default function PatientHomePage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [roomCode, setRoomCode] = useState('')
  const [joinError, setJoinError] = useState('')

  const load = useCallback(() => {
    void fetch('/api/appointments').then(r => r.json()).then(d => setAppointments(d.appointments ?? []))
    void fetch('/api/visits').then(r => r.json()).then(d => setVisits(d.visits ?? []))
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 3000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const liveAppt = appointments.find(a =>
    a.visit?.roomId && (a.visit.status === 'active' || a.status === 'in_progress'),
  )
  const liveVisit = visits.find(v => v.status === 'active' && v.roomId)
  const joinRoomId = liveAppt?.visit?.roomId || liveVisit?.roomId || null

  const upcoming = liveAppt ?? appointments
    .filter(a => a.status !== 'cancelled' && a.status !== 'pending_approval')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .find(a => a.status === 'in_progress' || a.status === 'scheduled' || a.visit?.roomId)

  const lastVisit = visits.find(v => v.status !== 'active') ?? visits[0]
  const pendingFollowUp = appointments.find(a => a.status === 'pending_approval')
  const doctorLabel = upcoming
    ? `Dr. ${upcoming.doctor.name}`
    : liveVisit?.doctorName ? `Dr. ${liveVisit.doctorName}` : 'your doctor'

  async function joinWithCode(e: React.FormEvent) {
    e.preventDefault()
    const id = roomCode.trim().toUpperCase()
    if (!id) return
    setJoinError('')
    const res = await fetch(`/api/room?roomId=${encodeURIComponent(id)}`)
    if (!res.ok) {
      setJoinError('That room ID is not live yet. Wait until the doctor starts your booking, then try again.')
      return
    }
    router.push(`/room/${id}?role=patient&name=${encodeURIComponent(session?.user?.name || 'Patient')}`)
  }

  function goToLive() {
    if (!joinRoomId) return
    router.push(`/room/${joinRoomId}?role=patient&name=${encodeURIComponent(session?.user?.name || 'Patient')}`)
  }

  return (
    <main>
      <h1 style={{ fontSize: '1.85rem', marginBottom: 8 }}>Hello, {session?.user?.name}</h1>
      <p style={{ color: 'var(--pat-muted)', marginBottom: 24 }}>
        Book a doctor, join when they start, then read your care summary here.
      </p>

      <section className="pat-card" style={{ padding: 22, marginBottom: 16 }} aria-labelledby="next-step">
        <h2 id="next-step" className="pat-label">Your next step</h2>
        {upcoming || joinRoomId ? (
          <>
            <p style={{ fontWeight: 700, fontSize: 18 }}>{doctorLabel}</p>
            {upcoming && (
              <p style={{ fontSize: 15, color: 'var(--pat-muted)', marginTop: 4 }}>
                {new Date(upcoming.scheduledAt).toLocaleString('en-IN')}
                {upcoming.reason ? ` · ${upcoming.reason}` : ''}
              </p>
            )}
            {joinRoomId ? (
              <button type="button" className="pat-cta" style={{ marginTop: 16 }} onClick={goToLive}>
                Join video call
              </button>
            ) : (
              <p style={{ fontSize: 15, color: 'var(--pat-warn)', marginTop: 12 }} role="status">
                Waiting for {doctorLabel} to start this booking. Keep this page open — Join appears automatically.
              </p>
            )}
          </>
        ) : (
          <>
            <p style={{ color: 'var(--pat-muted)' }}>You have nothing booked.</p>
            <Link href="/patient/book" className="pat-cta" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', marginTop: 14 }}>
              Book a consult
            </Link>
          </>
        )}

        <form onSubmit={joinWithCode} style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="room-code" className="pat-label">Join with a room code</label>
            <input
              id="room-code"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              placeholder="e.g. C46B2F3A"
              className="pat-input font-mono"
              autoComplete="off"
              aria-describedby={joinError ? 'join-error' : undefined}
            />
          </div>
          <button type="submit" className="pat-ghost" disabled={!roomCode.trim()}>Join</button>
        </form>
        {joinError && <p id="join-error" role="alert" style={{ color: 'var(--pat-warn)', fontSize: 14, marginTop: 8 }}>{joinError}</p>}

        <details style={{ marginTop: 16, color: 'var(--pat-muted)', fontSize: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--pat-ink)' }}>How joining works</summary>
          <ol style={{ margin: '10px 0 0 18px', lineHeight: 1.7 }}>
            <li>Book the doctor who will actually log in (match the email if names look similar).</li>
            <li>They start <em>your</em> booking from their queue.</li>
            <li>Join here, or type the 8-character code from their call screen.</li>
          </ol>
        </details>
      </section>

      {pendingFollowUp && (
        <section className="pat-card" style={{ padding: 20, marginBottom: 16 }} aria-labelledby="follow-up">
          <h2 id="follow-up" className="pat-label">Follow-up</h2>
          <p>Requested with Dr. {pendingFollowUp.doctor.name}. Waiting for the doctor to confirm.</p>
        </section>
      )}

      <section className="pat-card" style={{ padding: 22 }} aria-labelledby="last-visit">
        <h2 id="last-visit" className="pat-label">Last visit</h2>
        {lastVisit && lastVisit.status !== 'active' ? (
          <>
            <p style={{ fontWeight: 700 }}>
              Visit #{lastVisit.visitNumber ?? '—'} · {lastVisit.doctorName ? `Dr. ${lastVisit.doctorName}` : 'Consult'}
            </p>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 15, marginTop: 10, lineHeight: 1.65, maxHeight: 180, overflow: 'auto' }}>
              {lastVisit.patientSummary || lastVisit.report || 'Your summary will appear after the consult is analysed.'}
            </pre>
            <button type="button" className="pat-ghost" style={{ marginTop: 14 }} onClick={() => router.push(`/report/${lastVisit.id}`)}>
              Open full report
            </button>
          </>
        ) : (
          <p style={{ color: 'var(--pat-muted)' }}>No finished visits yet. After a consult, your care summary will show up here.</p>
        )}
      </section>
    </main>
  )
}
