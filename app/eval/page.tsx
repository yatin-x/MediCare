'use client'

import { useEffect, useState } from 'react'

export default function EvalPage() {
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [replay, setReplay] = useState<unknown>(null)

  useEffect(() => {
    fetch('/api/agent/eval').then(r => r.json()).then(setReport)
  }, [])

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h1 className="font-display">CLEA evaluation gym</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>Golden transcripts replayed without live video.</p>
      <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(report, null, 2)}</pre>
      <button
        onClick={async () => {
          const r = await fetch('/api/agent/replay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'chest-pain-penicillin' }),
          })
          setReplay(await r.json())
        }}
        style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}
      >
        Replay chest-pain-penicillin
      </button>
      <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', marginTop: 12 }}>{JSON.stringify(replay, null, 2)}</pre>
    </main>
  )
}
