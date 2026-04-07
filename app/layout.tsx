import type { Metadata } from 'next'
import './globals.css'
import Providers from './Providers'

export const metadata: Metadata = {
  title: 'MedAssist — Clinical Documentation System',
  description: 'AI-assisted clinical documentation for doctor-patient consultations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
