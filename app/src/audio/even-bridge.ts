/**
 * EvenAppBridge audio integration.
 *
 * Wraps the EvenAppBridge.audioControl API to capture PCM audio
 * from the G2 glasses and feed it to the AudioRecorder.
 *
 * The bridge provides:
 * - bridge.audioControl(true) — start audio capture
 * - bridge.audioControl(false) — stop audio capture
 * - bridge.onAudioData(callback) — receive PCM Float32Array chunks
 */

import type { AudioRecorder } from './recorder'

declare global {
  interface Window {
    EvenAppBridge?: {
      audioControl: (enable: boolean) => void
      onAudioData?: (callback: (data: Float32Array) => void) => void
    }
  }
}

export interface EvenAudioOptions {
  recorder: AudioRecorder
  /** Called when recording produces a WAV blob */
  onRecordingComplete: (blob: Blob) => void
  /** Called when recording is cancelled or produces no output */
  onRecordingCancelled: () => void
}

export class EvenAudioBridge {
  private options: EvenAudioOptions
  private isActive = false

  constructor(options: EvenAudioOptions) {
    this.options = options
  }

  get active(): boolean {
    return this.isActive
  }

  /** Check if EvenAppBridge is available. */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.EvenAppBridge
  }

  /** Start voice recording via G2 glasses. */
  start(): void {
    if (this.isActive) return
    if (!this.isAvailable()) {
      console.warn('[EvenAudio] EvenAppBridge not available — running in browser mode')
      return
    }

    this.isActive = true
    const bridge = window.EvenAppBridge!

    // Register audio data callback
    bridge.onAudioData?.((data: Float32Array) => {
      this.options.recorder.feedPCMSamples(data)
    })

    // Start audio capture
    bridge.audioControl(true)

    // Start the recorder with callbacks
    this.options.recorder.start({
      onAudioLevel: (_level: number) => {
        // Could update a VU meter in the UI
      },
      onSilenceStart: () => {
        // Could show "..." on glasses
      },
      onSilenceEnd: () => {
        // Speech detected again
      },
    })

    console.log('[EvenAudio] Recording started via G2 glasses')
  }

  /** Stop voice recording and return the WAV blob. */
  stop(): void {
    if (!this.isActive) return

    const bridge = window.EvenAppBridge
    if (bridge) {
      bridge.audioControl(false)
    }

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

    const bridge = window.EvenAppBridge
    if (bridge) {
      bridge.audioControl(false)
    }

    this.options.recorder.cancel()
    this.isActive = false
    this.options.onRecordingCancelled()
  }
}
