# G2 Bridge Server

Bridge server connecting [Even Realities G2](https://evenrealities.com/) smart glasses to AI agents via a REST API.

The bridge sits between the phone app (which runs on the glasses' companion app) and an AI agent backend. It handles authentication, session management, conversation history persistence, speech-to-text processing, and response adaptation for the G2's small monochrome display.

For the full 3-tier architecture diagram, see [ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Quick Start

### Prerequisites

- **Python** >= 3.11
- An **AI agent API** endpoint compatible with OpenAI Chat Completions format (e.g., [Hermes Agent](https://github.com/nousresearch/hermes-agent))
- (Optional) A **Whisper-compatible STT endpoint** for voice input

### Install

```bash
cd bridge
pip install -e ".[dev]"
```

The `.[dev]` extra includes pytest, ruff, and mypy for development. For production, `pip install .` is sufficient.

> **Note:** Always use `pip install -e ".[dev]"` rather than installing `uvicorn` separately — the package already depends on `uvicorn[standard]`. Using the system `uvicorn` binary may pick up the wrong Python and fail to find the `g2_bridge` module.

### Configure

Create a `.env` file in the `bridge/` directory (or set environment variables):

```bash
# Required — the bridge will not start without these
G2_BRIDGE_TOKEN=***
G2_AGENT_API_KEY=***

# Required — your agent's Chat Completions endpoint
G2_AGENT_API_URL=http://localhost:<agent-port>/v1

# Optional — for voice input from glasses
G2_STT_API_URL=http://<stt-host>:<stt-port>/v1/audio/transcriptions
G2_STT_API_KEY=***

# Optional — see Configuration Reference below for all options
```

Use placeholder values (e.g., `***`) for secrets. Never commit real credentials.

### Run

```bash
cd bridge
python -m uvicorn g2_bridge.main:app --host 0.0.0.0 --port <bridge-port>
```

> **Important:** Use `python -m uvicorn`, not bare `uvicorn`. This ensures the virtual environment's Python is used and the `g2_bridge` module is importable.

For development with auto-reload:

```bash
python -m uvicorn g2_bridge.main:app --reload --host 0.0.0.0 --port <bridge-port>
```

### Verify

```bash
curl http://localhost:<bridge-port>/health
```

Expected response:

```json
{"status": "ok", "version": "0.1.0"}
```

If the health check returns 200, the bridge is running.

### Container Deployment

Build and run with Podman:

```bash
podman build -t g2-bridge ./bridge
podman run -d \
  -p 8643:8643 \
  -e G2_BRIDGE_TOKEN=*** \
  -e G2_AGENT_API_KEY=*** \
  -e G2_AGENT_API_URL=http://host.containers.internal:<agent-port>/v1 \
  -v g2-data:/data \
  g2-bridge
```

Or use `docker-compose.example.yml` as a starting point:

```bash
cp docker-compose.example.yml docker-compose.yml
# Edit docker-compose.yml with your values
podman compose up -d
```

**Notes:**
- The container exposes port **8643** internally (mapped to 8643 in the example)
- The SQLite database is stored at `/data/g2_bridge.db` inside the container — mount a volume for persistence
- The container runs as a non-root user (`appuser`)
- For accessing services on the host from within the container, use `host.containers.internal` instead of `localhost`

#### Production Notes

- **Reverse proxy**: Place behind nginx/Caddy with HTTPS termination
- **Systemd**: Create a systemd unit for the uvicorn process if running outside a container
- **Database backup**: The SQLite file at `G2_DATABASE_PATH` is the only persistent state. Back it up regularly.

## Configuration Reference

All settings use environment variables with the `G2_` prefix. They can also be set via a `.env` file in the `bridge/` directory.

| Variable | Default | Description |
|---|---|---|
| `G2_BRIDGE_TOKEN` | *(empty, required)* | Bearer token for client authentication (phone → bridge). Requests must include `Authorization: Bearer *** |
| `G2_AGENT_API_KEY` | *(empty, required)* | API key for the AI agent backend (bridge → agent). |
| `G2_AGENT_API_URL` | `http://localhost:8642/v1` | AI agent Chat Completions API base URL. The bridge appends `/chat/completions` to this. |
| `G2_STT_API_URL` | *(empty)* | STT endpoint URL (e.g., `http://litellm:4000/v1/audio/transcriptions`). Required for voice input. When empty, audio endpoints return 503. |
| `G2_STT_API_KEY` | *(empty)* | STT endpoint API key. Optional — only needed if your STT provider requires authentication. |
| `G2_STT_MODEL` | `whisper-1` | Model name sent to the STT endpoint in the `model` field. Override if your provider uses a different model identifier. |
| `G2_DATABASE_PATH` | `/data/g2_bridge.db` | SQLite database file path. Parent directory is auto-created. |
| `G2_MAX_RESPONSE_CHARS` | `500` | Maximum characters for agent response truncation. Responses exceeding this are cut at a sentence boundary with `...` appended. |
| `G2_MAX_SESSIONS` | `100` | Max sessions before auto-eviction of oldest (LRU). Set to `0` for unlimited. |
| `G2_MAX_AUDIO_BYTES` | `5242880` (5 MB) | Maximum audio file size accepted by the audio endpoint. Larger files return 413. |
| `G2_MAX_CONTEXT_MESSAGES` | `50` | Maximum number of prior messages sent to the agent as conversation context. Prevents token overflow. |
| `G2_AGENT_INSTRUCTIONS` | *(empty)* | Optional system prompt injected as the first message in every agent request. Use this to customize agent behavior (e.g., "Keep responses short and factual."). |
| `G2_TIMEZONE` | `UTC` | IANA timezone for timestamp display (e.g., `Europe/Vienna`). All timestamps are stored as UTC and converted on output. Invalid values cause startup failure. |
| `G2_HOST` | `0.0.0.0` | Server listen host. Part of the Python `Settings` model — read from env var by `main.py` and passed to uvicorn. |
| `G2_PORT` | `8643` | Server listen port. Same as `G2_HOST` — read from env var by `main.py` and passed to uvicorn. |

> **Note:** `G2_HOST` and `G2_PORT` are part of the Python `Settings` model (`config.py`) and are read from environment variables at startup. The `__main__` block in `main.py` passes them to uvicorn automatically. The Dockerfile sets sensible defaults (`8643` for port) — override at runtime via `-e G2_PORT=XXXX`.

### Minimum Required Configuration

To start the bridge, you need at minimum:

```bash
G2_BRIDGE_TOKEN=***
G2_AGENT_API_KEY=***
```

Without these, the bridge starts but logs a warning and all authenticated endpoints return errors.

For full functionality including voice input, also set:

```bash
G2_STT_API_URL=http://<stt-host>:<stt-port>/v1/audio/transcriptions
```

## API Reference

All endpoints except `/health` require authentication:

```
Authorization: Bearer <G2_BRIDGE_TOKEN>
```

### Health Check

```
GET /health
```

Returns the server status and version. No authentication required.

**Response:**

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

### Sessions

```
POST   /v1/sessions                    — Create session
GET    /v1/sessions                    — List sessions (ordered by most recently updated)
GET    /v1/sessions/{id}               — Get session detail with full message history
PATCH  /v1/sessions/{id}               — Rename session
DELETE /v1/sessions/{id}               — Delete session and all its messages
POST   /v1/sessions/bulk-delete        — Delete multiple sessions
```

#### Create Session

```
POST /v1/sessions
Content-Type: application/json

{
  "name": "My Chat"  // optional, defaults to empty string
}
```

**Response** (`201 Created`):

```json
{
  "id": "uuid",
  "name": "My Chat",
  "created_at": "2026-04-18T12:00:00+02:00",
  "updated_at": "2026-04-18T12:00:00+02:00",
  "message_count": 0
}
```

#### List Sessions

```
GET /v1/sessions
```

**Response:** Array of `SessionResponse` objects, ordered by `updated_at` descending.

#### Get Session Detail

```
GET /v1/sessions/{id}
```

**Response:** `SessionDetailResponse` — includes the session metadata and full message history:

```json
{
  "id": "uuid",
  "name": "My Chat",
  "created_at": "2026-04-18T12:00:00+02:00",
  "updated_at": "2026-04-18T12:30:00+02:00",
  "message_count": 4,
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Hello!",
      "created_at": "2026-04-18T12:00:00+02:00"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "Hi there!",
      "created_at": "2026-04-18T12:00:00+02:00"
    }
  ]
}
```

#### Rename Session

```
PATCH /v1/sessions/{id}
Content-Type: application/json

{
  "name": "New Name"  // required, 1-100 characters
}
```

**Note:** Renaming does **not** update `updated_at`. Only new messages bump the timestamp.

#### Delete Session

```
DELETE /v1/sessions/{id}
```

Returns `204 No Content` on success. All messages in the session are cascade-deleted.

#### Bulk Delete Sessions

```
POST /v1/sessions/bulk-delete
Content-Type: application/json

{
  "session_ids": ["uuid1", "uuid2", "uuid3"]  // 1-100 IDs
}
```

**Response:**

```json
{
  "deleted_count": 3
}
```

### Messages

```
POST /v1/sessions/{id}/message  — Send text, get AI response
POST /v1/sessions/{id}/audio    — Send WAV audio, get transcript + AI response
```

#### Send Text Message

```
POST /v1/sessions/{id}/message
Content-Type: application/json

{
  "content": "What's the weather?"
}
```

The bridge:
1. Loads conversation history from the database (up to `G2_MAX_CONTEXT_MESSAGES` prior messages)
2. Sends the message + history to the AI agent via the Chat Completions API
3. Stores both the user message and the (truncated) assistant response
4. Returns the agent's response in OpenAI Responses API format

**Response:** `AgentResponse` — see below.

#### Send Audio Message

```
POST /v1/sessions/{id}/audio
Content-Type: multipart/form-data

file: <audio.wav>  // WAV format, 16kHz mono recommended
```

The bridge:
1. Validates audio size (max `G2_MAX_AUDIO_BYTES`, default 5 MB)
2. Sends audio to the configured STT endpoint for transcription
3. Forwards the transcript to the AI agent (same flow as text messages)
4. Returns both the transcript and the agent's response

**Response:**

```json
{
  "transcript": "Hello, how are you?",
  "response": { /* AgentResponse */ }
}
```

**Error codes:**
- `503` — STT endpoint not configured (`G2_STT_API_URL` is empty)
- `400` — No file provided or empty file
- `413` — Audio file too large
- `422` — STT returned empty transcript
- `502` — STT or agent request failed

### Authentication Errors

All errors return a consistent JSON format:

```json
{
  "detail": "Error description"
}
```

Common error codes:
- `401` — Missing or invalid bearer token
- `404` — Session not found
- `502` — Agent/STT service unreachable or returned an error
- `503` — Agent API key not configured, or STT not configured (for audio)
- `504` — Agent service timed out (120s for agent, 30s for STT)

## Response Adaptation

Agent responses are truncated to fit the G2 display constraints. The truncation algorithm:

1. If the response fits within `G2_MAX_RESPONSE_CHARS` (default 500), it's returned as-is
2. Otherwise, find the last sentence boundary (`.`, `!`, `?` followed by a space) within the limit
3. If no sentence boundary is found, cut at the last word boundary
4. Append `...` to indicate truncation

Both the stored message and the API response contain the truncated version. The original full response from the agent is not preserved.

The `summarize` mode mentioned in the architecture docs is **not yet implemented** — all responses use truncation.

## Speech-to-Text (STT) Configuration

The bridge supports any Whisper-compatible STT endpoint. It sends audio as multipart form data with the `model` and `response_format=text` fields.

**Audio format:** WAV, 16kHz mono is recommended. The bridge does not convert audio formats — it passes the raw bytes to the STT endpoint.

**Provider quirks:** Some STT providers return JSON (e.g., `{"text": "transcript"}`) even when `response_format=text` is requested. The bridge handles this by attempting to parse JSON responses and extracting the `text` field.

**Common STT providers known to work:**
- OpenAI Whisper API (`https://api.openai.com/v1/audio/transcriptions`)
- LiteLLM proxy (supports multiple STT backends)
- Local Whisper instances

## Database

The bridge uses SQLite for persistence, stored at `G2_DATABASE_PATH` (default: `/data/g2_bridge.db`).

**Schema:**
- `sessions` — id, name, created_at, updated_at, agent_conversation_id
- `messages` — id, session_id (FK with CASCADE delete), role (`user`/`assistant`), content, created_at

**Characteristics:**
- Uses WAL journal mode for better concurrent read performance
- Foreign keys are enforced (`PRAGMA foreign_keys=ON`)
- Deleting a session cascade-deletes all its messages
- The parent directory is auto-created on startup

**Backup:** Stop the bridge and copy the `.db` file. For live backups, use `sqlite3 <db_path> ".backup /path/to/backup.db"`.

## Project Structure

```
bridge/
├── src/g2_bridge/
│   ├── main.py              # FastAPI app, lifespan, CORS, error handlers
│   ├── config.py            # Settings (env vars), timezone conversion
│   ├── auth.py              # Bearer token validation, error classification
│   ├── database.py          # Async SQLite wrapper (sessions + messages)
│   ├── models.py            # Pydantic request/response models
│   ├── agent_client.py      # AI agent HTTP client (Chat Completions API)
│   ├── stt_client.py        # STT HTTP client (Whisper API)
│   ├── context.py           # Conversation history builder
│   ├── response.py          # Response truncation for G2 display
│   └── routers/
│       ├── health.py        # GET /health
│       ├── sessions.py      # CRUD + bulk-delete + rename
│       ├── messages.py      # POST /{id}/message
│       └── audio.py         # POST /{id}/audio
├── tests/                   # pytest test suite (asyncio auto mode)
├── Dockerfile               # Multi-stage build, non-root user
├── docker-compose.example.yml
├── pyproject.toml           # Dependencies, ruff/mypy/pytest config
└── README.md                # This file
```

## Development

```bash
cd bridge
pip install -e ".[dev]"

pytest                        # Run tests (asyncio auto mode)
ruff check src/ tests/        # Lint
ruff format src/ tests/       # Format
mypy src/                     # Type check (strict mode)
```

See [CONTRIBUTING.md](../docs/CONTRIBUTING.md) for code style guidelines, PR process, and testing on hardware.

## Troubleshooting

### Bridge starts but all endpoints return 401

`G2_BRIDGE_TOKEN` is not set. The bridge logs a warning on startup: "Bridge not fully configured."

### Audio endpoints return 503 "STT endpoint not configured"

Set `G2_STT_API_URL` to your Whisper-compatible STT endpoint.

### Agent requests return 502

- Check `G2_AGENT_API_URL` — ensure it points to your agent's `/v1` base URL (the bridge appends `/chat/completions`)
- Check `G2_AGENT_API_KEY` — verify the key is valid
- Check network connectivity from the bridge to the agent endpoint

### "No module named g2_bridge" when running uvicorn

You're using a system-installed `uvicorn` instead of the one in your virtual environment. Use `python -m uvicorn` instead of bare `uvicorn`.

### Timezone errors on startup

`G2_TIMEZONE` must be a valid IANA timezone name (e.g., `Europe/Vienna`, `America/New_York`). Check for typos.

### Database locked errors

SQLite does not handle high write concurrency well. If you encounter database locks, ensure only one bridge process is using the database file. The WAL journal mode mitigates most issues.

### Dead references in this README

This README references [ARCHITECTURE.md](../docs/ARCHITECTURE.md) and [CONTRIBUTING.md](../docs/CONTRIBUTING.md) — both exist in the `docs/` directory. If you're reading this in isolation, these paths are relative to the project root.
