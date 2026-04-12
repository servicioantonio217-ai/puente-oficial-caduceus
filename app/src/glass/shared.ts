import type { Session } from '../types'
import type { ChatLine } from 'even-toolkit/glass-chat-display'

export type ScreenName = 'splash' | 'home' | 'chat'

export interface AppSnapshot {
  screen: ScreenName
  connected: boolean
  sessions: Session[]
  currentSession: Session | null
  chatLines: ChatLine[]
  menuItems: string[]
  /** Current right-panel content: 'none' = menu only, 'sessions' | 'settings' */
  homePanel: 'none' | 'sessions' | 'settings'
  /** Formatted session list items for the right panel */
  sessionDisplayItems: string[]
  /** Formatted settings items for the right panel */
  settingsDisplayItems: string[]
  isRecording: boolean
}

export interface AppActions {
  navigate: (screen: ScreenName) => void
  goBack: () => void
  openSession: (session: Session) => void
  newSession: () => void
  sendMessage: (text: string) => void
  toggleRecording: () => void
  setHomePanel: (panel: 'none' | 'sessions' | 'settings') => void
}
