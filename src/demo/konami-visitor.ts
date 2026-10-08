import { getRoomSnapshot } from '../net/room.ts'

/**
 * ↑↑↓↓←→←→BA Enter — while seated, a playful guest sits for ten seconds, then leaves.
 * Lets you watch the grow-in and the shooting-star goodbye without a second phone.
 */
const SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
  'Enter',
] as const

const STAY_MS = 10_000

export function bootKonamiVisitor() {
  if (typeof window === 'undefined') return

  let progress = 0
  let busy = false

  const onKey = (event: KeyboardEvent) => {
    if (event.repeat) return
    const expected = SEQUENCE[progress]
    if (event.code === expected) {
      progress += 1
      if (progress >= SEQUENCE.length) {
        progress = 0
        void summonGuest()
      }
      return
    }
    progress = event.code === SEQUENCE[0] ? 1 : 0
  }

  async function summonGuest() {
    if (busy) return
    const fireId = getRoomSnapshot().self.seatedFireId
    if (!fireId) return

    busy = true
    let seated = false
    const id = `konami${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws`)

    const close = () => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      busy = false
    }

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'hello', id }))
    })

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        type: string
        self?: { seatedFireId: string | null }
      }
      if (message.type !== 'world') return
      if (message.self?.seatedFireId === fireId) {
        seated = true
        return
      }
      if (seated || message.self?.seatedFireId) return
      ws.send(JSON.stringify({ type: 'sit', fireId }))
    })

    ws.addEventListener('error', close)
    ws.addEventListener('close', () => {
      busy = false
    })

    window.setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'leave' }))
        window.setTimeout(close, 200)
      } else {
        close()
      }
    }, STAY_MS)
  }

  window.addEventListener('keydown', onKey)
}
