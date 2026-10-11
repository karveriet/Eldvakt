import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeLon } from '../geo/cell.ts'
import { angularDistance } from '../geo/sphere.ts'
import { VIEW_FAR } from '../fire/view-distance.ts'
import {
  flingOrbit,
  getView,
  nudge,
  resetOrbitFrame,
  tickView,
  travelTo,
} from './view-store.ts'

function hardLook(lat: number, lon: number) {
  resetOrbitFrame()
  travelTo(lat, lon, VIEW_FAR, null, 0)
  const t0 = performance.now()
  tickView(t0)
  tickView(t0 + 60_000)
  const view = getView()
  assert.equal(view.traveling, false)
  assert.ok(Math.abs(view.lat - lat) < 1e-6)
  assert.ok(Math.abs(normalizeLon(view.lon - lon)) < 1e-6)
}

describe('orbit view', () => {
  it('moves north for positive pitch (drag up)', () => {
    hardLook(20, 0)
    nudge(8, 0)
    assert.ok(getView().lat > 20)
  })

  it('crosses the old pole clamp instead of sticking near ±78°', () => {
    hardLook(20, 0)
    nudge(70, 0)
    const after = getView()
    assert.ok(after.lat > 78)
    assert.ok(Math.abs(after.lat) <= 90)
  })

  it('keeps rotating over the pole instead of bouncing back', () => {
    hardLook(20, 0)
    nudge(70, 0)
    nudge(30, 0)
    const after = getView()
    assert.ok(after.lat < 80)
    // Crossing the north pole should land on the opposite meridian.
    assert.ok(Math.abs(normalizeLon(after.lon - 0)) > 90)
  })

  it('stays continuous across many small steps over the pole', () => {
    hardLook(75, 10)
    let prev = { lat: getView().lat, lon: getView().lon }
    for (let i = 0; i < 40; i++) {
      nudge(2, 0.4)
      const next = { lat: getView().lat, lon: getView().lon }
      // Lon can leap near a pole; the look direction must still move a small step.
      const arc = angularDistance(prev, next)
      assert.ok(arc < 0.12, `arc ${arc} at step ${i}`)
      prev = next
    }
    assert.ok(Math.abs(getView().lat) < 90)
  })

  it('coasts after a fling and then settles', () => {
    hardLook(10, 40)
    const start = getView()
    flingOrbit(400, 120)
    const t0 = 2_000_000
    tickView(t0)
    tickView(t0 + 32)
    const mid = getView()
    assert.ok(
      Math.abs(mid.lat - start.lat) > 0.05 ||
        Math.abs(normalizeLon(mid.lon - start.lon)) > 0.05,
    )

    for (let i = 1; i <= 240; i++) tickView(t0 + 32 + i * 16)
    const settledLat = getView().lat
    const settledLon = getView().lon
    tickView(t0 + 32 + 241 * 16)
    assert.ok(Math.abs(getView().lat - settledLat) < 1e-6)
    assert.ok(Math.abs(normalizeLon(getView().lon - settledLon)) < 1e-6)
  })
})
