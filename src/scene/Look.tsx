import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getRoomSnapshot, send } from '../net/room.ts'
import { approachCluster } from './approach.ts'
import { gesture } from './gesture.ts'
import { pickTargets } from './hearth-layer.ts'
import { noteDrag } from './motion.ts'
import { getView, nudge, zoomBy } from './view-store.ts'

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const offset = new THREE.Vector3()

export function Look() {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    const el = gl.domElement
    let down: { x: number; y: number; pointerId: number } | null = null
    let dragging = false
    let holding = false
    let pinchDist = 0
    const pinches = new Map<number, { x: number; y: number }>()

    const pick = (x: number, y: number) => {
      const rect = el.getBoundingClientRect()
      pointer.x = ((x - rect.left) / rect.width) * 2 - 1
      pointer.y = -((y - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      let best: (typeof pickTargets)[number] | null = null
      let bestT = Infinity
      for (const target of pickTargets) {
        offset.copy(target.position).sub(raycaster.ray.origin)
        const t = offset.dot(raycaster.ray.direction)
        if (t < 0) continue
        const dist2 = offset.lengthSq() - t * t
        if (dist2 > target.radius * target.radius) continue
        if (t < bestT) {
          bestT = t
          best = target
        }
      }
      return best
    }

    const onDown = (event: PointerEvent) => {
      pinches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pinches.size > 1) {
        down = null
        holding = false
        gesture.holdFireId = null
        return
      }
      down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
      dragging = false
      holding = false
      const seated = getRoomSnapshot().self.seatedFireId
      if (!seated || getView().traveling) return
      const hit = pick(event.clientX, event.clientY)
      if (hit?.kind === 'flame' && hit.members[0]?.id === seated) {
        holding = true
        gesture.holdFireId = seated
        gesture.holdStarted = performance.now()
      }
    }

    const onMove = (event: PointerEvent) => {
      const point = pinches.get(event.pointerId)
      if (point) {
        point.x = event.clientX
        point.y = event.clientY
      }
      if (pinches.size === 2) {
        const [a, b] = [...pinches.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDist > 0 && !getRoomSnapshot().self.seatedFireId) zoomBy(pinchDist / dist)
        pinchDist = dist
        return
      }
      if (!down || event.pointerId !== down.pointerId) return
      const dx = event.clientX - down.x
      const dy = event.clientY - down.y
      if (!dragging && dx * dx + dy * dy > 36) {
        dragging = true
        if (holding) {
          holding = false
          gesture.holdFireId = null
        }
      }
      if (!dragging || holding) return
      nudge(-dy * 0.09, -dx * 0.09)
      down.x = event.clientX
      down.y = event.clientY
      noteDrag()
    }

    const onUp = (event: PointerEvent) => {
      pinches.delete(event.pointerId)
      if (pinches.size < 2) pinchDist = 0
      if (!down || event.pointerId !== down.pointerId) return
      if (holding && gesture.holdFireId) {
        const intensity = Math.max(0, Math.min(1, (performance.now() - gesture.holdStarted) / 1400))
        gesture.holdFireId = null
        if (intensity >= 0.08) send({ type: 'greet', intensity })
      } else if (!dragging && !getView().traveling && !getRoomSnapshot().self.seatedFireId) {
        const hit = pick(event.clientX, event.clientY)
        if (hit && hit.members.length > 0) approachCluster(hit.lat, hit.lon, hit.radiusKm, hit.members)
      }
      down = null
      dragging = false
      holding = false
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    const onWheel = (event: WheelEvent) => {
      if (getRoomSnapshot().self.seatedFireId || getView().traveling) return
      event.preventDefault()
      zoomBy(Math.exp(event.deltaY * 0.0011))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [camera, gl])

  return null
}
