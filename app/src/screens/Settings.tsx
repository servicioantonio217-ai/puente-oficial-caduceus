import { useState } from 'react'
import { useNavigate } from 'react-router'
import { SettingsGroup, ListItem, Input, Button, Toggle } from 'even-toolkit/web'
import { useApp } from '../contexts/AppContext'
import type { BridgeConfig, RecordingSettings } from '../types'

/** Clamp a value to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function Settings() {
  const navigate = useNavigate()
  const {
    config, setConfig, connected, connect, disconnect,
    recordingSettings, setRecordingSettings,
  } = useApp()
  const [url, setUrl] = useState(config.url)
  const [token, setToken] = useState(config.token)
  const [saved, setSaved] = useState(false)

  // Local editing state for silence timeout (seconds, user-friendly)
  const [timeoutInput, setTimeoutInput] = useState(
    String(recordingSettings.silenceTimeoutMs / 1000),
  )

  const handleSave = () => {
    const newConfig: BridgeConfig = { url: url.trim(), token: token.trim() }
    setConfig(newConfig)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleConnect = async () => {
    if (connected) {
      disconnect()
    } else {
      handleSave()
      // Small delay to let config propagate
      setTimeout(() => connect(), 100)
    }
  }

  /** Toggle auto-stop on/off. */
  const handleAutoStopToggle = (enabled: boolean) => {
    const updated: RecordingSettings = { ...recordingSettings, autoStopEnabled: enabled }
    setRecordingSettings(updated)
  }

  /** Commit the silence timeout value from the text input. */
  const handleTimeoutCommit = () => {
    const seconds = parseFloat(timeoutInput)
    if (isNaN(seconds)) return
    const ms = clamp(Math.round(seconds * 1000), 500, 5000)
    const updated: RecordingSettings = { ...recordingSettings, silenceTimeoutMs: ms }
    setRecordingSettings(updated)
    // Sync input to the clamped value
    setTimeoutInput(String(ms / 1000))
  }

  return (
    <main className="px-3 pt-4 pb-8 space-y-6">
      {/* Recording Settings */}
      <SettingsGroup label="Recording">
        <div className="px-4 py-3 space-y-4">
          {/* Auto-stop toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[13px] tracking-[-0.13px] text-text-dim">Auto-stop on silence</span>
              <p className="text-[11px] tracking-[-0.11px] text-text-muted mt-0.5">
                Stop recording after a period of silence
              </p>
            </div>
            <Toggle
              checked={recordingSettings.autoStopEnabled}
              onChange={handleAutoStopToggle}
            />
          </div>

          {/* Silence timeout (only visible when auto-stop is enabled) */}
          {recordingSettings.autoStopEnabled && (
            <div className="space-y-1.5">
              <span className="text-[13px] tracking-[-0.13px] text-text-dim">
                Silence timeout (seconds)
              </span>
              <Input
                type="number"
                min="0.5"
                max="5"
                step="0.5"
                value={timeoutInput}
                onChange={(e) => setTimeoutInput(e.target.value)}
                onBlur={handleTimeoutCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTimeoutCommit()
                }}
                placeholder="1.5"
              />
              <p className="text-[11px] tracking-[-0.11px] text-text-muted">
                0.5 – 5 seconds. Recording auto-stops after this much silence.
              </p>
            </div>
          )}
        </div>
      </SettingsGroup>

      {/* Bridge Connection */}
      <SettingsGroup label="Bridge Server">
        <div className="px-4 py-3 space-y-3">
          <div className="space-y-1.5">
            <span className="text-[13px] tracking-[-0.13px] text-text-dim">Server URL</span>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.100:8643"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-[13px] tracking-[-0.13px] text-text-dim">Client Token</span>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder="Enter your bridge token"
            />
            <p className="text-[11px] tracking-[-0.11px] text-text-muted">
              Stored locally on your device. Never sent to third parties.
            </p>
          </div>
        </div>
        <div className="px-4 pb-3">
          <Button
            variant={connected ? "secondary" : "default"}
            className="w-full"
            onClick={handleConnect}
            disabled={!url.trim() || !token.trim()}
          >
            {saved ? 'Saved ✓' : connected ? 'Disconnect' : 'Connect'}
          </Button>
        </div>
        {connected && (
          <ListItem
            title="Status"
            subtitle="Connected to bridge"
            trailing={<span className="text-positive text-sm">●</span>}
          />
        )}
      </SettingsGroup>

      {/* Logs */}
      <SettingsGroup label="Debug">
        <ListItem
          title="View Logs"
          subtitle="Console output and debug messages"
          onPress={() => navigate('/logs')}
        />
      </SettingsGroup>
    </main>
  )
}
