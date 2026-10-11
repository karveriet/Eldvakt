import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LOCAL_AT } from '../geo/seat.ts'
import { getView } from './view-store.ts'

const DOME_VERT = /* glsl */ `
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

const DOME_FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uFade;
  varying vec3 vDir;
  void main() {
    #include <logdepthbuf_fragment>
    float elev = vDir.y;
    float band = smoothstep(-0.35, 0.25, elev) * (1.0 - smoothstep(0.55, 0.95, elev));
    float lon = atan(vDir.z, vDir.x);
    float wave =
      0.5 +
      0.5 * sin(lon * 2.6 + uTime * 0.21 + elev * 3.4) *
      sin(lon * 1.15 - uTime * 0.13 + elev * 1.8);
    float sheets = pow(max(wave, 0.0), 1.55) * band;
    float veil = pow(max(0.0, elev + 0.25), 1.1) * 0.55;
    vec3 green = vec3(0.22, 0.95, 0.48);
    vec3 teal = vec3(0.12, 0.55, 0.72);
    vec3 rose = vec3(0.62, 0.28, 0.42);
    float mixT = smoothstep(0.0, 0.7, elev + 0.15 * sin(lon * 2.0 + uTime * 0.09));
    vec3 col = mix(green, teal, mixT);
    col = mix(col, rose, smoothstep(0.4, 0.85, elev) * 0.4);
    float alpha = (sheets * 0.85 + veil * 0.7) * uFade;
    gl_FragColor = vec4(col * alpha, alpha);
  }
`

const HALO_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`

const HALO_FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uFade;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.1);
    float pulse = 0.85 + 0.15 * sin(uTime * 0.35);
    vec3 col = mix(vec3(0.15, 0.72, 0.55), vec3(0.35, 0.55, 0.85), 0.35 + 0.2 * sin(uTime * 0.2));
    float alpha = fres * 0.55 * pulse * uFade;
    gl_FragColor = vec4(col * alpha, alpha);
  }
`

/** Distant aurora wash + soft limb glow so the night globe reads on phones. */
export function Aurora() {
  const domeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uFade: { value: 1 },
        },
        vertexShader: DOME_VERT,
        fragmentShader: DOME_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    [],
  )
  const haloMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uFade: { value: 1 },
        },
        vertexShader: HALO_VERT,
        fragmentShader: HALO_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    [],
  )
  const root = useRef<THREE.Group>(null)

  useFrame((_, dt) => {
    const view = getView()
    const fade = view.seat >= LOCAL_AT ? 0 : 1 - Math.min(1, view.seat / LOCAL_AT)
    domeMat.uniforms.uTime.value += dt
    haloMat.uniforms.uTime.value += dt
    domeMat.uniforms.uFade.value = fade
    haloMat.uniforms.uFade.value = fade
    if (root.current) root.current.visible = fade > 0.02
  })

  return (
    <group ref={root}>
      <mesh material={domeMat} frustumCulled={false}>
        <sphereGeometry args={[18, 64, 48]} />
      </mesh>
      <mesh material={haloMat} scale={1.55} frustumCulled={false}>
        <sphereGeometry args={[1, 64, 48]} />
      </mesh>
    </group>
  )
}
