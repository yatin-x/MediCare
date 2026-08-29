'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect } from 'react'

const links = [
  { href: '/patient', label: 'Home' },
  { href: '/patient/book', label: 'Book' },
  { href: '/patient/visits', label: 'Visits' },
  { href: '/patient/profile', label: 'Profile' },
]

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?role=patient')
    if (status === 'authenticated' && session?.user?.role !== 'patient') {
      router.replace('/dashboard')
    }
  }, [status, session, router])

  if (status !== 'authenticated' || session?.user?.role !== 'patient') {
    return <main style={{ padding: 24 }}>Loading portal…</main>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <Link href="/patient" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>⚕ MedAssist</Link>
        <nav style={{ display: 'flex', gap: 8 }}>
          {links.map(l => (
            <Link key={l.href} href={l.href}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 13,
                color: pathname === l.href ? '#0a0f1e' : 'var(--text-secondary)',
                background: pathname === l.href ? 'var(--accent)' : 'transparent',
              }}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>{session.user.name}</span>
          <button onClick={() => signOut({ callbackUrl: '/' })} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>Sign out</button>
        </div>
      </header>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: 24 }}>{children}</div>
    </div>
  )
}
