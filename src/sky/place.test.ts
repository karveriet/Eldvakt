import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applySky, equatorial, gmstDegrees, skyRotation } from './place.ts'

const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0)
const POLARIS = { ra: 37.9529, dec: 89.2642 }
const VEGA = { ra: 279.2346, dec: 38.7836 }
const STOCKHOLM = { lat: 59.329, lon: 18.068 }

test('sidereal time at J2000 noon is the standard angle', () => {
  const gmst = gmstDegrees(J2000)
  assert.ok(Math.abs(gmst - 280.46061837) < 1e-6)
})

test('the pole stays north while the sky turns', () => {
  const pole = equatorial(0, 90)
  for (const hour of [0, 6, 15]) {
    const turned = applySky(skyRotation(0, 0, hour * 15, false), pole)
    assert.ok(turned.y > 0.999)
  }
})

test('a star stands on the Greenwich meridian when sidereal time matches its right ascension', () => {
  const there = applySky(skyRotation(0, 0, VEGA.ra, false), equatorial(VEGA.ra, VEGA.dec))
  assert.ok(there.x > 0.5)
  assert.ok(Math.abs(there.z) < 0.02)
})

test('beside a Stockholm fire the pole sits at the altitude of the latitude', () => {
  const local = applySky(
    skyRotation(STOCKHOLM.lat, STOCKHOLM.lon, 40, true),
    equatorial(POLARIS.ra, POLARIS.dec),
  )
  const altitude = (Math.asin(clamp(local.y, -1, 1)) * 180) / Math.PI
  assert.ok(Math.abs(altitude - STOCKHOLM.lat) < 1.2)
})

test('the southern sky keeps the pole below the horizon', () => {
  const local = applySky(skyRotation(-33.9, 151.2, 10, true), equatorial(0, 90))
  assert.ok(local.y < 0)
})

test('on the equator a culminating equatorial star is overhead', () => {
  const ra = 123.4
  const local = applySky(skyRotation(0, 0, ra, true), equatorial(ra, 0))
  assert.ok(local.y > 0.98)
})

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
