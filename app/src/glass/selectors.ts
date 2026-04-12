import { createGlassScreenRouter } from 'even-toolkit/glass-screen-router'
import type { AppSnapshot, AppActions } from './shared'
import { homeScreen } from './screens/home'
import { sessionsScreen } from './screens/sessions'
import { chatScreen } from './screens/chat'

export type { AppSnapshot, AppActions }

export const { toDisplayData, onGlassAction } = createGlassScreenRouter<AppSnapshot, AppActions>({
  home: homeScreen,
  sessions: sessionsScreen,
  chat: chatScreen,
}, 'home')
