import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react'
import type { Session, ChatMessage, AgentResponse, BridgeConfig } from '../types'
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
import { loadConfig, saveConfig } from '../storage'
import { EvenAudioBridge } from '../audio'
import { AudioRecorder } from '../audio/recorder'
import { setupLifecycle } from '../lifecycle'

interface AppContextValue {
  config: BridgeConfig
  setConfig: (config: BridgeConfig) => void
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
  renameSession: (id: string, name: string) => Promise<void>
  sendText: (content: string) => Promise<void>
  startRecording: () => void
  stopRecording: () => void
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

  const audioBridgeRef = useRef<EvenAudioBridge | null>(null)

  const setConfig = useCallback((c: BridgeConfig) => {
    setConfigState(c)
    saveConfig(c)
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
      // Touch updated_at so session bubbles to top in glasses list
      const now = new Date().toISOString()
      setSessions((prev) =>
        prev.map((s) => s.id === session.id ? { ...s, updated_at: now } : s),
      )
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

  const renameSession = useCallback(async (id: string, name: string) => {
    try {
      const updated = await api.renameSession(configRef.current, id, name)
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)))
      if (currentSession?.id === id) {
        setCurrentSession(updated)
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
    if (!currentSession || isRecording) return
    const recorder = new AudioRecorder()

    const bridge = new EvenAudioBridge({
      recorder,
      onRecordingComplete: async (blob: Blob) => {
        setIsRecording(false)
        setError(null)

        try {
          const result = await api.sendAudio(configRef.current, currentSession.id, blob)

          // Add transcript as user message
          const userMsg: ChatMessage = {
            id: uuid(),
            role: 'user',
            content: result.transcript,
            created_at: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, userMsg])

          // Extract assistant response text with fallbacks
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

    if (!bridge) return

    if (bridge.active) {
      // Bridge was actively recording — stop() fires onRecordingComplete
      // or onRecordingCancelled, which calls setIsRecording(false).
      bridge.stop()
    } else {
      // Bridge exists but never started (e.g., start() failed silently).
      // No callback will fire, so reset the recording state directly to
      // prevent the UI from getting stuck in "Recording" state.
      setIsRecording(false)
    }
  }, [])

  // Auto-dismiss errors after 8 seconds
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 8000)
    return () => clearTimeout(timer)
  }, [error])

  // Auto-connect on mount if config exists
  useEffect(() => {
    if (config.url && config.token) {
      connect()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        connected, sessions,
        currentSession, messages,
        isLoading, isRecording, error,
        connect, disconnect,
        refreshSessions, openSession, closeSession,
        newSession, removeSession, renameSession,
        sendText, startRecording, stopRecording,
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
