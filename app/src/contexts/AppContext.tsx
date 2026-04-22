import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react'
import type { Session, ChatMessage, AgentResponse, BridgeConfig, RecordingSettings, AgentTimeoutSettings } from '../types'
import { useLogBuffer, type LogEntry } from '../hooks/useLogBuffer'
import {
  MIN_AGENT_TIMEOUT_SEC,
  FALLBACK_AGENT_TIMEOUT_MS,
} from '../storage'

/** Generate a UUID v4, with fallback for WebViews without crypto.randomUUID(). */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC 4122 v4 fallback via Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

import * as api from '../api'
import {
  loadConfig, saveConfigToBridge,
  loadRecordingSettings, saveRecordingSettingsToBridge,
  loadConfigFromBridge, loadRecordingSettingsFromBridge,
  loadAgentTimeoutSettings, saveAgentTimeoutSettingsToBridge,
  loadAgentTimeoutSettingsFromBridge,
} from '../storage'
import { EvenAudioBridge } from '../audio'
import { AudioRecorder } from '../audio/recorder'
import { setupLifecycle } from '../lifecycle'

interface AppContextValue {
  config: BridgeConfig
  setConfig: (config: BridgeConfig) => void
  recordingSettings: RecordingSettings
  setRecordingSettings: (settings: RecordingSettings) => void
  agentTimeoutSettings: AgentTimeoutSettings
  setAgentTimeoutSettings: (settings: AgentTimeoutSettings) => void
  /** Effective agent timeout in ms (bridge-reported or user override). */
  agentTimeoutMs: number
  connected: boolean
  /** True when the app is disconnected and actively polling for bridge recovery. */
  isReconnecting: boolean
  sessions: Session[]
  currentSession: Session | null
  messages: ChatMessage[]
  isLoading: boolean
  isRecording: boolean
  error: string | null
  connect: () => Promise<void>
  disconnect: () => void
  refreshSessions: () => Promise<void>
  openSession: (session: Session) => Promise<void>
  closeSession: () => void
  newSession: (name?: string) => Promise<void>
  removeSession: (id: string) => Promise<void>
  bulkRemoveSessions: (ids: string[]) => Promise<void>
  renameSession: (id: string, name: string) => Promise<void>
  sendText: (content: string) => Promise<void>
  startRecording: () => void
  stopRecording: () => void
  cancelRecording: () => void
  logEntries: LogEntry[]
  clearLogs: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

/**
 * Extract assistant text from an AgentResponse with multiple fallback strategies.
 *
 * Strategy 1: OpenAI Responses API format — output[].content[].text (any type)
 * Strategy 2: Direct text on output items — output[].text
 */
function extractAssistantText(response: AgentResponse): string {
  let text = ''

  if (!response.output || response.output.length === 0) {
    console.warn('[Caduceus] Empty output in agent response:', JSON.stringify(response).slice(0, 200))
    return ''
  }

  for (const item of response.output) {
    if (item.content && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part.text) {
          text += part.text
        }
      }
    }
    // Fallback: direct text property (some API variants)
    if (!item.content && (item as unknown as Record<string, unknown>).text) {
      text += String((item as unknown as Record<string, unknown>).text)
    }
  }

  if (!text.trim()) {
    console.warn('[Caduceus] No text extracted from response:', JSON.stringify(response.output).slice(0, 300))
  }

  return text.trim()
}

/**
 * Compute the effective agent timeout in milliseconds.
 *
 * Priority:
 * 1. User override (agentTimeoutSec > 0) — clamped to MIN_AGENT_TIMEOUT_SEC
 * 2. Bridge-reported timeout (from /health response)
 * 3. Fallback default (300s)
 */
function computeAgentTimeoutMs(
  agentTimeoutSettings: AgentTimeoutSettings,
  bridgeTimeoutMs: number,
): number {
  if (agentTimeoutSettings.agentTimeoutSec > 0) {
    // User has set a custom override — enforce minimum
    return Math.max(MIN_AGENT_TIMEOUT_SEC, agentTimeoutSettings.agentTimeoutSec) * 1000
  }
  // No user override — use bridge-reported timeout or fallback
  return bridgeTimeoutMs > 0 ? bridgeTimeoutMs : FALLBACK_AGENT_TIMEOUT_MS
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<BridgeConfig>(loadConfig)
  const [recordingSettings, setRecordingSettingsState] = useState<RecordingSettings>(loadRecordingSettings)
  const [agentTimeoutSettings, setAgentTimeoutSettingsState] = useState<AgentTimeoutSettings>(loadAgentTimeoutSettings)
  const [connected, setConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bridge-reported timeout from /health (in ms). Updated on each health check.
  const [bridgeTimeoutMs, setBridgeTimeoutMs] = useState(FALLBACK_AGENT_TIMEOUT_MS)

  // Computed effective timeout
  const agentTimeoutMs = computeAgentTimeoutMs(agentTimeoutSettings, bridgeTimeoutMs)

  const { entries: logEntries, clear: clearLogs } = useLogBuffer()

  const configRef = useRef(config)
  configRef.current = config

  // Ref to recording settings so the async callback in startRecording
  // always accesses the latest values without stale closure issues.
  const recordingSettingsRef = useRef(recordingSettings)
  recordingSettingsRef.current = recordingSettings

  // Ref to agent timeout so async callbacks use the latest value
  const agentTimeoutMsRef = useRef(agentTimeoutMs)
  agentTimeoutMsRef.current = agentTimeoutMs

  // Keep a ref to currentSession so async callbacks (onRecordingComplete)
  // always access the latest session, even if the closure is stale.
  // This prevents sending audio to the wrong session after a session change.
  const currentSessionRef = useRef(currentSession)
  currentSessionRef.current = currentSession

  const audioBridgeRef = useRef<EvenAudioBridge | null>(null)

  const setConfig = useCallback((c: BridgeConfig) => {
    setConfigState(c)
    saveConfigToBridge(c)
  }, [])

  const setRecordingSettings = useCallback((s: RecordingSettings) => {
    setRecordingSettingsState(s)
    saveRecordingSettingsToBridge(s)
  }, [])

  const setAgentTimeoutSettings = useCallback((s: AgentTimeoutSettings) => {
    setAgentTimeoutSettingsState(s)
    saveAgentTimeoutSettingsToBridge(s)
  }, [])

  /** Check bridge health and fetch sessions. */
  const connect = useCallback(async () => {
    const c = configRef.current
    if (!c.url || !c.token) return
    setError(null)
    try {
      const result = await api.healthCheck(c)
      setConnected(result.ok)
      setBridgeTimeoutMs(result.agentTimeoutMs)
      if (result.ok) {
        const list = await api.listSessions(c)
        setSessions(list)
      }
    } catch (e) {
      setConnected(false)
      setError(e instanceof Error ? e.message : 'Connection failed')
    }
  }, [])

  const disconnect = useCallback(() => {
    setConnected(false)
    setSessions([])
    setCurrentSession(null)
    setMessages([])
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      const list = await api.listSessions(configRef.current)
      setSessions(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh sessions')
    }
  }, [])

  const openSession = useCallback(async (session: Session) => {
    setIsLoading(true)
    setError(null)
    try {
      const detail = await api.getSession(configRef.current, session.id)
      setCurrentSession(detail)
      setMessages(detail.messages ?? [])
      // Do NOT touch updated_at here — sessions should only reorder when
      // actual content changes (message sent/received). The bridge handles
      // this correctly via update_session_timestamp() in the message/audio routers.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open session')
    } finally {
      setIsLoading(false)
    }
  }, [])

  /** Close current session — return to home without disconnecting. */
  const closeSession = useCallback(() => {
    setCurrentSession(null)
    setMessages([])
  }, [])

  const newSession = useCallback(async (name?: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const session = await api.createSession(configRef.current, name)
      setSessions((prev) => [session, ...prev])
      setCurrentSession(session)
      setMessages([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const removeSession = useCallback(async (id: string) => {
    try {
      await api.deleteSession(configRef.current, id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (currentSession?.id === id) {
        setCurrentSession(null)
        setMessages([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete session')
    }
  }, [currentSession])

  /**
   * Delete multiple sessions at once via bulk API.
   *
   * Throws on failure so the caller (SessionsScreen.handleBulkDelete) can
   * display a local error message. Previously errors were silently caught
   * here and only set on the global error state — which was invisible on
   * the SessionsScreen.
   */
  const bulkRemoveSessions = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      await api.bulkDeleteSessions(configRef.current, ids)
      setSessions((prev) => prev.filter((s) => !ids.includes(s.id)))
      if (currentSession && ids.includes(currentSession.id)) {
        setCurrentSession(null)
        setMessages([])
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete sessions'
      setError(msg)
      throw e // Re-throw so caller can show local error feedback
    }
  }, [currentSession])

  const renameSession = useCallback(async (id: string, name: string) => {
    try {
      const updated = await api.renameSession(configRef.current, id, name)
      // Preserve the original updated_at from state, not the API response.
      // The backend no longer bumps updated_at on rename (issue #45),
      // but this guard ensures session order stays stable even if the
      // backend response somehow has a different timestamp.
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s
          return { ...updated, updated_at: s.updated_at }
        }),
      )
      if (currentSession?.id === id) {
        setCurrentSession((prev) => prev ? { ...updated, updated_at: prev.updated_at } : updated)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename session')
    }
  }, [currentSession])

  /** Send text message to current session via Bridge. */
  const sendText = useCallback(async (content: string) => {
    if (!currentSession) return
    setIsLoading(true)
    setError(null)

    // Optimistically add user message
    const userMsg: ChatMessage = {
      id: uuid(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const response: AgentResponse = await api.sendMessage(
        configRef.current,
        currentSession.id,
        content,
        agentTimeoutMsRef.current,
      )

      // Extract assistant text from response with fallbacks
      const assistantText = extractAssistantText(response)

      if (!assistantText) {
        setError('Received empty response from agent')
        // Remove optimistic user message — no point keeping it without a reply
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
        return
      }

      const assistantMsg: ChatMessage = {
        id: response.id ?? uuid(),
        role: 'assistant',
        content: assistantText,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])

      // Refresh session list to update message_count
      refreshSessions()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message')
      // Remove optimistic user message on failure
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
    } finally {
      setIsLoading(false)
    }
  }, [currentSession, refreshSessions])

  /** Start voice recording via G2 glasses. */
  const startRecording = useCallback(() => {
    // Guard: need an active session and must not already be recording.
    // We no longer block on isLoading — the server-side per-session lock
    // (issue #58) serializes concurrent requests so the second message
    // waits for the first to complete and sees it in conversation history.
    if (!currentSession || isRecording) return

    // Build recorder options from user-configured recording settings.
    // When auto-stop is disabled, set silenceTimeoutMs to Infinity so
    // the VAD auto-stop logic in feedPCMSamples() never triggers.
    const rs = recordingSettingsRef.current
    const recorderOptions = {
      silenceTimeoutMs: rs.autoStopEnabled ? rs.silenceTimeoutMs : Infinity,
    }

    const recorder = new AudioRecorder(recorderOptions)

    const bridge = new EvenAudioBridge({
      recorder,
      onRecordingComplete: async (blob: Blob) => {
        // Transition: Recording → Thinking (no idle gap)
        // isLoading maps to isProcessing in the G2 glasses snapshot,
        // which shows "Thinking" in the header. This eliminates the
        // confusing idle gap between recording stop and result display.
        setIsRecording(false)
        setIsLoading(true)
        setError(null)

        try {
          // Use currentSessionRef to get the latest session, not the
          // stale closure value. This handles the edge case where the
          // session changes between start and completion.
          const session = currentSessionRef.current
          if (!session) {
            console.warn('[Caduceus] Session lost during recording — discarding audio')
            return
          }

          // SSE streaming: transcript arrives first (~1.4s after STT),
          // then the agent response. The onTranscript callback shows
          // the user's speech immediately before "Thinking" continues.
          const result = await api.sendAudio(
            configRef.current,
            session.id,
            blob,
            agentTimeoutMsRef.current,
            (transcript: string) => {
              // Phase 1: Show transcript immediately — the user sees
              // what was understood while the agent is still thinking.
              const userMsg: ChatMessage = {
                id: uuid(),
                role: 'user',
                content: transcript,
                created_at: new Date().toISOString(),
              }
              setMessages((prev) => [...prev, userMsg])
            },
          )

          // Phase 2: Show assistant response
          const assistantText = extractAssistantText(result.response)

          if (!assistantText) {
            setError('Received empty response from agent')
            return
          }

          const assistantMsg: ChatMessage = {
            id: result.response.id ?? uuid(),
            role: 'assistant',
            content: assistantText,
            created_at: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, assistantMsg])
          refreshSessions()
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to process audio')
        } finally {
          setIsLoading(false)
        }
      },
      onRecordingCancelled: () => {
        setIsRecording(false)
      },
    })

    // Verify EvenAppBridge is available BEFORE entering recording state.
    // Without this check, setIsRecording(true) would leave the UI stuck in
    // "Recording" if the bridge is unavailable (e.g., browser/simulator).
    if (!bridge.isAvailable()) {
      console.warn('[Caduceus] Cannot start recording: EvenAppBridge not available')
      return
    }

    audioBridgeRef.current = bridge
    setIsRecording(true)
    bridge.start()
  }, [currentSession, isRecording, refreshSessions])

  /** Stop voice recording. */
  const stopRecording = useCallback(() => {
    const bridge = audioBridgeRef.current
    audioBridgeRef.current = null

    if (!bridge) {
      // No bridge — just reset state if still recording (handles edge case
      // where VAD auto-stop already cleaned up the bridge ref but isRecording
      // hasn't been cleared yet due to React batching).
      setIsRecording(false)
      return
    }

    if (bridge.active) {
      // Bridge was actively recording — stop() fires onRecordingComplete
      // or onRecordingCancelled, which calls setIsRecording(false).
      bridge.stop()
    } else {
      // Bridge exists but already stopped (e.g., VAD auto-stop already fired
      // onRecordingComplete, or start() failed silently). Reset the recording
      // state directly to prevent the UI from getting stuck.
      setIsRecording(false)
    }
  }, [])

  /** Cancel voice recording — stop mic and discard audio (no send to bridge). */
  const cancelRecording = useCallback(() => {
    const bridge = audioBridgeRef.current
    audioBridgeRef.current = null

    if (!bridge) {
      // No bridge — just reset state if still recording
      setIsRecording(false)
      return
    }

    if (bridge.active) {
      // cancel() fires onRecordingCancelled which calls setIsRecording(false).
      // The audio is discarded — no onRecordingComplete fires.
      bridge.cancel()
    } else {
      setIsRecording(false)
    }
  }, [])

  // Auto-dismiss errors after 8 seconds
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 8000)
    return () => clearTimeout(timer)
  }, [error])

  // On mount: load persisted config from Even Hub bridge storage, then
  // auto-connect. This replaces two separate effects that raced — the old
  // auto-connect fired from localStorage (empty after WebView reload) before
  // the async bridge load resolved, so the app never connected on reopen.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      loadConfigFromBridge(),
      loadRecordingSettingsFromBridge(),
      loadAgentTimeoutSettingsFromBridge(),
    ]).then(
      ([bridgeConfig, bridgeSettings, timeoutSettings]) => {
        if (cancelled) return

        // Use bridge config if it has credentials, otherwise keep localStorage seed
        const effectiveConfig = (bridgeConfig.url && bridgeConfig.token)
          ? bridgeConfig
          : configRef.current

        if (bridgeConfig.url && bridgeConfig.token) {
          setConfigState(bridgeConfig)
        }
        setRecordingSettingsState(bridgeSettings)
        setAgentTimeoutSettingsState(timeoutSettings)

        // Auto-connect with whatever config is now available
        if (effectiveConfig.url && effectiveConfig.token) {
          api.healthCheck(effectiveConfig).then((result) => {
            if (cancelled) return
            setConnected(result.ok)
            setBridgeTimeoutMs(result.agentTimeoutMs)
            if (result.ok) {
              api.listSessions(effectiveConfig).then((list) => {
                if (!cancelled) setSessions(list)
              }).catch(() => { /* non-fatal */ })
            }
          }).catch(() => { /* health check failed — stay disconnected */ })
        }
      },
    ).catch(() => { /* bridge unavailable — localStorage values already in use */ })
    return () => { cancelled = true }
  }, [])

  // Foreground/background lifecycle: keep-alive, cleanup recording, reconnect
  useEffect(() => {
    return setupLifecycle({
      keepAliveIntervalMs: 30_000,
      onForeground: () => {
        // Re-check bridge health when returning to foreground
        if (config.url && config.token) {
          connect()
        }
      },
      onBackground: () => {
        // Stop any active recording to free audio resources
        if (isRecording) {
          stopRecording()
        }
      },
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Automatic reconnection when disconnected ──────────────────────
  // When the bridge becomes unreachable, periodically poll /health
  // with exponential backoff (10s → 20s → 30s → 30s…). On success,
  // restore the full connection state via the existing connect() flow.
  // The interval stops as soon as the app reconnects.
  useEffect(() => {
    // Only activate when: disconnected AND we have credentials to retry
    if (connected || !config.url || !config.token) {
      setIsReconnecting(false)
      return
    }

    setIsReconnecting(true)

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempt = 0

    // Backoff schedule: 10s, 20s, 30s, 30s, 30s, …
    const BACKOFF_CAP_MS = 30_000
    function getDelay(): number {
      const base = Math.min(BACKOFF_CAP_MS, 10_000 * (attempt + 1))
      attempt++
      return base
    }

    function poll() {
      if (cancelled) return
      timer = setTimeout(async () => {
        if (cancelled) return
        try {
          const result = await api.healthCheck(configRef.current)
          if (cancelled) return
          if (result.ok) {
            // Bridge is back — restore full state
            setConnected(true)
            setBridgeTimeoutMs(result.agentTimeoutMs)
            setIsReconnecting(false)
            const list = await api.listSessions(configRef.current)
            if (!cancelled) setSessions(list)
            return
          }
          // Still down — schedule next attempt
          poll()
        } catch {
          // Network error — schedule next attempt
          poll()
        }
      }, getDelay())
    }

    poll()

    return () => {
      cancelled = true
      clearTimeout(timer)
      setIsReconnecting(false)
    }
  }, [connected, config.url, config.token])

  return (
    <AppContext.Provider
      value={{
        config, setConfig,
        recordingSettings, setRecordingSettings,
        agentTimeoutSettings, setAgentTimeoutSettings,
        agentTimeoutMs,
        connected, isReconnecting, sessions,
        currentSession, messages,
        isLoading, isRecording, error,
        connect, disconnect,
        refreshSessions, openSession, closeSession,
        newSession, removeSession, bulkRemoveSessions, renameSession,
        sendText, startRecording, stopRecording, cancelRecording,
        logEntries, clearLogs,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
