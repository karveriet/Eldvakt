/**
 * Burn clock for a fire. These rules are literal — do not "simplify" them.
 *
 * - Sitting still does not keep a fire alive. Only wood does.
 * - Lighting a fire, laying a log, or someone sitting down refills the burn
 *   clock to one hour and makes the fire full for the first 15 minutes.
 * - After those 15 minutes the fire shrinks continuously and goes out at
 *   60 minutes, even if people are still seated.
 * - Someone leaving while others stay subtracts 10 minutes. It does not
 *   refill anything, and it does not shorten the full window.
 * - When the last person leaves, the fire dies after 5 minutes. That leave
 *   does not also subtract 10 minutes. If someone sits during those 5
 *   minutes, the hour refills.
 * - Size on screen is company size times the time strength. A log restores
 *   full strength for whoever is seated now.
 */

export const HOUR_MS = 60 * 60 * 1000
export const FULL_WINDOW_MS = 15 * 60 * 1000
export const LEAVE_PENALTY_MS = 10 * 60 * 1000
export const EMPTY_DEATH_MS = 5 * 60 * 1000

export type ClockFields = {
  burnEndsAt: number
  fullUntil: number
  emptySince: number | null
}

export type FireClock = ClockFields & {
  seated: string[]
}

export function freshClock(now: number, hostId: string): FireClock {
  return {
    burnEndsAt: now + HOUR_MS,
    fullUntil: now + FULL_WINDOW_MS,
    emptySince: null,
    seated: [hostId],
  }
}

/** Absolute time at which the fire is gone, from fuel or from being empty. */
export function deathAt(fire: ClockFields): number {
  const fromEmpty =
    fire.emptySince == null ? Number.POSITIVE_INFINITY : fire.emptySince + EMPTY_DEATH_MS
  return Math.min(fire.burnEndsAt, fromEmpty)
}

export function isAlive(fire: ClockFields, now: number): boolean {
  return now < deathAt(fire)
}

/**
 * 1 during the first 15 minutes after wood, then a straight fall to 0 at the
 * end of the hour. The empty-fire cutoff does not add a second shrink curve.
 */
export function timeStrength(fire: ClockFields, now: number): number {
  if (!isAlive(fire, now)) return 0
  if (now <= fire.fullUntil) return 1
  const span = fire.burnEndsAt - fire.fullUntil
  if (span <= 0) return 1
  const remaining = (fire.burnEndsAt - now) / span
  if (remaining <= 0) return 0
  if (remaining >= 1) return 1
  return remaining
}

/** How large the fire reads for this company, before the clock shrinks it. */
export function companyScale(seatedCount: number): number {
  if (seatedCount <= 0) return 0.22
  return Math.min(1.35, 0.62 + 0.28 * Math.log2(seatedCount))
}

export function visualScale(seatedCount: number, fire: ClockFields, now: number): number {
  return companyScale(seatedCount) * timeStrength(fire, now)
}

export function refill(fire: FireClock, now: number): FireClock {
  return {
    ...fire,
    burnEndsAt: now + HOUR_MS,
    fullUntil: now + FULL_WINDOW_MS,
    emptySince: null,
  }
}

/** A person sitting down counts as a log and refills the hour. */
export function sitDown(fire: FireClock, userId: string, now: number): FireClock | null {
  if (!isAlive(fire, now)) return null
  if (fire.seated.includes(userId)) return fire
  return refill({ ...fire, seated: [...fire.seated, userId] }, now)
}

export function layLog(fire: FireClock, userId: string, now: number): FireClock | null {
  if (!isAlive(fire, now)) return null
  if (!fire.seated.includes(userId)) return null
  return refill(fire, now)
}

/**
 * Leave while others remain: minus 10 minutes.
 * Leave as the last person: die after 5 minutes, hour clock untouched.
 */
export function standUp(fire: FireClock, userId: string, now: number): FireClock | null {
  if (!fire.seated.includes(userId)) return null
  const seated = fire.seated.filter((id) => id !== userId)
  if (seated.length === 0) {
    return { ...fire, seated, emptySince: now }
  }
  return {
    ...fire,
    seated,
    burnEndsAt: fire.burnEndsAt - LEAVE_PENALTY_MS,
    emptySince: null,
  }
}

/** Hand-extinguish is only possible for the one person sitting alone. */
export function canExtinguish(fire: FireClock, userId: string, now: number): boolean {
  return isAlive(fire, now) && fire.seated.length === 1 && fire.seated[0] === userId
}
