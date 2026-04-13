import { useNavigate } from 'react-router'
import { useApp } from '../contexts/AppContext'
import type { Session } from '../types'
import { Button } from 'even-toolkit/web'
import { IcPlus } from 'even-toolkit/web/icons/svg-icons'

export function SessionsScreen() {
  const { sessions, openSession, removeSession, renameSession, newSession, isLoading } = useApp()
  const navigate = useNavigate()

  const handleNew = () => {
    newSession()
    navigate('/chat')
  }

  const handleOpen = (session: Session) => {
    openSession(session)
    navigate('/chat')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 flex items-center justify-between border-b border-border/30">
        <span className="text-sm font-medium text-text-dim">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={handleNew} disabled={isLoading}>
          <IcPlus className="w-4 h-4 mr-1" />
          New
        </Button>
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
                className="flex items-center justify-between px-4 py-3 active:bg-surface-light cursor-pointer"
                onClick={() => handleOpen(session)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {session.name ?? session.id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {session.message_count ?? 0} messages
                  </p>
                </div>
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
