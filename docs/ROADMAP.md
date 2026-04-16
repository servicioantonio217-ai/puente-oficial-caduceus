     1|# G2 Caduceus — Roadmap
     2|
     3|## Overview
     4|
     5|Implementation plan for building G2 Caduceus from scratch. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical design.
     6|
     7|Each phase is self-contained and testable independently.
     8|
     9|---
    10|
    11|## Phase 1: Bridge MVP (Text-only) ✅
    12|
    13|> Goal: Working text-based chat via Bridge → AI Agent. Testable with curl.
    14|
    15|- [x] Project scaffold (pyproject.toml, FastAPI app, config via env vars)
    16|- [x] SQLite database setup (sessions + messages tables)
    17|- [x] Token authentication (client token, agent API key)
    18|- [x] Session CRUD endpoints (create, list, get, delete)
    19|- [x] `POST /v1/sessions/{id}/message` — forward to AI Agent, return response
    20|- [x] OpenAI Responses API compatible response format
    21|- [x] Response truncation (hard character limit, clean sentence boundary)
    22|- [x] Optional agent instructions (`G2_AGENT_INSTRUCTIONS` — custom system prompt)
    23|- [x] Health endpoint (`GET /health`)
    24|- [x] Dockerfile (Podman)
    25|- [x] `.gitlab-ci.yml` — lint (ruff), type check (mypy), unit tests (pytest), Podman build
    26|- [x] Basic README with setup instructions
    27|
    28|**Milestone:** `curl`-testable text chat loop + green CI pipeline.
    29|
    30|---
    31|
    32|## Phase 2: App Scaffold (Text-only) ✅
    33|
    34|> Goal: Even Hub app with text chat on G2 glasses via Bridge. No voice yet.
    35|
    36|- [x] Project scaffold (Vite + TypeScript + even-toolkit + Even Hub SDK)
    37|- [x] `app.json` manifest (permissions, metadata)
    38|- [x] Screen router setup (even-toolkit `createGlassScreenRouter`)
    39|- [x] Glasses screens: Splash → Home → Sessions → Chat (per-screen architecture)
    40|- [x] Bridge API client (fetch wrapper, token auth)
    41|- [x] Chat display (even-toolkit `buildChatDisplay` with prefixes)
    42|- [x] Home screen (list: New Session, Sessions)
    43|- [x] Sessions screen (scrollable list of existing sessions)
    44|- [x] Settings screen (WebUI only — bridge URL + token input)
    45|- [x] Navigation between screens (scroll, tap, back)
    46|- [x] CI: extend `.gitlab-ci.yml` — lint (eslint), type check (tsc), build (vite)
    47|
    48|**Milestone:** Text chat on G2 glasses + green CI pipeline. Type on phone WebUI → see response on glasses.
    49|
    50|**Note:** Settings are WebUI-only (phone companion). No settings entry on glasses display.
    51|
    52|---
    53|
    54|## Phase 3: Voice Pipeline ✅
    55|
    56|> Goal: Speak into glasses → transcript → AI response → display on glasses.
    57|
    58|### Bridge (Server)
    59|
    60|- [x] `POST /v1/sessions/{id}/audio` endpoint (receive WAV)
    61|- [x] STT client: POST to configurable endpoint (`/v1/audio/transcriptions`)
    62|- [x] Configurable STT endpoint + API key via env vars
    63|- [x] Transcript → AI Agent → response pipeline
    64|- [x] JSON response handling for STT providers (e.g. LiteLLM/Mistral returning JSON)
    65|
    66|### App (Phone)
    67|
    68|- [x] PCM audio capture via EvenAppBridge (`audio/even-bridge.ts`)
    69|- [x] Voice Activity Detection (VAD) — detect silence end (`audio/recorder.ts`)
    70|- [x] PCM to WAV conversion (Float32 → S16LE, 16kHz mono)
    71|- [x] Recording toggle via `SELECT_HIGHLIGHTED` in chat screen
    72|- [x] Upload WAV to bridge: `POST /v1/sessions/{id}/audio`
    73|- [x] Display transcript + response on glasses after voice input
    74|- [x] Full pipeline in AppContext (recording → WAV → bridge → transcript + response → messages)
    75|
    76|### Integration
    77|
    78|- [x] App wiring: chat.ts shows recording state, AppContext sends WAV to bridge
    79|
    80|**Milestone:** Full voice loop. Speak → read response on glasses.
    81|
    82|> **Note:** E2E voice loop testing on real hardware and Whisper hallucination filtering deferred to Phase 5 or post-release — both require physical G2 glasses and are not blocking for OSS readiness.
    83|
    84|---
    85|
    86|## Phase 4: Quality & OSS Readiness 🚧
    87|
    88|> Goal: Clean, tested, publishable as open source.
    89|
    90|### Glasses UI (per-screen architecture, even-toolkit)
    91|
    92|- [x] Migrate to per-screen architecture (home, sessions, chat)
    93|- [x] Home screen: scrollable list with "New Session" and "Sessions"
    94|- [x] Sessions screen: scrollable session list
    95|- [x] Chat screen: status header, 8 content lines, auto-scroll, no action bar
    96|- [x] Splash screen: disabled (undefined, no pixel spinner)
    97|- [x] Plain text status labels (Idle, Listening, Thinking, Offline)
    98|- [x] Follow even-toolkit patterns: `display()` + `action()` per screen, `nav.screen` for transitions
    99|- [x] Error handling & reconnection (bridge offline, agent timeout, STT failure)
   100|- [x] Idle resilience (no freeze after 2 min, foreground/background lifecycle)
   101|
   102|### Repo Hygiene
   103|
   104|- [x] Root `.gitignore` (pycache, caches, IDE, env, db, node_modules)
   105|- [x] Bridge `.gitignore`
   106|- [x] App `.gitignore` (tsbuildinfo, vite.config.js/d.ts)
   107|
   108|### Testing
   109|
   110|- [x] Bridge: increase coverage (edge cases, error paths, auth failures — 108 tests)
   111|- [x] App: audio module edge-case tests (350 LOC audio.test.ts)
   112|- [x] Integration smoke test (15 tests — full API flow, auth, error paths, CORS, audio, truncation)
   113|
   114|### Features
   115|
   116|- [x] Session rename from WebUI
   117|- [x] Session delete from WebUI (works, needs glasses confirmation UX)
   118|- ~~TTS for AI responses~~ — **Intentionally not implemented.** The G2 has no speaker. Audio output to phone/Bluetooth headset was evaluated and explicitly rejected — it adds complexity without being the core use case (voice input, visual output). This decision is final and will not be revisited.
   119|
   120|### Documentation
   121|
   122|- [x] Project README (quickstart, architecture overview)
   123|- [x] Bridge README (setup, configuration reference, env vars)
   124|- [x] App README (sideload, Even Hub submission, troubleshooting)
   125|- [x] CONTRIBUTING.md (dev setup, code style, PR process)
   126|- [x] Update ARCHITECTURE.md (fix stale project structure — `stt_client.py` not `stt.py`, remove `webui.ts`, update file tree)
   127|
   128|### Infrastructure
   129|
   130|- [x] Podman Compose example (bridge + STT proxy)
   131|- [x] App `.ehpk` build workflow (CI)
   132|- [x] QR sideload dev workflow documentation
   133|
   134|### Legal
   135|
   136|- [x] LICENSE (MIT)
   137|
   138|**Milestone:** Ready for GitHub/GitLab public release + Even Hub submission.
   139|
   140|---
   141|
   142|## Current Status
   143|
   144|- [x] Phase 1 — Bridge MVP
   145|- [x] Phase 2 — App Scaffold
   146|- [x] Phase 3 — Voice Pipeline (bridge + app wiring done, E2E hardware test pending)
   147|- [x] Phase 4 — Quality & OSS Readiness (all items complete; TTS intentionally not implemented — see Phase 4 Notes)
   148|