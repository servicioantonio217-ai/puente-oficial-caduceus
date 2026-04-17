import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { BridgeConfig, RecordingSettings } from './types'

const STORAGE_KEY = 'g2-caduceus-config'
const RECORDING_SETTINGS_KEY = 'g2-caduceus-recording-settings'

/** Default recording settings (matches AudioRecorder defaults). */
export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  autoStopEnabled: true,
  silenceTimeoutMs: 1500,
}

const DEFAULT_CONFIG: BridgeConfig = { url: '', token: '' }

// ---------------------------------------------------------------------------
// Bridge singleton — lazy init, same pattern as even-toolkit/storage
// ---------------------------------------------------------------------------
let bridgePromise: Promise<EvenAppBridge> | null = null

async function getBridge(): Promise<EvenAppBridge> {
  if (bridgePromise) return bridgePromise
  bridgePromise = waitForEvenAppBridge().catch((err) => {
    console.warn('[Caduceus storage] EvenAppBridge not available:', err)
    bridgePromise = null
    throw err
  })
  return bridgePromise
}

// ---------------------------------------------------------------------------
// Native SDK storage — wraps setLocalStorage / getLocalStorage with
// JSON serialization, logging, and proper boolean return values.
// ---------------------------------------------------------------------------

/**
 * Read a JSON-serialized value from the native Even Hub bridge storage.
 * Returns `fallback` if bridge is unavailable or key is empty.
 */
async function bridgeGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const bridge = await getBridge()
    const raw = await bridge.getLocalStorage(key)
    if (raw && raw !== '') {
      return JSON.parse(raw) as T
    }
  } catch (err) {
    console.warn(`[Caduceus storage] bridgeGet("${key}") failed:`, err)
  }
  return fallback
}

/**
 * Write a JSON-serialized value to the native Even Hub bridge storage.
 * Returns `true` on success, `false` on failure.
 * The SDK returns `boolean` — we surface that instead of swallowing it.
 */
async function bridgeSet(key: string, value: unknown): Promise<boolean> {
  try {
    const bridge = await getBridge()
    const json = JSON.stringify(value)
    const ok = await bridge.setLocalStorage(key, json)
    if (ok) {
      console.debug(`[Caduceus storage] bridgeSet("${key}") succeeded`)
    } else {
      console.warn(`[Caduceus storage] bridgeSet("${key}") returned false`)
    }
    return ok
  } catch (err) {
    console.warn(`[Caduceus storage] bridgeSet("${key}") failed:`, err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Sync localStorage (for useState initializer — must be synchronous)
// ---------------------------------------------------------------------------
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
// Async bridge storage (persists across WebView reloads / app restarts)
// ---------------------------------------------------------------------------
// Direct use of the native SDK — no even-toolkit wrapper.
// Returns actual success/failure booleans and logs all operations.

export async function loadConfigFromBridge(): Promise<BridgeConfig> {
  const cfg = await bridgeGet<BridgeConfig>(STORAGE_KEY, DEFAULT_CONFIG)
  if (cfg.url && cfg.token) {
    // Cache in localStorage for instant sync reads on next mount.
    saveConfigToLocal(cfg)
    return cfg
  }
  return loadConfig()
}

/**
 * Save config to both localStorage (sync) and Even Hub bridge (async).
 * Returns `true` if bridge write succeeded, `false` otherwise.
 * Fire-and-forget safe — but callers CAN await for confirmation.
 */
export async function saveConfigToBridge(config: BridgeConfig): Promise<boolean> {
  saveConfigToLocal(config)
  return bridgeSet(STORAGE_KEY, config)
}

export async function loadRecordingSettingsFromBridge(): Promise<RecordingSettings> {
  const raw = await bridgeGet<Partial<RecordingSettings>>(
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
  return loadRecordingSettings()
}

/**
 * Save recording settings to both localStorage (sync) and Even Hub bridge (async).
 * Returns `true` if bridge write succeeded, `false` otherwise.
 */
export async function saveRecordingSettingsToBridge(settings: RecordingSettings): Promise<boolean> {
  saveRecordingSettingsToLocal(settings)
  return bridgeSet(RECORDING_SETTINGS_KEY, settings)
}
