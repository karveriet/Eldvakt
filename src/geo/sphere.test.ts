import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { latLonToVector, moveByArc, vectorToLatLon } from './sphere.ts'

describe('sphere mapping', () => {
  it('round-trips a city', () => {
    const back = vectorToLatLon(latLonToVector(59.33, 18.06, 1))
    assert.ok(Math.abs(back.lat - 59.33) < 1e-6)
    assert.ok(Math.abs(back.lon - 18.06) < 1e-6)
  })

  it('moves north when the bearing is north', () => {
    const next = moveByArc({ lat: 10, lon: 20 }, 0, 0.1)
    assert.ok(next.lat > 10)
    assert.ok(Math.abs(next.lon - 20) < 1e-6)
  })
})
