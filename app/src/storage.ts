import type { BridgeConfig, RecordingSettings } from './types'
import { storageGet, storageGetRaw, storageSet } from 'even-toolkit/storage'

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
      console.debug('[Caduceus storage] Config loaded from bridge')
      // Cache in localStorage for instant sync reads on next mount.
      saveConfigToLocal(cfg)
      return cfg
    }
    console.debug('[Caduceus storage] Bridge has no config stored')
  } catch (err) {
    console.warn('[Caduceus storage] loadConfigFromBridge failed:', err)
  }
  return loadConfig()
}

/**
 * Save config to both localStorage (sync) and Even Hub bridge (async).
 * Fire-and-forget — even-toolkit swallows write errors internally.
 * Verifies the write by reading back from bridge after a short delay.
 */
export function saveConfigToBridge(config: BridgeConfig): void {
  saveConfigToLocal(config)
  storageSet(STORAGE_KEY, config)
  // Verify write landed — read back and compare
  setTimeout(() => {
    storageGetRaw(STORAGE_KEY).then((raw) => {
      if (!raw || raw === '') {
        console.warn('[Caduceus storage] Config NOT persisted to bridge (empty after write)')
      }
    }).catch(() => {
      console.warn('[Caduceus storage] Config bridge verify failed — bridge unavailable')
    })
  }, 500)
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
      console.debug('[Caduceus storage] Recording settings loaded from bridge')
      saveRecordingSettingsToLocal(settings)
      return settings
    }
    console.debug('[Caduceus storage] Bridge has no recording settings stored')
  } catch (err) {
    console.warn('[Caduceus storage] loadRecordingSettingsFromBridge failed:', err)
  }
  return loadRecordingSettings()
}

/**
 * Save recording settings to both localStorage (sync) and Even Hub bridge (async).
 * Verifies the write by reading back from bridge after a short delay.
 */
export function saveRecordingSettingsToBridge(settings: RecordingSettings): void {
  saveRecordingSettingsToLocal(settings)
  storageSet(RECORDING_SETTINGS_KEY, settings)
  setTimeout(() => {
    storageGetRaw(RECORDING_SETTINGS_KEY).then((raw) => {
      if (!raw || raw === '') {
        console.warn('[Caduceus storage] Recording settings NOT persisted to bridge (empty after write)')
      }
    }).catch(() => {
      console.warn('[Caduceus storage] Recording settings bridge verify failed — bridge unavailable')
    })
  }, 500)
}
