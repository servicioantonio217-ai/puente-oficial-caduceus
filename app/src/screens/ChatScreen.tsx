import { useState } from 'react'
import { ChatContainer, ChatInput } from 'even-toolkit/web'
import type { ChatMessage } from 'even-toolkit/web'
import { useApp } from '../contexts/AppContext'

export function ChatScreen() {
  const { currentSession, messages, isLoading, error, sendText, newSession } = useApp()
  const [inputValue, setInputValue] = useState('')

  const handleSend = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    sendText(trimmed)
    setInputValue('')
  }

  // Map to toolkit ChatMessage format
  const chatMessages: ChatMessage[] = messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.created_at).getTime(),
  }))

  // Loading indicator
  if (isLoading) {
    chatMessages.push({
      id: 'thinking',
      role: 'assistant',
      content: '',
      thinking: 'Waiting for response...',
    })
  }

  if (!currentSession) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-text-dim">No session selected</p>
          <button
            onClick={() => newSession()}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm"
          >
            Start new session
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {error && (
        <div className="px-3 py-2 bg-negative-alpha text-negative text-sm">
          {error}
        </div>
      )}
      <ChatContainer
        messages={chatMessages}
        className="flex-1 min-h-0"
        input={
          <div className="flex items-end gap-2 p-3 bg-bg border-t border-border/30">
            <div className="flex-1 flex items-end gap-2">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSend}
                placeholder={isLoading ? 'Waiting for response...' : 'Ask anything...'}
                className="flex-1 !p-0 !bg-transparent"
              />
            </div>
          </div>
        }
      />
    </div>
  )
}
