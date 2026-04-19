import type { ChatLine } from 'even-toolkit/glass-chat-display'

/**
 * Normalize chat messages by splitting on newlines.
 *
 * even-toolkit's formatChatLine() does word-wrapping at spaces but does NOT
 * handle \n characters. When a message contains empty lines (e.g. between
 * paragraphs), the embedded \n causes incorrect line-count calculations in
 * buildMessageScrollTargets(), resulting in auto-scroll stopping short of
 * the actual content bottom.
 *
 * This function splits each message's content on \n into separate ChatLines,
 * ensuring formatChatLine processes each paragraph independently and
 * buildChatDisplay sees the correct total line count for scroll calculations.
 *
 * Empty lines from \n\n are preserved as empty ChatLines (render as blank
 * separator lines on the G2 display).
 *
 * @param messages - Raw messages from the conversation
 * @param error - Optional error message to display as error line
 * @param isLoading - Whether the agent is processing
 * @param isRecording - Whether recording is in progress
 * @returns Array of ChatLines with newlines expanded
 */
export function normalizeChatLines(
  messages: Array<{ role: string; content: string }>,
  error?: string | null,
  isLoading?: boolean,
  isRecording?: boolean,
): ChatLine[] {
  const lines: ChatLine[] = []

  for (const msg of messages) {
    // Split content on newlines - each segment becomes its own ChatLine
    const segments = msg.content.split('\n')

    for (const segment of segments) {
      if (msg.role === 'user') {
        lines.push({ type: 'prompt', text: segment })
      } else if (msg.role === 'assistant') {
        lines.push({ type: 'tool', text: segment })
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
