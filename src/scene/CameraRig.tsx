import { useFrame, useThree } from '@react-three/fiber'
import { latLonToVector } from '../geo/sphere.ts'
import { getView, tickView } from './view-store.ts'

export function CameraRig() {
  const camera = useThree((state) => state.camera)
  useFrame(() => {
    tickView(performance.now())
    const view = getView()
    const position = latLonToVector(view.lat, view.lon, view.distance)
    camera.position.set(position.x, position.y, position.z)
    camera.lookAt(0, 0, 0)
  })
  return null
}
