import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LOCAL_AT } from '../geo/seat.ts'
import { audioPresence } from './presence.ts'

test('not sitting means no fire, even if a hearth is burning nearby', () => {
  const far = audioPresence({ seated: false, closeness: 0, seat: 0, hearth: 1.2 })
  assert.equal(far.fire, 0)
  const arrived = audioPresence({ seated: false, closeness: 1, seat: 0, hearth: 1.2 })
  assert.equal(arrived.fire, 0)
  const watching = audioPresence({ seated: false, closeness: 0.7, seat: 0, hearth: 0.8 })
  assert.equal(watching.fire, 0)
})

test('the whole planet is a cosmic bed, and closeness 1 is silence until you sit', () => {
  const planet = audioPresence({ seated: false, closeness: 0, seat: 0, hearth: 0 })
  assert.equal(planet.cosmos, 1)
  assert.equal(planet.fire, 0)
  const close = audioPresence({ seated: false, closeness: 1, seat: 0, hearth: 0 })
  assert.equal(close.cosmos, 0)
  assert.equal(close.fire, 0)
})

test('sitting beside the fire is the hearth, and the cosmic bed is gone', () => {
  const there = audioPresence({ seated: true, closeness: 1, seat: 1, hearth: 0.7 })
  assert.equal(there.cosmos, 0)
  assert.ok(Math.abs(there.fire - 0.7) < 1e-9)
  const stillFalling = audioPresence({
    seated: true,
    closeness: 1,
    seat: LOCAL_AT - 0.01,
    hearth: 1,
  })
  assert.equal(stillFalling.fire, 0)
  const landed = audioPresence({ seated: true, closeness: 0, seat: LOCAL_AT, hearth: 1 })
  assert.equal(landed.fire, 1)
  assert.equal(landed.cosmos, 0)
})
