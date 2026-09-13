'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useWebRTC } from '@/lib/useWebRTC'
import { useLiveTranscript, type AsrStatus } from '@/lib/useLiveTranscript'
import { isUnusableTranscriptChunk } from '@/lib/agent/grounding'
import type { Socket } from 'socket.io-client'

type UrgencyLevel = 'low' | 'medium' | 'high'
interface AnalysisResult {
  urgency: UrgencyLevel
  confidence: number
  summary: string
  visitId?: string
  auditorFlags?: string[]
  visitNumber?: number
  priorLines?: string[]
  patientSummary?: string
  extracted: {
    symptoms: string[]
    medicines: string[]
    advice: string[]
    duration: string | null
  }
}

type VisitContext = {
  visitNumber: number
  patientName: string | null
  allergies: string[]
  priorVisits: Array<{ id: string; line: string }>
}

export default function RoomPage() {
  const params      = useParams()
  const searchParams = useSearchParams()
  const router      = useRouter()

  const roomId = params.roomId as string
  const role   = (searchParams.get('role') || 'doctor') as 'doctor' | 'patient'
  const name   = searchParams.get('name') || 'User'

  useEffect(() => {
    try {
      sessionStorage.setItem('medassist.roomId', roomId)
      sessionStorage.setItem('medassist.role', role)
    } catch { /* ignore */ }
  }, [roomId, role])

  // ── Refs ──────────────────────────────────────────────────────
  const localVideoRef   = useRef<HTMLVideoElement>(null)
  const remoteVideoRef  = useRef<HTMLVideoElement>(null)
  const transcriptRef   = useRef('')
  const durationRef     = useRef<NodeJS.Timeout | null>(null)
  const socketRef       = useRef<Socket | null>(null)

  // ── State ─────────────────────────────────────────────────────
  const [localStream,   setLocalStream]   = useState<MediaStream | null>(null)
  const [callStatus,    setCallStatus]    = useState<'idle'|'connecting'|'connected'|'ended'>('idle')
  const [isMuted,       setIsMuted]       = useState(false)
  const [isCameraOff,   setIsCameraOff]   = useState(false)
  const [callDuration,  setCallDuration]  = useState(0)
  const [transcript,    setTranscript]    = useState('')
  const [isRecording,   setIsRecording]   = useState(false)
  const [analysis,      setAnalysis]      = useState<AnalysisResult | null>(null)
  const [isAnalyzing,   setIsAnalyzing]   = useState(false)
  const [copied,        setCopied]        = useState(false)
  const [whisperStatus, setWhisperStatus] = useState<AsrStatus>('idle')
  const [typedLine, setTypedLine] = useState('')
  const [visitCtx, setVisitCtx] = useState<VisitContext | null>(null)

  // ── WebRTC ────────────────────────────────────────────────────
  const { remoteStream, connectionState, peerJoined, socket } = useWebRTC({
    roomId, role, localStream
  })

  // keep socket in ref so recorder callback can reach it
  useEffect(() => { socketRef.current = socket }, [socket])

  useEffect(() => {
    if (role !== 'doctor') return
    fetch(`/api/visits/context?roomId=${encodeURIComponent(roomId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return
        setVisitCtx({
          visitNumber: d.visitNumber,
          patientName: d.patientName,
          allergies: d.allergies ?? [],
          priorVisits: (d.priorVisits ?? []).map((p: { id: string; line: string }) => ({ id: p.id, line: p.line })),
        })
      })
      .catch(() => {})
  }, [roomId, role])

  // bind remote video (explicit play — autoplay of unmuted remote media often fails)
  useEffect(() => {
    const el = remoteVideoRef.current
    if (!el || !remoteStream) return
    el.srcObject = remoteStream
    el.muted = false
    const play = () => { void el.play().catch(() => {}) }
    play()
    setCallStatus('connected')
  }, [remoteStream])

  useEffect(() => {
    const el = localVideoRef.current
    if (!el || !localStream) return
    el.srcObject = localStream
    void el.play().catch(() => {})
  }, [localStream])

  // receive remote transcript chunks via socket
  useEffect(() => {
    if (!socket) return
    const handler = ({ chunk }: { chunk: string }) => {
      if (isUnusableTranscriptChunk(chunk)) return
      setTranscript(p => {
        const next = p + chunk
        transcriptRef.current = next
        return next
      })
    }
    socket.on('transcript-chunk', handler)
    return () => { socket.off('transcript-chunk', handler) }
  }, [socket])

  // ── Call timer ────────────────────────────────────────────────
  useEffect(() => {
    if (callStatus === 'connected') {
      durationRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    }
    return () => { if (durationRef.current) clearInterval(durationRef.current) }
  }, [callStatus])

  const appendChunk = useCallback((chunk: string) => {
    if (isUnusableTranscriptChunk(chunk)) return
    const line = chunk.includes('[') ? chunk : `[${role}] ${chunk.trim()}\n`
    setTranscript(p => {
      const next = p + line
      transcriptRef.current = next
      return next
    })
    socketRef.current?.emit('transcript-chunk', { chunk: line, roomId })
    void fetch('/api/visits/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, type: 'transcript_chunk', role, payload: line }),
    }).catch(() => {})
  }, [roomId, role])

  const onAsrStatus = useCallback((s: AsrStatus) => {
    setWhisperStatus(s)
    setIsRecording(s === 'ok' || s === 'loading')
  }, [])

  useLiveTranscript({
    roomId,
    role,
    stream: localStream,
    active: Boolean(localStream) && callStatus !== 'ended',
    onChunk: appendChunk,
    onStatus: onAsrStatus,
  })

  // ── Camera ────────────────────────────────────────
  const cameraInitRef = useRef(false)

  useEffect(() => {
    if (cameraInitRef.current) return
    cameraInitRef.current = true

    getCameraStream().then(stream => {
      setLocalStream(stream)
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      setCallStatus('connecting')
    }).catch(err => {
      console.error('Camera error:', err)
      setCallStatus('connecting')
    })
  }, [])

  // ── Controls ──────────────────────────────────────────────────
  function toggleMic() {
    const tracks = localStream?.getAudioTracks()
    if (!tracks) return
    const newEnabled = !tracks[0]?.enabled
    tracks.forEach(t => { t.enabled = newEnabled })
    setIsMuted(!newEnabled)
  }

  function toggleCamera() {
    localStream?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setIsCameraOff(c => !c)
  }

  function copyRoomId() {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function formatDuration(s: number) {
    return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`
  }

  // ── End call ──────────────────────────────────────────────────
  async function endCall() {
    localStream?.getTracks().forEach(t => t.stop())
    if (durationRef.current) clearInterval(durationRef.current)
    setCallStatus('ended')
    setIsAnalyzing(true)
    setIsRecording(false)

    const finalTranscript = transcriptRef.current.trim()

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, transcript: finalTranscript })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setAnalysis({
        urgency: data.urgency,
        confidence: data.confidence,
        summary: data.summary,
        extracted: data.extracted,
        visitId: data.visitId,
        auditorFlags: data.auditorFlags,
        visitNumber: data.visitNumber,
        priorLines: data.priorLines,
        patientSummary: data.patientSummary,
      })
    } catch (err) {
      console.error(err)
      setAnalysis({
        urgency: 'low',
        confidence: 0.5,
        summary: 'Analysis failed. Try again.',
        extracted: { symptoms: [], medicines: [], advice: [], duration: null }
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ── Urgency config ────────────────────────────────────────────
  const urgencyConfig = {
    low:    { color: '#10b981', bg: '#10b98118', border: '#10b98133', label: '🟢 LOW URGENCY',    icon: '✅' },
    medium: { color: '#f59e0b', bg: '#f59e0b18', border: '#f59e0b33', label: '🟡 MEDIUM URGENCY', icon: '⚠️' },
    high:   { color: '#ef4444', bg: '#ef444418', border: '#ef444433', label: '🔴 HIGH URGENCY',   icon: '🚨' },
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Ended
  // ─────────────────────────────────────────────────────────────
  if (callStatus === 'ended') {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: '720px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <div>
              <h1 className="font-display" style={{ fontSize: '1.8rem' }}>Consultation Summary</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
                Room {roomId} · {formatDuration(callDuration)}
                {analysis?.visitNumber ? ` · visit #${analysis.visitNumber}` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {role === 'doctor' && analysis?.visitId && (
                <button onClick={() => router.push(`/visit/${analysis.visitId}`)}
                  style={{ padding: '8px 18px', background: 'var(--accent-dim)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--accent)', cursor: 'pointer' }}>
                  Doctor cockpit
                </button>
              )}
              {role === 'patient' && analysis?.visitId && (
                <button onClick={() => router.push(`/report/${analysis.visitId}`)}
                  style={{ padding: '8px 18px', background: 'var(--accent-dim)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--accent)', cursor: 'pointer' }}>
                  View report
                </button>
              )}
              <button onClick={() => router.push(role === 'patient' ? '/patient/visits' : '/dashboard')}
                style={{ padding: '8px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                {role === 'patient' ? 'My visit history →' : 'Dashboard →'}
              </button>
            </div>
          </div>

          {isAnalyzing ? (
            <div className="glass" style={{ padding: '60px', textAlign: 'center' }}>
              <div style={{ fontSize: '52px', marginBottom: '16px' }}>🧠</div>
              <p style={{ color: 'var(--accent)', fontSize: '16px', fontWeight: 600 }}>Analyzing consultation...</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>Encounter orchestrator: observe → plan → tools → verify</p>
            </div>
          ) : analysis ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(() => {
                const cfg = urgencyConfig[analysis.urgency] ?? urgencyConfig.low
                return (
                  <div style={{ padding: '20px 24px', background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: '22px', fontWeight: 700, color: cfg.color }}>{cfg.label}</p>
                      <p style={{ fontSize: '13px', color: cfg.color, opacity: 0.8, marginTop: '3px' }}>Confidence: {(analysis.confidence * 100).toFixed(1)}%</p>
                    </div>
                    <span style={{ fontSize: '52px' }}>{cfg.icon}</span>
                  </div>
                )
              })()}

              {analysis.patientSummary && (
                <div className="glass" style={{ padding: '20px 24px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Patient care summary</p>
                  <p style={{ color: 'var(--text-primary)', lineHeight: 1.75, fontSize: '15px', whiteSpace: 'pre-wrap' }}>{analysis.patientSummary}</p>
                </div>
              )}

              <div className="glass" style={{ padding: '20px 24px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>📋 Visit Summary</p>
                <p style={{ color: 'var(--text-primary)', lineHeight: 1.75, fontSize: '15px', whiteSpace: 'pre-wrap' }}>{analysis.summary}</p>
                {analysis.auditorFlags && analysis.auditorFlags.length > 0 && (
                  <p style={{ marginTop: 10, fontSize: 13, color: '#f59e0b' }}>Auditor: {analysis.auditorFlags.join('; ')}</p>
                )}
              </div>

              {analysis.priorLines && analysis.priorLines.length > 0 && (
                <div className="glass" style={{ padding: '20px 24px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Prior visits</p>
                  {analysis.priorLines.map(line => (
                    <p key={line} style={{ fontSize: 13, marginBottom: 6, color: 'var(--text-secondary)' }}>{line}</p>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                {[
                  { label: '🤒 Symptoms',  items: analysis.extracted.symptoms,  color: '#ef4444' },
                  { label: '💊 Medicines', items: analysis.extracted.medicines, color: '#3b82f6' },
                  { label: '📌 Advice',    items: analysis.extracted.advice,    color: '#10b981' },
                ].map(section => (
                  <div key={section.label} className="glass" style={{ padding: '16px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>{section.label}</p>
                    {section.items.length > 0
                      ? section.items.map(item => (
                          <span key={item} style={{ display: 'inline-block', margin: '2px 4px 2px 0', padding: '3px 10px', background: `${section.color}18`, color: section.color, border: `1px solid ${section.color}30`, borderRadius: '20px', fontSize: '12px' }}>{item}</span>
                        ))
                      : <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>None detected</p>
                    }
                  </div>
                ))}
              </div>

              <div className="glass" style={{ padding: '20px 24px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>🎤 Full Transcript</p>
                <div className="transcript-box" style={{ whiteSpace: 'pre-wrap' }}>
                  {transcript || <span style={{ color: 'var(--text-muted)' }}>No transcript recorded.</span>}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Active call
  // ─────────────────────────────────────────────────────────────
  const statusLabel = connectionState === 'connected'
    ? { text: 'Connected', color: '#10b981' }
    : peerJoined
    ? { text: 'Establishing P2P...', color: '#f59e0b' }
    : { text: 'Waiting for peer...', color: 'var(--text-muted)' }

  const whisperDot = { idle: '#666', loading: '#f59e0b', ok: '#10b981', err: '#ef4444' }[whisperStatus]

  return (
    <main style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="font-display" style={{ fontSize: '1.15rem', color: 'var(--accent)' }}>⚕ MedAssist</span>
          <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <span className="font-mono" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{roomId}</span>
          {role === 'doctor' && visitCtx && (
            <span style={{ fontSize: '12px', color: 'var(--accent)' }}>
              {visitCtx.patientName} · visit #{visitCtx.visitNumber}
              {visitCtx.priorVisits.length ? ` · ${visitCtx.priorVisits.length} prior` : ' · first visit'}
            </span>
          )}
          <button onClick={copyRoomId} style={{ padding: '3px 10px', background: 'var(--accent-dim)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--accent)', fontSize: '12px', cursor: 'pointer' }}>
            {copied ? '✓ Copied' : 'Copy ID'}
          </button>
          {role === 'doctor' && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Patient joins from Home, or types this ID</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Audio Recording status indicator */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: whisperDot }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: whisperDot, display: 'inline-block' }} />
            {whisperStatus === 'ok' ? 'Listening' :
              whisperStatus === 'loading' ? 'Whisper loading…' :
              whisperStatus === 'err' ? 'Type below or use Chrome' :
              isRecording ? 'Listening' : 'Transcript'}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: statusLabel.color }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusLabel.color, display: 'inline-block' }} />
            {statusLabel.text}
          </span>
          {callStatus === 'connected' && (
            <span className="font-mono" style={{ fontSize: '13px', color: '#10b981' }}>{formatDuration(callDuration)}</span>
          )}
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{name} · {role}</span>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', background: '#050a14' }}>

          {/* Remote video */}
          <video ref={remoteVideoRef} autoPlay playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: remoteStream ? 'block' : 'none', background: '#050a14' }} />

          {/* Waiting screen */}
          {!remoteStream && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: 'linear-gradient(135deg,#0a0f1e,#0d1929)' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', marginBottom: '16px' }}>
                {peerJoined ? '🔗' : '👤'}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
                {peerJoined ? 'Establishing connection...' : `Waiting for ${role === 'doctor' ? 'patient' : 'doctor'} to join`}
              </p>
              {!peerJoined && (
                <div style={{ marginTop: '16px', padding: '10px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Share Room ID</p>
                  <p className="font-mono" style={{ fontSize: '20px', color: 'var(--accent)', letterSpacing: '0.15em' }}>{roomId}</p>
                </div>
              )}
            </div>
          )}

          {/* Local video PiP */}
          <div style={{ position: 'absolute', bottom: 16, right: 16, width: 176, height: 128, borderRadius: '10px', overflow: 'hidden', border: '2px solid var(--border)', background: 'var(--surface)' }}>
            <video ref={localVideoRef} autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: isCameraOff ? 'none' : 'block' }} />
            {isCameraOff && <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '28px' }}>📷</span></div>}
            <div style={{ position: 'absolute', bottom: 5, left: 8, fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>{name}</div>
          </div>

          {/* P2P badge */}
          {connectionState === 'connected' && (
            <div style={{ position: 'absolute', top: 12, left: 12, padding: '4px 12px', background: '#10b98122', border: '1px solid #10b98144', borderRadius: '20px', fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 6, height: 6, background: '#10b981', borderRadius: '50%' }} />
              P2P Connected
            </div>
          )}

          {/* Live transcript overlay */}
          <div style={{ position: 'absolute', top: 12, right: 12, width: '320px', maxHeight: '280px', background: 'rgba(0,0,0,0.82)', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '10px 14px', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
            <div style={{ fontSize: '10px', color: '#10b981', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Live transcript
              {whisperStatus === 'ok' && <span style={{ color: '#10b981', marginLeft: 6 }}>· mic</span>}
              {whisperStatus === 'loading' && <span style={{ color: '#f59e0b', marginLeft: 6 }}>· downloading Whisper (free, once)</span>}
              {whisperStatus === 'err' && <span style={{ color: '#f59e0b', marginLeft: 6 }}>· type lines to test</span>}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', fontSize: '11px', color: '#ccc', fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap', minHeight: 48 }}>
              {transcript || <span style={{ color: '#555' }}>Firefox has no Speech API — Whisper will start, or paste a test line below. Chrome/Edge: allow mic.</span>}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const t = typedLine.trim()
                if (!t) return
                appendChunk(t)
                setTypedLine('')
              }}
              style={{ marginTop: 8, display: 'flex', gap: 6 }}
            >
              <input
                value={typedLine}
                onChange={e => setTypedLine(e.target.value)}
                placeholder="Type a spoken line (free, always works)"
                style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 6, border: '1px solid #333', background: '#111', color: '#eee' }}
              />
              <button type="submit" style={{ fontSize: 11, padding: '6px 10px', cursor: 'pointer' }}>Add</button>
            </form>
          </div>

          {role === 'doctor' && visitCtx && (visitCtx.priorVisits.length > 0 || visitCtx.allergies.length > 0) && (
            <div style={{ position: 'absolute', bottom: 100, left: 12, width: 280, maxHeight: 180, overflowY: 'auto', background: 'rgba(0,0,0,0.82)', border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 12px', zIndex: 10 }}>
              <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                Chart · visit #{visitCtx.visitNumber}
              </div>
              {visitCtx.allergies.length > 0 && (
                <p style={{ fontSize: 11, color: '#f59e0b', marginBottom: 6 }}>Allergies: {visitCtx.allergies.join(', ')}</p>
              )}
              {visitCtx.priorVisits.map(p => (
                <p key={p.id} style={{ fontSize: 11, color: '#ccc', marginBottom: 4, lineHeight: 1.4 }}>{p.line}</p>
              ))}
            </div>
          )}

          {/* Bottom controls */}
          <div style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 24px', background: 'rgba(10,15,30,0.75)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '100px', backdropFilter: 'blur(12px)' }}>
            <button onClick={toggleMic}
              style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer', background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
              {isMuted ? '🔇' : '🎤'}
            </button>
            <button onClick={toggleCamera}
              style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer', background: isCameraOff ? '#ef4444' : 'rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
              {isCameraOff ? '📷' : '📹'}
            </button>
            <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />
            <button onClick={endCall}
              style={{ padding: '0 24px', height: 48, borderRadius: '24px', border: 'none', cursor: 'pointer', background: '#ef4444', color: 'white', fontWeight: 600, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📞 End & Analyze
            </button>
          </div>

        </div>
      </div>
    </main>
  )
}

async function getCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('MediaDevices not supported')
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    })
  } catch (err) {
    console.warn('Camera+mic failed, retrying simpler constraints', err)
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    } catch (err2) {
      console.warn('Video unavailable, audio only', err2)
      return await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
    }
  }
}