# G2 Caduceus — Architecture

## Overview

Three-tier architecture connecting the Even Realities G2 smart glasses to AI agents via a bridge server.

```
G2 Glasses ──BT──► Phone (Even Hub App + WebUI) ──HTTP──► G2 Bridge Server ──HTTP──► AI Agent API
```

**Design principle:** Complexity decreases bottom-up. The server (24/7, always-on) handles the heavy lifting. The phone (battery-powered, resource-constrained) stays minimal.

**Open source goal:** All components are designed to be universal and modular. No hard-coded provider dependencies. Users configure their own endpoints, API keys, and models.

## Components

### 1. AI Agent API (existing, pluggable)

Any OpenAI Responses API-compatible endpoint. Tested with [Hermes Agent](https://github.com/nousresearch/hermes-agent).

- OpenAI Responses API format
- Stateful conversations via `conversation` parameter
- Full tool access: terminal, file ops, web search, memory, skills
- Streaming (SSE) with tool progress indicators
- Bearer token auth

This is NOT part of the G2 Caduceus project — it's an external dependency we consume.

### 2. G2 Bridge Server

A standalone Python application (FastAPI + uvicorn) deployed on the user's server.

**Responsibilities:**
- Authentication (client token, AI agent API key)
- Session management (create, resume, list, delete, rename, bulk delete)
- Conversation history persistence (SQLite) with configurable context depth
- Session-level request serialization (prevents concurrent message race conditions)
- STT processing (audio → configurable STT endpoint → text)
- Request/response orchestration (client → AI agent → client)
- Response adaptation for G2 display constraints (truncation at sentence boundary)
- Structured logging (text or JSON format)

**NOT responsible for:**
- Display rendering (phone app's job via even-toolkit)
- Audio recording (phone app's job via even-toolkit + EvenAppBridge)
- User configuration UI on phone (phone app's WebUI job)
- Response summarization (planned but not yet implemented — only truncation exists)

**Deployment:**
- Docker/Podman container or systemd service
- Configurable via environment variables
- Single binary/tarball or container image

**API Contract (between phone and bridge):**

All endpoints use the client token for auth (`Authorization: Bearer <token>` header).

```
GET    /health                          — Health check
POST   /v1/sessions                     — Create new session (optionally name it)
GET    /v1/sessions                     — List all sessions
GET    /v1/sessions/{id}                — Get session details + history
PATCH  /v1/sessions/{id}                — Rename session
DELETE /v1/sessions/{id}                — Delete session
POST   /v1/sessions/bulk-delete         — Bulk delete sessions
POST   /v1/sessions/{id}/message        — Send text message (streamed response)
POST   /v1/sessions/{id}/audio          — Send audio (WAV, returns transcript + response)
```

**Response format (OpenAI Responses API compatible):**

```json
{
  "id": "resp_abc123",
  "status": "completed",
  "conversation": "session-uuid",
  "output": [
    {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "..."}]}
  ],
  "usage": {"input_tokens": 50, "output_tokens": 200}
}
```

**Streaming:** Same endpoints support `"stream": true` → SSE response.

**STT Pipeline (bridge-side):**

```
Phone sends WAV → Bridge receives → POST to configurable STT endpoint → Transcript
                                                                                 ↓
Phone ← Response ← AI Agent API ← Transcript forwarded to AI Agent
```

- STT endpoint is user-configurable (default: OpenAI `/v1/audio/transcriptions`)
- Works with any OpenAI-compatible STT provider (LiteLLM proxy, OpenAI, local Whisper, etc.)
- Audio format: WAV (PCM 16kHz, mono, S16LE) — same format the G2 glasses produce
- Handles both plain text and JSON response formats from STT providers
- Why bridge-side STT:
  1. Single point of configuration — user sets STT endpoint/key once on server
  2. API keys never leave the server (same as AI agent key)
  3. Other clients (CLI, desktop) benefit automatically
  4. Phone stays thin — only audio capture + VAD

**Response Adaptation (bridge-side):**

The bridge adapts AI agent responses for G2 display constraints (576×288px, ~400-500 chars per page).

Currently implemented modes:

| Mode | Behavior | Cost | Latency |
|------|----------|------|---------|
| `truncate` | Hard character limit, clean sentence boundary cutoff | None | None |

- Default: `truncate` (no extra cost, no extra latency)
- Truncation finds the last sentence boundary (`.`, `!`, `?`) within the limit; falls back to last space or hard cut
- `summarize` mode (LLM-based condensation) is planned but not yet implemented
- Alternatively: AI agent system prompt can request short responses (user's choice, outside bridge scope)

**Conversation Context:**

The bridge sends conversation history with each agent request:

1. On each message/audio request, the bridge loads the last N messages from SQLite (configurable via `G2_MAX_CONTEXT_MESSAGES`, default: 50)
2. History is built by `context.py` as `[{role, content}]` dicts in chronological order
3. History is prepended to the current message before sending to the AI agent
4. This ensures the agent has full conversation context without relying on server-side state

**Session Locking:**

Concurrent requests to the same session are serialized via per-session async locks (`lock.py`). This prevents race conditions where two simultaneous messages load the same history snapshot, causing context loss. Each session gets its own `asyncio.Lock`, created lazily and removed when no longer needed.

**Storage:**
- SQLite database for sessions, messages, and conversation state
- Each session maps to an AI agent `conversation` parameter
- Session fields: `id`, `name`, `created_at`, `updated_at`, `agent_conversation_id`
- Message fields: `id`, `session_id`, `role` (user/assistant), `content`, `created_at`
- Bridge is the source of truth for conversation history
- Database path configurable via `G2_DATABASE_PATH` (default: `/data/g2_bridge.db`)

**Security — two-layer auth:**

1. **Client → Bridge:** Bearer token (random-generated on bridge setup, user enters in WebUI)
2. **Bridge → AI Agent:** Bearer token (configured in bridge env/config)
3. **Bridge → STT:** API key (configured in bridge env/config)

The bridge is the only component that knows any API keys. Phone never sees them.

### 3. Phone — Even Hub App (WebUI + G2 Display)

An Even Hub app running in the Even Realities App's WebView. Built with TypeScript + Vite, using [even-toolkit](https://github.com/fabioglimb/even-toolkit) for glasses display and navigation.

**Dependencies:**
- `@evenrealities/even_hub_sdk` — Official Even Hub SDK (bridge init, audio capture, events)
- `even-toolkit` — Screen router, display builders, navigation helpers, chat display, icons, bridge wrapper

**Responsibilities:**
- Audio capture from G2 glasses (via even-toolkit + EvenAppBridge)
- Voice Activity Detection (VAD) — detect when user stops speaking
- PCM to WAV conversion and upload to bridge
- Display rendering on G2 glasses (via even-toolkit screen router + display builders)
- Touchpad input handling (via even-toolkit navigation helpers)
- Session list browsing and switching
- Configuration input (bridge address + token) via WebUI
- Phone-side companion UI (settings, session browser, debug log viewer) via even-toolkit web components
- Foreground/background lifecycle management with keep-alive heartbeat
- Debug log capture and viewer (ring buffer with noise filtering)

**NOT responsible for:**
- STT processing (delegated to bridge)
- AI agent communication (delegated to bridge)
- Persistent storage of conversations (delegated to bridge)

**Key constraint:** EvenAppBridge is ONLY available inside the Even Realities App's WebView. The app MUST run there — not on the server, not in a regular browser.

**Glasses Screens (per-screen architecture via even-toolkit):**

| Screen | Content | Navigation |
|--------|---------|------------|
| **Splash** | Disabled (no pixel spinner on G2) | N/A |
| **Home** | List: New Session, Sessions | Scroll + Tap to select |
| **Sessions** | Scrollable list of existing sessions | Scroll + Tap to open, Back to home |
| **Chat** | Status header + AI conversation display | Scroll for history, Tap to record |

Settings (bridge URL, token) are configured via the phone WebUI companion, not on glasses.

**Chat display format (even-toolkit `buildChatDisplay`):**
- `> ` prefix — user prompt
- Normal text — assistant response
- `>> ` prefix — tool call indicator
- `! ` prefix — error
- Scroll indicators (▲/▼) for multi-page content

**Configuration (dual-write: localStorage + Even Hub bridge storage):**
- Bridge server URL (e.g., `http://192.168.1.100:8643`)
- Bridge client token (random-generated, user copies from bridge)
- Recording settings (auto-stop, silence timeout)
- Settings are read synchronously from localStorage for React state initialization, then upgraded to bridge storage values asynchronously

## Data Flow

### Voice Input

```
1. User double-taps on G2 glasses to start recording
2. App captures PCM audio via even-toolkit + EvenAppBridge.audioControl(true)
3. VAD monitors audio levels, detects silence end
4. App converts PCM → WAV, sends to Bridge: POST /v1/sessions/{id}/audio
5. Bridge acquires session lock (serializes concurrent requests)
6. Bridge runs STT (configurable endpoint) → gets transcript
7. Bridge loads conversation history from SQLite (last N messages)
8. Bridge sends transcript + history to AI Agent: POST /v1/responses
9. AI Agent processes (tools, skills, etc.) → returns response
10. Bridge stores user message + assistant response in SQLite
11. Bridge adapts response (truncate at sentence boundary) → returns to app
12. App displays response on G2 via even-toolkit chat display builder
```

### Text Input (via WebUI or voice transcript)

```
1. User sends text (WebUI or after STT)
2. App sends to Bridge: POST /v1/sessions/{id}/message
3. Bridge acquires session lock, loads history from SQLite
4. Bridge forwards text + history to AI Agent: POST /v1/responses
5. Bridge stores messages in SQLite
6. Response flows back: AI Agent → Bridge (adapted) → App → G2 display
```

### Session Management

```
1. App requests session list: GET /v1/sessions
2. Bridge returns sessions from SQLite
3. User selects/resumes session on G2 or WebUI
4. App sends next message with session context
5. Bridge maps session to AI Agent conversation parameter
```

### Conversation History

```
1. Bridge loads messages for session from SQLite (chronological order)
2. context.py trims to last G2_MAX_CONTEXT_MESSAGES entries (default: 50)
3. Returns as [{role, content}] dicts for the Chat Completions API
4. History is sent with every agent request so the agent has full context
```

## Authentication

Two layers:

1. **Client → Bridge:** Bearer token (random-generated on bridge setup, user enters in WebUI)
2. **Bridge → AI Agent:** Bearer token (configured in bridge env/config)

The bridge is the only component that knows the AI agent API key. Phone never sees it.

## G2 Display Constraints

- 576x288px per eye, 4-bit greyscale (16 green shades)
- ~400-500 chars per page, scroll-based pagination
- Max 4 image containers, 8 other containers per page
- Exactly 1 container with `isEventCapture: 1`
- No background fill, no CSS/DOM — container-based rendering via SDK
- 10 text lines per screen: 2 header lines + 8 content lines
- 8 content slots below header (local constant in chat.ts: `CONTENT_SLOTS = 8`)

The bridge MUST truncate responses before sending to the app. The app should NOT receive full-length AI agent responses.

## Tech Stack

| Component | Language | Framework | Runtime |
|-----------|----------|-----------|---------|
| Bridge Server | Python | FastAPI + uvicorn + httpx + aiosqlite | Docker / Podman / systemd |
| Even Hub App | TypeScript | Vite + even-toolkit + Even Hub SDK | WebView (Even Realities App) |
| Storage | — | SQLite | On bridge server |
| STT | — | Any OpenAI-compatible `/v1/audio/transcriptions` | User-configured |

## Configuration

All bridge configuration is via environment variables (prefix `G2_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `G2_BRIDGE_TOKEN` | (required) | Client authentication token |
| `G2_AGENT_API_KEY` | (required) | AI agent API key |
| `G2_AGENT_API_URL` | `http://localhost:8642/v1` | AI agent API endpoint |
| `G2_AGENT_INSTRUCTIONS` | `""` | Optional system prompt for the agent |
| `G2_STT_API_URL` | `""` | STT endpoint URL |
| `G2_STT_API_KEY` | `""` | STT API key (if required) |
| `G2_STT_MODEL` | `whisper-1` | Model name sent to STT endpoint |
| `G2_DATABASE_PATH` | `/data/g2_bridge.db` | SQLite database file path |
| `G2_MAX_RESPONSE_CHARS` | `500` | Max characters for truncated responses |
| `G2_MAX_AUDIO_BYTES` | `5242880` (5 MB) | Max audio upload size |
| `G2_MAX_SESSIONS` | `100` | Max sessions before auto-eviction of oldest |
| `G2_MAX_CONTEXT_MESSAGES` | `50` | Conversation history depth sent to agent |
| `G2_TIMEZONE` | `UTC` | IANA timezone for session timestamps |
| `G2_LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL) |
| `G2_LOG_FORMAT` | `text` | Log format: `text` (human-readable) or `json` (machine-parseable) |

## Project Structure

```
g2-caduceus/
├── .gitlab-ci.yml               # CI pipeline (lint, typecheck, test, build, package, release)
├── .gitignore
├── LICENSE                      # MIT
├── README.md                    # Project overview + quickstart
├── docs/
│   ├── ARCHITECTURE.md          # This file
│   ├── CONTRIBUTING.md          # Dev setup, code style, PR process
│   ├── E2E_TEST_PLAN.md         # End-to-end testing guide
│   └── QR_SIDELOAD_WORKFLOW.md  # QR sideload dev workflow
├── bridge/                      # G2 Bridge Server (Python)
│   ├── .gitignore
│   ├── Dockerfile
│   ├── docker-compose.example.yml # Example compose for local development
│   ├── pyproject.toml           # Dependencies (FastAPI, httpx, aiosqlite, etc.)
│   ├── README.md                # Setup, configuration reference, env vars
│   ├── src/
│   │   └── g2_bridge/
│   │       ├── __init__.py
│   │       ├── main.py          # FastAPI app entry point
│   │       ├── config.py        # Configuration (env vars, pydantic settings)
│   │       ├── auth.py          # Token authentication
│   │       ├── database.py      # SQLite session/message storage
│   │       ├── models.py        # Pydantic API models + SQLAlchemy row models
│   │       ├── agent_client.py  # AI Agent Responses API client (OpenAI-compatible)
│   │       ├── stt_client.py    # STT client (OpenAI-compatible /v1/audio/transcriptions)
│   │       ├── response.py      # Response adaptation (truncate at sentence boundary)
│   │       ├── context.py       # Conversation history builder (loads + trims from DB)
│   │       ├── lock.py          # Per-session async lock (concurrent request serialization)
│   │       ├── logging_config.py # Centralized logging (text + JSON formatters)
│   │       └── routers/
│   │           ├── __init__.py
│   │           ├── health.py    # Health check endpoint
│   │           ├── sessions.py  # Session CRUD, rename, bulk delete
│   │           ├── messages.py  # Text message endpoint
│   │           └── audio.py     # Audio upload + STT endpoint
│   └── tests/
│       ├── conftest.py
│       ├── test_agent_client.py
│       ├── test_audio.py
│       ├── test_audio_endpoint.py
│       ├── test_auth.py
│       ├── test_config_models.py
│       ├── test_context.py
│       ├── test_database.py
│       ├── test_error_handling.py
│       ├── test_health.py
│       ├── test_integration_smoke.py
│       ├── test_messages.py
│       ├── test_response.py
│       ├── test_response_edge_cases.py
│       ├── test_session_lock.py
│       ├── test_sessions.py
│       └── test_timezone.py
└── app/                         # Even Hub App (TypeScript)
    ├── .gitignore
    ├── app.json                 # Even Hub manifest
    ├── eslint.config.js
    ├── index.html
    ├── package.json             # even-toolkit + @evenrealities/even_hub_sdk
    ├── README.md                # Sideload, Even Hub submission, troubleshooting
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx             # Entry point (React root)
        ├── App.tsx              # Routes + layouts
        ├── app.css              # Global styles
        ├── types.ts             # Domain types (Session, ChatMessage, BridgeConfig, etc.)
        ├── api.ts               # Bridge API client (fetch wrapper)
        ├── storage.ts           # Dual-write bridge/localStorage persistence
        ├── lifecycle.ts         # Keep-alive heartbeat, foreground/background lifecycle
        ├── vite-env.d.ts        # Vite type declarations
        ├── contexts/
        │   └── AppContext.tsx   # App state (sessions, chat, config, log entries)
        ├── hooks/
        │   └── useLogBuffer.ts  # Ring buffer hook for debug log capture with noise filtering
        ├── audio/
        │   ├── index.ts         # Audio module exports
        │   ├── recorder.ts      # VAD + PCM capture
        │   └── even-bridge.ts   # EvenAppBridge wrapper
        ├── glass/               # Glasses display layer (even-toolkit)
        │   ├── shared.ts        # Snapshot + Actions types
        │   ├── selectors.ts     # Screen router wiring
        │   ├── splash.ts        # Splash screen (disabled)
        │   ├── AppGlasses.tsx   # useGlasses hook integration
        │   ├── ui-helpers.ts    # G2 display helpers
        │   └── screens/
        │       ├── home.ts      # Home menu (glasses)
        │       ├── sessions.ts  # Session browser (glasses)
        │       └── chat.ts      # Chat display (glasses) — 10 lines, 8 content slots
        ├── screens/             # Phone WebUI screens (React)
        │   ├── ChatScreen.tsx   # Chat WebUI (phone)
        │   ├── SessionsScreen.tsx # Session browser WebUI (phone)
        │   ├── LogScreen.tsx    # Debug log viewer (phone)
        │   └── Settings.tsx     # Settings WebUI (phone)
        └── __tests__/
            ├── api.test.ts
            ├── audio.test.ts
            ├── even-bridge.test.ts
            ├── lifecycle.test.ts
            ├── log-buffer.test.ts
            ├── logic.test.ts
            ├── message-scroll.test.ts
            └── storage.test.ts
```

## Deployment

### Bridge Server

```bash
# Option 1: Podman
podman build -t g2-bridge ./bridge
podman run -d \
  -p 8643:8000 \
  -e G2_AGENT_API_URL=http://localhost:8642/v1 \
  -e G2_AGENT_API_KEY=*** \
  -e G2_STT_API_URL=http://litellm:4000/v1/audio/transcriptions \
  -e G2_STT_API_KEY=*** \
  -e G2_BRIDGE_TOKEN=*** \
  -v g2-data:/data \
  g2-bridge

# Option 2: systemd (native)
pip install ./bridge
g2-bridge --host 0.0.0.0 --port 8643
```

### Even Hub App

```bash
cd app
npm install
npm run dev        # Dev server (QR sideload)
evenhub qr --url "http://192.168.x.x:5173"
npm run pack       # Build .ehpk for Even Hub submission
```

## Decisions Log

### Why a separate bridge server instead of direct phone → AI Agent API?

1. **Separation of concerns:** Phone app stays thin (UI + audio capture). All logic on server.
2. **Session management:** AI Agent's `/v1/responses` has a 100-response LRU limit. Bridge adds proper SQLite-backed session storage.
3. **STT orchestration:** Audio processing on server, not in a phone WebView. Single point of config.
4. **Response adaptation:** G2 display needs truncated responses. Bridge handles this centrally.
5. **Extensibility:** Other clients (CLI, desktop, other wearables) can use the same bridge API.
6. **Security:** API keys never leave the server. Phone only has the bridge token.

### Why even-toolkit as a dependency?

1. **Official design system:** Recommended by Even Realities, follows their 2025 UIUX Design Guidelines.
2. **Screen router:** Per-screen architecture with co-located display + action logic. Eliminates manual `rebuildPageContainer` management.
3. **Chat display builder:** Purpose-built for AI conversation output on G2 (prefixes, scroll, pagination).
4. **Navigation helpers:** `moveHighlight`, `clampIndex`, `wrapIndex` — battle-tested by multiple published apps.
5. **STT audio utilities:** PCM capture, VAD, WAV conversion — reuse for audio pipeline to bridge.
6. **Web components:** 55+ React components for phone companion UI (settings, session browser).
7. **Icons:** 191 pixel-art icons matching Even Realities design language.
8. **Maintenance:** Active project (38+ commits, Apr 2026), MIT licensed, used by 5+ published apps.

### Why STT on the bridge, not the phone?

1. **Single config point:** User sets STT endpoint/key once on server, not on every client.
2. **Key security:** STT API key stays on server (same as AI agent key).
3. **Universal benefit:** CLI, desktop, future clients all get STT automatically.
4. **Architecture consistency:** "Complexity decreases bottom-up." Server handles processing.
5. **Minimal latency impact:** Phone → Bridge over LAN is <10ms. Bottleneck is the STT API call regardless of who initiates it.

### Why OpenAI Responses API format for the bridge?

1. **Standard:** Clients can use existing OpenAI SDKs.
2. **Stateful:** Built-in conversation management via `conversation` parameter.
3. **Streaming:** SSE support out of the box.
4. **Tool visibility:** Responses API exposes tool calls for progress display.
5. **Universal:** Works with Hermes, OpenAI, and any compatible endpoint.

### Why no HTTPS in the bridge?

1. **User responsibility:** Users with public-facing deployments add their own reverse proxy (Caddy, Nginx, Cloudflare Tunnel).
2. **Simplicity:** Bridge runs on LAN by default. HTTPS adds complexity (certificates, renewal) with no benefit for local use.
3. **Modularity:** TLS termination is a separate concern. Don't couple it to the application.

### Why Python/FastAPI for the bridge?

1. **AI agent ecosystem:** Hermes and most AI tools are Python. Same tooling, same deployment patterns.
2. **Async:** FastAPI handles concurrent requests natively.
3. **Lightweight:** Minimal resource footprint for a 24/7 service.
4. **Universal:** Easy to containerize, widely understood, large library ecosystem.

### Why per-session request locking?

1. **Race prevention:** Two concurrent messages to the same session can load the same history snapshot, causing context loss.
2. **Lightweight:** `asyncio.Lock` per session — no external dependency, no database locks.
3. **Auto-cleanup:** Locks are created lazily and removed when no coroutines are waiting.
4. **Transparent:** Calling code wraps agent interaction in `async with lock.acquire(session_id)`.
