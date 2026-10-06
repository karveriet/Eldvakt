import { snapToCell } from '../src/geo/cell.ts'
import {
  canExtinguish,
  freshClock,
  isAlive,
  layLog,
  sitDown,
  standUp,
  type FireClock,
} from '../src/fire/rules.ts'
import type { PublicFire, SelfState } from '../src/shared/protocol.ts'

export type FireRecord = FireClock & {
  id: string
  hostId: string
  lat: number
  lon: number
  litAt: number
}

export type LeaveResult = { fireId: string; died: boolean }

/**
 * Authoritative fires for one shared night.
 * A person tends their own living fire or sits at someone else's, never both.
 */
export class Room {
  private fires = new Map<string, FireRecord>()
  private seats = new Map<string, string>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  light(userId: string, lat: number, lon: number): FireRecord | null {
    this.sweep()
    if (this.seats.has(userId) || this.hostedBy(userId)) return null
    if (!validPoint(lat, lon)) return null
    const point = snapToCell(lat, lon)
    const now = this.now()
    const fire: FireRecord = {
      id: crypto.randomUUID(),
      hostId: userId,
      lat: point.lat,
      lon: point.lon,
      litAt: now,
      ...freshClock(now, userId),
    }
    this.fires.set(fire.id, fire)
    this.seats.set(userId, fire.id)
    return fire
  }

  sit(userId: string, fireId: string): FireRecord | null {
    this.sweep()
    if (this.seats.has(userId)) return null
    const hosted = this.hostedBy(userId)
    if (hosted && hosted.id !== fireId) return null
    const fire = this.fires.get(fireId)
    if (!fire) return null
    const next = sitDown(fire, userId, this.now())
    if (!next) return null
    const updated = { ...fire, ...next }
    this.fires.set(fireId, updated)
    this.seats.set(userId, fireId)
    return updated
  }

  leave(userId: string): LeaveResult | null {
    this.sweep()
    const fireId = this.seats.get(userId)
    if (!fireId) return null
    const fire = this.fires.get(fireId)
    this.seats.delete(userId)
    if (!fire) return null
    const next = standUp(fire, userId, this.now())
    if (!next || !isAlive(next, this.now())) {
      this.fires.delete(fireId)
      this.clearSeats(fireId)
      return { fireId, died: true }
    }
    this.fires.set(fireId, { ...fire, ...next })
    return { fireId, died: false }
  }

  log(userId: string): FireRecord | null {
    this.sweep()
    const fireId = this.seats.get(userId)
    if (!fireId) return null
    const fire = this.fires.get(fireId)
    if (!fire) return null
    const next = layLog(fire, userId, this.now())
    if (!next) return null
    const updated = { ...fire, ...next }
    this.fires.set(fireId, updated)
    return updated
  }

  extinguish(userId: string): string | null {
    this.sweep()
    const fireId = this.seats.get(userId)
    if (!fireId) return null
    const fire = this.fires.get(fireId)
    if (!fire || !canExtinguish(fire, userId, this.now())) return null
    this.fires.delete(fireId)
    this.seats.delete(userId)
    return fireId
  }

  greet(userId: string, intensity: number): { fireId: string; intensity: number } | null {
    this.sweep()
    const fireId = this.seats.get(userId)
    if (!fireId) return null
    const fire = this.fires.get(fireId)
    if (!fire || !isAlive(fire, this.now())) return null
    if (!Number.isFinite(intensity)) return null
    const clamped = Math.max(0, Math.min(1, intensity))
    if (clamped < 0.05) return null
    return { fireId, intensity: clamped }
  }

  /** Removes fires whose clock has run out. Returns their ids. */
  sweep(): string[] {
    const now = this.now()
    const dead: string[] = []
    for (const fire of this.fires.values()) {
      if (!isAlive(fire, now)) {
        dead.push(fire.id)
        this.fires.delete(fire.id)
        this.clearSeats(fire.id)
      }
    }
    return dead
  }

  publicFires(): PublicFire[] {
    const now = this.now()
    const list: PublicFire[] = []
    for (const fire of this.fires.values()) {
      if (!isAlive(fire, now)) continue
      list.push({
        id: fire.id,
        lat: fire.lat,
        lon: fire.lon,
        burnEndsAt: fire.burnEndsAt,
        fullUntil: fire.fullUntil,
        emptySince: fire.emptySince,
        seatedCount: fire.seated.length,
        litAt: fire.litAt,
      })
    }
    return list
  }

  self(userId: string): SelfState {
    return {
      id: userId,
      seatedFireId: this.seats.get(userId) ?? null,
      hostedFireId: this.hostedBy(userId)?.id ?? null,
    }
  }

  private hostedBy(userId: string): FireRecord | null {
    const now = this.now()
    for (const fire of this.fires.values()) {
      if (fire.hostId === userId && isAlive(fire, now)) return fire
    }
    return null
  }

  private clearSeats(fireId: string) {
    for (const [userId, seatedAt] of this.seats) {
      if (seatedAt === fireId) this.seats.delete(userId)
    }
  }
}

function validPoint(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}
