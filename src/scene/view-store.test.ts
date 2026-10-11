import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeLon } from '../geo/cell.ts'
import { VIEW_FAR } from '../fire/view-distance.ts'
import {
  flingOrbit,
  getView,
  nudge,
  stopOrbitSpin,
  tickView,
  travelTo,
} from './view-store.ts'

function hardLook(lat: number, lon: number) {
  stopOrbitSpin()
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
  it('crosses the old pole clamp instead of sticking near ±78°', () => {
    hardLook(20, 0)
    // Negative pitch moves the look north with the current orbit mapping.
    nudge(-70, 0)
    const after = getView()
    assert.ok(after.lat > 78)
    assert.ok(Math.abs(after.lat) <= 90)
  })

  it('keeps rotating over the pole instead of bouncing back', () => {
    hardLook(20, 0)
    nudge(-70, 0)
    nudge(-30, 0)
    const after = getView()
    assert.ok(after.lat < 80)
    // Crossing the north pole should land on the opposite meridian.
    assert.ok(Math.abs(normalizeLon(after.lon - 0)) > 90)
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
