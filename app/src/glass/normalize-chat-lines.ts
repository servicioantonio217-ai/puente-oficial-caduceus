import type { ChatLine } from 'even-toolkit/glass-chat-display'

/**
 * Normalize chat messages by splitting on newlines.
 *
 * even-toolkit's formatChatLine() does word-wrapping at spaces but does NOT
 * handle `\n` characters. When a message contains empty lines (e.g. between
 * paragraphs), the embedded `\n` causes incorrect line-count calculations in
 * buildMessageScrollTargets(), resulting in auto-scroll stopping short of
 * the actual content bottom.
 *
 * This function splits each message's content on `\n` into separate ChatLines,
 * ensuring formatChatLine processes each paragraph independently and
 * buildChatDisplay sees the correct total line count for scroll calculations.
 *
 * Empty lines from `\n\n` are preserved as empty ChatLines (render as blank
 * separator lines on the G2 display).
 *
 * **Newline normalization**: Before splitting, `\r\n` (Windows CRLF) and
 * lone `\r` (legacy Mac CR) are normalized to `\n`. This ensures correct
 * handling of messages from different platforms (STT services, Windows APIs).
 *
 * **Runtime safety**: If `content` is null/undefined (e.g. malformed API
 * response), it's treated as an empty string rather than crashing.
 *
 * @param messages - Raw messages from the conversation
 * @param error - Optional error message to display as error line
 * @param isLoading - Whether the agent is processing
 * @param isRecording - Whether recording is in progress
 * @returns Array of ChatLines with newlines expanded
 */
export function normalizeChatLines(
  messages: Array<{ role: string; content: string; displayText?: string }>,
  error?: string | null,
  isLoading?: boolean,
  isRecording?: boolean,
): ChatLine[] {
  const lines: ChatLine[] = []

  for (const msg of messages) {
    // Use displayText for glasses when available (issue #75),
    // otherwise fall back to full content.
    const rawContent = msg.displayText ?? msg.content ?? ''
    // Normalize newlines: CRLF (\r\n) and CR (\r) → LF (\n)
    const normalizedContent = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // Split content on newlines - each segment becomes its own ChatLine
    const segments = normalizedContent.split('\n')

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      if (msg.role === 'user') {
        lines.push({ type: 'prompt', text: segment })
      } else if (msg.role === 'assistant') {
        // Only the FIRST line of an assistant response gets the '>>' prefix.
        // Subsequent lines (continuation, empty lines, list items) render
        // without prefix for a cleaner, more readable display.
        lines.push({ type: i === 0 ? 'tool' : 'text', text: segment })
      } else {
        lines.push({ type: 'system', text: segment })
      }
    }
  }

  // Show error as error line when idle (not recording, not processing)
  if (error && !isLoading && !isRecording) {
    // Truncate long errors to fit G2 display (~44 chars/line)
    const truncated = error.length > 40 ? error.slice(0, 37) + '...' : error
    lines.push({ type: 'error', text: truncated })
  }

  return lines
}
