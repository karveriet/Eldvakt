import type { Vec3 } from '../geo/sphere.ts'
import { equatorial } from './place.ts'

export type Equatorial = { ra: number; dec: number }

/**
 * Low-precision sun and moon in the same J2000-ish equatorial frame
 * the star catalog uses (good to a fraction of a degree).
 */

export function sunEquatorial(unixMs: number): Equatorial {
  const { lambda, eps } = sunEcliptic(unixMs)
  return eclipticToEquatorial(lambda, 0, eps)
}

export function moonEquatorial(unixMs: number): Equatorial {
  const { lambda, beta, eps } = moonEcliptic(unixMs)
  return eclipticToEquatorial(lambda, beta, eps)
}

/** Unit direction before skyRotation is applied. */
export function bodyDirection(body: Equatorial): Vec3 {
  return equatorial(body.ra, body.dec)
}

/** Elongation sun→moon in degrees (0 = new, 180 = full). */
export function moonElongationDeg(unixMs: number): number {
  const sun = bodyDirection(sunEquatorial(unixMs))
  const moon = bodyDirection(moonEquatorial(unixMs))
  const cos = clamp(sun.x * moon.x + sun.y * moon.y + sun.z * moon.z, -1, 1)
  return (Math.acos(cos) * 180) / Math.PI
}

function sunEcliptic(unixMs: number) {
  const n = julianDay(unixMs) - 2_451_545.0
  const L = normalizeDeg(280.46 + 0.9856474 * n)
  const g = toRad(normalizeDeg(357.528 + 0.9856003 * n))
  const lambda = normalizeDeg(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g))
  const eps = 23.439 - 0.00000036 * n
  return { lambda, eps }
}

/** Compact truncated lunar theory (mean elements + a few periodic terms). */
function moonEcliptic(unixMs: number) {
  const { eps } = sunEcliptic(unixMs)
  const n = julianDay(unixMs) - 2_451_545.0
  const Lp = normalizeDeg(218.316 + 13.176396 * n)
  const D = normalizeDeg(297.85 + 12.190749 * n)
  const M = normalizeDeg(357.529 + 0.9856003 * n)
  const Mp = normalizeDeg(134.963 + 13.064993 * n)
  const F = normalizeDeg(93.272 + 13.22935 * n)

  const d = toRad(D)
  const m = toRad(M)
  const mp = toRad(Mp)
  const f = toRad(F)

  const lambda = normalizeDeg(
    Lp +
      6.289 * Math.sin(mp) +
      1.274 * Math.sin(2 * d - mp) +
      0.658 * Math.sin(2 * d) +
      0.214 * Math.sin(2 * mp) -
      0.186 * Math.sin(m) -
      0.114 * Math.sin(2 * f),
  )
  const beta =
    5.128 * Math.sin(f) +
    0.281 * Math.sin(mp + f) +
    0.278 * Math.sin(mp - f) +
    0.173 * Math.sin(2 * d - f)
  return { lambda, beta, eps }
}

function eclipticToEquatorial(lambdaDeg: number, betaDeg: number, epsDeg: number): Equatorial {
  const lambda = toRad(lambdaDeg)
  const beta = toRad(betaDeg)
  const eps = toRad(epsDeg)
  const cosBeta = Math.cos(beta)
  const sinBeta = Math.sin(beta)
  const sinLambda = Math.sin(lambda)
  const cosLambda = Math.cos(lambda)
  const sinEps = Math.sin(eps)
  const cosEps = Math.cos(eps)

  const ra = Math.atan2(sinLambda * cosEps - Math.tan(beta) * sinEps, cosLambda)
  const dec = Math.asin(clamp(sinBeta * cosEps + cosBeta * sinEps * sinLambda, -1, 1))
  return {
    ra: normalizeDeg((ra * 180) / Math.PI),
    dec: (dec * 180) / Math.PI,
  }
}

function julianDay(unixMs: number): number {
  return unixMs / 86_400_000 + 2_440_587.5
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
