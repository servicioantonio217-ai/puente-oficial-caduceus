# Log Viewer Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the "About" section in Settings with a "Log" button that navigates to a dedicated log viewer page displaying the app's console output in real-time, with a "Copy Logs" button.

**Architecture:** Intercept `console.log/warn/error` calls via a global log buffer in AppContext. A new `/logs` route renders the buffer in a monospace scrollable view. The About section in Settings.tsx is replaced with a Log navigation entry.

**Tech Stack:** React, React Router, even-toolkit web components, existing AppContext pattern

---

### Task 1: Create useLogBuffer hook

**Objective:** Create a hook that captures console output into a buffer and provides it to consumers.

**Files:**
- Create: `app/src/hooks/useLogBuffer.ts`

**Step 1: Write the hook**

```typescript
import { useRef, useState, useCallback, useEffect } from 'react'

export interface LogEntry {
  timestamp: string
  level: 'log' | 'warn' | 'error' | 'info'
  args: string[]
}

const MAX_LOG_ENTRIES = 500

export function useLogBuffer() {
  const entriesRef = useRef<LogEntry[]>([])
  const [, setTick] = useState(0)

  const addEntry = useCallback((level: LogEntry['level'], args: unknown[]) => {
    const now = new Date()
    const timestamp = now.toLocaleTimeString('en-GB', {
      hours: '2-digit',
      minutes: '2-digit',
      seconds: '2-digit',
      fractionalSecondDigits: 3,
    })
    const entry: LogEntry = {
      timestamp,
      level,
      args: args.map((a) => {
        if (typeof a === 'string') return a
        try {
          return JSON.stringify(a, null, 2)
        } catch {
          return String(a)
        }
      }),
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

    return () => {
      console.log = origLog
      console.warn = origWarn
      console.error = origError
      console.info = origInfo
    }
  }, [addEntry])

  return { entries: entriesRef.current, clear: () => { entriesRef.current = []; setTick((t) => t + 1) } }
}
```

**Step 2: Verify it compiles**

Run: `cd app && npx tsc --noEmit src/hooks/useLogBuffer.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add app/src/hooks/useLogBuffer.ts
git commit -m "feat: add useLogBuffer hook for console capture"
```

---

### Task 2: Integrate log buffer into AppContext

**Objective:** Add log buffer state to AppContext so it's accessible from any screen.

**Files:**
- Modify: `app/src/contexts/AppContext.tsx`

**Step 1: Add log buffer to AppContext**

- Import `useLogBuffer` and `LogEntry`
- Call `useLogBuffer()` inside `AppProvider`
- Add `logEntries: LogEntry[]` and `clearLogs: () => void` to `AppContextValue`
- Expose both from the provider value

**Step 2: Verify compilation**

Run: `cd app && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add app/src/contexts/AppContext.tsx
git commit -m "feat: integrate log buffer into AppContext"
```

---

### Task 3: Create LogScreen component

**Objective:** Build the log viewer screen with monospace display and copy-to-clipboard.

**Files:**
- Create: `app/src/screens/LogScreen.tsx`

**Step 1: Write the LogScreen component**

```tsx
import { useRef, useEffect } from 'react'
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
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: create textarea and copy
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
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
```

**Step 2: Verify compilation**

Run: `cd app && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add app/src/screens/LogScreen.tsx
git commit -m "feat: add LogScreen component with copy and clear"
```

---

### Task 4: Add /logs route and update Settings

**Objective:** Wire up the new route and replace About with Log entry.

**Files:**
- Modify: `app/src/App.tsx` — add `/logs` route
- Modify: `app/src/screens/Settings.tsx` — replace About with Log navigation

**Step 1: Add route in App.tsx**

- Import `LogScreen` and `IcList` icon (or similar)
- Add `<Route path="/logs" element={<LogsLayout />} />`
- Create `LogsLayout` similar to `SettingsLayout`

**Step 2: Update Settings.tsx**

- Replace the "About" `<SettingsGroup>` with a "Log" entry that navigates to `/logs`
- Use a `<ListItem>` with `drillLabel`-style trailing chevron or just use `onClick` with `useNavigate`

**Step 3: Verify compilation**

Run: `cd app && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add app/src/App.tsx app/src/screens/Settings.tsx
git commit -m "feat: add /logs route and replace About with Log entry"
```

---

### Task 5: Verify everything works

**Objective:** Full verification — lint, typecheck, build.

**Step 1: Run ESLint**

Run: `cd app && npx eslint src/ --max-warnings 0`

**Step 2: Run TypeScript check**

Run: `cd app && npx tsc --noEmit`

**Step 3: Run build**

Run: `cd app && npm run build`

**Step 4: Run tests**

Run: `cd app && npx vitest run`

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: lint/typecheck fixes for log viewer"
```

---

### Task 6: Create MR

**Objective:** Push branch and create Merge Request on GitLab.

**Step 1: Push branch**

```bash
git push origin feat/log-viewer -o merge_request.create
```

**Step 2: Create MR via API**

Use GitLab API to create MR targeting main with:
- Title: "feat: Replace About page with Log viewer"
- Description: References issue #22
- Assignee: coding_agent (ID 31)

**Step 3: Set up MR monitoring cronjob**
