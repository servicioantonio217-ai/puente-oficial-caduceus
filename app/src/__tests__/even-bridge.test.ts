import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EvenAudioBridge } from '../audio/even-bridge'
import { AudioRecorder } from '../audio/recorder'

// --- EvenAudioBridge ---

describe('EvenAudioBridge', () => {
  let recorder: AudioRecorder
  let onComplete: ReturnType<typeof vi.fn>
  let onCancelled: ReturnType<typeof vi.fn>

  beforeEach(() => {
    recorder = new AudioRecorder()
    onComplete = vi.fn()
    onCancelled = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isAvailable', () => {
    it('returns false when __evenBridge is not present', () => {
      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })
      expect(bridge.isAvailable()).toBe(false)
    })

    it('returns true when __evenBridge is present', () => {
      const mockBridge = {
        rawBridge: { audioControl: vi.fn() },
        onEvent: vi.fn(),
      }
      ;(window as unknown as Record<string, unknown>).__evenBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })
      expect(bridge.isAvailable()).toBe(true)

      delete (window as unknown as Record<string, unknown>).__evenBridge
    })
  })

  describe('start', () => {
    it('does nothing and does not set active when __evenBridge is unavailable', () => {
      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.start()
      expect(bridge.active).toBe(false)
      expect(onComplete).not.toHaveBeenCalled()
      expect(onCancelled).not.toHaveBeenCalled()
    })

    it('sets active and registers event callback when __evenBridge is available', () => {
      const eventCallbacks: Array<(event: { audioEvent?: { audioPcm?: Uint8Array } }) => void> = []
      const mockBridge = {
        rawBridge: { audioControl: vi.fn() },
        onEvent: vi.fn((cb: (event: { audioEvent?: { audioPcm?: Uint8Array } }) => void) => {
          eventCallbacks.push(cb)
        }),
      }
      ;(window as unknown as Record<string, unknown>).__evenBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.start()
      expect(bridge.active).toBe(true)
      expect(mockBridge.rawBridge.audioControl).toHaveBeenCalledWith(true)
      expect(mockBridge.onEvent).toHaveBeenCalledTimes(1)

      delete (window as unknown as Record<string, unknown>).__evenBridge
    })

    it('ignores duplicate start calls', () => {
      const mockBridge = {
        rawBridge: { audioControl: vi.fn() },
        onEvent: vi.fn(),
      }
      ;(window as unknown as Record<string, unknown>).__evenBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.start()
      bridge.start() // second call should be ignored
      expect(mockBridge.rawBridge.audioControl).toHaveBeenCalledTimes(1)

      delete (window as unknown as Record<string, unknown>).__evenBridge
    })
  })

  describe('stop', () => {
    it('does nothing when not active', () => {
      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.stop()
      expect(bridge.active).toBe(false)
      expect(onComplete).not.toHaveBeenCalled()
      expect(onCancelled).not.toHaveBeenCalled()
    })

    it('calls onRecordingCancelled when no samples were recorded', () => {
      const mockBridge = {
        rawBridge: { audioControl: vi.fn() },
        onEvent: vi.fn(),
      }
      ;(window as unknown as Record<string, unknown>).__evenBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.start()
      bridge.stop()

      expect(bridge.active).toBe(false)
      expect(mockBridge.rawBridge.audioControl).toHaveBeenCalledWith(false)
      // No samples fed → recorder.stop() returns null → onCancelled
      expect(onCancelled).toHaveBeenCalledTimes(1)
      expect(onComplete).not.toHaveBeenCalled()

      delete (window as unknown as Record<string, unknown>).__evenBridge
    })

    it('calls onRecordingComplete when samples were recorded', () => {
      const eventCallbacks: Array<(event: { audioEvent?: { audioPcm?: Uint8Array } }) => void> = []
      const mockBridge = {
        rawBridge: { audioControl: vi.fn() },
        onEvent: vi.fn((cb: (event: { audioEvent?: { audioPcm?: Uint8Array } }) => void) => {
          eventCallbacks.push(cb)
        }),
      }
      ;(window as unknown as Record<string, unknown>).__evenBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.start()

      // Feed audio data through the event callback
      // 3 samples = 6 bytes of 16-bit PCM LE
      const pcmBytes = new Uint8Array([0x00, 0x40, 0xCD, 0xFF, 0x0D, 0x33])
      eventCallbacks[0]({ audioEvent: { audioPcm: pcmBytes } })

      bridge.stop()

      expect(bridge.active).toBe(false)
      expect(mockBridge.rawBridge.audioControl).toHaveBeenCalledWith(false)
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onCancelled).not.toHaveBeenCalled()

      // Verify the blob
      const blob = onComplete.mock.calls[0][0]
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('audio/wav')
      expect(blob.size).toBe(44 + 3 * 2) // 44 header + 3 samples * 2 bytes

      delete (window as unknown as Record<string, unknown>).__evenBridge
    })
  })

  describe('cancel', () => {
    it('cancels active recording and fires onCancelled', () => {
      const mockBridge = {
        rawBridge: { audioControl: vi.fn() },
        onEvent: vi.fn(),
      }
      ;(window as unknown as Record<string, unknown>).__evenBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.start()
      bridge.cancel()

      expect(bridge.active).toBe(false)
      expect(mockBridge.rawBridge.audioControl).toHaveBeenCalledWith(false)
      expect(onCancelled).toHaveBeenCalledTimes(1)
      expect(onComplete).not.toHaveBeenCalled()

      delete (window as unknown as Record<string, unknown>).__evenBridge
    })

    it('does nothing when not active', () => {
      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.cancel()
      expect(bridge.active).toBe(false)
      expect(onCancelled).not.toHaveBeenCalled()
    })
  })
})
