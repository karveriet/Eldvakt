import type { ClockFields } from '../fire/rules.ts'

export type PublicFire = ClockFields & {
  id: string
  lat: number
  lon: number
  seatedCount: number
  /**
   * Anonymous glint tints for other people at this fire (never your own).
   * First person: you only see others. No device ids.
   */
  glints: number[]
  litAt: number
}

export type SelfState = {
  id: string
  seatedFireId: string | null
  hostedFireId: string | null
}

export type Happened =
  | { kind: 'lit'; fireId: string }
  | { kind: 'sat'; fireId: string }
  | { kind: 'left'; fireId: string }
  | { kind: 'log'; fireId: string }
  | { kind: 'extinguished'; fireId: string }
  | { kind: 'died'; fireId: string }
  | { kind: 'greet'; fireId: string; intensity: number }

export type ClientMessage =
  | { type: 'hello'; id: string; hue?: number }
  | { type: 'light'; lat: number; lon: number }
  | { type: 'sit'; fireId: string }
  | { type: 'leave' }
  | { type: 'log' }
  | { type: 'extinguish' }
  | { type: 'greet'; intensity: number }

export type ServerMessage = {
  type: 'world'
  serverNow: number
  fires: PublicFire[]
  self: SelfState
  happened?: Happened
}

export const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/
