import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest'
import { setupLifecycle } from '../lifecycle'

describe('setupLifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'clearInterval')
    vi.spyOn(globalThis, 'setInterval')
    vi.spyOn(document, 'addEventListener')
    vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts a keep-alive interval on setup', () => {
    setupLifecycle({ keepAliveIntervalMs: 30_000 })
    expect(vi.mocked(globalThis.setInterval)).toHaveBeenCalledTimes(1)
  })

  it('clears the interval on cleanup', () => {
    const cleanup = setupLifecycle({ keepAliveIntervalMs: 30_000 })
    expect(vi.mocked(globalThis.clearInterval)).not.toHaveBeenCalled()
    cleanup()
    expect(vi.mocked(globalThis.clearInterval)).toHaveBeenCalledTimes(1)
  })

  it('registers visibilitychange listener', () => {
    const cleanup = setupLifecycle({})
    expect(vi.mocked(document.addEventListener)).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    )
    cleanup()
    expect(vi.mocked(document.removeEventListener)).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    )
  })

  it('calls onForeground when document becomes visible', () => {
    const onForeground = vi.fn()
    setupLifecycle({ onForeground })

    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })
    const calls = vi.mocked(document.addEventListener).mock.calls
    const handler = calls.find((call) => call[0] === 'visibilitychange')?.[1] as EventListener
    handler?.(new Event('visibilitychange'))

    expect(onForeground).toHaveBeenCalledTimes(1)
  })

  it('calls onBackground when document becomes hidden', () => {
    const onBackground = vi.fn()
    setupLifecycle({ onBackground })

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true })
    const calls = vi.mocked(document.addEventListener).mock.calls
    const handler = calls.find((call) => call[0] === 'visibilitychange')?.[1] as EventListener
    handler?.(new Event('visibilitychange'))

    expect(onBackground).toHaveBeenCalledTimes(1)
  })

  it('does not start interval when keepAliveIntervalMs is 0', () => {
    setupLifecycle({ keepAliveIntervalMs: 0 })
    expect(vi.mocked(globalThis.setInterval)).not.toHaveBeenCalled()
  })

  it('restarts interval when foreground enters after being stopped', () => {
    const cleanup = setupLifecycle({ keepAliveIntervalMs: 10_000 })

    // Initial interval
    expect(vi.mocked(globalThis.setInterval)).toHaveBeenCalledTimes(1)

    // Background — stops interval
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true })
    const calls = vi.mocked(document.addEventListener).mock.calls
    const handler = calls.find((call) => call[0] === 'visibilitychange')?.[1] as EventListener
    handler?.(new Event('visibilitychange'))
    expect(vi.mocked(globalThis.clearInterval)).toHaveBeenCalledTimes(1)

    // Foreground — restarts interval
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })
    handler?.(new Event('visibilitychange'))
    expect(vi.mocked(globalThis.setInterval)).toHaveBeenCalledTimes(2)

    cleanup()
  })

  it('handles EvenAppBridge onPageEvent for foreground enter', () => {
    const onForeground = vi.fn()
    const bridgeMock = { onPageEvent: vi.fn() }
    vi.stubGlobal('window', { EvenAppBridge: bridgeMock })

    const cleanup = setupLifecycle({ onForeground })

    const pageHandler = bridgeMock.onPageEvent.mock.calls[0][0] as (event: unknown) => void
    pageHandler({ type: 4 })

    expect(onForeground).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('handles EvenAppBridge onPageEvent for foreground exit', () => {
    const onBackground = vi.fn()
    const bridgeMock = { onPageEvent: vi.fn() }
    vi.stubGlobal('window', { EvenAppBridge: bridgeMock })

    const cleanup = setupLifecycle({ onBackground })

    const pageHandler = bridgeMock.onPageEvent.mock.calls[0][0] as (event: unknown) => void
    pageHandler({ type: 5 })

    expect(onBackground).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('ignores unknown event types from EvenAppBridge', () => {
    const onForeground = vi.fn()
    const onBackground = vi.fn()
    const bridgeMock = { onPageEvent: vi.fn() }
    vi.stubGlobal('window', { EvenAppBridge: bridgeMock })

    const cleanup = setupLifecycle({ onForeground, onBackground })

    const pageHandler = bridgeMock.onPageEvent.mock.calls[0][0] as (event: unknown) => void
    pageHandler({ type: 99 })
    pageHandler(null)
    pageHandler({})

    expect(onForeground).not.toHaveBeenCalled()
    expect(onBackground).not.toHaveBeenCalled()
    cleanup()
  })
})
