import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react'
import type { Session, ChatMessage, AgentResponse, BridgeConfig, RecordingSettings } from '../types'
import { useLogBuffer, type LogEntry } from '../hooks/useLogBuffer'

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
} from '../storage'
import { EvenAudioBridge } from '../audio'
import { AudioRecorder } from '../audio/recorder'
import { setupLifecycle } from '../lifecycle'

interface AppContextValue {
  config: BridgeConfig
  setConfig: (config: BridgeConfig) => void
  recordingSettings: RecordingSettings
  setRecordingSettings: (settings: RecordingSettings) => void
  connected: boolean
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<BridgeConfig>(loadConfig)
  const [recordingSettings, setRecordingSettingsState] = useState<RecordingSettings>(loadRecordingSettings)
  const [connected, setConnected] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { entries: logEntries, clear: clearLogs } = useLogBuffer()

  const configRef = useRef(config)
  configRef.current = config

  // Ref to recording settings so the async callback in startRecording
  // always accesses the latest values without stale closure issues.
  const recordingSettingsRef = useRef(recordingSettings)
  recordingSettingsRef.current = recordingSettings

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

  /** Check bridge health and fetch sessions. */
  const connect = useCallback(async () => {
    const c = configRef.current
    if (!c.url || !c.token) return
    setError(null)
    try {
      const ok = await api.healthCheck(c)
      setConnected(ok)
      if (ok) {
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
    // Guard: need an active session, must not already be recording,
    // and must not be processing a previous recording's response.
    // Without the isLoading check, a second tap during audio processing
    // (sendAudio) would create a new bridge while the old one's callback
    // is still in-flight, leaving the UI in an inconsistent state.
    if (!currentSession || isRecording || isLoading) return

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

          const result = await api.sendAudio(configRef.current, session.id, blob)

          // Phase 1: Show transcript (user message) immediately so the user
          // can verify what was transcribed while the response renders.
          const userMsg: ChatMessage = {
            id: uuid(),
            role: 'user',
            content: result.transcript,
            created_at: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, userMsg])

          // Brief pause to force two separate renders — transcript first,
          // then response. Without this, React batches both setMessages
          // calls and the user sees Q&A appear simultaneously (#34).
          await new Promise(resolve => setTimeout(resolve, 150))

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
  }, [currentSession, isRecording, isLoading, refreshSessions])

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
    Promise.all([loadConfigFromBridge(), loadRecordingSettingsFromBridge()]).then(
      ([bridgeConfig, bridgeSettings]) => {
        if (cancelled) return

        // Use bridge config if it has credentials, otherwise keep localStorage seed
        const effectiveConfig = (bridgeConfig.url && bridgeConfig.token)
          ? bridgeConfig
          : configRef.current

        if (bridgeConfig.url && bridgeConfig.token) {
          setConfigState(bridgeConfig)
        }
        setRecordingSettingsState(bridgeSettings)

        // Auto-connect with whatever config is now available
        if (effectiveConfig.url && effectiveConfig.token) {
          api.healthCheck(effectiveConfig).then((ok) => {
            if (cancelled) return
            setConnected(ok)
            if (ok) {
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

  return (
    <AppContext.Provider
      value={{
        config, setConfig,
        recordingSettings, setRecordingSettings,
        connected, sessions,
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
