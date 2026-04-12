import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildScrollableList } from 'even-toolkit/glass-display-builders'
import { moveHighlight } from 'even-toolkit/glass-nav'
import type { AppSnapshot, AppActions } from '../shared'

export const menuScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    return {
      lines: buildScrollableList({
        items: snapshot.menuItems,
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
          snapshot.menuItems.length - 1,
        ),
      }
    }
    if (action.type === 'SELECT_HIGHLIGHTED') {
      const idx = nav.highlightedIndex
      if (idx === 0) ctx.newSession()
      else if (idx === 1) ctx.navigate('sessions')
      else if (idx === 2) ctx.navigate('settings')
    }
    return nav
  },
}
