/**
 * EvenAppBridge audio integration for G2 glasses.
 *
 * Uses the Even SDK's internal bridge (window.__evenBridge) to capture
 * PCM audio from the G2 glasses via EvenHub events.
 *
 * The bridge provides:
 * - __evenBridge.rawBridge.audioControl(true/false) — mic on/off
 * - __evenBridge.onEvent(callback) — receive events including audioPcm
 *
 * Audio format: Uint8Array of 16-bit PCM little-endian at 16kHz.
 * Converted to Float32Array before feeding to the AudioRecorder.
 */

import type { AudioRecorder } from './recorder'

/** EvenHub bridge interface (set by useGlasses). */
interface EvenBridge {
  rawBridge?: {
    audioControl?: (enable: boolean) => void
    callEvenApp?: (method: string, params: Record<string, unknown>) => void
  }
  onEvent: (callback: (event: EvenHubEvent) => void) => void
}

interface EvenHubEvent {
  audioEvent?: {
    audioPcm?: Uint8Array
  }
  [key: string]: unknown
}

export interface EvenAudioOptions {
  recorder: AudioRecorder
  /** Called when recording produces a WAV blob */
  onRecordingComplete: (blob: Blob) => void
  /** Called when recording is cancelled or produces no output */
  onRecordingCancelled: () => void
}

/** Convert raw bytes (16-bit PCM little-endian) to Float32Array. */
function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const samples = bytes.length / 2
  const float32 = new Float32Array(samples)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = 0; i < samples; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768
  }
  return float32
}

export class EvenAudioBridge {
  private options: EvenAudioOptions
  private isActive = false
  private bridge: EvenBridge | null = null

  constructor(options: EvenAudioOptions) {
    this.options = options
  }

  get active(): boolean {
    return this.isActive
  }

  /** Check if Even bridge (__evenBridge) is available. */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__evenBridge
  }

  /** Start voice recording via G2 glasses. */
  start(): void {
    if (this.isActive) return

    // Get bridge from global (set by useGlasses)
    const w = window as unknown as Record<string, unknown>
    this.bridge = (w.__evenBridge as EvenBridge) ?? null

    if (!this.bridge || !this.isAvailable()) {
      console.warn('[EvenAudio] __evenBridge not available — running in browser mode')
      return
    }

    this.isActive = true

    // Open the glasses microphone
    try {
      if (this.bridge.rawBridge?.audioControl) {
        this.bridge.rawBridge.audioControl(true)
      } else if (this.bridge.rawBridge?.callEvenApp) {
        this.bridge.rawBridge.callEvenApp('audioControl', { isOpen: true })
      }
    } catch (err) {
      console.warn('[EvenAudio] audioControl(true) failed:', err)
    }

    // Listen for audio PCM events via the EvenHub event system.
    // Arrow functions capture `this` from the enclosing lexical scope
    // (the EvenAudioBridge instance), so no aliasing is needed.
    this.bridge.onEvent((event: EvenHubEvent) => {
      if (!this.isActive) return

      const audioPcm = event?.audioEvent?.audioPcm
      if (!audioPcm || audioPcm.length === 0) return

      // Convert 16-bit PCM LE (Uint8Array) to Float32Array
      const float32 = pcm16ToFloat32(audioPcm)
      this.options.recorder.feedPCMSamples(float32)
    })

    // Start the recorder with callbacks.
    // The onAutoStop callback handles VAD-triggered auto-stop:
    // when silence is detected, the recorder auto-stops and delivers
    // the blob here so we can close the mic and forward it to
    // onRecordingComplete. Without this, the blob was lost and
    // subsequent recordings would fail (root cause of issue #35).
    this.options.recorder.start({
      onAudioLevel: () => {
        // Could update a VU meter in the UI
      },
      onSilenceStart: () => {
        // Could show "..." on glasses
      },
      onSilenceEnd: () => {
        // Speech detected again
      },
      onAutoStop: (blob: Blob) => {
        // VAD triggered auto-stop — close mic and deliver blob.
        // Set isActive = false FIRST to prevent re-entrant onEvent calls
        // from feeding more samples into the (now stopped) recorder.
        this.isActive = false
        this.closeMic()
        console.log(`[EvenAudio] VAD auto-stop: ${blob.size} bytes`)
        this.options.onRecordingComplete(blob)
      },
    })

    console.log('[EvenAudio] Recording started via G2 glasses')
  }

  /** Close the glasses microphone. */
  private closeMic(): void {
    if (!this.bridge) return
    try {
      if (this.bridge.rawBridge?.audioControl) {
        this.bridge.rawBridge.audioControl(false)
      } else if (this.bridge.rawBridge?.callEvenApp) {
        this.bridge.rawBridge.callEvenApp('audioControl', { isOpen: false })
      }
    } catch (err) {
      console.warn('[EvenAudio] audioControl(false) failed:', err)
    }
  }

  /** Stop voice recording and return the WAV blob. */
  stop(): void {
    if (!this.isActive) return

    this.closeMic()
    const blob = this.options.recorder.stop()
    this.isActive = false

    if (blob && blob.size > 0) {
      console.log(`[EvenAudio] Recording stopped: ${blob.size} bytes`)
      this.options.onRecordingComplete(blob)
    } else {
      console.log('[EvenAudio] Recording produced no output')
      this.options.onRecordingCancelled()
    }
  }

  /** Cancel active recording. */
  cancel(): void {
    if (!this.isActive) return

    this.closeMic()
    this.options.recorder.cancel()
    this.isActive = false
    this.options.onRecordingCancelled()
  }
}
