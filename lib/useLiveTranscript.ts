'use client'

import { useCallback, useEffect, useRef } from 'react'
import { isUnusableTranscriptChunk } from '@/lib/agent/grounding'

export type AsrStatus = 'idle' | 'ok' | 'err' | 'loading'

type SpeechRecognitionAlternativeLike = { transcript?: string }
type SpeechRecognitionResultLike = { isFinal?: boolean; 0?: SpeechRecognitionAlternativeLike }
type SpeechRecognitionEventLike = { results?: ArrayLike<SpeechRecognitionResultLike> }
type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor
    SpeechRecognition?: SpeechRecognitionConstructor
  }
}

function speechCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function pickRecorderMime(): string | undefined {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return types.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
}

export function useLiveTranscript(opts: {
  roomId: string
  role: string
  active: boolean
  stream: MediaStream | null
  onChunk: (chunk: string) => void
  onStatus: (s: AsrStatus) => void
}) {
  const onChunkRef = useRef(opts.onChunk)
  const onStatusRef = useRef(opts.onStatus)

  useEffect(() => {
    onChunkRef.current = opts.onChunk
    onStatusRef.current = opts.onStatus
  }, [opts.onChunk, opts.onStatus])

  const persist = useCallback(async (chunk: string) => {
    try {
      await fetch('/api/visits/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: opts.roomId,
          type: 'transcript_chunk',
          role: opts.role,
          payload: chunk,
        }),
      })
    } catch {
      // best-effort
    }
  }, [opts.roomId, opts.role])

  const emit = useCallback((raw: string) => {
    if (isUnusableTranscriptChunk(raw)) return
    const chunk = `[${opts.role}] ${raw.trim()}\n`
    onChunkRef.current(chunk)
    void persist(chunk)
  }, [opts.role, persist])

  useEffect(() => {
    if (!opts.active) return

    let cancelled = false
    let rec: SpeechRecognitionLike | null = null
    let recorder: MediaRecorder | null = null
    let worker: Worker | null = null
    let flushTimer: ReturnType<typeof setInterval> | null = null
    const chunks: Blob[] = []

    const emitText = (raw: string) => {
      if (cancelled) return
      emit(raw)
      onStatusRef.current('ok')
    }

    const startWhisper = () => {
      if (cancelled || !opts.stream) {
        onStatusRef.current('err')
        return
      }
      const track = opts.stream.getAudioTracks()[0]
      if (!track) {
        onStatusRef.current('err')
        return
      }

      worker = new Worker('/whisper-worker.js', { type: 'module' })
      worker.onmessage = (e: MessageEvent<{ status: string; text?: string }>) => {
        if (e.data.status === 'loading') {
          onStatusRef.current('loading')
          return
        }
        if (e.data.status === 'error') {
          onStatusRef.current('err')
          return
        }
        if (e.data.status === 'done' && e.data.text?.trim()) {
          emitText(e.data.text)
        }
      }

      const mime = pickRecorderMime()
      const audioOnly = new MediaStream([track])
      try {
        recorder = mime
          ? new MediaRecorder(audioOnly, { mimeType: mime })
          : new MediaRecorder(audioOnly)
      } catch {
        onStatusRef.current('err')
        return
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      const flush = async () => {
        if (chunks.length === 0 || !worker) return
        const blob = new Blob(chunks.splice(0, chunks.length), { type: recorder?.mimeType || 'audio/webm' })
        if (blob.size < 1500) return
        onStatusRef.current('loading')
        try {
          const ctx = new AudioContext({ sampleRate: 16000 })
          const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
          const pcm = new Float32Array(decoded.getChannelData(0))
          worker.postMessage({ audioData: pcm, sampleRate: 16000 }, [pcm.buffer])
          await ctx.close()
        } catch {
          // short/incomplete webm — skip this slice
        }
      }

      try {
        recorder.start(4000)
      } catch {
        onStatusRef.current('err')
        return
      }
      onStatusRef.current('loading')
      flushTimer = setInterval(() => { void flush() }, 5000)
    }

    const Ctor = speechCtor()
    if (Ctor) {
      rec = new Ctor()
      rec.continuous = true
      rec.interimResults = false
      rec.lang = 'en-US'
      rec.onresult = (event) => {
        const results = event.results
        if (!results || results.length === 0) return
        const last = results[results.length - 1]
        const text = last?.[0]?.transcript ?? ''
        emitText(text)
      }
      rec.onerror = (event) => {
        const code = event.error
        if (code === 'aborted' || code === 'no-speech') return
        try { rec?.stop() } catch { /* ignore */ }
        rec = null
        if (!cancelled) startWhisper()
      }
      rec.onend = () => {
        if (cancelled || recorder || !rec) return
        try { rec.start() } catch { if (!cancelled) startWhisper() }
      }
      try {
        rec.start()
        onStatusRef.current('ok')
      } catch {
        startWhisper()
      }
    } else {
      startWhisper()
    }

    return () => {
      cancelled = true
      if (flushTimer) clearInterval(flushTimer)
      try { rec?.stop() } catch { /* ignore */ }
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop()
      } catch { /* ignore */ }
      worker?.terminate()
    }
  }, [opts.active, opts.role, opts.stream, emit])
}
