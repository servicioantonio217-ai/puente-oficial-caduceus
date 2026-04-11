# G2 Caduceus — Architecture

## Overview

Three-tier architecture connecting the Even Realities G2 smart glasses to Hermes Agent.

```
G2 Glasses ──BT──► Phone (Even Hub App + WebUI) ──HTTPS──► G2 Bridge Server ──HTTPS──► Hermes API
```

**Design principle:** Complexity decreases bottom-up. The server (24/7, always-on) handles the heavy lifting. The phone (battery-powered, resource-constrained) stays minimal.

## Components

### 1. Hermes Responses API (existing)

The standard Hermes API Server endpoint (`POST /v1/responses`).

- OpenAI Responses API format
- Stateful conversations via `conversation` parameter or `previous_response_id`
- Full tool access: terminal, file ops, web search, memory, skills
- Streaming (SSE) with tool progress indicators
- Bearer token auth
- Default port: 8642

This is NOT part of the G2 Caduceus project — it's a Hermes feature we consume.

**Docs:** https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/

### 2. G2 Bridge Server

A standalone Python application deployed on the Hermes host server.

**Responsibilities:**
- Authentication (client token, Hermes API key)
- Session management (create, resume, list, delete, switch)
- Conversation history persistence (SQLite)
- STT processing (audio → Whisper → text)
- Request/response orchestration (client → Hermes API → client)
- Response truncation/summarization for G2 display constraints
- Hermes API credential management

**NOT responsible for:**
- Display rendering (that's the glasses app's job)
- Audio recording (that's the glasses app's job)
- User configuration UI (that's the WebUI's job)

**Deployment:**
- Docker container or systemd service
- Configurable via environment variables or config file
- Single binary/tarball or Docker image

**API Contract (between phone and bridge):**

All endpoints use the client token for auth (`Authorization: Bearer <g2-bridge-token>`).

```
GET  /health                          — Health check
POST /v1/sessions                     — Create new session (optionally name it)
GET  /v1/sessions                     — List all sessions
GET  /v1/sessions/{id}                — Get session details + history
DELETE /v1/sessions/{id}              — Delete session
POST /v1/sessions/{id}/message        — Send text message (streamed response)
POST /v1/sessions/{id}/audio          — Send audio (WAV/PCM, returns transcript + response)
POST /v1/sessions/{id}/resume         — Resume a paused session
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

**Storage:**
- SQLite database for sessions, messages, and conversation state
- Each session maps to a Hermes `conversation` parameter
- Session metadata: name, created_at, updated_at, message_count, hermes_conversation_id

### 3. Phone — Even Hub App (WebUI + G2 Display)

An Even Hub app running in the Even Realities App's WebView.

**Responsibilities:**
- Audio capture from G2 glasses (via EvenAppBridge)
- Display rendering on G2 glasses (via SDK containers)
- Touchpad input handling
- Session list browsing and switching
- Configuration input (bridge address + token)
- G2-specific UI customizations (display themes, layout preferences)

**NOT responsible for:**
- STT processing (delegated to bridge server)
- Hermes communication (delegated to bridge server)
- Persistent storage of conversations (delegated to bridge server)

**Configuration (stored in localStorage):**
- Bridge server URL (e.g., `https://bridge.example.com`)
- Bridge client token (random-generated, user copies from bridge)
- G2 display preferences (font size, layout, theme)

**Key constraint:** EvenAppBridge is ONLY available inside the Even Realities App's WebView. The app MUST run there — not on the server, not in a regular browser.

## Data Flow

### Voice Input

```
1. User taps to talk on G2 glasses
2. App captures PCM audio via EvenAppBridge.audioControl(true)
3. App sends PCM/WAV to Bridge: POST /v1/sessions/{id}/audio
4. Bridge runs STT (Whisper) → gets transcript
5. Bridge sends transcript to Hermes: POST /v1/responses
6. Hermes processes (tools, skills, etc.) → returns response
7. Bridge truncates/summarizes response for G2 display
8. Bridge returns response to app (streamed or final)
9. App paginates text and renders on G2 display via SDK containers
```

### Text Input (via WebUI or voice transcript)

```
1. User sends text (WebUI or after STT)
2. App sends to Bridge: POST /v1/sessions/{id}/message
3. Bridge forwards to Hermes: POST /v1/responses
4. Response flows back: Hermes → Bridge → App → G2 display
```

### Session Management

```
1. App requests session list: GET /v1/sessions
2. Bridge returns sessions from SQLite
3. User selects/resumes session on G2 or WebUI
4. App sends next message with session context
5. Bridge maps session to Hermes conversation parameter
```

## Authentication

Two layers:

1. **Client → Bridge:** Bearer token (random-generated on bridge setup, user enters in WebUI)
2. **Bridge → Hermes:** Bearer token (configured in bridge env/config, `API_SERVER_KEY`)

The bridge is the only component that knows the Hermes API key. Phone/never sees it.

## G2 Display Constraints

- 576x288px per eye, 4-bit greyscale (16 green shades)
- ~400-500 chars per page, scroll-based pagination
- Max 8 containers per page, exactly 1 with `isEventCapture: 1`
- No background fill, no CSS/DOM — container-based rendering

The bridge MUST truncate/summarize responses before sending to the app. The app should NOT receive full-length Hermes responses.

## Tech Stack

| Component | Language | Framework | Runtime |
|-----------|----------|-----------|---------|
| Bridge Server | Python | FastAPI + uvicorn | Docker / systemd |
| Even Hub App | TypeScript | Vite + Even Hub SDK | WebView (Even Realities App) |
| Storage | — | SQLite | On bridge server |
| STT | — | Whisper (via LiteLLM or OpenAI) | External API |

## Project Structure (proposed)

```
g2-caduceus/
├── bridge/                      # G2 Bridge Server (Python)
│   ├── pyproject.toml           # Dependencies (FastAPI, httpx, aiosqlite, etc.)
│   ├── alembic/                 # Database migrations
│   ├── src/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Configuration (env vars)
│   │   ├── auth.py              # Token authentication
│   │   ├── database.py          # SQLite session/message storage
│   │   ├── models.py            # SQLAlchemy/dataclass models
│   │   ├── hermes_client.py     # Hermes Responses API client
│   │   ├── stt.py               # STT service (Whisper)
│   │   ├── response.py          # Response truncation/summarization
│   │   └── routers/
│   │       ├── health.py
│   │       ├── sessions.py      # Session CRUD
│   │       └── messages.py      # Message + audio endpoints
│   ├── Dockerfile
│   └── README.md
├── app/                         # Even Hub App (TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── app.json                 # Even Hub manifest
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.ts               # Bridge connection, event handling, display
│   │   ├── display.ts           # G2 display rendering (SDK containers)
│   │   ├── audio.ts             # PCM capture from glasses
│   │   ├── sessions.ts          # Session list UI on G2 + WebUI
│   │   ├── webui.ts             # Phone WebUI (config, session browser)
│   │   └── style.css
│   └── README.md
├── ARCHITECTURE.md              # This file
├── README.md                    # Project overview
└── .gitignore
```

## Deployment

### Bridge Server

```bash
# Option 1: Docker
docker build -t g2-bridge ./bridge
docker run -d \
  -p 8643:8000 \
  -e HERMES_API_URL=http://localhost:8642/v1 \
  -e HERMES_API_KEY=change-me \
  -e G2_BRIDGE_TOKEN=$(openssl rand -hex 32) \
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

### Why a separate bridge server instead of direct Even Hub App → Hermes API?

1. **Separation of concerns:** The Even Hub App stays thin (UI + audio capture). All logic lives on the server where it can be updated without app redeployment.
2. **Session management:** Hermes API's `/v1/responses` has a 100-response LRU limit. The bridge adds proper SQLite-backed session storage.
3. **STT orchestration:** Audio processing is expensive. Better done server-side than in a phone WebView.
4. **Response adaptation:** G2 display needs truncated/summarized responses. The bridge handles this centrally.
5. **Extensibility:** Other clients (CLI, other wearables) can use the same bridge API.
6. **Security:** Hermes API key never leaves the server. Phone only has the bridge token.

### Why OpenAI Responses API format for the bridge's API?

1. **Standard:** Clients can use existing OpenAI SDKs.
2. **Stateful:** Built-in conversation management via `conversation` parameter.
3. **Streaming:** SSE support out of the box.
4. **Tool visibility:** Responses API exposes tool calls, allowing the app to show progress.

### Why Python/FastAPI for the bridge?

1. **Hermes ecosystem:** Hermes is Python. Same tooling, same deployment patterns.
2. **Async:** FastAPI handles concurrent requests natively.
3. **Lightweight:** Minimal resource footprint for a 24/7 service.
