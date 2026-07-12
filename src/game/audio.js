// Fully synthesized race audio — no asset files. Engine hum pitched by
// speed, noise-based skid, boost sweep, countdown beeps. The AudioContext
// is created in init(), which must be called from a user gesture.
const MASTER_GAIN = 0.4
const RAMP_SECONDS = 0.06

export class RaceAudio {
  #ctx = null
  #master = null
  #engineOsc = null
  #engineGain = null
  #skidGain = null
  #enabled = true

  init() {
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') this.#ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.#ctx = ctx

    this.#master = ctx.createGain()
    this.#master.gain.value = this.#enabled ? MASTER_GAIN : 0
    this.#master.connect(ctx.destination)

    this.#engineOsc = ctx.createOscillator()
    this.#engineOsc.type = 'sawtooth'
    this.#engineOsc.frequency.value = 50
    const engineFilter = ctx.createBiquadFilter()
    engineFilter.type = 'lowpass'
    engineFilter.frequency.value = 420
    this.#engineGain = ctx.createGain()
    this.#engineGain.gain.value = 0
    this.#engineOsc.connect(engineFilter).connect(this.#engineGain).connect(this.#master)
    this.#engineOsc.start()

    // One second of looping white noise for the skid hiss
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const channel = noiseBuffer.getChannelData(0)
    for (let i = 0; i < channel.length; i++) channel[i] = (((i * 1103515245 + 12345) >>> 16) % 2000) / 1000 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true
    const skidFilter = ctx.createBiquadFilter()
    skidFilter.type = 'bandpass'
    skidFilter.frequency.value = 900
    this.#skidGain = ctx.createGain()
    this.#skidGain.gain.value = 0
    noise.connect(skidFilter).connect(this.#skidGain).connect(this.#master)
    noise.start()
  }

  setEnabled(enabled) {
    this.#enabled = enabled
    this.#master?.gain.setTargetAtTime(enabled ? MASTER_GAIN : 0, this.#ctx.currentTime, RAMP_SECONDS)
  }

  update(speedRatio, drifting) {
    if (!this.#ctx) return
    const now = this.#ctx.currentTime
    this.#engineOsc.frequency.setTargetAtTime(50 + 95 * speedRatio, now, RAMP_SECONDS)
    this.#engineGain.gain.setTargetAtTime(speedRatio > 0.02 ? 0.06 + 0.1 * speedRatio : 0, now, RAMP_SECONDS)
    this.#skidGain.gain.setTargetAtTime(drifting ? 0.12 : 0, now, RAMP_SECONDS)
  }

  #blip(frequencyFrom, frequencyTo, durationSeconds, type = 'square', gainPeak = 0.12) {
    if (!this.#ctx) return
    const ctx = this.#ctx
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(frequencyFrom, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(frequencyTo, ctx.currentTime + durationSeconds)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(gainPeak, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSeconds)
    osc.connect(gain).connect(this.#master)
    osc.start()
    osc.stop(ctx.currentTime + durationSeconds)
  }

  boost() { this.#blip(220, 660, 0.3) }

  countdownBeep(isGo) {
    if (isGo) this.#blip(880, 880, 0.5, 'sine')
    else this.#blip(660, 660, 0.12, 'sine')
  }

  stop() {
    this.#ctx?.close()
    this.#ctx = null
    this.#master = null
    this.#engineOsc = null
    this.#engineGain = null
    this.#skidGain = null
  }
}
