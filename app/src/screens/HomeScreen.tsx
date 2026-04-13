import { useNavigate } from 'react-router'
import { useApp } from '../contexts/AppContext'
import { Button } from 'even-toolkit/web'
import { IcPlus } from 'even-toolkit/web/icons/svg-icons'

/**
 * Home screen — smartphone WebUI landing page.
 *
 * Shows connection status and quick actions:
 * - New Session: create a fresh chat
 * - Sessions: browse existing sessions
 * - Resume: quick access to most recent session
 */
export function HomeScreen() {
  const { connected, sessions, newSession, openSession, isLoading, error } = useApp()
  const navigate = useNavigate()

  const handleNew = async () => {
    await newSession()
    navigate('/chat')
  }

  const handleSessions = () => {
    navigate('/sessions')
  }

  const handleResume = async () => {
    const recent = sessions[0]
    if (recent) {
      await openSession(recent)
      navigate('/chat')
    }
  }

  // Show most recent session for quick resume
  const recentSession = sessions.length > 0 ? sessions[0] : null

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
      <h1 className="text-xl font-semibold mb-2">G2 Caduceus</h1>

      <p className="text-sm text-text-dim">
        {connected ? 'Connected' : 'Disconnected'}
      </p>

      {error && (
        <p className="text-sm text-negative">{error}</p>
      )}

      <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
        <Button
          onClick={handleNew}
          disabled={isLoading || !connected}
          className="w-full"
        >
          <IcPlus className="w-4 h-4 mr-1" />
          New Session
        </Button>

        <Button
          variant="secondary"
          onClick={handleSessions}
          disabled={!connected}
          className="w-full"
        >
          Sessions ({sessions.length})
        </Button>
      </div>

      {recentSession && (
        <button
          onClick={handleResume}
          className="mt-6 text-sm text-text-dim underline underline-offset-2"
        >
          Resume: {recentSession.name ?? recentSession.id.slice(0, 8)}
        </button>
      )}
    </div>
  )
}
