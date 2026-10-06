import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { visualScale } from '../fire/rules.ts'
import { LOCAL_AT } from '../geo/seat.ts'
import { pointInLand } from '../geo/land.ts'
import { serverNow, getRoomSnapshot } from '../net/room.ts'
import { gesture } from './gesture.ts'
import { pickTargets } from './hearth-layer.ts'
import { FLAME_FRAG, FLAME_VERT } from './flame-shader.ts'
import { getView } from './view-store.ts'

const GROUND_FRAG = /* glsl */ `
  precision highp float;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uEarth;
  varying vec2 vUv;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float meters = r * 400.0;
    float pool = exp(-meters * meters / 70.0);
    float wash = exp(-meters / 28.0);
    vec3 col = uEarth + vec3(0.72, 0.28, 0.06) * pool + vec3(0.16, 0.05, 0.015) * wash;
    float fade = 1.0 - smoothstep(0.78, 1.0, r);
    gl_FragColor = vec4(col, fade);
  }
`

const earthUniform = { value: new THREE.Color('#2c241c') }
const sparkPositions = new Float32Array(180 * 3)

const GROUND_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`

type Spark = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  age: number
}

export function Beside() {
  const root = useRef<THREE.Group>(null)
  const pivot = useRef<THREE.Group>(null)
  const uniforms = useRef<{ uTime: { value: number }; uStrength: { value: number } }[]>([])
  const sparks = useRef<Spark[]>([])
  const points = useRef<THREE.Points>(null)
  const clock = useRef(0)
  const landFor = useRef<string | null>(null)
  const held = useRef<{ id: string; lat: number; lon: number; weight: number } | null>(null)
  const scratch = useRef(new THREE.Vector3())

  useLayoutEffect(() => {
    const group = pivot.current
    if (!group) return
    const plane = new THREE.PlaneGeometry(1, 1.15)
    plane.translate(0, 0.5, 0)
    const made: { uTime: { value: number }; uStrength: { value: number } }[] = []
    for (let lobe = 0; lobe < 5; lobe++) {
      const uniform = { uTime: { value: 0 }, uStrength: { value: 1 } }
      const mesh = new THREE.Mesh(
        plane,
        new THREE.ShaderMaterial({
          uniforms: uniform,
          vertexShader: FLAME_VERT,
          fragmentShader: FLAME_FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      )
      mesh.rotation.y = (lobe / 5) * Math.PI
      mesh.renderOrder = 3
      group.add(mesh)
      made.push(uniform)
    }
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#e07020'),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    disc.rotation.x = -Math.PI / 2
    disc.position.y = 0.02
    disc.renderOrder = 2
    group.add(disc)
    uniforms.current = made
    return () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const material = obj.material
          if (Array.isArray(material)) material.forEach((item) => item.dispose())
          else material.dispose()
        }
      })
      group.clear()
    }
  }, [])

  useFrame((_, dt) => {
    const rootGroup = root.current
    const flame = pivot.current
    if (!rootGroup || !flame) return
    const view = getView()
    const local = view.seat >= LOCAL_AT
    rootGroup.visible = local
    const room = getRoomSnapshot()
    const now = serverNow()
    const live = room.fires.find((fire) => fire.id === view.focusId)
    if (live) {
      held.current = {
        id: live.id,
        lat: live.lat,
        lon: live.lon,
        weight: visualScale(live.seatedCount, live, now),
      }
      if (landFor.current !== live.id) {
        landFor.current = live.id
        earthUniform.value.set(pointInLand(live.lon, live.lat) ? '#2c241c' : '#12161c')
      }
    }
    if (!local) return
    const weight = held.current?.weight ?? 0.8
    const height = 0.72 + 0.5 * Math.min(1.35, weight)
    flame.scale.setScalar(height)
    advanceFlame(uniforms.current, dt, 0.85 + 0.35 * Math.min(1, weight))
    const focus = held.current
    if (focus) {
      scratch.current.set(0, height * 0.45, 0)
      pickTargets.push({
        kind: 'flame',
        lat: focus.lat,
        lon: focus.lon,
        radiusKm: 0,
        members: [{ id: focus.id, lat: focus.lat, lon: focus.lon, weight }],
        position: scratch.current.clone(),
        radius: Math.max(0.8, height * 0.9),
      })
    }
    clock.current += dt * (0.7 + weight)
    const greeting = gesture.holdFireId && gesture.holdFireId === focus?.id
    while (clock.current > 1) {
      clock.current -= 1
      burst(sparks.current, 1, 1.4, 1.3)
    }
    if (greeting) {
      const heldFor = (performance.now() - gesture.holdStarted) / 1400
      const count = Math.max(1, Math.round(dt * (8 + heldFor * 22)))
      burst(sparks.current, count, 1.1 + heldFor * 2.4, 0.8 + heldFor * 0.5)
    }
    stepSparks(sparks.current, sparkPositions, points.current, dt)
  })

  return (
    <group ref={root} visible={false}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} renderOrder={1}>
        <circleGeometry args={[400, 72]} />
        <shaderMaterial
          vertexShader={GROUND_VERT}
          fragmentShader={GROUND_FRAG}
          uniforms={{ uEarth: earthUniform }}
          transparent
          depthWrite={false}
        />
      </mesh>
      <group ref={pivot} />
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[sparkPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffd27a"
          size={0.045}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  )
}

function advanceFlame(
  uniforms: { uTime: { value: number }; uStrength: { value: number } }[],
  dt: number,
  strength: number,
) {
  for (const uniform of uniforms) {
    uniform.uTime.value += dt
    uniform.uStrength.value = strength
  }
}

function burst(list: Spark[], count: number, speed: number, life: number) {
  for (let i = 0; i < count; i++) {
    if (list.length > 160) list.shift()
    const angle = Math.random() * Math.PI * 2
    const spread = Math.random() * 0.35
    list.push({
      x: Math.cos(angle) * 0.12,
      y: 0.25 + Math.random() * 0.2,
      z: Math.sin(angle) * 0.12,
      vx: Math.cos(angle) * spread,
      vy: speed * (0.65 + Math.random() * 0.7),
      vz: Math.sin(angle) * spread,
      life: life * (0.7 + Math.random() * 0.5),
      age: 0,
    })
  }
}

function stepSparks(
  list: Spark[],
  positions: Float32Array,
  points: THREE.Points | null,
  dt: number,
) {
  const next: Spark[] = []
  for (const spark of list) {
    spark.age += dt
    if (spark.age >= spark.life) continue
    spark.x += spark.vx * dt
    spark.y += spark.vy * dt
    spark.z += spark.vz * dt
    spark.vx *= 0.985
    spark.vy *= 0.99
    spark.vz *= 0.985
    next.push(spark)
  }
  list.length = 0
  list.push(...next)
  const count = Math.min(next.length, 180)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = next[i].x
    positions[i * 3 + 1] = next[i].y
    positions[i * 3 + 2] = next[i].z
  }
  const geometry = points?.geometry
  if (!geometry) return
  geometry.setDrawRange(0, count)
  geometry.attributes.position.needsUpdate = true
}
