import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { calcMaxScroll } from 'even-toolkit/glass-nav'
import { buildChatDisplay } from 'even-toolkit/glass-chat-display'
import { fieldJoin } from 'even-toolkit/glass-format'
import type { AppSnapshot, AppActions } from '../shared'

/**
 * Chat screen — AI chat display with recording controls.
 *
 * Header format: "Idle · 0 Messages"
 *   States: Idle, Recording, Thinking, Offline
 *
 * No separate ActionBar — the header conveys state, tap triggers record.
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

    // Action-aware header label:
    // - "Idle" = connected, no action in progress
    // - "Recording" = active recording
    // - "Thinking" = processing AI response
    // - "Offline" = no connection
    let actionLabel: string
    if (!snapshot.connected) actionLabel = 'Offline'
    else if (snapshot.isRecording) actionLabel = 'Recording'
    else if (snapshot.isProcessing) actionLabel = 'Thinking'
    else actionLabel = 'Idle'

    const title = fieldJoin(actionLabel, `${msgCount} Messages`)

    // Empty state — clean, no prefix (type 'text' = no prefix in even-toolkit)
    const lines = msgCount > 0
      ? snapshot.chatLines
      : [{ type: 'text' as const, text: '[ Tap to record ]' }]

    // actionBar is required by buildChatDisplay but we don't want a visible bar.
    // Passing a single space renders as empty — satisfies the type without UI clutter.
    return buildChatDisplay({
      title,
      actionBar: ' ',
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
