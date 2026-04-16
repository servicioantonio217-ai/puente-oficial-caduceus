# G2 Caduceus

Voice-first AI assistant for [Even Realities G2](https://evenrealities.com) smart glasses.

A 3-tier bridge architecture: G2 Glasses → Phone (Even Hub App) → Bridge Server → AI Agent API.

## Architecture

```
G2 Glasses ──BT──► Phone (Even Hub App) ──HTTP──► G2 Bridge Server ──HTTP──► AI Agent
```

- **G2 Bridge** (Python/FastAPI) — Session management, STT, response adaptation, auth
- **Even Hub App** (TypeScript/even-toolkit) — Glasses display, audio capture, phone companion WebUI
- **AI Agent** — Any OpenAI Responses API compatible backend (e.g., [Hermes Agent](https://hermes-agent.nousresearch.com))

## Quick Start

### 1. Bridge Server

```bash
cd bridge
pip install -e .
G2_BRIDGE_TOKEN=mytoken G2_AGENT_API_KEY=mykey \
  python -m uvicorn g2_bridge.main:app --port 8000
```

See [bridge/README.md](bridge/README.md) for Podman deployment and all configuration options.

### 2. Even Hub App

```bash
cd app
npm install
npm run dev
```

Sideload to your glasses via QR code:

```bash
npx @evenrealities/evenhub-cli qr --url http://192.168.x.x:5173
```

See [app/README.md](app/README.md) for build and simulator instructions.

## Features

- Voice input via G2 glasses microphone (STT processed server-side)
- Text and voice chat sessions with AI agent
- Session management (create, browse, resume, delete)
- Response adaptation for G2 display constraints (576x288px, 4-bit greyscale)
- Phone companion WebUI for settings and extended chat view
- Minimalist glasses UI with per-screen routing (home, sessions, chat)

## Project Structure

```
g2-caduceus/
├── bridge/                    # Python/FastAPI bridge server
├── app/                       # TypeScript Even Hub app
└── docs/                       # Documentation
    ├── ARCHITECTURE.md         # Detailed architecture docs
    ├── CONTRIBUTING.md         # Dev setup, code style, PR process
    ├── E2E_TEST_PLAN.md        # End-to-end testing guide
    ├── PHASE5_TODO.md          # Phase 5 bug tracker
    ├── QR_SIDELOAD_WORKFLOW.md # QR sideload dev workflow (glasses testing)
    └── ROADMAP.md              # Development roadmap
```

## Development

### Bridge

```bash
cd bridge
pip install -e ".[dev]"
pytest                    # Run tests (29 tests)
ruff check src/ tests/     # Lint
ruff format --check src/ tests/
mypy src/                 # Type check (allow_failure)
```

### App

```bash
cd app
npm install
npx vitest run            # Run tests (46 tests)
npx eslint src/           # Lint
npx tsc --noEmit          # Type check
npm run build             # Production build
```

### CI

GitLab CI runs lint, typecheck, test, and build for both bridge and app on every push and MR.

## License

[MIT](LICENSE)
