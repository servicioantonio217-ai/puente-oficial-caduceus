# G2 Caduceus

Voice-first integration of the [Even Realities G2](https://www.evenrealities.com/smart-glasses) smart glasses with [Hermes Agent](https://gitlab.pfandl.cloud/services/hermes-agent) for hands-free communication and control of the AI assistant via audio input and display overlay.

## Architecture

```
┌──────────────┐ Bluetooth ┌──────────────────┐ HTTPS ┌──────────────┐
│  G2 Glasses  │ ◄────────► │ Phone (WebView)  │ ◄────► │ Hermes Agent │
│ (display +   │           │ (Caduceus app)   │       │   (API)      │
│  mic input)  │           │                  │       └──────────────┘
└──────────────┘           └──────────────────┘
                                     │
                                     ▼ HTTPS
                            ┌──────────────────┐
                            │ STT (Whisper API)│
                            └──────────────────┘
```

- **Audio In**: Glasses 4-mic array captures PCM 16kHz → STT → Hermes prompt
- **Display Out**: Hermes response → paginated text → glasses display (576x288px, 4-bit greyscale)
- **Input**: Touchpad press (toggle recording), double-press (quit), swipe (scroll pages)

## Privacy

Caduceus sends data exclusively to endpoints you configure. There are no analytics, telemetry, or third-party tracking mechanisms.

- Audio is sent to your configured Speech-to-Text endpoint
- Transcripts are sent to your configured Hermes Agent endpoint
- Configuration is stored locally on your device (localStorage)
- No audio, transcripts, or conversation history is stored by Caduceus

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

The app includes a companion WebUI that works in any browser. Open `http://localhost:5173` to configure settings, test the microphone, and debug.

### Build

```bash
npm run build          # Production build → dist/
npm run preview        # Serve production build locally
npm run pack           # Build + package as .ehpk for Even Hub submission
```

## Project Structure

```
src/
├── main.ts      # Entry point
├── app.ts       # Main Caduceus app logic (onboarding, bridge, events, Hermes API)
├── stt.ts       # Speech-to-Text integration (PCM → WAV → Whisper)
├── style.css    # WebUI styles (browser companion)
├── pcm-to-wav.ts # PCM to WAV converter (pure JS)
└── vite-env.d.ts
app.json         # Even Hub manifest
vite.config.ts   # Vite config (network exposure for sideloading)
```

## First Launch

On first launch, Caduceus shows a setup wizard:

1. Enter your **Hermes URL** (e.g., `http://your-server:3000`)
2. Enter your **STT Endpoint** (e.g., `http://your-server:4000`)
3. Optionally set an **STT API Key** and **model**
4. Click **Save and Start**

Settings can be changed later via the companion WebUI. Use the **Reset** button to return to the setup wizard.

## Current Status

- [x] Project scaffolding (Vite + TypeScript + Even Hub SDK)
- [x] Bridge initialization and event handling
- [x] Display containers (welcome, status, pagination)
- [x] Touch input (press, double-press, scroll)
- [x] Audio capture (PCM 16kHz from glasses mic)
- [x] PCM → WAV converter (pure JS, zero dependencies)
- [x] Speech-to-Text via Whisper API
- [x] Hermes API integration
- [x] Companion WebUI with config and mic test
- [x] Config persistence (localStorage)
- [x] Onboarding flow (first-launch setup wizard)
- [x] Privacy policy (embedded in onboarding)
- [x] Even Hub manifest (app.json) with proper packaging
- [ ] Real hardware testing via QR sideload
- [ ] Even Hub submission and publication

## SDK Reference

- [Even Hub Docs](https://hub.evenrealities.com/docs)
- [SDK npm](https://www.npmjs.com/package/@evenrealities/even_hub_sdk)
- [CLI npm](https://www.npmjs.com/package/@evenrealities/evenhub-cli)
- [Simulator npm](https://www.npmjs.com/package/@evenrealities/evenhub-simulator)

## License

Private — Qu4ndo
