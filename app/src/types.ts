/** Session returned by the G2 Bridge API. */
export interface Session {
  id: string
  name: string | null
  created_at: string
  updated_at: string
  message_count: number
}

/** Message in a session (from Bridge history). */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

/** OpenAI Responses API compatible response from Bridge. */
export interface AgentResponse {
  id: string
  status: string
  conversation: string
  output: AgentOutputItem[]
  usage?: { input_tokens: number; output_tokens: number }
}

export interface AgentOutputItem {
  type: string
  role: string
  content: { type: string; text: string }[]
}

/** Bridge connection settings (persisted in localStorage). */
export interface BridgeConfig {
  url: string
  token: string
}

/** Recording behaviour settings (persisted in localStorage). */
export interface RecordingSettings {
  /** Whether VAD auto-stop is enabled (default: true). */
  autoStopEnabled: boolean
  /** Silence duration in ms before auto-stop triggers (default: 1500, range: 500-5000). */
  silenceTimeoutMs: number
}

/** App-wide state. */
export interface AppState {
  connected: boolean
  sessions: Session[]
  currentSession: Session | null
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
}
