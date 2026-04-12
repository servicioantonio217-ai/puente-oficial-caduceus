import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildScrollableList } from 'even-toolkit/glass-display-builders'
import { moveHighlight } from 'even-toolkit/glass-nav'
import type { AppSnapshot, AppActions } from '../shared'

export const sessionsScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    const items = snapshot.sessionItems.length > 0
      ? snapshot.sessionItems
      : ['No sessions yet']
    return {
      lines: buildScrollableList({
        items,
        highlightedIndex: nav.highlightedIndex,
        maxVisible: 5,
        formatter: (item) => item,
      }),
    }
  },

  action(action, nav, snapshot, ctx) {
    if (action.type === 'HIGHLIGHT_MOVE') {
      return {
        ...nav,
        highlightedIndex: moveHighlight(
          nav.highlightedIndex,
          action.direction,
          Math.max(snapshot.sessionItems.length - 1, 0),
        ),
      }
    }
    if (action.type === 'SELECT_HIGHLIGHTED' && snapshot.sessions.length > 0) {
      const session = snapshot.sessions[nav.highlightedIndex]
      if (session) ctx.openSession(session)
    }
    return nav
  },
}
