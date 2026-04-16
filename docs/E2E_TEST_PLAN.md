     1|# G2 Caduceus — E2E Voice Loop Test Plan
     2|
     3|## Prerequisites
     4|
     5|### 1. Bridge Server
     6|
     7|**Install the bridge package first** (do NOT use system uvicorn — use the same Python):
     8|
     9|```bash
    10|cd /path/to/g2-caduceus/bridge
    11|pip install -e ".[dev]"
    12|```
    13|
    14|Then run with `python -m uvicorn`:
    15|
    16|```bash
    17|G2_BRIDGE_TOKEN=*** \
    18|G2_AGENT_API_URL=<agent-api-url> \
    19|G2_AGENT_API_KEY=*** \
    20|G2_STT_API_URL=<stt-api-url> \
    21|G2_STT_API_KEY=*** \
    22|G2_STT_MODEL=whisper-1 \
    23|G2_DATABASE_PATH=/tmp/g2_bridge_test.db \
    24|# Optional: customize agent behavior (leave empty to use agent's default prompt)
    25|# G2_AGENT_INSTRUCTIONS="You are the AI assistant for G2 smart glasses. Keep responses concise." \
    26|python -m uvicorn g2_bridge.main:app --host 0.0.0.0 --port 8643
    27|```
    28|
    29|> **Important:** Use `python -m uvicorn`, NOT `uvicorn` directly. System uvicorn
    30|> may use a different Python version and won't find the `g2_bridge` module.
    31|
    32|**Verify bridge is running:**
    33|```bash
    34|curl -s http://localhost:8643/health
    35|# Expected: {"status":"ok","version":"0.1.0"}
    36|```
    37|
    38|### 2. Verify STT works independently
    39|
    40|Generate a test WAV file (1 second of silence):
    41|```bash
    42|python3 -c "
    43|import wave
    44|with wave.open('/tmp/test_silence.wav', 'w') as w:
    45|    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    46|    w.writeframes(b'\x00\x00' * 16000)
    47|"
    48|```
    49|
    50|Test the STT endpoint:
    51|```bash
    52|curl -s -X POST "<stt-api-url>" \
    53|  -H "Authorization: Bearer *** \
    54|  -F "file=@/tmp/test_silence.wav" \
    55|  -F "model=whisper-1" \
    56|  -F "response_format=text"
    57|# Expected: transcript text (may be empty or hallucinated for silence)
    58|# HTTP 200 = endpoint works
    59|```
    60|
    61|### 3. Verify Hermes Agent works independently
    62|
    63|```bash
    64|curl -s -X POST "<agent-api-url>/responses" \
    65|  -H "Authorization: Bearer *** \
    66|  -H "Content-Type: application/json" \
    67|  -d '{"input":"Hello, say hi back in one sentence"}'
    68|# Expected: AI response JSON
    69|```
    70|
    71|---
    72|
    73|## Step-by-Step E2E Test
    74|
    75|### Step 1: Start the App Dev Server
    76|
    77|From the app directory:
    78|```bash
    79|cd /path/to/g2-caduceus/app
    80|npm install   # if not done yet
    81|npm run dev   # starts Vite dev server
    82|```
    83|
    84|Note the URL (e.g. `http://192.168.x.x:5173`)
    85|
    86|### Step 2: Sideload App onto Glasses
    87|
    88|Use the Even Hub app to QR-sideload:
    89|```
    90|evenhub qr --url "http://192.168.x.x:5173"
    91|```
    92|
    93|Or use the Even Realities app's built-in QR scanner.
    94|
    95|### Step 3: Configure Bridge Connection
    96|
    97|1. Open the app on your phone (Even Hub companion WebUI)
    98|2. Go to Settings screen in the phone app
    99|3. Enter Bridge URL: `http://<YOUR_HOST_IP>:8643`
   100|4. Enter Bridge Token: (whatever G2_BRIDGE_TOKEN you set)
   101|5. Save settings and tap Connect
   102|
   103|### Step 4: Create a Session
   104|
   105|```bash
   106|# Via curl
   107|curl -s -X POST "http://localhost:8643/v1/sessions" \
   108|  -H "Authorization: Bearer *** \
   109|  -H "Content-Type: application/json" \
   110|  -d '{"name":"E2E Test"}'
   111|# Note the session ID from the response
   112|```
   113|
   114|Or on glasses: Menu → New Session
   115|
   116|### Step 5: Test Text Input First
   117|
   118|Before testing voice, verify the text pipeline works:
   119|
   120|```bash
   121|# Replace SESSION_ID with the ID from Step 4
   122|curl -s -X POST "http://localhost:8643/v1/sessions/<SESSION_ID>/message" \
   123|  -H "Authorization: Bearer *** \
   124|  -H "Content-Type: application/json" \
   125|  -d '{"content":"Hello, respond with exactly one short sentence."}'
   126|```
   127|
   128|Expected: AI response JSON with truncated text.
   129|
   130|If this works, the Bridge → Hermes pipeline is confirmed working.
   131|
   132|### Step 5b: Test Optional Agent Instructions (optional)
   133|
   134|Verify that `G2_AGENT_INSTRUCTIONS` customizes agent behavior:
   135|
   136|```bash
   137|# Restart bridge with instructions set
   138|G2_AGENT_INSTRUCTIONS="Always respond in exactly 3 words, nothing else." \
   139|  python -m uvicorn g2_bridge.main:app --host 0.0.0.0 --port 8643
   140|
   141|# Send a message
   142|curl -s -X POST "http://localhost:8643/v1/sessions/<SESSION_ID>/message" \
   143|  -H "Authorization: Bearer *** \
   144|  -H "Content-Type: application/json" \
   145|  -d '{"content":"Tell me about the universe"}'
   146|```
   147|
   148|Expected: Agent responds in exactly 3 words (instructions are applied).
   149|Without `G2_AGENT_INSTRUCTIONS` set, the agent uses its default behavior.
   150|
   151|### Step 6: Test Voice Input
   152|
   153|1. On glasses: Open a chat session
   154|2. Tap to start recording — glasses should show "🎤 Listening..."
   155|3. Speak clearly (e.g. "What time is it?" or "Say hello")
   156|4. Wait for silence (VAD auto-stops after 1.5s of silence)
   157|5. Or tap again to stop manually
   158|
   159|**Expected flow:**
   160|1. Glasses show "Thinking..." (loading state)
   161|2. After 2-5 seconds, transcript + AI response appear on glasses
   162|3. Chat display shows both user transcript and assistant response
   163|
   164|### Step 7: Debug if Something Fails
   165|
   166|**Check bridge logs** (uvicorn output in the terminal where you started it):
   167|```
   168|# Look for these log lines:
   169|# - "Sending audio to STT (N bytes)"
   170|# - "STT transcript: ..."
   171|# - "Agent request failed: ..."
   172|```
   173|
   174|**Common issues:**
   175|
   176|| Symptom | Likely Cause | Fix |
   177||---------|-------------|-----|
   178|| `ModuleNotFoundError: No module named 'g2_bridge'` | System uvicorn uses different Python | Use `python -m uvicorn` instead of `uvicorn` |
   179|| App won't connect | Bridge not reachable from phone | Check IP, ensure same network, no firewall |
   180|| "STT endpoint not configured" | G2_STT_API_URL not set | Set env var and restart bridge |
   181|| STT returns empty | Audio format wrong or too quiet | Check WAV format (16kHz mono S16LE) |
   182|| "Agent request failed" | Hermes URL/key wrong | Test Hermes endpoint with curl (Step 3) |
   183|| No audio captured | EvenAppBridge not available | Must run inside Even Hub WebView, not regular browser |
   184|| Recording doesn't stop | VAD threshold too low | Silence > 0.02 RMS for 1.5s triggers stop |
   185|| STT model not found | Wrong model name for LiteLLM | Set `G2_STT_MODEL` to match your LiteLLM config |
   186|
   187|---
   188|
   189|## Test Results Template
   190|
   191|- [ ] Bridge health check passes
   192|- [ ] STT endpoint responds (HTTP 200)
   193|- [ ] Hermes agent responds to text input
   194|- [ ] Bridge text message pipeline works (curl test)
   195|- [ ] Optional agent instructions applied when configured
   196|- [ ] App loads on glasses via QR sideload
   197|- [ ] App connects to bridge (settings configured)
   198|- [ ] Session created successfully
   199|- [ ] Text message sent and response displayed on glasses
   200|- [ ] Voice recording starts on tap
   201|- [ ] Voice recording stops (auto VAD or manual tap)
   202|- [ ] WAV uploaded to bridge successfully
   203|- [ ] STT transcript returned
   204|- [ ] AI response returned and displayed on glasses
   205|- [ ] Full voice loop: speak → transcript → response on glasses
   206|
   207|## Notes
   208|
   209|- The EvenAppBridge audio API only works inside the Even Realities app's WebView.
   210|  Regular browsers will show "EvenAppBridge not available" in console.
   211|- Bridge runs on port 8643 by default (configurable via G2_PORT).
   212|- The app uses the phone's WebUI for settings; glasses show the chat display.
   213|- STT model is configurable via `G2_STT_MODEL` (default: `whisper-1`).
   214|  Set this to match your LiteLLM proxy's Whisper model name if different.
   215|