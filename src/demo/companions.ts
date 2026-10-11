import { connectRoom, getRoomSnapshot, send, subscribeRoom } from '../net/room.ts'
import { FALLBACK_POINT } from '../geo/locate.ts'
import { settleBy } from '../scene/view-store.ts'

/**
 * Experiment helper: open with ?demo=companions or ?demo=glints to sit
 * beside a fire without clicking through the globe.
 */
export function bootCompanionDemo() {
  if (typeof location === 'undefined') return
  const demo = new URLSearchParams(location.search).get('demo')
  if (demo !== 'companions' && demo !== 'glints') return

  const stopConnect = connectRoom()
  const started = performance.now()

  const tick = () => {
    const room = getRoomSnapshot()
    if (!room.connected) {
      if (performance.now() - started > 8000) return
      window.setTimeout(tick, 120)
      return
    }

    const existing = room.fires[0]
    if (room.self.seatedFireId && existing) {
      settleBy(existing.lat, existing.lon, existing.id)
      return
    }

    if (existing && !room.self.seatedFireId && !room.self.hostedFireId) {
      send({ type: 'sit', fireId: existing.id })
      return
    }

    if (!existing && !room.self.hostedFireId) {
      send({ type: 'light', lat: FALLBACK_POINT.lat, lon: FALLBACK_POINT.lon })
      return
    }

    if (room.self.seatedFireId) {
      const fire = room.fires.find((item) => item.id === room.self.seatedFireId)
      if (fire) settleBy(fire.lat, fire.lon, fire.id)
    }
  }

  const unsub = subscribeRoom(() => {
    const room = getRoomSnapshot()
    const fire = room.fires.find((item) => item.id === room.self.seatedFireId)
    if (fire) {
      settleBy(fire.lat, fire.lon, fire.id)
      unsub()
    } else {
      tick()
    }
  })
  tick()

  window.addEventListener('beforeunload', () => {
    unsub()
    stopConnect()
  })
}
