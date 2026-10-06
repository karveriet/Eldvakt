/** Stable storage cell of about 100 meters, so a fire stays near the real place. */
const METERS = 100
const METERS_PER_DEGREE_LAT = 111_320

export type LatLon = { lat: number; lon: number }

export function normalizeLon(lon: number): number {
  const wrapped = (((lon + 180) % 360) + 360) % 360 - 180
  return wrapped === -180 ? 180 : wrapped
}

export function snapToCell(lat: number, lon: number): LatLon {
  const clampedLat = Math.max(-85, Math.min(85, lat))
  const latStep = METERS / METERS_PER_DEGREE_LAT
  const snappedLat = Math.round(clampedLat / latStep) * latStep
  const cos = Math.cos((snappedLat * Math.PI) / 180)
  const lonStep = METERS / (METERS_PER_DEGREE_LAT * Math.max(0.05, Math.abs(cos)))
  const snappedLon = Math.round(normalizeLon(lon) / lonStep) * lonStep
  return { lat: snappedLat, lon: normalizeLon(snappedLon) }
}
