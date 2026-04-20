import type { Session } from '../types'
import type { ChatLine } from 'even-toolkit/glass-chat-display'

/**
 * Screen names following even-toolkit per-screen architecture.
 *
 * Flow: home → sessions (list) → chat (active session)
 *        home → chat (new session via "New Session")
 *
 * Navigation is screen-based, not split-panel.
 * Each screen has its own display() + action() using text mode.
 */
export type ScreenName = 'splash' | 'home' | 'sessions' | 'chat'

export interface AppSnapshot {
  screen: ScreenName
  connected: boolean
  sessions: Session[]
  currentSession: Session | null
  chatLines: ChatLine[]
  /** Number of chat lines at the time of the last glass action.
   *  Used for auto-scroll: if chatLines.length > lastActionLineCount,
   *  the display resets to the bottom (scrollOffset = 0). */
  lastActionLineCount: number
  /** Actual message count (messages.length), distinct from chatLines.length
   *  which counts display lines after newline splitting. Used for header. */
  messageCount: number
  isRecording: boolean
  isProcessing: boolean
  error: string | null
}

export interface AppActions {
  navigate: (screen: ScreenName) => void
  goBack: () => void
  openSession: (session: Session) => Promise<void>
  newSession: () => Promise<void>
  sendMessage: (text: string) => void
  toggleRecording: () => void
  cancelRecording: () => void
}
