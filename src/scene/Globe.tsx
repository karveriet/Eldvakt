import { useMemo } from 'react'
import * as THREE from 'three'
import { createLandTexture } from './land-texture.ts'

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const FRAG = /* glsl */ `
  uniform sampler2D uLand;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    float land = texture2D(uLand, vUv).r;
    vec3 ocean = vec3(0.012, 0.014, 0.020);
    vec3 earth = vec3(0.058, 0.050, 0.042);
    float coast = smoothstep(0.15, 0.85, land);
    vec3 col = mix(ocean, earth, coast);
    float shade = 0.006 * sin(vUv.x * 90.0 + vUv.y * 40.0);
    col += shade;
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.4);
    col += vec3(0.32, 0.14, 0.05) * fres * 0.55;
    gl_FragColor = vec4(col, 1.0);
  }
`

const AIR_FRAG = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 3.0);
    gl_FragColor = vec4(0.62, 0.28, 0.08, fres * 0.45);
  }
`

export function Globe() {
  const texture = useMemo(() => createLandTexture(), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uLand: { value: texture } },
        vertexShader: VERT,
        fragmentShader: FRAG,
      }),
    [texture],
  )
  const air = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: AIR_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    [],
  )

  return (
    <group>
      <mesh material={material}>
        <sphereGeometry args={[1, 128, 96]} />
      </mesh>
      <mesh material={air} scale={1.045}>
        <sphereGeometry args={[1, 64, 48]} />
      </mesh>
    </group>
  )
}
