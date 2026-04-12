import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { calcMaxScroll } from 'even-toolkit/glass-nav'
import { buildChatDisplay } from 'even-toolkit/glass-chat-display'
import { buildStaticActionBar } from 'even-toolkit/action-bar'
import { fieldJoin } from 'even-toolkit/glass-format'
import type { AppSnapshot, AppActions } from '../shared'

/**
 * Chat screen — AI chat display with recording controls.
 *
 * Layout (10 lines total):
 *   ┌─────────────────────┐
 *   │ Session · REC       │  ← inverted header with recording status
 *   │─────────────────────│
 *   │ > user message      │  ← chat lines (scrollable, 7 slots)
 *   │                     │
 *   │   assistant reply   │
 *   │                     │
 *   │─────────────────────│
 *   │ [● Record]          │  ← action bar
 *   └─────────────────────┘
 *
 * Features:
 * - Header shows session name + recording status + message count
 * - Compact sender markers: ">" for user, indented for AI (via even-toolkit)
 * - Auto-scrolls to bottom on new messages
 * - Empty state shows connection context
 * - buildChatDisplay handles separator between header and content
 */

/** Visible content lines (10 total - 3 header lines) */
const CONTENT_SLOTS = 7

export const chatScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    const name = snapshot.currentSession?.name ?? 'Caduceus'
    const msgCount = snapshot.chatLines.length

    // Recording indicator in header
    const recIndicator = snapshot.isRecording ? 'REC' : 'idle'

    // Compact header: name + status + count
    const title = fieldJoin(
      name,
      `${recIndicator} · ${msgCount}`,
    )

    // Action bar — single button with status icon
    const actionBar = buildStaticActionBar(
      [snapshot.isRecording ? '■ Stop' : '● Record'],
      0,
    )

    // Empty state with connection context
    const lines = snapshot.chatLines.length > 0
      ? snapshot.chatLines
      : [{
          type: 'system' as const,
          text: snapshot.connected
            ? 'Connected — tap ● Record'
            : 'Disconnected',
        }]

    return buildChatDisplay({
      title,
      actionBar,
      chatLines: lines,
      scrollOffset: nav.highlightedIndex,
      contentSlots: CONTENT_SLOTS,
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
      const maxScroll = calcMaxScroll(snapshot.chatLines.length, CONTENT_SLOTS)
      const delta = action.direction === 'up' ? 1 : -1
      const next = nav.highlightedIndex + delta
      return { ...nav, highlightedIndex: Math.max(0, Math.min(maxScroll, next)) }
    }

    return nav
  },
}
