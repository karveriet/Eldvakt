/** Soft hearth sounds. Gains stay low: a crackle, a tone, a muted thud. */
export class HearthAudio {
  private ctx: AudioContext | null = null
  private timer = 0
  private strength = 0

  unlock() {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') void ctx.resume()
  }

  setStrength(strength: number) {
    this.strength = Math.max(0, Math.min(1.4, strength))
  }

  tick(dt: number) {
    if (!this.ctx || this.strength < 0.03) return
    this.timer -= dt
    if (this.timer > 0) return
    this.timer = 0.045 + (1.2 - Math.min(this.strength, 1.2)) * 0.22 + Math.random() * 0.1
    this.pop()
  }

  /** Someone sat down. */
  sit() {
    const ctx = this.ensure()
    const now = ctx.currentTime
    for (const frequency of [392, 587.33]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = frequency
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.028, now + 0.06)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 1.75)
    }
  }

  /** A log catches. */
  log() {
    const ctx = this.ensure()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(120, now)
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.22)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 220
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.3)

    const noise = ctx.createBufferSource()
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      const env = 1 - i / data.length
      data[i] = (Math.random() * 2 - 1) * env * env
    }
    noise.buffer = buffer
    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.value = 180
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.08
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(ctx.destination)
    noise.start(now)
  }

  private pop() {
    const ctx = this.ctx
    if (!ctx) return
    const duration = 0.025 + Math.random() * 0.04
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      const env = 1 - i / data.length
      data[i] = (Math.random() * 2 - 1) * env * env
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 700 + this.strength * 2400
    filter.Q.value = 0.6
    const gain = ctx.createGain()
    gain.gain.value = 0.012 + this.strength * 0.04
    source.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)
    source.start()
  }

  private ensure() {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }
}

export const hearthAudio = new HearthAudio()

/** Short pulse where the device allows it. Ignored everywhere else. */
export function pulse() {
  try {
    navigator.vibrate?.(20)
  } catch {
    // This browser does not allow vibration.
  }
}
