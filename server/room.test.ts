import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EMPTY_DEATH_MS, HOUR_MS } from '../src/fire/rules.ts'
import { Room } from './room.ts'

describe('room', () => {
  it('lets two people share one fire and keeps the clocks honest', () => {
    let now = 5_000_000
    const room = new Room(() => now)
    const lit = room.light('host-device', 59.329, 18.068)
    assert.ok(lit)
    assert.equal(room.self('host-device').seatedFireId, lit.id)
    assert.equal(room.self('host-device').hostedFireId, lit.id)
    assert.equal(room.publicFires()[0].seatedCount, 1)
    assert.equal('hostId' in room.publicFires()[0], false)

    const sat = room.sit('guest-device', lit.id)
    assert.ok(sat)
    assert.equal(sat.seated.length, 2)
    assert.equal(sat.burnEndsAt - now, HOUR_MS)

    now += 20 * 60 * 1000
    const left = room.leave('guest-device')
    assert.ok(left)
    assert.equal(left.died, false)
    assert.equal(room.publicFires()[0].seatedCount, 1)
    assert.equal(room.publicFires()[0].burnEndsAt, sat.burnEndsAt - 10 * 60 * 1000)

    const abandoned = room.leave('host-device')
    assert.ok(abandoned)
    assert.equal(abandoned.died, false)
    assert.equal(room.publicFires()[0].seatedCount, 0)
    assert.equal(room.publicFires()[0].emptySince, now)

    now += EMPTY_DEATH_MS - 1000
    assert.equal(room.sweep().length, 0)
    const saved = room.sit('guest-device', lit.id)
    assert.ok(saved)
    assert.equal(saved.emptySince, null)
    assert.equal(saved.burnEndsAt - now, HOUR_MS)
  })

  it('goes out at one hour even while people remain', () => {
    let now = 1_000
    const room = new Room(() => now)
    const lit = room.light('host-device', 10, 10)
    assert.ok(lit)
    room.sit('guest-device', lit.id)
    now += HOUR_MS
    assert.deepEqual(room.sweep(), [lit.id])
    assert.equal(room.publicFires().length, 0)
    assert.equal(room.self('host-device').seatedFireId, null)
    assert.equal(room.self('host-device').hostedFireId, null)
  })

  it('dies five minutes after the last person leaves', () => {
    let now = 1_000
    const room = new Room(() => now)
    const lit = room.light('host-device', 10, 10)
    assert.ok(lit)
    room.leave('host-device')
    now += EMPTY_DEATH_MS - 1
    assert.equal(room.sweep().length, 0)
    now += 1
    assert.deepEqual(room.sweep(), [lit.id])
  })

  it('refuses a second role while your own fire lives', () => {
    const room = new Room(() => 50_000)
    const mine = room.light('host-device', 40, 10)
    const other = room.light('guest-device', -10, 30)
    assert.ok(mine)
    assert.ok(other)
    room.leave('host-device')
    assert.equal(room.sit('host-device', other.id), null)
    assert.equal(room.light('host-device', 1, 1), null)
    assert.ok(room.sit('host-device', mine.id))
  })

  it('extinguishes only for the person sitting alone', () => {
    const room = new Room(() => 80_000)
    const lit = room.light('host-device', 12, 12)
    assert.ok(lit)
    room.sit('guest-device', lit.id)
    assert.equal(room.extinguish('host-device'), null)
    room.leave('guest-device')
    assert.equal(room.extinguish('host-device'), lit.id)
    assert.equal(room.publicFires().length, 0)
    assert.ok(room.light('host-device', 12, 12))
  })

  it('rejects a log or a greeting from someone who is not seated', () => {
    const room = new Room(() => 90_000)
    const lit = room.light('host-device', 5, 5)
    assert.ok(lit)
    assert.equal(room.log('guest-device'), null)
    assert.equal(room.greet('guest-device', 1), null)
    const fed = room.log('host-device')
    assert.ok(fed)
    const greet = room.greet('host-device', 2)
    assert.ok(greet)
    assert.equal(greet.intensity, 1)
  })
})
