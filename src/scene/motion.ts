import { LOCAL_AT } from '../geo/seat.ts'
import { getView, setGaze } from './view-store.ts'

let listening = false
let lastOrientation: { alpha: number | null; beta: number; gamma: number } | null = null
let gyroBase: {
  alpha: number | null
  beta: number
  gamma: number
  yaw: number
  pitch: number
} | null = null
let wasTraveling = false
let wasLocal = false

export function motionNeedsGesture() {
  const maybe = (
    window as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<string> }
    }
  ).DeviceOrientationEvent
  return typeof maybe?.requestPermission === 'function'
}

export function motionListening() {
  return listening
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
  window.addEventListener('deviceorientation', onOrientation, true)
  listening = true
  return true
}

export function noteDrag() {
  if (!lastOrientation) return
  const view = getView()
  if (view.seat < LOCAL_AT) return
  gyroBase = {
    ...lastOrientation,
    yaw: view.yaw,
    pitch: view.pitch,
  }
}

/**
 * Gyro is only for first-person gaze beside a fire.
 * Out in orbit, pinch, twist, and swipe move the camera — orientation stays off.
 */
function onOrientation(event: DeviceOrientationEvent) {
  if (event.beta == null || event.gamma == null) return
  const view = getView()
  const local = view.seat >= LOCAL_AT
  lastOrientation = { alpha: event.alpha, beta: event.beta, gamma: event.gamma }

  if (!local) {
    wasLocal = false
    gyroBase = null
    return
  }

  if (view.traveling) {
    wasTraveling = true
    return
  }

  // Fresh baseline when travel ends or when you first sit beside the fire.
  if (!gyroBase || wasTraveling || !wasLocal) {
    wasTraveling = false
    wasLocal = true
    gyroBase = {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      yaw: view.yaw,
      pitch: view.pitch,
    }
    return
  }

  const dBeta = event.beta - gyroBase.beta
  const dGamma = event.gamma - gyroBase.gamma
  if (Math.abs(dBeta) > 45 || Math.abs(dGamma) > 45) {
    gyroBase = {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      yaw: view.yaw,
      pitch: view.pitch,
    }
    return
  }

  // Yaw: compass heading when available, else roll.
  const dYaw =
    event.alpha != null && gyroBase.alpha != null
      ? -deltaDegrees(gyroBase.alpha, event.alpha)
      : dGamma
  // Pitch: invert beta so tilting the phone down looks down.
  setGaze(gyroBase.yaw + dYaw * 1.05, gyroBase.pitch - dBeta * 0.95)
}

function deltaDegrees(from: number, to: number): number {
  let delta = to - from
  while (delta > 180) delta -= 360
  while (delta < -180) delta += 360
  return delta
}
