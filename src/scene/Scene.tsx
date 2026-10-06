import { CameraRig } from './CameraRig.tsx'
import { Globe } from './Globe.tsx'
import { Hearths } from './Hearths.tsx'
import { Look } from './Look.tsx'
import { Stars } from './Stars.tsx'

export function Scene() {
  return (
    <>
      <color attach="background" args={['#05060a']} />
      <Stars />
      <Globe />
      <Hearths />
      <CameraRig />
      <Look />
    </>
  )
}
