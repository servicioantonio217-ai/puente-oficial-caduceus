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

Configure the Bridge connection in the Settings screen:

1. **Server URL** — Your G2 Bridge address (e.g., `http://192.168.1.100:8643`)
2. **Client Token** — The `G2_BRIDGE_TOKEN` from your Bridge server

Settings are stored locally on your device via localStorage.

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
│   │   ├── splash.ts           # Splash screen (caduceus icon)
│   │   ├── AppGlasses.tsx      # useGlasses hook integration
│   │   └── screens/
│   │       ├── menu.ts         # Main menu (glasses)
│   │       ├── sessions.ts     # Session browser (glasses)
│   │       ├── chat.ts         # Chat display (glasses, buildChatDisplay)
│   │       └── settings.ts     # Settings display (glasses)
│   ├── screens/
│   │   ├── ChatScreen.tsx      # Chat WebUI (phone)
│   │   ├── SessionsScreen.tsx  # Session browser WebUI (phone)
│   │   └── Settings.tsx        # Settings WebUI (phone)
│   └── __tests__/
│       ├── api.test.ts         # API client tests
│       ├── storage.test.ts     # Storage tests
│       └── screens.test.ts     # Glass screen logic tests
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .gitignore
```

## Glasses Screens

| Screen | Content | Navigation |
|--------|---------|------------|
| **Splash** | G2 Caduceus logo | Auto-advance on connect |
| **Menu** | New Session, Sessions, Settings | Scroll + Tap |
| **Sessions** | Scrollable session list | Scroll + Tap to open |
| **Chat** | AI conversation (buildChatDisplay) | Scroll for pagination |
| **Settings** | Connection status | Scroll |
