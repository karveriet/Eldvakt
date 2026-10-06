import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pointInLand } from './land.ts'

describe('land mask', () => {
  it('knows a city from the sea', () => {
    assert.equal(pointInLand(18.06, 59.33), true)
    assert.equal(pointInLand(4, 56), false)
  })
})
