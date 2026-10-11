import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  altitudeAboveSurface,
  VIEW_REBASE_ALT,
} from '../fire/view-distance.ts'
import { LOCAL_AT, SIT_LOOK_M, intimateMeters, orbitApproach } from '../geo/seat.ts'
import { globeSeat } from './globe-seat.ts'
import { getView } from './view-store.ts'
import { worldFrameOffset } from './world-frame.ts'

const look = new THREE.Vector3()
const eye = new THREE.Vector3()
const dir = new THREE.Vector3()
const right = new THREE.Vector3()
const up = new THREE.Vector3()
const radialUp = new THREE.Vector3()
const worldUp = new THREE.Vector3(0, 1, 0)
const camPos = new THREE.Vector3()

export function CameraRig() {
  const camera = useThree((state) => state.camera)
  // Priority -2: place camera / world offset before other scene ticks.
  useFrame(() => {
    const view = getView()
    const intimate = intimateMeters(view.seat)
    if (intimate.local) {
      // Beside-fire uses its own meter frame; keep the planet unshifted.
      worldFrameOffset.set(0, 0, 0)
      placeBeside(camera, intimate.back, intimate.eye, view.yaw, view.pitch)
      fit(camera, 0.05, 800)
      globeSeat.value = 1
      return
    }
    const position = orbitApproach(view.lat, view.lon, view.distance, view.seat)
    const radial = orbitApproach(view.lat, view.lon, 1, 0)
    const u = Math.min(1, view.seat / LOCAL_AT)
    camPos.set(position.x, position.y, position.z)
    const alt = altitudeAboveSurface(camPos.length())
    // Far out: look past the limb. Close in: look at the surface underfoot.
    const toward =
      u > 0 ? 0.22 + 0.74 * u : Math.min(0.999999, Math.max(0.22, 1 - Math.min(alt, 2) * 0.35))
    look.set(radial.x * toward, radial.y * toward, radial.z * toward)
    radialUp.set(radial.x, radial.y, radial.z)
    // Prefer the grab/coast frame so a pole-crossing flick does not twist
    // (world-north snap is what made the spin look like it reversed).
    if (view.orbitUp && u < 0.001) {
      up.set(view.orbitUp.x, view.orbitUp.y, view.orbitUp.z)
    } else {
      up.copy(worldUp)
      const align = Math.abs(radialUp.dot(worldUp))
      if (align > 0.96) up.copy(camera.up)
    }
    up.addScaledVector(radialUp, -up.dot(radialUp))
    if (up.lengthSq() < 1e-8) up.set(radial.z, 0, -radial.x)
    up.normalize()
    if (u > 0) up.lerp(radialUp, u).normalize()

    // Meter-scale height: slide the planet group under a camera parked at the
    // origin. Never translate the scene root — the camera lives there too.
    const rebase = alt < VIEW_REBASE_ALT
    if (rebase) {
      worldFrameOffset.set(-camPos.x, -camPos.y, -camPos.z)
      camera.position.set(0, 0, 0)
      camera.up.copy(up)
      camera.lookAt(look.x - camPos.x, look.y - camPos.y, look.z - camPos.z)
    } else {
      worldFrameOffset.set(0, 0, 0)
      camera.position.copy(camPos)
      camera.up.copy(up)
      camera.lookAt(look)
    }

    // Near plane tracks altitude so the surface never clips or flickers.
    const near = Math.min(0.05, Math.max(alt * 0.15, alt * 0.05, 1e-12))
    const far = Math.max(80, alt * 200 + 40)
    fit(camera, near, far)
    globeSeat.value = u
  }, -2)
  return null
}

function placeBeside(
  camera: THREE.Camera,
  back: number,
  eyeHeight: number,
  yawDeg: number,
  pitchDeg: number,
) {
  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  eye.set(0, eyeHeight, back)
  camera.position.copy(eye)
  camera.up.copy(worldUp)
  dir.set(0, SIT_LOOK_M - eyeHeight, -back)
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1)
  dir.normalize()
  dir.applyAxisAngle(worldUp, yaw)
  right.crossVectors(dir, worldUp)
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
  right.normalize()
  dir.applyAxisAngle(right, -pitch)
  camera.lookAt(eye.x + dir.x, eye.y + dir.y, eye.z + dir.z)
}

function fit(camera: THREE.Camera, near: number, far: number) {
  if (!(camera instanceof THREE.PerspectiveCamera)) return
  if (camera.near === near && camera.far === far) return
  camera.near = near
  camera.far = far
  camera.updateProjectionMatrix()
}
