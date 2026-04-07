// server.js - Custom Next.js server with Socket.io for WebRTC signaling
// Run with: node server.js (instead of next dev)

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

// Track rooms: roomId -> { doctor: socketId, patient: socketId }
const rooms = {}

async function start() {
  await app.prepare()

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '', true)
    handle(req, res, parsedUrl)
  })

  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  })

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id)

    socket.on('join-room', ({ roomId, role }) => {
      socket.join(roomId)

      if (!rooms[roomId]) rooms[roomId] = {}
      rooms[roomId][role] = socket.id

      console.log(`[${roomId}] ${role} joined (${socket.id})`)

      socket.to(roomId).emit('peer-joined', { role, socketId: socket.id })

      const others = Object.entries(rooms[roomId] || {})
        .filter(([r]) => r !== role)
        .map(([r, id]) => ({ role: r, socketId: id }))

      if (others.length > 0) {
        socket.emit('room-peers', others)
      }
    })

    socket.on('signal-offer', ({ roomId, offer, to }) => {
      console.log(`[${roomId}] offer from ${socket.id} to ${to}`)
      io.to(to).emit('signal-offer', { offer, from: socket.id })
    })

    socket.on('signal-answer', ({ answer, to }) => {
      console.log(`answer from ${socket.id} to ${to}`)
      io.to(to).emit('signal-answer', { answer, from: socket.id })
    })

    socket.on('signal-ice', ({ candidate, to }) => {
      io.to(to).emit('signal-ice', { candidate, from: socket.id })
    })

    socket.on('transcript-chunk', ({ chunk, to, roomId }) => {
      if (to) {
        io.to(to).emit('transcript-chunk', { chunk, from: socket.id })
      } else if (roomId) {
        socket.to(roomId).emit('transcript-chunk', { chunk, from: socket.id })
      }
    })

    socket.on('leave-room', ({ roomId }) => {
      socket.to(roomId).emit('peer-left')
      if (rooms[roomId]) {
        Object.keys(rooms[roomId]).forEach(role => {
          if (rooms[roomId][role] === socket.id) {
            delete rooms[roomId][role]
          }
        })
      }
    })

    socket.on('disconnect', () => {
      Object.entries(rooms).forEach(([roomId, peers]) => {
        Object.entries(peers).forEach(([role, id]) => {
          if (id === socket.id) {
            socket.to(roomId).emit('peer-left')
            delete rooms[roomId][role]
          }
        })
      })
      console.log('Socket disconnected:', socket.id)
    })
  })

  const PORT = process.env.PORT || 3000
  httpServer.listen(PORT, () => {
    console.log(`> MedAssist running on http://localhost:${PORT}`)
    console.log(`> WebRTC signaling server active`)
  })
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
