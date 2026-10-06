import { smootherstep } from '../fire/view-distance.ts'
import { latLonToVector, type Vec3 } from './sphere.ts'

/**
 * Sitting leaves the orbital distances.
 * The last part of the move is on the ground, a few meters from the flame.
 */
export const LOCAL_AT = 0.36
export const LOW_ORBIT = 1.12
export const SIT_BACK_M = 3.1
export const SIT_EYE_M = 1.02
export const SIT_LOOK_M = 0.7
export const APPROACH_BACK_M = 12
export const APPROACH_EYE_M = 3.8

export function globeDistance(orbitDistance: number, seat: number): number {
  const u = smootherstep(Math.min(1, Math.max(0, seat) / LOCAL_AT))
  return orbitDistance + (LOW_ORBIT - orbitDistance) * u
}

export function intimateMeters(seat: number): { back: number; eye: number; local: boolean } {
  if (seat < LOCAL_AT) return { back: APPROACH_BACK_M, eye: APPROACH_EYE_M, local: false }
  const k = smootherstep((seat - LOCAL_AT) / (1 - LOCAL_AT))
  return {
    back: APPROACH_BACK_M + (SIT_BACK_M - APPROACH_BACK_M) * k,
    eye: APPROACH_EYE_M + (SIT_EYE_M - APPROACH_EYE_M) * k,
    local: true,
  }
}

/** Where the orbital camera sits while it is still descending toward the fire. */
export function orbitApproach(lat: number, lon: number, orbitDistance: number, seat: number): Vec3 {
  const dist = globeDistance(orbitDistance, seat)
  const u = Math.min(1, Math.max(0, seat) / LOCAL_AT)
  const radial = latLonToVector(lat, lon, 1)
  const north = northOf(radial)
  const shifted = normalize(add(radial, scale(north, -0.04 * u)))
  return scale(shifted, dist)
}

function northOf(up: Vec3): Vec3 {
  const pole = Math.abs(up.y) > 0.96 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const east = normalize(cross(pole, up))
  return normalize(cross(up, east))
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a.x, a.y, a.z) || 1
  return scale(a, 1 / length)
}
