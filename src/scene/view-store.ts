import { angularDistance, slerpLatLon } from '../geo/sphere.ts'
import { normalizeLon } from '../geo/cell.ts'
import { LOCAL_AT } from '../geo/seat.ts'
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
  seatFrom: number
  seatTo: number
  focusId: string | null
  start: number
  dur: number
  descendAt: number
  riseUntil: number
}

type UiSnap = { traveling: boolean; focusId: string | null; near: boolean }

const state = {
  lat: 22,
  lon: 16,
  distance: VIEW_FAR,
  seat: 0,
  yaw: 0,
  pitch: 0,
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
    seat: state.seat,
    yaw: state.yaw,
    pitch: state.pitch,
    focusId: state.focusId,
    traveling: state.traveling,
  }
}

export function travelTo(
  lat: number,
  lon: number,
  distance: number,
  focusId: string | null,
  seatTo = 0,
) {
  const from = { lat: state.lat, lon: state.lon, distance: state.distance }
  const to = { lat, lon: normalizeLon(lon), distance: clamp(distance, VIEW_MIN, VIEW_MAX) }
  const arc = angularDistance(from, to)
  const descending = seatTo > state.seat + 0.05
  const rising = seatTo < state.seat - 0.05
  const near = arc < 0.12 && Math.abs(from.distance - to.distance) < 0.45
  const seconds = descending && near ? 7.4 : travelSeconds(from, to, arc)
  state.anim = {
    from,
    to,
    seatFrom: state.seat,
    seatTo,
    focusId,
    start: performance.now(),
    dur: seconds * 1000,
    descendAt: descending && !near ? 0.55 : 0,
    riseUntil: rising ? 0.5 : 0,
  }
  if (descending) {
    state.yaw = 0
    state.pitch = 0
  }
  if (focusId) state.focusId = focusId
  state.traveling = true
  publish()
}

/** Come down from the night and finish beside this fire. */
export function settleBy(lat: number, lon: number, focusId: string) {
  if (state.traveling && state.anim?.seatTo === 1 && state.focusId === focusId) return
  if (!state.traveling && state.seat > 0.98 && state.focusId === focusId) return
  travelTo(lat, lon, VIEW_ARRIVE, focusId, 1)
}

export function stepAway() {
  const anim = state.anim
  if (
    state.traveling &&
    anim &&
    anim.seatTo === 0 &&
    Math.abs(anim.to.distance - VIEW_FAR) < 0.001
  ) {
    return
  }
  travelTo(state.lat, state.lon, VIEW_FAR, null, 0)
}

export function nudge(dLat: number, dLon: number) {
  if (state.traveling) return
  if (state.seat >= LOCAL_AT) {
    state.yaw = clamp(state.yaw - dLon, -110, 110)
    state.pitch = clamp(state.pitch + dLat, -24, 42)
    return
  }
  state.lat = clamp(state.lat + dLat, -78, 78)
  state.lon = normalizeLon(state.lon + dLon)
}

export function setGaze(yaw: number, pitch: number) {
  if (state.traveling || state.seat < LOCAL_AT) return
  state.yaw = clamp(yaw, -110, 110)
  state.pitch = clamp(pitch, -24, 42)
}

export function zoomBy(factor: number) {
  if (state.traveling || state.seat > 0.02) return
  state.distance = clamp(state.distance * factor, VIEW_MIN, VIEW_MAX)
  publish()
}

export function tickView(now: number) {
  const anim = state.anim
  if (!anim) return
  const raw = (now - anim.start) / anim.dur
  const t = smootherstep(clamp(raw, 0, 1))
  const latLon = slerpLatLon(anim.from, anim.to, t)
  state.lat = latLon.lat
  state.lon = latLon.lon
  state.distance = anim.from.distance + (anim.to.distance - anim.from.distance) * t
  state.seat = anim.seatFrom + (anim.seatTo - anim.seatFrom) * seatT(anim, raw)
  if (raw >= 1) {
    state.lat = anim.to.lat
    state.lon = anim.to.lon
    state.distance = anim.to.distance
    state.seat = anim.seatTo
    state.focusId = anim.focusId
    state.traveling = false
    state.anim = null
    publish()
  }
}

export function arriveDistance() {
  return VIEW_ARRIVE
}

function seatT(anim: Anim, raw: number): number {
  if (anim.seatTo > anim.seatFrom && anim.descendAt > 0) {
    return smootherstep(clamp((raw - anim.descendAt) / (1 - anim.descendAt), 0, 1))
  }
  if (anim.seatTo < anim.seatFrom && anim.riseUntil > 0) {
    return smootherstep(clamp(raw / anim.riseUntil, 0, 1))
  }
  return smootherstep(clamp(raw, 0, 1))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
