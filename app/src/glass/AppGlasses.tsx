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
    isLoading, isRecording, error: _error,
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

  // Build chat lines for the chat screen
  const chatLines = useMemo(() => {
    const lines = messages.map((msg) => {
      if (msg.role === 'user') return { type: 'prompt' as const, text: msg.content }
      if (msg.role === 'assistant') return { type: 'text' as const, text: msg.content }
      return { type: 'system' as const, text: msg.content }
    })

    // Add recording/thinking indicator
    if (isRecording) {
      return [...lines, { type: 'thinking-collapsed' as const, text: 'Listening...' }]
    }
    if (isLoading) {
      return [...lines, { type: 'thinking-collapsed' as const, text: 'Thinking...' }]
    }
    return lines
  }, [messages, isLoading, isRecording])

  const snapshot: AppSnapshot = {
    screen: deriveScreenName(),
    connected,
    sessions: sortedSessions,
    currentSession,
    chatLines,
    isRecording,
  }

  const snapshotRef = useMemo(() => ({ current: snapshot }), []) // eslint-disable-line react-hooks/exhaustive-deps
  snapshotRef.current = snapshot

  const getSnapshot = useCallback(() => snapshotRef.current, [snapshotRef])

  const navigate = useCallback((s: ScreenName) => {
    // Navigate to home means "go back" — close current session view
    if (s === 'home') {
      // Sessions screen: just change screen, sessions list is still available
    }
    // The screen router handles the rest via deriveScreenName
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

  const handleGlassAction = useCallback(
    (action: Parameters<typeof onGlassAction>[0], nav: Parameters<typeof onGlassAction>[1], snap: AppSnapshot) =>
      onGlassAction(action, nav, snap, ctxRef.current),
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
    appName: 'G2 CADUCEUS',
    splash: appSplash,
    getPageMode: () => 'text' as const,
  })

  return null
}
