import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeLon } from '../geo/cell.ts'
import { angularDistance } from '../geo/sphere.ts'
import {
  GLOBE_SPIN_DEG_PER_SEC,
  VIEW_FAR,
  VIEW_MAX,
  VIEW_MIN,
  VIEW_WHOLE,
} from '../fire/view-distance.ts'
import {
  beginOrbitGrab,
  flingOrbit,
  flingTwist,
  getView,
  nudge,
  releaseOrbitGrab,
  resetOrbitFrame,
  tickView,
  travelTo,
  twistOrbit,
  zoomBy,
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
  it('moves north for positive pitch (finger dragging down on the globe)', () => {
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
    // Flick coast is done; only the idle whole-globe spin still walks longitude.
    const dLon = Math.abs(normalizeLon(getView().lon - settledLon))
    assert.ok(Math.abs(dLon - GLOBE_SPIN_DEG_PER_SEC * 0.016) < 1e-6)
  })

  it('does not reverse a northward fling when crossing the pole', () => {
    hardLook(60, 0)
    // Strong northward flick; fixed spin axis must keep crossing southward after the pole.
    flingOrbit(900, 0)
    const t0 = 3_000_000
    tickView(t0)
    const samples: { lat: number; lon: number }[] = []
    for (let i = 1; i <= 80; i++) {
      tickView(t0 + i * 16)
      samples.push({ lat: getView().lat, lon: getView().lon })
    }
    // Find the step nearest the north pole, then the look point should continue
    // onto the opposite hemisphere (lon ~±180) rather than bounce back.
    let peak = 0
    for (let i = 1; i < samples.length; i++) {
      if (samples[i]!.lat > samples[peak]!.lat) peak = i
    }
    assert.ok(samples[peak]!.lat > 80, `peak lat ${samples[peak]!.lat}`)
    const after = samples[Math.min(samples.length - 1, peak + 12)]!
    assert.ok(after.lat < samples[peak]!.lat)
    assert.ok(Math.abs(normalizeLon(after.lon - 0)) > 90)
  })

  it('keeps a continuous camera-up while coasting over the pole', () => {
    hardLook(55, 20)
    flingOrbit(1000, 40)
    const t0 = 4_000_000
    tickView(t0)
    const ups: { x: number; y: number; z: number }[] = []
    for (let i = 1; i <= 100; i++) {
      tickView(t0 + i * 16)
      const up = getView().orbitUp
      assert.ok(up, 'orbitUp should stay set during coast')
      ups.push(up!)
    }
    // Neighboring ups must not flip ~180° (that was the jarring reverse).
    for (let i = 1; i < ups.length; i++) {
      const a = ups[i - 1]!
      const b = ups[i]!
      const d = a.x * b.x + a.y * b.y + a.z * b.z
      assert.ok(d > 0.2, `camera-up flip at step ${i}: dot=${d}`)
    }
  })

  it('keeps the same drag sense in the southern hemisphere', () => {
    hardLook(-40, 30)
    const before = getView()
    nudge(6, 0)
    assert.ok(getView().lat > before.lat, 'up-drag still moves north from the south')
    hardLook(-40, 30)
    const lon0 = getView().lon
    nudge(0, 8)
    // Positive yaw matches Look's -dx mapping used at fling time; just ensure motion.
    assert.ok(Math.abs(normalizeLon(getView().lon - lon0)) > 0.5)
  })

  it('does not snap look or camera-up when grabbing mid-coast', () => {
    hardLook(25, 10)
    flingOrbit(800, 200)
    const t0 = 5_000_000
    tickView(t0)
    for (let i = 1; i <= 30; i++) tickView(t0 + i * 16)
    const before = getView()
    assert.ok(before.orbitUp)
    beginOrbitGrab()
    const after = getView()
    assert.ok(Math.abs(after.lat - before.lat) < 1e-9)
    assert.ok(Math.abs(normalizeLon(after.lon - before.lon)) < 1e-9)
    assert.ok(after.orbitUp)
    const d =
      before.orbitUp!.x * after.orbitUp!.x +
      before.orbitUp!.y * after.orbitUp!.y +
      before.orbitUp!.z * after.orbitUp!.z
    assert.ok(d > 0.98, `camera-up snapped on grab: dot=${d}`)
  })

  it('twists camera-up without moving the look point', () => {
    hardLook(15, -40)
    // Tiny nudge builds the world-north grab frame so we can compare ups.
    nudge(0.01, 0)
    const before = getView()
    assert.ok(before.orbitUp)
    twistOrbit(35)
    const after = getView()
    assert.ok(Math.abs(after.lat - before.lat) < 1e-6)
    assert.ok(Math.abs(normalizeLon(after.lon - before.lon)) < 1e-6)
    assert.ok(after.orbitUp)
    const d =
      before.orbitUp!.x * after.orbitUp!.x +
      before.orbitUp!.y * after.orbitUp!.y +
      before.orbitUp!.z * after.orbitUp!.z
    assert.ok(d < 0.92, `camera-up barely moved: dot=${d}`)
    assert.ok(d > 0.7, `camera-up jumped too far for 35°: dot=${d}`)
  })

  it('keeps look fixed after a full twist turn', () => {
    hardLook(5, 80)
    nudge(0.01, 0)
    const before = getView()
    assert.ok(before.orbitUp)
    for (let i = 0; i < 12; i++) twistOrbit(30)
    const after = getView()
    assert.ok(Math.abs(after.lat - before.lat) < 1e-6)
    assert.ok(Math.abs(normalizeLon(after.lon - before.lon)) < 1e-6)
    assert.ok(after.orbitUp)
    const d =
      before.orbitUp!.x * after.orbitUp!.x +
      before.orbitUp!.y * after.orbitUp!.y +
      before.orbitUp!.z * after.orbitUp!.z
    assert.ok(d > 0.98, `full turn should restore camera-up: dot=${d}`)
  })

  it('turns the whole globe west-to-east once per minute when idle', () => {
    hardLook(20, 40)
    assert.ok(getView().distance >= VIEW_WHOLE)
    assert.equal(GLOBE_SPIN_DEG_PER_SEC, 6)
    const t0 = 8_000_000
    tickView(t0)
    const startLon = getView().lon
    const seconds = 10
    for (let i = 1; i <= seconds * 20; i++) tickView(t0 + i * 50)
    const turned = normalizeLon(startLon - getView().lon)
    const expect = GLOBE_SPIN_DEG_PER_SEC * seconds
    assert.ok(Math.abs(turned - expect) < 0.05, `turned ${turned}, expect ${expect}`)
  })

  it('holds the surface still near the ground and while a grab is held', () => {
    hardLook(10, 0)
    travelTo(10, 0, 1.2, null, 0)
    const t0 = 9_000_000
    tickView(t0)
    tickView(t0 + 60_000)
    const lowLon = getView().lon
    for (let i = 1; i <= 400; i++) tickView(t0 + 60_000 + i * 50)
    assert.ok(Math.abs(normalizeLon(getView().lon - lowLon)) < 1e-9)

    hardLook(15, 25)
    beginOrbitGrab()
    const heldLon = getView().lon
    const t1 = 10_000_000
    tickView(t1)
    for (let i = 1; i <= 400; i++) tickView(t1 + i * 50)
    assert.ok(Math.abs(normalizeLon(getView().lon - heldLon)) < 1e-9)
    releaseOrbitGrab()
  })

  it('pinches altitude continuously down to a few meters', () => {
    hardLook(20, 10)
    assert.ok(getView().distance > 3)
    for (let i = 0; i < 120; i++) zoomBy(0.85)
    const low = getView().distance
    assert.ok(low <= VIEW_MIN + 1e-12, `distance ${low}`)
    assert.ok(low >= VIEW_MIN - 1e-12)
    const altM = (low - 1) * 6_371_000
    assert.ok(altM < 5, `altitude ${altM}m should be a few meters`)
    assert.ok(altM > 1, `altitude ${altM}m should stay above the crust`)
    // Near the surface, altitude scaling still moves smoothly before the floor.
    hardLook(20, 10)
    travelTo(20, 10, 1.02, null, 0)
    const t0 = 7_000_000
    tickView(t0)
    tickView(t0 + 60_000)
    const before = getView().distance
    zoomBy(0.5)
    const after = getView().distance
    assert.ok(after < before)
    assert.ok(after > 1)
    zoomBy(2)
    assert.ok(getView().distance <= VIEW_MAX + 1e-9)
  })

  it('coasts a twist release then settles without moving the look point', () => {
    hardLook(12, -25)
    nudge(0.01, 0)
    const start = getView()
    assert.ok(start.orbitUp)
    flingTwist(500)
    const t0 = 6_000_000
    tickView(t0)
    tickView(t0 + 32)
    const mid = getView()
    assert.ok(Math.abs(mid.lat - start.lat) < 1e-9)
    assert.ok(Math.abs(normalizeLon(mid.lon - start.lon)) < 1e-9)
    assert.ok(mid.orbitUp)
    const midDot =
      start.orbitUp!.x * mid.orbitUp!.x +
      start.orbitUp!.y * mid.orbitUp!.y +
      start.orbitUp!.z * mid.orbitUp!.z
    assert.ok(midDot < 0.999, `twist coast did not roll: dot=${midDot}`)

    for (let i = 1; i <= 240; i++) tickView(t0 + 32 + i * 16)
    const settled = getView()
    assert.ok(Math.abs(settled.lat - start.lat) < 1e-9)
    // Twist friction is done; idle globe spin may still walk longitude / frame.
    const settledLon = settled.lon
    tickView(t0 + 32 + 241 * 16)
    assert.ok(Math.abs(getView().lat - start.lat) < 1e-9)
    const dLon = Math.abs(normalizeLon(getView().lon - settledLon))
    assert.ok(Math.abs(dLon - GLOBE_SPIN_DEG_PER_SEC * 0.016) < 1e-6)
  })
})
