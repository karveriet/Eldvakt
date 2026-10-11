import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { worldFrameOffset } from './world-frame.ts'

/** Carries the planet (and its sky) when the camera parks at the origin up close. */
export function WorldFrame({ children }: { children: ReactNode }) {
  const root = useRef<Group>(null)
  useFrame(() => {
    const group = root.current
    if (!group) return
    group.position.copy(worldFrameOffset)
  }, -1)
  return <group ref={root}>{children}</group>
}
