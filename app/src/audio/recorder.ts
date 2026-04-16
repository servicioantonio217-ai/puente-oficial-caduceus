/**
 * Audio recording with Voice Activity Detection (VAD).
 *
 * Captures PCM audio from the G2 glasses via EvenAppBridge,
 * detects silence to auto-stop, and converts to WAV for upload.
 */

export interface RecorderCallbacks {
  onAudioLevel: (level: number) => void
  onSilenceStart: () => void
  onSilenceEnd: () => void
  /** Called when VAD auto-stop triggers. The recorder has already stopped. */
  onAutoStop?: (blob: Blob) => void
}

export interface AudioRecorderOptions {
  /** Sample rate (default: 16000, matching G2 glasses) */
  sampleRate?: number
  /** Silence threshold (0-1, default: 0.02) */
  silenceThreshold?: number
  /** Duration of silence before auto-stop in ms (default: 1500) */
  silenceTimeoutMs?: number
  /** Minimum recording duration in ms (default: 500) */
  minDurationMs?: number
}

const DEFAULT_OPTIONS: Required<AudioRecorderOptions> = {
  sampleRate: 16000,
  silenceThreshold: 0.02,
  silenceTimeoutMs: 1500,
  minDurationMs: 500,
}

/** Convert Float32 PCM samples to WAV ArrayBuffer (16-bit LE, mono). */
export function pcmToWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = samples.length * (bitsPerSample / 8)
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  // WAV header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // PCM data
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return buffer
}

/** Convert Float32 PCM samples to WAV blob (16-bit LE, mono). */
export function pcmToWav(samples: Float32Array, sampleRate: number): Blob {
  return new Blob([pcmToWavBuffer(samples, sampleRate)], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

/** Calculate RMS audio level from samples. */
export function calculateRMS(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i]
  }
  return Math.sqrt(sum / samples.length)
}

export class AudioRecorder {
  private options: Required<AudioRecorderOptions>
  private callbacks: RecorderCallbacks | null = null
  private isRecording = false
  private startTime = 0
  private silenceStart = 0
  private silenceTimer: ReturnType<typeof setTimeout> | null = null
  private allSamples: Float32Array[] = []
  private animFrameId: number | null = null

  constructor(options?: AudioRecorderOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  get recording(): boolean {
    return this.isRecording
  }

  /**
   * Start recording PCM audio.
   * In the Even Hub WebView, audio is provided via EvenAppBridge.
   * This function sets up a mock recorder for testing and will be
   * replaced with the actual EvenAppBridge integration.
   */
  start(callbacks: RecorderCallbacks): void {
    if (this.isRecording) return
    this.callbacks = callbacks
    this.isRecording = true
    this.startTime = Date.now()
    this.silenceStart = 0
    this.allSamples = []

    // Try to use the EvenAppBridge audio API
    this.startEvenBridge()
  }

  private startEvenBridge(): void {
    // EvenAppBridge provides PCM audio via bridge.audioControl(true)
    // The actual integration uses even-toolkit's audio utilities
    // For now, we set up the processing pipeline
    console.log('[AudioRecorder] Ready for audio input via EvenAppBridge')
  }

  /** Feed PCM samples (called by EvenAppBridge audio handler). */
  feedPCMSamples(samples: Float32Array): void {
    if (!this.isRecording) return

    this.allSamples.push(samples)

    // Calculate audio level
    const rms = calculateRMS(samples)
    this.callbacks?.onAudioLevel(rms)

    // VAD: check for silence
    if (rms < this.options.silenceThreshold) {
      if (this.silenceStart === 0) {
        this.silenceStart = Date.now()
        this.callbacks?.onSilenceStart()
      }

      // Check if silence has lasted long enough
      const silenceDuration = Date.now() - this.silenceStart
      if (silenceDuration >= this.options.silenceTimeoutMs) {
        const recordingDuration = Date.now() - this.startTime
        if (recordingDuration >= this.options.minDurationMs) {
          // VAD auto-stop: produce the blob and notify via callback
          // instead of discarding it (this was the root cause of
          // "recording only works once" — the blob was lost on auto-stop).
          const blob = this.stop()
          if (blob && this.callbacks?.onAutoStop) {
            this.callbacks.onAutoStop(blob)
          }
        }
      }
    } else {
      // Speech detected — reset silence timer
      if (this.silenceStart > 0) {
        this.silenceStart = 0
        this.callbacks?.onSilenceEnd()
      }
    }
  }

  /** Stop recording and return WAV blob. */
  stop(): Blob | null {
    if (!this.isRecording) return null
    this.isRecording = false

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    if (this.allSamples.length === 0) return null

    // Merge all sample chunks
    const totalLength = this.allSamples.reduce((sum, chunk) => sum + chunk.length, 0)
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of this.allSamples) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    this.allSamples = []
    return pcmToWav(merged, this.options.sampleRate)
  }

  /** Cancel recording without producing output. */
  cancel(): void {
    this.isRecording = false
    this.allSamples = []

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }
}
