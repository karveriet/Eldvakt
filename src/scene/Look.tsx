import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getRoomSnapshot, send } from '../net/room.ts'
import { approachCluster } from './approach.ts'
import { gesture } from './gesture.ts'
import { pickTargets } from './hearth-layer.ts'
import { LOCAL_AT } from '../geo/seat.ts'
import { noteDrag } from './motion.ts'
import {
  beginOrbitGrab,
  flingOrbit,
  getView,
  nudge,
  stopOrbitSpin,
  twistOrbit,
  zoomBy,
} from './view-store.ts'

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
    let pinchAngle = Number.NaN
    const pinches = new Map<number, { x: number; y: number }>()
    let lastMoveAt = 0
    let velLat = 0
    let velLon = 0

    const twoFinger = () => {
      const points = [...pinches.values()]
      if (points.length < 2) return null
      const [a, b] = points
      return {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        // Screen y grows downward; clockwise twist increases this angle.
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      }
    }

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
        stopOrbitSpin()
        if (getView().seat < LOCAL_AT) beginOrbitGrab()
        const pair = twoFinger()
        pinchDist = pair?.dist ?? 0
        pinchAngle = pair?.angle ?? Number.NaN
        return
      }
      down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
      dragging = false
      holding = false
      lastMoveAt = performance.now()
      velLat = 0
      velLon = 0
      // Stop coasting but keep the current camera frame — resetting to
      // world-north here was snapping the globe on first touch after a spin.
      if (getView().seat < LOCAL_AT) beginOrbitGrab()
      else stopOrbitSpin()
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
        const pair = twoFinger()
        if (!pair) return
        const free = !getRoomSnapshot().self.seatedFireId && getView().seat < LOCAL_AT
        if (free && pinchDist > 0) zoomBy(pinchDist / pair.dist)
        if (free && Number.isFinite(pinchAngle)) {
          let delta = pair.angle - pinchAngle
          if (delta > Math.PI) delta -= Math.PI * 2
          if (delta < -Math.PI) delta += Math.PI * 2
          twistOrbit((delta * 180) / Math.PI)
        }
        pinchDist = pair.dist
        pinchAngle = pair.angle
        stopOrbitSpin()
        noteDrag()
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
      const now = performance.now()
      const dt = Math.max(1 / 240, (now - lastMoveAt) / 1000)
      const seated = getView().seat >= LOCAL_AT
      const gain = seated ? 0.09 : 0.112
      // Orbit: grab the globe — drag down brings the north pole down; drag right
      // moves the surface right. Beside the fire, keep natural pitch/yaw.
      const dLat = seated ? -dy * gain : dy * gain
      const dLon = seated ? -dx * gain : dx * gain
      nudge(dLat, dLon)
      if (!seated && dt < 0.08) {
        // Blend so a flick reads as release speed, not one noisy sample.
        const sampleLat = dLat / dt
        const sampleLon = dLon / dt
        velLat = velLat * 0.35 + sampleLat * 0.65
        velLon = velLon * 0.35 + sampleLon * 0.65
      }
      lastMoveAt = now
      down.x = event.clientX
      down.y = event.clientY
      noteDrag()
    }

    const onUp = (event: PointerEvent) => {
      pinches.delete(event.pointerId)
      if (pinches.size < 2) {
        pinchDist = 0
        pinchAngle = Number.NaN
      }
      if (!down || event.pointerId !== down.pointerId) return
      if (holding && gesture.holdFireId) {
        const intensity = Math.max(0, Math.min(1, (performance.now() - gesture.holdStarted) / 1400))
        gesture.holdFireId = null
        if (intensity >= 0.08) send({ type: 'greet', intensity })
      } else if (!dragging && !getView().traveling && !getRoomSnapshot().self.seatedFireId) {
        const hit = pick(event.clientX, event.clientY)
        if (hit && hit.members.length > 0) approachCluster(hit.lat, hit.lon, hit.radiusKm, hit.members)
      } else if (dragging && getView().seat < LOCAL_AT && !getView().traveling) {
        const age = performance.now() - lastMoveAt
        if (age < 80) flingOrbit(velLat, velLon)
        else stopOrbitSpin()
      }
      down = null
      dragging = false
      holding = false
      velLat = 0
      velLon = 0
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    const onWheel = (event: WheelEvent) => {
      if (getRoomSnapshot().self.seatedFireId || getView().traveling) return
      event.preventDefault()
      stopOrbitSpin()
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
