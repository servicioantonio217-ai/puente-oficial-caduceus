import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { calcMaxScroll } from 'even-toolkit/glass-nav'
import { buildChatDisplay } from 'even-toolkit/glass-chat-display'
import { buildStaticActionBar } from 'even-toolkit/action-bar'
import type { AppSnapshot, AppActions } from '../shared'

/**
 * Chat screen — AI chat display with recording controls.
 *
 * Layout:
 *   ┌─────────────────────┐
 *   │ Session Name        │  ← title line (inverted header)
 *   │─────────────────────│
 *   │ You: ...            │  ← chat lines (scrollable)
 *   │ AI: ...             │
 *   │                     │
 *   │─────────────────────│
 *   │ [● Record]          │  ← action bar
 *   └─────────────────────┘
 *
 * Empty state shows a centered hint.
 * System messages use 'meta' style for visual separation.
 * Auto-scrolls to bottom on new messages (highlightedIndex = max).
 */
export const chatScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    const title = snapshot.currentSession?.name ?? 'Caduceus'

    // Action bar — single button, always at index 0
    const actionBar = buildStaticActionBar(
      [snapshot.isRecording ? '■ Stop' : '● Record'],
      0,
    )

    // Build chat lines with empty state
    const lines = snapshot.chatLines.length > 0
      ? snapshot.chatLines
      : [{ type: 'system' as const, text: 'Tap ● Record to start' }]

    return buildChatDisplay({
      title,
      actionBar,
      chatLines: lines,
      scrollOffset: nav.highlightedIndex,
    })
  },

  action(action, nav, snapshot, ctx) {
    if (action.type === 'GO_BACK') {
      ctx.goBack()
      return { ...nav, screen: 'home', highlightedIndex: 0 }
    }

    if (action.type === 'SELECT_HIGHLIGHTED') {
      ctx.toggleRecording()
      return nav
    }

    if (action.type === 'HIGHLIGHT_MOVE') {
      const visibleLines = 7
      const maxScroll = calcMaxScroll(snapshot.chatLines.length, visibleLines)
      const delta = action.direction === 'up' ? 1 : -1
      const next = nav.highlightedIndex + delta
      return { ...nav, highlightedIndex: Math.max(0, Math.min(maxScroll, next)) }
    }

    return nav
  },
}
