# G2 Caduceus

Voice-first integration of the [Even Realities G2](https://www.evenrealities.com/smart-glasses) smart glasses with [Hermes Agent](https://gitlab.pfandl.cloud/services/hermes-agent) for hands-free communication and control of the AI assistant via audio input and display overlay.

## Architecture

```
┌──────────────┐ Bluetooth ┌──────────────────┐ HTTPS ┌──────────────┐
│  G2 Glasses  │ ◄────────► │ Phone (WebView)  │ ◄────► │ Hermes Agent │
│ (display +   │           │ (Caduceus app)   │       │   (API)      │
│  mic input)  │           │                  │       └──────────────┘
└──────────────┘           └──────────────────┘
```

- **Audio In**: Glasses 4-mic array captures PCM 16kHz → STT → Hermes prompt
- **Display Out**: Hermes response → paginated text → glasses display (576×288px, 4-bit greyscale)
- **Input**: Touchpad press (toggle recording), double-press (quit), swipe (scroll pages)

## Development

### Prerequisites

- Node.js 18+
- npm 9+
- [Even Hub CLI](https://hub.evenrealities.com/docs/reference/cli)
- Even Realities App on your phone + G2 glasses paired

### Setup

```bash
npm install
npm run dev
```

### QR Sideload

```bash
# Generate QR code for sideloading (replace IP with your local LAN IP)
npx evenhub qr --url "http://192.168.x.x:5173"

# Or auto-detect:
npx evenhub qr -i $(hostname -I | awk '{print $1}') -p 5173
```

Scan the QR code with the Even Realities App to load Caduceus directly with hot reload.

### Simulator (no hardware needed)

The app includes a browser fallback that shows a debug UI when the Even Hub bridge is not detected. Just open `http://localhost:5173` in any browser.

### Build

```bash
npm run build
npm run preview  # Serve production build locally
```

## Project Structure

```
src/
├── main.ts      # Entry point
├── app.ts       # Main Caduceus app logic (bridge, events, Hermes API)
├── style.css    # Minimal styles (browser fallback only)
└── vite-env.d.ts
app.json         # Even Hub manifest
vite.config.ts   # Vite config (network exposure for sideloading)
```

## Current Status

- [x] Project scaffolding (Vite + TypeScript + Even Hub SDK)
- [x] Bridge initialization and event handling
- [x] Display containers (welcome, status, pagination)
- [x] Touch input (press, double-press, scroll)
- [x] Audio capture (PCM 16kHz from glasses mic)
- [x] PCM → WAV converter (pure JS, zero dependencies)
- [x] Speech-to-Text via Whisper API (LiteLLM proxy)
- [x] Hermes API integration
- [x] Browser fallback with config UI and mic test
- [x] Config persistence (localStorage)
- [ ] Real hardware testing via QR sideload
- [ ] Settings screen on glasses (Hermes URL, API key)
- [ ] Optimized system prompt for glasses display
- [ ] Error handling and retry logic

## SDK Reference

- [Even Hub Docs](https://hub.evenrealities.com/docs)
- [SDK npm](https://www.npmjs.com/package/@evenrealities/even_hub_sdk)
- [CLI npm](https://www.npmjs.com/package/@evenrealities/evenhub-cli)
- [Simulator npm](https://www.npmjs.com/package/@evenrealities/evenhub-simulator)

## License

Private — Qu4ndo
