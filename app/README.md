# G2 Caduceus — Even Hub App

Phone companion app for the G2 Bridge. Runs in the Even Realities App WebView and displays AI chat on G2 smart glasses.

Built with [even-toolkit](https://www.npmjs.com/package/even-toolkit) v1.7.

## Requirements

- [Node.js](https://nodejs.org/) 18+
- Even Realities App (phone) with G2 glasses paired

## Development

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:5173` in your browser for the phone companion WebUI.

### QR Sideload to Glasses

For development, you can sideload the app directly to your G2 glasses via a QR code. This enables live testing on the actual hardware with hot-reload support.

#### Prerequisites

1. Install the Even Hub CLI:

```bash
npm install -g @evenrealities/evenhub-cli
```

> **TypeScript peer dep conflict**: If `npm install -g` fails with a TypeScript version conflict, use `npm install -g @evenrealities/evenhub-cli --legacy-peer-deps`.

2. Authenticate with your Even Realities account:

```bash
evenhub login -e your@email.com
```

3. Ensure your phone and development machine are on the same network.

#### Sideload Workflow

1. Start the dev server:

```bash
cd app
npm install   # or: npm install --legacy-peer-deps
npm run dev   # serves on http://0.0.0.0:5173
```

2. Find your machine's local IP address (the one reachable from your phone):

```bash
# Linux
ip addr show | grep "inet " | grep -v 127.0.0.1

# macOS
ipconfig getifaddr en0
```

3. Generate and display the QR code:

```bash
npx @evenrealities/evenhub-cli qr --url "http://192.168.x.x:5173"
```

Replace `192.168.x.x` with your actual local IP.

4. Open the **Even Realities App** on your phone and scan the QR code. The app loads inside the Even Hub WebView with live hot-reload — any code change triggers an instant update on the glasses.

#### Troubleshooting

- **QR scan fails or app doesn't load**: Verify the phone can reach `http://192.168.x.x:5173` in its browser. Check firewall rules — port 5173 must be open for inbound connections from your local network.
- **App loads but glasses show nothing**: Make sure your G2 glasses are paired and connected to the Even Realities App. Check the phone's Bluetooth status.
- **`evenhub login` fails**: Ensure you have an Even Realities developer account. If you haven't registered, visit [hub.evenrealities.com](https://hub.evenrealities.com).
- **Vite proxy / CORS errors in production**: During development, Vite's dev server handles CORS. In production (sideloaded or published app), the Bridge server must return `Access-Control-Allow-Origin: *` headers, or you need a reverse proxy (Caddy, Nginx, Cloudflare Tunnel).
- **Audio doesn't work in browser**: The `EvenAppBridge` audio API is only available inside the Even Realities App's WebView. Recording and audio features will not work in a desktop browser. This is expected — use QR sideload for audio testing.
- **TypeScript errors on `npm install`**: The Even Hub SDK requires `typescript@^5` while some Vite versions ship `typescript@~6`. Use `npm install --legacy-peer-deps` to bypass this.
- **`npm ci` fails with lockfile mismatch**: If you used `--legacy-peer-deps` locally, regenerate the lockfile without flags first: `rm -f package-lock.json && npm install`, then verify with `npm ci --dry-run`.

### Test with Simulator

```bash
npx @evenrealities/evenhub-simulator@latest http://localhost:5173
```

## Configuration

Configure the Bridge connection in the phone WebUI (Settings screen):

1. **Server URL** — Your G2 Bridge address (e.g., `http://192.168.1.100:8643`)
2. **Client Token** — The `G2_BRIDGE_TOKEN` from your Bridge server

Settings are stored locally on your device via localStorage. There is no settings screen on the glasses — all configuration happens on the phone.

## Build for Even Hub

```bash
npm run build
npx @evenrealities/evenhub-cli pack app.json dist
```

Upload the generated `.ehpk` file to the [Even Hub](https://hub.evenrealities.com).

## Project Structure

```
app/
├── app.json                    # Even Hub manifest
├── src/
│   ├── main.tsx                # Entry point
│   ├── App.tsx                 # Routes + layouts
│   ├── types.ts                # Domain types (Session, ChatMessage, etc.)
│   ├── api.ts                  # Bridge API client
│   ├── storage.ts              # Persistent settings (localStorage)
│   ├── contexts/
│   │   └── AppContext.tsx       # App state (sessions, chat, config)
│   ├── glass/
│   │   ├── shared.ts           # Snapshot + Actions types
│   │   ├── selectors.ts        # Screen router wiring
│   │   ├── splash.ts           # Splash screen (disabled)
│   │   ├── AppGlasses.tsx      # useGlasses hook integration
│   │   ├── ui-helpers.ts       # G2 display helpers
│   │   └── screens/
│   │       ├── home.ts         # Home menu (glasses)
│   │       ├── sessions.ts     # Session browser (glasses)
│   │       └── chat.ts         # Chat display (glasses)
│   ├── screens/
│   │   ├── ChatScreen.tsx      # Chat WebUI (phone)
│   │   ├── SessionsScreen.tsx  # Session browser WebUI (phone)
│   │   └── Settings.tsx        # Settings WebUI (phone)
│   ├── audio/
│   │   ├── index.ts            # Audio module exports
│   │   ├── recorder.ts         # VAD + PCM capture
│   │   └── even-bridge.ts      # EvenAppBridge wrapper
│   └── __tests__/
│       ├── api.test.ts         # API client tests
│       ├── audio.test.ts       # Audio module tests
│       ├── logic.test.ts       # Logic tests
│       └── storage.test.ts     # Storage tests
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .gitignore
```

## Glasses Screens

| Screen | Content | Navigation |
|--------|---------|------------|
| **Home** | New Session, Sessions | Scroll + Tap |
| **Sessions** | Scrollable session list | Scroll + Tap to open, Back |
| **Chat** | Status header + AI conversation | Scroll for history, Tap to record |

Settings are WebUI-only (phone companion). No settings screen on glasses.
