import { latLonToVector, type Vec3 } from '../geo/sphere.ts'

/**
 * Greenwich mean sidereal time in degrees.
 * The common approximation at the given UTC instant.
 */
export function gmstDegrees(unixMs: number): number {
  const jd = unixMs / 86_400_000 + 2_440_587.5
  const turns = 280.46061837 + 360.98564736629 * (jd - 2_451_545.0)
  return normalizeDeg(turns)
}

/** J2000 equatorial direction, before the sky is turned for the time. */
export function equatorial(raDeg: number, decDeg: number): Vec3 {
  return latLonToVector(decDeg, raDeg, 1)
}

/**
 * Row-major 3×3.
 * Orbital view: equatorial directions in the Earth frame (+Y north, lon 0 on +X).
 * Beside a fire: the same sky in the local frame, zenith on +Y and north on −Z.
 */
export function skyRotation(
  lat: number,
  lon: number,
  gmstDeg: number,
  local: boolean,
): [number, number, number, number, number, number, number, number, number] {
  const turned = rotY(-gmstDeg)
  if (!local) return turned
  return mul(horizon(lat, lon), turned)
}

export function applySky(
  rotation: readonly number[],
  v: Vec3,
): Vec3 {
  return {
    x: rotation[0] * v.x + rotation[1] * v.y + rotation[2] * v.z,
    y: rotation[3] * v.x + rotation[4] * v.y + rotation[5] * v.z,
    z: rotation[6] * v.x + rotation[7] * v.y + rotation[8] * v.z,
  }
}

function horizon(lat: number, lon: number) {
  const zenith = latLonToVector(lat, lon, 1)
  const pole = Math.abs(zenith.y) > 0.96 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const east = norm(cross(pole, zenith))
  const north = norm(cross(zenith, east))
  return [
    east.x, east.y, east.z,
    zenith.x, zenith.y, zenith.z,
    -north.x, -north.y, -north.z,
  ] as [number, number, number, number, number, number, number, number, number]
}

function rotY(deg: number) {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, 0, s, 0, 1, 0, -s, 0, c] as [
    number, number, number, number, number, number, number, number, number,
  ]
}

function mul(
  a: readonly number[],
  b: readonly number[],
): [number, number, number, number, number, number, number, number, number] {
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0] as [
    number, number, number, number, number, number, number, number, number,
  ]
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out[row * 3 + col] =
        a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col]
    }
  }
  return out
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function norm(a: Vec3): Vec3 {
  const length = Math.hypot(a.x, a.y, a.z) || 1
  return { x: a.x / length, y: a.y / length, z: a.z / length }
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}
