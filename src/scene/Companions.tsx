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
const FADE_IN_S = 1.45
const ANGLE_LERP = 2.2
/** Leaving becomes a cheerful shooting star, not a fade. */
const STREAK_S = 1.55
const TRAIL_LEN = 14
const TRAIL_POINTS = MAX * TRAIL_LEN

type Soul = {
  sprite: THREE.Sprite
  phase: number
  bob: number
  sway: number
  drift: number
  /** 0 hidden → 1 fully present (seat only). */
  appear: number
  angle: number
  hasAngle: boolean
  mode: 'seat' | 'streak'
  streakT: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  trail: number[]
}

export function Companions() {
  const root = useRef<THREE.Group>(null)
  const souls = useRef<Soul[]>([])
  const trailPoints = useRef<THREE.Points>(null)
  const trailPos = useRef(new Float32Array(TRAIL_POINTS * 3))
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
        mode: 'seat',
        streakT: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        trail: [],
      })
    }
    souls.current = list

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(trailPos.current, 3))
    geometry.setDrawRange(0, 0)
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: new THREE.Color('#fff1c8'),
        size: 0.055,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        opacity: 0.85,
      }),
    )
    points.renderOrder = 7
    points.frustumCulled = false
    group.add(points)
    trailPoints.current = points

    return () => {
      for (const soul of list) {
        soul.sprite.material.dispose()
        group.remove(soul.sprite)
      }
      points.geometry.dispose()
      ;(points.material as THREE.Material).dispose()
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
      for (const soul of souls.current) resetSoul(soul)
      writeTrails(souls.current, trailPos.current, trailPoints.current)
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

    if (justArrived || fireChanged) {
      for (let i = 0; i < MAX; i++) {
        const soul = souls.current[i]
        resetSoul(soul)
        soul.appear = i < count ? 1 : 0
        soul.mode = 'seat'
      }
    } else if (count > prevCount.current) {
      for (let i = prevCount.current; i < count; i++) {
        const soul = souls.current[i]
        if (soul.mode === 'streak') continue
        soul.appear = 0
        soul.hasAngle = false
        soul.mode = 'seat'
      }
    } else if (count < prevCount.current) {
      // Highest seats leave first — each becomes a shooting star.
      for (let i = count; i < prevCount.current; i++) {
        const soul = souls.current[i]
        if (soul.mode === 'seat' && soul.appear > 0.15) launchStreak(soul)
      }
    }

    wasLocal.current = true
    prevCount.current = count
    prevFireId.current = fireId

    for (let i = 0; i < MAX; i++) {
      const soul = souls.current[i]
      const sprite = soul.sprite
      const wanted = Boolean(fire) && i < count && soul.mode === 'seat'

      if (soul.mode === 'streak') {
        stepStreak(soul, sprite, dt)
        continue
      }

      if (wanted) {
        soul.appear = Math.min(1, soul.appear + dt / FADE_IN_S)
      } else if (soul.appear > 0) {
        // Unexpected drop (e.g. fire gone): still leave as a star.
        launchStreak(soul)
        stepStreak(soul, sprite, dt)
        continue
      } else {
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
      soul.x = Math.sin(soul.angle) * radius + floatX * 0.35
      soul.y = HOVER_M + floatY
      soul.z = Math.cos(soul.angle) * radius + floatZ
      sprite.position.set(soul.x, soul.y, soul.z)

      const flicker =
        0.68 +
        0.2 * Math.sin(t * 4.7 + soul.phase) +
        0.12 * Math.sin(t * 9.3 + soul.phase * 2.2)
      const pulse = Math.max(0.4, Math.min(1, flicker))
      const material = sprite.material
      material.color.set('#ffe4b5')
      const grow = 0.12 + 0.88 * born
      material.opacity = pulse * (0.55 + 0.45 * arrive) * born
      sprite.scale.setScalar((0.09 + 0.045 * pulse) * grow)
      sprite.visible = true
    }

    writeTrails(souls.current, trailPos.current, trailPoints.current)
  })

  return <group ref={root} visible={false} />
}

function resetSoul(soul: Soul) {
  soul.appear = 0
  soul.hasAngle = false
  soul.mode = 'seat'
  soul.streakT = 0
  soul.trail.length = 0
  soul.sprite.visible = false
}

function launchStreak(soul: Soul) {
  soul.mode = 'streak'
  soul.streakT = 0
  soul.appear = 0
  soul.hasAngle = false
  soul.trail = [soul.x, soul.y, soul.z]
  // Cheerful arc: mostly up, a little sideways — like a wink, not a goodbye.
  const fling = 0.7 + Math.random() * 0.6
  soul.vx = (Math.random() - 0.5) * 3.2 * fling
  soul.vy = (10.5 + Math.random() * 4.5) * fling
  soul.vz = ((Math.random() - 0.5) * 2.4 - 0.8) * fling
  const material = soul.sprite.material
  material.color.set('#fff6d0')
  material.opacity = 1
  soul.sprite.scale.setScalar(0.13)
  soul.sprite.visible = true
}

function stepStreak(soul: Soul, sprite: THREE.Sprite, dt: number) {
  soul.streakT += dt
  const u = soul.streakT / STREAK_S
  if (u >= 1) {
    resetSoul(soul)
    return
  }

  soul.vx *= 0.992
  soul.vy *= 0.985
  soul.vz *= 0.992
  soul.x += soul.vx * dt
  soul.y += soul.vy * dt
  soul.z += soul.vz * dt
  sprite.position.set(soul.x, soul.y, soul.z)

  soul.trail.push(soul.x, soul.y, soul.z)
  const max = TRAIL_LEN * 3
  if (soul.trail.length > max) soul.trail.splice(0, soul.trail.length - max)

  const life = 1 - smootherstep(u)
  const material = sprite.material
  material.opacity = 0.35 + 0.65 * life
  // Brighten and slim a touch as it becomes a star.
  sprite.scale.setScalar(0.07 + 0.08 * life)
  sprite.visible = true
}

function writeTrails(
  souls: Soul[],
  positions: Float32Array,
  points: THREE.Points | null,
) {
  let wrote = 0
  for (const soul of souls) {
    if (soul.mode !== 'streak') continue
    const trail = soul.trail
    for (let i = 0; i < trail.length; i += 3) {
      if (wrote >= TRAIL_POINTS) break
      positions[wrote * 3] = trail[i]
      positions[wrote * 3 + 1] = trail[i + 1]
      positions[wrote * 3 + 2] = trail[i + 2]
      wrote += 1
    }
  }
  if (!points) return
  points.geometry.setDrawRange(0, wrote)
  points.geometry.attributes.position.needsUpdate = true
  points.visible = wrote > 0
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
  return (((hash >>> 0) % 1000) / 1000) * 0.35 - 0.175
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
