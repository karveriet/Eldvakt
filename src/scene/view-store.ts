import { normalizeLon } from '../geo/cell.ts'
import { angularDistance, latLonToVector, slerpLatLon, vectorToLatLon } from '../geo/sphere.ts'
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

/** Orbit inertia in degrees/second. */
let spinLat = 0
let spinLon = 0
let lastTick: number | null = null
/** Stable local-east when the look point sits on a pole. */
let lastEast = { x: 0, y: 0, z: 1 }

/** Exponential friction; higher = stops sooner. */
const SPIN_DECAY = 1.85
const SPIN_STOP = 0.35
/** Ignore tiny release speeds so a slow lift does not coast. */
const FLING_MIN = 70
/** Cap so a hard flick can spin hard without going infinite. */
const FLING_MAX = 1200

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
  stopOrbitSpin()
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
  stopOrbitSpin()
  applyOrbitDelta(dLat, dLon)
}

/** Release a coasting spin after a flick (degrees/second). */
export function flingOrbit(vLat: number, vLon: number) {
  if (state.traveling || state.seat >= LOCAL_AT) return
  const speed = Math.hypot(vLat, vLon)
  if (speed < FLING_MIN) {
    stopOrbitSpin()
    return
  }
  const scale = Math.min(1, FLING_MAX / speed)
  spinLat = vLat * scale
  spinLon = vLon * scale
}

export function stopOrbitSpin() {
  spinLat = 0
  spinLon = 0
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
  const dt =
    lastTick == null ? 0 : Math.min(0.05, Math.max(0, (now - lastTick) / 1000))
  lastTick = now

  if (
    dt > 0 &&
    !state.traveling &&
    state.seat < LOCAL_AT &&
    (Math.abs(spinLat) > SPIN_STOP || Math.abs(spinLon) > SPIN_STOP)
  ) {
    applyOrbitDelta(spinLat * dt, spinLon * dt)
    const decay = Math.exp(-SPIN_DECAY * dt)
    spinLat *= decay
    spinLon *= decay
    if (Math.hypot(spinLat, spinLon) < SPIN_STOP) stopOrbitSpin()
  }

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

/**
 * Rotate the look-point on the sphere without clamping at the poles.
 * Vertical drag pitches around local east; horizontal yaws around world up.
 * Near the poles, reuse the last good east so a continuous drag keeps going over.
 */
function applyOrbitDelta(dLat: number, dLon: number) {
  const pos = latLonToVector(state.lat, state.lon, 1)
  const worldUp = { x: 0, y: 1, z: 0 }
  let east = cross(worldUp, pos)
  if (lengthSq(east) < 1e-8) {
    east = projectPerp(lastEast, pos)
    if (lengthSq(east) < 1e-10) east = projectPerp({ x: 1, y: 0, z: 0 }, pos)
    if (lengthSq(east) < 1e-10) east = { x: 0, y: 0, z: 1 }
  }
  east = normalize(east)
  lastEast = east

  let next = rotateAround(pos, east, (dLat * Math.PI) / 180)
  next = rotateAround(next, worldUp, (dLon * Math.PI) / 180)
  const point = vectorToLatLon(next)
  state.lat = point.lat
  state.lon = point.lon
}

function projectPerp(
  v: { x: number; y: number; z: number },
  axis: { x: number; y: number; z: number },
) {
  const dot = v.x * axis.x + v.y * axis.y + v.z * axis.z
  return {
    x: v.x - axis.x * dot,
    y: v.y - axis.y * dot,
    z: v.z - axis.z * dot,
  }
}

function rotateAround(
  v: { x: number; y: number; z: number },
  axis: { x: number; y: number; z: number },
  angle: number,
) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const dot = v.x * axis.x + v.y * axis.y + v.z * axis.z
  return {
    x: v.x * c + (axis.y * v.z - axis.z * v.y) * s + axis.x * dot * (1 - c),
    y: v.y * c + (axis.z * v.x - axis.x * v.z) * s + axis.y * dot * (1 - c),
    z: v.z * c + (axis.x * v.y - axis.y * v.x) * s + axis.z * dot * (1 - c),
  }
}

function cross(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function lengthSq(v: { x: number; y: number; z: number }) {
  return v.x * v.x + v.y * v.y + v.z * v.z
}

function normalize(v: { x: number; y: number; z: number }) {
  const len = Math.sqrt(lengthSq(v)) || 1
  return { x: v.x / len, y: v.y / len, z: v.z / len }
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
