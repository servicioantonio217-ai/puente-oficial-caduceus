import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadConfig, saveConfigToBridge,
  loadRecordingSettings, saveRecordingSettingsToBridge,
  loadAgentTimeoutSettings, saveAgentTimeoutSettingsToBridge,
  DEFAULT_RECORDING_SETTINGS,
  DEFAULT_AGENT_TIMEOUT_SETTINGS,
  MIN_AGENT_TIMEOUT_SEC,
} from '../storage'
import type { BridgeConfig, RecordingSettings, AgentTimeoutSettings } from '../types'

const mockLocalStorage = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { store[key] = val }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: () => { store = {} },
  }
})()

vi.stubGlobal('localStorage', mockLocalStorage)

beforeEach(() => {
  mockLocalStorage.clear()
  mockLocalStorage.getItem.mockClear()
  mockLocalStorage.setItem.mockClear()
})

describe('storage — BridgeConfig', () => {
  it('returns defaults when nothing stored', () => {
    const config = loadConfig()
    expect(config).toEqual({ url: '', token: '' })
  })

  it('returns saved config', () => {
    const config: BridgeConfig = { url: 'http://bridge:8643', token: 'secret' }
    saveConfigToBridge(config)

    const loaded = loadConfig()
    expect(loaded).toEqual(config)
  })

  it('returns defaults for incomplete config', () => {
    mockLocalStorage.setItem('g2-caduceus-config', JSON.stringify({ url: 'http://x' }))
    const config = loadConfig()
    expect(config).toEqual({ url: '', token: '' })
  })
})

describe('storage — RecordingSettings', () => {
  it('returns defaults when nothing stored', () => {
    const settings = loadRecordingSettings()
    expect(settings).toEqual(DEFAULT_RECORDING_SETTINGS)
    expect(settings).toEqual({ autoStopEnabled: true, silenceTimeoutMs: 1500 })
  })

  it('returns saved settings', () => {
    const settings: RecordingSettings = { autoStopEnabled: false, silenceTimeoutMs: 3000 }
    saveRecordingSettingsToBridge(settings)

    const loaded = loadRecordingSettings()
    expect(loaded).toEqual(settings)
  })

  it('returns defaults for invalid JSON', () => {
    mockLocalStorage.setItem('g2-caduceus-recording-settings', 'not-json')
    const settings = loadRecordingSettings()
    expect(settings).toEqual(DEFAULT_RECORDING_SETTINGS)
  })

  it('returns defaults for partial settings (missing autoStopEnabled)', () => {
    mockLocalStorage.setItem(
      'g2-caduceus-recording-settings',
      JSON.stringify({ silenceTimeoutMs: 2000 }),
    )
    const settings = loadRecordingSettings()
    expect(settings).toEqual(DEFAULT_RECORDING_SETTINGS)
  })

  it('returns defaults for partial settings (missing silenceTimeoutMs)', () => {
    mockLocalStorage.setItem(
      'g2-caduceus-recording-settings',
      JSON.stringify({ autoStopEnabled: false }),
    )
    const settings = loadRecordingSettings()
    expect(settings).toEqual(DEFAULT_RECORDING_SETTINGS)
  })

  it('clamps silenceTimeoutMs to minimum (500ms)', () => {
    mockLocalStorage.setItem(
      'g2-caduceus-recording-settings',
      JSON.stringify({ autoStopEnabled: true, silenceTimeoutMs: 100 }),
    )
    const settings = loadRecordingSettings()
    expect(settings.silenceTimeoutMs).toBe(500)
  })

  it('clamps silenceTimeoutMs to maximum (5000ms)', () => {
    mockLocalStorage.setItem(
      'g2-caduceus-recording-settings',
      JSON.stringify({ autoStopEnabled: true, silenceTimeoutMs: 10000 }),
    )
    const settings = loadRecordingSettings()
    expect(settings.silenceTimeoutMs).toBe(5000)
  })

  it('allows silenceTimeoutMs within valid range', () => {
    mockLocalStorage.setItem(
      'g2-caduceus-recording-settings',
      JSON.stringify({ autoStopEnabled: false, silenceTimeoutMs: 2500 }),
    )
    const settings = loadRecordingSettings()
    expect(settings.autoStopEnabled).toBe(false)
    expect(settings.silenceTimeoutMs).toBe(2500)
  })

  it('persists settings to localStorage', () => {
    const settings: RecordingSettings = { autoStopEnabled: false, silenceTimeoutMs: 4000 }
    saveRecordingSettingsToBridge(settings)

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'g2-caduceus-recording-settings',
      JSON.stringify(settings),
    )
  })

  it('does not affect BridgeConfig storage', () => {
    const config: BridgeConfig = { url: 'http://x:8643', token: 'tok' }
    saveConfigToBridge(config)

    const settings: RecordingSettings = { autoStopEnabled: false, silenceTimeoutMs: 2000 }
    saveRecordingSettingsToBridge(settings)

    // Both should load independently
    expect(loadConfig()).toEqual(config)
    expect(loadRecordingSettings()).toEqual(settings)
  })
})

describe('storage — AgentTimeoutSettings', () => {
  it('returns defaults when nothing stored', () => {
    const settings = loadAgentTimeoutSettings()
    expect(settings).toEqual(DEFAULT_AGENT_TIMEOUT_SETTINGS)
    expect(settings).toEqual({ agentTimeoutSec: 0 })
  })

  it('returns saved settings', () => {
    const settings: AgentTimeoutSettings = { agentTimeoutSec: 120 }
    saveAgentTimeoutSettingsToBridge(settings)

    const loaded = loadAgentTimeoutSettings()
    expect(loaded).toEqual(settings)
  })

  it('returns defaults for invalid JSON', () => {
    mockLocalStorage.setItem('g2-caduceus-agent-timeout', 'not-json')
    const settings = loadAgentTimeoutSettings()
    expect(settings).toEqual(DEFAULT_AGENT_TIMEOUT_SETTINGS)
  })

  it('returns defaults for partial settings (missing agentTimeoutSec)', () => {
    mockLocalStorage.setItem(
      'g2-caduceus-agent-timeout',
      JSON.stringify({}),
    )
    const settings = loadAgentTimeoutSettings()
    expect(settings).toEqual(DEFAULT_AGENT_TIMEOUT_SETTINGS)
  })

  it('clamps agentTimeoutSec to minimum (0 — means auto)', () => {
    mockLocalStorage.setItem(
      'g2-caduceus-agent-timeout',
      JSON.stringify({ agentTimeoutSec: -5 }),
    )
    const settings = loadAgentTimeoutSettings()
    expect(settings.agentTimeoutSec).toBe(0)
  })

  it('allows positive agentTimeoutSec', () => {
    mockLocalStorage.setItem(
      'g2-caduceus-agent-timeout',
      JSON.stringify({ agentTimeoutSec: 600 }),
    )
    const settings = loadAgentTimeoutSettings()
    expect(settings.agentTimeoutSec).toBe(600)
  })

  it('persists settings to localStorage', () => {
    const settings: AgentTimeoutSettings = { agentTimeoutSec: 300 }
    saveAgentTimeoutSettingsToBridge(settings)

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'g2-caduceus-agent-timeout',
      JSON.stringify(settings),
    )
  })

  it('does not affect other storage keys', () => {
    const config: BridgeConfig = { url: 'http://x:8643', token: 'tok' }
    saveConfigToBridge(config)

    const timeoutSettings: AgentTimeoutSettings = { agentTimeoutSec: 180 }
    saveAgentTimeoutSettingsToBridge(timeoutSettings)

    // Both should load independently
    expect(loadConfig()).toEqual(config)
    expect(loadAgentTimeoutSettings()).toEqual(timeoutSettings)
  })
})
