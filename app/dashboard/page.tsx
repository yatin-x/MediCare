'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Visit {
  id: string
  roomId: string
  doctorName: string
  patientName: string
  symptoms: string[]
  medicines: string[]
  urgency: string
  confidence: number
  summary: string
  status: string
  createdAt: string
}

const urgencyConfig: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  low:    { color: '#10b981', bg: '#10b98112', border: '#10b98130', icon: '🟢' },
  medium: { color: '#f59e0b', bg: '#f59e0b12', border: '#f59e0b30', icon: '🟡' },
  high:   { color: '#ef4444', bg: '#ef444412', border: '#ef444430', icon: '🔴' },
}

export default function DashboardPage() {
  const router = useRouter()
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Visit | null>(null)
  const [filter, setFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all')

  useEffect(() => {
    fetch('/api/visits')
      .then(r => r.json())
      .then(d => { setVisits(d.visits || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? visits : visits.filter(v => v.urgency === filter)

  const counts = {
    all: visits.length,
    high: visits.filter(v => v.urgency === 'high').length,
    medium: visits.filter(v => v.urgency === 'medium').length,
    low: visits.filter(v => v.urgency === 'low').length,
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div>
            <h1 className="font-display" style={{ fontSize: '2rem', color: 'var(--text-primary)' }}>Visit History</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>All consultations · PostgreSQL records</p>
          </div>
          <button onClick={() => router.push('/')} className="btn-primary">
            + New Consultation
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {(['all', 'high', 'medium', 'low'] as const).map(key => {
            const cfg = key === 'all'
              ? { color: 'var(--accent)', bg: 'var(--accent-dim)', border: 'var(--border)' }
              : urgencyConfig[key]
            return (
              <button key={key} onClick={() => setFilter(key)}
                style={{
                  padding: '16px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                  background: filter === key ? cfg.bg : 'var(--surface)',
                  border: `1px solid ${filter === key ? cfg.border : 'var(--border)'}`,
                  transition: 'all 0.2s'
                }}>
                <p style={{ fontSize: '24px', fontWeight: 700, color: key === 'all' ? 'var(--accent)' : urgencyConfig[key]?.color || 'var(--text-primary)' }}>
                  {counts[key]}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', textTransform: 'capitalize' }}>
                  {key === 'all' ? 'Total Visits' : `${key} Urgency`}
                </p>
              </button>
            )
          })}
        </div>

        {/* Table + Detail panel */}
        <div style={{ display: 'flex', gap: '16px' }}>

          {/* Visits list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {loading ? (
              <div className="glass" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading visits...
              </div>
            ) : filtered.length === 0 ? (
              <div className="glass" style={{ padding: '48px', textAlign: 'center' }}>
                <p style={{ fontSize: '32px', marginBottom: '12px' }}>🏥</p>
                <p style={{ color: 'var(--text-secondary)' }}>No visits found.</p>
                <button onClick={() => router.push('/')} className="btn-primary" style={{ marginTop: '16px' }}>
                  Start a Consultation
                </button>
              </div>
            ) : (
              filtered.map(visit => {
                const cfg = urgencyConfig[visit.urgency] || urgencyConfig.low
                const isActive = selected?.id === visit.id
                return (
                  <div key={visit.id} onClick={() => setSelected(isActive ? null : visit)}
                    style={{
                      padding: '16px 20px', borderRadius: '10px', cursor: 'pointer',
                      background: isActive ? cfg.bg : 'var(--surface)',
                      border: `1px solid ${isActive ? cfg.border : 'var(--border)'}`,
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: '16px'
                    }}>
                    <div style={{ fontSize: '24px' }}>{cfg.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <p style={{ fontWeight: 600, fontSize: '15px' }}>
                          {visit.patientName || 'Unknown Patient'}
                        </p>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, textTransform: 'uppercase', fontWeight: 600 }}>
                          {visit.urgency}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        Dr. {visit.doctorName} · {formatDate(visit.createdAt)}
                      </p>
                      {visit.symptoms?.length > 0 && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {visit.symptoms.slice(0, 3).join(', ')}{visit.symptoms.length > 3 ? '...' : ''}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{visit.roomId}</p>
                      <p style={{ fontSize: '11px', color: cfg.color, marginTop: '4px' }}>
                        {visit.confidence ? `${(visit.confidence * 100).toFixed(0)}% conf.` : ''}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="glass" style={{ width: '320px', padding: '20px', height: 'fit-content', position: 'sticky', top: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <p style={{ fontWeight: 600, fontSize: '15px' }}>{selected.patientName}</p>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>

              {/* Urgency */}
              {(() => {
                const cfg = urgencyConfig[selected.urgency] || urgencyConfig.low
                return (
                  <div style={{ padding: '10px 14px', background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '8px', marginBottom: '14px' }}>
                    <p style={{ color: cfg.color, fontWeight: 700, fontSize: '13px', textTransform: 'uppercase' }}>
                      {cfg.icon} {selected.urgency} urgency
                    </p>
                    {selected.confidence && (
                      <p style={{ color: cfg.color, fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                        {(selected.confidence * 100).toFixed(1)}% confidence
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* Summary */}
              {selected.summary && (
                <div style={{ marginBottom: '14px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Summary</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.7 }}>{selected.summary}</p>
                </div>
              )}

              {/* Symptoms */}
              {selected.symptoms?.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Symptoms</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {selected.symptoms.map(s => (
                      <span key={s} style={{ padding: '3px 10px', background: '#ef444418', color: '#ef4444', border: '1px solid #ef444430', borderRadius: '20px', fontSize: '12px' }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Medicines */}
              {selected.medicines?.length > 0 && (
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Medicines</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {selected.medicines.map(m => (
                      <span key={m} style={{ padding: '3px 10px', background: '#3b82f618', color: '#3b82f6', border: '1px solid #3b82f630', borderRadius: '20px', fontSize: '12px' }}>{m}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
