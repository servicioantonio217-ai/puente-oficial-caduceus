import { useRef, useState, useCallback, useEffect } from 'react'

export interface LogEntry {
  timestamp: string
  level: 'log' | 'warn' | 'error' | 'info'
  args: string[]
}

const MAX_LOG_ENTRIES = 500

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

export function useLogBuffer() {
  const entriesRef = useRef<LogEntry[]>([])
  const [, setTick] = useState(0)

  const addEntry = useCallback((level: LogEntry['level'], args: unknown[]) => {
    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level,
      args: args.map(stringifyArg),
    }
    entriesRef.current.push(entry)
    if (entriesRef.current.length > MAX_LOG_ENTRIES) {
      entriesRef.current = entriesRef.current.slice(-MAX_LOG_ENTRIES)
    }
    setTick((t) => t + 1)
  }, [])

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
