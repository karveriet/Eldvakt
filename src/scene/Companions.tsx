import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LOCAL_AT } from '../geo/seat.ts'
import { getRoomSnapshot } from '../net/room.ts'
import { getView } from './view-store.ts'

/** Soft points of light for people sitting at a fire. Easy to draw, no body. */
const MAX = 12
const RING_M = 1.62
const HOVER_M = 0.78
/** Radians kept empty toward the camera (+Z) so lights sit off to the sides. */
const CAMERA_GAP = 0.95
/** Quiet idle drift — soft floating, nothing jarring. */
const BOB_M = 0.07
const SWAY_M = 0.055
const DRIFT_M = 0.05
/** A new visitor grows into place; a leaver softens away. */
const FADE_IN_S = 1.45
const FADE_OUT_S = 0.9
const ANGLE_LERP = 2.2

type Soul = {
  sprite: THREE.Sprite
  phase: number
  bob: number
  sway: number
  drift: number
  /** 0 hidden → 1 fully present. */
  appear: number
  angle: number
  hasAngle: boolean
}

export function Companions() {
  const root = useRef<THREE.Group>(null)
  const souls = useRef<Soul[]>([])
  const wasLocal = useRef(false)
  const prevCount = useRef(0)
  const prevFireId = useRef<string | null>(null)

  useLayoutEffect(() => {
    const group = root.current
    if (!group) return
    const map = starTexture()
    const list: Soul[] = []
    for (let i = 0; i < MAX; i++) {
      const material = new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: new THREE.Color('#ffe4b5'),
        opacity: 0,
      })
      const sprite = new THREE.Sprite(material)
      sprite.visible = false
      sprite.renderOrder = 6
      sprite.scale.setScalar(0.12)
      group.add(sprite)
      list.push({
        sprite,
        phase: i * 1.618,
        bob: 0.48 + (i % 4) * 0.05,
        sway: 0.37 + (i % 5) * 0.04,
        drift: 0.29 + (i % 3) * 0.05,
        appear: 0,
        angle: 0,
        hasAngle: false,
      })
    }
    souls.current = list
    return () => {
      for (const soul of list) {
        soul.sprite.material.dispose()
        group.remove(soul.sprite)
      }
      map.dispose()
      group.clear()
    }
  }, [])

  useFrame((state, dt) => {
    const group = root.current
    if (!group) return
    const view = getView()
    const local = view.seat >= LOCAL_AT
    group.visible = local
    if (!local) {
      wasLocal.current = false
      prevCount.current = 0
      prevFireId.current = null
      for (const soul of souls.current) {
        soul.appear = 0
        soul.hasAngle = false
        soul.sprite.visible = false
      }
      return
    }

    const room = getRoomSnapshot()
    const fire = room.fires.find((item) => item.id === view.focusId)
    const count = Math.min(MAX, fire?.seatedCount ?? 0)
    const fireId = fire?.id ?? null
    const t = state.clock.elapsedTime
    const turn = fire ? seed(fire.id) : 0
    const arrive = Math.min(1, Math.max(0, (view.seat - LOCAL_AT) / (1 - LOCAL_AT)))
    const justArrived = local && !wasLocal.current
    const fireChanged = fireId !== prevFireId.current

    // Already-seated company is present when you sit down. Only later arrivals grow in.
    if (justArrived || fireChanged) {
      for (let i = 0; i < MAX; i++) {
        const soul = souls.current[i]
        soul.appear = i < count ? 1 : 0
        soul.hasAngle = false
      }
    } else if (count > prevCount.current) {
      for (let i = prevCount.current; i < count; i++) {
        souls.current[i].appear = 0
        souls.current[i].hasAngle = false
      }
    }

    wasLocal.current = true
    prevCount.current = count
    prevFireId.current = fireId

    for (let i = 0; i < MAX; i++) {
      const soul = souls.current[i]
      const sprite = soul.sprite
      const wanted = Boolean(fire) && i < count

      if (wanted) {
        soul.appear = Math.min(1, soul.appear + dt / FADE_IN_S)
      } else if (soul.appear > 0) {
        soul.appear = Math.max(0, soul.appear - dt / FADE_OUT_S)
      }

      if (soul.appear <= 0.001) {
        soul.appear = 0
        soul.hasAngle = false
        sprite.visible = false
        continue
      }

      const target = seatAngle(i, Math.max(count, i + 1), turn)
      if (!soul.hasAngle) {
        soul.angle = target
        soul.hasAngle = true
      } else {
        soul.angle = lerpAngle(soul.angle, target, Math.min(1, dt * ANGLE_LERP))
      }

      const born = smootherstep(soul.appear)
      const floatX = Math.sin(t * soul.sway + soul.phase) * SWAY_M
      const floatY = Math.sin(t * soul.bob + soul.phase * 1.31) * BOB_M
      const floatZ = Math.cos(t * soul.drift + soul.phase * 0.87) * DRIFT_M
      const radius = RING_M + floatX * 0.15
      sprite.position.set(
        Math.sin(soul.angle) * radius + floatX * 0.35,
        HOVER_M + floatY,
        Math.cos(soul.angle) * radius + floatZ,
      )

      const flicker =
        0.68 +
        0.2 * Math.sin(t * 4.7 + soul.phase) +
        0.12 * Math.sin(t * 9.3 + soul.phase * 2.2)
      const pulse = Math.max(0.4, Math.min(1, flicker))
      const material = sprite.material
      // Grow from a seed of light, then settle into the calm idle size.
      const grow = 0.12 + 0.88 * born
      material.opacity = pulse * (0.55 + 0.45 * arrive) * born
      sprite.scale.setScalar((0.09 + 0.045 * pulse) * grow)
      sprite.visible = true
    }
  })

  return <group ref={root} visible={false} />
}

/**
 * Spread companions around the fire, skipping the camera wedge at +Z.
 * Angle 0 faces the seated viewer.
 */
function seatAngle(index: number, count: number, turn: number): number {
  const span = Math.PI * 2 - CAMERA_GAP
  const u = (index + 0.5) / Math.max(1, count)
  return CAMERA_GAP / 2 + u * span + turn
}

function lerpAngle(from: number, to: number, t: number): number {
  let delta = to - from
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * t
}

function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

function seed(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return ((hash >>> 0) % 1000) / 1000 * 0.35 - 0.175
}

function starTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw a companion light')
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  glow.addColorStop(0, 'rgba(255, 252, 240, 1)')
  glow.addColorStop(0.12, 'rgba(255, 230, 170, 0.95)')
  glow.addColorStop(0.35, 'rgba(255, 170, 70, 0.35)')
  glow.addColorStop(0.7, 'rgba(180, 70, 10, 0.08)')
  glow.addColorStop(1, 'rgba(40, 10, 0, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
