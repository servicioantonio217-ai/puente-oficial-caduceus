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

  describe('sendAudio', () => {
    /** Build a mock SSE response from an array of events. */
    function mockSSEResponse(events: { type: string; [key: string]: unknown }[]) {
      const sseBody = events
        .map((e) => `data: ${JSON.stringify(e)}`)
        .join('\n\n') + '\n\n'

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseBody))
          controller.close()
        },
      })

      return {
        ok: true,
        status: 200,
        body: stream,
        json: () => Promise.resolve({}),
      }
    }

    it('parses transcript + response SSE events', async () => {
      const transcriptCallback = vi.fn()
      const agentResponse = {
        id: 'resp-1',
        status: 'completed',
        conversation: 'abc',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Sunny!' }] }],
      }

      mockFetch.mockResolvedValue(
        mockSSEResponse([
          { type: 'transcript', text: "what's the weather?" },
          { type: 'response', data: agentResponse },
        ]),
      )

      const result = await api.sendAudio(config, 'abc', new Blob(), transcriptCallback)

      expect(result.transcript).toBe("what's the weather?")
      expect(result.response.id).toBe('resp-1')
      expect(result.response.output[0].content[0].text).toBe('Sunny!')
      expect(transcriptCallback).toHaveBeenCalledTimes(1)
      expect(transcriptCallback).toHaveBeenCalledWith("what's the weather?")

      // Verify FormData upload (no Content-Type header — browser sets multipart boundary)
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:8643/v1/sessions/abc/audio')
      expect(opts.method).toBe('POST')
      expect(opts.headers.Authorization).toBe('Bearer test-token')
      expect(opts.body).toBeInstanceOf(FormData)
    })

    it('fires onTranscript callback before resolving with response', async () => {
      const callOrder: string[] = []
      const transcriptCallback = vi.fn(() => callOrder.push('transcript'))

      const agentResponse = {
        id: 'resp-2',
        status: 'completed',
        conversation: 'abc',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hi' }] }],
      }

      mockFetch.mockResolvedValue(
        mockSSEResponse([
          { type: 'transcript', text: 'hello' },
          { type: 'response', data: agentResponse },
        ]),
      )

      await api.sendAudio(config, 'abc', new Blob(), transcriptCallback)
      callOrder.push('resolved')

      expect(callOrder).toEqual(['transcript', 'resolved'])
    })

    it('throws on SSE error event', async () => {
      mockFetch.mockResolvedValue(
        mockSSEResponse([
          { type: 'transcript', text: 'hello' },
          { type: 'error', message: 'Agent timeout' },
        ]),
      )

      await expect(api.sendAudio(config, 'abc', new Blob())).rejects.toThrow('Agent timeout')
    })

    it('throws when no transcript received', async () => {
      const agentResponse = {
        id: 'resp-3',
        status: 'completed',
        conversation: 'abc',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hi' }] }],
      }

      mockFetch.mockResolvedValue(
        mockSSEResponse([{ type: 'response', data: agentResponse }]),
      )

      await expect(api.sendAudio(config, 'abc', new Blob())).rejects.toThrow('No transcript received')
    })

    it('throws when no agent response received', async () => {
      mockFetch.mockResolvedValue(
        mockSSEResponse([{ type: 'transcript', text: 'hello' }]),
      )

      await expect(api.sendAudio(config, 'abc', new Blob())).rejects.toThrow('No agent response received')
    })

    it('throws on non-200 HTTP response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 })

      await expect(api.sendAudio(config, 'abc', new Blob())).rejects.toThrow('Failed to send audio: 401')
    })

    it('throws when response body is null', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, body: null })

      await expect(api.sendAudio(config, 'abc', new Blob())).rejects.toThrow('No response body')
    })

    it('handles SSE events split across chunks', async () => {
      const transcriptCallback = vi.fn()

      // Split the SSE data into two chunks to test partial buffering
      const chunk1 = 'data: {"type":"transcript","text":"hello"}\n\n'
      const chunk2 = 'data: {"type":"response","data":{"id":"resp-4","status":"completed","conversation":"abc","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Yes"}]}]}}\n\n'

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(chunk1))
          controller.enqueue(encoder.encode(chunk2))
          controller.close()
        },
      })

      mockFetch.mockResolvedValue({ ok: true, status: 200, body: stream })

      const result = await api.sendAudio(config, 'abc', new Blob(), transcriptCallback)

      expect(result.transcript).toBe('hello')
      expect(result.response.id).toBe('resp-4')
      expect(transcriptCallback).toHaveBeenCalledWith('hello')
    })

    it('skips malformed SSE lines gracefully', async () => {
      const transcriptCallback = vi.fn()

      const sseBody =
        'data: {"type":"transcript","text":"hi"}\n\n' +
        'not-a-data-line\n\n' +
        'data: {invalid json\n\n' +
        'data: {"type":"response","data":{"id":"resp-5","status":"completed","conversation":"abc","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Ok"}]}]}}\n\n'

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseBody))
          controller.close()
        },
      })

      mockFetch.mockResolvedValue({ ok: true, status: 200, body: stream })

      const result = await api.sendAudio(config, 'abc', new Blob(), transcriptCallback)

      expect(result.transcript).toBe('hi')
      expect(result.response.id).toBe('resp-5')
    })

    it('works without onTranscript callback', async () => {
      const agentResponse = {
        id: 'resp-6',
        status: 'completed',
        conversation: 'abc',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done' }] }],
      }

      mockFetch.mockResolvedValue(
        mockSSEResponse([
          { type: 'transcript', text: 'test' },
          { type: 'response', data: agentResponse },
        ]),
      )

      // No callback — should not throw
      const result = await api.sendAudio(config, 'abc', new Blob())
      expect(result.transcript).toBe('test')
      expect(result.response.id).toBe('resp-6')
    })
  })

  describe('bulkDeleteSessions', () => {
    it('sends single batch for <=100 IDs', async () => {
      const ids = ['id-1', 'id-2', 'id-3']
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ deleted_count: 3 }) })

      const result = await api.bulkDeleteSessions(config, ids)
      expect(result).toBe(3)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:8643/v1/sessions/bulk-delete')
      expect(opts.method).toBe('POST')
      expect(JSON.parse(opts.body)).toEqual({ session_ids: ids })
    })

    it('batches into multiple requests for >100 IDs', async () => {
      // Generate 250 IDs to require 3 batches (100 + 100 + 50)
      const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ deleted_count: 100 }) })

      const result = await api.bulkDeleteSessions(config, ids)
      expect(result).toBe(300) // 3 batches × 100
      expect(mockFetch).toHaveBeenCalledTimes(3)

      // First batch: ids 0-99
      const batch1Body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(batch1Body.session_ids).toHaveLength(100)
      expect(batch1Body.session_ids[0]).toBe('id-0')
      expect(batch1Body.session_ids[99]).toBe('id-99')

      // Second batch: ids 100-199
      const batch2Body = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(batch2Body.session_ids).toHaveLength(100)
      expect(batch2Body.session_ids[0]).toBe('id-100')

      // Third batch: ids 200-249
      const batch3Body = JSON.parse(mockFetch.mock.calls[2][1].body)
      expect(batch3Body.session_ids).toHaveLength(50)
      expect(batch3Body.session_ids[0]).toBe('id-200')
    })

    it('throws immediately on first batch failure', async () => {
      const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`)
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ deleted_count: 100 }) })
        .mockResolvedValueOnce({ ok: false, status: 422, json: () => Promise.resolve({ detail: 'Too many' }) })

      await expect(api.bulkDeleteSessions(config, ids)).rejects.toThrow('Too many')
      expect(mockFetch).toHaveBeenCalledTimes(2) // First succeeded, second failed
    })

    it('throws on non-200 response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 })

      await expect(api.bulkDeleteSessions(config, ['id-1'])).rejects.toThrow('Failed to delete sessions: 401')
    })
  })
})
