import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { calcMaxScroll } from 'even-toolkit/glass-nav'
import { buildChatDisplay } from 'even-toolkit/glass-chat-display'
import { buildStaticActionBar } from 'even-toolkit/action-bar'
import { fieldJoin } from 'even-toolkit/glass-format'
import type { AppSnapshot, AppActions } from '../shared'

/**
 * Chat screen — AI chat display with recording controls.
 *
 * Header format: "Idle · 0 Messages"
 *   States: Idle, Listening, Thinking, Offline
 *
 * Layout (10 lines):
 *   Header + separator (2 lines, always visible)
 *   Content area (8 lines, scrollable)
 */

/** Visible content lines (10 total - 2 header lines) */
const CONTENT_SLOTS = 8

export const chatScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    const msgCount = snapshot.chatLines.length

    // Status label
    let status: string
    if (!snapshot.connected) status = 'Offline'
    else if (snapshot.isRecording) status = 'Listening'
    else if (snapshot.isProcessing) status = 'Thinking'
    else status = 'Idle'

    const title = fieldJoin(status, `${msgCount} Messages`)

    // Empty state — clean, no prefix (type 'text' = no prefix in even-toolkit)
    const lines = msgCount > 0
      ? snapshot.chatLines
      : [{ type: 'text' as const, text: '[ Tap to record ]' }]

    return buildChatDisplay({
      title,
      actionBar: buildStaticActionBar(['Record'], 0),
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
