import type { Session, ChatMessage, AgentResponse, BridgeConfig } from './types'

/** Default request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 30_000

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

/** Check if the Bridge is reachable and configured. */
export async function healthCheck(config: BridgeConfig): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${config.url}/health`)
    return res.ok
  } catch {
    return false
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
): Promise<AgentResponse> {
  const res = await fetchWithTimeout(`${config.url}/v1/sessions/${sessionId}/message`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const detail = await extractErrorMessage(res, `Failed to send message: ${res.status}`)
    throw new Error(detail)
  }
  return res.json()
}

/** Upload WAV audio, get transcript + AI response. */
export async function sendAudio(
  config: BridgeConfig,
  sessionId: string,
  audioBlob: Blob,
): Promise<{ transcript: string; response: AgentResponse }> {
  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.wav')

  const res = await fetchWithTimeout(`${config.url}/v1/sessions/${sessionId}/audio`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
    body: formData,
  })
  if (!res.ok) {
    const detail = await extractErrorMessage(res, `Failed to send audio: ${res.status}`)
    throw new Error(detail)
  }
  return res.json()
}
