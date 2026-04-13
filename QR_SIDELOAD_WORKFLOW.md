# QR Sideload Development Workflow

Live development and testing on G2 glasses using QR code sideloading with hot-reload support.

## Overview

The Even Realities App can load custom apps via QR codes during development. This enables rapid iteration — code changes on your dev machine are reflected on the glasses in real time via Vite's hot module replacement (HMR).

```
Dev Machine (Vite) ──WiFi──► Phone (Even Realities App) ──BT──► G2 Glasses
     0.0.0.0:5173              WebView (evenhub-cli)            Display + Audio
```

## Prerequisites

### 1. Even Hub CLI

Install the Even Hub CLI globally:

```bash
npm install -g @evenrealities/evenhub-cli
```

> **TypeScript peer dep conflict**: The Even Hub SDK requires `typescript@^5`, while some Vite versions ship `typescript@~6`. If `npm install -g` fails with a peer dependency error, use:
> ```bash
> npm install -g @evenrealities/evenhub-cli --legacy-peer-deps
> ```

### 2. Even Realities Account

Authenticate with your Even Realities developer account:

```bash
evenhub login -e your@email.com
```

If you don't have a developer account yet, register at [hub.evenrealities.com](https://hub.evenrealities.com).

### 3. Network Setup

Your development machine and phone must be on the **same local network**. The phone connects to the Vite dev server directly via your machine's LAN IP — no cloud service is involved.

- **Wi-Fi**: Phone and dev machine on the same SSID
- **Firewall**: Port `5173` must be open for inbound connections from the local network
- **Static IP (recommended)**: Assign a static IP to your dev machine or reserve one in your DHCP server. This avoids having to regenerate the QR code every time your IP changes.

## Workflow

### Step 1: Start the Dev Server

```bash
cd app
npm install          # or: npm install --legacy-peer-deps
npm run dev          # serves on http://0.0.0.0:5173
```

Vite binds to `0.0.0.0` by default, making it accessible from other devices on the network.

### Step 2: Find Your Local IP

```bash
# Linux
ip addr show | grep "inet " | grep -v 127.0.0.1

# macOS
ipconfig getifaddr en0
```

Note the IP address reachable from your phone (e.g., `192.168.1.50`).

### Step 3: Generate the QR Code

```bash
npx @evenrealities/evenhub-cli qr --url "http://192.168.1.50:5173"
```

Replace `192.168.1.50` with your actual local IP.

### Step 4: Scan and Test

1. Open the **Even Realities App** on your phone
2. Tap the QR scan option and point your camera at the generated code
3. The app loads inside the Even Hub WebView on your phone
4. Put on your G2 glasses — you'll see the Caduceus home screen
5. Any code change triggers an instant HMR update on the glasses

## app.json Network Whitelist

The Even Hub app manifest (`app.json`) declares network permissions. **All domains that the app fetches from must be listed** in the `permissions` array. The Even Hub QA process greps the source code for undeclared fetch targets and rejects submissions with missing entries.

Currently declared:

```json
{
  "permissions": [
    {
      "name": "network",
      "desc": "Connects to the G2 Bridge server for AI chat sessions."
    }
  ]
}
```

The `"network"` permission grants blanket network access. If you add new external endpoints (e.g., a different STT provider), verify the manifest still covers them.

## Audio Testing

The `EvenAppBridge` audio API (PCM capture, voice recording) is **only available inside the Even Realities App's WebView**. Audio features will not work in a desktop browser — this is expected.

When testing audio:

1. Ensure your G2 glasses are paired and connected via Bluetooth
2. Start a recording session on the glasses (tap to record)
3. Speak normally — the 4-mic array captures audio at 16kHz PCM
4. The VAD (Voice Activity Detection) auto-stops after 1.5s of silence
5. The WAV is sent to the bridge server for STT processing

For audio testing without glasses, use the phone WebUI at `http://localhost:5173` — text chat works in any browser.

## Simulator (No Hardware Required)

For UI layout testing without G2 glasses, use the Even Hub simulator:

```bash
npx @evenrealities/evenhub-simulator@latest http://localhost:5173
```

The simulator renders the glasses display in a browser window. Note that audio features and touchpad input are not available in the simulator.

## Troubleshooting

### QR scan fails or app doesn't load

- Verify the phone can reach `http://192.168.x.x:5173` in its browser
- Check firewall rules — port 5173 must be open for inbound connections
- Ensure both devices are on the same network (same subnet)

### App loads but glasses show nothing

- Make sure G2 glasses are paired and connected to the Even Realities App
- Check Bluetooth status on the phone
- Restart the Even Realities App and try scanning the QR code again

### `evenhub login` fails

- Ensure you have an Even Realities developer account
- Visit [hub.evenrealities.com](https://hub.evenrealities.com) to register
- Check your email for verification

### Vite proxy / CORS errors in production

During development, Vite's dev server handles CORS transparently. In production (published app), the Bridge server must return `Access-Control-Allow-Origin: *` headers. For local development, this is not an issue.

### `npm ci` fails with lockfile mismatch

If you used `--legacy-peer-deps` locally, the generated `package-lock.json` may not be compatible with strict `npm ci`. Regenerate without flags:

```bash
rm -f package-lock.json
npm install
npm ci --dry-run    # verify it works
```

### TypeScript errors on `npm install`

The Even Hub SDK requires `typescript@^5` while some Vite versions ship `typescript@~6`. Use `npm install --legacy-peer-deps` to bypass the conflict. The lockfile should still be generated without the flag (see above).

### Hot-reload not working after phone lock

If the WebView loses the connection when the phone locks, simply scan the QR code again. Vite's dev server stays running and the app reloads from the last state.
