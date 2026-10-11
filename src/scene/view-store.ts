import { normalizeLon } from '../geo/cell.ts'
import { angularDistance, latLonToVector, slerpLatLon, vectorToLatLon } from '../geo/sphere.ts'
import { LOCAL_AT } from '../geo/seat.ts'
import {
  GLOBE_SPIN_DEG_PER_SEC,
  smootherstep,
  travelSeconds,
  VIEW_ARRIVE,
  VIEW_FAR,
  VIEW_MAX,
  VIEW_MIN,
  VIEW_SIT_ZOOM,
  VIEW_WHOLE,
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

/** Coasting spin: fixed world axis + speed (deg/s). Frozen at fling so poles cannot reverse it. */
let spinAxis: { x: number; y: number; z: number } | null = null
let spinSpeed = 0
/** Authoritative look direction while coasting (avoids lat/lon pole jitter). */
let spinPos: { x: number; y: number; z: number } | null = null
/** Signed roll coast around the look radial (deg/s). Same friction idea as flick. */
let twistSpeed = 0
let lastTick: number | null = null
/** Parallel-transported screen-right; never re-derived from world-up mid-gesture. */
let lastRight = { x: 0, y: 0, z: 1 }
let haveRight = false
/**
 * Camera-up that travels with the grab/coast frame. When set, the rig must not
 * re-snap to world-north — that snap is what makes a pole-crossing flick reverse.
 */
let orbitUp: { x: number; y: number; z: number } | null = null
/** True while a finger is down on the orbit view — idle globe spin waits. */
let orbitHeld = false

/** Exponential friction; higher = stops sooner. */
const SPIN_DECAY = 1.85
const SPIN_STOP = 0.35
/** Ignore tiny release speeds so a slow lift does not coast. */
const FLING_MIN = 70
/** Cap so a hard flick can spin hard without going infinite. */
const FLING_MAX = 1200
const WORLD_UP = { x: 0, y: 1, z: 0 }

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
    /** Stable camera-up during a grab/coast; null → fall back to world north. */
    orbitUp,
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
  orbitHeld = false
  haveRight = false
  orbitUp = null
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
export function flingOrbit(vPitch: number, vYaw: number) {
  if (state.traveling || state.seat >= LOCAL_AT) return
  const speed = Math.hypot(vPitch, vYaw)
  if (speed < FLING_MIN) {
    stopOrbitSpin()
    return
  }
  const scale = Math.min(1, FLING_MAX / speed)
  const vp = vPitch * scale
  const vy = vYaw * scale
  const pos = latLonToVector(state.lat, state.lon, 1)
  const { right, up } = orbitFrame(pos)
  // Same grab map as applyOrbitDelta: lookVel = north*vp + west*(-vy) via -right.
  const lookVel = {
    x: up.x * vp - right.x * vy,
    y: up.y * vp - right.y * vy,
    z: up.z * vp - right.z * vy,
  }
  const axis = cross(pos, lookVel)
  if (lengthSq(axis) < 1e-12) {
    stopOrbitSpin()
    return
  }
  spinAxis = normalize(axis)
  spinSpeed = Math.hypot(lookVel.x, lookVel.y, lookVel.z)
  spinPos = { ...pos }
  haveRight = true
  lastRight = right
  orbitUp = { ...up }
}

export function stopOrbitSpin() {
  spinAxis = null
  spinSpeed = 0
  spinPos = null
  twistSpeed = 0
}

/** Full reset (tests / travel). Clears the camera frame too. */
export function resetOrbitFrame() {
  haveRight = false
  lastRight = { x: 0, y: 0, z: 1 }
  orbitUp = null
  orbitHeld = false
  stopOrbitSpin()
}

/**
 * Start a grab without snapping the view. Stops coasting and aligns the
 * control frame to the current camera-up so the globe does not jump.
 */
export function beginOrbitGrab() {
  stopOrbitSpin()
  orbitHeld = true
  const pos = latLonToVector(state.lat, state.lon, 1)
  if (!orbitUp) {
    haveRight = false
    lastRight = { x: 0, y: 0, z: 1 }
    return
  }
  // up = pos × right  ⇒  right = up × pos
  let right = cross(orbitUp, pos)
  if (lengthSq(right) < 1e-10) {
    right = cross(WORLD_UP, pos)
  }
  if (lengthSq(right) < 1e-10) right = { x: 1, y: 0, z: 0 }
  lastRight = normalize(right)
  orbitUp = normalize(cross(pos, lastRight))
  haveRight = true
}

/** Finger lifted — idle globe spin may resume once coasting also settles. */
export function releaseOrbitGrab() {
  orbitHeld = false
}

export function setGaze(yaw: number, pitch: number) {
  if (state.traveling || state.seat < LOCAL_AT) return
  state.yaw = clamp(yaw, -110, 110)
  state.pitch = clamp(pitch, -24, 42)
}

export function zoomBy(factor: number) {
  if (state.traveling || state.seat > 0.02) return
  if (!Number.isFinite(factor) || factor <= 0) return
  // Pinch onto a focused fire: last stretch is the existing seat journey.
  if (factor < 1 && state.focusId && state.distance <= VIEW_SIT_ZOOM + 0.08) {
    settleBy(state.lat, state.lon, state.focusId)
    return
  }
  // Scale altitude, not radius — near the surface radius≈1 so radius*=factor jumps.
  const altMin = VIEW_MIN - 1
  const altMax = VIEW_MAX - 1
  const alt = Math.max(altMin, state.distance - 1)
  state.distance = 1 + clamp(alt * factor, altMin, altMax)
  publish()
}

/**
 * Two-finger twist: roll the camera frame around the look radial.
 * Positive degrees match a clockwise finger twist on screen (y-down).
 */
export function twistOrbit(degrees: number) {
  if (state.traveling || state.seat >= LOCAL_AT) return
  if (!Number.isFinite(degrees) || Math.abs(degrees) < 1e-6) return
  stopOrbitSpin()
  applyTwistDegrees(degrees)
}

/** Release a coasting roll after a two-finger twist (degrees/second, signed). */
export function flingTwist(degPerSec: number) {
  if (state.traveling || state.seat >= LOCAL_AT) return
  if (!Number.isFinite(degPerSec)) {
    twistSpeed = 0
    return
  }
  const speed = Math.abs(degPerSec)
  if (speed < FLING_MIN) {
    twistSpeed = 0
    return
  }
  // Stop look-point coast; keep the roll going around the current radial.
  spinAxis = null
  spinSpeed = 0
  spinPos = null
  const scale = Math.min(1, FLING_MAX / speed)
  twistSpeed = degPerSec * scale
  const pos = latLonToVector(state.lat, state.lon, 1)
  const { right, up } = orbitFrame(pos)
  lastRight = right
  orbitUp = up
  haveRight = true
}

function applyTwistDegrees(degrees: number) {
  const pos = latLonToVector(state.lat, state.lon, 1)
  const { right } = orbitFrame(pos)
  const angle = (degrees * Math.PI) / 180
  // +pos points toward the camera; positive rotation around it is clockwise
  // when looking at the globe from outside — same sense as the finger twist.
  lastRight = normalize(projectPerp(rotateAround(right, pos, angle), pos))
  haveRight = true
  orbitUp = normalize(cross(pos, lastRight))
}

export function tickView(now: number) {
  const dt =
    lastTick == null ? 0 : Math.min(0.05, Math.max(0, (now - lastTick) / 1000))
  lastTick = now

  if (
    dt > 0 &&
    !state.traveling &&
    state.seat < LOCAL_AT &&
    Math.abs(twistSpeed) > SPIN_STOP
  ) {
    applyTwistDegrees(twistSpeed * dt)
    twistSpeed *= Math.exp(-SPIN_DECAY * dt)
    if (Math.abs(twistSpeed) < SPIN_STOP) twistSpeed = 0
  }

  if (
    dt > 0 &&
    !state.traveling &&
    state.seat < LOCAL_AT &&
    spinAxis &&
    spinPos &&
    spinSpeed > SPIN_STOP
  ) {
    const angle = (spinSpeed * dt * Math.PI) / 180
    const prevUp = orbitUp ?? cross(spinPos, lastRight)
    const next = normalize(rotateAround(spinPos, spinAxis, angle))
    // Rigidly rotate the grab frame with the look point — no world-north rebuild.
    const wantUp = projectPerp(rotateAround(prevUp, spinAxis, angle), next)
    let right = normalize(projectPerp(rotateAround(lastRight, spinAxis, angle), next))
    if (lengthSq(right) < 1e-10) right = normalize(cross(wantUp, next))
    let camUp = normalize(cross(next, right))
    if (lengthSq(wantUp) > 1e-10 && dot(camUp, wantUp) < 0) {
      camUp = { x: -camUp.x, y: -camUp.y, z: -camUp.z }
      right = { x: -right.x, y: -right.y, z: -right.z }
    }
    lastRight = right
    orbitUp = camUp
    spinPos = next
    haveRight = true
    const point = vectorToLatLon(next)
    state.lat = point.lat
    state.lon = point.lon
    spinSpeed *= Math.exp(-SPIN_DECAY * dt)
    if (spinSpeed < SPIN_STOP) stopOrbitSpin()
  }

  // Whole-globe idle: visible west→east spin (1 rev / 2 min). Sky stays on real time.
  if (dt > 0 && canGlobeSpin()) {
    applyGlobeSpin(GLOBE_SPIN_DEG_PER_SEC * dt)
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

function canGlobeSpin() {
  if (state.traveling || orbitHeld) return false
  if (state.seat > 0.02) return false
  if (state.distance < VIEW_WHOLE) return false
  if (spinAxis && spinSpeed > SPIN_STOP) return false
  if (Math.abs(twistSpeed) > SPIN_STOP) return false
  return true
}

/**
 * Walk the look point westward so the fixed Earth mesh appears to rotate
 * west→east (counterclockwise from above the north pole). The sky keeps
 * real GMST — it does not spin with this boosted display rate.
 */
function applyGlobeSpin(degrees: number) {
  if (!Number.isFinite(degrees) || Math.abs(degrees) < 1e-12) return
  state.lon = normalizeLon(state.lon - degrees)
  if (!orbitUp && !haveRight) return
  const angle = (-degrees * Math.PI) / 180
  if (haveRight) {
    lastRight = normalize(projectPerp(rotateAround(lastRight, WORLD_UP, angle), latLonToVector(state.lat, state.lon, 1)))
  }
  if (orbitUp) {
    const pos = latLonToVector(state.lat, state.lon, 1)
    orbitUp = normalize(projectPerp(rotateAround(orbitUp, WORLD_UP, angle), pos))
    if (lengthSq(orbitUp) < 1e-10) orbitUp = null
  }
}

export function arriveDistance() {
  return VIEW_ARRIVE
}

/**
 * Grab-style arcball: the look point follows the finger on the view plane.
 * Positive dPitch → look north (north pole walks down when dragging down).
 * Positive dYaw → look west (surface follows a rightward finger).
 * The right-axis is parallel-transported so poles do not flip the gesture.
 */
function applyOrbitDelta(dPitch: number, dYaw: number) {
  const pos = latLonToVector(state.lat, state.lon, 1)
  const { right, up } = orbitFrame(pos)
  const lookDelta = {
    x: up.x * dPitch - right.x * dYaw,
    y: up.y * dPitch - right.y * dYaw,
    z: up.z * dPitch - right.z * dYaw,
  }
  const mag = Math.hypot(lookDelta.x, lookDelta.y, lookDelta.z)
  if (mag < 1e-8) return
  let axis = cross(pos, lookDelta)
  if (lengthSq(axis) < 1e-12) return
  axis = normalize(axis)
  const angle = (mag * Math.PI) / 180
  const next = normalize(rotateAround(pos, axis, angle))
  lastRight = normalize(projectPerp(rotateAround(right, axis, angle), next))
  haveRight = true
  orbitUp = normalize(cross(next, lastRight))
  if (lengthSq(orbitUp) < 1e-10) orbitUp = { ...up }

  const point = vectorToLatLon(next)
  state.lat = point.lat
  state.lon = point.lon
}

/** Screen-right / screen-up on the sphere; transports lastRight when possible. */
function orbitFrame(pos: { x: number; y: number; z: number }) {
  let right: { x: number; y: number; z: number }
  if (haveRight) {
    right = projectPerp(lastRight, pos)
    if (lengthSq(right) < 1e-8) {
      const helper = Math.abs(dot(pos, WORLD_UP)) > 0.72 ? { x: 1, y: 0, z: 0 } : WORLD_UP
      right = cross(helper, pos)
    }
    if (lengthSq(right) < 1e-10) right = { x: 0, y: 0, z: 1 }
    right = normalize(right)
  } else {
    // Fresh grab: align with the camera's north-up view.
    right = cross(WORLD_UP, pos)
    if (lengthSq(right) < 1e-8) right = { x: 1, y: 0, z: 0 }
    right = normalize(projectPerp(right, pos))
    const upGuess = cross(pos, right)
    if (dot(upGuess, WORLD_UP) < 0) {
      right = { x: -right.x, y: -right.y, z: -right.z }
    }
  }
  const up = normalize(cross(pos, right))
  return { right, up }
}

function dot(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) {
  return a.x * b.x + a.y * b.y + a.z * b.z
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
