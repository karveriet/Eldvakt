import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { displayLatLon } from './display.ts'
import { VIEW_ARRIVE, VIEW_FAR } from '../fire/view-distance.ts'
import { metersFrom } from './sphere.ts'

const look = { lat: 59.33, lon: 18.06 }

describe('display spread', () => {
  it('keeps true positions when the camera is far', () => {
    const fire = { lat: 59.4, lon: 18.2 }
    const shown = displayLatLon(fire, look, VIEW_FAR, 0)
    assert.equal(shown.lat, fire.lat)
    assert.equal(shown.lon, fire.lon)
  })

  it('keeps a lone fire on the look point', () => {
    const shown = displayLatLon(look, look, VIEW_ARRIVE, 0)
    assert.ok(Math.abs(shown.lat - look.lat) < 1e-9)
    assert.ok(Math.abs(shown.lon - look.lon) < 1e-9)
  })

  it('keeps north to the north and spreads a nearer fire less than a farther one', () => {
    const near = displayLatLon({ lat: look.lat + 100 / 111_320, lon: look.lon }, look, VIEW_ARRIVE, 0)
    const far = displayLatLon({ lat: look.lat + 800 / 111_320, lon: look.lon }, look, VIEW_ARRIVE, 0)
    assert.ok(near.lat > look.lat)
    assert.ok(far.lat > near.lat)
    const nearM = metersFrom(look, near).north
    const farM = metersFrom(look, far).north
    assert.ok(farM > nearM)
  })
})
