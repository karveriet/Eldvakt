import { Canvas } from '@react-three/fiber'
import { useEffect, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { cosmosAudio } from './audio/cosmos.ts'
import { hearthAudio } from './audio/hearth.ts'
import { clearTint, hasCharacterTint, subscribeTint } from './character/tint.ts'
import { connectRoom, getRoomSnapshot, subscribeRoom } from './net/room.ts'
import { Scene } from './scene/Scene.tsx'
import { CharacterTint } from './ui/CharacterTint.tsx'
import { Controls } from './ui/Controls.tsx'

export function App() {
  const forceTint = wantsRetint()
  const tinted = useSyncExternalStore(subscribeTint, hasCharacterTint, () => false)
  const [picked, setPicked] = useState(false)

  useEffect(() => {
    if (forceTint) clearTint()
  }, [forceTint])

  // ?tint must show the picker even if a prägel was already stored this session.
  const showPicker = forceTint ? !picked : !tinted
  if (showPicker) {
    return (
      <CharacterTint
        onChosen={() => {
          if (forceTint) dropRetintQuery()
          setPicked(true)
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

function dropRetintQuery() {
  const url = new URL(location.href)
  url.searchParams.delete('tint')
  url.searchParams.delete('retint')
  history.replaceState(null, '', url.pathname + url.search + url.hash)
}

function Night() {
  const connected = useSyncExternalStore(
    subscribeRoom,
    () => getRoomSnapshot().connected,
    () => false,
  )

  useEffect(() => connectRoom(), [])

  useEffect(() => {
    const unlock = () => {
      hearthAudio.unlock()
      cosmosAudio.unlock()
    }
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
