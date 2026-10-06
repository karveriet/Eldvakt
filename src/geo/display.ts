import type { LatLon } from './cell.ts'
import { VIEW_ARRIVE, VIEW_FAR, closeness } from '../fire/view-distance.ts'
import { metersFrom, moveByArc } from './sphere.ts'

/**
 * Display-only spread. Stored points stay on their cell.
 * Far away, positions are true and clustering paints one glow.
 * Up close, true bearings are kept and distances are compressed so
 * fires in one tract can be told apart on a planet that still reads as a globe.
 */
export function displayLatLon(
  fire: LatLon & { id?: string },
  look: LatLon,
  cameraDistance: number,
  fan: number,
): LatLon {
  const close = closeness(cameraDistance)
  if (close <= 0) return { lat: fire.lat, lon: fire.lon }
  const { north, east } = metersFrom(look, fire)
  const dist = Math.hypot(north, east)
  if (dist < 40) {
    if (fan === 0) return { lat: fire.lat, lon: fire.lon }
    return moveByArc(look, fan, 0.12 * close)
  }
  const local = 1 - smoothstep(600_000, 2_000_000, dist)
  if (local <= 0) return { lat: fire.lat, lon: fire.lon }
  const bearing = Math.atan2(east, north)
  const arc = Math.min(0.52, 0.14 * Math.log2(1 + dist / 100)) * close * local
  return moveByArc(look, bearing, arc)
}

/** Stable ring positions when several fires share one storage cell. */
export function assignFans(fires: readonly (LatLon & { id: string })[]): Map<string, number> {
  const groups = new Map<string, (LatLon & { id: string })[]>()
  for (const fire of fires) {
    const key = `${fire.lat.toFixed(4)}:${fire.lon.toFixed(4)}`
    const group = groups.get(key)
    if (group) group.push(fire)
    else groups.set(key, [fire])
  }
  const fans = new Map<string, number>()
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    if (ordered.length < 2) {
      fans.set(ordered[0].id, 0)
      continue
    }
    ordered.forEach((fire, index) => {
      fans.set(fire.id, (index / ordered.length) * Math.PI * 2)
    })
  }
  return fans
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export { VIEW_ARRIVE, VIEW_FAR }
