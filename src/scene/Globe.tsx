import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LOCAL_AT } from '../geo/seat.ts'
import { getView } from './view-store.ts'
import { createLandTexture } from './land-texture.ts'
import { globeSeat } from './globe-seat.ts'

/**
 * Bounding shell + analytic unit-sphere hit.
 * Limb stays round at every altitude — no faceted mesh up close.
 * Sphere center follows the group (scene rebase when skimming the ground).
 */
const VERT = /* glsl */ `
  #include <common>
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const FRAG = /* glsl */ `
  #include <common>
  #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
    uniform float logDepthBufFC;
  #endif
  uniform sampler2D uLand;
  uniform float uSeat;
  uniform vec3 uCenter;
  varying vec3 vWorld;

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - cameraPosition);
    vec3 oc = ro - uCenter;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - 1.0;
    float h = b * b - c;
    if (h < 0.0) discard;
    float t = -b - sqrt(h);
    if (t < 1e-6) {
      t = -b + sqrt(h);
      if (t < 1e-6) discard;
    }
    vec3 p = ro + rd * t;
    vec3 n = normalize(p - uCenter);

    float lon = atan(n.x, n.z);
    float lat = asin(clamp(n.y, -1.0, 1.0));
    vec2 uv = vec2(lon / (2.0 * 3.14159265) + 0.5, 0.5 - lat / 3.14159265);
    float land = texture2D(uLand, uv).r;

    vec3 ocean = vec3(0.028, 0.040, 0.058);
    vec3 earth = vec3(0.11, 0.090, 0.068);
    float coast = smoothstep(0.2, 0.8, land);
    vec3 col = mix(ocean, earth, coast);
    float shade = 0.006 * sin(uv.x * 70.0 + uv.y * 36.0);
    col += shade * coast;

    vec3 viewDir = normalize(cameraPosition - p);
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 2.4);
    col += vec3(0.16, 0.22, 0.18) * fres * 0.22 * (1.0 - uSeat);
    col += vec3(0.22, 0.10, 0.04) * fres * 0.18 * (1.0 - uSeat);

    vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
    #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
      gl_FragDepth = log2(max(1e-6, 1.0 + clip.w)) * logDepthBufFC * 0.5;
    #else
      gl_FragDepth = (clip.z / clip.w) * 0.5 + 0.5;
    #endif

    gl_FragColor = vec4(col, 1.0);
  }
`

export function Globe() {
  const root = useRef<THREE.Group>(null)
  const center = useRef(new THREE.Vector3())
  const texture = useMemo(() => createLandTexture(), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uLand: { value: texture },
          uSeat: globeSeat,
          uCenter: { value: new THREE.Vector3() },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.DoubleSide,
      }),
    [texture],
  )

  useFrame(() => {
    const group = root.current
    if (!group) return
    group.visible = getView().seat < LOCAL_AT
    group.getWorldPosition(center.current)
    material.uniforms.uCenter.value.copy(center.current)
  })

  return (
    <group ref={root}>
      <mesh material={material}>
        <sphereGeometry args={[1.08, 64, 48]} />
      </mesh>
    </group>
  )
}
