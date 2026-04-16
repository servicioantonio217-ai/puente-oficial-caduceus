import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useApp } from '../contexts/AppContext'
import type { Session } from '../types'
import { Button } from 'even-toolkit/web'
import { IcPlus } from 'even-toolkit/web/icons/svg-icons'

/**
 * Format an ISO timestamp to a human-readable local-time string.
 *
 * Shows "Today HH:MM", "Yesterday HH:MM", or "MMM DD, HH:MM" for older sessions.
 */
function formatSessionTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    const time = `${hh}:${mi}`

    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return `Today ${time}`

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()
    if (isYesterday) return `Yesterday ${time}`

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[d.getMonth()]} ${d.getDate()}, ${time}`
  } catch {
    return ''
  }
}

export function SessionsScreen() {
  const { sessions, openSession, removeSession, bulkRemoveSessions, renameSession, newSession, isLoading } = useApp()
  const navigate = useNavigate()

  /** Whether the user is in multi-select mode. */
  const [selectMode, setSelectMode] = useState(false)
  /** Set of selected session IDs in multi-select mode. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  /** Whether a bulk delete is in progress. */
  const [isDeleting, setIsDeleting] = useState(false)

  const handleNew = () => {
    newSession()
    navigate('/')
  }

  const handleOpen = (session: Session) => {
    openSession(session)
    navigate('/')
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(sessions.map((s) => s.id)))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const handleBulkDelete = async () => {
    const count = selectedIds.size
    if (!confirm(`Delete ${count} session${count !== 1 ? 's' : ''}? This cannot be undone.`)) return

    setIsDeleting(true)
    try {
      await bulkRemoveSessions([...selectedIds])
      exitSelectMode()
    } finally {
      setIsDeleting(false)
    }
  }

  const allSelected = sessions.length > 0 && selectedIds.size === sessions.length

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 flex items-center justify-between border-b border-border/30">
        {selectMode ? (
          <>
            <span className="text-sm font-medium text-text-dim">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={allSelected ? deselectAll : selectAll}>
                {allSelected ? 'None' : 'All'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0 || isDeleting}
                className="text-negative"
              >
                {isDeleting ? 'Deleting…' : `Delete (${selectedIds.size})`}
              </Button>
              <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-text-dim">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              {sessions.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>
                  Select
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleNew} disabled={isLoading}>
                <IcPlus className="w-4 h-4 mr-1" />
                New
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-sm">
            No sessions yet
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  selectMode
                    ? selectedIds.has(session.id)
                      ? 'bg-surface-light'
                      : 'active:bg-surface-light'
                    : 'active:bg-surface-light cursor-pointer'
                }`}
                onClick={() => {
                  if (selectMode) {
                    toggleSelect(session.id)
                  } else {
                    handleOpen(session)
                  }
                }}
              >
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  {selectMode && (
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                        selectedIds.has(session.id)
                          ? 'bg-primary border-primary'
                          : 'border-border'
                      }`}
                    >
                      {selectedIds.has(session.id) && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {session.name ?? session.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {formatSessionTime(session.updated_at)}
                      {session.updated_at ? ' \u00b7 ' : ''}
                      {session.message_count ?? 0} message{session.message_count === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                {!selectMode && (
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const newName = prompt('Rename session:', session.name || '')
                        if (newName && newName.trim()) renameSession(session.id, newName.trim())
                      }}
                      className="text-text-dim text-xs opacity-60 hover:opacity-100"
                    >
                      Rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('Delete this session?')) removeSession(session.id)
                      }}
                      className="text-negative text-xs opacity-60 hover:opacity-100"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
