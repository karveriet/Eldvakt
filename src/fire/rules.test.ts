import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_DEATH_MS,
  FULL_WINDOW_MS,
  HOUR_MS,
  LEAVE_PENALTY_MS,
  canExtinguish,
  companyScale,
  freshClock,
  isAlive,
  layLog,
  sitDown,
  standUp,
  timeStrength,
  visualScale,
} from './rules.ts'

const T0 = 1_700_000_000_000

describe('burn clock', () => {
  it('starts with an hour of wood and a full quarter-hour', () => {
    const fire = freshClock(T0, 'host')
    assert.equal(fire.burnEndsAt - T0, HOUR_MS)
    assert.equal(fire.fullUntil - T0, FULL_WINDOW_MS)
    assert.equal(fire.emptySince, null)
    assert.deepEqual(fire.seated, ['host'])
    assert.equal(timeStrength(fire, T0), 1)
    assert.equal(timeStrength(fire, T0 + FULL_WINDOW_MS), 1)
  })

  it('stays full for 15 minutes, then shrinks to nothing at 60', () => {
    const fire = freshClock(T0, 'host')
    const halfway = T0 + FULL_WINDOW_MS + (HOUR_MS - FULL_WINDOW_MS) / 2
    assert.equal(timeStrength(fire, halfway), 0.5)
    assert.equal(isAlive(fire, T0 + HOUR_MS - 1), true)
    assert.equal(timeStrength(fire, T0 + HOUR_MS - 1) > 0, true)
    assert.equal(timeStrength(fire, T0 + HOUR_MS - 1) < 0.01, true)
    assert.equal(isAlive(fire, T0 + HOUR_MS), false)
    assert.equal(timeStrength(fire, T0 + HOUR_MS), 0)
    assert.equal(isAlive(fire, T0 + HOUR_MS), false)
  })

  it('a log refills the hour and restores full strength', () => {
    const aged = freshClock(T0, 'host')
    const later = T0 + 40 * 60 * 1000
    assert.ok(timeStrength(aged, later) < 1)
    const fed = layLog(aged, 'host', later)
    assert.ok(fed)
    assert.equal(fed.burnEndsAt - later, HOUR_MS)
    assert.equal(fed.fullUntil - later, FULL_WINDOW_MS)
    assert.equal(timeStrength(fed, later), 1)
    assert.equal(fed.seated.length, 1)
  })

  it('sitting down refills the hour, including during the empty five minutes', () => {
    let fire = freshClock(T0, 'host')
    const left = standUp(fire, 'host', T0 + 1000)
    assert.ok(left)
    fire = left
    assert.equal(fire.emptySince, T0 + 1000)
    assert.equal(fire.burnEndsAt, T0 + HOUR_MS)
    const back = sitDown(fire, 'guest', T0 + 1000 + 4 * 60 * 1000)
    assert.ok(back)
    assert.equal(back.emptySince, null)
    assert.equal(back.burnEndsAt - (T0 + 1000 + 4 * 60 * 1000), HOUR_MS)
    assert.equal(timeStrength(back, T0 + 1000 + 4 * 60 * 1000), 1)
    assert.deepEqual(back.seated, ['guest'])
  })

  it('does not refill when the same person is already seated', () => {
    const fire = freshClock(T0, 'host')
    const again = sitDown(fire, 'host', T0 + 10 * 60 * 1000)
    assert.equal(again, fire)
  })

  it('a leaver subtracts 10 minutes only while someone else stays', () => {
    let fire = freshClock(T0, 'host')
    fire = sitDown(fire, 'guest', T0 + 1000)!
    const before = fire.burnEndsAt
    const fullUntil = fire.fullUntil
    const left = standUp(fire, 'guest', T0 + 20 * 60 * 1000)
    assert.ok(left)
    assert.equal(left.burnEndsAt, before - LEAVE_PENALTY_MS)
    assert.equal(left.fullUntil, fullUntil)
    assert.equal(left.emptySince, null)
    assert.deepEqual(left.seated, ['host'])
  })

  it('the last person leaving starts a 5 minute death and does not subtract 10', () => {
    const fire = freshClock(T0, 'host')
    const left = standUp(fire, 'host', T0 + 1000)!
    assert.equal(left.burnEndsAt, fire.burnEndsAt)
    assert.equal(left.emptySince, T0 + 1000)
    assert.equal(isAlive(left, T0 + 1000 + EMPTY_DEATH_MS - 1), true)
    assert.equal(isAlive(left, T0 + 1000 + EMPTY_DEATH_MS), false)
  })

  it('rejects a log, a sit, and a second sit after the fire is dead', () => {
    const fire = freshClock(T0, 'host')
    const deadAt = T0 + HOUR_MS
    assert.equal(layLog(fire, 'host', deadAt), null)
    assert.equal(sitDown(fire, 'guest', deadAt), null)
  })

  it('size follows company, and the quarter-hour shrink still applies', () => {
    const alone = freshClock(T0, 'host')
    const together = sitDown(alone, 'guest', T0)!
    assert.ok(companyScale(2) > companyScale(1))
    assert.ok(companyScale(0) < companyScale(1))
    assert.equal(visualScale(2, together, T0), companyScale(2))
    const later = T0 + 40 * 60 * 1000
    const shrunk = visualScale(2, together, later)
    assert.ok(shrunk < companyScale(2))
    assert.ok(Math.abs(shrunk - companyScale(2) * timeStrength(together, later)) < 1e-9)
  })

  it('can be put out by hand only when one person sits there', () => {
    let fire = freshClock(T0, 'host')
    assert.equal(canExtinguish(fire, 'host', T0), true)
    assert.equal(canExtinguish(fire, 'guest', T0), false)
    fire = sitDown(fire, 'guest', T0 + 1)!
    assert.equal(canExtinguish(fire, 'host', T0 + 1), false)
    assert.equal(canExtinguish(fire, 'guest', T0 + 1), false)
    const left = standUp(fire, 'host', T0 + 2)!
    assert.equal(canExtinguish(left, 'guest', T0 + 2), true)
  })
})
