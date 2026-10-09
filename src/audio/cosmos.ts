import { sharedAudio } from './context.ts'

/**
 * A faint bed for the orbital night: slow beats and a thin, drifting tone.
 * No noise. Noise would read as a fire.
 */
export class CosmosAudio {
  private master: GainNode | null = null
  private started = false
  private level = 0
  private applied = -1

  unlock() {
    sharedAudio()
    this.start()
    this.apply(true)
  }

  setLevel(level: number) {
    this.level = Math.max(0, Math.min(1, level))
    this.apply(false)
  }

  private apply(force: boolean) {
    if (!this.master) return
    if (!force && Math.abs(this.level - this.applied) < 0.004) return
    this.applied = this.level
    const ctx = sharedAudio()
    const now = ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime(this.level * 0.036, now, 0.45)
  }

  private start() {
    if (this.started) return
    this.started = true
    const ctx = sharedAudio()
    const master = ctx.createGain()
    master.gain.value = 0
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 480
    filter.Q.value = 0.35
    const breath = ctx.createGain()
    breath.gain.value = 0.84
    const breathLfo = ctx.createOscillator()
    breathLfo.frequency.value = 0.043
    const breathDepth = ctx.createGain()
    breathDepth.gain.value = 0.16
    breathLfo.connect(breathDepth)
    breathDepth.connect(breath.gain)
    breathLfo.start()
    filter.connect(breath)
    breath.connect(master)
    master.connect(ctx.destination)
    this.master = master

    this.partial(39, 0.42, filter)
    this.partial(78, 0.5, filter)
    this.partial(78.37, 0.48, filter)
    this.partial(116.4, 0.14, filter)
    const high = this.partial(311, 0.07, filter)
    const drift = ctx.createOscillator()
    drift.frequency.value = 0.061
    const driftDepth = ctx.createGain()
    driftDepth.gain.value = 5.5
    drift.connect(driftDepth)
    driftDepth.connect(high.frequency)
    drift.start()
    this.partial(319.2, 0.035, filter)
  }

  private partial(frequency: number, amount: number, destination: AudioNode) {
    const ctx = sharedAudio()
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = frequency
    const gain = ctx.createGain()
    gain.gain.value = amount
    osc.connect(gain)
    gain.connect(destination)
    osc.start()
    return osc
  }
}

export const cosmosAudio = new CosmosAudio()
