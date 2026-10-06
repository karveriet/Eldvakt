import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LOCAL_AT } from '../geo/seat.ts'
import catalog from '../sky/bright-stars.json'
import { equatorial, gmstDegrees, skyRotation } from '../sky/place.ts'
import { getView } from './view-store.ts'

const ORBIT_RADIUS = 24
const BESIDE_RADIUS = 520

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  #include <clipping_planes_pars_vertex>
  attribute vec3 color;
  attribute float aPix;
  varying vec3 vColor;
  uniform float uHeight;
  uniform float uRadius;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    #include <clipping_planes_vertex>
    gl_PointSize = clamp(
      aPix * uRadius * uHeight * projectionMatrix[1][1] * 0.5 / max(-mvPosition.z, 1.0),
      1.0,
      6.5
    );
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`

const FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  #include <clipping_planes_pars_fragment>
  varying vec3 vColor;
  void main() {
    #include <clipping_planes_fragment>
    vec2 p = gl_PointCoord - vec2(0.5);
    float d = length(p);
    if (d > 0.5) discard;
    float body = smoothstep(0.5, 0.08, d);
    gl_FragColor = vec4(vColor, body);
    #include <logdepthbuf_fragment>
  }
`

const sky = createSky()

export function Stars() {
  const points = useRef<THREE.Points>(null)
  const gl = useThree((state) => state.gl)
  const horizon = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const drawn = useRef<boolean | null>(null)

  useFrame(() => {
    const mesh = points.current
    if (!mesh) return
    const material = mesh.material
    if (!(material instanceof THREE.ShaderMaterial)) return
    const view = getView()
    const local = view.seat >= LOCAL_AT
    const radius = local ? BESIDE_RADIUS : ORBIT_RADIUS
    const rotation = skyRotation(view.lat, view.lon, gmstDegrees(Date.now()), local)
    mesh.matrix.set(
      rotation[0] * radius, rotation[1] * radius, rotation[2] * radius, 0,
      rotation[3] * radius, rotation[4] * radius, rotation[5] * radius, 0,
      rotation[6] * radius, rotation[7] * radius, rotation[8] * radius, 0,
      0, 0, 0, 1,
    )
    mesh.matrixWorldNeedsUpdate = true
    material.uniforms.uHeight.value = gl.domElement.clientHeight * gl.getPixelRatio()
    material.uniforms.uRadius.value = radius
    if (drawn.current !== local) {
      material.clippingPlanes = local ? [horizon] : []
      material.needsUpdate = true
      drawn.current = local
    }
  })

  return (
    <points ref={points} geometry={sky.geometry} frustumCulled={false} matrixAutoUpdate={false}>
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={sky.uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function createSky() {
  const { ra, dec, mag, k } = catalog
  const count = ra.length
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const pixels = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const direction = equatorial(ra[i], dec[i])
    positions[i * 3] = direction.x
    positions[i * 3 + 1] = direction.y
    positions[i * 3 + 2] = direction.z
    const flux = Math.pow(10, -0.4 * (mag[i] + 1.46))
    const visual = Math.pow(flux, 0.42)
    const rgb = kelvin(k[i] > 1000 ? k[i] : 5800)
    colors[i * 3] = rgb[0] * (0.22 + 0.78 * visual)
    colors[i * 3 + 1] = rgb[1] * (0.22 + 0.78 * visual)
    colors[i * 3 + 2] = rgb[2] * (0.22 + 0.78 * visual)
    pixels[i] = 1.05 + 3.4 * visual
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aPix', new THREE.BufferAttribute(pixels, 1))
  return {
    geometry,
    uniforms: {
      uHeight: { value: 800 },
      uRadius: { value: ORBIT_RADIUS },
    },
  }
}

/** Tanner Helland black-body approximation, softened toward white. */
function kelvin(kelvinTemp: number): [number, number, number] {
  const t = Math.max(1000, Math.min(20000, kelvinTemp)) / 100
  let r: number
  let g: number
  let b: number
  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  } else {
    r = 329.698727446 * (t - 60) ** -0.1332047592
    g = 288.1221695283 * (t - 60) ** -0.0755148492
    b = 255
  }
  const mix = 0.35
  return [
    (clamp255(r) / 255) * (1 - mix) + mix,
    (clamp255(g) / 255) * (1 - mix) + mix,
    (clamp255(b) / 255) * (1 - mix) + mix,
  ]
}

function clamp255(channel: number) {
  return Math.max(0, Math.min(255, channel))
}
