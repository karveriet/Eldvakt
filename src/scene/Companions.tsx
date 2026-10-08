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

type Soul = {
  sprite: THREE.Sprite
  phase: number
  bob: number
  sway: number
  drift: number
}

export function Companions() {
  const root = useRef<THREE.Group>(null)
  const souls = useRef<Soul[]>([])

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

  useFrame((state) => {
    const group = root.current
    if (!group) return
    const view = getView()
    const local = view.seat >= LOCAL_AT
    group.visible = local
    if (!local) {
      for (const soul of souls.current) soul.sprite.visible = false
      return
    }

    const room = getRoomSnapshot()
    const fire = room.fires.find((item) => item.id === view.focusId)
    const count = Math.min(MAX, fire?.seatedCount ?? 0)
    const t = state.clock.elapsedTime
    const turn = fire ? seed(fire.id) : 0
    const arrive = Math.min(1, Math.max(0, (view.seat - LOCAL_AT) / (1 - LOCAL_AT)))

    for (let i = 0; i < MAX; i++) {
      const soul = souls.current[i]
      const sprite = soul.sprite
      if (i >= count || !fire) {
        sprite.visible = false
        continue
      }

      // Each seated person is a soft star, kept off the camera line so they
      // hover to the side of the flame rather than between you and it.
      const angle = seatAngle(i, count, turn)
      const floatX = Math.sin(t * soul.sway + soul.phase) * SWAY_M
      const floatY = Math.sin(t * soul.bob + soul.phase * 1.31) * BOB_M
      const floatZ = Math.cos(t * soul.drift + soul.phase * 0.87) * DRIFT_M
      const radius = RING_M + floatX * 0.15
      sprite.position.set(
        Math.sin(angle) * radius + floatX * 0.35,
        HOVER_M + floatY,
        Math.cos(angle) * radius + floatZ,
      )

      const flicker =
        0.68 +
        0.2 * Math.sin(t * 4.7 + soul.phase) +
        0.12 * Math.sin(t * 9.3 + soul.phase * 2.2)
      const pulse = Math.max(0.4, Math.min(1, flicker))
      const material = sprite.material
      material.opacity = pulse * (0.55 + 0.45 * arrive)
      sprite.scale.setScalar(0.09 + 0.045 * pulse)
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
  const u = (index + 0.5) / count
  return CAMERA_GAP / 2 + u * span + turn
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
