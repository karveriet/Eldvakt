import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LOCAL_AT, intimateMeters, orbitApproach } from '../geo/seat.ts'
import { globeSeat } from './globe-seat.ts'
import { getView } from './view-store.ts'

const look = new THREE.Vector3()
const eye = new THREE.Vector3()
const dir = new THREE.Vector3()
const right = new THREE.Vector3()
const up = new THREE.Vector3()
const radialUp = new THREE.Vector3()
const worldUp = new THREE.Vector3(0, 1, 0)

export function CameraRig() {
  const camera = useThree((state) => state.camera)
  useFrame(() => {
    const view = getView()
    const intimate = intimateMeters(view.seat)
    if (intimate.local) {
      placeBeside(camera, intimate.back, intimate.eye, view.yaw, view.pitch)
      fit(camera, 0.05, 800)
      globeSeat.value = 1
      return
    }
    const position = orbitApproach(view.lat, view.lon, view.distance, view.seat)
    const radial = orbitApproach(view.lat, view.lon, 1, 0)
    const u = Math.min(1, view.seat / LOCAL_AT)
    camera.position.set(position.x, position.y, position.z)
    const toward = 0.22 + 0.74 * u
    look.set(radial.x * toward, radial.y * toward, radial.z * toward)
    radialUp.set(radial.x, radial.y, radial.z)
    up.copy(worldUp).lerp(radialUp, u)
    if (up.lengthSq() < 1e-6) up.set(0, 1, 0)
    camera.up.copy(up.normalize())
    camera.lookAt(look)
    fit(camera, 0.05, 80)
    globeSeat.value = u
  })
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
  dir.set(0, 0.42 - eyeHeight, -back)
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
