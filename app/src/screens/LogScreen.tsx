import { useRef, useEffect, useState, useMemo } from 'react'
import { AppShell, NavHeader, Button } from 'even-toolkit/web'
import { IcChevronBack } from 'even-toolkit/web/icons/svg-icons'
import { useNavigate } from 'react-router'
import { useApp } from '../contexts/AppContext'
import type { LogEntry } from '../hooks/useLogBuffer'

type LogLevel = LogEntry['level']

/** Filter options available in the log viewer */
interface LogFilter {
  search: string
  levels: Set<LogLevel>
}

export function LogScreen() {
  const navigate = useNavigate()
  const { logEntries, clearLogs } = useApp()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState<LogFilter>({
    search: '',
    levels: new Set<LogLevel>(['log', 'warn', 'error', 'info']),
  })

  // Filtered entries based on search and level filters
  const filteredEntries = useMemo(() => {
    return logEntries.filter((entry) => {
      // Level filter
      if (!filter.levels.has(entry.level)) return false
      // Search filter
      if (filter.search) {
        const text = entry.args.join(' ').toLowerCase()
        if (!text.includes(filter.search.toLowerCase())) return false
      }
      return true
    })
  }, [logEntries, filter])

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [filteredEntries.length])

  const handleCopy = async () => {
    const text = filteredEntries
      .map((e) => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.args.join(' ')}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for WebViews without clipboard API
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleLevel = (level: LogLevel) => {
    setFilter((prev) => {
      const levels = new Set(prev.levels)
      if (levels.has(level)) {
        levels.delete(level)
      } else {
        levels.add(level)
      }
      return { ...prev, levels }
    })
  }

  const levelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-500'
      case 'warn': return 'text-yellow-500'
      default: return 'text-text-default'
    }
  }

  const levelButtonStyle = (level: LogLevel) => {
    const active = filter.levels.has(level)
    const base = 'px-2 py-0.5 rounded text-xs font-medium transition-colors'
    if (!active) return `${base} bg-surface-dim text-text-muted`
    switch (level) {
      case 'error': return `${base} bg-red-500/20 text-red-400`
      case 'warn': return `${base} bg-yellow-500/20 text-yellow-400`
      case 'log': return `${base} bg-blue-500/20 text-blue-400`
      case 'info': return `${base} bg-green-500/20 text-green-400`
    }
  }

  const totalCount = logEntries.length
  const filteredCount = filteredEntries.length
  const isFiltered = filter.search || filteredCount < totalCount

  return (
    <AppShell
      header={
        <NavHeader
          title={`Logs${isFiltered ? ` (${filteredCount}/${totalCount})` : ` (${totalCount})`}`}
          left={
            <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
              <IcChevronBack className="w-5 h-5" />
            </Button>
          }
        />
      }
    >
      <div className="px-3 py-2 space-y-2">
        {/* Search input */}
        <input
          type="text"
          placeholder="Search logs..."
          value={filter.search}
          onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
          className="w-full px-3 py-1.5 rounded-lg bg-surface-dim text-text-default text-sm placeholder:text-text-muted border border-border focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {/* Level filter buttons */}
        <div className="flex gap-1.5 items-center">
          {(['error', 'warn', 'log', 'info'] as LogLevel[]).map((level) => (
            <button
              key={level}
              className={levelButtonStyle(level)}
              onClick={() => toggleLevel(level)}
            >
              {level.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={handleCopy}>
            {copied ? 'Copied ✓' : 'Copy Logs'}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={clearLogs}>
            Clear
          </Button>
        </div>
      </div>

      {/* Log entries */}
      <div className="px-3 pb-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {filteredEntries.length === 0 ? (
          <p className="text-text-muted text-sm">
            {totalCount === 0 ? 'No logs yet.' : 'No logs match the current filter.'}
          </p>
        ) : (
          <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-all">
            {filteredEntries.map((entry, i) => (
              <div key={i} className={levelColor(entry.level)}>
                <span className="text-text-muted">[{entry.timestamp}]</span>{' '}
                <span>[{entry.level.toUpperCase()}]</span>{' '}
                {entry.args.join(' ')}
              </div>
            ))}
            <div ref={bottomRef} />
          </pre>
        )}
      </div>
    </AppShell>
  )
}
