import { Canvas } from '@react-three/fiber'
import { useEffect, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { hearthAudio } from './audio/hearth.ts'
import { clearTint, hasCharacterTint, subscribeTint } from './character/tint.ts'
import { connectRoom, getRoomSnapshot, subscribeRoom } from './net/room.ts'
import { Scene } from './scene/Scene.tsx'
import { CharacterTint } from './ui/CharacterTint.tsx'
import { Controls } from './ui/Controls.tsx'

export function App() {
  const tinted = useSyncExternalStore(subscribeTint, hasCharacterTint, () => false)
  const [ready, setReady] = useState(() => {
    if (wantsRetint()) {
      clearTint()
      return false
    }
    return hasCharacterTint()
  })

  if (!ready && !tinted) {
    return (
      <CharacterTint
        onChosen={() => {
          // Drop ?tint from the URL so a refresh keeps the chosen prägel.
          if (wantsRetint()) {
            const url = new URL(location.href)
            url.searchParams.delete('tint')
            url.searchParams.delete('retint')
            history.replaceState(null, '', url.pathname + url.search + url.hash)
          }
          setReady(true)
        }}
      />
    )
  }

  return <Night />
}

function wantsRetint(): boolean {
  if (typeof location === 'undefined') return false
  const params = new URLSearchParams(location.search)
  return params.has('tint') || params.has('retint')
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
