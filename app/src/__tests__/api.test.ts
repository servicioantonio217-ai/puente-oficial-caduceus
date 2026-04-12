import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as api from '../api'
import type { BridgeConfig } from '../types'

const config: BridgeConfig = { url: 'http://localhost:8643', token: 'test-token' }

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

describe('api', () => {
  describe('healthCheck', () => {
    it('returns true on 200', async () => {
      mockFetch.mockResolvedValue({ ok: true })
      expect(await api.healthCheck(config)).toBe(true)
    })

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      expect(await api.healthCheck(config)).toBe(false)
    })

    it('returns false on non-200', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 })
      expect(await api.healthCheck(config)).toBe(false)
    })
  })

  describe('createSession', () => {
    it('POSTs to /v1/sessions and returns session', async () => {
      const session = { id: 'abc', name: 'Test', created_at: '2026-01-01', updated_at: '2026-01-01', message_count: 0 }
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(session) })

      const result = await api.createSession(config, 'Test')
      expect(result.id).toBe('abc')

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:8643/v1/sessions')
      expect(opts.method).toBe('POST')
      expect(opts.headers.Authorization).toBe('Bearer test-token')
      expect(JSON.parse(opts.body)).toEqual({ name: 'Test' })
    })

    it('throws on non-200', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 })
      await expect(api.createSession(config)).rejects.toThrow('Failed to create session: 401')
    })
  })

  describe('listSessions', () => {
    it('GETs /v1/sessions and returns list', async () => {
      const sessions = [{ id: 'abc', name: null, created_at: '2026-01-01', updated_at: '2026-01-01', message_count: 5 }]
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(sessions) })

      const result = await api.listSessions(config)
      expect(result).toHaveLength(1)
      expect(result[0].message_count).toBe(5)
    })
  })

  describe('deleteSession', () => {
    it('DELETEs session and returns void', async () => {
      mockFetch.mockResolvedValue({ ok: true })
      await expect(api.deleteSession(config, 'abc')).resolves.toBeUndefined()

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:8643/v1/sessions/abc')
      expect(opts.method).toBe('DELETE')
    })
  })

  describe('sendMessage', () => {
    it('POSTs message and returns agent response', async () => {
      const response = {
        id: 'resp-1',
        status: 'completed',
        conversation: 'abc',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello!' }] }],
      }
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(response) })

      const result = await api.sendMessage(config, 'abc', 'Hi')
      expect(result.id).toBe('resp-1')
      expect(result.output[0].content[0].text).toBe('Hello!')

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:8643/v1/sessions/abc/message')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ content: 'Hi' })
    })
  })
})
