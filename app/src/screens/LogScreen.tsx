import { useRef, useEffect, useState } from 'react'
import { AppShell, NavHeader, Button } from 'even-toolkit/web'
import { IcChevronBack } from 'even-toolkit/web/icons/svg-icons'
import { useNavigate } from 'react-router'
import { useApp } from '../contexts/AppContext'

export function LogScreen() {
  const navigate = useNavigate()
  const { logEntries, clearLogs } = useApp()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logEntries])

  const handleCopy = async () => {
    const text = logEntries
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

  const levelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-500'
      case 'warn': return 'text-yellow-500'
      default: return 'text-text-default'
    }
  }

  return (
    <AppShell
      header={
        <NavHeader
          title="Logs"
          left={
            <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
              <IcChevronBack className="w-5 h-5" />
            </Button>
          }
        />
      }
    >
      <div className="flex gap-2 px-3 py-2">
        <Button variant="secondary" className="flex-1" onClick={handleCopy}>
          {copied ? 'Copied ✓' : 'Copy Logs'}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={clearLogs}>
          Clear
        </Button>
      </div>
      <div className="px-3 pb-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
        {logEntries.length === 0 ? (
          <p className="text-text-muted text-sm">No logs yet.</p>
        ) : (
          <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-all">
            {logEntries.map((entry, i) => (
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
