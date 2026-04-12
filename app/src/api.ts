import type { Session, ChatMessage, AgentResponse, BridgeConfig } from './types'

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
    const res = await fetch(`${config.url}/health`)
    return res.ok
  } catch {
    return false
  }
}

/** Create a new chat session. */
export async function createSession(config: BridgeConfig, name?: string): Promise<Session> {
  const body = name ? { name } : {}
  const res = await fetch(`${config.url}/v1/sessions`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`)
  return res.json()
}

/** List all sessions. */
export async function listSessions(config: BridgeConfig): Promise<Session[]> {
  const res = await fetch(`${config.url}/v1/sessions`, {
    headers: headers(config, false),
  })
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`)
  return res.json()
}

/** Get a single session with message history. */
export async function getSession(config: BridgeConfig, id: string): Promise<Session & { messages: ChatMessage[] }> {
  const res = await fetch(`${config.url}/v1/sessions/${id}`, {
    headers: headers(config, false),
  })
  if (!res.ok) throw new Error(`Failed to get session: ${res.status}`)
  return res.json()
}

/** Delete a session. */
export async function deleteSession(config: BridgeConfig, id: string): Promise<void> {
  const res = await fetch(`${config.url}/v1/sessions/${id}`, {
    method: 'DELETE',
    headers: headers(config, false),
  })
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`)
}

/** Send a text message and get AI response. */
export async function sendMessage(
  config: BridgeConfig,
  sessionId: string,
  content: string,
): Promise<AgentResponse> {
  const res = await fetch(`${config.url}/v1/sessions/${sessionId}/message`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`)
  return res.json()
}
