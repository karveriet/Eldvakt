import { LOCAL_AT } from '../geo/seat.ts'
import { getView, nudge, setGaze } from './view-store.ts'

let listening = false
let lastOrientation: { beta: number; gamma: number } | null = null
let gyroBase: {
  beta: number
  gamma: number
  lat: number
  lon: number
  yaw: number
  pitch: number
} | null = null
let wasTraveling = false

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
  gyroBase = { ...lastOrientation, lat: view.lat, lon: view.lon, yaw: view.yaw, pitch: view.pitch }
}

function onOrientation(event: DeviceOrientationEvent) {
  if (event.beta == null || event.gamma == null) return
  const view = getView()
  lastOrientation = { beta: event.beta, gamma: event.gamma }
  if (view.traveling) {
    wasTraveling = true
    return
  }
  if (!gyroBase || wasTraveling) {
    wasTraveling = false
    gyroBase = {
      beta: event.beta,
      gamma: event.gamma,
      lat: view.lat,
      lon: view.lon,
      yaw: view.yaw,
      pitch: view.pitch,
    }
    return
  }
  const dBeta = event.beta - gyroBase.beta
  const dGamma = event.gamma - gyroBase.gamma
  if (Math.abs(dBeta) > 45 || Math.abs(dGamma) > 45) {
    gyroBase = {
      beta: event.beta,
      gamma: event.gamma,
      lat: view.lat,
      lon: view.lon,
      yaw: view.yaw,
      pitch: view.pitch,
    }
    return
  }
  if (view.seat >= LOCAL_AT) {
    setGaze(gyroBase.yaw + dGamma * 0.9, gyroBase.pitch + dBeta * 0.9)
    return
  }
  const lat = Math.max(-78, Math.min(78, gyroBase.lat + dBeta * 0.9))
  const lon = gyroBase.lon + dGamma * 0.9
  nudge(lat - view.lat, lon - view.lon)
}
