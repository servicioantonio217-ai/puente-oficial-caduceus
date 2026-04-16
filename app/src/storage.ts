import type { BridgeConfig, RecordingSettings } from './types'

const STORAGE_KEY = 'g2-caduceus-config'
const RECORDING_SETTINGS_KEY = 'g2-caduceus-recording-settings'

/** Default recording settings (matches AudioRecorder defaults). */
export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  autoStopEnabled: true,
  silenceTimeoutMs: 1500,
}

// ---------------------------------------------------------------------------
// Sync localStorage (fallback for browser/dev, also used as immediate init)
// ---------------------------------------------------------------------------

export function loadConfig(): BridgeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.url && parsed.token) return parsed
    }
  } catch { /* ignore */ }
  return { url: '', token: '' }
}

export function saveConfig(config: BridgeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function loadRecordingSettings(): RecordingSettings {
  try {
    const raw = localStorage.getItem(RECORDING_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed.autoStopEnabled === 'boolean' && typeof parsed.silenceTimeoutMs === 'number') {
        return {
          autoStopEnabled: parsed.autoStopEnabled,
          silenceTimeoutMs: Math.max(500, Math.min(5000, parsed.silenceTimeoutMs)),
        }
      }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_RECORDING_SETTINGS }
}

export function saveRecordingSettings(settings: RecordingSettings): void {
  localStorage.setItem(RECORDING_SETTINGS_KEY, JSON.stringify(settings))
}

// ---------------------------------------------------------------------------
// Async Even Hub Bridge Storage (persists across app restarts in WebView)
//
// The Even Hub SDK provides setLocalStorage / getLocalStorage on the native
// bridge object. These persist on the Flutter host side, surviving WebView
// reloads and app restarts — unlike browser localStorage which gets cleared.
//
// All bridge writes are fire-and-forget (no await). If the bridge is
// unavailable (browser/dev), calls silently fall back to localStorage only.
// ---------------------------------------------------------------------------

/** Shape of the Even Hub bridge we need. Keeps us decoupled from the full SDK type. */
interface EvenHubBridge {
  setLocalStorage(key: string, value: string): Promise<boolean>
  getLocalStorage(key: string): Promise<string>
}

/**
 * Attempt to obtain the Even Hub bridge for persistent storage.
 * Returns null when running outside the Even Hub app (browser / simulator).
 */
async function getBridge(): Promise<EvenHubBridge | null> {
  try {
    // Dynamic import so the SDK is only pulled in when actually available.
    const mod = await import('@evenrealities/even_hub_sdk')
    const bridge = await mod.waitForEvenAppBridge()
    return bridge as unknown as EvenHubBridge
  } catch {
    return null
  }
}

/**
 * Load config from Even Hub bridge storage (async).
 * Falls back to localStorage when the bridge is unavailable.
 */
export async function loadConfigFromBridge(): Promise<BridgeConfig> {
  const bridge = await getBridge()
  if (bridge) {
    try {
      const raw = await bridge.getLocalStorage(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.url && parsed.token) {
          // Cache in localStorage for instant sync reads on next mount.
          saveConfig(parsed)
          return parsed
        }
      }
    } catch { /* ignore */ }
  }
  return loadConfig()
}

/**
 * Save config to both localStorage (sync) and Even Hub bridge (async).
 * The bridge write is fire-and-forget — errors are silently swallowed.
 */
export function saveConfigToBridge(config: BridgeConfig): void {
  saveConfig(config)
  getBridge().then((bridge) => {
    if (bridge) {
      bridge.setLocalStorage(STORAGE_KEY, JSON.stringify(config))
    }
  }).catch(() => { /* ignore */ })
}

/**
 * Load recording settings from Even Hub bridge storage (async).
 * Falls back to localStorage when the bridge is unavailable.
 */
export async function loadRecordingSettingsFromBridge(): Promise<RecordingSettings> {
  const bridge = await getBridge()
  if (bridge) {
    try {
      const raw = await bridge.getLocalStorage(RECORDING_SETTINGS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed.autoStopEnabled === 'boolean' && typeof parsed.silenceTimeoutMs === 'number') {
          const settings: RecordingSettings = {
            autoStopEnabled: parsed.autoStopEnabled,
            silenceTimeoutMs: Math.max(500, Math.min(5000, parsed.silenceTimeoutMs)),
          }
          // Cache in localStorage for instant sync reads on next mount.
          saveRecordingSettings(settings)
          return settings
        }
      }
    } catch { /* ignore */ }
  }
  return loadRecordingSettings()
}

/**
 * Save recording settings to both localStorage (sync) and Even Hub bridge (async).
 */
export function saveRecordingSettingsToBridge(settings: RecordingSettings): void {
  saveRecordingSettings(settings)
  getBridge().then((bridge) => {
    if (bridge) {
      bridge.setLocalStorage(RECORDING_SETTINGS_KEY, JSON.stringify(settings))
    }
  }).catch(() => { /* ignore */ })
}
