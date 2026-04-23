# G2 Caduceus

Voice-first AI assistant for [Even Realities G2](https://evenrealities.com) smart glasses.

Talk to your AI agent through G2 glasses — voice input captured on the glasses, processed by a bridge server, and responses displayed on the 576×288 greyscale display. Any OpenAI-compatible AI agent works.

## Architecture

Three-tier bridge architecture — complexity decreases bottom-up:

```
G2 Glasses ──BT──► Phone (Even Hub App) ──HTTP──► G2 Bridge Server ──HTTP──► AI Agent API
```

| Component | Role | Stack |
|-----------|------|-------|
| **G2 Bridge** | Session management, STT, response adaptation, auth | Python / FastAPI / SQLite |
| **Even Hub App** | Glasses display, audio capture, phone companion WebUI | TypeScript / React / even-toolkit |
| **AI Agent** | Any OpenAI Responses API compatible backend | User-configured |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design document.

## Features

- **Voice input** — Double-tap glasses to record, VAD detects end of speech, STT on the bridge
- **Text chat** — Type messages via the phone companion WebUI
- **Session management** — Create, browse, resume, rename, and delete chat sessions
- **Response adaptation** — Optional LLM-based summarization or truncation for G2 display; smartphone always shows full responses
- **Phone companion** — Settings and extended chat view in the Even Realities App WebUI
- **Minimal glasses UI** — Per-screen routing (home → sessions → chat) with touchpad navigation

## Quick Start

Choose your deployment method:

- **[Container](#container-deployment-recommended)** — Fastest way to get running, no Python/Node setup needed
- **[Local install](#local-installation)** — For development or customized deployments

### Prerequisites

- Even Realities G2 smart glasses
- Android or iOS phone with the [Even Realities App](https://evenrealities.com)
- A running AI agent with an OpenAI Chat Completions API compatible endpoint (e.g., [Hermes Agent](https://hermes-agent.nousresearch.com))
- A running STT endpoint (e.g., OpenAI `/v1/audio/transcriptions`, local Whisper) — optional, for voice input
- [Podman](https://podman.io) or Docker — for container deployment
- Python ≥ 3.11 and Node.js ≥ 18 — only for local install

---

### Container Deployment (Recommended)

#### 1. Clone

```bash
git clone https://gitlab.com/Qu4ndo/g2-caduceus.git
cd g2-caduceus
```

> **Note:** Replace the clone URL with your own fork or mirror if applicable. <!-- PLACEHOLDER: Update clone URL to your public repo -->

#### 2. Configure

Create a `.env` file in the project root:

```bash
# Required
G2_BRIDGE_TOKEN=<your-client-token>
G2_AGENT_API_KEY=<your-agent-api-key>
G2_AGENT_API_URL=http://host.containers.internal:<agent-port>/v1

# Optional — for voice input
G2_STT_API_URL=http://host.containers.internal:<stt-port>/v1/audio/transcriptions
G2_STT_API_KEY=<your-stt-api-key>
G2_STT_MODEL=whisper-1
```

> **Tip:** Use `host.containers.internal` instead of `localhost` to reach services on the host from within the container.

#### 3. Run the Bridge

**Option A: Podman Compose**

```bash
cp bridge/docker-compose.example.yml docker-compose.yml
# Edit docker-compose.yml with your values if not using .env
podman compose up -d
```

**Option B: Manual container run**

```bash
podman build -t g2-bridge ./bridge
podman run -d \
  --name g2-bridge \
  -p 8643:8643 \
  -e G2_BRIDGE_TOKEN=<your-client-token> \
  -e G2_AGENT_API_KEY=<your-agent-api-key> \
  -e G2_AGENT_API_URL=http://host.containers.internal:<agent-port>/v1 \
  -v g2-data:/data \
  g2-bridge
```

#### 4. Verify

```bash
curl http://localhost:8643/health
# Expected: {"status":"ok","version":"0.1.0"}
```

**Container notes:**
- The bridge listens on port **8643** by default
- SQLite data is stored at `/data/g2_bridge.db` inside the container — mount a volume for persistence
- The container runs as a non-root user (`appuser`)
- For accessing host services, use `host.containers.internal` (Podman) or `host.docker.internal` (Docker)

See [bridge/README.md](bridge/README.md) for all configuration options and API reference.

---

### Local Installation

#### 1. Clone

```bash
git clone https://gitlab.com/Qu4ndo/g2-caduceus.git
cd g2-caduceus
```

#### 2. Set up the Bridge Server

```bash
cd bridge
pip install -e .
```

Run with minimum required configuration:

```bash
G2_BRIDGE_TOKEN=*** \
G2_AGENT_API_URL=http://localhost:<agent-port>/v1 \
G2_AGENT_API_KEY=*** \
python -m uvicorn g2_bridge.main:app --host 0.0.0.0 --port <bridge-port>
```

For voice input, add STT configuration:

```bash
G2_STT_API_URL=http://<stt-host>:<stt-port>/v1/audio/transcriptions \
G2_STT_API_KEY=*** \
G2_STT_MODEL=<model-name>
```

Verify the bridge is running:

```bash
curl http://localhost:<bridge-port>/health
```

See [bridge/README.md](bridge/README.md) for all configuration options, API reference, and Podman deployment.

#### 3. Set up the Phone App

```bash
cd app
npm install
npm run dev
```

The dev server starts at `http://0.0.0.0:5173`. Open it in a browser for the phone companion WebUI, or sideload to glasses:

```bash
npx @evenrealities/evenhub-cli qr --url "http://<your-local-ip>:5173"
```

Scan the QR code in the Even Realities App on your phone.

Configure the bridge connection in the app's Settings screen:
- **Server URL** — your bridge address (e.g., `http://192.168.1.100:8643`)
- **Client Token** — the `G2_BRIDGE_TOKEN` value

See [app/README.md](app/README.md) for build, packaging, and troubleshooting details.

---

### Verify End-to-End

1. Open the app on your phone
2. Enter bridge URL and token in Settings
3. Create a new session
4. Double-tap glasses to record, or type a message
5. AI response appears on the glasses display

See [docs/E2E_TEST_PLAN.md](docs/E2E_TEST_PLAN.md) for the full testing guide.

## Project Structure

```
g2-caduceus/
├── bridge/                    # G2 Bridge Server (Python/FastAPI)
│   ├── src/g2_bridge/         #   Bridge source code
│   ├── tests/                 #   Test suite
│   ├── Dockerfile             #   Container build
│   ├── docker-compose.example.yml  # Compose example
│   └── README.md              # Setup, config reference, API docs
├── app/                       # Even Hub App (TypeScript/React)
│   ├── src/                   #   App source code
│   │   ├── glass/             #     Glasses display layer
│   │   ├── screens/           #     Phone WebUI screens
│   │   ├── audio/             #     Audio capture + VAD
│   │   └── contexts/          #     App state management
│   └── README.md              # Setup, sideload, packaging docs
└── docs/                      # Documentation
    ├── ARCHITECTURE.md        #   3-tier architecture deep-dive
    ├── CONTRIBUTING.md        #   Dev setup, code style, PR process
    ├── E2E_TEST_PLAN.md       #   End-to-end testing guide
    └── QR_SIDELOAD_WORKFLOW.md #  QR sideload development workflow
```

## Development

### Bridge (Python)

```bash
cd bridge
pip install -e ".[dev]"
pytest                        # Run tests (173 tests)
ruff check src/ tests/        # Lint
ruff format --check src/ tests/  # Check formatting
mypy src/                     # Type check (strict)
```

### App (TypeScript)

```bash
cd app
npm install
npx vitest run                # Run tests
npx eslint src/               # Lint
npx tsc --noEmit              # Type check
npm run build                 # Production build
```

### CI

GitLab CI runs lint, typecheck, test, and build for both bridge and app on every push and merge request.

### Testing on Hardware

For live testing on G2 glasses, use QR sideloading with hot-reload — see [docs/QR_SIDELOAD_WORKFLOW.md](docs/QR_SIDELOAD_WORKFLOW.md).

For UI layout testing without hardware, use the Even Hub simulator:

```bash
npx @evenrealities/evenhub-simulator@latest http://localhost:5173
```

## Tech Stack

| Component | Language | Framework | Runtime |
|-----------|----------|-----------|---------|
| Bridge Server | Python ≥3.11 | FastAPI + uvicorn + httpx + aiosqlite | Podman / systemd |
| Even Hub App | TypeScript | Vite + React + even-toolkit + Even Hub SDK | WebView (Even Realities App) |
| Storage | — | SQLite | On bridge server |
| STT | — | Any OpenAI-compatible `/v1/audio/transcriptions` | User-configured |

## Tested AI Agents

G2 Caduceus works with any AI agent that implements the OpenAI Chat Completions API. Tested with:

- [Hermes Agent](https://hermes-agent.nousresearch.com) — Nous Research's AI assistant
- Any OpenAI-compatible Chat Completions API endpoint

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for development setup, code style guidelines, and the PR process.

## Status

Pre-release, active development. Breaking changes may occur.

## License

[MIT](LICENSE)
