import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'
import { ID_PATTERN, type ClientMessage, type Happened, type ServerMessage } from '../src/shared/protocol.ts'
import { Room } from './room.ts'

const PORT = 8647
const HOST = '0.0.0.0'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const room = new Room()

type Client = { id: string; socket: WebSocket }

const clients = new Map<string, Client>()

const server = http.createServer()
const sockets = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname !== '/ws') return
  sockets.handleUpgrade(request, socket, head, (ws) => {
    sockets.emit('connection', ws)
  })
})

sockets.on('connection', (socket) => {
  let clientId: string | null = null

  socket.on('message', (data) => {
    let message: ClientMessage
    try {
      message = JSON.parse(data.toString()) as ClientMessage
    } catch {
      return
    }
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return

    if (message.type === 'hello') {
      if (!ID_PATTERN.test(message.id)) return
      clientId = message.id
      const previous = clients.get(clientId)
      clients.set(clientId, { id: clientId, socket })
      if (previous && previous.socket !== socket) previous.socket.close()
      send(socket, worldFor(clientId))
      return
    }

    if (!clientId) return
    const happened = apply(clientId, message)
    if (!happened) return
    const dead = room.sweep()
    for (const fireId of dead) broadcast({ kind: 'died', fireId })
    broadcast(happened)
  })

  socket.on('close', () => {
    if (!clientId) return
    const current = clients.get(clientId)
    if (!current || current.socket !== socket) return
    clients.delete(clientId)
    const left = room.leave(clientId)
    if (!left) return
    broadcast(left.died ? { kind: 'died', fireId: left.fireId } : { kind: 'left', fireId: left.fireId })
  })

  socket.on('error', () => {
    socket.close()
  })
})

function apply(userId: string, message: ClientMessage): Happened | null {
  switch (message.type) {
    case 'hello':
      return null
    case 'light': {
      const fire = room.light(userId, message.lat, message.lon)
      return fire ? { kind: 'lit', fireId: fire.id } : null
    }
    case 'sit': {
      const fire = room.sit(userId, message.fireId)
      return fire ? { kind: 'sat', fireId: fire.id } : null
    }
    case 'leave': {
      const left = room.leave(userId)
      if (!left) return null
      return left.died ? { kind: 'died', fireId: left.fireId } : { kind: 'left', fireId: left.fireId }
    }
    case 'log': {
      const fire = room.log(userId)
      return fire ? { kind: 'log', fireId: fire.id } : null
    }
    case 'extinguish': {
      const fireId = room.extinguish(userId)
      return fireId ? { kind: 'extinguished', fireId } : null
    }
    case 'greet': {
      const greet = room.greet(userId, message.intensity)
      return greet ? { kind: 'greet', fireId: greet.fireId, intensity: greet.intensity } : null
    }
    default:
      return null
  }
}

function worldFor(userId: string, happened?: Happened): ServerMessage {
  return {
    type: 'world',
    serverNow: Date.now(),
    fires: room.publicFires(),
    self: room.self(userId),
    happened,
  }
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

function broadcast(happened?: Happened) {
  for (const client of clients.values()) send(client.socket, worldFor(client.id, happened))
}

setInterval(() => {
  const dead = room.sweep()
  for (const fireId of dead) broadcast({ kind: 'died', fireId })
}, 400)

async function listen() {
  if (process.env.NODE_ENV === 'production') {
    const dist = path.join(root, 'dist')
    server.on('request', (req, res) => serveStatic(dist, req, res))
  } else {
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      root,
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    })
    server.on('request', (req, res) => {
      vite.middlewares(req, res, () => {
        res.statusCode = 404
        res.end('not found')
      })
    })
  }

  await new Promise<void>((resolve) => {
    server.listen(PORT, HOST, () => resolve())
  })
  console.log(`Eldvakt listening on http://127.0.0.1:${PORT}`)
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function serveStatic(dist: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)
  const full = path.normalize(path.join(dist, requested))
  if (full !== dist && !full.startsWith(dist + path.sep)) {
    res.statusCode = 403
    res.end()
    return
  }
  const file = existsSync(full) && statSync(full).isFile() ? full : path.join(dist, 'index.html')
  if (!existsSync(file)) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream')
  createReadStream(file).pipe(res)
}

listen().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
