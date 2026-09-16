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
    <main className="pat-app" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: '2.4rem', marginBottom: 12 }}>MedAssist</h1>
        <p style={{ color: 'var(--pat-muted)', maxWidth: 440, margin: '0 auto', fontSize: 16 }}>
          Book a video consult, keep your visit history, and read a plain-language care summary. Doctors still approve anything clinical.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 720 }}>
        <div className="pat-card" style={{ flex: 1, minWidth: 260, padding: 28 }}>
          <p className="pat-label">Patients</p>
          <h2 style={{ fontSize: '1.35rem', marginBottom: 10 }}>Your visits, in one place</h2>
          <p style={{ fontSize: 15, color: 'var(--pat-muted)', marginBottom: 20 }}>Book a doctor, join the call, and open your report — no room ID to memorize.</p>
          <Link href="/login?role=patient" className="pat-cta" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Patient sign-in
          </Link>
        </div>
        <div className="doc-card" style={{ flex: 1, minWidth: 260, padding: 28 }}>
          <p className="doc-label">Doctors</p>
          <h2 className="font-display" style={{ fontSize: '1.35rem', marginBottom: 10, color: '#1c1917' }}>Today’s clinic</h2>
          <p style={{ fontSize: 14, color: '#57534e', marginBottom: 20 }}>See the queue, start the matching booking, and sign off notes in the cockpit.</p>
          <Link href="/login?role=doctor" className="doc-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Clinic sign-in
          </Link>
        </div>
      </div>
    </main>
  )
}
