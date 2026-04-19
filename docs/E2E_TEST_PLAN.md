# G2 Caduceus — E2E Voice Loop Test Plan

## Prerequisites

### 1. Bridge Server

**Install the bridge package first** (do NOT use system uvicorn — use the same Python):

```bash
cd /path/to/g2-caduceus/bridge
pip install -e ".[dev]"
```

Then run with `python -m uvicorn`:

```bash
G2_BRIDGE_TOKEN=<your-token> \
G2_AGENT_API_URL=<agent-api-url> \
G2_AGENT_API_KEY=<your-agent-key> \
G2_STT_API_URL=<stt-api-url> \
G2_STT_API_KEY=<your-stt-key> \
G2_STT_MODEL=whisper-1 \
G2_DATABASE_PATH=/tmp/g2_bridge_test.db \
# Optional: customize agent behavior (leave empty to use agent's default prompt)
# G2_AGENT_INSTRUCTIONS="You are the AI assistant for G2 smart glasses. Keep responses concise." \
# Optional: additional configuration
# G2_MAX_RESPONSE_CHARS=500 \
# G2_MAX_AUDIO_BYTES=5242880 \
# G2_MAX_CONTEXT_MESSAGES=50 \
# G2_MAX_SESSIONS=100 \
# G2_TIMEZONE=Europe/Vienna \
# G2_LOG_LEVEL=INFO \
# G2_LOG_FORMAT=text \
python -m uvicorn g2_bridge.main:app --host 0.0.0.0 --port 8643
```

> **Important:** Use `python -m uvicorn`, NOT `uvicorn` directly. System uvicorn
> may use a different Python version and won't find the `g2_bridge` module.

> **Note:** `G2_HOST` and `G2_PORT` are configuration options (defaults: `0.0.0.0`
> and `8643`) that can also be passed via uvicorn CLI flags (`--host`, `--port`).
> CLI flags take precedence over environment variables.

**Verify bridge is running:**
```bash
curl -s http://localhost:8643/health
# Expected: {"status":"ok","version":"0.1.0"}
```

### 2. Verify STT works independently

Generate a test WAV file (1 second of silence):
```bash
python3 -c "
import wave
with wave.open('/tmp/test_silence.wav', 'w') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    w.writeframes(b'\x00\x00' * 16000)
"
```

Test the STT endpoint:
```bash
curl -s -X POST "<stt-api-url>" \
  -H "Authorization: Bearer <your-stt-key>" \
  -F "file=@/tmp/test_silence.wav" \
  -F "model=whisper-1" \
  -F "response_format=text"
# Expected: transcript text (may be empty or hallucinated for silence)
# HTTP 200 = endpoint works
```

### 3. Verify AI Agent works independently

```bash
curl -s -X POST "<agent-api-url>/chat/completions" \
  -H "Authorization: Bearer <your-agent-key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"default","messages":[{"role":"user","content":"Hello, say hi back in one sentence"}],"stream":false}'
# Expected: AI response JSON with choices[0].message.content
```

> **Note:** The bridge is agent-agnostic — it uses the OpenAI Chat Completions API
> format (`POST /chat/completions`). Hermes is one compatible agent; any
> OpenAI-compatible endpoint works.

---

## Step-by-Step E2E Test

### Step 1: Start the App Dev Server

From the app directory:
```bash
cd /path/to/g2-caduceus/app
npm install   # if not done yet
npm run dev   # starts Vite dev server
```

Note the URL (e.g. `http://192.168.x.x:5173`)

### Step 2: Sideload App onto Glasses

Use the Even Hub app to QR-sideload:
```
evenhub qr --url "http://192.168.x.x:5173"
```

Or use the Even Realities app's built-in QR scanner.

### Step 3: Configure Bridge Connection

1. Open the app on your phone (Even Hub companion WebUI)
2. Go to Settings screen in the phone app
3. Enter Bridge URL: `http://<YOUR_HOST_IP>:8643`
4. Enter Bridge Token: (whatever G2_BRIDGE_TOKEN you set)
5. Save settings and tap Connect

### Step 4: Create a Session

```bash
# Via curl
curl -s -X POST "http://localhost:8643/v1/sessions" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"E2E Test"}'
# Note the session ID from the response
```

Or on glasses: Menu → New Session

### Step 5: Test Text Input First

Before testing voice, verify the text pipeline works:

```bash
# Replace SESSION_ID with the ID from Step 4
curl -s -X POST "http://localhost:8643/v1/sessions/<SESSION_ID>/message" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello, respond with exactly one short sentence."}'
```

Expected: AI response JSON with truncated text (max `G2_MAX_RESPONSE_CHARS` chars, default 500).

If this works, the Bridge → AI Agent pipeline is confirmed working.

### Step 6: Test Optional Agent Instructions (optional)

Verify that `G2_AGENT_INSTRUCTIONS` customizes agent behavior:

```bash
# Restart bridge with instructions set
G2_AGENT_INSTRUCTIONS="Always respond in exactly 3 words, nothing else." \
  python -m uvicorn g2_bridge.main:app --host 0.0.0.0 --port 8643

# Send a message
curl -s -X POST "http://localhost:8643/v1/sessions/<SESSION_ID>/message" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Tell me about the universe"}'
```

Expected: Agent responds in exactly 3 words (instructions are applied).

> **How it works:** `G2_AGENT_INSTRUCTIONS` is sent as a `system`-role message
> in the Chat Completions API request — it's a system-level instruction, NOT
> appended to the user message. When empty (default), no system message is sent.

Without `G2_AGENT_INSTRUCTIONS` set, the agent uses its default behavior.

### Step 7: Test Voice Input

1. On glasses: Open a chat session
2. Tap to start recording — glasses header shows **"Recording"** (text label, not emoji)
3. Speak clearly (e.g. "What time is it?" or "Say hello")
4. Wait for silence (VAD auto-stops after 1.5s of silence)
5. Or tap again to stop manually

**Expected flow:**
1. Glasses header shows **"Thinking"** (loading state)
2. After 2-60 seconds (agent latency varies), transcript + AI response appear on glasses
3. Chat display shows both user transcript and assistant response
4. Header returns to **"Idle"** when processing completes

> **Note:** Agent responses can take a long time (55+ seconds for complex queries).
> The bridge uses a 120-second agent timeout; the app uses a 180-second request
> timeout. Don't assume it's broken if it takes a while.

### Step 8: Test Session Management (optional)

**Rename a session:**
```bash
curl -s -X PATCH "http://localhost:8643/v1/sessions/<SESSION_ID>" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Renamed Session"}'
# Expected: updated session JSON
```

**Bulk delete sessions:**
```bash
curl -s -X POST "http://localhost:8643/v1/sessions/bulk-delete" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"session_ids":["<ID1>","<ID2>"]}'
# Expected: {"deleted_count":2}
```

> **Note:** Bulk delete accepts up to 100 session IDs per request. For more than
> 100, batch into multiple requests.

### Step 9: Test Conversation Continuity (optional)

Send multiple messages to verify context is preserved:

```bash
# Message 1
curl -s -X POST "http://localhost:8643/v1/sessions/<SESSION_ID>/message" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"My favorite color is blue. Remember that."}'

# Message 2 — should recall the color from context
curl -s -X POST "http://localhost:8643/v1/sessions/<SESSION_ID>/message" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"What is my favorite color?"}'
# Expected: Agent mentions "blue" — confirms context (G2_MAX_CONTEXT_MESSAGES) works
```

### Step 10: Test Session Persistence (optional)

1. Create a session and send a message
2. Restart the bridge server
3. List sessions and verify the session still exists:
```bash
curl -s "http://localhost:8643/v1/sessions/<SESSION_ID>" \
  -H "Authorization: Bearer <your-token>"
# Expected: session with message history intact
```

### Step 11: Debug if Something Fails

**Check bridge logs** (uvicorn output in the terminal where you started it):
```
# Look for these log lines:
# - "Sending audio to STT: <N> bytes, model=<model>"
# - "STT transcript: <text> (latency=<X>s, <N> chars)"
# - "STT transcription failed: session=<id>, latency=<X>s — <error>"
# - "Agent request failed: session=<id>, latency=<X>s — <error>"
# - "Audio received: session=<id>, size=<N> bytes (~<X>s)"
# - "Agent response: session=<id>, chars=<N>, latency=<X>s"
# - "Response adapted: session=<id>, <N> -> <N> chars"
```

> **Tip:** Set `G2_LOG_LEVEL=DEBUG` for more verbose logging during testing.

**When running via Docker/systemd**, bridge logs go to:
- Docker: `docker logs <container-name>`
- systemd: `journalctl -u g2-bridge -f`

**Common issues:**

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `ModuleNotFoundError: No module named 'g2_bridge'` | System uvicorn uses different Python | Use `python -m uvicorn` instead of `uvicorn` |
| App won't connect | Bridge not reachable from phone | Check IP, ensure same network, no firewall |
| "STT endpoint not configured" | G2_STT_API_URL not set | Set env var and restart bridge |
| STT returns empty | Audio format wrong or too quiet | Check WAV format (16kHz mono S16LE) |
| "Agent request failed" | Agent URL/key wrong | Test agent endpoint with curl (Step 3) |
| No audio captured | EvenAppBridge not available | Must run inside Even Hub WebView, not regular browser |
| Recording doesn't stop | VAD threshold too low | Silence > 0.02 RMS for 1.5s triggers stop |
| STT model not found | Wrong model name for LiteLLM | Set `G2_STT_MODEL` to match your LiteLLM config |
| Agent response slow (>55s) | Complex query or slow agent | Normal — bridge timeout is 120s, app timeout is 180s |
| "Audio too large" | WAV exceeds size limit | Max is `G2_MAX_AUDIO_BYTES` (default 5MB) |
| `crypto.randomUUID() not available` | WebView compatibility issue | Ensure WebView supports crypto API (newer Even Hub versions) |
| "Response adapted" in logs | Agent response > 500 chars | Normal — responses are truncated to `G2_MAX_RESPONSE_CHARS` |

---

## Configuration Reference

All configuration is via environment variables with the `G2_` prefix:

| Env Var | Default | Description |
|---------|---------|-------------|
| `G2_BRIDGE_TOKEN` | *(empty, required)* | Client authentication token |
| `G2_AGENT_API_KEY` | *(empty, required)* | AI Agent API key (Bearer token) |
| `G2_AGENT_API_URL` | `http://localhost:8642/v1` | AI Agent Chat Completions API URL |
| `G2_STT_API_URL` | *(empty)* | STT endpoint URL (e.g. `http://litellm:4000/v1/audio/transcriptions`) |
| `G2_STT_API_KEY` | *(empty, optional)* | STT API key if endpoint requires auth |
| `G2_STT_MODEL` | `whisper-1` | Model name sent to STT endpoint |
| `G2_DATABASE_PATH` | `/data/g2_bridge.db` | SQLite database path |
| `G2_AGENT_INSTRUCTIONS` | *(empty)* | Optional system prompt for the AI agent (sent as system-role message) |
| `G2_MAX_RESPONSE_CHARS` | `500` | Max characters for agent responses (truncated if exceeded) |
| `G2_MAX_AUDIO_BYTES` | `5242880` (5MB) | Max audio upload size |
| `G2_MAX_CONTEXT_MESSAGES` | `50` | Max conversation history messages sent to agent. Set to `0` for stateless |
| `G2_MAX_SESSIONS` | `100` | Max sessions before auto-eviction (LRU) |
| `G2_TIMEZONE` | `UTC` | IANA timezone for timestamps (e.g. `Europe/Vienna`) |
| `G2_LOG_LEVEL` | `INFO` | Log level: DEBUG, INFO, WARNING, ERROR, CRITICAL |
| `G2_LOG_FORMAT` | `text` | Log format: `text` or `json` |
| `G2_HOST` | `0.0.0.0` | Server bind host (also via `--host` CLI flag) |
| `G2_PORT` | `8643` | Server bind port (also via `--port` CLI flag) |

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (no auth required) |
| `POST` | `/v1/sessions` | Create new session |
| `GET` | `/v1/sessions` | List all sessions |
| `GET` | `/v1/sessions/{id}` | Get session with message history |
| `PATCH` | `/v1/sessions/{id}` | Rename session |
| `DELETE` | `/v1/sessions/{id}` | Delete session |
| `POST` | `/v1/sessions/bulk-delete` | Delete multiple sessions (max 100 per request) |
| `POST` | `/v1/sessions/{id}/message` | Send text message (returns agent response) |
| `POST` | `/v1/sessions/{id}/audio` | Upload audio (WAV/PCM → transcript + response) |

All `/v1/` endpoints require `Authorization: Bearer <G2_BRIDGE_TOKEN>` header.

---

## Test Results Template

**Test Environment:**

| Field | Value |
|-------|-------|
| Date | |
| Tester | |
| Bridge version | 0.1.0 |
| Agent endpoint | |
| STT endpoint | |
| Phone OS | |
| G2 firmware version | |
| G2_TIMEZONE | |

**Results:**

| # | Test Case | Severity | Pass/Fail | Notes |
|---|-----------|----------|-----------|-------|
| 1 | Bridge health check passes | blocker | ☐ | Should return `{"status":"ok"}` |
| 2 | STT endpoint responds (HTTP 200) | blocker | ☐ | Use curl test from Prerequisites |
| 3 | AI Agent responds to text input | blocker | ☐ | Use curl test from Prerequisites |
| 4 | Bridge text message pipeline works (curl) | blocker | ☐ | Step 5 — agent response received |
| 5 | Optional agent instructions applied when configured | minor | ☐ | Step 6 — 3-word response |
| 6 | App loads on glasses via QR sideload | blocker | ☐ | Step 1-2 |
| 7 | App connects to bridge (settings configured) | blocker | ☐ | Step 3 |
| 8 | Session created successfully | blocker | ☐ | Step 4 |
| 9 | Session rename works | minor | ☐ | Step 8 |
| 10 | Session bulk delete works | minor | ☐ | Step 8 |
| 11 | Text message sent and response displayed on glasses | critical | ☐ | Step 5 via glasses |
| 12 | Voice recording starts on tap (header shows "Recording") | critical | ☐ | Step 7 |
| 13 | Voice recording stops (auto VAD or manual tap) | critical | ☐ | Step 7 |
| 14 | WAV uploaded to bridge successfully | critical | ☐ | Check bridge logs for "Audio received" |
| 15 | STT transcript returned | critical | ☐ | Check logs for "STT transcript" |
| 16 | AI response returned and displayed on glasses | critical | ☐ | Header returns to "Idle" |
| 17 | Full voice loop: speak → transcript → response on glasses | blocker | ☐ | End-to-end confirmation |
| 18 | Conversation continuity (context preserved across messages) | critical | ☐ | Step 9 |
| 19 | Session persistence after bridge restart | critical | ☐ | Step 10 |
| 20 | Audio size limit enforced (>5MB rejected) | minor | ☐ | Expect 413 error |
| 21 | Response truncation (>500 chars adapted) | minor | ☐ | Check logs for "Response adapted" |
| 22 | Error handling: STT failure returns 502 | minor | ☐ | Disconnect STT and test |
| 23 | Error handling: Agent timeout returns appropriate error | minor | ☐ | Use very slow agent endpoint |

**Severity levels:**
- **blocker** — Cannot proceed with testing; must be fixed
- **critical** — Core functionality broken; major feature unusable
- **minor** — Non-critical issue; workaround available or nice-to-have

## Notes

- The EvenAppBridge audio API only works inside the Even Realities app's WebView.
  Regular browsers will show "EvenAppBridge not available" in console.
- Bridge runs on port 8643 by default (configurable via `G2_PORT` or `--port`).
- The app uses the phone's WebUI for settings; glasses show the chat display.
- STT model is configurable via `G2_STT_MODEL` (default: `whisper-1`).
  Set this to match your LiteLLM proxy's Whisper model name if different.
- Chat screen header shows text labels for recording states: **Idle**, **Recording**,
  **Thinking**, **Offline** — no emoji or Unicode symbols (not supported on G2 firmware).
- The bridge is agent-agnostic: any OpenAI Chat Completions API-compatible endpoint
  works. Hermes is one example; the docs use generic "AI Agent" terminology.
