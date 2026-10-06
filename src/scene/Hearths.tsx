import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HearthLayer } from './hearth-layer.ts'

export function Hearths() {
  const ref = useRef<THREE.Group>(null)
  const layer = useRef<HearthLayer | null>(null)

  useLayoutEffect(() => {
    const group = ref.current
    if (!group) return
    const created = new HearthLayer(group)
    layer.current = created
    return () => {
      created.dispose()
      group.clear()
    }
  }, [])

  useFrame((_, dt) => {
    layer.current?.update(dt)
  })

  return <group ref={ref} />
}
