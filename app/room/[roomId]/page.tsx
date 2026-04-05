'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useWebRTC } from '@/lib/useWebRTC'

type UrgencyLevel = 'low' | 'medium' | 'high'

interface AnalysisResult {
  urgency: UrgencyLevel
  confidence: number
  summary: string
  extracted: {
    symptoms: string[]
    medicines: string[]
    advice: string[]
    duration: string | null
  }
}

export default function RoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomId = params.roomId as string
  const role = (searchParams.get('role') || 'doctor') as 'doctor' | 'patient'
  const name = searchParams.get('name') || 'User'

  // Refs
  const localVideoRef  = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const recognitionRef = useRef<any>(null)
  const transcriptRef  = useRef('')

  // Local stream state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [callStatus, setCallStatus]   = useState<'idle' | 'connecting' | 'connected' | 'ended'>('idle')
  const [isMuted, setIsMuted]         = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const durationRef = useRef<NodeJS.Timeout | null>(null)

  // Transcript state
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript]   = useState('')
  const [interimText, setInterimText] = useState('')

  // Analysis state
  const [analysis, setAnalysis]       = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [copied, setCopied]           = useState(false)

  // WebRTC hook
  const { remoteStream, connectionState, peerJoined } = useWebRTC({
    roomId,
    role,
    localStream
  })

  // Keep transcriptRef in sync
  useEffect(() => { transcriptRef.current = transcript }, [transcript])

  // ── Start camera ────────────────────────────────────────────
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setLocalStream(stream)
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        setCallStatus('connecting')
      })
      .catch(err => {
        console.error('Camera error:', err)
        setCallStatus('connecting')
      })
    return () => {
      localStream?.getTracks().forEach(t => t.stop())
      if (durationRef.current) clearInterval(durationRef.current)
    }
  }, [])

  // ── Bind remote stream to video element ─────────────────────
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream
      setCallStatus('connected')
    }
  }, [remoteStream])

  // ── Call timer ───────────────────────────────────────────────
  useEffect(() => {
    if (callStatus === 'connected') {
      durationRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    }
    return () => { if (durationRef.current) clearInterval(durationRef.current) }
  }, [callStatus])

  function formatDuration(s: number) {
    const m   = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  // ── Speech recognition ───────────────────────────────────────
  const startRecording = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Use Chrome for speech recognition.'); return }

    const r = new SR()
    r.continuous      = true
    r.interimResults  = true
    r.lang            = 'en-US'

    r.onresult = (event: any) => {
      let interim = '', finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        event.results[i].isFinal
          ? (finalChunk += event.results[i][0].transcript + ' ')
          : (interim    += event.results[i][0].transcript)
      }
      if (finalChunk) setTranscript(p => p + finalChunk)
      setInterimText(interim)
    }

    r.onerror = (e: any) => {
      if (e.error === 'not-allowed') alert('Microphone permission denied.')
    }

    r.onend = () => { if (recognitionRef.current) r.start() }

    r.start()
    recognitionRef.current = r
    setIsRecording(true)
  }, [])

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsRecording(false)
    setInterimText('')
  }, [])

  // ── Mic / camera toggles ─────────────────────────────────────
  function toggleMic() {
    localStream?.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
    setIsMuted(m => !m)
  }

  function toggleCamera() {
    localStream?.getVideoTracks().forEach(t => { t.enabled = !t.enabled })
    setIsCameraOff(c => !c)
  }

  // ── End call ─────────────────────────────────────────────────
  async function endCall() {
    stopRecording()
    localStream?.getTracks().forEach(t => t.stop())
    if (durationRef.current) clearInterval(durationRef.current)
    setCallStatus('ended')
    setIsAnalyzing(true)

    try {
      const res  = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ roomId, transcript: transcriptRef.current || '' })
      })
      const data = await res.json()
      setAnalysis({
        urgency:    data.urgency,
        confidence: data.confidence,
        summary:    data.summary,
        extracted:  data.extracted
      })
    } catch (err) {
      console.error('Analysis failed:', err)
      setAnalysis({
        urgency:    'low',
        confidence: 0.5,
        summary:    'Analysis failed. Please try again.',
        extracted:  { symptoms: [], medicines: [], advice: [], duration: null }
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  function copyRoomId() {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const urgencyConfig = {
    low:    { color: '#10b981', bg: '#10b98118', border: '#10b98133', label: '🟢 LOW URGENCY'   , icon: '✅' },
    medium: { color: '#f59e0b', bg: '#f59e0b18', border: '#f59e0b33', label: '🟡 MEDIUM URGENCY', icon: '⚠️' },
    high:   { color: '#ef4444', bg: '#ef444418', border: '#ef444433', label: '🔴 HIGH URGENCY'  , icon: '🚨' },
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Call Ended → Analysis Screen
  // ─────────────────────────────────────────────────────────────
  if (callStatus === 'ended') {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: '720px' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <div>
              <h1 className="font-display" style={{ fontSize: '1.8rem' }}>Consultation Summary</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
                Room {roomId} · Duration {formatDuration(callDuration)}
              </p>
            </div>
            <button onClick={() => router.push('/dashboard')}
              style={{ padding: '8px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}>
              Dashboard →
            </button>
          </div>

          {isAnalyzing ? (
            <div className="glass" style={{ padding: '60px', textAlign: 'center' }}>
              <div style={{ fontSize: '52px', marginBottom: '16px' }}>🧠</div>
              <p style={{ color: 'var(--accent)', fontSize: '16px', fontWeight: 600 }}>Analyzing consultation...</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>Running NLP pipeline + ML classification</p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '24px', flexWrap: 'wrap' }}>
                {['Preprocessing text', 'Extracting entities', 'Classifying urgency', 'Generating summary'].map((s, i) => (
                  <span key={s} style={{ fontSize: '12px', padding: '4px 12px', background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: '20px' }}>{s}</span>
                ))}
              </div>
            </div>
          ) : analysis ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Urgency banner */}
              {(() => {
                const cfg = urgencyConfig[analysis.urgency] ?? urgencyConfig.low
                return (
                  <div style={{ padding: '20px 24px', background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: '22px', fontWeight: 700, color: cfg.color }}>{cfg.label}</p>
                      <p style={{ fontSize: '13px', color: cfg.color, opacity: 0.8, marginTop: '3px' }}>
                        Model confidence: {(analysis.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                    <span style={{ fontSize: '52px' }}>{cfg.icon}</span>
                  </div>
                )
              })()}

              {/* Summary */}
              <div className="glass" style={{ padding: '20px 24px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>📋 Visit Summary</p>
                <p style={{ color: 'var(--text-primary)', lineHeight: 1.75, fontSize: '15px' }}>{analysis.summary}</p>
              </div>

              {/* Extracted grid */}
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
                          <span key={item} style={{ display: 'inline-block', margin: '2px 4px 2px 0', padding: '3px 10px', background: `${section.color}18`, color: section.color, border: `1px solid ${section.color}30`, borderRadius: '20px', fontSize: '12px' }}>
                            {item}
                          </span>
                        ))
                      : <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>None detected</p>
                    }
                  </div>
                ))}
              </div>

              {/* Transcript */}
              <div className="glass" style={{ padding: '20px 24px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>🎤 Full Transcript</p>
                <div className="transcript-box">
                  {transcript || <span style={{ color: 'var(--text-muted)' }}>No transcript was recorded.</span>}
                </div>
              </div>

            </div>
          ) : null}
        </div>
      </main>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Active Call
  // ─────────────────────────────────────────────────────────────

  // Connection status label
  const statusLabel = connectionState === 'connected'
    ? { text: 'Connected', color: '#10b981' }
    : peerJoined
    ? { text: 'Establishing P2P...', color: '#f59e0b' }
    : { text: 'Waiting for peer...', color: 'var(--text-muted)' }

  return (
    <main style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="font-display" style={{ fontSize: '1.15rem', color: 'var(--accent)' }}>⚕ MedAssist</span>
          <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <span className="font-mono" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{roomId}</span>
          <button onClick={copyRoomId}
            style={{ padding: '3px 10px', background: 'var(--accent-dim)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--accent)', fontSize: '12px', cursor: 'pointer' }}>
            {copied ? '✓ Copied' : 'Copy ID'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: statusLabel.color }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusLabel.color, display: 'inline-block' }} />
            {statusLabel.text}
          </span>
          {callStatus === 'connected' && (
            <span className="font-mono" style={{ fontSize: '13px', color: '#10b981' }}>
              {formatDuration(callDuration)}
            </span>
          )}
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{name} · {role}</span>
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Video area */}
        <div style={{ flex: 1, position: 'relative', background: '#050a14' }}>

          {/* Remote video */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: remoteStream ? 'block' : 'none' }}
          />

          {/* Waiting screen (no remote yet) */}
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
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Share this Room ID</p>
                  <p className="font-mono" style={{ fontSize: '20px', color: 'var(--accent)', letterSpacing: '0.15em' }}>{roomId}</p>
                </div>
              )}
            </div>
          )}

          {/* Local video PiP */}
          <div style={{ position: 'absolute', bottom: 16, right: 16, width: 176, height: 128, borderRadius: '10px', overflow: 'hidden', border: '2px solid var(--border)', background: 'var(--surface)' }}>
            <video ref={localVideoRef} autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: isCameraOff ? 'none' : 'block' }} />
            {isCameraOff && (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '28px' }}>📷</span>
              </div>
            )}
            <div style={{ position: 'absolute', bottom: 5, left: 8, fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>{name}</div>
          </div>

          {/* WebRTC connection badge */}
          {connectionState === 'connected' && (
            <div style={{ position: 'absolute', top: 12, left: 12, padding: '4px 12px', background: '#10b98122', border: '1px solid #10b98144', borderRadius: '20px', fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 6, height: 6, background: '#10b981', borderRadius: '50%' }} />
              P2P Connected
            </div>
          )}
        </div>

        {/* ── Right panel: transcript ── */}
        <div style={{ width: '340px', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', flexShrink: 0 }}>

          {/* Panel header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: '14px' }}>Live Transcript</p>
              {isRecording && (
                <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%', display: 'inline-block' }} className="recording" />
                  Recording...
                </p>
              )}
            </div>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={isRecording ? 'recording' : ''}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: 600, transition: 'all 0.2s',
                background: isRecording ? '#ef4444' : 'var(--accent)',
                color: isRecording ? 'white' : '#0a0f1e',
              }}>
              {isRecording ? '⏹ Stop' : '🎤 Record'}
            </button>
          </div>

          {/* Transcript content */}
          <div style={{ flex: 1, padding: '14px 16px', overflowY: 'auto' }}>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.9 }}>
              {transcript
                ? <><span style={{ color: 'var(--text-primary)' }}>{transcript}</span>
                    {interimText && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{interimText}</span>}
                  </>
                : <span style={{ color: 'var(--text-muted)' }}>
                    {isRecording ? 'Listening... speak now.' : 'Press Record to capture conversation.'}
                  </span>
              }
            </p>
          </div>

          {/* Word count */}
          <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {transcript.split(' ').filter(Boolean).length} words
            </p>
          </div>

          {/* Controls */}
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={toggleMic}
                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: isMuted ? '#ef444418' : 'var(--bg)', color: isMuted ? '#ef4444' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                {isMuted ? '🔇 Muted' : '🔊 Mic On'}
              </button>
              <button onClick={toggleCamera}
                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: isCameraOff ? '#ef444418' : 'var(--bg)', color: isCameraOff ? '#ef4444' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
                {isCameraOff ? '📷 Off' : '📹 On'}
              </button>
            </div>
            <button onClick={endCall}
              style={{ width: '100%', padding: '12px', background: '#ef4444', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
              📞 End & Analyze
            </button>
            <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
              Ends call · runs full AI pipeline
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
