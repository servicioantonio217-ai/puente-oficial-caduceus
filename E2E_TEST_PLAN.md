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
G2_BRIDGE_TOKEN=*** \
G2_AGENT_API_URL=<agent-api-url> \
G2_AGENT_API_KEY=*** \
G2_STT_API_URL=<stt-api-url> \
G2_STT_API_KEY=*** \
G2_STT_MODEL=whisper-1 \
G2_DATABASE_PATH=/tmp/g2_bridge_test.db \
# Optional: customize agent behavior (leave empty to use agent's default prompt)
# G2_AGENT_INSTRUCTIONS="You are the AI assistant for G2 smart glasses. Keep responses concise." \
python -m uvicorn g2_bridge.main:app --host 0.0.0.0 --port 8643
```

> **Important:** Use `python -m uvicorn`, NOT `uvicorn` directly. System uvicorn
> may use a different Python version and won't find the `g2_bridge` module.

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
  -H "Authorization: Bearer <stt-api-key>" \
  -F "file=@/tmp/test_silence.wav" \
  -F "model=whisper-1" \
  -F "response_format=text"
# Expected: transcript text (may be empty or hallucinated for silence)
# HTTP 200 = endpoint works
```

### 3. Verify Hermes Agent works independently

```bash
curl -s -X POST "<agent-api-url>/responses" \
  -H "Authorization: Bearer <agent-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"input":"Hello, say hi back in one sentence"}'
# Expected: AI response JSON
```

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
  -H "Authorization: Bearer <bridge-token>" \
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
  -H "Authorization: Bearer <bridge-token>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello, respond with exactly one short sentence."}'
```

Expected: AI response JSON with truncated text.

If this works, the Bridge → Hermes pipeline is confirmed working.

### Step 5b: Test Optional Agent Instructions (optional)

Verify that `G2_AGENT_INSTRUCTIONS` customizes agent behavior:

```bash
# Restart bridge with instructions set
G2_AGENT_INSTRUCTIONS="Always respond in exactly 3 words, nothing else." \
  python -m uvicorn g2_bridge.main:app --host 0.0.0.0 --port 8643

# Send a message
curl -s -X POST "http://localhost:8643/v1/sessions/<SESSION_ID>/message" \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"content":"Tell me about the universe"}'
```

Expected: Agent responds in exactly 3 words (instructions are applied).
Without `G2_AGENT_INSTRUCTIONS` set, the agent uses its default behavior.

### Step 6: Test Voice Input

1. On glasses: Open a chat session
2. Tap to start recording — glasses should show "🎤 Listening..."
3. Speak clearly (e.g. "What time is it?" or "Say hello")
4. Wait for silence (VAD auto-stops after 1.5s of silence)
5. Or tap again to stop manually

**Expected flow:**
1. Glasses show "Thinking..." (loading state)
2. After 2-5 seconds, transcript + AI response appear on glasses
3. Chat display shows both user transcript and assistant response

### Step 7: Debug if Something Fails

**Check bridge logs** (uvicorn output in the terminal where you started it):
```
# Look for these log lines:
# - "Sending audio to STT (N bytes)"
# - "STT transcript: ..."
# - "Agent request failed: ..."
```

**Common issues:**

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `ModuleNotFoundError: No module named 'g2_bridge'` | System uvicorn uses different Python | Use `python -m uvicorn` instead of `uvicorn` |
| App won't connect | Bridge not reachable from phone | Check IP, ensure same network, no firewall |
| "STT endpoint not configured" | G2_STT_API_URL not set | Set env var and restart bridge |
| STT returns empty | Audio format wrong or too quiet | Check WAV format (16kHz mono S16LE) |
| "Agent request failed" | Hermes URL/key wrong | Test Hermes endpoint with curl (Step 3) |
| No audio captured | EvenAppBridge not available | Must run inside Even Hub WebView, not regular browser |
| Recording doesn't stop | VAD threshold too low | Silence > 0.02 RMS for 1.5s triggers stop |
| STT model not found | Wrong model name for LiteLLM | Set `G2_STT_MODEL` to match your LiteLLM config |

---

## Test Results Template

- [ ] Bridge health check passes
- [ ] STT endpoint responds (HTTP 200)
- [ ] Hermes agent responds to text input
- [ ] Bridge text message pipeline works (curl test)
- [ ] Optional agent instructions applied when configured
- [ ] App loads on glasses via QR sideload
- [ ] App connects to bridge (settings configured)
- [ ] Session created successfully
- [ ] Text message sent and response displayed on glasses
- [ ] Voice recording starts on tap
- [ ] Voice recording stops (auto VAD or manual tap)
- [ ] WAV uploaded to bridge successfully
- [ ] STT transcript returned
- [ ] AI response returned and displayed on glasses
- [ ] Full voice loop: speak → transcript → response on glasses

## Notes

- The EvenAppBridge audio API only works inside the Even Realities app's WebView.
  Regular browsers will show "EvenAppBridge not available" in console.
- Bridge runs on port 8643 by default (configurable via G2_PORT).
- The app uses the phone's WebUI for settings; glasses show the chat display.
- STT model is configurable via `G2_STT_MODEL` (default: `whisper-1`).
  Set this to match your LiteLLM proxy's Whisper model name if different.
