import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pcmToWav, pcmToWavBuffer, calculateRMS, AudioRecorder } from '../audio/recorder'

// --- pcmToWav / pcmToWavBuffer ---

describe('pcmToWav', () => {
  it('produces a valid WAV blob with correct header', () => {
    const samples = new Float32Array([0.5, -0.5, 0.25, -0.25])
    const blob = pcmToWav(samples, 16000)

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(52) // 44 header + 4 samples * 2 bytes
  })

  it('produces correct file size for large input', () => {
    // 1600 samples at 16kHz = 100ms of audio
    const samples = new Float32Array(1600).fill(0.1)
    const blob = pcmToWav(samples, 16000)

    expect(blob.size).toBe(44 + 1600 * 2) // 44 header + 3200 data
  })
})

describe('pcmToWavBuffer', () => {
  it('produces a valid WAV buffer with correct header', () => {
    const samples = new Float32Array([0.5, -0.5, 0.25, -0.25])
    const buffer = pcmToWavBuffer(samples, 16000)
    const view = new DataView(buffer)

    // RIFF header
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
    expect(riff).toBe('RIFF')

    // WAVE format
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))
    expect(wave).toBe('WAVE')

    // fmt chunk
    const fmt = String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15))
    expect(fmt).toBe('fmt ')

    // PCM format (1)
    expect(view.getUint16(20, true)).toBe(1)

    // Mono (1 channel)
    expect(view.getUint16(22, true)).toBe(1)

    // Sample rate
    expect(view.getUint32(24, true)).toBe(16000)

    // Bits per sample (16)
    expect(view.getUint16(34, true)).toBe(16)

    // data chunk
    const data = String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39))
    expect(data).toBe('data')

    // Data size: 4 samples * 2 bytes = 8
    expect(view.getUint32(40, true)).toBe(8)

    // Total buffer size: 44 header + 8 data = 52
    expect(buffer.byteLength).toBe(52)
  })

  it('encodes positive samples correctly (S16LE)', () => {
    const samples = new Float32Array([1.0, 0.5, 0.0])
    const buffer = pcmToWavBuffer(samples, 16000)
    const view = new DataView(buffer)

    // +1.0 → 32767
    expect(view.getInt16(44, true)).toBe(32767)
    // +0.5 → 16383 (0.5 * 0x7FFF = 16383.5 → 16383)
    expect(view.getInt16(46, true)).toBe(16383)
    // 0.0 → 0
    expect(view.getInt16(48, true)).toBe(0)
  })

  it('encodes negative samples correctly (S16LE)', () => {
    const samples = new Float32Array([-1.0, -0.5])
    const buffer = pcmToWavBuffer(samples, 16000)
    const view = new DataView(buffer)

    // -1.0 → -32768
    expect(view.getInt16(44, true)).toBe(-32768)
    // -0.5 → -16384 (0.5 * 0x8000 = 16384)
    expect(view.getInt16(46, true)).toBe(-16384)
  })

  it('clips values outside [-1, 1] range', () => {
    const samples = new Float32Array([1.5, -2.0, 0.0])
    const buffer = pcmToWavBuffer(samples, 16000)
    const view = new DataView(buffer)

    // 1.5 clipped to 1.0 → 32767
    expect(view.getInt16(44, true)).toBe(32767)
    // -2.0 clipped to -1.0 → -32768
    expect(view.getInt16(46, true)).toBe(-32768)
  })

  it('handles empty samples (zero-length audio)', () => {
    const samples = new Float32Array([])
    const buffer = pcmToWavBuffer(samples, 16000)

    // Header only, no data
    expect(buffer.byteLength).toBe(44)
    expect(new DataView(buffer).getUint32(40, true)).toBe(0)
  })

  it('uses the provided sample rate', () => {
    const samples = new Float32Array([0.0])
    const buffer = pcmToWavBuffer(samples, 44100)
    const view = new DataView(buffer)

    expect(view.getUint32(24, true)).toBe(44100)
    // byte rate = 44100 * 1 * (16/8) = 88200
    expect(view.getUint32(28, true)).toBe(88200)
  })
})

// --- calculateRMS ---

describe('calculateRMS', () => {
  it('returns 0 for empty samples', () => {
    expect(calculateRMS(new Float32Array([]))).toBe(0)
  })

  it('returns 0 for all-silence', () => {
    expect(calculateRMS(new Float32Array([0, 0, 0, 0]))).toBe(0)
  })

  it('returns the amplitude for a constant signal', () => {
    // RMS of [0.5, 0.5, 0.5, 0.5] = sqrt(0.25) = 0.5
    expect(calculateRMS(new Float32Array([0.5, 0.5, 0.5, 0.5]))).toBeCloseTo(0.5, 5)
  })

  it('calculates RMS correctly for mixed signal', () => {
    // RMS of [0.3, 0.4] = sqrt((0.09 + 0.16) / 2) = sqrt(0.125) ≈ 0.35355
    const rms = calculateRMS(new Float32Array([0.3, 0.4]))
    expect(rms).toBeCloseTo(0.35355, 4)
  })

  it('handles a single sample', () => {
    expect(calculateRMS(new Float32Array([0.8]))).toBeCloseTo(0.8, 5)
  })
})

// --- AudioRecorder ---

describe('AudioRecorder', () => {
  let recorder: AudioRecorder
  let callbacks: { onAudioLevel: ReturnType<typeof vi.fn>; onSilenceStart: ReturnType<typeof vi.fn>; onSilenceEnd: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.useFakeTimers()
    callbacks = {
      onAudioLevel: vi.fn(),
      onSilenceStart: vi.fn(),
      onSilenceEnd: vi.fn(),
    }
    recorder = new AudioRecorder({
      silenceThreshold: 0.02,
      silenceTimeoutMs: 500,
      minDurationMs: 200,
      sampleRate: 16000,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses default options when none provided', () => {
    const defaultRecorder = new AudioRecorder()
    expect(defaultRecorder.recording).toBe(false)
  })

  it('respects custom silence threshold', () => {
    const customRecorder = new AudioRecorder({ silenceThreshold: 0.5 })
    expect(customRecorder.recording).toBe(false)
  })

  it('starts and stops recording', () => {
    recorder.start(callbacks)
    expect(recorder.recording).toBe(true)

    recorder.stop()
    expect(recorder.recording).toBe(false)
  })

  it('ignores start() when already recording', () => {
    recorder.start(callbacks)
    recorder.start(callbacks) // should be ignored
    expect(recorder.recording).toBe(true)
  })

  it('stop() returns null when no samples were fed', () => {
    recorder.start(callbacks)
    const blob = recorder.stop()
    expect(blob).toBeNull()
    expect(recorder.recording).toBe(false)
  })

  it('produces a WAV blob after feeding samples and stopping', () => {
    recorder.start(callbacks)
    recorder.feedPCMSamples(new Float32Array([0.5, -0.5, 0.3]))
    const blob = recorder.stop()

    expect(blob).not.toBeNull()
    expect(blob!.type).toBe('audio/wav')
    expect(blob!.size).toBe(44 + 3 * 2) // 44 header + 3 samples * 2 bytes
  })

  it('merges multiple sample chunks into one WAV', () => {
    recorder.start(callbacks)
    recorder.feedPCMSamples(new Float32Array([0.1, 0.2]))
    recorder.feedPCMSamples(new Float32Array([0.3]))
    recorder.feedPCMSamples(new Float32Array([0.4, 0.5]))
    const blob = recorder.stop()

    expect(blob).not.toBeNull()
    // 5 samples total
    expect(blob!.size).toBe(44 + 5 * 2)
  })

  it('calls onAudioLevel for each fed chunk', () => {
    recorder.start(callbacks)
    recorder.feedPCMSamples(new Float32Array([0.5, 0.5]))
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0]))

    expect(callbacks.onAudioLevel).toHaveBeenCalledTimes(2)
    expect(callbacks.onAudioLevel).toHaveBeenLastCalledWith(0)
  })

  it('detects silence and calls onSilenceStart', () => {
    recorder.start(callbacks)
    recorder.feedPCMSamples(new Float32Array([0.5, 0.5])) // speech
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0])) // silence

    expect(callbacks.onSilenceStart).toHaveBeenCalledTimes(1)
  })

  it('calls onSilenceEnd when speech resumes after silence', () => {
    recorder.start(callbacks)
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0])) // silence
    recorder.feedPCMSamples(new Float32Array([0.5, 0.5])) // speech resumes

    expect(callbacks.onSilenceEnd).toHaveBeenCalledTimes(1)
  })

  it('auto-stops on sustained silence (VAD)', () => {
    recorder.start(callbacks)
    recorder.feedPCMSamples(new Float32Array([0.5, 0.5])) // speech

    // Start silence
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0]))

    // Advance past silenceTimeout (500ms) and minDuration (200ms)
    vi.advanceTimersByTime(600)

    // Feed another silent chunk — triggers auto-stop check
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0]))

    expect(recorder.recording).toBe(false)
  })

  it('does not auto-stop if min duration has not been reached', () => {
    // minDurationMs = 200, silenceTimeoutMs = 500
    // Key: Date.now() IS faked by vi.useFakeTimers(), so we need to keep
    // the total elapsed time under minDurationMs (200ms).
    recorder.start(callbacks)

    // Feed silence immediately — silenceStart = Date.now() = T+0
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0]))

    // Advance only 100ms — total elapsed is 100ms, under minDurationMs (200)
    vi.advanceTimersByTime(100)

    // Feed another silent chunk — silenceDuration = 100ms < silenceTimeoutMs (500)
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0]))

    // Should NOT auto-stop: total elapsed (100ms) < minDurationMs (200ms)
    expect(recorder.recording).toBe(true)
  })

  it('auto-stops when both silence timeout AND min duration are met', () => {
    // minDurationMs = 200, silenceTimeoutMs = 500
    recorder.start(callbacks)

    // Feed speech
    recorder.feedPCMSamples(new Float32Array([0.5, 0.5]))

    // Advance past minDuration
    vi.advanceTimersByTime(300)

    // Start silence
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0]))

    // Advance past silenceTimeout
    vi.advanceTimersByTime(600)

    // Feed another silent chunk — should trigger auto-stop
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0]))

    expect(recorder.recording).toBe(false)
  })

  it('resets silence timer when speech resumes', () => {
    recorder.start(callbacks)

    // Speech
    recorder.feedPCMSamples(new Float32Array([0.5, 0.5]))
    // Start silence
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0]))

    // Advance 400ms (not yet past 500ms timeout)
    vi.advanceTimersByTime(400)

    // Speech resumes — silence timer resets
    recorder.feedPCMSamples(new Float32Array([0.5, 0.5]))
    expect(callbacks.onSilenceEnd).toHaveBeenCalledTimes(1)

    // Start silence again
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0]))

    // Advance only 300ms — should NOT auto-stop (silence only 300ms)
    vi.advanceTimersByTime(300)
    recorder.feedPCMSamples(new Float32Array([0.0, 0.0]))

    expect(recorder.recording).toBe(true)
  })

  it('cancel() discards all samples without producing output', () => {
    recorder.start(callbacks)

    recorder.feedPCMSamples(new Float32Array([0.5, 0.5, 0.3]))
    recorder.cancel()

    expect(recorder.recording).toBe(false)

    // Start a new recording — should not include old samples
    recorder.start(callbacks)
    recorder.feedPCMSamples(new Float32Array([0.1]))
    const blob = recorder.stop()

    expect(blob).not.toBeNull()
    // Only 1 sample from the new recording
    expect(blob!.size).toBe(44 + 1 * 2)
  })
})
