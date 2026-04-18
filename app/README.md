# G2 Caduceus — Even Hub App

Phone companion app for the G2 Bridge. Runs in the Even Realities App WebView on your phone and displays AI chat on G2 smart glasses via Bluetooth.

Built with [even-toolkit](https://www.npmjs.com/package/even-toolkit) v1.7, React 19, TypeScript, Vite, and Tailwind CSS v4.

For the full system architecture (Glasses → Phone → Bridge → Agent), see [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org/) | 18+ | Required for build tooling |
| [Even Hub CLI](https://www.npmjs.com/package/@evenrealities/evenhub-cli) | `^0.1.11` | `npm install -g @evenrealities/evenhub-cli` |
| Even Hub SDK | `^0.0.9` | Installed automatically with `npm install` |
| even-toolkit | `^1.7.0` | Installed automatically with `npm install` |
| Even Realities developer account | — | Register at [hub.evenrealities.com](https://hub.evenrealities.com) |
| Even Realities App | — | Phone app with G2 glasses paired |
| G2 Bridge server | — | Must be running and accessible from phone |

> **TypeScript peer dep conflict:** The Even Hub SDK requires `typescript@^5` while some Vite versions ship `typescript@~6`. Use `npm install --legacy-peer-deps` to bypass this during setup.

---

## Quick Start

```bash
cd app
npm install --legacy-peer-deps
npm run dev
```

The dev server starts on `http://0.0.0.0:5173`. Open this URL in a browser for the phone companion WebUI.

### Configure the Bridge

1. Open the app in your browser or sideload to glasses (see below).
2. Navigate to **Settings** (gear icon, top-right).
3. Enter your **Server URL** (e.g., `http://192.168.1.100:8643`) and **Client Token** (`G2_BRIDGE_TOKEN` from your bridge server).
4. Tap **Connect**.

Settings are persisted in both `localStorage` (sync seed) and Even Hub bridge storage (survives WebView reloads). See [Storage](#storage) for details.

### Sideload to G2 Glasses

For development, sideload the app directly to your G2 glasses via QR code for live hot-reload testing:

```bash
# 1. Authenticate with Even Realities
evenhub login -e your@email.com

# 2. Start the dev server
npm run dev   # serves on http://0.0.0.0:5173

# 3. Find your local IP
ip addr show | grep "inet " | grep -v 127.0.0.1   # Linux
ipconfig getifaddr en0                             # macOS

# 4. Generate QR code
npx @evenrealities/evenhub-cli qr --url "http://192.168.x.x:5173"
```

Open the **Even Realities App** on your phone and scan the QR code. The app loads in the Even Hub WebView with hot module replacement — code changes are reflected instantly on the glasses.

For the full sideload guide with troubleshooting, see [`docs/QR_SIDELOAD_WORKFLOW.md`](../docs/QR_SIDELOAD_WORKFLOW.md).

### Test with Simulator

If you don't have G2 glasses, use the Even Hub simulator:

```bash
npx @evenrealities/evenhub-simulator@latest http://localhost:5173
```

> **Note:** Audio recording does not work in the simulator — the `EvenAppBridge` audio API is only available inside the Even Realities App's WebView on real hardware.

---

## Build & Package

```bash
# TypeScript type-check + Vite production build
npm run build

# Package as .ehpk for Even Hub distribution
npm run pack
# Equivalent to: evenhub pack app.json dist -o caduceus.ehpk
```

Upload the generated `caduceus.ehpk` to [Even Hub](https://hub.evenrealities.com) for distribution, or sideload it via QR code.

### App Manifest (`app.json`)

```json
{
  "package_id": "com.g2caduceus.app",
  "edition": "202601",
  "name": "G2 Caduceus",
  "version": "0.1.2",
  "min_app_version": "2.0.0",
  "min_sdk_version": "0.0.7",
  "entrypoint": "index.html",
  "permissions": ["network", "g2-microphone"]
}
```

| Field | Description |
|---|---|
| `package_id` | Unique app identifier |
| `edition` | Even Hub app edition (format: `YYYYMM`) |
| `min_app_version` | Minimum Even Realities App version required |
| `min_sdk_version` | Minimum Even Hub SDK version required |
| `permissions` | `network` (bridge connection) + `g2-microphone` (voice input) |

No other permissions are needed (no camera, no location, no album access).

---

## Testing

```bash
npm run test        # Run all tests (Vitest)
npm run typecheck   # TypeScript type-checking (tsc --noEmit)
npm run lint        # ESLint on src/
```

### Test Limitations (jsdom)

Tests run in a jsdom environment which cannot fully replicate the Even Hub WebView:

- `Blob.arrayBuffer()` is broken in jsdom — audio-related tests use workarounds.
- `even-toolkit` internal imports fail in test environment — Vite aliases handle this (see `vite.config.ts`).
- `EvenAppBridge` is unavailable — audio tests mock the bridge.

---

## Project Structure

```
app/
├── app.json                        # Even Hub manifest (permissions, versions)
├── index.html                      # HTML entry point
├── package.json                    # Dependencies and scripts
├── vite.config.ts                  # Vite + Vitest + Tailwind config
├── tsconfig.json                   # TypeScript strict mode, ES2022 target
├── eslint.config.js                # ESLint flat config (TS + React hooks)
├── src/
│   ├── main.tsx                    # React root + BrowserRouter
│   ├── App.tsx                     # Route definitions + layout shells
│   ├── types.ts                    # Domain types (Session, ChatMessage, etc.)
│   ├── api.ts                      # Bridge REST API client
│   ├── storage.ts                  # Dual-write persistence (localStorage + bridge)
│   ├── lifecycle.ts                # Foreground/background keep-alive
│   ├── app.css                     # Tailwind CSS imports
│   ├── contexts/
│   │   └── AppContext.tsx          # Global state (sessions, chat, config, recording)
│   ├── hooks/
│   │   └── useLogBuffer.ts        # Console capture ring buffer for debug log screen
│   ├── screens/
│   │   ├── ChatScreen.tsx          # Chat WebUI (phone) — message list + text input
│   │   ├── SessionsScreen.tsx      # Session browser WebUI — list, select, delete
│   │   ├── Settings.tsx            # Settings WebUI — bridge config + recording options
│   │   └── LogScreen.tsx           # Debug log viewer — console output history
│   ├── glass/
│   │   ├── AppGlasses.tsx          # useGlasses() hook — bridges phone state to glasses
│   │   ├── shared.ts               # AppSnapshot + AppActions type definitions
│   │   ├── selectors.ts            # Screen router + phone-glasses sync logic
│   │   ├── ui-helpers.ts           # G2 display visual language constants
│   │   ├── splash.ts               # Splash screen (disabled — loads straight to home)
│   │   └── screens/
│   │       ├── home.ts             # Home menu — "New Session" / "Sessions"
│   │       ├── sessions.ts         # Session browser — scrollable list, max 10
│   │       └── chat.ts             # Chat display — message-based scrolling
│   ├── audio/
│   │   ├── index.ts                # Audio module re-exports
│   │   ├── recorder.ts             # PCM capture, VAD silence detection, WAV conversion
│   │   └── even-bridge.ts          # EvenAppBridge wrapper (window.__evenBridge)
│   └── __tests__/
│       ├── api.test.ts             # API client unit tests
│       ├── audio.test.ts           # Audio recorder + WAV conversion tests
│       ├── even-bridge.test.ts     # EvenAppBridge integration tests
│       ├── lifecycle.test.ts       # Lifecycle keep-alive tests
│       ├── logic.test.ts           # App logic / state tests
│       ├── log-buffer.test.ts      # Log buffer ring tests
│       ├── message-scroll.test.ts  # Message-based scroll target tests
│       └── storage.test.ts         # Storage dual-write tests
```

---

## Architecture

### Dual Interface: Phone WebUI + Glasses Display

The app has two parallel interfaces that share the same state (`AppContext`):

**Phone WebUI** (React routes in `src/screens/`):
- **Chat** (`/`) — message history, text input, record button
- **Sessions** (`/sessions`) — session list with multi-select, bulk delete, rename
- **Settings** (`/settings`) — bridge URL/token, recording preferences (auto-stop, silence timeout)
- **Logs** (`/logs`) — debug console output viewer (useful for hardware debugging)

**Glasses Display** (screen router in `src/glass/`):
- **Home** — "New Session" and "Sessions" menu items, connection status
- **Sessions** — scrollable session list (max 10, sorted by recent activity)
- **Chat** — AI conversation with message-based scrolling, tap to record

The `AppGlasses` component is mounted outside the React Routes so it persists across phone-side navigation — it continuously renders the glasses display based on `AppContext` state.

### Screen Flow

```
Home ──→ Sessions ──→ Chat
  │                      ↑
  └── New Session ───────┘
```

On the glasses, screen transitions are triggered by tap/scroll actions. The phone can also initiate transitions (e.g., opening a session from the phone UI), which are detected and synced by `selectors.ts`.

### State Management

All state lives in `AppContext` (React Context + `useState`):

| State | Description |
|---|---|
| `config` | Bridge URL + token (persisted) |
| `recordingSettings` | VAD auto-stop toggle + silence timeout (persisted) |
| `connected` | Bridge health check result |
| `sessions` | List of chat sessions from bridge |
| `currentSession` | Active session (null = home screen on glasses) |
| `messages` | Chat messages for the current session |
| `isLoading` | Agent response in progress |
| `isRecording` | Voice recording active |
| `error` | Last error (auto-dismissed after 8s) |

### API Client (`api.ts`)

The API client communicates with the G2 Bridge REST API:

| Endpoint | Method | Timeout | Description |
|---|---|---|---|
| `/health` | GET | 30s | Health check |
| `/v1/sessions` | GET | 30s | List sessions |
| `/v1/sessions` | POST | 30s | Create session |
| `/v1/sessions/:id` | DELETE | 30s | Delete session |
| `/v1/sessions/:id/messages` | GET | 30s | Get message history |
| `/v1/sessions/:id/audio` | POST | 180s | Send audio, get transcript + response |
| `/v1/sessions/:id/chat` | POST | 180s | Send text, get agent response |

Agent endpoints use a 180-second timeout (3 minutes) to accommodate real AI agent processing time.

### Audio Pipeline

```
G2 Mic → EvenAppBridge (PCM 16-bit LE 16kHz)
  → even-bridge.ts (Uint8Array → Float32Array)
  → recorder.ts (VAD silence detection, PCM → WAV)
  → api.ts (WAV upload to bridge)
  → Bridge → Agent → Response
```

Key components:
- **`EvenAudioBridge`** (`even-bridge.ts`) — Wraps `window.__evenBridge` to capture PCM audio from G2 glasses. Opens/closes the mic via `rawBridge.audioControl(true/false)`.
- **`AudioRecorder`** (`recorder.ts`) — Accumulates PCM samples, performs Voice Activity Detection (VAD), converts to WAV (16-bit LE mono). Auto-stops on silence after configurable timeout (default 1.5s).
- **Recording settings** — Configurable via Settings screen: auto-stop toggle, silence timeout (0.5–5 seconds).

### Storage (`storage.ts`)

Settings use a **dual-write pattern**:

1. **`localStorage`** (sync) — Used as the initial seed for React state (`useState` initializer must be synchronous). Written immediately on every save.
2. **Even Hub bridge storage** (`even-toolkit/storage`) — Async storage that persists across WebView reloads and app restarts. Written after localStorage, with a read-back verification.

On mount, the app reads from localStorage first (instant), then upgrades to bridge storage values once the async bridge is ready. This ensures the UI renders immediately with the last-known config.

---

## Key Constraints

These are platform limitations every developer should know:

| Constraint | Impact |
|---|---|
| **EvenAppBridge only in WebView** | Audio recording, glasses display, and bridge storage only work inside the Even Realities App's WebView — not in desktop browsers |
| **`localStorage` doesn't persist** | WebView clears localStorage on reload. Bridge storage (`even-toolkit/storage`) must be used for persistent settings |
| **No `crypto.randomUUID()`** | Not available in the WebView. `uuid()` in `AppContext` falls back to `Math.random` |
| **G2 display: 576×288, 4-bit greyscale** | No CSS/DOM on glasses — content is rendered as text lines via `even-toolkit`. Proportional font only (no monospace) |
| **Audio: 16kHz PCM, input only** | G2 has a microphone but no speaker. Audio is captured, converted to WAV, and sent to the bridge |
| **Agent timeout: 3 minutes** | Real AI agents can take minutes to respond. API client uses 180s timeout for agent endpoints |
| **WebView suspension (~2 min)** | The OS may suspend the WebView after ~2 minutes of inactivity. A keep-alive heartbeat (30s interval) prevents this — see `lifecycle.ts` |
| **No Chrome DevTools** | Cannot attach DevTools to the Even Hub WebView. Use the built-in **Log Screen** (`/logs`) for on-device debugging |

### G2 Display Visual Language

The glasses display uses a set of visual conventions defined in `ui-helpers.ts`:

| Symbol | Meaning |
|---|---|
| `●` filled | Live, active, happening now |
| `○` hollow | Waiting, processing |
| `>` prefix | User message (outgoing) |
| `>>` prefix | Assistant message (incoming) |
| `!` | Error, needs attention |
| `·` | Field separator |
| `—` | Inactive, unavailable |

> Unicode box-drawing characters (╭╮╰╯│─) do NOT align properly on the G2 display — the font is proportional. Only geometric shapes (▶ ◀ ▲ ▼ ■ ◆ ● ○) are safe to use.

---

## Glasses Screens

| Screen | Content | Navigation |
|---|---|---|
| **Home** | "New Session" / "Sessions" menu items, connection status | Scroll + Tap |
| **Sessions** | Scrollable session list (max 10, most recently active first) | Scroll + Tap to open, Back to return |
| **Chat** | Header (state · message count) + AI conversation | Scroll for history (message-based jumps), Tap to record |

The home screen uses `'home'` page mode which enables the built-in shutdown behavior: double-tap on the home screen triggers the system exit confirmation popup (required by the Even Realities app store).

Settings are **WebUI-only** (phone companion). There is no settings screen on the glasses — all configuration happens on the phone.

---

## Debugging

### On-Device Debugging

Since Chrome DevTools cannot be attached to the Even Hub WebView, the app includes a built-in **Log Screen** (`/logs`) that captures all `console.log/warn/error/info` output in a ring buffer (200 entries max).

The log buffer automatically filters out noisy Even SDK audio data (`audioPcm`, `EvenAppBridge` events) to keep the output readable.

### CORS in Production

During development, Vite's dev server handles CORS. In production (sideloaded or published app), the Bridge server must return `Access-Control-Allow-Origin: *` headers, or you need a reverse proxy (Caddy, Nginx, Cloudflare Tunnel).

---

## Contributing

See [`docs/CONTRIBUTING.md`](../docs/CONTRIBUTING.md) for code style, PR process, and development guidelines.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `npm install` fails with TypeScript errors | Use `npm install --legacy-peer-deps` — Even Hub SDK has a peer dep conflict |
| QR scan fails, app doesn't load | Verify phone can reach `http://IP:5173` in its browser. Check firewall (port 5173 must be open) |
| App loads but glasses show nothing | Ensure G2 glasses are paired and connected to the Even Realities App. Check Bluetooth |
| `evenhub login` fails | You need an Even Realities developer account. Register at [hub.evenrealities.com](https://hub.evenrealities.com) |
| Audio doesn't work in browser | `EvenAppBridge` audio is WebView-only. Use QR sideload for audio testing |
| Settings lost after app restart | `localStorage` doesn't persist — settings are also saved to Even Hub bridge storage which survives restarts |
| `npm ci` fails with lockfile mismatch | If you used `--legacy-peer-deps` locally: `rm -f package-lock.json && npm install`, then `npm ci --dry-run` to verify |
