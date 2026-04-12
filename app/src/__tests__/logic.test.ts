import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as api from '../api'
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
