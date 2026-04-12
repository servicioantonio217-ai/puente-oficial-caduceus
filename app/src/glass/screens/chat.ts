import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { calcMaxScroll } from 'even-toolkit/glass-nav'
import { buildChatDisplay } from 'even-toolkit/glass-chat-display'
import type { AppSnapshot, AppActions } from '../shared'

export const chatScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    const title = snapshot.currentSession?.name
      ? snapshot.currentSession.name
      : 'Chat'

    const actionBar = snapshot.isRecording ? '🔴 Tap to stop' : '🎤 Tap to speak'

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
      ctx.goBack()
      return nav
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
