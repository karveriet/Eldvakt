import * as THREE from 'three'

const stars = createStars()

export function Stars() {
  return (
    <points geometry={stars}>
      <pointsMaterial
        color="#ffe2ad"
        size={0.045}
        sizeAttenuation
        transparent
        opacity={0.85}
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
