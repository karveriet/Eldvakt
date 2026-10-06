export const FLAME_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float sway = sin(uTime * 2.3 + position.y * 6.0) * 0.05 * position.y * position.y;
    p.x += sway;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    #include <logdepthbuf_vertex>
  }
`

export const FLAME_FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float flicker = 0.9 + 0.1 * sin(uTime * 12.0 + vUv.y * 9.0);
    float n = sin(vUv.y * 16.0 - uTime * 5.5) * 0.05 + sin(vUv.y * 34.0 - uTime * 11.0) * 0.025;
    float width = mix(0.32, 0.06, pow(vUv.y, 0.62));
    float x = abs(vUv.x - 0.5 + n * vUv.y);
    float body = smoothstep(width, width * 0.15, x);
    float tip = smoothstep(1.0, 0.08, vUv.y);
    float base = smoothstep(0.0, 0.04, vUv.y);
    float alpha = pow(body * tip * base, 0.72) * uStrength;
    vec3 ember = vec3(0.82, 0.2, 0.04);
    vec3 amber = vec3(1.0, 0.52, 0.09);
    vec3 gold = vec3(1.0, 0.78, 0.32);
    vec3 col = mix(ember, amber, smoothstep(0.0, 0.42, vUv.y));
    col = mix(col, gold, smoothstep(0.35, 0.92, vUv.y));
    float core = smoothstep(width * 0.5, 0.0, x) * smoothstep(0.72, 0.0, vUv.y);
    col = mix(col, vec3(1.0, 0.74, 0.28), core * 0.5);
    alpha = min(alpha, 0.42);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(col * flicker, alpha);
    #include <logdepthbuf_fragment>
  }
`
