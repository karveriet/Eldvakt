import { useFrame } from '@react-three/fiber'
import { Beside } from './Beside.tsx'
import { CameraRig } from './CameraRig.tsx'
import { Globe } from './Globe.tsx'
import { Hearths } from './Hearths.tsx'
import { Look } from './Look.tsx'
import { Stars } from './Stars.tsx'
import { tickView } from './view-store.ts'

export function Scene() {
  return (
    <>
      <color attach="background" args={['#05060a']} />
      <ViewClock />
      <Stars />
      <Globe />
      <Hearths />
      <Beside />
      <CameraRig />
      <Look />
    </>
  )
}

function ViewClock() {
  useFrame(() => tickView(performance.now()))
  return null
}
