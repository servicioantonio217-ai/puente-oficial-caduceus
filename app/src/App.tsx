import { Routes, Route, useNavigate, useLocation } from 'react-router'
import { AppShell, NavHeader, Button } from 'even-toolkit/web'
import { IcSettings, IcChevronBack, IcEditNumberList } from 'even-toolkit/web/icons/svg-icons'
import { AppProvider, useApp } from './contexts/AppContext'
import { ChatScreen } from './screens/ChatScreen'
import { SessionsScreen } from './screens/SessionsScreen'
import { Settings } from './screens/Settings'
import { AppGlasses } from './glass/AppGlasses'

function ChatLayout() {
  const navigate = useNavigate()

  return (
    <AppShell
      header={
        <NavHeader
          title="G2 Caduceus"
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
      <AppGlasses />
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
      <AppGlasses />
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

export function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<ChatLayout />} />
        <Route path="/sessions" element={<SessionsLayout />} />
        <Route path="/settings" element={<SettingsLayout />} />
      </Routes>
    </AppProvider>
  )
}
