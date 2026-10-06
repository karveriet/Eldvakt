import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LOCAL_AT } from '../geo/seat.ts'
import { getView } from './view-store.ts'

const stars = createStars()

export function Stars() {
  const points = useRef<THREE.Points>(null)
  useFrame(() => {
    const local = getView().seat >= LOCAL_AT
    const mesh = points.current
    if (!mesh) return
    mesh.scale.setScalar(local ? 8 : 1)
    const material = mesh.material
    if (material instanceof THREE.PointsMaterial) material.size = local ? 1.6 : 0.07
  })
  return (
    <points ref={points} geometry={stars}>
      <pointsMaterial
        color="#ffe2ad"
        size={0.07}
        sizeAttenuation
        transparent
        opacity={0.95}
        depthWrite={false}
      />
    </points>
  )
}

function createStars() {
  const count = 1600
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const radius = 18 + Math.random() * 14
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.cos(phi)
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geometry
}
