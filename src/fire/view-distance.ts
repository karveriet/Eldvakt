/**
 * Orbital camera distances. Far enough to see stars around the limb.
 * Sitting down leaves this range and finishes beside the fire.
 */
export const VIEW_FAR = 4.15
export const VIEW_ARRIVE = 2.88
export const VIEW_MIN = 2.72
export const VIEW_MAX = 4.6

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
