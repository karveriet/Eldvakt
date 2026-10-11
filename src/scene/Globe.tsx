import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LOCAL_AT } from '../geo/seat.ts'
import { getView } from './view-store.ts'
import { createLandTexture } from './land-texture.ts'
import { globeSeat } from './globe-seat.ts'

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`

const FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uLand;
  uniform float uSeat;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    #include <logdepthbuf_fragment>
    float land = texture2D(uLand, vUv).r;
    // Lifted so the night globe still reads on a phone against space.
    vec3 ocean = vec3(0.028, 0.040, 0.058);
    vec3 earth = vec3(0.11, 0.090, 0.068);
    float coast = smoothstep(0.2, 0.8, land);
    vec3 col = mix(ocean, earth, coast);
    float shade = 0.006 * sin(vUv.x * 70.0 + vUv.y * 36.0);
    col += shade * coast;
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.4);
    col += vec3(0.16, 0.22, 0.18) * fres * 0.22 * (1.0 - uSeat);
    col += vec3(0.22, 0.10, 0.04) * fres * 0.18 * (1.0 - uSeat);
    gl_FragColor = vec4(col, 1.0);
  }
`

export function Globe() {
  const root = useRef<THREE.Group>(null)
  const texture = useMemo(() => createLandTexture(), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uLand: { value: texture }, uSeat: globeSeat },
        vertexShader: VERT,
        fragmentShader: FRAG,
      }),
    [texture],
  )

  useFrame(() => {
    if (root.current) root.current.visible = getView().seat < LOCAL_AT
  })

  return (
    <group ref={root}>
      {/* Dense enough that the limb stays round from orbit down to a few meters. */}
      <mesh material={material}>
        <sphereGeometry args={[1, 192, 128]} />
      </mesh>
    </group>
  )
}
