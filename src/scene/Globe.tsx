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
    // Slightly lifted so the night globe still reads on a phone against space.
    vec3 ocean = vec3(0.018, 0.028, 0.042);
    vec3 earth = vec3(0.082, 0.068, 0.052);
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

const AIR_FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uSeat;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.8);
    vec3 rim = mix(vec3(0.20, 0.55, 0.42), vec3(0.48, 0.22, 0.08), 0.45);
    gl_FragColor = vec4(rim, fres * 0.32 * (1.0 - uSeat));
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
  const air = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uSeat: globeSeat },
        vertexShader: VERT,
        fragmentShader: AIR_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    [],
  )

  useFrame(() => {
    if (root.current) root.current.visible = getView().seat < LOCAL_AT
  })

  return (
    <group ref={root}>
      <mesh material={material}>
        <sphereGeometry args={[1, 128, 96]} />
      </mesh>
      <mesh material={air} scale={1.045}>
        <sphereGeometry args={[1, 64, 48]} />
      </mesh>
    </group>
  )
}
