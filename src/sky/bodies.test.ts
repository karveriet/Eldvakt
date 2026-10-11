import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applySky, gmstDegrees, skyRotation } from './place.ts'
import {
  bodyDirection,
  moonElongationDeg,
  moonEquatorial,
  sunEquatorial,
} from './bodies.ts'

const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0)
// Rough NOAA check: 2024-06-21 ~12:00 UTC, sun near solstice.
const SOLSTICE = Date.UTC(2024, 5, 21, 12, 0, 0)

test('the sun sits near the June solstice declination', () => {
  const sun = sunEquatorial(SOLSTICE)
  assert.ok(sun.dec > 22.5 && sun.dec < 24.5, `dec=${sun.dec}`)
})

test('the sun at J2000 noon is in Capricornus-ish RA', () => {
  // Meeus example neighbourhood: ~18.7h ≈ 280°.
  const sun = sunEquatorial(J2000)
  assert.ok(sun.ra > 270 && sun.ra < 290, `ra=${sun.ra}`)
  assert.ok(sun.dec > -25 && sun.dec < -21, `dec=${sun.dec}`)
})

test('the moon stays near the ecliptic', () => {
  for (const day of [0, 7, 14, 21]) {
    const t = Date.UTC(2024, 3, 1 + day, 0, 0, 0)
    const moon = moonEquatorial(t)
    assert.ok(Math.abs(moon.dec) < 30, `dec=${moon.dec}`)
  }
})

test('moon elongation swings between new and full over a month', () => {
  let min = 180
  let max = 0
  for (let day = 0; day < 30; day++) {
    const e = moonElongationDeg(Date.UTC(2024, 0, 1 + day, 12, 0, 0))
    min = Math.min(min, e)
    max = Math.max(max, e)
  }
  assert.ok(min < 40, `min elongation ${min}`)
  assert.ok(max > 140, `max elongation ${max}`)
})

test('beside a fire the sun can sit below the local horizon', () => {
  // Stockholm winter night — sun should be well below the horizon.
  const winterNight = Date.UTC(2024, 0, 15, 22, 0, 0)
  const sun = bodyDirection(sunEquatorial(winterNight))
  const local = applySky(
    skyRotation(59.33, 18.07, gmstDegrees(winterNight), true),
    sun,
  )
  assert.ok(local.y < -0.1, `altitude y=${local.y}`)
})
