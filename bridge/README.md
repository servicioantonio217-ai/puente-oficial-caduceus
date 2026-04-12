# G2 Bridge Server

Bridge server connecting Even Realities G2 smart glasses to AI agents.

## Quickstart

### Docker

```bash
docker build -t g2-bridge ./bridge
docker run -d \
  -p 8643:8000 \
  -e G2_BRIDGE_TOKEN=your-client-token \
  -e G2_AGENT_API_KEY=your-agent-key \
  -e G2_AGENT_API_URL=http://localhost:8642/v1 \
  -v g2-data:/data \
  g2-bridge
```

### Local (with uvicorn)

```bash
cd bridge
pip install -e .
G2_BRIDGE_TOKEN=dev-token G2_AGENT_API_KEY=dev-key \
  uvicorn g2_bridge.main:app --reload --port 8000
```

## Configuration

All settings are configured via environment variables with the `G2_` prefix:

| Variable | Default | Description |
|---|---|---|
| `G2_BRIDGE_TOKEN` | *(required)* | Client bearer token (phone → bridge) |
| `G2_AGENT_API_KEY` | *(required)* | AI Agent API key (bridge → agent) |
| `G2_AGENT_API_URL` | `http://localhost:8642/v1` | AI Agent Responses API base URL |
| `G2_DATABASE_PATH` | `/data/g2_bridge.db` | SQLite database file path |
| `G2_MAX_RESPONSE_CHARS` | `500` | Max characters before response truncation |
| `G2_HOST` | `0.0.0.0` | Listen host |
| `G2_PORT` | `8000` | Listen port |

## API

### Health

```
GET /health
```

### Sessions

```
POST   /v1/sessions              — Create session
GET    /v1/sessions              — List sessions
GET    /v1/sessions/{id}         — Get session detail + history
DELETE /v1/sessions/{id}         — Delete session
```

### Messages

```
POST /v1/sessions/{id}/message   — Send text, get AI response
```

All endpoints require `Authorization: Bearer <G2_BRIDGE_TOKEN>`.

Response format follows the [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses).

## Development

```bash
pip install -e ".[dev]"
pytest                    # Run tests
ruff check src/ tests/     # Lint
mypy src/                 # Type check
```
