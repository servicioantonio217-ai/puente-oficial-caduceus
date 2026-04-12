import { useCallback, useMemo, useRef } from 'react'
import { useGlasses } from 'even-toolkit/useGlasses'
import { useFlashPhase } from 'even-toolkit/useFlashPhase'
import { createScreenMapper, getHomeTiles } from 'even-toolkit/glass-router'
import { appSplash } from './splash'
import { toDisplayData, onGlassAction, type AppSnapshot } from './selectors'
import type { AppActions, ScreenName } from './shared'
import { useApp } from '../contexts/AppContext'

export function AppGlasses() {
  const {
    connected, sessions, currentSession, messages,
    isLoading, error,
    newSession, openSession, sendText,
  } = useApp()

  // Derive screen from app state
  const deriveScreenName = useCallback((): ScreenName => {
    if (!connected) return 'menu'
    if (currentSession) return 'chat'
    return 'menu'
  }, [connected, currentSession])

  const screen = deriveScreenName()
  const flashPhase = useFlashPhase(screen === 'menu')

  const navigate = useCallback((_s: ScreenName) => {
    // Navigation is driven by app state, not explicit navigation
  }, [])

  // Build menu items
  const menuItems = useMemo(() => {
    const items = ['New Session', 'Sessions', 'Settings']
    if (error) items.push(`Error: ${error.slice(0, 30)}`)
    return items
  }, [error])

  // Build session list items
  const sessionItems = useMemo(
    () => sessions.map((s) => {
      const name = s.name ?? s.id.slice(0, 8)
      const count = s.message_count ?? 0
      return `${name} (${count})`
    }),
    [sessions],
  )

  // Build chat lines for buildChatDisplay
  const chatLines = useMemo(() => {
    return messages.map((msg) => {
      if (msg.role === 'user') return { type: 'prompt' as const, text: msg.content }
      if (msg.role === 'assistant') return { type: 'text' as const, text: msg.content }
      return { type: 'system' as const, text: msg.content }
    })
  }, [messages])

  // Add loading indicator
  const allChatLines = useMemo(() => {
    if (isLoading) {
      return [...chatLines, { type: 'thinking-collapsed' as const, text: 'Thinking...' }]
    }
    return chatLines
  }, [chatLines, isLoading])

  const snapshot: AppSnapshot = {
    screen,
    connected,
    sessions,
    currentSession,
    chatLines: allChatLines,
    menuItems,
    sessionItems,
    flashPhase,
  }

  const snapshotRef = useMemo(() => ({ current: snapshot }), []) // eslint-disable-line react-hooks/exhaustive-deps
  snapshotRef.current = snapshot

  const getSnapshot = useCallback(() => snapshotRef.current, [snapshotRef])

  const actions: AppActions = { navigate, openSession, newSession, sendMessage: sendText }
  const ctxRef = useRef(actions)
  ctxRef.current = actions

  const handleGlassAction = useCallback(
    (action: Parameters<typeof onGlassAction>[0], nav: Parameters<typeof onGlassAction>[1], snap: AppSnapshot) =>
      onGlassAction(action, nav, snap, ctxRef.current),
    [],
  )

  const screenMapper = useCallback((_path: string) => {
    const name = deriveScreenName()
    if (name === 'chat') return 'chat'
    if (name === 'sessions') return 'sessions'
    if (name === 'settings') return 'settings'
    return 'menu'
  }, [deriveScreenName])

  const homeTiles = getHomeTiles(appSplash)

  useGlasses({
    getSnapshot,
    toDisplayData,
    onGlassAction: handleGlassAction,
    deriveScreen: screenMapper,
    appName: 'G2 CADUCEUS',
    splash: appSplash,
    getPageMode: (s) => (s === 'menu' ? 'home' : 'text'),
    homeImageTiles: homeTiles,
  })

  return null
}
