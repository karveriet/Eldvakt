import { normalizeLon, type LatLon } from './cell.ts'

export type Vec3 = { x: number; y: number; z: number }

const EARTH_KM = 6371

/** Matches Three.js SphereGeometry: +Y is north, lon -180 sits on -X. */
export function latLonToVector(lat: number, lon: number, radius: number): Vec3 {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lon + 180) * Math.PI) / 180
  const sinPhi = Math.sin(phi)
  return {
    x: -radius * sinPhi * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * sinPhi * Math.sin(theta),
  }
}

export function vectorToLatLon(v: Vec3): LatLon {
  const radius = Math.hypot(v.x, v.y, v.z) || 1
  const lat = 90 - (Math.acos(clamp(v.y / radius, -1, 1)) * 180) / Math.PI
  const lon = (Math.atan2(v.z, -v.x) * 180) / Math.PI - 180
  return { lat, lon: normalizeLon(lon) }
}

export function distanceKm(a: LatLon, b: LatLon): number {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLat = lat2 - lat1
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function angularDistance(a: LatLon, b: LatLon): number {
  const va = latLonToVector(a.lat, a.lon, 1)
  const vb = latLonToVector(b.lat, b.lon, 1)
  const dot = clamp(va.x * vb.x + va.y * vb.y + va.z * vb.z, -1, 1)
  return Math.acos(dot)
}

export function slerpLatLon(a: LatLon, b: LatLon, t: number): LatLon {
  const va = latLonToVector(a.lat, a.lon, 1)
  const vb = latLonToVector(b.lat, b.lon, 1)
  const dot = clamp(va.x * vb.x + va.y * vb.y + va.z * vb.z, -1, 1)
  const omega = Math.acos(dot)
  if (omega < 1e-5) return { lat: a.lat, lon: a.lon }
  const s = Math.sin(omega)
  const w1 = Math.sin((1 - t) * omega) / s
  const w2 = Math.sin(t * omega) / s
  return vectorToLatLon({
    x: va.x * w1 + vb.x * w2,
    y: va.y * w1 + vb.y * w2,
    z: va.z * w1 + vb.z * w2,
  })
}

/** Meters north/east of origin. Fine for local offsets, not ocean crossings. */
export function metersFrom(origin: LatLon, point: LatLon): { north: number; east: number } {
  const north = (point.lat - origin.lat) * 111_320
  const east =
    normalizeLon(point.lon - origin.lon) *
    111_320 *
    Math.cos((origin.lat * Math.PI) / 180)
  return { north, east }
}

/** Bearing 0 is north, clockwise. arcRad is an angle at the earth's center. */
export function moveByArc(origin: LatLon, bearingRad: number, arcRad: number): LatLon {
  const lat1 = (origin.lat * Math.PI) / 180
  const lon1 = (origin.lon * Math.PI) / 180
  const lat2 = Math.asin(
    clamp(
      Math.sin(lat1) * Math.cos(arcRad) + Math.cos(lat1) * Math.sin(arcRad) * Math.cos(bearingRad),
      -1,
      1,
    ),
  )
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(arcRad) * Math.cos(lat1),
      Math.cos(arcRad) - Math.sin(lat1) * Math.sin(lat2),
    )
  return { lat: (lat2 * 180) / Math.PI, lon: normalizeLon((lon2 * 180) / Math.PI) }
}

export function centroid(points: readonly LatLon[]): LatLon {
  if (points.length === 0) return { lat: 0, lon: 0 }
  let x = 0
  let y = 0
  let z = 0
  for (const point of points) {
    const v = latLonToVector(point.lat, point.lon, 1)
    x += v.x
    y += v.y
    z += v.z
  }
  return vectorToLatLon({ x, y, z })
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
