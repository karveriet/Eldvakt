import { smootherstep } from '../fire/view-distance.ts'
import { LOCAL_AT } from '../geo/seat.ts'

export type PresenceInput = {
  /** True only while this listener is seated at a living fire. */
  seated: boolean
  /** 0 when the whole planet is in frame, 1 at the orbital arrival distance. */
  closeness: number
  /** 0 in orbit, 1 when the camera has finished beside the flame. */
  seat: number
  /** How strongly that fire is burning, if one is in earshot. */
  hearth: number
}

export type PresenceMix = {
  /** Crackle. Stays at 0 until you are actually on the ground beside the fire. */
  fire: number
  /** Faint bed. Full with the whole planet in view, gone once you leave that distance. */
  cosmos: number
}

/**
 * The hearth is only heard once you are sitting beside it.
 * Far enough to see the planet, a quiet cosmic bed takes that place.
 */
export function audioPresence(input: PresenceInput): PresenceMix {
  const seat = clamp01(input.seat)
  const beside = input.seated && seat >= LOCAL_AT
  const fire = beside ? Math.max(0, input.hearth) : 0
  if (beside) return { fire, cosmos: 0 }
  const far = smootherstep(1 - clamp01(input.closeness))
  const stillOrbital = 1 - smootherstep(Math.min(1, seat / LOCAL_AT))
  return { fire: 0, cosmos: far * stillOrbital }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
