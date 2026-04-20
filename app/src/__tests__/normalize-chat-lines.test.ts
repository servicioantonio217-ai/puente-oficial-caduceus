import { describe, it, expect } from 'vitest'
import { normalizeChatLines } from '../glass/normalize-chat-lines'

/**
 * Tests for normalizeChatLines() - Issue #44.
 *
 * even-toolkit's formatChatLine() does word-wrapping at spaces but does NOT
 * handle \n characters. This helper splits messages on newlines before
 * passing to the display system, ensuring correct scroll calculations.
 *
 * IMPORTANT: Only the FIRST line of an assistant response gets the '>>' prefix
 * (type: 'tool'). Subsequent lines (continuation, empty lines, list items)
 * render without prefix (type: 'text') for a cleaner, more readable display.
 *
 * The function returns NormalizedChat with:
 * - chatLines: flat array for display
 * - messageBoundaries: display line indices where each MESSAGE starts
 * - messageCount: number of actual messages
 */

describe('normalizeChatLines', () => {
  it('returns empty result for no messages', () => {
    const result = normalizeChatLines([])
    expect(result.chatLines).toEqual([])
    expect(result.messageBoundaries).toEqual([])
    expect(result.messageCount).toBe(0)
  })

  it('handles single-line messages without newlines', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'prompt', text: 'Hello' },
      { type: 'tool', text: 'Hi there!' },
    ])
    expect(result.messageBoundaries).toEqual([0, 1])
    expect(result.messageCount).toBe(2)
  })

  it('splits message with single newline into two ChatLines', () => {
    const messages = [
      { role: 'assistant', content: 'Line one\nLine two' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: 'Line one' },
      { type: 'text', text: 'Line two' },
    ])
    // Message starts at line 0
    expect(result.messageBoundaries).toEqual([0])
    expect(result.messageCount).toBe(1)
  })

  it('preserves empty lines from double newlines', () => {
    const messages = [
      { role: 'assistant', content: 'Paragraph one\n\nParagraph two' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: 'Paragraph one' },
      { type: 'text', text: '' },
      { type: 'text', text: 'Paragraph two' },
    ])
    expect(result.messageBoundaries).toEqual([0])
  })

  it('handles multiple consecutive empty lines', () => {
    const messages = [
      { role: 'assistant', content: 'Start\n\n\n\nEnd' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: 'Start' },
      { type: 'text', text: '' },
      { type: 'text', text: '' },
      { type: 'text', text: '' },
      { type: 'text', text: 'End' },
    ])
  })

  it('handles trailing newline', () => {
    const messages = [
      { role: 'assistant', content: 'Text\n' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: 'Text' },
      { type: 'text', text: '' },
    ])
  })

  it('handles leading newline', () => {
    const messages = [
      { role: 'assistant', content: '\nText' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: '' },
      { type: 'text', text: 'Text' },
    ])
  })

  it('handles mixed user and assistant messages with newlines', () => {
    const messages = [
      { role: 'user', content: 'Question one\nQuestion two' },
      { role: 'assistant', content: 'Answer\n\nWith details' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'prompt', text: 'Question one' },
      { type: 'prompt', text: 'Question two' },
      { type: 'tool', text: 'Answer' },
      { type: 'text', text: '' },
      { type: 'text', text: 'With details' },
    ])
    // Message 0 starts at line 0, Message 1 starts at line 2
    expect(result.messageBoundaries).toEqual([0, 2])
    expect(result.messageCount).toBe(2)
  })

  it('uses system type for unknown roles', () => {
    const messages = [
      { role: 'system', content: 'System\nMessage' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'system', text: 'System' },
      { type: 'system', text: 'Message' },
    ])
  })

  it('appends error line when error is present and not loading/recording', () => {
    const messages = [{ role: 'user', content: 'Hi' }]
    const result = normalizeChatLines(messages, 'Error message', false, false)
    expect(result.chatLines).toEqual([
      { type: 'prompt', text: 'Hi' },
      { type: 'error', text: 'Error message' },
    ])
  })

  it('does not append error when loading', () => {
    const messages = [{ role: 'user', content: 'Hi' }]
    const result = normalizeChatLines(messages, 'Error message', true, false)
    expect(result.chatLines).toEqual([
      { type: 'prompt', text: 'Hi' },
    ])
  })

  it('does not append error when recording', () => {
    const messages = [{ role: 'user', content: 'Hi' }]
    const result = normalizeChatLines(messages, 'Error message', false, true)
    expect(result.chatLines).toEqual([
      { type: 'prompt', text: 'Hi' },
    ])
  })

  it('truncates long error messages to 40 chars', () => {
    const longError = 'This is a very long error message that exceeds the limit'
    const messages = [{ role: 'user', content: 'Hi' }]
    const result = normalizeChatLines(messages, longError, false, false)
    expect(result.chatLines).toEqual([
      { type: 'prompt', text: 'Hi' },
      { type: 'error', text: 'This is a very long error message tha...' },
    ])
  })

  it('produces correct line count for scroll calculation', () => {
    const messages = [
      { role: 'user', content: 'Explain' },
      { role: 'assistant', content: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.' },
    ]
    const result = normalizeChatLines(messages)
    // 1 user line + 5 assistant lines (3 paragraphs + 2 empty lines)
    expect(result.chatLines.length).toBe(6)
  })

  it('handles real-world assistant response with list and paragraphs', () => {
    const messages = [
      { role: 'assistant', content: 'Here are the options:\n\n1. Option A\n2. Option B\n\nChoose wisely.' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: 'Here are the options:' },
      { type: 'text', text: '' },
      { type: 'text', text: '1. Option A' },
      { type: 'text', text: '2. Option B' },
      { type: 'text', text: '' },
      { type: 'text', text: 'Choose wisely.' },
    ])
    expect(result.chatLines.length).toBe(6)
  })

  // ============================================================
  // Message boundary tests
  // ============================================================

  it('tracks message boundaries correctly for multi-line messages', () => {
    const messages = [
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B1\nB2\nB3' },
      { role: 'user', content: 'C' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines.length).toBe(5) // 1 + 3 + 1
    expect(result.messageBoundaries).toEqual([0, 1, 4])
    expect(result.messageCount).toBe(3)
  })

  it('message boundaries enable message-based scrolling', () => {
    // Simulate: user asks, assistant gives long multi-paragraph response
    const messages = [
      { role: 'user', content: 'What is X?' },
      { role: 'assistant', content: 'Line1\nLine2\nLine3\nLine4\nLine5' },
    ]
    const result = normalizeChatLines(messages)
    // User message at line 0, Assistant message at line 1
    expect(result.messageBoundaries).toEqual([0, 1])
    // Scrolling should jump from line 1 (assistant start) to line 0 (user start)
    // NOT line-by-line through the assistant's content
  })

  // ============================================================
  // Newline normalization tests (CRLF, CR handling)
  // ============================================================

  it('normalizes Windows CRLF (\\r\\n) to LF', () => {
    const messages = [
      { role: 'assistant', content: 'Line one\r\nLine two' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: 'Line one' },
      { type: 'text', text: 'Line two' },
    ])
  })

  it('normalizes legacy Mac CR (\\r) to LF', () => {
    const messages = [
      { role: 'assistant', content: 'Line one\rLine two' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: 'Line one' },
      { type: 'text', text: 'Line two' },
    ])
  })

  it('handles mixed newlines (CRLF, LF, CR)', () => {
    const messages = [
      { role: 'assistant', content: 'A\r\nB\nC\rD' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: 'A' },
      { type: 'text', text: 'B' },
      { type: 'text', text: 'C' },
      { type: 'text', text: 'D' },
    ])
  })

  it('handles CRLF with double newlines (paragraph separators)', () => {
    const messages = [
      { role: 'assistant', content: 'Para one\r\n\r\nPara two' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: 'Para one' },
      { type: 'text', text: '' },
      { type: 'text', text: 'Para two' },
    ])
  })

  // ============================================================
  // Runtime safety tests (null/undefined content)
  // ============================================================

  it('handles null content gracefully', () => {
    const messages = [
      { role: 'user', content: null as unknown as string },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'prompt', text: '' },
    ])
  })

  it('handles undefined content gracefully', () => {
    const messages = [
      { role: 'assistant', content: undefined as unknown as string },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: '' },
    ])
  })

  it('handles empty string content', () => {
    const messages = [
      { role: 'user', content: '' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'prompt', text: '' },
    ])
  })

  // ============================================================
  // Multiple assistant messages - each gets its own '>>' prefix
  // ============================================================

  it('each assistant message starts with tool type (separate messages)', () => {
    const messages = [
      { role: 'assistant', content: 'First response' },
      { role: 'user', content: 'Follow-up' },
      { role: 'assistant', content: 'Second response\nwith two lines' },
    ]
    const result = normalizeChatLines(messages)
    expect(result.chatLines).toEqual([
      { type: 'tool', text: 'First response' },
      { type: 'prompt', text: 'Follow-up' },
      { type: 'tool', text: 'Second response' },
      { type: 'text', text: 'with two lines' },
    ])
    expect(result.messageBoundaries).toEqual([0, 1, 2])
  })
})
