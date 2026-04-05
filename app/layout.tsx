import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MedAssist — Clinical Documentation System',
  description: 'AI-assisted clinical documentation for doctor-patient consultations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
