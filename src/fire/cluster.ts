import { distanceKm, centroid } from '../geo/sphere.ts'
import type { LatLon } from '../geo/cell.ts'
import { VIEW_ARRIVE, VIEW_FAR } from './view-distance.ts'

export type Cluster<T> = {
  items: T[]
  lat: number
  lon: number
  radiusKm: number
}

/**
 * Far apart on the camera means a wide tract shares one glow.
 * Up close, separate fires down to the storage cell can split.
 */
export function mergeDistanceKm(cameraDistance: number): number {
  const t = clamp((cameraDistance - VIEW_ARRIVE) / (VIEW_FAR - VIEW_ARRIVE), 0, 1)
  return 0.08 * Math.pow(2200 / 0.08, t)
}

export function distanceForMerge(targetKm: number): number {
  const ratio = 2200 / 0.08
  const t = clamp(Math.log(Math.max(targetKm, 0.08) / 0.08) / Math.log(ratio), 0, 1)
  return VIEW_ARRIVE + t * (VIEW_FAR - VIEW_ARRIVE)
}

export function clusterByDistance<T extends LatLon>(items: T[], mergeKm: number): Cluster<T>[] {
  const clusters: Cluster<T>[] = items.map((item) => ({
    items: [item],
    lat: item.lat,
    lon: item.lon,
    radiusKm: 0,
  }))
  if (mergeKm <= 0 || clusters.length < 2) return clusters

  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < clusters.length; i++) {
      let partner = -1
      for (let j = i + 1; j < clusters.length; j++) {
        if (distanceKm(clusters[i], clusters[j]) <= mergeKm) {
          partner = j
          break
        }
      }
      if (partner === -1) continue
      const items = clusters[i].items.concat(clusters[partner].items)
      const center = centroid(items)
      const radiusKm = items.reduce((max, item) => Math.max(max, distanceKm(center, item)), 0)
      clusters[i] = { items, lat: center.lat, lon: center.lon, radiusKm }
      clusters.splice(partner, 1)
      merged = true
      break
    }
  }
  return clusters
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
