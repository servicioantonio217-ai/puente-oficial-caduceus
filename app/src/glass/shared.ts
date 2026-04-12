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
  isRecording: boolean
  isProcessing: boolean
}

export interface AppActions {
  navigate: (screen: ScreenName) => void
  goBack: () => void
  openSession: (session: Session) => void
  newSession: () => void
  sendMessage: (text: string) => void
  toggleRecording: () => void
}
