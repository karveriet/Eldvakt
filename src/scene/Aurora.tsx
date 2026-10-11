import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LOCAL_AT } from '../geo/seat.ts'
import { getView } from './view-store.ts'

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`

const FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uFade;
  varying vec3 vDir;
  void main() {
    #include <logdepthbuf_fragment>
    // Soft curtains above the limb — green/teal with a faint rose edge.
    float elev = vDir.y;
    float band = smoothstep(-0.15, 0.55, elev) * (1.0 - smoothstep(0.72, 0.98, elev));
    float lon = atan(vDir.z, vDir.x);
    float wave =
      0.55 +
      0.45 * sin(lon * 3.1 + uTime * 0.17 + elev * 4.0) *
      sin(lon * 1.4 - uTime * 0.11 + elev * 2.2);
    float sheets = pow(max(wave, 0.0), 2.4) * band;
    float veil = pow(max(0.0, elev + 0.08), 1.35) * 0.22;
    vec3 green = vec3(0.18, 0.72, 0.42);
    vec3 teal = vec3(0.10, 0.42, 0.55);
    vec3 rose = vec3(0.55, 0.22, 0.38);
    float mixT = smoothstep(0.15, 0.75, elev + 0.2 * sin(lon * 2.0 + uTime * 0.08));
    vec3 col = mix(green, teal, mixT);
    col = mix(col, rose, smoothstep(0.55, 0.9, elev) * 0.35);
    float alpha = (sheets * 0.38 + veil * 0.55) * uFade;
    gl_FragColor = vec4(col * alpha, alpha);
  }
`

/** Distant aurora wash so the dark globe reads against space. */
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
    <mesh ref={mesh} material={material} frustumCulled={false}>
      <sphereGeometry args={[18, 64, 48]} />
    </mesh>
  )
}
