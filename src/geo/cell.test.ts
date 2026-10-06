import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { snapToCell } from './cell.ts'

describe('snapToCell', () => {
  it('is stable when applied twice', () => {
    const once = snapToCell(59.334591, 18.06324)
    const twice = snapToCell(once.lat, once.lon)
    assert.equal(twice.lat, once.lat)
    assert.equal(twice.lon, once.lon)
  })

  it('keeps the stored point within about 100 meters', () => {
    const raw = { lat: 59.3293, lon: 18.0686 }
    const snapped = snapToCell(raw.lat, raw.lon)
    const north = (snapped.lat - raw.lat) * 111_320
    const east =
      (snapped.lon - raw.lon) * 111_320 * Math.cos((raw.lat * Math.PI) / 180)
    assert.ok(Math.hypot(north, east) < 80)
  })

  it('keeps a point beside a cell center on that same cell', () => {
    const center = snapToCell(59.3293, 18.0686)
    const nearby = snapToCell(
      center.lat + 20 / 111_320,
      center.lon + 15 / (111_320 * Math.cos((center.lat * Math.PI) / 180)),
    )
    assert.equal(nearby.lat, center.lat)
    assert.equal(nearby.lon, center.lon)
  })

  it('separates points a few hundred meters apart', () => {
    const a = snapToCell(59.3293, 18.0686)
    const b = snapToCell(59.3293 + 350 / 111_320, 18.0686)
    assert.notEqual(a.lat, b.lat)
  })
})
