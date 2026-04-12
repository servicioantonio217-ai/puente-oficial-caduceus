import type { GlassScreen } from 'even-toolkit/glass-screen-router'
import { buildChatDisplay } from 'even-toolkit/glass-chat-display'
import { line } from 'even-toolkit/types'
import { calcMaxScroll } from 'even-toolkit/glass-nav'
import type { AppSnapshot, AppActions } from '../shared'

export const chatScreen: GlassScreen<AppSnapshot, AppActions> = {
  display(snapshot, nav) {
    const title = snapshot.currentSession?.name
      ? `Chat: ${snapshot.currentSession.name}`
      : 'Chat'

    if (snapshot.chatLines.length === 0) {
      return {
        lines: [
          line(title),
          line(''),
          line(snapshot.isRecording ? '🎤 Listening...' : 'Tap to speak'),
          line(''),
          line('Use phone WebUI to type'),
        ],
      }
    }

    return buildChatDisplay({
      title,
      actionBar: snapshot.isRecording ? '🔴 Tap to stop' : 'Scroll',
      chatLines: snapshot.chatLines,
      scrollOffset: 0,
      contentSlots: 7,
      maxChars: 44,
    })
  },

  action(action, nav, snapshot, ctx) {
    // Tap to start/stop recording
    if (action.type === 'SELECT_HIGHLIGHTED') {
      ctx.toggleRecording()
      return nav
    }

    if (action.type === 'HIGHLIGHT_MOVE') {
      const maxScroll = calcMaxScroll(snapshot.chatLines.length, 7)
      const delta = action.direction === 'up' ? 1 : -1
      // We encode scroll offset in highlightedIndex since GlassNavState
      // only has highlightedIndex and screen. This is a workaround —
      // the chat screen re-uses highlightedIndex as scroll offset.
      const current = nav.highlightedIndex
      const next = current + delta
      return { ...nav, highlightedIndex: Math.max(0, Math.min(maxScroll, next)) }
    }
    return nav
  },
}
