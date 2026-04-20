import type { ChatLine } from 'even-toolkit/glass-chat-display'

/**
 * Result of normalizing chat messages into display lines.
 */
export interface NormalizedChat {
  /** Flat array of ChatLines for display */
  chatLines: ChatLine[]
  /** Display line indices where each MESSAGE starts (not each ChatLine!) */
  messageBoundaries: number[]
  /** Number of actual messages (not ChatLines) */
  messageCount: number
}

/**
 * Normalize chat messages by splitting on newlines.
 *
 * even-toolkit's formatChatLine() does word-wrapping at spaces but does NOT
 * handle `\n` characters. This function splits each message's content on `\n`
 * into separate ChatLines, ensuring formatChatLine processes each paragraph
 * independently and buildChatDisplay sees the correct total line count.
 *
 * **Message boundaries**: Tracks which display line each MESSAGE starts at,
 * enabling message-based scrolling (not line-by-line).
 *
 * **Prefix convention**:
 * - `>` = user message (prompt)
 * - `>>` = first line of assistant message (tool)
 * - no prefix = continuation lines within a message (text)
 *
 * @param messages - Raw messages from the conversation
 * @param error - Optional error message to display as error line
 * @param isLoading - Whether the agent is processing
 * @param isRecording - Whether recording is in progress
 * @returns NormalizedChat with chatLines, messageBoundaries, and messageCount
 */
export function normalizeChatLines(
  messages: Array<{ role: string; content: string }>,
  error?: string | null,
  isLoading?: boolean,
  isRecording?: boolean,
): NormalizedChat {
  const chatLines: ChatLine[] = []
  const messageBoundaries: number[] = []

  for (const msg of messages) {
    // Track where this MESSAGE starts in the display
    messageBoundaries.push(chatLines.length)

    const rawContent = msg.content ?? ''
    const normalizedContent = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const segments = normalizedContent.split('\n')

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      if (msg.role === 'user') {
        chatLines.push({ type: 'prompt', text: segment })
      } else if (msg.role === 'assistant') {
        // Only the FIRST line of an assistant response gets the '>>' prefix.
        chatLines.push({ type: i === 0 ? 'tool' : 'text', text: segment })
      } else {
        chatLines.push({ type: 'system', text: segment })
      }
    }
  }

  if (error && !isLoading && !isRecording) {
    const truncated = error.length > 40 ? error.slice(0, 37) + '...' : error
    chatLines.push({ type: 'error', text: truncated })
  }

  return {
    chatLines,
    messageBoundaries,
    messageCount: messages.length,
  }
}
