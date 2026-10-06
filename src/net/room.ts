import { hearthAudio, pulse } from '../audio/hearth.ts'
import { deviceId } from '../identity.ts'
import type {
  ClientMessage,
  Happened,
  PublicFire,
  SelfState,
  ServerMessage,
} from '../shared/protocol.ts'
import { getView, travelTo } from '../scene/view-store.ts'
import { VIEW_ARRIVE } from '../fire/view-distance.ts'

export type Greeting = { id: number; fireId: string; intensity: number }

type RoomSnapshot = {
  connected: boolean
  fires: PublicFire[]
  self: SelfState
  greetings: Greeting[]
}

const emptySelf: SelfState = { id: '', seatedFireId: null, hostedFireId: null }

let snapshot: RoomSnapshot = {
  connected: false,
  fires: [],
  self: emptySelf,
  greetings: [],
}

let offset = 0
let greetSeq = 1
let socket: WebSocket | null = null
let refs = 0
let backoff = 600
let reconnectTimer = 0
const queue: ClientMessage[] = []
const listeners = new Set<() => void>()

export function subscribeRoom(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRoomSnapshot(): RoomSnapshot {
  return snapshot
}

export function serverNow(): number {
  return Date.now() + offset
}

export function connectRoom() {
  refs += 1
  if (!socket || socket.readyState > WebSocket.OPEN) open()
  return () => {
    refs -= 1
    window.setTimeout(() => {
      if (refs > 0) return
      window.clearTimeout(reconnectTimer)
      socket?.close()
      socket = null
    }, 40)
  }
}

export function send(message: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  else queue.push(message)
}

function open() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const next = new WebSocket(`${protocol}://${location.host}/ws`)
  socket = next
  next.addEventListener('open', () => {
    backoff = 600
    next.send(JSON.stringify({ type: 'hello', id: deviceId() } satisfies ClientMessage))
    for (const message of queue.splice(0)) next.send(JSON.stringify(message))
  })
  next.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as ServerMessage
    if (message.type !== 'world') return
    offset = message.serverNow - Date.now()
    const greetings = message.happened?.kind === 'greet'
      ? [...snapshot.greetings, { id: greetSeq++, fireId: message.happened.fireId, intensity: message.happened.intensity }].slice(-24)
      : snapshot.greetings
    snapshot = {
      connected: true,
      fires: message.fires,
      self: message.self,
      greetings,
    }
    publish()
    react(message.happened, message)
  })
  next.addEventListener('close', () => {
    if (socket !== next) return
    snapshot = { ...snapshot, connected: false }
    publish()
    if (refs <= 0) return
    reconnectTimer = window.setTimeout(open, backoff)
    backoff = Math.min(8000, backoff * 2)
  })
}

function publish() {
  for (const listener of listeners) listener()
}

function react(happened: Happened | undefined, message: ServerMessage) {
  if (!happened) return
  if (happened.kind === 'lit' && message.self.hostedFireId === happened.fireId) {
    const fire = message.fires.find((item) => item.id === happened.fireId)
    if (fire) travelTo(fire.lat, fire.lon, VIEW_ARRIVE, fire.id)
  }
  const seatedHere = message.self.seatedFireId === happened.fireId
  const watching = getView().focusId === happened.fireId
  const present = seatedHere || watching
  if (happened.kind === 'sat' && present) hearthAudio.sit()
  if ((happened.kind === 'log' || happened.kind === 'lit') && present) hearthAudio.log()
  if (seatedHere && (happened.kind === 'sat' || happened.kind === 'log' || happened.kind === 'lit')) pulse()
}
