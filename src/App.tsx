import { Canvas } from '@react-three/fiber'
import { useEffect, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { hearthAudio } from './audio/hearth.ts'
import { connectRoom, getRoomSnapshot, subscribeRoom } from './net/room.ts'
import { Scene } from './scene/Scene.tsx'
import { Controls } from './ui/Controls.tsx'

export function App() {
  const connected = useSyncExternalStore(
    subscribeRoom,
    () => getRoomSnapshot().connected,
    () => false,
  )

  useEffect(() => connectRoom(), [])

  useEffect(() => {
    const unlock = () => hearthAudio.unlock()
    window.addEventListener('pointerdown', unlock)
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  return (
    <>
      <Canvas
        camera={{ position: [3.4, 1.5, 1.6], fov: 46, near: 0.1, far: 80 }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setClearColor('#05060a')
          gl.toneMapping = THREE.NoToneMapping
        }}
      >
        <Scene />
      </Canvas>
      <div className="veil" />
      <i className={connected ? 'ember-dot on' : 'ember-dot'} aria-hidden="true" />
      <Controls />
    </>
  )
}
