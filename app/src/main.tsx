import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import './app.css'

// Debug: capture unhandled rejections with full stack trace
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  console.error('[UNHANDLED] Full reason:', reason)
  console.error('[UNHANDLED] Type:', typeof reason)
  console.error('[UNHANDLED] String:', String(reason))
  console.error('[UNHANDLED] JSON:', JSON.stringify(reason, Object.getOwnPropertyNames(reason || {})))
  if (reason instanceof Error) {
    console.error('[UNHANDLED] Stack:', reason.stack)
  }
  if (reason?.then) {
    console.error('[UNHANDLED] Is a Promise — likely a missing .catch()')
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
