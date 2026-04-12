import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildScrollableList } from 'even-toolkit/glass-display-builders'
import { moveHighlight } from 'even-toolkit/glass-nav'
import type { AppSnapshot, AppActions } from '../shared'

export const settingsScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    const status = snapshot.connected ? 'Connected' : 'Disconnected'
    const items = [
      `Status: ${status}`,
      'Edit on phone WebUI',
    ]
    return {
      lines: buildScrollableList({
        items,
        highlightedIndex: nav.highlightedIndex,
        maxVisible: 5,
        formatter: (item) => item,
      }),
    }
  },

  action(action, nav) {
    if (action.type === 'HIGHLIGHT_MOVE') {
      return {
        ...nav,
        highlightedIndex: moveHighlight(nav.highlightedIndex, action.direction, 1),
      }
    }
    return nav
  },
}
