import { Routes, Route, useNavigate } from 'react-router'
import { AppShell, NavHeader, Button } from 'even-toolkit/web'
import { IcSettings, IcChevronBack, IcEditNumberList } from 'even-toolkit/web/icons/svg-icons'
import { AppProvider } from './contexts/AppContext'
import { ChatScreen } from './screens/ChatScreen'
import { SessionsScreen } from './screens/SessionsScreen'
import { Settings } from './screens/Settings'
import { LogScreen } from './screens/LogScreen'
import { AppGlasses } from './glass/AppGlasses'
import { useApp } from './contexts/AppContext'

function ChatLayout() {
  const navigate = useNavigate()
  const { currentSession, closeSession } = useApp()

  const handleBack = () => {
    if (currentSession) {
      closeSession()
    }
  }

  return (
    <AppShell
      header={
        /* Title intentionally empty — app icon already identifies the app.
           Keeping "" preserves NavHeader's centered-left-right layout.
           See #49: previous !71 incorrectly modified glass/screens/home.ts */
        <NavHeader
          title=""
          left={
            currentSession ? (
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <IcChevronBack className="w-5 h-5" />
              </Button>
            ) : undefined
          }
          right={
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => navigate('/sessions')}>
                <IcEditNumberList className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
                <IcSettings className="w-5 h-5" />
              </Button>
            </div>
          }
        />
      }
    >
      <ChatScreen />
    </AppShell>
  )
}

function SessionsLayout() {
  const navigate = useNavigate()

  return (
    <AppShell
      header={
        <NavHeader
          title="Sessions"
          left={
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <IcChevronBack className="w-5 h-5" />
            </Button>
          }
        />
      }
    >
      <SessionsScreen />
    </AppShell>
  )
}

function SettingsLayout() {
  const navigate = useNavigate()

  return (
    <AppShell
      header={
        <NavHeader
          title="Settings"
          left={
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <IcChevronBack className="w-5 h-5" />
            </Button>
          }
        />
      }
    >
      <Settings />
    </AppShell>
  )
}

function LogsLayout() {
  return <LogScreen />
}

export function App() {
  return (
    <AppProvider>
      {/*
        AppGlasses is placed OUTSIDE the Routes so it persists across
        navigation. Previously it was inside ChatLayout and SessionsLayout,
        causing the glasses bridge to be destroyed and recreated on every
        route change — this broke glasses control when the phone app
        navigated between sessions (see issue #40).
      */}
      <AppGlasses />
      <Routes>
        <Route path="/" element={<ChatLayout />} />
        <Route path="/sessions" element={<SessionsLayout />} />
        <Route path="/settings" element={<SettingsLayout />} />
        <Route path="/logs" element={<LogsLayout />} />
      </Routes>
    </AppProvider>
  )
}
