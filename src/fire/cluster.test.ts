import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clusterByDistance, distanceForMerge, mergeDistanceKm } from './cluster.ts'
import { VIEW_ARRIVE, VIEW_FAR } from './view-distance.ts'

describe('clustering', () => {
  it('merges a wider tract when the camera is far', () => {
    assert.ok(mergeDistanceKm(VIEW_FAR) > 1500)
    assert.ok(mergeDistanceKm(VIEW_ARRIVE) < 0.2)
    assert.ok(mergeDistanceKm(VIEW_FAR) > mergeDistanceKm((VIEW_FAR + VIEW_ARRIVE) / 2))
  })

  it('splits fires as the merge distance falls below their separation', () => {
    const fires = [
      { id: 'a', lat: 59.33, lon: 18.07 },
      { id: 'b', lat: 59.5, lon: 18.2 },
    ]
    const far = clusterByDistance(fires, 500)
    const near = clusterByDistance(fires, 5)
    assert.equal(far.length, 1)
    assert.equal(near.length, 2)
  })

  it('inverts merge distance back into a camera distance', () => {
    const mid = (VIEW_FAR + VIEW_ARRIVE) / 2
    const distance = distanceForMerge(mergeDistanceKm(mid))
    assert.ok(Math.abs(distance - mid) < 0.05)
  })
})
