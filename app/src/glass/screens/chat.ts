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
 *
 * SCROLLING BEHAVIOR:
 * - Pagination: Long messages scroll in 8-line pages (not line-by-line)
 * - Message boundaries: Short messages scroll to next/previous message start
 * - Auto-scroll: New messages show from the START (user can read immediately)
 */

/** Visible content lines (10 total - 2 header lines) */
const CONTENT_SLOTS = 8

/** Max chars per display line (G2 display constraint) */
const MAX_CHARS = 44

/**
 * Build scroll target offsets for message-based + paginated scrolling.
 *
 * Goals:
 * 1. Within long messages: paginate in CONTENT_SLOTS increments
 * 2. Between messages: jump to message start
 * 3. Always allow scrolling to bottom (offset 0)
 *
 * @param chatLines - Flat array of display lines
 * @param messageBoundaries - Display line indices where each MESSAGE starts
 * @param contentSlots - Visible lines per page (default 8)
 * @param maxChars - Max chars per line (default 44)
 * @returns Sorted scroll offsets (0 = bottom/latest)
 */
export function buildMessageScrollTargets(
  chatLines: AppSnapshot['chatLines'],
  messageBoundaries: AppSnapshot['messageBoundaries'],
  contentSlots: number = CONTENT_SLOTS,
  maxChars: number = MAX_CHARS,
): number[] {
  if (chatLines.length === 0) return []

  // Calculate display line count for each ChatLine
  const lineCounts = chatLines.map(cl => formatChatLine(cl, maxChars).length)
  const totalLines = lineCounts.reduce((sum, n) => sum + n, 0)
  const maxOffset = Math.max(0, totalLines - contentSlots)

  // If everything fits, only offset 0 is valid
  if (maxOffset === 0) return [0]

  // Build scroll targets:
  // 1. Message starts (from messageBoundaries)
  // 2. Pagination points within long messages
  const boundaries: Set<number> = new Set()

  // Track display line index as we iterate
  let displayLineIndex = 0

  for (let msgIdx = 0; msgIdx < chatLines.length; msgIdx++) {
    const lineCount = lineCounts[msgIdx]

    // Check if this ChatLine starts a new message
    if (messageBoundaries.includes(msgIdx)) {
      // This is a message start - add as scroll target
      boundaries.add(displayLineIndex)
    }

    // Add pagination points for long content
    // Step by contentSlots to create page-aligned targets
    let pageLine = contentSlots
    while (displayLineIndex + pageLine < displayLineIndex + lineCount) {
      boundaries.add(displayLineIndex + pageLine)
      pageLine += contentSlots
    }

    displayLineIndex += lineCount
  }

  // Convert display line indices to scroll offsets
  // scrollOffset = totalLines - contentSlots - displayLineIndex
  const offsets = [...boundaries]
    .map(b => totalLines - contentSlots - b)
    .filter(offset => offset >= 0 && offset <= maxOffset)

  // Always include offset 0 (bottom) for scrolling back to end
  offsets.push(0)

  // Deduplicate and sort ascending (0 = bottom)
  return [...new Set(offsets)].sort((a, b) => a - b)
}

/**
 * Calculate the scroll offset to show the START of the last message.
 *
 * When new messages arrive, we want to show from the beginning so the user
 * can start reading immediately without scrolling.
 *
 * @param chatLines - Flat array of display lines
 * @param messageBoundaries - Display line indices where each MESSAGE starts
 * @param contentSlots - Visible lines per page
 * @param maxChars - Max chars per line
 * @returns Scroll offset showing the last message start
 */
export function getLastMessageStartOffset(
  chatLines: AppSnapshot['chatLines'],
  messageBoundaries: AppSnapshot['messageBoundaries'],
  contentSlots: number = CONTENT_SLOTS,
  maxChars: number = MAX_CHARS,
): number {
  if (messageBoundaries.length === 0) return 0

  // Get the last message's start position
  const lastMessageStart = messageBoundaries[messageBoundaries.length - 1]

  // Calculate display line indices
  let displayLineIndex = 0
  for (let i = 0; i < chatLines.length; i++) {
    const lineCount = formatChatLine(chatLines[i], maxChars).length
    if (i === lastMessageStart) {
      // Found the last message start - calculate offset
      const totalLines = chatLines.reduce(
        (sum, cl) => sum + formatChatLine(cl, maxChars).length,
        0
      )
      return Math.max(0, totalLines - contentSlots - displayLineIndex)
    }
    displayLineIndex += lineCount
  }

  return 0
}

export const chatScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    // Use messageCount (actual messages) not chatLines.length
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
    // show from the START of the last message (not just the bottom).
    // This lets the user start reading immediately.
    const hasNewMessages = snapshot.chatLines.length > snapshot.lastActionLineCount
    const autoScrollOffset = getLastMessageStartOffset(snapshot.chatLines, snapshot.messageBoundaries)
    const scrollOffset = hasNewMessages
      ? autoScrollOffset
      : nav.highlightedIndex

    console.log('[Chat] display:', {
      chatLinesLength: snapshot.chatLines.length,
      lastActionLineCount: snapshot.lastActionLineCount,
      hasNewMessages,
      autoScrollOffset,
      navHighlightedIndex: nav.highlightedIndex,
      scrollOffset,
    })

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
      // Combined scrolling: pagination within messages + message boundaries
      const targets = buildMessageScrollTargets(
        snapshot.chatLines,
        snapshot.messageBoundaries
      )
      console.log('[Chat] HIGHLIGHT_MOVE', {
        direction: action.direction,
        targets,
        current: nav.highlightedIndex,
        messageBoundaries: snapshot.messageBoundaries,
        chatLinesCount: snapshot.chatLines.length,
      })
      if (targets.length === 0) return nav

      const current = nav.highlightedIndex

      if (action.direction === 'up') {
        // Going to earlier content: find next target above current position
        const next = targets.find(t => t > current)
        console.log('[Chat] UP: next target =', next)
        return { ...nav, highlightedIndex: next ?? current }
      } else {
        // Going to later content: find next target below current position
        const prev = [...targets].reverse().find(t => t < current)
        console.log('[Chat] DOWN: prev target =', prev)
        return { ...nav, highlightedIndex: prev ?? current }
      }
    }

    return nav
  },
}
