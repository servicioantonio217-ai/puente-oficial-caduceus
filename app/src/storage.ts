import type { BridgeConfig } from './types'

const STORAGE_KEY = 'g2-caduceus-config'

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
