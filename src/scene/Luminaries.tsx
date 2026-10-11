import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LOCAL_AT } from '../geo/seat.ts'
import {
  bodyDirection,
  moonElongationDeg,
  moonEquatorial,
  sunEquatorial,
} from '../sky/bodies.ts'
import { gmstDegrees, skyRotation } from '../sky/place.ts'
import { getView } from './view-store.ts'

const ORBIT_RADIUS = 24
const BESIDE_RADIUS = 520

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  #include <clipping_planes_pars_vertex>
  varying vec2 vUv;
  varying float vKind;
  varying float vPhase;
  uniform float uKind;
  uniform float uPhase;
  void main() {
    vUv = uv;
    vKind = uKind;
    vPhase = uPhase;
    // Billboard toward the camera while sitting on the sky sphere.
    vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = center + camRight * position.x + camUp * position.y;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    #include <clipping_planes_vertex>
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`

const FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  #include <clipping_planes_pars_fragment>
  varying vec2 vUv;
  varying float vKind;
  varying float vPhase;
  void main() {
    #include <clipping_planes_fragment>
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;

    // Soft night discs — warm, never daylight-bright.
    if (vKind < 0.5) {
      float core = smoothstep(0.55, 0.0, r);
      float halo = smoothstep(1.0, 0.2, r) * 0.45;
      vec3 gold = vec3(0.95, 0.72, 0.38);
      vec3 ember = vec3(0.72, 0.32, 0.12);
      vec3 col = mix(ember, gold, core);
      float alpha = (core * 0.85 + halo * 0.55) * 0.72;
      gl_FragColor = vec4(col * alpha, alpha);
    } else {
      // Phase: lit from the right in billboard space; amount from elongation.
      float lit = smoothstep(-0.15, 0.15, p.x - (1.0 - 2.0 * vPhase));
      float body = smoothstep(0.92, 0.35, r);
      float rim = smoothstep(1.0, 0.55, r) * 0.25;
      vec3 bright = vec3(0.78, 0.72, 0.58);
      vec3 shade = vec3(0.12, 0.11, 0.14);
      vec3 col = mix(shade, bright, lit);
      float alpha = (body * 0.7 + rim) * 0.8;
      gl_FragColor = vec4(col * alpha, alpha);
    }
    #include <logdepthbuf_fragment>
  }
`

type BodyMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>

/** Sun and moon in the same sky frame as the Yale catalog stars. */
export function Luminaries() {
  const group = useRef<THREE.Group>(null)
  const sun = useRef<BodyMesh>(null)
  const moon = useRef<BodyMesh>(null)
  const horizon = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const drawn = useRef<boolean | null>(null)

  const sunMat = useMemo(() => makeMaterial(0, 1), [])
  const moonMat = useMemo(() => makeMaterial(1, 0.5), [])

  useFrame(() => {
    const root = group.current
    if (!root || !sun.current || !moon.current) return
    const view = getView()
    const local = view.seat >= LOCAL_AT
    const radius = local ? BESIDE_RADIUS : ORBIT_RADIUS
    const now = Date.now()
    const rotation = skyRotation(view.lat, view.lon, gmstDegrees(now), local)
    root.matrix.set(
      rotation[0] * radius, rotation[1] * radius, rotation[2] * radius, 0,
      rotation[3] * radius, rotation[4] * radius, rotation[5] * radius, 0,
      rotation[6] * radius, rotation[7] * radius, rotation[8] * radius, 0,
      0, 0, 0, 1,
    )
    root.matrixWorldNeedsUpdate = true

    const sunDir = bodyDirection(sunEquatorial(now))
    const moonDir = bodyDirection(moonEquatorial(now))
    sun.current.position.set(sunDir.x, sunDir.y, sunDir.z)
    moon.current.position.set(moonDir.x, moonDir.y, moonDir.z)

    // Angular size ~0.5° → half-angle scale on the unit sphere, nudged up for night readability.
    const scale = local ? 0.014 : 0.018
    sun.current.scale.setScalar(scale)
    moon.current.scale.setScalar(scale * 0.95)

    const elong = moonElongationDeg(now)
    moonMat.uniforms.uPhase.value = (1 - Math.cos((elong * Math.PI) / 180)) / 2

    if (drawn.current !== local) {
      const planes = local ? [horizon] : []
      sunMat.clippingPlanes = planes
      moonMat.clippingPlanes = planes
      sunMat.needsUpdate = true
      moonMat.needsUpdate = true
      drawn.current = local
    }
  })

  return (
    <group ref={group} frustumCulled={false} matrixAutoUpdate={false}>
      <mesh ref={sun} material={sunMat} frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <mesh ref={moon} material={moonMat} frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </group>
  )
}

function makeMaterial(kind: number, phase: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uKind: { value: kind },
      uPhase: { value: phase },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    clipping: true,
  })
}
