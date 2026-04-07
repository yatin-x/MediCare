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
  const manualStopRef = useRef(false)
  const interimRef    = useRef('')
  const isMutedRef    = useRef(false)

  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])

  // Analysis state
  const [analysis, setAnalysis]       = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [copied, setCopied]           = useState(false)

  // WebRTC hook
  const { remoteStream, connectionState, peerJoined, socket } = useWebRTC({
    roomId,
    role,
    localStream
  })

  // Keep latest socket in a ref so we don't restart SpeechRecognition when it connects
  const socketRef = useRef<any>(null)
  useEffect(() => { socketRef.current = socket }, [socket])

  // Listen for remote transcript
  useEffect(() => {
    if (!socket) return
    const onRemoteChunk = ({ chunk, from }: { chunk: string; from: string }) => {
      setTranscript(p => {
        const updated = p + chunk
        transcriptRef.current = updated
        return updated
      })
    }
    socket.on('transcript-chunk', onRemoteChunk)
    return () => {
      socket.off('transcript-chunk', onRemoteChunk)
    }
  }, [socket])

  // ── Start camera ────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    getCameraStream()
      .then(stream => {
        if (!mounted) return
        setLocalStream(stream)
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        setCallStatus('connecting')
      })
      .catch(err => {
        console.error('Camera error:', err)
        if (mounted) setCallStatus('connecting')
      })

    return () => {
      mounted = false
      setLocalStream(prev => {
        prev?.getTracks().forEach(t => t.stop())
        return null
      })
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
const isRecordingRef = useRef(false)

const startRecording = useCallback(() => {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) { alert('Use Chrome for speech recognition.'); return }

  // Reset flags cleanly on every (re)start
  manualStopRef.current = false
  isRecordingRef.current = true

  const createAndStart = () => {
    // Always create a FRESH instance — never restart a dead one
    const r = new SR()
    r.continuous     = true
    r.interimResults = true
    r.lang           = 'en-US'

    r.onresult = (event: any) => {
      let interim = '', finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        result.isFinal
          ? (finalChunk += result[0].transcript + ' ')
          : (interim    += result[0].transcript)
      }

      setInterimText(interim)
      interimRef.current = interim

      if (finalChunk.trim() && !isMutedRef.current) {
        const textWithPrefix = `[${role}] ${finalChunk.trim()}\n`
        // Write to ref FIRST, then sync state from ref — avoids stale closure
        transcriptRef.current += textWithPrefix
        setTranscript(transcriptRef.current)

        if (socketRef.current) {
          socketRef.current.emit('transcript-chunk', { chunk: textWithPrefix, roomId })
        }
      }
    }

    r.onerror = (e: any) => {
      // TEMP: log everything so we can detect when Chrome/getUserMedia
      // steals the microphone (only one API can hold the mic at a time).
      // Keep this enabled during demo verification.
      console.log('🎤 SR Error:', e.error)
    }

    r.onstart = () => console.log('🎤 SR Started')

    r.onend = () => {
      // Only restart if we haven't been manually stopped
      if (!manualStopRef.current && isRecordingRef.current) {
        setTimeout(createAndStart, 250) // fresh instance every time
      }
    }

    try {
      r.start()
      recognitionRef.current = r
    } catch (err) {
      // If start throws, retry after a delay
      if (!manualStopRef.current && isRecordingRef.current) {
        setTimeout(createAndStart, 500)
      }
    }
  }

  createAndStart()
  setIsRecording(true)
}, [role, roomId])

const stopRecording = useCallback(() => {
  manualStopRef.current = true
  isRecordingRef.current = false
  if (recognitionRef.current) {
    try { recognitionRef.current.stop() } catch(e) {}
    recognitionRef.current = null
  }
  setIsRecording(false)
  setInterimText('')
}, [])

// ── Auto-start — runs once, StrictMode-safe ──────────────────
const hasStartedRef = useRef(false)
useEffect(() => {
  if (hasStartedRef.current) return // StrictMode guard
  hasStartedRef.current = true
  startRecording()
  return () => stopRecording()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    let finalTranscript = transcriptRef.current
    if (interimRef.current.trim() && !isMutedRef.current) {
      finalTranscript += `[${role}] ${interimRef.current.trim()}\n`
    }

    console.log('====================================================')
    console.log('🏁 FULL TRANSCRIPT TO BE SENT TO AI:')
    console.log('----------------------------------------------------')
    console.log(finalTranscript || '(No transcript recorded)')
    console.log('====================================================')

    if (!finalTranscript || !finalTranscript.trim()) {
      setAnalysis({
        urgency:    'low',
        confidence: 1.0,
        summary:    'No conversation was recorded during this session. Please ensure your microphone is working and not blocked by the browser.',
        extracted:  { symptoms: [], medicines: [], advice: [], duration: null }
      })
      setIsAnalyzing(false)
      return
    }

    try {
      const res  = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ roomId, transcript: finalTranscript })
      })
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Analysis request failed')
      }

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
          
          {/* ── Developer / Transcription Debug Console ── */}
          <div style={{ position: 'absolute', top: 12, right: 12, width: '300px', maxHeight: '150px', background: 'rgba(0,0,0,0.8)', border: '1px solid #333', borderRadius: '8px', padding: '8px 12px', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
            <div style={{ fontSize: '10px', color: '#10b981', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>🗣️ Live Transcription Debug</div>
            <div style={{ flex: 1, overflowY: 'auto', fontSize: '11px', color: '#ccc', fontFamily: 'monospace', lineHeight: 1.4 }}>
              {transcript ? (
                <>
                  <span style={{ color: 'white' }}>{transcript}</span>
                  {interimText && <span style={{ color: '#888', fontStyle: 'italic' }}>{interimText}</span>}
                </>
              ) : (
                <span style={{ color: '#666' }}>{isRecording ? 'Listening for speech...' : 'Waiting for microphone...'}</span>
              )}
            </div>
          </div>
          
          {/* ── Overlay Controls (replaces side panel) ── */}
          <div style={{
            position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: '16px',
            padding: '12px 24px', background: 'rgba(10, 15, 30, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '100px', backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            <button onClick={toggleMic}
              style={{
                width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.1)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', transition: 'all 0.2s'
              }}>
              {isMuted ? '🔇' : '🎤'}
            </button>
            <button onClick={toggleCamera}
              style={{
                width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: isCameraOff ? '#ef4444' : 'rgba(255,255,255,0.1)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', transition: 'all 0.2s'
              }}>
              {isCameraOff ? '📷' : '📹'}
            </button>
            <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)' }} />
            <button onClick={endCall}
              style={{
                padding: '0 24px', height: 48, borderRadius: '24px', border: 'none', cursor: 'pointer',
                background: '#ef4444', color: 'white', fontWeight: 600, fontSize: '15px',
                display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
              }}>
              📞 End & Analyze
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

async function getCameraStream(preferredDeviceId?: string) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('MediaDevices API not supported')
  }

  const tryGet = async (constraints: MediaStreamConstraints) => {
    return await navigator.mediaDevices.getUserMedia(constraints)
  }

  try {
    if (preferredDeviceId) {
      return await tryGet({ video: { deviceId: { exact: preferredDeviceId } }, audio: true })
    }
    return await tryGet({ video: true, audio: true })
  } catch (err) {
    console.warn('getUserMedia primary failed:', err)
    
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cams = devices.filter(d => d.kind === 'videoinput')
    if (cams.length === 0) throw new Error('No camera devices found')

    try {
      return await tryGet({ video: { deviceId: cams[0].deviceId }, audio: true })
    } catch (err2) {
      console.warn('Fallback with specific deviceId failed:', err2)
      return await tryGet({ video: true, audio: true })
    }
  }
}
