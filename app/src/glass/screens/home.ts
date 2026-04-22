import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildScrollableList } from 'even-toolkit/glass-display-builders'
import { moveHighlight } from 'even-toolkit/glass-nav'
import { fieldJoin } from 'even-toolkit/glass-format'
import type { AppSnapshot, AppActions } from '../shared'

/** Menu items for the home screen */
const MENU_ITEMS = ['New Session', 'Sessions'] as const

/**
 * Home screen — single-pane scrollable list.
 *
 * Follows even-toolkit per-screen architecture:
 * - Uses buildScrollableList with ▲/▼ scroll indicators
 * - drillLabel (›) for navigable items
 * - fieldJoin for header metadata
 * - No split layout — pure text mode
 *
 * When disconnected, shows setup instructions instead of the menu.
 *
 * Screen transitions are explicit: actions return the target screen
 * via nav.screen change (not via deriveScreen).
 */
export const homeScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    const headerStatus = snapshot.connected ? 'Connected' : snapshot.isReconnecting ? 'Reconnecting...' : 'Disconnected'
    const title = fieldJoin('Caduceus', headerStatus)

    // When disconnected, show setup instructions instead of menu
    if (!snapshot.connected) {
      const lines = [
        { text: title, inverted: false, style: 'normal' as const },
        { text: '', inverted: false, style: 'separator' as const },
        // Show reconnection status with a progress hint
        ...(snapshot.isReconnecting
          ? [
              { text: 'Checking bridge...', inverted: false, style: 'normal' as const },
              { text: '', inverted: false, style: 'normal' as const },
              { text: 'Will reconnect when', inverted: false, style: 'normal' as const },
              { text: 'bridge is available.', inverted: false, style: 'normal' as const },
            ]
          : [
              { text: 'Bridge unreachable.', inverted: false, style: 'normal' as const },
              { text: '', inverted: false, style: 'normal' as const },
              { text: '1. Open Caduceus on phone', inverted: false, style: 'normal' as const },
              { text: '2. Check bridge URL', inverted: false, style: 'normal' as const },
              { text: '3. Ensure bridge is running', inverted: false, style: 'normal' as const },
            ]),
        { text: '', inverted: false, style: 'normal' as const },
        { text: 'gitlab.com/Qu4ndo/g2-caduceus', inverted: false, style: 'normal' as const },
      ]
      return { lines }
    }

    const lines = [
      { text: title, inverted: false, style: 'normal' as const },
      { text: '', inverted: false, style: 'separator' as const },
      ...buildScrollableList({
        items: [...MENU_ITEMS],
        highlightedIndex: nav.highlightedIndex,
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
        // newSession() is async — catch to prevent unhandled rejection.
        // Screen switches immediately; session creation completes in background.
        ctx.newSession().catch(() => {})
        // Explicitly switch to chat screen — don't rely on deriveScreen.
        // Track origin so GO_BACK returns to home.
        return {
          ...nav,
          screen: 'chat',
          highlightedIndex: 0,
          previousScreen: 'home' as string,
          previousHighlight: 0,
        }
      } else if (idx === 1) {
        return { ...nav, screen: 'sessions', highlightedIndex: 0 }
      }
      return { ...nav, highlightedIndex: 0 }
    }

    return nav
  },
}
