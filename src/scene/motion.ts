import { getView, nudge } from './view-store.ts'

let listening = false
let lastOrientation: { beta: number; gamma: number } | null = null
let gyroBase: { beta: number; gamma: number; lat: number; lon: number } | null = null

export function motionNeedsGesture() {
  const maybe = (
    window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<string> }
    }
  ).DeviceOrientationEvent
  return typeof maybe?.requestPermission === 'function'
}

export async function enableMotion() {
  const maybe = (
    window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<string> }
    }
  ).DeviceOrientationEvent
  if (typeof maybe?.requestPermission === 'function') {
    const result = await maybe.requestPermission()
    if (result !== 'granted') return false
  }
  if (listening) return true
  window.addEventListener('deviceorientation', onOrientation)
  listening = true
  return true
}

export function noteDrag() {
  if (!lastOrientation) return
  const view = getView()
  gyroBase = { ...lastOrientation, lat: view.lat, lon: view.lon }
}

function onOrientation(event: DeviceOrientationEvent) {
  if (event.beta == null || event.gamma == null) return
  if (getView().traveling) return
  lastOrientation = { beta: event.beta, gamma: event.gamma }
  if (!gyroBase) {
    const view = getView()
    gyroBase = { beta: event.beta, gamma: event.gamma, lat: view.lat, lon: view.lon }
    return
  }
  const dBeta = event.beta - gyroBase.beta
  const dGamma = event.gamma - gyroBase.gamma
  if (Math.abs(dBeta) > 45 || Math.abs(dGamma) > 45) {
    const view = getView()
    gyroBase = { beta: event.beta, gamma: event.gamma, lat: view.lat, lon: view.lon }
    return
  }
  const lat = Math.max(-78, Math.min(78, gyroBase.lat + dBeta * 0.9))
  const lon = gyroBase.lon + dGamma * 0.9
  nudge(lat - getView().lat, lon - getView().lon)
}
