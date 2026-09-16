'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialRole = searchParams.get('role') === 'patient' ? 'patient' : 'doctor'
  const [role, setRole] = useState<'doctor' | 'patient'>(initialRole)
  const [isRegistering, setIsRegistering] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (isRegistering) {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, role }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Registration failed')
          setLoading(false)
          return
        }
      }
      const result = await signIn('credentials', { redirect: false, email, password })
      if (result?.error) {
        setError(result.error === 'CredentialsSignin' ? 'Invalid email or password' : result.error)
        setLoading(false)
        return
      }
      const sessRes = await fetch('/api/auth/session')
      const sess = await sessRes.json()
      router.push(sess?.user?.role === 'patient' ? '/patient' : '/dashboard')
    } catch {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  const doctorLogin = role === 'doctor'
  const patientLogin = role === 'patient'
  const shell = doctorLogin ? 'doc-app' : 'pat-app'
  const card = doctorLogin ? 'doc-card' : 'pat-card'
  const field = doctorLogin ? 'doc-input' : 'pat-input'
  const labelColor = doctorLogin ? 'var(--doc-muted)' : 'var(--pat-muted)'
  const submitClass = doctorLogin ? 'doc-primary' : 'pat-cta'

  return (
    <main className={shell} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className={card} style={{ width: '100%', maxWidth: 420, padding: 32 }}>
        <Link href="/" style={{ fontSize: 14, color: labelColor, textDecoration: 'none' }}>Home</Link>
        <h1 className="font-display" style={{ fontSize: '1.8rem', margin: '16px 0 8px' }}>
          {isRegistering
            ? (role === 'doctor' ? 'Create clinic account' : 'Create your account')
            : (role === 'doctor' ? 'Clinic sign-in' : 'Patient sign-in')}
        </h1>
        <p style={{ fontSize: 15, color: labelColor, marginBottom: 20 }}>
          {patientLogin ? 'Book, join, and read your visit summaries.' : 'Queue, rooms, and notes for today’s consults.'}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: doctorLogin ? '#efece4' : '#cffafe', borderRadius: 8, padding: 4 }} role="tablist" aria-label="Account type">
          {(['patient', 'doctor'] as const).map(r => (
            <button key={r} type="button" onClick={() => setRole(r)}
              style={{
                flex: 1, minHeight: 44, padding: 8, border: 'none', borderRadius: 6, cursor: 'pointer',
                background: role === r ? (doctorLogin ? 'var(--doc-pine)' : 'var(--pat-primary)') : 'transparent',
                color: role === r ? '#faf8f4' : labelColor,
                fontWeight: 600, fontSize: 15,
              }}>
              {r === 'patient' ? 'Patient' : 'Doctor'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isRegistering && (
            <div>
              <label htmlFor="reg-name" style={{ display: 'block', fontSize: 13, color: labelColor, marginBottom: 6 }}>Name</label>
              <input id="reg-name" value={name} onChange={e => setName(e.target.value)} required className={field} />
            </div>
          )}
          <div>
            <label htmlFor="email" style={{ display: 'block', fontSize: 13, color: labelColor, marginBottom: 6 }}>Email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className={field} autoComplete="email" />
          </div>
          <div>
            <label htmlFor="password" style={{ display: 'block', fontSize: 13, color: labelColor, marginBottom: 6 }}>Password</label>
            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className={field} autoComplete={isRegistering ? 'new-password' : 'current-password'} />
          </div>
          {error && <p role="alert" style={{ color: doctorLogin ? 'var(--doc-high)' : 'var(--pat-warn)', fontSize: 14 }}>{error}</p>}
          <button type="submit" disabled={loading} className={submitClass} style={{ width: '100%' }}>
            {loading ? 'Please wait…' : (isRegistering ? `Register as ${role}` : 'Log in')}
          </button>
          <button type="button" onClick={() => setIsRegistering(!isRegistering)}
            style={{ background: 'none', border: 'none', color: doctorLogin ? 'var(--doc-pine)' : 'var(--pat-primary)', cursor: 'pointer', fontSize: 14, minHeight: 44 }}>
            {isRegistering ? 'Already have an account? Log in' : 'Need an account? Register'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <LoginInner />
    </Suspense>
  )
}
