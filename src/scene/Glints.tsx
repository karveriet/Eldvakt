import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { hslToRgb, tintToBody, tintToGlow } from '../character/tint.ts'
import { LOCAL_AT } from '../geo/seat.ts'
import { getRoomSnapshot } from '../net/room.ts'
import { getView } from './view-store.ts'

/** Other people's glints at a fire — first person, never your own. */
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
const DEFAULT_TINT = 0.08

type Soul = {
  core: THREE.Sprite
  glow: THREE.Sprite
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
  tint: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  trail: number[]
}

export function Glints() {
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
    const coreMap = hardTexture()
    const glowMap = softTexture()
    const list: Soul[] = []
    for (let i = 0; i < MAX; i++) {
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowMap,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color('#ffe4b5'),
          opacity: 0,
        }),
      )
      glow.visible = false
      glow.renderOrder = 5

      const core = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: coreMap,
          transparent: true,
          depthWrite: false,
          blending: THREE.NormalBlending,
          color: new THREE.Color('#222'),
          opacity: 0,
        }),
      )
      core.visible = false
      core.renderOrder = 6

      group.add(glow)
      group.add(core)
      list.push({
        core,
        glow,
        phase: i * 1.618,
        bob: 0.48 + (i % 4) * 0.05,
        sway: 0.37 + (i % 5) * 0.04,
        drift: 0.29 + (i % 3) * 0.05,
        appear: 0,
        angle: 0,
        hasAngle: false,
        mode: 'seat',
        streakT: 0,
        tint: DEFAULT_TINT,
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
        soul.core.material.dispose()
        soul.glow.material.dispose()
        group.remove(soul.core)
        group.remove(soul.glow)
      }
      points.geometry.dispose()
      ;(points.material as THREE.Material).dispose()
      coreMap.dispose()
      glowMap.dispose()
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
    // Server already omits your own tint — first person, only other glints.
    const tints = fire?.glints ?? []
    const count = Math.min(MAX, tints.length)
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
        soul.tint = tints[i] ?? DEFAULT_TINT
      }
    } else if (count > prevCount.current) {
      for (let i = prevCount.current; i < count; i++) {
        const soul = souls.current[i]
        if (soul.mode === 'streak') continue
        soul.appear = 0
        soul.hasAngle = false
        soul.mode = 'seat'
        soul.tint = tints[i] ?? DEFAULT_TINT
      }
    } else if (count < prevCount.current) {
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
      const wanted = Boolean(fire) && i < count && soul.mode === 'seat'
      if (wanted) soul.tint = tints[i] ?? soul.tint

      if (soul.mode === 'streak') {
        stepStreak(soul, dt)
        continue
      }

      if (wanted) {
        soul.appear = Math.min(1, soul.appear + dt / FADE_IN_S)
      } else if (soul.appear > 0) {
        launchStreak(soul)
        stepStreak(soul, dt)
        continue
      } else {
        hideSoul(soul)
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

      const flicker =
        0.68 +
        0.2 * Math.sin(t * 4.7 + soul.phase) +
        0.12 * Math.sin(t * 9.3 + soul.phase * 2.2)
      const pulse = Math.max(0.4, Math.min(1, flicker))
      const grow = 0.12 + 0.88 * born
      const fade = pulse * (0.55 + 0.45 * arrive) * born
      paintSoul(soul, fade, grow, pulse)
    }

    writeTrails(souls.current, trailPos.current, trailPoints.current)
  })

  return <group ref={root} visible={false} />
}

function paintSoul(soul: Soul, fade: number, grow: number, pulse: number) {
  const body = hslToRgb(tintToBody(soul.tint))
  const halo = hslToRgb(tintToGlow(soul.tint))
  soul.core.position.set(soul.x, soul.y, soul.z)
  soul.glow.position.set(soul.x, soul.y, soul.z)
  soul.core.material.color.setRGB(body.r, body.g, body.b)
  soul.glow.material.color.setRGB(halo.r, halo.g, halo.b)
  soul.core.material.opacity = Math.min(1, 0.55 + 0.45 * fade)
  soul.glow.material.opacity = fade
  soul.core.scale.setScalar((0.055 + 0.03 * pulse) * grow)
  soul.glow.scale.setScalar((0.14 + 0.06 * pulse) * grow)
  soul.core.visible = true
  soul.glow.visible = true
}

function hideSoul(soul: Soul) {
  soul.core.visible = false
  soul.glow.visible = false
}

function resetSoul(soul: Soul) {
  soul.appear = 0
  soul.hasAngle = false
  soul.mode = 'seat'
  soul.streakT = 0
  soul.trail.length = 0
  hideSoul(soul)
}

function launchStreak(soul: Soul) {
  soul.mode = 'streak'
  soul.streakT = 0
  soul.appear = 0
  soul.hasAngle = false
  soul.trail = [soul.x, soul.y, soul.z]
  const fling = 0.7 + Math.random() * 0.6
  soul.vx = (Math.random() - 0.5) * 3.2 * fling
  soul.vy = (10.5 + Math.random() * 4.5) * fling
  soul.vz = ((Math.random() - 0.5) * 2.4 - 0.8) * fling
  paintSoul(soul, 1, 1, 1)
}

function stepStreak(soul: Soul, dt: number) {
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

  soul.trail.push(soul.x, soul.y, soul.z)
  const max = TRAIL_LEN * 3
  if (soul.trail.length > max) soul.trail.splice(0, soul.trail.length - max)

  const life = 1 - smootherstep(u)
  paintSoul(soul, 0.35 + 0.65 * life, 0.7 + 0.3 * life, life)
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
  const material = points.material as THREE.PointsMaterial
  const streak = souls.find((soul) => soul.mode === 'streak')
  if (streak) {
    const halo = hslToRgb(tintToGlow(streak.tint))
    material.color.setRGB(halo.r, halo.g, halo.b)
  }
  points.geometry.setDrawRange(0, wrote)
  points.geometry.attributes.position.needsUpdate = true
  points.visible = wrote > 0
}

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

function softTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw a glint glow')
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  glow.addColorStop(0, 'rgba(255, 255, 255, 1)')
  glow.addColorStop(0.2, 'rgba(255, 255, 255, 0.55)')
  glow.addColorStop(0.55, 'rgba(255, 255, 255, 0.12)')
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function hardTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw a glint body')
  const body = ctx.createRadialGradient(32, 32, 0, 32, 32, 28)
  body.addColorStop(0, 'rgba(255, 255, 255, 1)')
  body.addColorStop(0.55, 'rgba(255, 255, 255, 1)')
  body.addColorStop(0.85, 'rgba(255, 255, 255, 0.35)')
  body.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = body
  ctx.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
