import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildScrollableList } from 'even-toolkit/glass-display-builders'
import { moveHighlight } from 'even-toolkit/glass-nav'
import { backLabel } from 'even-toolkit/glass-format'
import { glassHeader } from 'even-toolkit/types'
import type { AppSnapshot, AppActions } from '../shared'

/** Max sessions shown on glasses (most recently active) */
const MAX_SESSIONS = 10

/**
 * Format an ISO timestamp to a compact local-time string for G2 display.
 *
 * Converts UTC ISO strings (e.g. "2026-04-14T20:30:00.000Z") to the
 * user's local timezone and returns a compact "MM-DD HH:MM" format
 * (e.g. "04-14 22:30" in CEST). Falls back to raw string on parse failure.
 */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${mm}-${dd} ${hh}:${mi}`
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}

/**
 * Sessions screen — scrollable session list with back navigation.
 *
 * Follows even-toolkit per-screen architecture:
 * - glassHeader with session count
 * - buildScrollableList for session items with ▲/▼ indicators
 * - backLabel (‹ Back) shown at bottom (not selectable)
 * - GO_BACK returns to home screen via nav.screen change
 * - Selecting a session explicitly switches to chat screen
 */
export const sessionsScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    const title = 'Sessions'

    // Build session items: name + formatted timestamp
    const sessionItems = snapshot.sessions.slice(0, MAX_SESSIONS).map((s) => {
      const name = s.name ?? s.id.slice(0, 8)
      const ts = formatTimestamp(s.updated_at)
      return `${name}  ${ts}`
    })

    const lines = [...glassHeader(title)]

    if (sessionItems.length === 0) {
      lines.push({ text: '  No sessions yet', inverted: false, style: 'meta' as const })
      lines.push({ text: '', inverted: false, style: 'normal' as const })
      lines.push({ text: `  ${backLabel()}`, inverted: false, style: 'normal' as const })
    } else {
      lines.push(...buildScrollableList({
        items: sessionItems,
        highlightedIndex: nav.highlightedIndex,
        maxVisible: 6,
        formatter: (item) => item,
      }))
      lines.push({ text: '', inverted: false, style: 'normal' as const })
      lines.push({ text: `  ${backLabel()}`, inverted: false, style: 'normal' as const })
    }

    return { lines }
  },

  action(action, nav, snapshot, ctx) {
    if (action.type === 'HIGHLIGHT_MOVE') {
      // Highlight moves within session list only (back label is not selectable)
      const maxIdx = Math.max(snapshot.sessions.length - 1, 0)
      return {
        ...nav,
        highlightedIndex: moveHighlight(nav.highlightedIndex, action.direction, maxIdx),
      }
    }

    if (action.type === 'SELECT_HIGHLIGHTED') {
      const sessions = snapshot.sessions.slice(0, MAX_SESSIONS)
      if (sessions[nav.highlightedIndex]) {
        ctx.openSession(sessions[nav.highlightedIndex])
        // Explicitly switch to chat screen — don't rely on deriveScreen.
        // Track origin (sessions list) and scroll position for GO_BACK.
        return {
          ...nav,
          screen: 'chat',
          highlightedIndex: 0,
          previousScreen: 'sessions' as string,
          previousHighlight: nav.highlightedIndex,
        }
      }
      return nav
    }

    if (action.type === 'GO_BACK') {
      return { ...nav, screen: 'home', highlightedIndex: 0 }
    }

    return nav
  },
}
