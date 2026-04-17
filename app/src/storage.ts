import type { BridgeConfig, RecordingSettings } from './types'
import { storageGet, storageSet } from 'even-toolkit/storage'

const STORAGE_KEY = 'g2-caduceus-config'
const RECORDING_SETTINGS_KEY = 'g2-caduceus-recording-settings'

/** Default recording settings (matches AudioRecorder defaults). */
export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  autoStopEnabled: true,
  silenceTimeoutMs: 1500,
}

const DEFAULT_CONFIG: BridgeConfig = { url: '', token: '' }

// ---------------------------------------------------------------------------
// Sync localStorage (for useState initializer — must be synchronous)
// ---------------------------------------------------------------------------
// even-toolkit's storageGet/set is async (uses the Even Hub bridge).
// React's useState initializer must be synchronous, so we read from
// browser localStorage as an immediate seed, then upgrade to bridge
// storage values in a useEffect once the async bridge is ready.

export function loadConfig(): BridgeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.url && parsed.token) return parsed
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfigToLocal(config: BridgeConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch { /* ignore — localStorage may be unavailable */ }
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

function saveRecordingSettingsToLocal(settings: RecordingSettings): void {
  try {
    localStorage.setItem(RECORDING_SETTINGS_KEY, JSON.stringify(settings))
  } catch { /* ignore — localStorage may be unavailable */ }
}

// ---------------------------------------------------------------------------
// Async bridge storage via even-toolkit (persists across WebView reloads)
// ---------------------------------------------------------------------------
// even-toolkit/storage wraps the Even Hub SDK bridge with:
//   - Automatic JSON.stringify / JSON.parse
//   - Write chain to prevent read-after-write races
//   - Graceful fallback when bridge is unavailable
//
// We keep sync localStorage writes alongside for immediate reads on mount.

export async function loadConfigFromBridge(): Promise<BridgeConfig> {
  try {
    const cfg = await storageGet<BridgeConfig>(STORAGE_KEY, DEFAULT_CONFIG)
    if (cfg.url && cfg.token) {
      // Cache in localStorage for instant sync reads on next mount.
      saveConfigToLocal(cfg)
      return cfg
    }
  } catch { /* bridge unavailable — localStorage values already in use */ }
  return loadConfig()
}

/**
 * Save config to both localStorage (sync) and Even Hub bridge (async).
 * Fire-and-forget — errors are silently swallowed by even-toolkit.
 */
export function saveConfigToBridge(config: BridgeConfig): void {
  saveConfigToLocal(config)
  storageSet(STORAGE_KEY, config) // fire-and-forget, errors swallowed internally
}

export async function loadRecordingSettingsFromBridge(): Promise<RecordingSettings> {
  try {
    const raw = await storageGet<Partial<RecordingSettings>>(
      RECORDING_SETTINGS_KEY,
      DEFAULT_RECORDING_SETTINGS,
    )
    if (typeof raw.autoStopEnabled === 'boolean' && typeof raw.silenceTimeoutMs === 'number') {
      const settings: RecordingSettings = {
        autoStopEnabled: raw.autoStopEnabled,
        silenceTimeoutMs: Math.max(500, Math.min(5000, raw.silenceTimeoutMs)),
      }
      saveRecordingSettingsToLocal(settings)
      return settings
    }
  } catch { /* bridge unavailable */ }
  return loadRecordingSettings()
}

/**
 * Save recording settings to both localStorage (sync) and Even Hub bridge (async).
 */
export function saveRecordingSettingsToBridge(settings: RecordingSettings): void {
  saveRecordingSettingsToLocal(settings)
  storageSet(RECORDING_SETTINGS_KEY, settings) // fire-and-forget
}
