import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { calcMaxScroll } from 'even-toolkit/glass-nav'
import { buildChatDisplay, formatChatLine } from 'even-toolkit/glass-chat-display'
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

/** Max chars per display line (G2 display constraint) */
const MAX_CHARS = 44

/**
 * Calculate the actual number of display lines after word-wrapping.
 * buildChatDisplay wraps long ChatLines, so the real line count
 * may exceed chatLines.length. This function counts the wrapped lines
 * so calcMaxScroll returns the correct maximum scroll offset.
 */
function countDisplayLines(chatLines: AppSnapshot['chatLines']): number {
  let total = 0
  for (const cl of chatLines) {
    total += formatChatLine(cl, MAX_CHARS).length
  }
  return total
}

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

    // Auto-scroll: if new messages arrived since the last glass action,
    // reset scrollOffset to 0 (bottom) so the latest content is visible.
    // This handles the case where messages arrive via polling (not user action).
    const hasNewMessages = msgCount > snapshot.lastActionLineCount
    const scrollOffset = hasNewMessages ? 0 : nav.highlightedIndex

    // actionBar is required by buildChatDisplay but we don't want a visible bar.
    // Passing a single space renders as empty — satisfies the type without UI clutter.
    return buildChatDisplay({
      title,
      actionBar: ' ',
      chatLines: lines,
      scrollOffset,
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
      // Use the ACTUAL display line count (after word-wrap), not chatLines.length.
      // chatLines.length counts ChatLine objects, but buildChatDisplay wraps
      // long lines, producing more display lines. Without this fix, calcMaxScroll
      // returns 0 even when content overflows the display.
      const totalDisplayLines = countDisplayLines(snapshot.chatLines)
      const maxScroll = calcMaxScroll(totalDisplayLines, CONTENT_SLOTS)
      const delta = action.direction === 'up' ? 1 : -1
      const next = nav.highlightedIndex + delta
      return { ...nav, highlightedIndex: Math.max(0, Math.min(maxScroll, next)) }
    }

    return nav
  },
}
