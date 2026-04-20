import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildChatDisplay, formatChatLine } from 'even-toolkit/glass-chat-display'
import { fieldJoin } from 'even-toolkit/glass-format'
import type { AppSnapshot, AppActions } from '../shared'

/**
 * Chat screen — AI chat display with recording controls.
 *
 * Header format: "Idle · 0 Messages" (singular "Message" for count 1)
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
 * Build scroll target offsets for message-based scrolling.
 *
 * Instead of scrolling line-by-line, each scroll action jumps to the
 * start of the next/previous message. Long messages that exceed
 * contentSlots lines get additional pagination targets so the user
 * can page through them without gaps.
 *
 * Always includes offset 0 (bottom/latest content) so the user can
 * scroll back to the end after scrolling up.
 *
 * Returns sorted scrollOffset values (ascending: 0 = bottom/latest).
 * scrollOffset semantics from buildChatDisplay:
 *   start = max(0, totalLines - contentSlots - scrollOffset)
 *   So scrollOffset = totalLines - contentSlots - displayLineIndex
 */
export function buildMessageScrollTargets(
  chatLines: AppSnapshot['chatLines'],
  contentSlots: number = CONTENT_SLOTS,
  maxChars: number = MAX_CHARS,
): number[] {
  if (chatLines.length === 0) return []

  const boundaries: Set<number> = new Set() // display line indices
  let currentLine = 0

  for (const cl of chatLines) {
    const lineCount = formatChatLine(cl, maxChars).length
    boundaries.add(currentLine) // message start

    // Add pagination within long messages.
    // Step by contentSlots from the message start so each target
    // shifts the viewport by exactly one page — no gaps in coverage.
    let pageLine = contentSlots
    while (currentLine + pageLine < currentLine + lineCount) {
      boundaries.add(currentLine + pageLine)
      pageLine += contentSlots
    }

    currentLine += lineCount
  }

  const totalLines = currentLine
  const maxOffset = Math.max(0, totalLines - contentSlots)

  // Convert display line indices to scrollOffset values and filter valid range
  const offsets = [...boundaries]
    .map(b => totalLines - contentSlots - b)
    .filter(offset => offset >= 0 && offset <= maxOffset)

  // Always include offset 0 (bottom) so user can scroll back to end
  offsets.push(0)

  // Deduplicate and sort ascending (0 = bottom/latest content)
  return [...new Set(offsets)].sort((a, b) => a - b)
}

export const chatScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    // Use messageCount (actual messages) not chatLines.length (display lines)
    const msgCount = snapshot.messageCount

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

    // Use singular "Message" for count 1, plural "Messages" otherwise (#33)
    const countLabel = msgCount === 1 ? '1 Message' : `${msgCount} Messages`
    const title = fieldJoin(actionLabel, countLabel)

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
    // Debug: log all incoming action types to diagnose ring/touchpad issues (#18)
    if (action.type !== 'HIGHLIGHT_MOVE') {
      console.log(`[Chat] action: ${action.type}`, action)
    }

    if (action.type === 'GO_BACK') {
      // Cancel any active recording before navigating away.
      // This stops the mic and discards partial audio — no send to bridge.
      if (snapshot.isRecording) {
        ctx.cancelRecording()
      }
      ctx.goBack()
      // Return to the screen the user came from (sessions or home).
      // If no previousScreen tracked (e.g. via syncScreen), default to home.
      // GlassNavState is extended with previousScreen/previousHighlight by
      // home.ts and sessions.ts when transitioning to chat.
      const extras = nav as unknown as Record<string, unknown>
      const prevScreen = extras.previousScreen as string | undefined
      const prevHighlight = extras.previousHighlight as number | undefined
      return {
        ...nav,
        screen: prevScreen ?? 'home',
        highlightedIndex: prevHighlight ?? 0,
      }
    }

    if (action.type === 'SELECT_HIGHLIGHTED') {
      // Only allow recording toggle when connected and not processing
      if (snapshot.connected && !snapshot.isProcessing) {
        ctx.toggleRecording()
      } else {
        console.log(`[Chat] SELECT_HIGHLIGHTED ignored — connected=${snapshot.connected}, isProcessing=${snapshot.isProcessing}`)
      }
      return nav
    }

    if (action.type === 'HIGHLIGHT_MOVE') {
      // Message-based scrolling: each swipe jumps to the next/previous
      // message boundary instead of scrolling line-by-line. Long messages
      // get paged through in CONTENT_SLOTS increments.
      const targets = buildMessageScrollTargets(snapshot.chatLines)
      if (targets.length === 0) return nav

      const current = nav.highlightedIndex

      if (action.direction === 'up') {
        // Going to earlier content: find next target above current position
        const next = targets.find(t => t > current)
        return { ...nav, highlightedIndex: next ?? current }
      } else {
        // Going to later content: find next target below current position
        const prev = [...targets].reverse().find(t => t < current)
        return { ...nav, highlightedIndex: prev ?? current }
      }
    }

    return nav
  },
}
