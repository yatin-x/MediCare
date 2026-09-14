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

function iceServers(): RTCIceServer[] {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

export function useWebRTC({ roomId, role, localStream }: UseWebRTCProps): WebRTCState {
  const socketRef = useRef<Socket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteIdRef = useRef<string | null>(null)
  const outgoingIceRef = useRef<RTCIceCandidateInit[]>([])
  const incomingIceRef = useRef<RTCIceCandidateInit[]>([])
  const makingOfferRef = useRef(false)

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] = useState<WebRTCState['connectionState']>('idle')
  const [peerJoined, setPeerJoined] = useState(false)
  const [socket, setSocket] = useState<Socket | null>(null)

  localStreamRef.current = localStream

  useEffect(() => {
    if (!localStream || !roomId) return

    outgoingIceRef.current = []
    incomingIceRef.current = []
    makingOfferRef.current = false

    const socket = io(process.env.NEXT_PUBLIC_APP_URL || window.location.origin, {
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    function attachRemote(stream: MediaStream) {
      setRemoteStream(stream)
      setConnectionState('connected')
    }

    function wirePc(pc: RTCPeerConnection) {
      pcRef.current = pc
      const stream = localStreamRef.current
      if (stream) {
        for (const track of stream.getTracks()) {
          if (!pc.getSenders().some(s => s.track === track)) {
            pc.addTrack(track, stream)
          }
        }
      }

      pc.ontrack = event => {
        const inbound = event.streams[0] ?? new MediaStream([event.track])
        event.track.enabled = true
        event.track.onunmute = () => attachRemote(inbound)
        attachRemote(inbound)
      }

      pc.onicecandidate = event => {
        if (!event.candidate) return
        const payload = event.candidate.toJSON()
        if (remoteIdRef.current) {
          socket.emit('signal-ice', { candidate: payload, to: remoteIdRef.current, roomId })
        } else {
          outgoingIceRef.current.push(payload)
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setConnectionState('connected')
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setConnectionState('disconnected')
        }
      }
    }

    function rememberPeer(socketId: string) {
      remoteIdRef.current = socketId
      setPeerJoined(true)
      const queued = outgoingIceRef.current.splice(0)
      queued.forEach(candidate => {
        socket.emit('signal-ice', { candidate, to: socketId, roomId })
      })
    }

    async function drainIncomingIce(pc: RTCPeerConnection) {
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
      const pc = pcRef.current
      if (!pc || makingOfferRef.current || pc.signalingState !== 'stable') return
      makingOfferRef.current = true
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
        await pc.setLocalDescription(offer)
        socket.emit('signal-offer', { roomId, offer, to })
      } catch (err) {
        console.error('Offer error:', err)
      } finally {
        makingOfferRef.current = false
      }
    }

    function replacePc() {
      pcRef.current?.close()
      const pc = new RTCPeerConnection({ iceServers: iceServers() })
      wirePc(pc)
      return pc
    }

    const pc = new RTCPeerConnection({ iceServers: iceServers() })
    wirePc(pc)

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
        let peer = pcRef.current
        if (!peer || peer.signalingState !== 'stable') {
          peer = replacePc()
        }
        await peer.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        socket.emit('signal-answer', { answer, to: from, roomId })
        await drainIncomingIce(peer)
      } catch (err) {
        console.error('Answer error:', err)
      }
    })

    socket.on('signal-answer', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      const peer = pcRef.current
      if (!peer) return
      try {
        if (peer.signalingState !== 'have-local-offer') return
        await peer.setRemoteDescription(new RTCSessionDescription(answer))
        await drainIncomingIce(peer)
      } catch (err) {
        console.error('Set remote desc error:', err)
      }
    })

    socket.on('signal-ice', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      const peer = pcRef.current
      if (!peer || !peer.remoteDescription) {
        incomingIceRef.current.push(candidate)
        return
      }
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.error('ICE error:', err)
      }
    })

    socket.on('peer-left', () => {
      setPeerJoined(false)
      setConnectionState('disconnected')
      setRemoteStream(null)
      remoteIdRef.current = null
    })

    if (socket.connected) handleConnect()

    return () => {
      makingOfferRef.current = false
      socket.emit('leave-room', { roomId })
      socket.removeAllListeners()
      socket.disconnect()
      pcRef.current?.close()
      pcRef.current = null
      socketRef.current = null
    }
  }, [localStream, roomId, role])

  return { remoteStream, connectionState, peerJoined, socket }
}
