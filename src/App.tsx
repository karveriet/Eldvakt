import { Canvas } from '@react-three/fiber'
import { useEffect, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { hearthAudio } from './audio/hearth.ts'
import { hasCharacterTint, subscribeTint } from './character/tint.ts'
import { connectRoom, getRoomSnapshot, subscribeRoom } from './net/room.ts'
import { Scene } from './scene/Scene.tsx'
import { CharacterTint } from './ui/CharacterTint.tsx'
import { Controls } from './ui/Controls.tsx'

export function App() {
  const tinted = useSyncExternalStore(subscribeTint, hasCharacterTint, () => false)
  const [ready, setReady] = useState(() => hasCharacterTint())

  if (!ready && !tinted) {
    return <CharacterTint onChosen={() => setReady(true)} />
  }

  return <Night />
}

function Night() {
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
        gl={{
          antialias: true,
          alpha: false,
          logarithmicDepthBuffer: true,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#05060a')
          gl.toneMapping = THREE.NoToneMapping
          gl.localClippingEnabled = true
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
