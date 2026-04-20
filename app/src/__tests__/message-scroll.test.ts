import { describe, it, expect, vi } from 'vitest'

// Mock even-toolkit before importing the module under test.
// formatChatLine wraps text at maxChars by splitting into chunks.
// This mock replicates the wrapping behavior for predictable testing.
vi.mock('even-toolkit/glass-chat-display', () => ({
  formatChatLine: (cl: { text: string }, maxChars: number) => {
    const lines: string[] = []
    let text = cl.text || ''
    while (text.length > 0) {
      lines.push(text.slice(0, maxChars))
      text = text.slice(maxChars)
    }
    return lines
  },
  buildChatDisplay: vi.fn(),
}))

vi.mock('even-toolkit/glass-format', () => ({
  fieldJoin: (a: string, b: string) => `${a} · ${b}`,
}))

vi.mock('even-toolkit/glass-screen-router', () => ({
  // Placeholder — chat.ts imports the type but doesn't use it at runtime in tests
}))

import { buildMessageScrollTargets, getLastMessageStartOffset } from '../glass/screens/chat'

/**
 * Tests for combined message-based + paginated scrolling.
 *
 * buildMessageScrollTargets() calculates scroll target offsets that:
 * 1. Align to message boundaries (jump to message start)
 * 2. Add pagination for long messages (scroll in pages, not line-by-line)
 * 3. Always include offset 0 (bottom) for scrolling back to end
 *
 * ScrollOffset semantics (inverted):
 *   0 = bottom (showing latest content)
 *   maxScroll = top (showing earliest content)
 *
 * formatChatLine is mocked to simply chunk text at maxChars (no word wrapping).
 * This gives us precise control over display line counts for testing.
 */

// Helper: create a ChatLine with known text length
function shortLine(text: string = 'Hi') {
  return { type: 'text' as const, text }
}

function longText(chars: number): string {
  return 'a'.repeat(chars)
}

describe('buildMessageScrollTargets', () => {
  it('returns empty array for no chat lines', () => {
    const result = buildMessageScrollTargets([], [], 8, 44)
    expect(result).toEqual([])
  })

  it('returns [0] when all messages fit in viewport', () => {
    // 3 short messages, each 1 display line = 3 total lines, viewport = 8
    const lines = [shortLine('A'), shortLine('B'), shortLine('C')]
    const boundaries = [0, 1, 2] // Each line is a message start
    const result = buildMessageScrollTargets(lines, boundaries, 8, 44)
    expect(result).toEqual([0])
  })

  it('includes message boundaries for short messages', () => {
    // 10 short messages (each 1 line), viewport = 8
    // totalLines = 10, maxOffset = 2
    // Message starts at lines 0,1,2,3...
    // Offset for line 0: 10-8-0 = 2
    // Offset for line 1: 10-8-1 = 1
    // Offset for line 2: 10-8-2 = 0
    // Result: [0, 1, 2]
    const lines = Array.from({ length: 10 }, () => shortLine())
    const boundaries = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const result = buildMessageScrollTargets(lines, boundaries, 8, 44)
    expect(result).toEqual([0, 1, 2])
  })

  it('adds pagination for long single message', () => {
    // 1 message with 200 chars, maxChars=10 → 20 display lines
    // viewport = 8, maxOffset = 12
    // Message start at line 0 → offset 12
    // Pagination at line 8 → offset 4
    // Plus offset 0
    // Result: [0, 4, 12]
    const lines = [{ type: 'text' as const, text: longText(200) }]
    const boundaries = [0] // Single message starts at line 0
    const result = buildMessageScrollTargets(lines, boundaries, 8, 10)
    expect(result).toEqual([0, 4, 12])
  })

  it('handles mixed short and long messages with correct boundaries', () => {
    // msg0: "Hi" → 1 line
    // msg1: 30 chars → 3 lines (lines 1-3)
    // msg2: "OK" → 1 line (line 4)
    // totalLines = 5, viewport = 3, maxOffset = 2
    // Boundaries: msg0(line 0), msg1(line 1), msg2(line 4)
    const lines = [
      shortLine('Hi'),
      { type: 'text' as const, text: longText(30) },
      shortLine('OK'),
    ]
    const boundaries = [0, 1, 4] // Message starts
    const result = buildMessageScrollTargets(lines, boundaries, 3, 10)

    // Offsets: 5-3-0=2, 5-3-1=1, 5-3-4=-2(filtered)
    // Plus offset 0
    expect(result).toEqual([0, 1, 2])
  })

  it('pagination works for very long message', () => {
    // 1 message with 80 chars, maxChars=10 → 8 display lines
    // viewport = 3, maxOffset = 5
    // Message start at line 0 → offset 5
    // Pagination at lines 3, 6 → offsets 2, -1(filtered)
    // Plus offset 0
    const lines = [{ type: 'text' as const, text: longText(80) }]
    const boundaries = [0]
    const result = buildMessageScrollTargets(lines, boundaries, 3, 10)
    expect(result).toEqual([0, 2, 5])
  })

  it('covers all lines for 13-line message with viewport 8', () => {
    // Regression: a 13-line message should have targets covering ALL lines
    const lines = [{ type: 'text' as const, text: longText(13 * 44) }]
    const boundaries = [0]
    const targets = buildMessageScrollTargets(lines, boundaries, 8, 44)

    // totalLines=13, maxOffset=5
    // Message start: offset 5
    // Pagination at line 8: offset -3 (filtered)
    // Plus offset 0
    expect(targets).toEqual([0, 5])

    // Verify coverage
    const coveredLines = new Set<number>()
    for (const offset of targets) {
      const startLine = Math.max(0, 13 - 8 - offset)
      for (let i = startLine; i < startLine + 8 && i < 13; i++) {
        coveredLines.add(i)
      }
    }
    expect(coveredLines.size).toBe(13)
  })
})

describe('getLastMessageStartOffset', () => {
  it('returns 0 for no messages', () => {
    const result = getLastMessageStartOffset([], [], 8, 44)
    expect(result).toBe(0)
  })

  it('returns 0 when last message fits in viewport', () => {
    // 2 messages: 1 line + 3 lines = 4 total, viewport = 8
    // Last message starts at display line 1
    // totalLines=4, contentSlots=8 → fits entirely → offset 0
    const lines = [
      shortLine('First'),
      { type: 'text' as const, text: longText(30) }, // 3 lines
    ]
    const boundaries = [0, 1]
    const result = getLastMessageStartOffset(lines, boundaries, 8, 10)
    expect(result).toBe(0)
  })

  it('returns offset showing last message start when it overflows', () => {
    // 2 messages: 1 line + 10 lines = 11 total, viewport = 8
    // Last message starts at display line 1
    // totalLines=11, offset = 11-8-1 = 2
    const lines = [
      shortLine('First'),
      { type: 'text' as const, text: longText(100) }, // 10 lines
    ]
    const boundaries = [0, 1]
    const result = getLastMessageStartOffset(lines, boundaries, 8, 10)
    expect(result).toBe(2)
  })

  it('handles single long message', () => {
    // 1 message, 20 lines, viewport = 8
    // Last (and only) message starts at line 0
    // totalLines=20, offset = 20-8-0 = 12
    const lines = [{ type: 'text' as const, text: longText(200) }]
    const boundaries = [0]
    const result = getLastMessageStartOffset(lines, boundaries, 8, 10)
    expect(result).toBe(12)
  })
})

describe('Scroll navigation simulation', () => {
  it('scrolls through mixed messages correctly', () => {
    // msg0(1 line), msg1(3 lines), msg2(1 line)
    // viewport=3, maxChars=10
    const lines = [
      shortLine('Hi'),
      { type: 'text' as const, text: longText(30) },
      shortLine('OK'),
    ]
    const boundaries = [0, 1, 4]
    const targets = buildMessageScrollTargets(lines, boundaries, 3, 10)
    expect(targets).toEqual([0, 1, 2])

    // From bottom (0), UP → 1 (msg1 start)
    expect(targets.find(t => t > 0)).toBe(1)

    // From 1, UP → 2 (msg0 start)
    expect(targets.find(t => t > 1)).toBe(2)

    // From 2, DOWN → 1
    expect([...targets].reverse().find(t => t < 2)).toBe(1)

    // From 1, DOWN → 0
    expect([...targets].reverse().find(t => t < 1)).toBe(0)
  })

  it('pages through long message then jumps to next message', () => {
    // msg0: 20 lines (long), msg1: 1 line
    // viewport = 8
    const lines = [
      { type: 'text' as const, text: longText(200) }, // 20 lines
      shortLine('End'),
    ]
    const boundaries = [0, 20] // msg0 at 0, msg1 at 20
    const targets = buildMessageScrollTargets(lines, boundaries, 8, 10)

    // totalLines=21, maxOffset=13
    // msg0 start: 21-8-0=13
    // pagination at 8: 21-8-8=5
    // msg1 start: 21-8-20=-7 (filtered)
    // Plus 0
    expect(targets).toEqual([0, 5, 13])

    // From bottom (0), UP → 5 (first page)
    expect(targets.find(t => t > 0)).toBe(5)

    // From 5, UP → 13 (second page / msg0 start)
    expect(targets.find(t => t > 5)).toBe(13)

    // From 13, DOWN → 5
    expect([...targets].reverse().find(t => t < 13)).toBe(5)
  })

  it('cannot scroll past boundaries', () => {
    const lines = Array.from({ length: 10 }, () => shortLine())
    const boundaries = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const targets = buildMessageScrollTargets(lines, boundaries, 8, 44)

    // At top (2), no target > 2
    expect(targets.find(t => t > 2)).toBeUndefined()

    // At bottom (0), no target < 0
    expect([...targets].reverse().find(t => t < 0)).toBeUndefined()
  })
})
