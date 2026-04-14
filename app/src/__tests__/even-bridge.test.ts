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
    it('returns false when EvenAppBridge is not present', () => {
      // window.EvenAppBridge is undefined by default in test env
      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })
      expect(bridge.isAvailable()).toBe(false)
    })

    it('returns true when EvenAppBridge is present', () => {
      const mockBridge = {
        audioControl: vi.fn(),
        onAudioData: vi.fn(),
      }
      window.EvenAppBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })
      expect(bridge.isAvailable()).toBe(true)

      delete (window as unknown as Record<string, unknown>).EvenAppBridge
    })
  })

  describe('start', () => {
    it('does nothing and does not set active when EvenAppBridge is unavailable', () => {
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

    it('sets active and registers audio callback when EvenAppBridge is available', () => {
      const audioDataCallback: Array<(data: Float32Array) => void> = []
      const mockBridge = {
        audioControl: vi.fn(),
        onAudioData: vi.fn((cb: (data: Float32Array) => void) => {
          audioDataCallback.push(cb)
        }),
      }
      window.EvenAppBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.start()
      expect(bridge.active).toBe(true)
      expect(mockBridge.audioControl).toHaveBeenCalledWith(true)
      expect(mockBridge.onAudioData).toHaveBeenCalledTimes(1)

      delete (window as unknown as Record<string, unknown>).EvenAppBridge
    })

    it('ignores duplicate start calls', () => {
      const mockBridge = {
        audioControl: vi.fn(),
        onAudioData: vi.fn(),
      }
      window.EvenAppBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.start()
      bridge.start() // second call should be ignored
      expect(mockBridge.audioControl).toHaveBeenCalledTimes(1)

      delete (window as unknown as Record<string, unknown>).EvenAppBridge
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
        audioControl: vi.fn(),
        onAudioData: vi.fn(),
      }
      window.EvenAppBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.start()
      bridge.stop()

      expect(bridge.active).toBe(false)
      expect(mockBridge.audioControl).toHaveBeenCalledWith(false)
      // No samples fed → recorder.stop() returns null → onCancelled
      expect(onCancelled).toHaveBeenCalledTimes(1)
      expect(onComplete).not.toHaveBeenCalled()

      delete (window as unknown as Record<string, unknown>).EvenAppBridge
    })

    it('calls onRecordingComplete when samples were recorded', () => {
      const audioDataCallback: Array<(data: Float32Array) => void> = []
      const mockBridge = {
        audioControl: vi.fn(),
        onAudioData: vi.fn((cb: (data: Float32Array) => void) => {
          audioDataCallback.push(cb)
        }),
      }
      window.EvenAppBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.start()

      // Feed audio data through the callback
      const samples = new Float32Array([0.5, -0.3, 0.1])
      audioDataCallback[0](samples)

      bridge.stop()

      expect(bridge.active).toBe(false)
      expect(mockBridge.audioControl).toHaveBeenCalledWith(false)
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onCancelled).not.toHaveBeenCalled()

      // Verify the blob
      const blob = onComplete.mock.calls[0][0]
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('audio/wav')
      expect(blob.size).toBe(44 + 3 * 2) // 44 header + 3 samples * 2 bytes

      delete (window as unknown as Record<string, unknown>).EvenAppBridge
    })
  })

  describe('cancel', () => {
    it('cancels active recording and fires onCancelled', () => {
      const mockBridge = {
        audioControl: vi.fn(),
        onAudioData: vi.fn(),
      }
      window.EvenAppBridge = mockBridge

      const bridge = new EvenAudioBridge({
        recorder,
        onRecordingComplete: onComplete,
        onRecordingCancelled: onCancelled,
      })

      bridge.start()
      bridge.cancel()

      expect(bridge.active).toBe(false)
      expect(mockBridge.audioControl).toHaveBeenCalledWith(false)
      expect(onCancelled).toHaveBeenCalledTimes(1)
      expect(onComplete).not.toHaveBeenCalled()

      delete (window as unknown as Record<string, unknown>).EvenAppBridge
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
