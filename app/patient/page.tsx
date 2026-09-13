'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

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
    ? `Dr. ${upcoming.doctor.name}${upcoming.doctor.email ? ` (${upcoming.doctor.email})` : ''}`
    : liveVisit?.doctorName ? `Dr. ${liveVisit.doctorName}` : 'your doctor'

  async function joinWithCode(e: React.FormEvent) {
    e.preventDefault()
    const id = roomCode.trim().toUpperCase()
    if (!id) return
    setJoinError('')
    const res = await fetch(`/api/room?roomId=${encodeURIComponent(id)}`)
    if (!res.ok) {
      setJoinError('No room with that ID. Ask the doctor to click Start consult, then copy the code from the top of their call screen.')
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
      <h1 className="font-display" style={{ fontSize: '2rem', marginBottom: 8 }}>Hello, {session?.user?.name}</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Book → wait for that same doctor to start → join the call.</p>

      <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>HOW YOU CONNECT</p>
        <ol style={{ margin: '0 0 16px 18px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
          <li>Book <strong style={{ color: 'var(--text-primary)' }}>the doctor account that will log in</strong> (match the email, not just the first name).</li>
          <li>That doctor opens Dashboard and clicks <strong style={{ color: 'var(--text-primary)' }}>Start consult</strong> on <em>your</em> booking (same name and time).</li>
          <li>This page shows <strong style={{ color: 'var(--text-primary)' }}>Join video call</strong>, or type the 8-character room ID from the doctor’s screen.</li>
        </ol>

        {upcoming || joinRoomId ? (
          <>
            <p style={{ fontWeight: 600 }}>{doctorLabel}{upcoming ? ` · ${new Date(upcoming.scheduledAt).toLocaleString('en-IN')}` : ''}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              {(upcoming?.reason || 'Video consult')} · {(upcoming?.status || 'in_progress').replace(/_/g, ' ')}
            </p>
            {joinRoomId ? (
              <button className="btn-primary" style={{ marginTop: 14 }} onClick={goToLive}>
                Join video call ({joinRoomId})
              </button>
            ) : (
              <p style={{ fontSize: 13, color: '#f59e0b', marginTop: 12 }}>
                Still scheduled — {doctorLabel} has not started <em>this</em> booking yet. If they started a different slot or logged in as another doctor, the Join button will not appear.
              </p>
            )}
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>Nothing booked. Use Book, then have that doctor start the consult.</p>
        )}

        <form onSubmit={joinWithCode} style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={roomCode}
            onChange={e => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Room ID from doctor (e.g. C46B2F3A)"
            className="font-mono"
            style={{ flex: 1, minWidth: 180, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--accent)', letterSpacing: '0.08em' }}
          />
          <button type="submit" className="btn-primary" disabled={!roomCode.trim()}>Join with code</button>
        </form>
        {joinError && <p style={{ color: '#f59e0b', fontSize: 13, marginTop: 8 }}>{joinError}</p>}
      </div>

      {pendingFollowUp && (
        <div className="glass" style={{ padding: 20, marginBottom: 16, borderColor: '#f59e0b55' }}>
          <p style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8 }}>FOLLOW-UP REQUEST</p>
          <p style={{ fontSize: 14 }}>Requested follow-up (waiting for doctor) with Dr. {pendingFollowUp.doctor.name}.</p>
        </div>
      )}

      <div className="glass" style={{ padding: 20 }}>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>LAST VISIT</p>
        {lastVisit && lastVisit.status !== 'active' ? (
          <>
            <p style={{ fontWeight: 600 }}>Visit #{lastVisit.visitNumber ?? '?'} · {lastVisit.doctorName ? `Dr. ${lastVisit.doctorName}` : 'Consult'}</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>
              {lastVisit.patientSummary || lastVisit.report || 'Report still generating — finish End & Analyze.'}
            </pre>
            <button onClick={() => router.push(`/report/${lastVisit.id}`)}
              style={{ marginTop: 12, padding: '8px 14px', cursor: 'pointer' }}>Open full report</button>
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No finished visits yet.</p>
        )}
      </div>
    </main>
  )
}
