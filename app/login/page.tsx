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

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="glass" style={{ width: '100%', maxWidth: 420, padding: 32 }}>
        <Link href="/" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>← Home</Link>
        <h1 className="font-display" style={{ fontSize: '1.8rem', margin: '16px 0 8px' }}>
          {isRegistering ? 'Create account' : 'Sign in'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
          {role === 'patient' ? 'Patient portal' : 'Doctor workspace'}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--bg)', borderRadius: 8, padding: 4 }}>
          {(['patient', 'doctor'] as const).map(r => (
            <button key={r} type="button" onClick={() => setRole(r)}
              style={{
                flex: 1, padding: 8, border: 'none', borderRadius: 6, cursor: 'pointer',
                background: role === r ? 'var(--accent)' : 'transparent',
                color: role === r ? '#0a0f1e' : 'var(--text-secondary)',
                fontWeight: 600, fontSize: 14,
              }}>
              {r === 'patient' ? 'Patient' : 'Doctor'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isRegistering && (
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required
                style={{ width: '100%', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
          </div>
          {error && <p style={{ color: '#f59e0b', fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', padding: 12 }}>
            {loading ? 'Please wait…' : (isRegistering ? `Register as ${role}` : 'Log in')}
          </button>
          <button type="button" onClick={() => setIsRegistering(!isRegistering)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>
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
