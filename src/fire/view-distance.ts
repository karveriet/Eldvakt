/**
 * Orbital camera distances (Earth radius = 1).
 * Pinch runs from high night orbit down to a few meters up —
 * stylized land/water, no streets. Sitting still hands off to the
 * beside-fire journey when a fire is what you zoom onto.
 */
export const EARTH_RADIUS_M = 6_371_000
export const VIEW_FAR = 4.15
export const VIEW_ARRIVE = 2.88
/** A few meters above the surface — same ballpark as sitting by a fire. */
export const VIEW_GROUND_M = 3.1
export const VIEW_MIN = 1 + VIEW_GROUND_M / EARTH_RADIUS_M
export const VIEW_MAX = 4.6
/** Pinch past this onto a nearby fire hands off to the seat journey. */
export const VIEW_SIT_ZOOM = VIEW_ARRIVE
/**
 * Below this altitude (Earth radii), the scene origin rebases onto the
 * camera so meter-scale height stays precise in the GPU.
 */
export const VIEW_REBASE_ALT = 0.02

export function closeness(cameraDistance: number): number {
  return clamp((VIEW_FAR - cameraDistance) / (VIEW_FAR - VIEW_ARRIVE), 0, 1)
}

export function smootherstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

export function travelSeconds(
  from: { lat: number; lon: number; distance: number },
  to: { lat: number; lon: number; distance: number },
  arc: number,
): number {
  const zoom = Math.abs(Math.log(from.distance / to.distance))
  return clamp(3.6 + arc * 2.6 + zoom * 0.9, 3.6, 9)
}

/** Altitude above the unit sphere; never zero so near-plane math stays stable. */
export function altitudeAboveSurface(cameraDistance: number): number {
  return Math.max(VIEW_MIN - 1, cameraDistance - 1)
}

export function altitudeMeters(cameraDistance: number): number {
  return altitudeAboveSurface(cameraDistance) * EARTH_RADIUS_M
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
