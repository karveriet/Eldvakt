import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VIEW_ARRIVE, VIEW_FAR } from '../fire/view-distance.ts'
import {
  APPROACH_BACK_M,
  LOCAL_AT,
  LOW_ORBIT,
  SIT_BACK_M,
  SIT_EYE_M,
  intimateMeters,
  orbitApproach,
} from './seat.ts'

test('a finished seat is a few meters from the fire, at sitting height', () => {
  const there = intimateMeters(1)
  assert.equal(there.local, true)
  assert.ok(Math.abs(there.back - SIT_BACK_M) < 1e-6)
  assert.ok(Math.abs(there.eye - SIT_EYE_M) < 1e-6)
  assert.ok(there.back > 2.4)
  assert.ok(there.back < 4)
  assert.ok(there.eye > 0.85)
  assert.ok(there.eye < 1.25)
})

test('the intimate arrival starts on the ground, not in orbit', () => {
  const opening = intimateMeters(LOCAL_AT)
  assert.equal(opening.local, true)
  assert.equal(opening.back, APPROACH_BACK_M)
  assert.ok(opening.back > 8)
  assert.ok(opening.back < 20)
  assert.equal(intimateMeters(0).local, false)
})

test('the descent stays outside the planet until the ground view takes over', () => {
  const far = orbitApproach(59.33, 18.06, VIEW_FAR, 0)
  assert.ok(Math.hypot(far.x, far.y, far.z) > 4)
  const low = orbitApproach(59.33, 18.06, VIEW_ARRIVE, LOCAL_AT)
  const radius = Math.hypot(low.x, low.y, low.z)
  assert.ok(Math.abs(radius - LOW_ORBIT) < 0.02)
  assert.ok(radius > 1.05)
})
