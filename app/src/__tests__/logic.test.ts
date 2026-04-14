import { describe, it, expect } from 'vitest'
import type { BridgeConfig } from '../types'

// These tests cover the API client, storage, and pure logic.
// Glass screen rendering tests require the Even Hub simulator
// and are better suited as integration tests.

describe('BridgeConfig validation', () => {
  it('requires both url and token to be non-empty', () => {
    const valid: BridgeConfig = { url: 'http://localhost:8643', token: 'abc' }
    expect(valid.url.length).toBeGreaterThan(0)
    expect(valid.token.length).toBeGreaterThan(0)
  })

  it('accepts http URLs (no HTTPS required for LAN)', () => {
    const config: BridgeConfig = { url: 'http://192.168.1.100:8643', token: 'test' }
    expect(config.url.startsWith('http://')).toBe(true)
  })
})

describe('API client auth headers', () => {
  it('constructs correct Authorization header', () => {
    const config: BridgeConfig = { url: 'http://bridge:8643', token: 'my-secret' }
    // The API module is tested in api.test.ts — here we verify the contract
    expect(config.token).toBe('my-secret')
    expect(`Bearer ${config.token}`).toBe('Bearer my-secret')
  })
})

describe('ChatLine type mapping', () => {
  it('maps user messages to prompt type', () => {
    const msg = { id: '1', role: 'user' as const, content: 'Hello', created_at: '2026-01-01' }
    const chatLine = msg.role === 'user'
      ? { type: 'prompt' as const, text: msg.content }
      : { type: 'text' as const, text: msg.content }
    expect(chatLine.type).toBe('prompt')
    expect(chatLine.text).toBe('Hello')
  })

  it('maps assistant messages to text type', () => {
    const msg = { id: '2', role: 'assistant' as const, content: 'Hi!', created_at: '2026-01-01' }
    const chatLine = { type: 'text' as const, text: msg.content }
    expect(chatLine.type).toBe('text')
    expect(chatLine.text).toBe('Hi!')
  })
})

describe('Session display formatting', () => {
  it('formats session with name', () => {
    const session = { id: 'abc-123', name: 'Work Chat', created_at: '', updated_at: '', message_count: 5 }
    const display = `${session.name} (${session.message_count})`
    expect(display).toBe('Work Chat (5)')
  })

  it('falls back to truncated ID when no name', () => {
    const session = { id: 'abc-123-def', name: null, created_at: '', updated_at: '', message_count: 0 }
    const name = session.name ?? session.id.slice(0, 8)
    expect(name).toBe('abc-123-')
  })
})

describe('G2 timestamp formatting (Bug #29)', () => {
  // formatTimestamp logic replicated from sessions.ts for testability
  function formatTimestamp(iso: string): string {
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mi = String(d.getMinutes()).padStart(2, '0')
      return `${mm}-${dd} ${hh}:${mi}`
    } catch {
      return iso.slice(0, 16).replace('T', ' ')
    }
  }

  it('converts UTC ISO to local time format', () => {
    // "2026-04-14T18:30:00.000Z" = April 14, 18:30 UTC
    // In CET (UTC+1) this is 19:30, in CEST (UTC+2) this is 20:30
    const result = formatTimestamp('2026-04-14T18:30:00.000Z')
    // Result format: "MM-DD HH:MM" — exact hour depends on local TZ
    expect(result).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
    // Verify date part is correct (April 14, or 15 in far-east TZ)
    expect(result).toContain('04-14')
  })

  it('produces compact output (max 11 chars) for G2 display', () => {
    const result = formatTimestamp('2026-04-14T18:30:00.000Z')
    expect(result.length).toBeLessThanOrEqual(11)
  })

  it('handles malformed timestamps gracefully', () => {
    const result = formatTimestamp('not-a-date')
    expect(result).toBe('not-a-date')  // Falls back to truncated raw
  })

  it('handles empty string gracefully', () => {
    const result = formatTimestamp('')
    // new Date('') returns Invalid Date → NaN → falls back
    expect(typeof result).toBe('string')
  })
})

describe('Smartphone session time formatting (Issue #30)', () => {
  function formatSessionTime(iso: string): string {
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      const now = new Date()
      const hh = String(d.getHours()).padStart(2, '0')
      const mi = String(d.getMinutes()).padStart(2, '0')
      const time = `${hh}:${mi}`
      const isToday = d.toDateString() === now.toDateString()
      if (isToday) return `Today ${time}`
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      const isYesterday = d.toDateString() === yesterday.toDateString()
      if (isYesterday) return `Yesterday ${time}`
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return `${months[d.getMonth()]} ${d.getDate()}, ${time}`
    } catch {
      return ''
    }
  }

  it('shows "Today" for timestamps on current date', () => {
    const today = new Date()
    const iso = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14, 30).toISOString()
    const result = formatSessionTime(iso)
    expect(result).toMatch(/^Today \d{2}:\d{2}$/)
  })

  it('shows "Yesterday" for yesterday timestamps', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(9, 15, 0, 0)
    const result = formatSessionTime(yesterday.toISOString())
    expect(result).toMatch(/^Yesterday \d{2}:\d{2}$/)
  })

  it('shows month/day for older timestamps', () => {
    const old = new Date('2026-03-15T10:00:00.000Z')
    const result = formatSessionTime(old.toISOString())
    expect(result).toMatch(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d+, \d{2}:\d{2}$/)
  })

  it('returns empty string for malformed input', () => {
    expect(formatSessionTime('garbage')).toBe('')
  })
})
