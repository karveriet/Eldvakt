import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LOCAL_AT } from '../geo/seat.ts'
import { getView } from './view-store.ts'

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
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
  uniform float uFade;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vDir;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.35);

    // Aurora curtains wander through the atmosphere shell (no outer dome).
    float elev = vDir.y;
    float band = smoothstep(-0.55, 0.15, elev) * (1.0 - smoothstep(0.45, 0.92, elev));
    float wander =
      0.5 +
      0.5 * sin(vDir.x * 4.2 + uTime * 0.31 + elev * 5.0) *
      sin(vDir.z * 3.3 - uTime * 0.22 + elev * 2.6 + vDir.x * 1.1);
    float drift = 0.5 + 0.5 * sin(vDir.x * 1.7 + vDir.z * 2.1 + uTime * 0.09);
    float sheets = pow(max(wander * (0.65 + 0.35 * drift), 0.0), 1.45) * band;

    vec3 green = vec3(0.20, 0.95, 0.48);
    vec3 teal = vec3(0.14, 0.58, 0.78);
    vec3 rose = vec3(0.58, 0.26, 0.40);
    vec3 warm = vec3(0.48, 0.22, 0.08);
    float mixT = smoothstep(-0.1, 0.65, elev + 0.15 * sin(uTime * 0.07 + vDir.x * 2.0));
    vec3 aurora = mix(green, teal, mixT);
    aurora = mix(aurora, rose, smoothstep(0.35, 0.8, elev) * 0.35 * drift);

    float air = fres * 0.28;
    float glow = fres * sheets * 0.95;
    vec3 col = warm * air + aurora * (glow + fres * 0.12 * band);
    float alpha = (air + glow) * uFade;
    gl_FragColor = vec4(col, alpha);
  }
`

/** Atmosphere shell with a wandering aurora — orbit only. */
export function Aurora() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uFade: { value: 1 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    [],
  )
  const mesh = useRef<THREE.Mesh>(null)

  useFrame((_, dt) => {
    const view = getView()
    const fade = view.seat >= LOCAL_AT ? 0 : 1 - Math.min(1, view.seat / LOCAL_AT)
    material.uniforms.uTime.value += dt
    material.uniforms.uFade.value = fade
    if (mesh.current) mesh.current.visible = fade > 0.02
  })

  return (
    <mesh ref={mesh} material={material} scale={1.055} frustumCulled={false}>
      <sphereGeometry args={[1, 96, 72]} />
    </mesh>
  )
}
