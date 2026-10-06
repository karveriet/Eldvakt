import type { LatLon } from './cell.ts'

/**
 * Used only when the browser will not share a location.
 * The fire still lights; it simply starts from this fixed point.
 */
export const FALLBACK_POINT: LatLon = { lat: 59.334, lon: 18.063 }

export function locate(): Promise<LatLon> {
  if (!navigator.geolocation) return Promise.resolve(FALLBACK_POINT)
  return new Promise((resolve) => {
    let settled = false
    const finish = (point: LatLon) => {
      if (settled) return
      settled = true
      resolve(point)
    }
    const timer = window.setTimeout(() => finish(FALLBACK_POINT), 6000)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer)
        finish({ lat: position.coords.latitude, lon: position.coords.longitude })
      },
      () => {
        window.clearTimeout(timer)
        finish(FALLBACK_POINT)
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
    )
  })
}
