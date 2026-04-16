import { createGlassScreenRouter } from 'even-toolkit/glass-screen-router'
import type { AppSnapshot, AppActions } from './shared'
import { homeScreen } from './screens/home'
import { sessionsScreen } from './screens/sessions'
import { chatScreen } from './screens/chat'

export type { AppSnapshot, AppActions }

const router = createGlassScreenRouter<AppSnapshot, AppActions>(
  {
    home: homeScreen,
    sessions: sessionsScreen,
    chat: chatScreen,
  },
  'home',
)

/**
 * Determine if a screen transition is phone-initiated (not from glasses nav).
 *
 * When the phone app opens/closes a session (via openSession, newSession,
 * closeSession), the snapshot.screen changes but nav.screen may lag behind
 * because useGlasses' deriveScreen effect only runs on location.pathname
 * changes. This detects such desync so we can correct it.
 *
 * Returns the snapshot-driven screen when desync is detected, or null if
 * already in sync.
 */
function syncedScreen(snapshot: AppSnapshot, nav: { screen: string }): string | null {
  const expected = snapshot.screen
  const actual = nav.screen

  // Already in sync — nothing to do
  if (expected === actual) return null

  // Phone opened/switched a session → glasses should be on chat
  if (expected === 'chat' && (actual === 'home' || actual === 'sessions')) {
    return 'chat'
  }

  // Phone closed a session → glasses should return to home
  if (expected === 'home' && actual === 'chat') {
    return 'home'
  }

  return null
}

/**
 * Wrapped toDisplayData with screen-sync logic.
 *
 * When the phone initiates a session change, nav.screen may be stale
 * (e.g., still 'home' when the phone just opened a session → snapshot.screen is 'chat').
 * This wrapper detects the desync and routes to the correct screen's display().
 */
export function toDisplayData(snapshot: AppSnapshot, nav: Parameters<typeof router.toDisplayData>[1]) {
  const corrected = syncedScreen(snapshot, nav)
  const effectiveNav = corrected ? { ...nav, screen: corrected } : nav
  return router.toDisplayData(snapshot, effectiveNav)
}

/**
 * Wrapped onGlassAction with screen-sync logic.
 *
 * When the phone initiates a session change and a glass action comes in,
 * we detect the desync and correct nav.screen before passing to the router.
 * This ensures the correct screen's action handler processes the input.
 *
 * Returns the corrected nav so useGlasses' navRef gets updated.
 */
export function onGlassAction(
  action: Parameters<typeof router.onGlassAction>[0],
  nav: Parameters<typeof router.onGlassAction>[1],
  snapshot: AppSnapshot,
  ctx: AppActions,
): Parameters<typeof router.onGlassAction>[1] {
  const corrected = syncedScreen(snapshot, nav)

  if (corrected) {
    // Phone-initiated screen change detected — route to the correct screen
    // and return updated nav so useGlasses syncs its internal navRef
    const effectiveNav = { ...nav, screen: corrected, highlightedIndex: 0 }
    const result = router.onGlassAction(action, effectiveNav, snapshot, ctx)
    // Force the corrected screen in case the action handler didn't change it
    return { ...result, screen: corrected }
  }

  return router.onGlassAction(action, nav, snapshot, ctx)
}
