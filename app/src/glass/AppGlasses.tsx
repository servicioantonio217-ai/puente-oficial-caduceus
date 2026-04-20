import { useCallback, useMemo, useRef } from 'react'
import { useGlasses } from 'even-toolkit/useGlasses'
import { appSplash } from './splash'
import { toDisplayData, onGlassAction, type AppSnapshot } from './selectors'
import type { AppActions, ScreenName } from './shared'
import { useApp } from '../contexts/AppContext'
import { MAX_GLASS_SESSIONS } from './ui-helpers'
import { normalizeChatLines } from './normalize-chat-lines'

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
    cancelRecording,
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

  // Build chat lines — split on newlines for correct scroll calculation.
  // Returns chatLines, messageBoundaries (for message-based scrolling),
  // and messageCount (for header display).
  const { chatLines, messageBoundaries, messageCount } = useMemo(
    () => normalizeChatLines(messages, error, isLoading, isRecording),
    [messages, error, isLoading, isRecording],
  )

  // Track message count at last glass action for auto-scroll detection.
  // When new messages arrive between actions (via polling), the chat
  // display shows the START of the new message (not just the bottom).
  const lastActionLineCountRef = useRef(chatLines.length)

  const snapshot: AppSnapshot = {
    screen: deriveScreenName(),
    connected,
    sessions: sortedSessions,
    currentSession,
    chatLines,
    messageBoundaries,
    messageCount,
    lastActionLineCount: lastActionLineCountRef.current,
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
    // Cancel any active recording before leaving the chat screen.
    // This stops the mic and discards partial audio (no send to bridge).
    if (isRecording) {
      cancelRecording()
    }
    // Returning from chat clears the current session context
    closeSession()
  }, [closeSession, isRecording, cancelRecording])

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
    cancelRecording,
  }

  const ctxRef = useRef(actions)
  ctxRef.current = actions

  // Auto-scroll tracking: after each glass action, sync the tracked count
  // so the display function knows when new messages arrive between actions.
  const handleGlassAction = useCallback(
    (action: Parameters<typeof onGlassAction>[0], nav: Parameters<typeof onGlassAction>[1], snap: AppSnapshot) => {
      const result = onGlassAction(action, nav, snap, ctxRef.current)

      // Sync the tracked count after processing the action.
      // The display function compares chatLines.length vs lastActionLineCount
      // to decide whether to auto-scroll to the start of the new message.
      lastActionLineCountRef.current = snap.chatLines.length

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
    // Home screen uses 'home' page mode — this enables the built-in
    // shutdownOnHomeBack behavior: double-tap (DOUBLE_CLICK_EVENT → GO_BACK)
    // on the home/root screen triggers showShutdownContainer(1), showing the
    // system exit confirmation popup. Required by Even Realities app store.
    // All other screens use 'text' mode for standard text-based display.
    getPageMode: (screen) => screen === 'home' ? ('home' as const) : ('text' as const),
  })

  return null
}
