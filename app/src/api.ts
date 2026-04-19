import type { Session, ChatMessage, AgentResponse, BridgeConfig } from './types'

/** Default request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 30_000

/**
 * Default agent response timeout in milliseconds.
 * This is used when the bridge doesn't report an agent_timeout
 * and the user hasn't configured a custom override.
 * Matches the bridge's default G2_AGENT_TIMEOUT of 300s.
 */
const DEFAULT_AGENT_TIMEOUT_MS = 300_000

/** Create a fetch with automatic timeout. */
async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Extract a human-readable error message from a non-OK response body. */
async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    if (body?.detail) return body.detail
  } catch {
    // Response body not JSON — use fallback
  }
  return fallback
}

/** Build authenticated headers for Bridge API requests. */
function headers(config: BridgeConfig, json = true): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
  }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

/** Response shape from the /health endpoint. */
interface HealthResponse {
  status: string
  version: string
  agent_timeout: number // seconds, reported by bridge
}

/** Result of a health check — connection status + bridge-reported timeout. */
export interface HealthResult {
  ok: boolean
  agentTimeoutMs: number
}

/**
 * Check if the Bridge is reachable and configured.
 *
 * Returns the connection status and the bridge's agent_timeout
 * (converted to ms) so the app can align its request timeout
 * with the server-side wait duration.
 */
export async function healthCheck(config: BridgeConfig): Promise<HealthResult> {
  try {
    const res = await fetchWithTimeout(`${config.url}/health`)
    if (!res.ok) return { ok: false, agentTimeoutMs: DEFAULT_AGENT_TIMEOUT_MS }

    const data: HealthResponse = await res.json()
    // Bridge reports timeout in seconds; convert to milliseconds
    const agentTimeoutMs = data.agent_timeout > 0
      ? data.agent_timeout * 1000
      : DEFAULT_AGENT_TIMEOUT_MS

    return { ok: true, agentTimeoutMs }
  } catch {
    return { ok: false, agentTimeoutMs: DEFAULT_AGENT_TIMEOUT_MS }
  }
}

/** Create a new chat session. */
export async function createSession(config: BridgeConfig, name?: string): Promise<Session> {
  const body = name ? { name } : {}
  const res = await fetchWithTimeout(`${config.url}/v1/sessions`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await extractErrorMessage(res, `Failed to create session: ${res.status}`)
    throw new Error(detail)
  }
  return res.json()
}

/** List all sessions. */
export async function listSessions(config: BridgeConfig): Promise<Session[]> {
  const res = await fetchWithTimeout(`${config.url}/v1/sessions`, {
    headers: headers(config, false),
  })
  if (!res.ok) {
    const detail = await extractErrorMessage(res, `Failed to list sessions: ${res.status}`)
    throw new Error(detail)
  }
  return res.json()
}

/** Get a single session with message history. */
export async function getSession(config: BridgeConfig, id: string): Promise<Session & { messages: ChatMessage[] }> {
  const res = await fetchWithTimeout(`${config.url}/v1/sessions/${id}`, {
    headers: headers(config, false),
  })
  if (!res.ok) {
    const detail = await extractErrorMessage(res, `Failed to get session: ${res.status}`)
    throw new Error(detail)
  }
  return res.json()
}

/** Delete a session. */
export async function deleteSession(config: BridgeConfig, id: string): Promise<void> {
  const res = await fetchWithTimeout(`${config.url}/v1/sessions/${id}`, {
    method: 'DELETE',
    headers: headers(config, false),
  })
  if (!res.ok) {
    const detail = await extractErrorMessage(res, `Failed to delete session: ${res.status}`)
    throw new Error(detail)
  }
}

/**
 * Delete multiple sessions in bulk. Returns the count of deleted sessions.
 *
 * Handles >100 sessions by batching — the server's BulkDeleteRequest has
 * a max_length=100 cap, so requests exceeding that limit are split into
 * batches of 100. Each batch is sent sequentially; if any batch fails,
 * the error propagates immediately.
 */
export async function bulkDeleteSessions(config: BridgeConfig, ids: string[]): Promise<number> {
  const BATCH_SIZE = 100
  let totalDeleted = 0

  // Batch to avoid 422 validation error from BulkDeleteRequest max_length=100
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE)
    const res = await fetchWithTimeout(`${config.url}/v1/sessions/bulk-delete`, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify({ session_ids: batch }),
    })
    if (!res.ok) {
      const detail = await extractErrorMessage(res, `Failed to delete sessions: ${res.status}`)
      throw new Error(detail)
    }
    const data = await res.json()
    totalDeleted += data.deleted_count
  }

  return totalDeleted
}

/** Rename a session. */
export async function renameSession(config: BridgeConfig, id: string, name: string): Promise<Session> {
  const res = await fetchWithTimeout(`${config.url}/v1/sessions/${id}`, {
    method: 'PATCH',
    headers: headers(config),
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const detail = await extractErrorMessage(res, `Failed to rename session: ${res.status}`)
    throw new Error(detail)
  }
  return res.json()
}

/** Send a text message and get AI response. */
export async function sendMessage(
  config: BridgeConfig,
  sessionId: string,
  content: string,
  agentTimeoutMs: number,
): Promise<AgentResponse> {
  const res = await fetchWithTimeout(`${config.url}/v1/sessions/${sessionId}/message`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ content }),
  }, agentTimeoutMs)
  if (!res.ok) {
    const detail = await extractErrorMessage(res, `Failed to send message: ${res.status}`)
    throw new Error(detail)
  }
  return res.json()
}

/**
 * Result of an audio upload via SSE streaming.
 * The transcript is delivered first (via callback), the agent response follows.
 */
export interface AudioStreamResult {
  transcript: string
  response: AgentResponse
}

/**
 * Upload WAV audio, receive transcript + AI response via SSE streaming.
 *
 * The audio endpoint returns a Server-Sent Events stream:
 * - Event "transcript": sent immediately after STT (~1.4s)
 * - Event "response": sent when the agent finishes
 * - Event "error": sent on agent failure (after transcript was delivered)
 *
 * The `onTranscript` callback fires as soon as the transcript is available,
 * allowing the UI to show the user's speech before the agent responds.
 */
export async function sendAudio(
  config: BridgeConfig,
  sessionId: string,
  audioBlob: Blob,
  agentTimeoutMs: number,
  onTranscript?: (text: string) => void,
): Promise<AudioStreamResult> {
  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.wav')

  const res = await fetchWithTimeout(`${config.url}/v1/sessions/${sessionId}/audio`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
    body: formData,
  }, agentTimeoutMs)

  if (!res.ok) {
    const detail = await extractErrorMessage(res, `Failed to send audio: ${res.status}`)
    throw new Error(detail)
  }

  // Parse SSE stream
  return parseAudioSSE(res, onTranscript)
}

/**
 * Parse an SSE response from the audio endpoint.
 *
 * SSE format: lines of "data: {json}\n\n"
 * Event types: "transcript", "response", "error"
 */
async function parseAudioSSE(
  res: Response,
  onTranscript?: (text: string) => void,
): Promise<AudioStreamResult> {
  const reader = res.body?.getReader()
  if (!reader) {
    throw new Error('No response body for SSE stream')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let transcript = ''
  let response: AgentResponse | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete SSE events (delimited by \n\n)
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)

        for (const line of chunk.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue

          const payload = trimmed.slice(6) // Remove "data: " prefix
          let event: { type: string; [key: string]: unknown }
          try {
            event = JSON.parse(payload)
          } catch {
            console.warn('[Caduceus] Failed to parse SSE event:', payload.slice(0, 100))
            continue
          }

          switch (event.type) {
            case 'transcript': {
              transcript = event.text as string
              onTranscript?.(transcript)
              break
            }
            case 'response': {
              response = event.data as AgentResponse
              break
            }
            case 'error': {
              throw new Error(event.message as string)
            }
            default: {
              console.warn('[Caduceus] Unknown SSE event type:', event.type)
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (!transcript) {
    throw new Error('No transcript received in SSE stream')
  }
  if (!response) {
    throw new Error('No agent response received in SSE stream')
  }

  return { transcript, response }
}
