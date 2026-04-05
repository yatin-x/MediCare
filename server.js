// server.js - Custom Next.js server with Socket.io for WebRTC signaling
// Run with: node server.js (instead of next dev)

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

// Track rooms: roomId -> { doctor: socketId, patient: socketId }
const rooms = {}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  })

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id)

    // Doctor or patient joins a room
    socket.on('join-room', ({ roomId, role }) => {
      socket.join(roomId)

      if (!rooms[roomId]) rooms[roomId] = {}
      rooms[roomId][role] = socket.id

      console.log(`[${roomId}] ${role} joined (${socket.id})`)

      // Notify other peer that someone joined
      socket.to(roomId).emit('peer-joined', { role, socketId: socket.id })

      // Tell the joiner who else is already in the room
      const others = Object.entries(rooms[roomId])
        .filter(([r]) => r !== role)
        .map(([r, id]) => ({ role: r, socketId: id }))

      if (others.length > 0) {
        socket.emit('room-peers', others)
      }
    })

    // WebRTC signaling: offer
    socket.on('signal-offer', ({ roomId, offer, to }) => {
      console.log(`[${roomId}] offer from ${socket.id} to ${to}`)
      io.to(to).emit('signal-offer', { offer, from: socket.id })
    })

    // WebRTC signaling: answer
    socket.on('signal-answer', ({ answer, to }) => {
      console.log(`answer from ${socket.id} to ${to}`)
      io.to(to).emit('signal-answer', { answer, from: socket.id })
    })

    // WebRTC signaling: ICE candidates
    socket.on('signal-ice', ({ candidate, to }) => {
      io.to(to).emit('signal-ice', { candidate, from: socket.id })
    })

    // Peer left
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
      // Clean up all rooms this socket was in
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
})
