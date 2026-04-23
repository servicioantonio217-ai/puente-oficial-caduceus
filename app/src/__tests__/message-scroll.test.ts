import { describe, it, expect, vi } from 'vitest'

// Mock even-toolkit before importing the module under test.
// formatChatLine wraps text at maxChars by splitting into chunks.
// This mock replicates the wrapping behavior for predictable testing.
// IMPORTANT: Empty text returns [''] (1 line) just like the real formatChatLine.
vi.mock('even-toolkit/glass-chat-display', () => ({
  formatChatLine: (cl: { text: string }, maxChars: number) => {
    const lines: string[] = []
    let text = cl.text || ''
    // Empty text still produces 1 display line (blank row)
    if (text.length === 0) {
      return ['']
    }
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

import { buildMessageScrollTargets } from '../glass/screens/chat'

/**
 * Tests for message-based scrolling (Issue #25).
 *
 * buildMessageScrollTargets() calculates scroll target offsets that
 * align the viewport to message boundaries, with pagination for long messages.
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
    const result = buildMessageScrollTargets([], 8, 44)
    expect(result).toEqual([])
  })

  it('returns [0] when all messages fit in viewport (no scrolling needed)', () => {
    // 3 short messages, each 1 display line = 3 total lines, viewport = 8
    // All messages fit: totalLines=3, maxOffset=max(0, 3-8)=0
    // Offset 0 is always included → [0]
    // With maxOffset=0, the user cannot scroll anywhere — offset 0 is the only position.
    const lines = [shortLine('A'), shortLine('B'), shortLine('C')]
    const result = buildMessageScrollTargets(lines, 8, 44)
    expect(result).toEqual([0])
  })

  it('returns message boundaries when content overflows viewport', () => {
    // 10 short messages (each "Hi" = 2 chars < 44, so 1 line each)
    // totalLines = 10, viewport = 8, maxOffset = 2
    // Boundaries: lines 0..9
    // Offset for line 0: 10-8-0 = 2 ✓
    // Offset for line 1: 10-8-1 = 1 ✓
    // Offset for line 2: 10-8-2 = 0 ✓
    // Offset for line 3+: negative → filtered
    // Plus offset 0 always included
    // Sorted ascending: [0, 1, 2]
    const lines = Array.from({ length: 10 }, () => shortLine())
    const result = buildMessageScrollTargets(lines, 8, 44)
    expect(result).toEqual([0, 1, 2])
  })

  it('includes offset 0 when last message starts at bottom edge', () => {
    // 9 messages, each 1 line. totalLines=9, viewport=8, maxOffset=1
    // Boundary line 0 → offset 9-8-0 = 1
    // Boundary line 1 → offset 9-8-1 = 0
    // Boundary line 2+ → negative, filtered
    // Plus offset 0 always included (already present from boundary)
    // Result: [0, 1]
    const lines = Array.from({ length: 9 }, () => shortLine())
    const result = buildMessageScrollTargets(lines, 8, 44)
    expect(result).toEqual([0, 1])
  })

  it('adds pagination targets for long messages', () => {
    // 1 message with 200 chars, maxChars=10 → 20 display lines
    // viewport = 8, step = 8-2 = 6
    // Boundaries: start(0), page(6), page(12), page(18)
    // totalLines = 20, maxOffset = 12
    // Offsets: 20-8-0=12, 20-8-6=6, 20-8-12=0, 20-8-18=-6(filtered)
    // Plus offset 0 always included
    // Result: [0, 6, 12]
    const lines = [{ type: 'text' as const, text: longText(200) }]
    const result = buildMessageScrollTargets(lines, 8, 10)
    expect(result).toEqual([0, 6, 12])
  })

  it('returns [0] for short messages that fit in viewport', () => {
    // 1 message with 50 chars, maxChars=10 → 5 display lines
    // viewport = 8 → fits entirely
    // totalLines = 5, maxOffset = max(0, 5-8) = 0
    // Offset 0 is always included → [0]
    const lines = [{ type: 'text' as const, text: longText(50) }]
    const result = buildMessageScrollTargets(lines, 8, 10)
    expect(result).toEqual([0])
  })

  it('pages through very long messages with multiple pagination points', () => {
    // 1 message with 80 chars, maxChars=10 → 8 display lines
    // viewport = 3, step = 3-2 = 1
    // Boundaries: start(0), page(1), page(2), page(3), page(4), page(5), page(6), page(7)
    // totalLines = 8, maxOffset = 5
    // Offsets: 8-3-0=5, 8-3-1=4, 8-3-2=3, 8-3-3=2, 8-3-4=1, 8-3-5=0, 8-3-6=-1(filtered)
    // Plus offset 0 always included
    // Result: [0, 1, 2, 3, 4, 5]
    const lines = [{ type: 'text' as const, text: longText(80) }]
    const result = buildMessageScrollTargets(lines, 3, 10)
    expect(result).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('handles mixed short and long messages', () => {
    // With maxChars=10:
    // msg0: "Hi" → 1 line (line 0)
    // msg1: 30 chars → 3 lines (lines 1-3)
    // msg2: "OK" → 1 line (line 4)
    // totalLines = 5, viewport = 3, maxOffset = 2
    // Boundaries: 0 (msg0), 1 (msg1), 4 (msg2)
    // msg1 pagination: 1+3=4 (already a boundary)
    // Offsets: 5-3-0=2, 5-3-1=1, 5-3-4=-2(filtered)
    // Plus offset 0 always included
    // Result: [0, 1, 2]
    const lines = [
      shortLine('Hi'),
      { type: 'text' as const, text: longText(30) },
      shortLine('OK'),
    ]
    const result = buildMessageScrollTargets(lines, 3, 10)
    expect(result).toEqual([0, 1, 2])
  })

  it('deduplicates targets when pagination aligns with message boundary', () => {
    // msg0: 30 chars → 3 lines (maxChars=10)
    // msg1: "End" → 1 line
    // viewport = 3
    // Boundaries: line 0 (msg0), line 3 (msg1)
    // totalLines = 4, maxOffset = 1
    // Offsets: 4-3-0=1, 4-3-3=-2(filtered)
    // Plus offset 0 always included
    // Result: [0, 1]
    const lines = [
      { type: 'text' as const, text: longText(30) },
      shortLine('End'),
    ]
    const result = buildMessageScrollTargets(lines, 3, 10)
    expect(result).toEqual([0, 1])
  })

  it('handles exact fit: totalLines equals contentSlots', () => {
    // 8 messages, each 1 line = 8 total lines = contentSlots
    // maxOffset = max(0, 8-8) = 0
    // Boundary line 0 → offset = 8-8-0 = 0 ✓
    // Boundary lines 1-7 → negative → filtered
    // Result: [0]
    const lines = Array.from({ length: 8 }, () => shortLine())
    const result = buildMessageScrollTargets(lines, 8, 44)
    expect(result).toEqual([0])
  })

  it('skips empty ChatLines as scroll boundaries', () => {
    // Empty ChatLines (from \n\n paragraph breaks) should NOT create scroll
    // boundaries. They still consume a display line but should not be swipe stops.
    // This prevents scrolling from degrading to line-by-line through separators.
    const lines = [
      shortLine('A'),      // line 0 → boundary ✓
      { type: 'text' as const, text: '' }, // line 1 → empty, NO boundary
      shortLine('B'),      // line 2 → boundary ✓
      { type: 'text' as const, text: '' }, // line 3 → empty, NO boundary
      shortLine('C'),      // line 4 → boundary ✓
    ]
    // totalLines = 5, viewport = 8 → fits entirely
    // Without the fix: boundaries at 0, 1, 2, 3, 4 → [0, 1, 2, 3, 4] filtered to [0]
    // With the fix: boundaries at 0, 2, 4 → [0] (still fits, but boundaries are correct)
    const result = buildMessageScrollTargets(lines, 8, 44)
    expect(result).toEqual([0])
  })

  it('empty ChatLines do not create extra swipe stops', () => {
    // With content overflowing viewport, verify empty lines don't add swipe stops
    const lines = [
      shortLine('A'),      // line 0 → boundary
      { type: 'text' as const, text: '' }, // line 1 → empty, skip
      shortLine('B'),      // line 2 → boundary
      { type: 'text' as const, text: '' }, // line 3 → empty, skip
      shortLine('C'),      // line 4 → boundary
      shortLine('D'),      // line 5 → boundary
      shortLine('E'),      // line 6 → boundary
      shortLine('F'),      // line 7 → boundary
      shortLine('G'),      // line 8 → boundary
      shortLine('H'),      // line 9 → boundary
    ]
    // totalLines = 10, viewport = 8, maxOffset = 2
    // WITHOUT fix: boundaries at 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
    //   → offsets: 2-8-0=2, 2-8-1=1, 2-8-2=0, rest negative → [0, 1, 2]
    // WITH fix: boundaries at 0, 2, 4, 5, 6, 7, 8, 9
    //   → offsets: 2-8-0=2, 2-8-2=0, rest negative → [0, 2]
    // Result should be same: only non-empty lines create boundaries
    const result = buildMessageScrollTargets(lines, 8, 44)
    // With the fix, we get fewer boundaries (no stops at empty lines)
    expect(result).toEqual([0, 2])
  })
})

describe('Scroll navigation simulation', () => {
  it('scrolling UP from bottom jumps to previous message', () => {
    // 10 messages → targets = [0, 1, 2]
    const lines = Array.from({ length: 10 }, () => shortLine())
    const targets = buildMessageScrollTargets(lines, 8, 44)
    expect(targets).toEqual([0, 1, 2])

    // From offset 0 (bottom), UP → next > 0 = 1
    const currentOffset = 0
    const next = targets.find(t => t > currentOffset)
    expect(next).toBe(1)
  })

  it('scrolling DOWN from top returns toward bottom', () => {
    const lines = Array.from({ length: 10 }, () => shortLine())
    const targets = buildMessageScrollTargets(lines, 8, 44)

    // From offset 2 (top), DOWN → next < 2 = 1
    const prev = [...targets].reverse().find(t => t < 2)
    expect(prev).toBe(1)

    // From offset 1, DOWN → next < 1 = 0
    const prev2 = [...targets].reverse().find(t => t < 1)
    expect(prev2).toBe(0)
  })

  it('cannot scroll past boundaries', () => {
    const lines = Array.from({ length: 10 }, () => shortLine())
    const targets = buildMessageScrollTargets(lines, 8, 44)

    // At top (2), no target > 2
    expect(targets.find(t => t > 2)).toBeUndefined()

    // At bottom (0), no target < 0
    expect([...targets].reverse().find(t => t < 0)).toBeUndefined()
  })

  it('pages through long message sequentially', () => {
    // 1 long message (200 chars at maxChars=10 = 20 lines), viewport=8, step=6
    // targets = [0, 6, 12]
    const lines = [{ type: 'text' as const, text: longText(200) }]
    const targets = buildMessageScrollTargets(lines, 8, 10)

    // From offset 0 (bottom, auto-scrolled), UP → next > 0 = 6
    expect(targets.find(t => t > 0)).toBe(6)

    // From offset 6, UP → next > 6 = 12
    expect(targets.find(t => t > 6)).toBe(12)

    // From offset 12, UP → no target > 12 (at top)
    expect(targets.find(t => t > 12)).toBeUndefined()

    // From offset 12, DOWN → next < 12 = 6
    expect([...targets].reverse().find(t => t < 12)).toBe(6)

    // From offset 6, DOWN → next < 6 = 0 (back to bottom)
    expect([...targets].reverse().find(t => t < 6)).toBe(0)

    // From offset 0, DOWN → no target < 0 (already at bottom)
    expect([...targets].reverse().find(t => t < 0)).toBeUndefined()
  })

  it('covers all display lines for a 13-line message with viewport 8', () => {
    // Regression test: a 13-line message should have targets that make
    // ALL 13 lines reachable, including the middle section.
    // Before fix: only offset [5] was a target → user stuck at top or bottom.
    const lines = [{ type: 'text' as const, text: longText(13 * 44) }]
    const targets = buildMessageScrollTargets(lines, 8, 44)

    // totalLines=13, maxOffset=5
    // Boundary at line 0 → offset 13-8-0=5
    // Pagination at line 8 → offset 13-8-8=-3 (filtered)
    // Plus offset 0 always included
    // Result: [0, 5]
    expect(targets).toEqual([0, 5])

    // Verify all lines are reachable:
    // offset 0: start=max(0,13-8-0)=5 → shows lines 5..12
    // offset 5: start=max(0,13-8-5)=0 → shows lines 0..7
    // Lines 0-12 all covered (0-7 at offset 5, 5-12 at offset 0)
    // Middle lines 5-7 visible at both targets
    const coveredLines = new Set<number>()
    for (const offset of targets) {
      const startLine = Math.max(0, 13 - 8 - offset)
      for (let i = startLine; i < startLine + 8 && i < 13; i++) {
        coveredLines.add(i)
      }
    }
    expect(coveredLines.size).toBe(13)

    // Navigation: from bottom (0) → up to 5 → down back to 0
    expect(targets.find(t => t > 0)).toBe(5)
    expect([...targets].reverse().find(t => t < 5)).toBe(0)
  })

  it('covers all display lines for a 20-line message with viewport 8', () => {
    // 20-line message, viewport=8, step=6
    const lines = [{ type: 'text' as const, text: longText(20 * 10) }]
    const targets = buildMessageScrollTargets(lines, 8, 10)

    // totalLines=20, maxOffset=12, step=6
    // Boundaries: line 0, line 6, line 12, line 18
    // Offsets: 20-8-0=12, 20-8-6=6, 20-8-12=0, 20-8-18=-6(filtered)
    // Plus offset 0
    // Result: [0, 6, 12]
    expect(targets).toEqual([0, 6, 12])

    // Verify all lines reachable:
    // offset 0: start=12 → shows 12..19
    // offset 6: start=6 → shows 6..13
    // offset 12: start=0 → shows 0..7
    // Lines 0-19 ALL covered!
    const coveredLines = new Set<number>()
    for (const offset of targets) {
      const startLine = Math.max(0, 20 - 8 - offset)
      for (let i = startLine; i < startLine + 8 && i < 20; i++) {
        coveredLines.add(i)
      }
    }
    expect(coveredLines.size).toBe(20)
  })

  it('navigates through mixed messages correctly', () => {
    // Setup: msg0(1 line), msg1(30 chars=3 lines), msg2(1 line)
    // viewport=3, maxChars=10
    // totalLines=5, targets=[0, 1, 2]
    const lines = [
      shortLine('Hi'),
      { type: 'text' as const, text: longText(30) },
      shortLine('OK'),
    ]
    const targets = buildMessageScrollTargets(lines, 3, 10)
    expect(targets).toEqual([0, 1, 2])

    // From bottom (0), UP → 1 (msg1 start)
    expect(targets.find(t => t > 0)).toBe(1)

    // From 1, UP → 2 (msg0 start)
    expect(targets.find(t => t > 1)).toBe(2)

    // From 2, DOWN → 1
    expect([...targets].reverse().find(t => t < 2)).toBe(1)

    // From 1, DOWN → 0 (back to bottom)
    expect([...targets].reverse().find(t => t < 1)).toBe(0)
  })
})

/**
 * Scroll indicator gap tests (Issue #71 root cause).
 *
 * even-toolkit's buildChatDisplay uses applyScrollIndicators() which
 * REPLACES the first visible content line with ▲ (when content above)
 * and/or the last visible line with ▼ (when content below).
 *
 * These tests simulate that indicator replacement and verify that
 * EVERY display line is visible at some scroll position, even after
 * the indicator lines are removed from the "effectively visible" set.
 *
 * This is the critical gap that MR !129 (step=contentSlots-1) did NOT fix:
 * with step=7, the "seam" line between two viewports sits at position 0
 * (→▲) in one viewport and position 7 (→▼) in the other — hidden at both.
 * The fix uses step=contentSlots-2 (6) which provides 2 lines of overlap,
 * so every line appears in a non-indicator position at some viewport.
 */
describe('Scroll indicator coverage (Issue #71)', () => {
  // Simulate applyScrollIndicators: return the line indices that are
  // effectively visible (first/last replaced by ▲/▼ indicators).
  function getEffectivelyVisibleLines(
    start: number,
    totalLines: number,
    contentSlots: number,
  ): number[] {
    const end = Math.min(start + contentSlots, totalLines)
    const visible: number[] = []
    for (let i = start; i < end; i++) {
      // Skip first line (replaced by ▲) when there's content above
      if (i === start && start > 0) continue
      // Skip last line (replaced by ▼) when there's content below
      if (i === end - 1 && end < totalLines) continue
      visible.push(i)
    }
    return visible
  }

  // Check that ALL display lines are effectively visible at some scroll target
  function assertFullCoverage(
    chatLines: Array<{ type: 'text' | 'prompt' | 'tool' | 'error' | 'system'; text: string }>,
    contentSlots: number,
    maxChars: number,
    _label: string,
  ) {
    const targets = buildMessageScrollTargets(chatLines, contentSlots, maxChars)

    // Calculate totalLines using the mock formatChatLine
    let totalLines = 0
    for (const cl of chatLines) {
      const text = cl.text || ''
      if (text.length === 0) {
        totalLines += 1
      } else {
        totalLines += Math.ceil(text.length / maxChars)
      }
    }

    // Collect effectively visible lines across all targets
    const visibleLines = new Set<number>()
    for (const offset of targets) {
      const start = Math.max(0, totalLines - contentSlots - offset)
      for (const lineIdx of getEffectivelyVisibleLines(start, totalLines, contentSlots)) {
        visibleLines.add(lineIdx)
      }
    }

    // Check every line is covered
    const missing: number[] = []
    for (let i = 0; i < totalLines; i++) {
      if (!visibleLines.has(i)) missing.push(i)
    }

    expect(missing).toEqual([] as number[])
  }

  it('covers all lines for a 20-line message with viewport 8 (indicators)', () => {
    // 20 lines, viewport=8, step=6
    // Before fix (step=8): lines 7 and 8 were hidden by indicators
    assertFullCoverage(
      [{ type: 'text', text: longText(200) }],
      8, 10,
      '20-line single message',
    )
  })

  it('covers all lines for a 25-line message with viewport 8 (indicators)', () => {
    // 25 lines → boundaries at 0, 6, 12, 18, 24
    // This is the case that proved the bug: with step=8, lines 7,8,15,16 were hidden
    assertFullCoverage(
      [{ type: 'text', text: longText(250) }],
      8, 10,
      '25-line single message',
    )
  })

  it('covers all lines for messages of various lengths (1-60 lines)', () => {
    // Brute-force: test many different message lengths
    for (let chars = 10; chars <= 600; chars += 10) {
      const lineCount = Math.ceil(chars / 10)
      assertFullCoverage(
        [{ type: 'text', text: longText(chars) }],
        8, 10,
        `single message, ${lineCount} lines`,
      )
    }
  })

  it('covers all lines with small viewport (3 slots)', () => {
    // Small viewport amplifies the indicator effect
    // step = 3-2 = 1 → every line is a target
    for (let chars = 10; chars <= 100; chars += 10) {
      assertFullCoverage(
        [{ type: 'text', text: longText(chars) }],
        3, 10,
        `viewport=3, ${Math.ceil(chars/10)} lines`,
      )
    }
  })

  it('covers all lines with mixed short and long messages', () => {
    const scenarios = [
      {
        lines: [
          shortLine('Hi'),
          { type: 'text' as const, text: longText(100) },
          shortLine('OK'),
          { type: 'text' as const, text: longText(200) },
        ],
        contentSlots: 8,
        maxChars: 10,
      },
      {
        lines: [
          { type: 'text' as const, text: longText(80) },
          shortLine('Break'),
          { type: 'text' as const, text: longText(80) },
          shortLine('End'),
        ],
        contentSlots: 8,
        maxChars: 10,
      },
      {
        lines: [
          shortLine('A'),
          shortLine('B'),
          { type: 'text' as const, text: longText(150) },
          shortLine('C'),
          { type: 'text' as const, text: longText(90) },
        ],
        contentSlots: 8,
        maxChars: 10,
      },
    ]
    for (const s of scenarios) {
      assertFullCoverage(s.lines, s.contentSlots, s.maxChars, 'mixed messages')
    }
  })

  it('covers all lines with empty paragraph breaks', () => {
    // Empty lines consume display slots but don't create boundaries
    const lines = [
      { type: 'text' as const, text: longText(150) },
      { type: 'text' as const, text: '' },
      { type: 'text' as const, text: longText(150) },
      { type: 'text' as const, text: '' },
      { type: 'text' as const, text: longText(100) },
    ]
    assertFullCoverage(lines, 8, 10, 'paragraphs with empty lines')
  })

  it('covers all lines with many short messages', () => {
    // Each short message = 1 boundary. More boundaries = more viewports.
    const lines = Array.from({ length: 20 }, (_, i) => shortLine(`Msg${i}`))
    assertFullCoverage(lines, 8, 44, '20 short messages')
  })

  it('covers all lines at exact viewport boundaries', () => {
    // Test messages that produce exactly N*contentSlots lines
    for (let multiplier = 1; multiplier <= 5; multiplier++) {
      const chars = multiplier * 8 * 10 // exactly N * viewport lines
      assertFullCoverage(
        [{ type: 'text', text: longText(chars) }],
        8, 10,
        `exact ${multiplier}*8 lines`,
      )
    }
  })

  it('covers all lines for real-world chat scenario', () => {
    // Simulate a typical AI chat: user asks, AI responds at length
    const lines = [
      { type: 'prompt' as const, text: 'Tell me about quantum computing' },
      { type: 'tool' as const, text: 'Quantum computing is a type of computation that harnesses quantum mechanical phenomena, such as superposition and entanglement, to process information in fundamentally different ways than classical computers.' },
      { type: 'text' as const, text: '' },
      { type: 'text' as const, text: 'Unlike classical bits that are either 0 or 1, quantum bits (qubits) can exist in multiple states simultaneously. This property enables quantum computers to explore many possible solutions at once.' },
      { type: 'prompt' as const, text: 'What about error correction?' },
      { type: 'tool' as const, text: 'Quantum error correction is essential because qubits are extremely fragile and prone to decoherence. Current quantum computers have error rates that limit practical applications, but advances in error correction codes and fault-tolerant designs are rapidly improving.' },
    ]
    assertFullCoverage(lines, 8, 44, 'real-world chat')
  })
})
