import type { Session } from '../types'
import type { ChatLine } from 'even-toolkit/glass-chat-display'

export type ScreenName = 'splash' | 'menu' | 'sessions' | 'chat' | 'settings'

export interface AppSnapshot {
  screen: ScreenName
  connected: boolean
  sessions: Session[]
  currentSession: Session | null
  chatLines: ChatLine[]
  menuItems: string[]
  sessionItems: string[]
  flashPhase: boolean
  isRecording: boolean
}

export interface AppActions {
  navigate: (screen: ScreenName) => void
  goBack: () => void
  openSession: (session: Session) => void
  newSession: () => void
  sendMessage: (text: string) => void
  toggleRecording: () => void
}
