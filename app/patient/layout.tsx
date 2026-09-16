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
    return (
      <main className="pat-app" style={{ padding: 24 }}>
        <p>Loading your portal…</p>
      </main>
    )
  }

  return (
    <div className="pat-app">
      <a className="pat-skip" href="#main">Skip to content</a>
      <header className="pat-topbar">
        <Link href="/patient" className="pat-brand">MedAssist</Link>
        <nav className="pat-nav" aria-label="Patient">
          {links.map(l => {
            const current = pathname === l.href
            return (
              <Link key={l.href} href={l.href} aria-current={current ? 'page' : undefined}>
                {l.label}
              </Link>
            )
          })}
        </nav>
        <div className="pat-topbar-meta">
          <span>{session.user.name}</span>
          <button type="button" className="pat-linkbtn" onClick={() => signOut({ callbackUrl: '/' })}>
            Sign out
          </button>
        </div>
      </header>
      <div id="main" style={{ maxWidth: 800, margin: '0 auto', padding: '28px 20px 56px' }}>{children}</div>
    </div>
  )
}
