import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadConfig, saveConfig } from '../storage'
import type { BridgeConfig } from '../types'

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

describe('storage', () => {
  it('returns defaults when nothing stored', () => {
    const config = loadConfig()
    expect(config).toEqual({ url: '', token: '' })
  })

  it('returns saved config', () => {
    const config: BridgeConfig = { url: 'http://bridge:8643', token: 'secret' }
    saveConfig(config)

    const loaded = loadConfig()
    expect(loaded).toEqual(config)
  })

  it('returns defaults for incomplete config', () => {
    mockLocalStorage.setItem('g2-caduceus-config', JSON.stringify({ url: 'http://x' }))
    const config = loadConfig()
    expect(config).toEqual({ url: '', token: '' })
  })
})
