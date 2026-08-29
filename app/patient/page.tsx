'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

type Appointment = {
  id: string
  scheduledAt: string
  status: string
  reason: string | null
  doctor: { name: string; speciality: string | null }
  visit: { id: string; roomId: string; status: string } | null
}

type Visit = {
  id: string
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

  useEffect(() => {
    fetch('/api/appointments').then(r => r.json()).then(d => setAppointments(d.appointments ?? []))
    fetch('/api/visits').then(r => r.json()).then(d => setVisits(d.visits ?? []))
  }, [])

  const now = Date.now()
  const upcoming = appointments
    .filter(a => a.status !== 'cancelled' && new Date(a.scheduledAt).getTime() > now - 4 * 60 * 60 * 1000)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]
  const lastVisit = visits[0]
  const pendingFollowUp = appointments.find(a => a.status === 'pending_approval')

  return (
    <main>
      <h1 className="font-display" style={{ fontSize: '2rem', marginBottom: 8 }}>Hello, {session?.user?.name}</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Your next visit, last report, and follow-ups live here.</p>

      <div className="glass" style={{ padding: 20, marginBottom: 16 }}>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>NEXT APPOINTMENT</p>
        {upcoming ? (
          <>
            <p style={{ fontWeight: 600 }}>Dr. {upcoming.doctor.name} · {new Date(upcoming.scheduledAt).toLocaleString('en-IN')}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{upcoming.reason} · {upcoming.status.replace('_', ' ')}</p>
            {upcoming.visit?.roomId ? (
              <button className="btn-primary" style={{ marginTop: 14 }}
                onClick={() => router.push(`/room/${upcoming.visit!.roomId}?role=patient&name=${encodeURIComponent(session?.user?.name || 'Patient')}`)}>
                Join video call
              </button>
            ) : (
              <p style={{ fontSize: 13, color: '#f59e0b', marginTop: 12 }}>Waiting for your doctor to start the room.</p>
            )}
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>Nothing booked. Use Book to pick a doctor and time.</p>
        )}
      </div>

      {pendingFollowUp && (
        <div className="glass" style={{ padding: 20, marginBottom: 16, borderColor: '#f59e0b55' }}>
          <p style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8 }}>FOLLOW-UP REQUEST</p>
          <p style={{ fontSize: 14 }}>Requested follow-up (waiting for doctor) with Dr. {pendingFollowUp.doctor.name}.</p>
        </div>
      )}

      <div className="glass" style={{ padding: 20 }}>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>LAST VISIT</p>
        {lastVisit ? (
          <>
            <p style={{ fontWeight: 600 }}>Visit #{lastVisit.visitNumber ?? '?'} · {lastVisit.doctorName ? `Dr. ${lastVisit.doctorName}` : 'Consult'}</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>
              {lastVisit.patientSummary || lastVisit.report || 'Report still generating — finish End & Analyze.'}
            </pre>
            <button onClick={() => router.push(`/report/${lastVisit.id}`)}
              style={{ marginTop: 12, padding: '8px 14px', cursor: 'pointer' }}>Open full report</button>
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>No visits yet.</p>
        )}
      </div>
    </main>
  )
}
