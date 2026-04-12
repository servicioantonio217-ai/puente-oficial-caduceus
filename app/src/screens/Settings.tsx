import { useState } from 'react'
import { SettingsGroup, ListItem, Input, Button } from 'even-toolkit/web'
import { useApp } from '../contexts/AppContext'
import type { BridgeConfig } from '../types'

export function Settings() {
  const { config, setConfig, connected, connect, disconnect } = useApp()
  const [url, setUrl] = useState(config.url)
  const [token, setToken] = useState(config.token)

  const handleSave = () => {
    const newConfig: BridgeConfig = { url: url.trim(), token: token.trim() }
    setConfig(newConfig)
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

  return (
    <main className="px-3 pt-4 pb-8 space-y-6">
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
            {connected ? 'Disconnect' : 'Connect'}
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

      {/* About */}
      <SettingsGroup label="About">
        <ListItem
          title="G2 Caduceus v0.1.0"
          subtitle="AI chat for G2 smart glasses"
        />
        <ListItem
          title="Bridge API"
          subtitle="OpenAI Responses API compatible"
        />
      </SettingsGroup>
    </main>
  )
}
