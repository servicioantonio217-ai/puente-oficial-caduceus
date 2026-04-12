import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { line } from 'even-toolkit/types'
import { moveHighlight } from 'even-toolkit/glass-nav'
import type { AppSnapshot, AppActions } from '../shared'

/**
 * Home screen — split-panel layout.
 *
 * Display: returns DisplayData for text-mode rendering.
 * The actual split layout is handled by AppGlasses.toSplit().
 * This screen's display() is used as fallback.
 */
export const homeScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    // Fallback text-only display (used if split mode not active)
    // Navigation hint when no sub-panel open
    const _menuTitle = snapshot.homePanel === 'none' ? 'Menu' : ''
    const lines: ReturnType<typeof line>[] = []

    if (snapshot.homePanel === 'none') {
      // Menu only — show all 3 items
      for (let i = 0; i < snapshot.menuItems.length; i++) {
        const isSelected = i === nav.highlightedIndex
        lines.push(line(snapshot.menuItems[i], 'normal', isSelected))
      }
    } else if (snapshot.homePanel === 'sessions') {
      lines.push(line('Sessions', 'meta'))
      if (snapshot.sessionDisplayItems.length === 0) {
        lines.push(line('No sessions yet'))
      } else {
        for (let i = 0; i < snapshot.sessionDisplayItems.length; i++) {
          const isSelected = i === nav.highlightedIndex
          lines.push(line(snapshot.sessionDisplayItems[i], 'normal', isSelected))
        }
      }
    } else if (snapshot.homePanel === 'settings') {
      lines.push(line('Settings', 'meta'))
      for (let i = 0; i < snapshot.settingsDisplayItems.length; i++) {
        const isSelected = i === nav.highlightedIndex
        lines.push(line(snapshot.settingsDisplayItems[i], 'normal', isSelected))
      }
    }

    return { lines }
  },

  action(action, nav, snapshot, ctx) {
    if (action.type === 'HIGHLIGHT_MOVE') {
      // When in a sub-panel, navigate within that panel's items
      if (snapshot.homePanel === 'sessions') {
        const maxIdx = Math.max(snapshot.sessionDisplayItems.length - 1, 0)
        return {
          ...nav,
          highlightedIndex: moveHighlight(nav.highlightedIndex, action.direction, maxIdx),
        }
      }
      if (snapshot.homePanel === 'settings') {
        const maxIdx = Math.max(snapshot.settingsDisplayItems.length - 1, 0)
        return {
          ...nav,
          highlightedIndex: moveHighlight(nav.highlightedIndex, action.direction, maxIdx),
        }
      }

      // Menu mode — navigate between menu items
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
      if (snapshot.homePanel === 'none') {
        // Menu mode — select a menu item
        const idx = nav.highlightedIndex
        if (idx === 0) ctx.newSession()      // New Session → opens chat
        else if (idx === 1) {
          ctx.setHomePanel('sessions')
          return { ...nav, highlightedIndex: 0 }
        }
        else if (idx === 2) {
          ctx.setHomePanel('settings')
          return { ...nav, highlightedIndex: 0 }
        }
      } else if (snapshot.homePanel === 'sessions') {
        // Sessions mode — open selected session
        const sessions = snapshot.sessions
        if (sessions[nav.highlightedIndex]) {
          ctx.openSession(sessions[nav.highlightedIndex])
        }
      }
      // Settings — no action on select yet (Edit on phone)
      return nav
    }

    if (action.type === 'GO_BACK') {
      if (snapshot.homePanel !== 'none') {
        // Go back from sub-panel to menu
        ctx.setHomePanel('none')
        return { ...nav, highlightedIndex: 0 }
      }
      return nav
    }

    return nav
  },
}
