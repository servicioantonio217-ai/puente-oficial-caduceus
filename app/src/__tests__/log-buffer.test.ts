import { describe, it, expect } from 'vitest'

/**
 * Tests for the log buffer filter logic from useLogBuffer.
 * The filter rules are tested as pure functions for determinism.
 * React hook behavior is tested via the existing app test infrastructure.
 */

// Replicate the filter constants and logic from useLogBuffer for unit testing
const NOISE_PATTERNS = [
  'audioPcm',
  '[EvenAppBridge]',
  'EvenHub event',
  'audioPcmSamples',
  'pcmData',
]

const MAX_ARG_LENGTH = 500

function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

function shouldFilter(args: unknown[]): boolean {
  for (const arg of args) {
    const str = typeof arg === 'string' ? arg : ''
    for (const pattern of NOISE_PATTERNS) {
      if (str.includes(pattern)) return true
    }
    const stringified = stringifyArg(arg)
    if (stringified.length > MAX_ARG_LENGTH) return true
  }
  return false
}

describe('Log buffer filter rules', () => {
  describe('noise pattern filtering', () => {
    it('filters audioPcm entries', () => {
      expect(shouldFilter(['audioPcm: [123, 456, 789]'])).toBe(true)
    })

    it('filters EvenAppBridge entries', () => {
      expect(shouldFilter(['[EvenAppBridge] Connection established'])).toBe(true)
    })

    it('filters EvenHub event entries', () => {
      expect(shouldFilter(['EvenHub event: type=audio'])).toBe(true)
    })

    it('filters audioPcmSamples entries', () => {
      expect(shouldFilter(['Received audioPcmSamples: 1024 bytes'])).toBe(true)
    })

    it('filters pcmData entries', () => {
      expect(shouldFilter(['pcmData buffer updated'])).toBe(true)
    })

    it('does NOT filter normal log messages', () => {
      expect(shouldFilter(['Session created: abc-123'])).toBe(false)
    })

    it('does NOT filter error messages', () => {
      expect(shouldFilter(['Error: Failed to connect to bridge'])).toBe(false)
    })

    it('does NOT filter Caduceus-tagged messages', () => {
      expect(shouldFilter(['[Caduceus] Recording started'])).toBe(false)
    })

    it('does NOT filter API response messages', () => {
      expect(shouldFilter(['API response: 200 OK'])).toBe(false)
    })

    it('filters when noise pattern is in a multi-arg log', () => {
      expect(shouldFilter(['Recording data:', 'audioPcm buffer'])).toBe(true)
    })

    it('does not filter when pattern appears in non-string arg', () => {
      // Non-string args don't match noise patterns (only size check applies)
      const largeObj = { data: 'audioPcm' }
      // stringified version is shorter than MAX_ARG_LENGTH
      expect(shouldFilter([largeObj])).toBe(false)
    })
  })

  describe('size filtering', () => {
    it('filters entries with args exceeding MAX_ARG_LENGTH', () => {
      const longString = 'x'.repeat(MAX_ARG_LENGTH + 1)
      expect(shouldFilter([longString])).toBe(true)
    })

    it('keeps entries at exactly MAX_ARG_LENGTH', () => {
      const exactString = 'x'.repeat(MAX_ARG_LENGTH)
      expect(shouldFilter([exactString])).toBe(false)
    })

    it('keeps entries just under MAX_ARG_LENGTH', () => {
      const shortString = 'x'.repeat(MAX_ARG_LENGTH - 1)
      expect(shouldFilter([shortString])).toBe(false)
    })

    it('filters large JSON objects', () => {
      // Simulates a large audio data object
      const largeObj = { audio: Array.from({ length: 200 }, (_, i) => i) }
      const stringified = JSON.stringify(largeObj)
      expect(stringified.length).toBeGreaterThan(MAX_ARG_LENGTH)
      expect(shouldFilter([largeObj])).toBe(true)
    })

    it('keeps small objects', () => {
      const smallObj = { type: 'message', content: 'Hello' }
      expect(shouldFilter([smallObj])).toBe(false)
    })
  })

  describe('combined filtering', () => {
    it('filters if ANY arg matches noise pattern', () => {
      expect(shouldFilter(['normal message', 'audioPcm data'])).toBe(true)
    })

    it('filters if ANY arg exceeds size limit', () => {
      expect(shouldFilter(['normal message', 'x'.repeat(MAX_ARG_LENGTH + 1)])).toBe(true)
    })

    it('passes when all args are clean', () => {
      expect(shouldFilter(['Session started', 'user: manuel'])).toBe(false)
    })

    it('handles empty args array', () => {
      expect(shouldFilter([])).toBe(false)
    })
  })
})
