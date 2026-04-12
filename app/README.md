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

Open `http://localhost:5173` in your browser or scan the QR code:

```bash
npx @evenrealities/evenhub-cli qr --url http://192.168.x.x:5173
```

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
