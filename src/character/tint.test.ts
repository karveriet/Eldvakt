import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hslToRgb, sanitizeTint, tintToBody, tintToGlow } from './tint.ts'

describe('character tint', () => {
  it('keeps a continuous tint in unit range', () => {
    assert.equal(sanitizeTint(0.1379284), 0.1379284)
    assert.equal(sanitizeTint(-1), 0)
    assert.equal(sanitizeTint(2), 1)
    assert.equal(sanitizeTint(Number.NaN), null)
  })

  it('makes a near-black body cast a bright glow', () => {
    const body = tintToBody(0.02)
    const glow = tintToGlow(0.02)
    assert.ok(body.l < 0.15)
    assert.ok(glow.l > 0.85)
  })

  it('pairs a mid yellow-ish body with a purple-ish glow', () => {
    // Hunt a vivid mid tint whose body hue sits near yellow (~1/6).
    let tint = 0.35
    let best = tintToBody(tint)
    for (let t = 0; t <= 1; t += 0.002) {
      const body = tintToBody(t)
      if (body.s < 0.55 || body.l < 0.3 || body.l > 0.7) continue
      const yellowDist = Math.min(Math.abs(body.h - 1 / 6), 1 - Math.abs(body.h - 1 / 6))
      const bestDist = Math.min(Math.abs(best.h - 1 / 6), 1 - Math.abs(best.h - 1 / 6))
      if (yellowDist < bestDist) {
        tint = t
        best = body
      }
    }
    const glow = tintToGlow(tint)
    const sep = Math.min(Math.abs(glow.h - best.h), 1 - Math.abs(glow.h - best.h))
    assert.ok(sep > 0.35, `glow should sit across the wheel, sep=${sep}`)
  })

  it('returns finite rgb for body and glow across the slider', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const rgb = hslToRgb(tintToBody(t))
      const glow = hslToRgb(tintToGlow(t))
      for (const channel of [rgb.r, rgb.g, rgb.b, glow.r, glow.g, glow.b]) {
        assert.ok(Number.isFinite(channel))
        assert.ok(channel >= 0 && channel <= 1)
      }
    }
  })
})
