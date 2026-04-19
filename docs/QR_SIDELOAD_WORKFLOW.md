# QR Sideload Development Workflow

Live development and testing on G2 glasses using QR code sideloading with hot-reload support.

## Overview

The Even Realities App can load custom apps via QR codes during development. This enables rapid iteration — code changes on your dev machine are reflected on the glasses in real time via Vite's hot module replacement (HMR).

```
Dev Machine (Vite) ──WiFi──► Phone (Even Realities App) ──BT──► G2 Glasses
     0.0.0.0:5173              WebView (Even Hub SDK)            Display + Audio
```

> **See also:** [CONTRIBUTING.md](./CONTRIBUTING.md) for full development setup (bridge + app), testing, and CI pipeline details.

## Prerequisites

### 1. Node.js

**Node.js ≥ 18** is required (check `package.json` — the app uses Vite 5 and React 19, which need Node 18+). Verify:

```bash
node --version   # should be v18.x or later
```

### 2. Even Hub CLI

Install the Even Hub CLI globally:

```bash
npm install -g @evenrealities/evenhub-cli
```

> **Note:** `@evenrealities/evenhub-cli` is also listed as a dev dependency in `app/package.json` (tested with `^0.1.11`). If you prefer not to install globally, you can use `npx` (see Step 3 below). Global install avoids the `npx` download on each run.

> **TypeScript peer dep conflict**: The Even Hub SDK requires `typescript@^5`, while some Vite versions ship `typescript@~6`. If `npm install -g` fails with a peer dependency error, use:
> ```bash
> npm install -g @evenrealities/evenhub-cli --legacy-peer-deps
> ```

### 3. Even Realities Account

Authenticate with your Even Realities developer account:

```bash
evenhub login -e your@email.com
```

Replace `your@email.com` with your actual developer email. If you don't have an account yet, register at [hub.evenrealities.com](https://hub.evenrealities.com).

> **Token expiry:** If `evenhub login` fails after previously working, your session token may have expired. Re-run `evenhub login -e your@email.com` to re-authenticate.

### 4. Even Realities Phone App

Install the **Even Realities App** on your phone (iOS/Android). A minimum app version of **2.0.0** or later is required (as specified by `min_app_version` in `app/app.json`). The app handles QR sideloading, Bluetooth pairing with the glasses, and the WebView that runs your app.

### 5. Network Setup

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

The dev script runs `vite --port 5173 --host`, which binds to `0.0.0.0` (all network interfaces) on port 5173. This makes the server reachable from other devices on the same network.

> **Production build alternative:** To test a production build instead of the dev server, run:
> ```bash
> cd app
> npm run build          # builds to app/dist/
> npm run preview        # serves the production build locally
> ```
> To create an `.ehpk` Even Hub package for distribution:
> ```bash
> cd app
> npm run build
> npm run pack           # creates caduceus.ehpk
> ```

### Step 2: Find Your Local IP

```bash
# Linux — prints the first LAN IP
hostname -I | awk '{print $1}'

# Alternative (shows all interfaces)
ip addr show | grep "inet " | grep -v 127.0.0.1

# macOS
ipconfig getifaddr en0
```

Note the IP address reachable from your phone (e.g., `192.168.1.50`). The `hostname -I` approach is recommended on Linux because `ip addr show` may return multiple IPs — pick the one on the same subnet as your phone.

### Step 3: Generate the QR Code

If you installed the Even Hub CLI globally (Step 2 of Prerequisites):

```bash
evenhub qr --url "http://192.168.1.50:5173"
```

If you prefer to use `npx` without a global install:

```bash
npx @evenrealities/evenhub-cli qr --url "http://192.168.1.50:5173"
```

Replace `192.168.1.50` with your actual local IP from Step 2.

> **No global install needed for `npx`:** Since `@evenrealities/evenhub-cli` is a dev dependency of the project, `npx` will resolve it from `node_modules/.bin/` without downloading. If run outside the project directory, `npx` downloads it on first use.

### Step 4: Scan and Test

1. Open the **Even Realities App** on your phone
2. Tap the QR scan option and point your camera at the generated code
3. The app loads inside the Even Hub WebView on your phone
4. Put on your G2 glasses — you'll see the Caduceus home screen
5. Any code change triggers an HMR update on the glasses

> **HMR limitations:** Hot-reload works reliably while the phone is awake and the app is in the foreground. If the phone locks or the app goes to the background, the WebSocket connection may be interrupted. When this happens, simply re-scan the QR code — the Vite dev server stays running and the app reloads from the last state.

## app.json Network Whitelist

The Even Hub app manifest (`app/app.json`) declares permissions for the app. **All capabilities that require device access must be listed** in the `permissions` array.

Currently declared in the project:

```json
{
  "permissions": [
    {
      "name": "network",
      "desc": "Connects to the G2 Bridge server for AI chat sessions."
    },
    {
      "name": "g2-microphone",
      "desc": "Enables voice commands for hands-free control."
    }
  ]
}
```

The `"network"` permission grants network access for API calls. The `"g2-microphone"` permission enables audio capture from the G2 glasses' 4-mic array. If you add new capabilities (e.g., Bluetooth, storage), verify the manifest includes the corresponding permission entries.

> **QA note:** The Even Hub review process may check for undeclared network targets or capabilities. Ensure all `fetch()` endpoints and device APIs are covered by the manifest permissions.

## Audio Testing

Audio features (PCM capture, voice recording) are **only available on actual hardware** — G2 glasses paired with a phone running the Even Realities App. Neither the simulator nor a desktop browser supports the `EvenAppBridge` audio API. This is expected, not a bug.

### With G2 glasses

1. Ensure your G2 glasses are paired and connected via Bluetooth to the Even Realities App
2. Start a recording session on the glasses (tap to record)
3. Speak normally — the 4-mic array captures audio at 16kHz PCM
4. The VAD (Voice Activity Detection) auto-stops after **1.5 seconds** of silence (configured as `silenceTimeoutMs: 1500` in `app/src/audio/recorder.ts`)
5. The WAV is sent to the bridge server for STT processing

### Without glasses (text only)

You can test the text chat flow in a desktop browser by navigating to the dev server URL (`http://192.168.1.50:5173`). Text-based interaction works in any browser, but audio recording and playback will not function.

## Simulator (No Hardware Required)

For UI layout testing without G2 glasses, use the Even Hub simulator:

```bash
# Run from the app directory (resolves from devDependencies)
npx @evenrealities/evenhub-simulator@latest http://localhost:5173

# If running on a different machine, use the LAN IP instead of localhost:
npx @evenrealities/evenhub-simulator@latest http://192.168.1.50:5173
```

The simulator renders the glasses display in a browser window.

### What the simulator CAN do
- UI layout and text rendering verification
- Screen navigation and state transitions
- CSS/Tailwind styling checks

### What the simulator CANNOT do
- Audio recording or playback (no `EvenAppBridge`)
- Touchpad/gesture input (no G2 touch hardware)
- Bluetooth connectivity (no paired glasses)
- SDK bridge storage (`even-toolkit` storage API requires hardware)

## Troubleshooting

### QR scan fails or app doesn't load

- Verify the phone can reach `http://192.168.x.x:5173` in its browser
- Check firewall rules — port 5173 must be open for inbound connections
- Ensure both devices are on the same network (same subnet)
- If the QR code shows "App not found" or an Even Hub error, verify your Even Hub account is active and the app is registered

### App loads but glasses show nothing

- Make sure G2 glasses are paired and connected to the Even Realities App
- Check Bluetooth status on the phone
- Restart the Even Realities App and try scanning the QR code again

### `evenhub login` fails or token expires

- Ensure you have an Even Realities developer account
- Visit [hub.evenrealities.com](https://hub.evenrealities.com) to register
- Check your email for verification
- If login previously worked but now fails, your session token may have expired — re-run `evenhub login -e your@email.com`

### Hot-reload not working after phone lock

If the WebView loses the connection when the phone locks:

1. Bring the Even Realities App to the foreground
2. Re-scan the QR code — the Vite dev server stays running and the app reloads
3. If re-scanning doesn't help, restart the dev server (`Ctrl+C` then `npm run dev`)

### WebView crash (app disappears from glasses)

If the app disappears from the glasses during testing:

1. The WebView may have crashed due to a JavaScript error
2. Check the browser console in the Even Realities App (if available) or review your recent code changes for errors
3. Re-scan the QR code to reload the app
4. If crashes persist, test in the simulator first to isolate the issue

### `npm ci` fails with lockfile mismatch

If you used `--legacy-peer-deps` locally, the generated `package-lock.json` may not be compatible with strict `npm ci`. Regenerate without flags:

```bash
rm -f package-lock.json
npm install
npm ci --dry-run    # verify it works
```

> **Note:** This is a CI/dependency issue, not a sideload-specific problem. See [CONTRIBUTING.md](./CONTRIBUTING.md) for full dependency management guidance.

### TypeScript errors on `npm install`

The Even Hub SDK requires `typescript@^5` while some Vite versions ship `typescript@~6`. Use `npm install --legacy-peer-deps` to bypass the conflict. The lockfile should still be generated without the flag (see above).

### CORS errors

During development, Vite's dev server handles CORS transparently — this is not an issue. In production (published app), the bridge server must return `Access-Control-Allow-Origin: *` headers. CORS configuration is a deployment concern, not a sideload workflow issue. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the production proxy setup.

## Debugging

Since Chrome DevTools are not available inside the Even Hub WebView, use these alternatives:

- **Console log buffer:** The app includes a `useLogBuffer` hook that captures `console.log/warn/error/info` output and uncaught errors into a ring buffer (200 entries). Audio noise from the Even SDK is automatically filtered out. This is the primary debugging tool on hardware.
- **Simulator:** Use the browser's DevTools when running in the Even Hub simulator — all standard debugging features are available.
- **Bridge logs:** Check the bridge server terminal output for API errors, STT processing issues, or connection problems.
