import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildScrollableList } from 'even-toolkit/glass-display-builders'
import { moveHighlight } from 'even-toolkit/glass-nav'
import { drillLabel, fieldJoin } from 'even-toolkit/glass-format'
import type { AppSnapshot, AppActions } from '../shared'

/** Menu items for the home screen */
const MENU_ITEMS = ['New Session', drillLabel('Sessions')] as const

/**
 * Home screen — single-pane scrollable list.
 *
 * Follows even-toolkit per-screen architecture:
 * - Uses buildScrollableList with ▲/▼ scroll indicators
 * - drillLabel (›) for navigable items
 * - fieldJoin for header metadata
 * - No split layout — pure text mode
 *
 * Screen transitions are explicit: actions return the target screen
 * via nav.screen change (not via deriveScreen).
 */
export const homeScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot) {
    const headerStatus = snapshot.connected ? 'Connected' : 'Disconnected'
    const title = fieldJoin('G2 CADUCEUS', headerStatus)

    const lines = [
      { text: title, inverted: false, style: 'normal' as const },
      { text: '', inverted: false, style: 'separator' as const },
      ...buildScrollableList({
        items: [...MENU_ITEMS],
        highlightedIndex: 0, // Home always resets highlight to 0
        maxVisible: 5,
        formatter: (item) => item,
      }),
    ]

    return { lines }
  },

  action(action, nav, _snapshot, ctx) {
    if (action.type === 'HIGHLIGHT_MOVE') {
      return {
        ...nav,
        highlightedIndex: moveHighlight(nav.highlightedIndex, action.direction, MENU_ITEMS.length - 1),
      }
    }

    if (action.type === 'SELECT_HIGHLIGHTED') {
      const idx = nav.highlightedIndex
      if (idx === 0) {
        ctx.newSession()
        // Explicitly switch to chat screen — don't rely on deriveScreen
        return { ...nav, screen: 'chat', highlightedIndex: 0 }
      } else if (idx === 1) {
        return { ...nav, screen: 'sessions', highlightedIndex: 0 }
      }
      return { ...nav, highlightedIndex: 0 }
    }

    return nav
  },
}
