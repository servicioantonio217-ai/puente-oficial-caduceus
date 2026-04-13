/**
 * Foreground/background lifecycle management for the Even Hub WebView.
 *
 * The Even Hub SDK sends FOREGROUND_ENTER (event 4) and FOREGROUND_EXIT (event 5)
 * events when the WebView gains or loses focus. The WebView can be suspended by the
 * OS after ~2 minutes of inactivity, freezing all timers and callbacks.
 *
 * This module provides:
 * - A keep-alive heartbeat that periodically pings to prevent WebView suspension.
 * - Lifecycle hooks (onForeground / onBackground) for resource management.
 * - Safe cleanup of all intervals/timeouts on background and unmount.
 *
 * NOTE: Keep-alive is a best-effort mechanism — the OS may still suspend the
 * WebView under memory pressure. The app should always handle re-entry gracefully.
 */

/** Default keep-alive interval in milliseconds (~30s, well under the 2-min threshold). */
const KEEP_ALIVE_INTERVAL_MS = 30_000

export interface LifecycleOptions {
  /** Called when the WebView enters the foreground. */
  onForeground?: () => void
  /** Called when the WebView exits the foreground (backgrounded). */
  onBackground?: () => void
  /** Keep-alive interval in ms (default: 30000). Set to 0 to disable. */
  keepAliveIntervalMs?: number
}

/**
 * Manage foreground/background lifecycle and keep-alive heartbeat.
 *
 * Returns a cleanup function that must be called on unmount to stop the keep-alive.
 *
 * @example
 * ```tsx
 * useEffect(() => {
 *   return setupLifecycle({
 *     onForeground: () => connect(),
 *     onBackground: () => stopRecording(),
 *     keepAliveIntervalMs: 30_000,
 *   })
 * }, [])
 * ```
 */
export function setupLifecycle(options: LifecycleOptions): () => void {
  const interval = options.keepAliveIntervalMs ?? KEEP_ALIVE_INTERVAL_MS
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null

  // Register foreground/background event listeners via EvenAppBridge
  // The SDK fires events with type 4 (FOREGROUND_ENTER) and 5 (FOREGROUND_EXIT)
  function handlePageEvent(event: unknown): void {
    const evt = event as { type?: number } | null
    if (!evt || typeof evt.type !== 'number') return

    switch (evt.type) {
      case 4: // FOREGROUND_ENTER
        restartKeepAlive()
        options.onForeground?.()
        break
      case 5: // FOREGROUND_EXIT
        stopKeepAlive()
        options.onBackground?.()
        break
    }
  }

  // Register via EvenAppBridge if available
  const bridge = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>).EvenAppBridge as {
    onPageEvent?: (cb: (event: unknown) => void) => void
  } | null : null

  if (bridge?.onPageEvent) {
    bridge.onPageEvent(handlePageEvent)
  }

  // Also listen for standard visibility change as fallback (browser/WebUI)
  function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      restartKeepAlive()
      options.onForeground?.()
    } else if (document.visibilityState === 'hidden') {
      stopKeepAlive()
      options.onBackground?.()
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)

  // Start keep-alive immediately
  if (interval > 0) {
    restartKeepAlive()
  }

  function restartKeepAlive(): void {
    stopKeepAlive()
    // Schedule a no-op keep-alive to prevent WebView suspension.
    // Using a self-resetting timer ensures the WebView's JS runtime stays active.
    keepAliveTimer = setInterval(() => {
      // Intentionally empty — the timer callback itself is the keep-alive signal.
      // The WebView's JS runtime stays alive as long as there are pending timers.
    }, interval)
  }

  function stopKeepAlive(): void {
    if (keepAliveTimer !== null) {
      clearInterval(keepAliveTimer)
      keepAliveTimer = null
    }
  }

  // Return cleanup function
  return () => {
    stopKeepAlive()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    // EvenAppBridge doesn't have an offPageEvent API — listeners are automatically
    // cleaned up when the WebView is destroyed. For the visibility listener, we
    // handle it above.
  }
}
