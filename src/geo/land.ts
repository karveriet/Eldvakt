import { feature } from 'topojson-client'
import type { FeatureCollection, Geometry, Position } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'
import atlas from 'world-atlas/land-110m.json'

type LandTopology = Topology<{ land: GeometryCollection }>

const collection = feature(
  atlas as unknown as LandTopology,
  (atlas as unknown as LandTopology).objects.land,
) as unknown as FeatureCollection

export function landGeometries(): Geometry[] {
  return collection.features.map((item) => item.geometry)
}

export function pointInLand(lon: number, lat: number): boolean {
  return landGeometries().some((geometry) => geometryContains(geometry, lon, lat))
}

function geometryContains(geometry: Geometry, lon: number, lat: number): boolean {
  if (geometry.type === 'Polygon') return polygonContains(geometry.coordinates, lon, lat)
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => polygonContains(polygon, lon, lat))
  }
  return false
}

function polygonContains(rings: readonly Position[][], lon: number, lat: number): boolean {
  let inside = false
  for (const ring of rings) {
    if (ringContains(ring, lon, lat)) inside = !inside
  }
  return inside
}

function ringContains(ring: readonly Position[], lon: number, lat: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const crosses = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}
