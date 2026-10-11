import { LOCAL_AT } from '../geo/seat.ts'
import { getRoomSnapshot } from '../net/room.ts'
import { getView } from '../scene/view-store.ts'

/**
 * ↑↑↓↓←→←→BA Enter — while at a fire, a playful guest sits for ten seconds, then leaves.
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
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
    // Ignore typing in real fields if any appear later.
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return
    }

    const expected = SEQUENCE[progress]
    if (matches(event, expected)) {
      event.preventDefault()
      progress += 1
      if (progress >= SEQUENCE.length) {
        progress = 0
        void summonGuest()
      }
      return
    }

    // Soft restart if they begin the sequence again mid-way.
    progress = matches(event, SEQUENCE[0]) ? 1 : 0
  }

  async function summonGuest() {
    if (busy) {
      whisper('wait a moment…')
      return
    }

    const fireId = resolveFireId()
    if (!fireId) {
      whisper('sit by a fire first')
      return
    }

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

    whisper('a glint is arriving')

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'hello', id, hue: Math.random() }))
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

    ws.addEventListener('error', () => {
      whisper('could not invite')
      close()
    })
    ws.addEventListener('close', () => {
      busy = false
    })

    window.setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'leave' }))
        window.setTimeout(close, 250)
      } else {
        close()
      }
    }, STAY_MS)
  }

  window.addEventListener('keydown', onKey, true)
  ;(window as unknown as { __eldvaktSummonGuest?: () => void }).__eldvaktSummonGuest = () => {
    void summonGuest()
  }
}

function resolveFireId(): string | null {
  const room = getRoomSnapshot()
  if (room.self.seatedFireId) return room.self.seatedFireId

  const view = getView()
  // Beside the fire visually — still allow the demo even if sit state is lagging.
  if (view.seat >= LOCAL_AT && view.focusId) return view.focusId
  if (room.self.hostedFireId) return room.self.hostedFireId
  return null
}

function matches(event: KeyboardEvent, expected: (typeof SEQUENCE)[number]): boolean {
  if (event.code === expected) return true
  if (expected === 'Enter' && event.code === 'NumpadEnter') return true
  if (expected === 'KeyB' && event.key.toLowerCase() === 'b') return true
  if (expected === 'KeyA' && event.key.toLowerCase() === 'a') return true
  return false
}

/** Soft, wordless-enough hint — only for this experiment cheat. */
function whisper(text: string) {
  const existing = document.getElementById('eldvakt-konami-hint')
  existing?.remove()
  const el = document.createElement('div')
  el.id = 'eldvakt-konami-hint'
  el.textContent = text
  el.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:calc(88px + env(safe-area-inset-bottom))',
    'transform:translateX(-50%)',
    'z-index:20',
    'padding:8px 14px',
    'border-radius:999px',
    'background:rgba(16,9,6,0.72)',
    'color:#f0c27a',
    'font:500 13px/1.2 ui-sans-serif, system-ui, sans-serif',
    'letter-spacing:0.02em',
    'pointer-events:none',
    'opacity:0',
    'transition:opacity 280ms ease',
  ].join(';')
  document.body.appendChild(el)
  requestAnimationFrame(() => {
    el.style.opacity = '1'
  })
  window.setTimeout(() => {
    el.style.opacity = '0'
    window.setTimeout(() => el.remove(), 320)
  }, 2200)
}
