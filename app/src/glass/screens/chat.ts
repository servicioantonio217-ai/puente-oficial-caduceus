import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { calcMaxScroll } from 'even-toolkit/glass-nav'
import { buildChatDisplay } from 'even-toolkit/glass-chat-display'
import { buildStaticActionBar } from 'even-toolkit/action-bar'
import { fieldJoin } from 'even-toolkit/glass-format'
import type { AppSnapshot, AppActions } from '../shared'

/**
 * Chat screen — AI chat display with recording controls.
 *
 * Header: "State: idle · 5" — state on the left, message count on the right.
 *   States: idle, recording, thinking, offline
 * Action bar: ● Record / ■ Stop / ○ thinking / — offline
 *
 * Layout (10 lines):
 *   Header + separator (3 lines, always visible)
 *   Content area (7 lines, scrollable)
 *   Action bar (inline in header line)
 */

/** Visible content lines (10 total - 3 header lines) */
const CONTENT_SLOTS = 7

export const chatScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    const msgCount = snapshot.chatLines.length

    // Header: state label + message count
    let stateLabel: string
    if (!snapshot.connected) stateLabel = 'offline'
    else if (snapshot.isRecording) stateLabel = 'recording'
    else if (snapshot.isProcessing) stateLabel = 'thinking'
    else stateLabel = 'idle'

    const title = fieldJoin(`State: ${stateLabel}`, String(msgCount))

    // Action bar: context-dependent
    let actionLabel: string
    if (!snapshot.connected) actionLabel = '— offline'
    else if (snapshot.isRecording) actionLabel = '■ Stop'
    else if (snapshot.isProcessing) actionLabel = '○ thinking'
    else actionLabel = '● Record'

    const actionBar = buildStaticActionBar([actionLabel], 0)

    // Empty state — clean, minimal
    const lines = msgCount > 0
      ? snapshot.chatLines
      : [{ type: 'system' as const, text: '[ Tap to record ]' }]

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
      // Only allow recording toggle when connected and not processing
      if (snapshot.connected && !snapshot.isProcessing) {
        ctx.toggleRecording()
      }
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
