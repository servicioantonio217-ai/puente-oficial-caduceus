import { useCallback, useMemo, useRef } from 'react'
import { useGlasses } from 'even-toolkit/useGlasses'
import type { GlassNavState } from 'even-toolkit/types'
import { appSplash } from './splash'
import { toDisplayData, onGlassAction, type AppSnapshot } from './selectors'
import type { AppActions, ScreenName } from './shared'
import { useApp } from '../contexts/AppContext'
import { MAX_GLASS_SESSIONS } from './ui-helpers'

/** Split layout: narrow left menu, wide right content, no header */
const HOME_SPLIT_LAYOUT = {
  leftWidth: 160,
  headerHeight: 0,
} as const

export function AppGlasses() {
  const {
    connected, sessions, currentSession, messages,
    isLoading, isRecording, error: _error,
    homePanel, setHomePanel,
    newSession, openSession, sendText, startRecording, stopRecording,
  } = useApp()

  // Screen routing: chat when session open, home otherwise
  const deriveScreenName = useCallback((): ScreenName => {
    if (currentSession) return 'chat'
    return 'home'
  }, [currentSession])

  const screen = deriveScreenName()

  // Menu items for left panel
  const menuItems = useMemo(() => ['New Session', 'Sessions', 'Settings'], [])

  // Session list: max 10 most recently active, sorted by updated_at desc
  const sortedSessions = useMemo(
    () => [...sessions]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, MAX_GLASS_SESSIONS),
    [sessions],
  )

  // Session display items: name + timestamp
  const sessionDisplayItems = useMemo(
    () => sortedSessions.map((s) => {
      const name = s.name ?? s.id.slice(0, 8)
      const ts = s.updated_at.replace('T', ' ').slice(0, 19)
      return `${name}\n${ts}`
    }),
    [sortedSessions],
  )

  // Settings display items
  const settingsDisplayItems = useMemo(() => {
    const status = connected ? 'Connected' : 'Disconnected'
    return [status, 'Edit on phone WebUI']
  }, [connected])

  // Build chat lines
  const chatLines = useMemo(() => {
    return messages.map((msg) => {
      if (msg.role === 'user') return { type: 'prompt' as const, text: msg.content }
      if (msg.role === 'assistant') return { type: 'text' as const, text: msg.content }
      return { type: 'system' as const, text: msg.content }
    })
  }, [messages])

  // Add recording/thinking indicator
  const allChatLines = useMemo(() => {
    if (isRecording) {
      return [...chatLines, { type: 'thinking-collapsed' as const, text: 'Listening...' }]
    }
    if (isLoading) {
      return [...chatLines, { type: 'thinking-collapsed' as const, text: 'Thinking...' }]
    }
    return chatLines
  }, [chatLines, isLoading, isRecording])

  const snapshot: AppSnapshot = {
    screen,
    connected,
    sessions: sortedSessions,
    currentSession,
    chatLines: allChatLines,
    menuItems,
    homePanel,
    sessionDisplayItems,
    settingsDisplayItems,
    isRecording,
  }

  const snapshotRef = useMemo(() => ({ current: snapshot }), []) // eslint-disable-line react-hooks/exhaustive-deps
  snapshotRef.current = snapshot

  const getSnapshot = useCallback(() => snapshotRef.current, [snapshotRef])

  const navigate = useCallback((_s: ScreenName) => {
    // Navigation handled by setHomePanel / openSession directly
  }, [])

  const goBack = useCallback(() => {
    setHomePanel('none')
  }, [setHomePanel])

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
    setHomePanel,
  }

  const ctxRef = useRef(actions)
  ctxRef.current = actions

  const handleGlassAction = useCallback(
    (action: Parameters<typeof onGlassAction>[0], nav: Parameters<typeof onGlassAction>[1], snap: AppSnapshot) =>
      onGlassAction(action, nav, snap, ctxRef.current),
    [],
  )

  const screenMapper = useCallback(() => {
    const name = deriveScreenName()
    return name
  }, [deriveScreenName])

  // ── Visual constants ──
  // G2 font is NOT monospace — only use chars from supported Unicode ranges.
  // Geometric Shapes (U+25A0-U+25FF): ▶ ◀ ▲ ▼ ■ ◆ ● ○ are confirmed supported.
  // Arrows (U+2190-U+21FF): ▲ ▼ are confirmed supported.
  // Box Drawing (U+2500-U+257F): do NOT use — misaligned on non-monospace font.
  const SEL = '\u25B6'   // ▶ — filled right-pointing triangle (selection indicator)
  const UNSEL = '  '      // 2-space indent for unselected items

  /** Build left menu text for split pane.
   *
   * Selected item gets ▶ prefix, unselected get 2-space indent.
   * Empty line before first item for top padding.
   */
  const buildLeftPane = useCallback((_snap: AppSnapshot, nav: GlassNavState): string => {
    void _snap // left pane only depends on menu items + nav
    const selectedIdx = nav.highlightedIndex
    return menuItems.map((item, i) =>
      i === selectedIdx ? `${SEL} ${item}` : `${UNSEL}${item}`,
    ).join('\n')
  }, [menuItems])

  /** Build right panel content for split pane.
   *
   * Sessions: ▶ on selected, name + indented timestamp, scroll hint at bottom.
   * Settings: ▶ on selected item.
   */
  const buildRightPane = useCallback((snap: AppSnapshot, nav: GlassNavState): string => {
    if (snap.homePanel === 'none') {
      return '\n  Select an item'
    }
    if (snap.homePanel === 'sessions') {
      if (snap.sessionDisplayItems.length === 0) return '\n  No sessions yet'
      const highlightedIdx = nav.highlightedIndex
      const lines: string[] = []
      for (let i = 0; i < snap.sessionDisplayItems.length; i++) {
        const itemLines = snap.sessionDisplayItems[i].split('\n')
        // ▶ prefix on first line (name) for selected item
        const prefix = i === highlightedIdx ? `${SEL} ` : `${UNSEL}`
        itemLines[0] = prefix + itemLines[0]
        // Timestamp indented with 4 spaces below the name
        if (itemLines[1]) {
          itemLines[1] = `    ${itemLines[1]}`
        }
        // Blank line between session entries for readability
        if (i > 0) lines.push('')
        lines.push(...itemLines)
      }
      return lines.join('\n')
    }
    if (snap.homePanel === 'settings') {
      const highlightedIdx = nav.highlightedIndex
      return snap.settingsDisplayItems.map((item, i) =>
        i === highlightedIdx ? `${SEL} ${item}` : `${UNSEL}${item}`,
      ).join('\n')
    }
    return ''
  }, [])

  const toSplit = useCallback((snap: AppSnapshot, nav: GlassNavState) => {
    return {
      header: '',
      panes: [buildLeftPane(snap, nav), buildRightPane(snap, nav)],
      layout: HOME_SPLIT_LAYOUT,
    }
  }, [buildLeftPane, buildRightPane])

  useGlasses({
    getSnapshot,
    toDisplayData,
    toSplit,
    onGlassAction: handleGlassAction,
    deriveScreen: screenMapper,
    appName: 'G2 CADUCEUS',
    splash: appSplash,
    getPageMode: (s: string) => {
      if (s === 'chat') return 'text'
      return 'split'
    },
  })

  return null
}
