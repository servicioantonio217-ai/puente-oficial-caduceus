import { createGlassScreenRouter } from 'even-toolkit/glass-screen-router'
import type { AppSnapshot, AppActions } from './shared'
import { menuScreen } from './screens/menu'
import { sessionsScreen } from './screens/sessions'
import { chatScreen } from './screens/chat'
import { settingsScreen } from './screens/settings'

export type { AppSnapshot, AppActions }

export const { toDisplayData, onGlassAction } = createGlassScreenRouter<AppSnapshot, AppActions>({
  menu: menuScreen,
  sessions: sessionsScreen,
  chat: chatScreen,
  settings: settingsScreen,
}, 'menu')
