'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

interface UseWebRTCProps {
  roomId: string
  role: 'doctor' | 'patient'
  localStream: MediaStream | null
}

interface WebRTCState {
  remoteStream: MediaStream | null
  connectionState: 'idle' | 'connecting' | 'connected' | 'disconnected'
  peerJoined: boolean
  socket: any
}

export function useWebRTC({ roomId, role, localStream }: UseWebRTCProps): WebRTCState {
  const socketRef = useRef<Socket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  
  // FIX: Don't instantiate MediaStream on the server. Default to null.
  const remoteStreamRef = useRef<MediaStream | null>(null)

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] = useState<WebRTCState['connectionState']>('idle')
  const [peerJoined, setPeerJoined] = useState(false)

  // ── Create RTCPeerConnection ───────────────────────────────
  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    })

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream)
      })
    }

    // Receive remote tracks
    pc.ontrack = (event) => {
      // FIX: Lazily initialize MediaStream only on the client
      if (!remoteStreamRef.current && typeof MediaStream !== 'undefined') {
        remoteStreamRef.current = new MediaStream()
      }
      
      if (remoteStreamRef.current) {
        event.streams[0].getTracks().forEach(track => {
          // Prevent adding duplicate tracks
          if (!remoteStreamRef.current!.getTracks().map(t => t.id).includes(track.id)) {
            remoteStreamRef.current!.addTrack(track)
          }
        })
        setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()))
      }
      setConnectionState('connected')
    }

    // ICE candidate → send to peer via signaling server
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('signal-ice', {
          candidate: event.candidate,
          to: pcRef.current?.remoteDescription ? getRemoteId() : null,
          roomId
        })
      }
    }

    pc.onconnectionstatechange = () => {
      console.log('PC state:', pc.connectionState)
      if (pc.connectionState === 'connected') setConnectionState('connected')
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionState('disconnected')
      }
    }

    return pc
  }, [localStream, roomId])

  // Track remote socket ID
  const remoteIdRef = useRef<string | null>(null)
  const getRemoteId = () => remoteIdRef.current

  // ── Main WebRTC setup ──────────────────────────────────────
  useEffect(() => {
    if (!localStream || !roomId) return

    const socket = io(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000', {
      transports: ['websocket']
    })
    socketRef.current = socket

    const pc = createPC()
    pcRef.current = pc

    // Join room
    socket.emit('join-room', { roomId, role })
    setConnectionState('connecting')

    // ── Someone already in room — we initiate offer ──────────
    socket.on('room-peers', async (peers: Array<{ role: string; socketId: string }>) => {
      if (peers.length > 0) {
        remoteIdRef.current = peers[0].socketId
        setPeerJoined(true)

        // Doctor creates the offer
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socket.emit('signal-offer', { roomId, offer, to: peers[0].socketId })
        } catch (err) {
          console.error('Offer error:', err)
        }
      }
    })

    // ── New peer joined — if we're the one already here, wait for their offer ──
    socket.on('peer-joined', ({ socketId }: { role: string; socketId: string }) => {
      remoteIdRef.current = socketId
      setPeerJoined(true)
      console.log('Peer joined:', socketId)
    })

    // ── Received offer → send answer ─────────────────────────
    socket.on('signal-offer', async ({ offer, from }: { offer: RTCSessionDescriptionInit; from: string }) => {
      remoteIdRef.current = from
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('signal-answer', { answer, to: from })
      } catch (err) {
        console.error('Answer error:', err)
      }
    })

    // ── Received answer ───────────────────────────────────────
    socket.on('signal-answer', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      } catch (err) {
        console.error('Set remote desc error:', err)
      }
    })

    // ── ICE candidates ────────────────────────────────────────
    socket.on('signal-ice', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.error('ICE error:', err)
      }
    })

    // ── Peer disconnected ─────────────────────────────────────
    socket.on('peer-left', () => {
      setPeerJoined(false)
      setConnectionState('disconnected')
      setRemoteStream(null)
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave-room', { roomId })
        socketRef.current.disconnect()
      }
      if (pcRef.current) {
        pcRef.current.close()
      }
    }
  }, [localStream, roomId, role, createPC])

  return { remoteStream, connectionState, peerJoined, socket: socketRef.current }
}
