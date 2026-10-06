import * as THREE from 'three'
import { companyScale, timeStrength, visualScale } from '../fire/rules.ts'
import { clusterByDistance, mergeDistanceKm } from '../fire/cluster.ts'
import { closeness } from '../fire/view-distance.ts'
import { assignFans, displayLatLon } from '../geo/display.ts'
import { latLonToVector } from '../geo/sphere.ts'
import { hearthAudio } from '../audio/hearth.ts'
import { getRoomSnapshot, serverNow } from '../net/room.ts'
import { gesture } from './gesture.ts'
import { getView } from './view-store.ts'
import type { ApproachMember } from './approach.ts'

export type PickTarget = {
  kind: 'flame' | 'glow'
  lat: number
  lon: number
  radiusKm: number
  members: ApproachMember[]
  position: THREE.Vector3
  radius: number
}

export const pickTargets: PickTarget[] = []

const FLAME_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float sway = sin(uTime * 2.3 + position.y * 6.0) * 0.05 * position.y * position.y;
    p.x += sway;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const FLAME_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float flicker = 0.9 + 0.1 * sin(uTime * 12.0 + vUv.y * 9.0);
    float n = sin(vUv.y * 16.0 - uTime * 5.5) * 0.05 + sin(vUv.y * 34.0 - uTime * 11.0) * 0.025;
    float width = mix(0.2, 0.035, pow(vUv.y, 0.72));
    float x = abs(vUv.x - 0.5 + n * vUv.y);
    float body = smoothstep(width, width * 0.2, x);
    float tip = smoothstep(1.0, 0.12, vUv.y);
    float base = smoothstep(0.0, 0.05, vUv.y);
    float alpha = body * tip * base * uStrength;
    vec3 ember = vec3(0.78, 0.18, 0.04);
    vec3 amber = vec3(1.0, 0.5, 0.08);
    vec3 gold = vec3(1.0, 0.84, 0.42);
    vec3 col = mix(ember, amber, smoothstep(0.0, 0.4, vUv.y));
    col = mix(col, gold, smoothstep(0.28, 0.9, vUv.y));
    float core = smoothstep(width * 0.45, 0.0, x) * smoothstep(0.75, 0.05, vUv.y);
    col = mix(col, vec3(1.0, 0.93, 0.72), core * 0.9);
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(col * flicker, alpha);
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

type FlameSlot = {
  pivot: THREE.Group
  uniforms: { uTime: { value: number }; uStrength: { value: number } }[]
  disc: THREE.Mesh
}

export class HearthLayer {
  private flames: FlameSlot[] = []
  private glows: THREE.Sprite[] = []
  private sparks: Spark[] = []
  private sparkGeo: THREE.BufferGeometry
  private sparkPoints: THREE.Points
  private positions: Float32Array
  private seenGreeting = 0
  private emberClock = 0
  private scratch = new THREE.Vector3()
  private normal = new THREE.Vector3()
  private tangent = new THREE.Vector3()
  private bitangent = new THREE.Vector3()

  constructor(parent: THREE.Group) {
    const glowTexture = radialTexture()
    for (let i = 0; i < 48; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color('#ffb15a'),
        }),
      )
      sprite.visible = false
      sprite.renderOrder = 2
      parent.add(sprite)
      this.glows.push(sprite)
    }

    const plane = new THREE.PlaneGeometry(1, 1)
    plane.translate(0, 0.5, 0)
    const discGeo = new THREE.CircleGeometry(1.35, 32)
    for (let i = 0; i < 16; i++) {
      const pivot = new THREE.Group()
      pivot.visible = false
      const uniforms: FlameSlot['uniforms'] = []
      for (let lobe = 0; lobe < 5; lobe++) {
        const uniform = { uTime: { value: 0 }, uStrength: { value: 1 } }
        const material = new THREE.ShaderMaterial({
          uniforms: uniform,
          vertexShader: FLAME_VERT,
          fragmentShader: FLAME_FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
        const mesh = new THREE.Mesh(plane, material)
        mesh.rotation.y = (lobe / 5) * Math.PI
        mesh.renderOrder = 3
        pivot.add(mesh)
        uniforms.push(uniform)
      }
      const disc = new THREE.Mesh(
        discGeo,
        new THREE.MeshBasicMaterial({
          map: glowTexture,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color('#e07020'),
        }),
      )
      disc.rotation.x = -Math.PI / 2
      disc.position.y = 0.004
      disc.renderOrder = 2
      pivot.add(disc)
      parent.add(pivot)
      this.flames.push({ pivot, uniforms, disc })
    }

    this.positions = new Float32Array(240 * 3)
    this.sparkGeo = new THREE.BufferGeometry()
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.sparkPoints = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({
        color: new THREE.Color('#ffd27a'),
        size: 0.045,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    )
    this.sparkPoints.renderOrder = 4
    parent.add(this.sparkPoints)
  }

  update(dt: number) {
    const view = getView()
    const room = getRoomSnapshot()
    const now = serverNow()
    const close = closeness(view.distance)
    const look = { lat: view.lat, lon: view.lon }
    const fans = assignFans(room.fires)
    const items = room.fires.map((fire) => ({
      ...fire,
      weight: visualScale(fire.seatedCount, fire, now),
      shown: displayLatLon(fire, look, view.distance, fans.get(fire.id) ?? 0),
    }))
    const clusters = clusterByDistance(items, mergeDistanceKm(view.distance))
    const flameOpacity = smooth(0.32, 0.68, close)
    const glowOpacity = 1 - smooth(0.28, 0.66, close)
    pickTargets.length = 0

    let loud = 0
    let loudFire: (typeof items)[number] | undefined
    if (view.focusId) loudFire = items.find((fire) => fire.id === view.focusId)
    if (!loudFire && close > 0.45) {
      loudFire = nearest(items, look)
    }
    if (loudFire && close > 0.4) {
      const body = companyScale(loudFire.seatedCount) / companyScale(1)
      loud = timeStrength(loudFire, now) * Math.min(1.35, body)
    }
    hearthAudio.setStrength(loud)
    hearthAudio.tick(dt)

    this.glows.forEach((sprite) => {
      sprite.visible = false
    })
    if (glowOpacity > 0.04) {
      clusters.forEach((cluster, index) => {
        const sprite = this.glows[index]
        if (!sprite) return
        const weight = cluster.items.reduce((sum, item) => sum + item.weight, 0) / cluster.items.length
        const position = latLonToVector(cluster.lat, cluster.lon, 1.012)
        sprite.position.set(position.x, position.y, position.z)
        const size = view.distance * (0.03 + 0.01 * Math.sqrt(cluster.items.length)) * (0.7 + weight)
        sprite.scale.setScalar(size)
        const material = sprite.material
        material.opacity = glowOpacity * (0.55 + Math.min(0.45, weight))
        sprite.visible = true
        this.scratch.set(position.x, position.y, position.z)
        pickTargets.push({
          kind: 'glow',
          lat: cluster.lat,
          lon: cluster.lon,
          radiusKm: cluster.radiusKm,
          members: cluster.items.map((item) => ({
            id: item.id,
            lat: item.lat,
            lon: item.lon,
            weight: item.weight,
          })),
          position: this.scratch.clone(),
          radius: size * 0.45,
        })
      })
    }

    this.flames.forEach((slot) => {
      slot.pivot.visible = false
    })
    if (flameOpacity > 0.04) {
      items.forEach((fire, index) => {
        const slot = this.flames[index]
        if (!slot) return
        const hero = view.focusId === fire.id
        const size = (hero ? 0.82 : 0.36) * Math.max(0.2, fire.weight)
        const position = latLonToVector(fire.shown.lat, fire.shown.lon, 1.004)
        this.normal.set(position.x, position.y, position.z).normalize()
        slot.pivot.position.copy(this.normal).multiplyScalar(1.004)
        slot.pivot.quaternion.setFromUnitVectors(UP, this.normal)
        slot.pivot.scale.setScalar(size)
        slot.pivot.visible = true
        const strength = flameOpacity * (0.75 + 0.25 * Math.min(1, fire.weight))
        for (const uniform of slot.uniforms) {
          uniform.uTime.value += dt * (hero ? 1 : 0.8)
          uniform.uStrength.value = strength
        }
        const discMaterial = slot.disc.material as THREE.MeshBasicMaterial
        discMaterial.opacity = 0.55 * flameOpacity
        pickTargets.push({
          kind: 'flame',
          lat: fire.lat,
          lon: fire.lon,
          radiusKm: 0,
          members: [{ id: fire.id, lat: fire.lat, lon: fire.lon, weight: fire.weight }],
          position: slot.pivot.position.clone(),
          radius: Math.max(0.22, size * 0.85),
        })
      })
    }

    this.spawnGreetings(items)
    this.trickle(items, dt)
    if (loudFire && flameOpacity > 0.2) {
      this.emberClock += dt * (0.4 + loud * 3)
      const shown = loudFire.shown
      const at = latLonToVector(shown.lat, shown.lon, 1.02)
      this.normal.set(at.x, at.y, at.z).normalize()
      while (this.emberClock > 1) {
        this.emberClock -= 1
        this.spawn(this.normal.clone().multiplyScalar(1.02), this.normal, 1, 0.12 + Math.random() * 0.08, 1.1)
      }
    }
    this.stepSparks(dt)
  }

  dispose() {
    for (const slot of this.flames) {
      slot.pivot.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.material.dispose()
        }
      })
    }
    for (const sprite of this.glows) sprite.material.dispose()
    this.sparkGeo.dispose()
    ;(this.sparkPoints.material as THREE.Material).dispose()
  }

  private spawnGreetings(items: { id: string; shown: { lat: number; lon: number } }[]) {
    const greetings = getRoomSnapshot().greetings
    for (const greeting of greetings) {
      if (greeting.id <= this.seenGreeting) continue
      this.seenGreeting = greeting.id
      const fire = items.find((item) => item.id === greeting.fireId)
      if (!fire) continue
      const at = latLonToVector(fire.shown.lat, fire.shown.lon, 1.03)
      this.normal.set(at.x, at.y, at.z).normalize()
      const count = Math.round(8 + greeting.intensity * 40)
      this.spawn(this.normal.clone().multiplyScalar(1.03), this.normal, count, 0.25 + greeting.intensity * 0.45, 0.7 + greeting.intensity * 0.6)
    }
  }

  private trickle(items: { id: string; shown: { lat: number; lon: number } }[], dt: number) {
    if (!gesture.holdFireId) return
    const fire = items.find((item) => item.id === gesture.holdFireId)
    if (!fire) return
    const held = (performance.now() - gesture.holdStarted) / 1400
    const count = Math.max(1, Math.round(dt * (10 + held * 28)))
    const at = latLonToVector(fire.shown.lat, fire.shown.lon, 1.03)
    this.normal.set(at.x, at.y, at.z).normalize()
    this.spawn(this.normal.clone().multiplyScalar(1.04), this.normal, count, 0.18 + held * 0.35, 0.55)
  }

  private spawn(origin: THREE.Vector3, up: THREE.Vector3, count: number, speed: number, life: number) {
    if (Math.abs(up.dot(UP)) > 0.92) this.tangent.set(1, 0, 0)
    else this.tangent.crossVectors(UP, up).normalize()
    this.bitangent.crossVectors(up, this.tangent).normalize()
    for (let i = 0; i < count; i++) {
      if (this.sparks.length > 220) this.sparks.shift()
      const spread = (Math.random() - 0.5) * speed
      const spread2 = (Math.random() - 0.5) * speed
      this.sparks.push({
        x: origin.x + this.tangent.x * spread * 0.05,
        y: origin.y + this.tangent.y * spread * 0.05,
        z: origin.z + this.tangent.z * spread * 0.05,
        vx: up.x * speed + this.tangent.x * spread + this.bitangent.x * spread2,
        vy: up.y * speed + this.tangent.y * spread + this.bitangent.y * spread2,
        vz: up.z * speed + this.tangent.z * spread + this.bitangent.z * spread2,
        life: life * (0.7 + Math.random() * 0.5),
        age: 0,
      })
    }
  }

  private stepSparks(dt: number) {
    const next: Spark[] = []
    for (const spark of this.sparks) {
      spark.age += dt
      if (spark.age >= spark.life) continue
      spark.x += spark.vx * dt
      spark.y += spark.vy * dt
      spark.z += spark.vz * dt
      spark.vx *= 0.98
      spark.vy *= 0.98
      spark.vz *= 0.98
      next.push(spark)
    }
    this.sparks = next
    const count = Math.min(next.length, 240)
    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = next[i].x
      this.positions[i * 3 + 1] = next[i].y
      this.positions[i * 3 + 2] = next[i].z
    }
    this.sparkGeo.setDrawRange(0, count)
    this.sparkGeo.attributes.position.needsUpdate = true
  }
}

const UP = new THREE.Vector3(0, 1, 0)

function nearest<T extends { lat: number; lon: number }>(items: T[], look: { lat: number; lon: number }) {
  let best: T | undefined
  let bestD = Infinity
  for (const item of items) {
    const d = (item.lat - look.lat) ** 2 + (item.lon - look.lon) ** 2
    if (d < bestD) {
      bestD = d
      best = item
    }
  }
  return best
}

function smooth(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function radialTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw a glow')
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  glow.addColorStop(0, 'rgba(255, 236, 196, 1)')
  glow.addColorStop(0.18, 'rgba(255, 176, 64, 0.9)')
  glow.addColorStop(0.45, 'rgba(190, 70, 12, 0.35)')
  glow.addColorStop(1, 'rgba(80, 20, 0, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
