import { angularDistance, slerpLatLon } from '../geo/sphere.ts'
import { normalizeLon } from '../geo/cell.ts'
import {
  smootherstep,
  travelSeconds,
  VIEW_ARRIVE,
  VIEW_FAR,
  VIEW_MAX,
  VIEW_MIN,
} from '../fire/view-distance.ts'

export type View = { lat: number; lon: number; distance: number }

type Anim = {
  from: View
  to: View
  focusId: string | null
  start: number
  dur: number
}

type UiSnap = { traveling: boolean; focusId: string | null; near: boolean }

const state = {
  lat: 22,
  lon: 16,
  distance: VIEW_FAR,
  focusId: null as string | null,
  traveling: false,
  anim: null as Anim | null,
}

let ui: UiSnap = { traveling: false, focusId: null, near: false }
const listeners = new Set<() => void>()

function publish() {
  const next: UiSnap = {
    traveling: state.traveling,
    focusId: state.focusId,
    near: state.distance < VIEW_FAR - 0.28,
  }
  if (next.traveling === ui.traveling && next.focusId === ui.focusId && next.near === ui.near) return
  ui = next
  for (const listener of listeners) listener()
}

export function subscribeView(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getViewUi(): UiSnap {
  return ui
}

export function getView() {
  return {
    lat: state.lat,
    lon: state.lon,
    distance: state.distance,
    focusId: state.focusId,
    traveling: state.traveling,
  }
}

export function travelTo(lat: number, lon: number, distance: number, focusId: string | null) {
  const from = { lat: state.lat, lon: state.lon, distance: state.distance }
  const to = { lat, lon: normalizeLon(lon), distance: clamp(distance, VIEW_MIN, VIEW_MAX) }
  const arc = angularDistance(from, to)
  state.anim = {
    from,
    to,
    focusId,
    start: performance.now(),
    dur: travelSeconds(from, to, arc) * 1000,
  }
  state.traveling = true
  state.focusId = focusId
  publish()
}

export function stepAway() {
  travelTo(state.lat, state.lon, VIEW_FAR, null)
}

export function nudge(dLat: number, dLon: number) {
  if (state.traveling) return
  state.lat = clamp(state.lat + dLat, -78, 78)
  state.lon = normalizeLon(state.lon + dLon)
}

export function zoomBy(factor: number) {
  if (state.traveling) return
  state.distance = clamp(state.distance * factor, VIEW_MIN, VIEW_MAX)
  publish()
}

export function tickView(now: number) {
  const anim = state.anim
  if (!anim) return
  const t = smootherstep((now - anim.start) / anim.dur)
  const latLon = slerpLatLon(anim.from, anim.to, t)
  state.lat = latLon.lat
  state.lon = latLon.lon
  state.distance = anim.from.distance + (anim.to.distance - anim.from.distance) * t
  if ((now - anim.start) / anim.dur >= 1) {
    state.lat = anim.to.lat
    state.lon = anim.to.lon
    state.distance = anim.to.distance
    state.focusId = anim.focusId
    state.traveling = false
    state.anim = null
    publish()
  }
}

export function arriveDistance() {
  return VIEW_ARRIVE
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
