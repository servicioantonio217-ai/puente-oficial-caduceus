import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { calcMaxScroll } from 'even-toolkit/glass-nav'
import { buildChatDisplay } from 'even-toolkit/glass-chat-display'
import { buildStaticActionBar } from 'even-toolkit/action-bar'
import type { AppSnapshot, AppActions } from '../shared'

/**
 * Chat screen — AI chat display with recording controls.
 *
 * Follows even-toolkit per-screen architecture:
 * - buildChatDisplay for streaming AI output with ▲/▼ scroll
 * - buildStaticActionBar for recording toggle
 * - SELECT_HIGHLIGHTED toggles recording
 * - GO_BACK returns to home via nav.screen change
 */
export const chatScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    const title = snapshot.currentSession?.name
      ? snapshot.currentSession.name
      : 'Chat'

    // Action bar with recording toggle
    const actionBar = buildStaticActionBar(
      [snapshot.isRecording ? 'Stop Rec' : 'Record'],
      0,
    )

    const lines = snapshot.chatLines.length > 0
      ? snapshot.chatLines
      : [{ type: 'system' as const, text: 'Tap to speak' }]

    return buildChatDisplay({
      title,
      actionBar,
      chatLines: lines,
      scrollOffset: nav.highlightedIndex,
    })
  },

  action(action, nav, snapshot, ctx) {
    if (action.type === 'GO_BACK') {
      // Return to home screen via nav.screen change
      // Note: deriveScreenName may override this if currentSession is still set,
      // but goBack should clear the session context
      ctx.goBack()
      return { ...nav, screen: 'home', highlightedIndex: 0 }
    }
    if (action.type === 'SELECT_HIGHLIGHTED') {
      ctx.toggleRecording()
      return nav
    }

    if (action.type === 'HIGHLIGHT_MOVE') {
      const maxScroll = calcMaxScroll(snapshot.chatLines.length, 7)
      const delta = action.direction === 'up' ? 1 : -1
      const next = nav.highlightedIndex + delta
      return { ...nav, highlightedIndex: Math.max(0, Math.min(maxScroll, next)) }
    }
    return nav
  },
}
