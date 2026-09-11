'use client'

import { useEffect, useRef, useState } from 'react'
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
  socket: Socket | null
}

export function useWebRTC({ roomId, role, localStream }: UseWebRTCProps): WebRTCState {
  const socketRef = useRef<Socket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const remoteIdRef = useRef<string | null>(null)
  const outgoingIceRef = useRef<RTCIceCandidateInit[]>([])
  const incomingIceRef = useRef<RTCIceCandidateInit[]>([])
  const makingOfferRef = useRef(false)

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] = useState<WebRTCState['connectionState']>('idle')
  const [peerJoined, setPeerJoined] = useState(false)
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (!localStream || !roomId) return

    outgoingIceRef.current = []
    incomingIceRef.current = []
    remoteStreamRef.current = new MediaStream()

    const socket = io(process.env.NEXT_PUBLIC_APP_URL || window.location.origin, {
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })
    pcRef.current = pc

    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream)
    })

    pc.ontrack = event => {
      const inbound = remoteStreamRef.current ?? new MediaStream()
      remoteStreamRef.current = inbound
      if (!inbound.getTracks().some(t => t.id === event.track.id)) {
        inbound.addTrack(event.track)
      }
      setRemoteStream(new MediaStream(inbound.getTracks()))
      setConnectionState('connected')
    }

    function emitIce(candidate: RTCIceCandidateInit) {
      socket.emit('signal-ice', {
        candidate,
        to: remoteIdRef.current,
        roomId,
      })
    }

    pc.onicecandidate = event => {
      if (!event.candidate) return
      const payload = event.candidate.toJSON()
      if (remoteIdRef.current) emitIce(payload)
      else outgoingIceRef.current.push(payload)
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setConnectionState('connected')
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionState('disconnected')
      }
    }

    function rememberPeer(socketId: string) {
      remoteIdRef.current = socketId
      setPeerJoined(true)
      const queued = outgoingIceRef.current.splice(0)
      queued.forEach(emitIce)
    }

    async function drainIncomingIce() {
      const queued = incomingIceRef.current.splice(0)
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.error('ICE error:', err)
        }
      }
    }

    async function makeOffer(to: string) {
      if (makingOfferRef.current || pc.signalingState !== 'stable') return
      makingOfferRef.current = true
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('signal-offer', { roomId, offer, to })
      } catch (err) {
        console.error('Offer error:', err)
      } finally {
        makingOfferRef.current = false
      }
    }

    const handleConnect = () => {
      setSocket(socket)
      setConnectionState('connecting')
      socket.emit('join-room', { roomId, role })
    }
    const handleDisconnect = () => {
      setSocket(null)
      setConnectionState('disconnected')
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)

    socket.on('room-peers', async (peers: Array<{ role: string; socketId: string }>) => {
      if (peers.length === 0) return
      rememberPeer(peers[0].socketId)
      await makeOffer(peers[0].socketId)
    })

    socket.on('peer-joined', ({ socketId }: { role: string; socketId: string }) => {
      rememberPeer(socketId)
    })

    socket.on('signal-offer', async ({ offer, from }: { offer: RTCSessionDescriptionInit; from: string }) => {
      rememberPeer(from)
      try {
        if (pc.signalingState !== 'stable') return
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('signal-answer', { answer, to: from, roomId })
        await drainIncomingIce()
      } catch (err) {
        console.error('Answer error:', err)
      }
    })

    socket.on('signal-answer', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      try {
        if (pc.signalingState !== 'have-local-offer') return
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
        await drainIncomingIce()
      } catch (err) {
        console.error('Set remote desc error:', err)
      }
    })

    socket.on('signal-ice', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (!pc.remoteDescription) {
        incomingIceRef.current.push(candidate)
        return
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.error('ICE error:', err)
      }
    })

    socket.on('peer-left', () => {
      setPeerJoined(false)
      setConnectionState('disconnected')
      setRemoteStream(null)
      remoteStreamRef.current = new MediaStream()
      remoteIdRef.current = null
    })

    if (socket.connected) handleConnect()

    return () => {
      makingOfferRef.current = false
      socket.emit('leave-room', { roomId })
      socket.removeAllListeners()
      socket.disconnect()
      pc.close()
      pcRef.current = null
      socketRef.current = null
    }
  }, [localStream, roomId, role])

  return { remoteStream, connectionState, peerJoined, socket }
}
