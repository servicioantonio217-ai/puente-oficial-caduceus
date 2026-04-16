import { useRef, useState, useCallback, useEffect } from 'react'

export interface LogEntry {
  timestamp: string
  level: 'log' | 'warn' | 'error' | 'info'
  args: string[]
}

/**
 * Filter rule: patterns that indicate audio/noise data that should
 * be excluded from the log buffer. These come from the Even SDK which
 * floods console.log with massive PCM audio objects during recording.
 */
const NOISE_PATTERNS = [
  'audioPcm',
  '[EvenAppBridge]',
  'EvenHub event',
  'audioPcmSamples',
  'pcmData',
]

/**
 * Maximum character length for a single stringified arg.
 * Args longer than this are almost certainly audio data objects
 * and would cause clipboard copy crashes if included.
 */
const MAX_ARG_LENGTH = 500

/** Default max entries in the ring buffer (configurable). */
const DEFAULT_MAX_ENTRIES = 200

function formatTimestamp(): string {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

/**
 * Check if a log entry should be filtered out (audio noise, too large).
 * Returns true if the entry should be EXCLUDED from the buffer.
 */
function shouldFilter(args: unknown[]): boolean {
  for (const arg of args) {
    const str = typeof arg === 'string' ? arg : ''
    // Check noise patterns
    for (const pattern of NOISE_PATTERNS) {
      if (str.includes(pattern)) return true
    }
    // Check individual arg size — stringify to catch large objects
    const stringified = stringifyArg(arg)
    if (stringified.length > MAX_ARG_LENGTH) return true
  }
  return false
}

export interface LogBufferOptions {
  /** Max entries in the ring buffer (default: 200) */
  maxEntries?: number
  /** Enable/disable filtering (default: true) */
  enableFilter?: boolean
}

export function useLogBuffer(options: LogBufferOptions = {}) {
  const { maxEntries = DEFAULT_MAX_ENTRIES, enableFilter = true } = options
  const entriesRef = useRef<LogEntry[]>([])
  const [, setTick] = useState(0)

  const addEntry = useCallback((level: LogEntry['level'], args: unknown[]) => {
    // Filter out audio noise and oversized entries
    if (enableFilter && shouldFilter(args)) return

    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level,
      args: args.map(stringifyArg),
    }
    entriesRef.current.push(entry)
    if (entriesRef.current.length > maxEntries) {
      entriesRef.current = entriesRef.current.slice(-maxEntries)
    }
    setTick((t) => t + 1)
  }, [maxEntries, enableFilter])

  useEffect(() => {
    const origLog = console.log
    const origWarn = console.warn
    const origError = console.error
    const origInfo = console.info

    console.log = (...args: unknown[]) => {
      origLog.apply(console, args)
      addEntry('log', args)
    }
    console.warn = (...args: unknown[]) => {
      origWarn.apply(console, args)
      addEntry('warn', args)
    }
    console.error = (...args: unknown[]) => {
      origError.apply(console, args)
      addEntry('error', args)
    }
    console.info = (...args: unknown[]) => {
      origInfo.apply(console, args)
      addEntry('info', args)
    }

    const onError = (event: ErrorEvent) => {
      addEntry('error', [`Uncaught: ${event.message}`, `  at ${event.filename}:${event.lineno}:${event.colno}`])
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      addEntry('error', ['Unhandled rejection:', event.reason])
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    return () => {
      console.log = origLog
      console.warn = origWarn
      console.error = origError
      console.info = origInfo
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [addEntry])

  const clear = useCallback(() => {
    entriesRef.current = []
    setTick((t) => t + 1)
  }, [])

  return { entries: entriesRef.current, clear }
}
