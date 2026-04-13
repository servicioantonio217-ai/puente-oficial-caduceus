import { useCallback, useMemo, useRef } from 'react'
import { useGlasses } from 'even-toolkit/useGlasses'
import { appSplash } from './splash'
import { toDisplayData, onGlassAction, type AppSnapshot } from './selectors'
import type { AppActions, ScreenName } from './shared'
import { useApp } from '../contexts/AppContext'
import { MAX_GLASS_SESSIONS } from './ui-helpers'

/**
 * Glasses bridge component.
 *
 * Follows even-toolkit per-screen architecture:
 * - Each screen (home/sessions/chat) has its own display() + action()
 * - All screens use 'text' mode — no split layout
 * - Screen routing: home → sessions → chat
 * - useGlasses handles SDK bridge, display rendering, and input dispatch
 */
export function AppGlasses() {
  const {
    connected, sessions, currentSession, messages,
    isLoading, isRecording, error,
    newSession, openSession, closeSession, sendText, startRecording, stopRecording,
  } = useApp()

  // Screen routing: chat when session open, home otherwise
  const deriveScreenName = useCallback((): ScreenName => {
    if (currentSession) return 'chat'
    return 'home'
  }, [currentSession])

  // Sessions sorted by most recently active, capped for glasses display
  const sortedSessions = useMemo(
    () => [...sessions]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, MAX_GLASS_SESSIONS),
    [sessions],
  )

  // Build chat lines — pure content only, no status indicators.
  // Status (recording/processing) lives in the header & action bar, not in chat content.
  // Assistant messages get 2-space indent for visual grouping; user messages keep > prefix.
  const chatLines = useMemo(() => {
    const lines: Array<{ type: 'prompt' | 'text' | 'system' | 'error'; text: string }> = messages.map((msg) => {
      if (msg.role === 'user') return { type: 'prompt' as const, text: msg.content }
      // 2-space prefix creates visual indent for assistant messages
      if (msg.role === 'assistant') return { type: 'text' as const, text: `  ${msg.content}` }
      return { type: 'system' as const, text: msg.content }
    })
    // Show error as error line when idle (not recording, not processing)
    if (error && !isLoading && !isRecording) {
      // Truncate long errors to fit G2 display (~44 chars/line)
      const truncated = error.length > 40 ? error.slice(0, 37) + '...' : error
      lines.push({ type: 'error' as const, text: truncated })
    }
    return lines
  }, [messages, error, isLoading, isRecording])

  const snapshot: AppSnapshot = {
    screen: deriveScreenName(),
    connected,
    sessions: sortedSessions,
    currentSession,
    chatLines,
    isRecording,
    isProcessing: isLoading,
    error,
  }

  const snapshotRef = useMemo(() => ({ current: snapshot }), []) // eslint-disable-line react-hooks/exhaustive-deps
  snapshotRef.current = snapshot

  const getSnapshot = useCallback(() => snapshotRef.current, [snapshotRef])

  // navigate is unused — screen transitions are handled explicitly by action handlers
  // returning { ...nav, screen: 'targetScreen' }
  const navigate = useCallback((_s: ScreenName) => {
    // No-op: all screen changes go through action handler return values
  }, [])

  const goBack = useCallback(() => {
    // Returning from chat clears the current session context
    closeSession()
  }, [closeSession])

  const actions: AppActions = {
    navigate,
    goBack,
    openSession,
    newSession,
    sendMessage: sendText,
    toggleRecording: () => {
      if (isRecording) stopRecording()
      else startRecording()
    },
  }

  const ctxRef = useRef(actions)
  ctxRef.current = actions

  // Auto-scroll: wrap onGlassAction to reset scroll on new messages
  const lastMsgCountRef = useRef(0)

  const handleGlassAction = useCallback(
    (action: Parameters<typeof onGlassAction>[0], nav: Parameters<typeof onGlassAction>[1], snap: AppSnapshot) => {
      const result = onGlassAction(action, nav, snap, ctxRef.current)

      // Auto-scroll to bottom when new messages arrived since last action
      const msgCount = snap.chatLines.length
      if (msgCount !== lastMsgCountRef.current) {
        lastMsgCountRef.current = msgCount
        if (result.screen === 'chat') {
          return { ...result, highlightedIndex: 0 }
        }
      }

      return result
    },
    [],
  )

  const screenMapper = useCallback(() => {
    return deriveScreenName()
  }, [deriveScreenName])

  useGlasses({
    getSnapshot,
    toDisplayData,
    onGlassAction: handleGlassAction,
    deriveScreen: screenMapper,
    appName: 'Caduceus',
    splash: appSplash,
    getPageMode: () => 'text' as const,
  })

  return null
}
