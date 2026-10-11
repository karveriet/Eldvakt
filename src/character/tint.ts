const KEY = 'eldvakt-tint'

export type Hsl = { h: number; s: number; l: number }

/** A continuous anonymous tint in [0, 1]. Full float precision — hard to copy exactly. */
export function readTint(): number | null {
  const raw = localStorage.getItem(KEY)
  if (raw == null) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return clamp01(value)
}

export function hasCharacterTint(): boolean {
  return readTint() != null
}

export function writeTint(tint: number): number {
  const value = clamp01(tint)
  localStorage.setItem(KEY, String(value))
  publish()
  return value
}

export function characterTint(): number {
  return readTint() ?? 0.08
}

/** Clamp and accept only finite values for the wire. */
export function sanitizeTint(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return clamp01(value)
}

/**
 * One stepless slider → a long path of distinct looks.
 * Ends lean toward black / white (low saturation); the middle is vivid hue.
 * Hue spins as the slider moves so neighboring values stay hard to match.
 */
export function tintToBody(tint: number): Hsl {
  const t = clamp01(tint)
  const h = fract(t * 2.371 + 0.03)
  const s = 0.12 + 0.78 * Math.sin(t * Math.PI)
  const l = 0.05 + 0.9 * t
  return { h, s: clamp01(s), l: clamp01(l) }
}

/**
 * Glow stands against the body: white for near-black, dark for near-white,
 * otherwise the complementary hue (yellow→purple, blue→orange, …).
 */
export function tintToGlow(tint: number): Hsl {
  const body = tintToBody(tint)
  if (body.l < 0.2) return { h: body.h, s: 0.05, l: 0.96 }
  if (body.l > 0.8) return { h: fract(body.h + 0.55), s: 0.35, l: 0.14 }
  return {
    h: fract(body.h + 0.5),
    s: clamp01(Math.min(1, body.s + 0.12)),
    l: clamp01(0.38 + (1 - body.l) * 0.35),
  }
}

export function hslToCss(color: Hsl): string {
  return `hsl(${(color.h * 360).toFixed(3)} ${(color.s * 100).toFixed(2)}% ${(color.l * 100).toFixed(2)}%)`
}

export function hslToRgb(color: Hsl): { r: number; g: number; b: number } {
  const { h, s, l } = color
  if (s <= 1e-6) return { r: l, g: l, b: l }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: hueToChannel(p, q, h + 1 / 3),
    g: hueToChannel(p, q, h),
    b: hueToChannel(p, q, h - 1 / 3),
  }
}

const listeners = new Set<() => void>()

export function subscribeTint(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publish() {
  for (const listener of listeners) listener()
}

function hueToChannel(p: number, q: number, t: number): number {
  let x = t
  if (x < 0) x += 1
  if (x > 1) x -= 1
  if (x < 1 / 6) return p + (q - p) * 6 * x
  if (x < 1 / 2) return q
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
  return p
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function fract(value: number): number {
  return value - Math.floor(value)
}
