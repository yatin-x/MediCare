'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect } from 'react'

export default function LandingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status !== 'authenticated') return
    if (session.user.role === 'patient') router.replace('/patient')
    else router.replace('/dashboard')
  }, [status, session, router])

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, background: 'var(--accent)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>⚕</div>
          <h1 className="font-display" style={{ fontSize: '2.5rem' }}>MedAssist</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 440, margin: '0 auto' }}>
          Book a video consult, keep your visit history, and read a plain-language care summary after each visit. Doctors still approve anything clinical.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 720 }}>
        <div className="glass" style={{ flex: 1, minWidth: 260, padding: 28 }}>
          <p style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 8 }}>Patients</p>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 10 }}>Your visits, in one place</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>Book a doctor, join the call, and open your report — no room ID to memorize.</p>
          <Link href="/login?role=patient" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            I’m a patient
          </Link>
        </div>
        <div className="glass" style={{ flex: 1, minWidth: 260, padding: 28 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Doctors</p>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 10 }}>Start today’s consults</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>See bookings, start the room, and review CLEA drafts in the cockpit.</p>
          <Link href="/login?role=doctor" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: 10, borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            I’m a doctor
          </Link>
        </div>
      </div>
    </main>
  )
}
