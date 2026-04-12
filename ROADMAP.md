# G2 Caduceus — Roadmap

## Overview

Implementation plan for building G2 Caduceus from scratch. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical design.

Each phase is self-contained and testable independently.

---

## Phase 1: Bridge MVP (Text-only) ✅

> Goal: Working text-based chat via Bridge → AI Agent. Testable with curl.

- [x] Project scaffold (pyproject.toml, FastAPI app, config via env vars)
- [x] SQLite database setup (sessions + messages tables)
- [x] Token authentication (client token, agent API key)
- [x] Session CRUD endpoints (create, list, get, delete)
- [x] `POST /v1/sessions/{id}/message` — forward to AI Agent, return response
- [x] OpenAI Responses API compatible response format
- [x] Response truncation (hard character limit, clean sentence boundary)
- [x] Optional agent instructions (`G2_AGENT_INSTRUCTIONS` — custom system prompt)
- [x] Health endpoint (`GET /health`)
- [x] Dockerfile (Podman)
- [x] `.gitlab-ci.yml` — lint (ruff), type check (mypy), unit tests (pytest), Podman build
- [x] Basic README with setup instructions

**Milestone:** `curl`-testable text chat loop + green CI pipeline.

---

## Phase 2: App Scaffold (Text-only) ✅

> Goal: Even Hub app with text chat on G2 glasses via Bridge. No voice yet.

- [x] Project scaffold (Vite + TypeScript + even-toolkit + Even Hub SDK)
- [x] `app.json` manifest (permissions, metadata)
- [x] Screen router setup (even-toolkit `createGlassScreenRouter`)
- [x] Glasses screens: Splash → Home → Sessions → Chat (per-screen architecture)
- [x] Bridge API client (fetch wrapper, token auth)
- [x] Chat display (even-toolkit `buildChatDisplay` with prefixes)
- [x] Home screen (list: New Session, Sessions)
- [x] Sessions screen (scrollable list of existing sessions)
- [x] Settings screen (WebUI only — bridge URL + token input)
- [x] Navigation between screens (scroll, tap, back)
- [x] CI: extend `.gitlab-ci.yml` — lint (eslint), type check (tsc), build (vite)

**Milestone:** Text chat on G2 glasses + green CI pipeline. Type on phone WebUI → see response on glasses.

**Note:** Settings are WebUI-only (phone companion). No settings entry on glasses display.

---

## Phase 3: Voice Pipeline ✅

> Goal: Speak into glasses → transcript → AI response → display on glasses.

### Bridge (Server)

- [x] `POST /v1/sessions/{id}/audio` endpoint (receive WAV)
- [x] STT client: POST to configurable endpoint (`/v1/audio/transcriptions`)
- [x] Configurable STT endpoint + API key via env vars
- [x] Transcript → AI Agent → response pipeline
- [x] JSON response handling for STT providers (e.g. LiteLLM/Mistral returning JSON)

### App (Phone)

- [x] PCM audio capture via EvenAppBridge (`audio/even-bridge.ts`)
- [x] Voice Activity Detection (VAD) — detect silence end (`audio/recorder.ts`)
- [x] PCM to WAV conversion (Float32 → S16LE, 16kHz mono)
- [x] Recording toggle via `SELECT_HIGHLIGHTED` in chat screen
- [x] Upload WAV to bridge: `POST /v1/sessions/{id}/audio`
- [x] Display transcript + response on glasses after voice input
- [x] Full pipeline in AppContext (recording → WAV → bridge → transcript + response → messages)

### Integration

- [x] App wiring: chat.ts shows recording state, AppContext sends WAV to bridge

**Milestone:** Full voice loop. Speak → read response on glasses.

> **Note:** E2E voice loop testing on real hardware and Whisper hallucination filtering deferred to Phase 5 or post-release — both require physical G2 glasses and are not blocking for OSS readiness.

---

## Phase 4: Quality & OSS Readiness 🚧

> Goal: Clean, tested, publishable as open source.

### Glasses UI (per-screen architecture, even-toolkit)

- [x] Migrate to per-screen architecture (home, sessions, chat)
- [x] Home screen: scrollable list with "New Session" and "Sessions"
- [x] Sessions screen: scrollable session list
- [x] Chat screen: status header, 8 content lines, auto-scroll, no action bar
- [x] Splash screen: disabled (undefined, no pixel spinner)
- [x] Plain text status labels (Idle, Listening, Thinking, Offline)
- [x] Follow even-toolkit patterns: `display()` + `action()` per screen, `nav.screen` for transitions
- [ ] Error handling & reconnection (bridge offline, agent timeout, STT failure)
- [ ] Idle resilience (no freeze after 2 min, foreground/background lifecycle)

### Repo Hygiene

- [x] Root `.gitignore` (pycache, caches, IDE, env, db, node_modules)
- [x] Bridge `.gitignore`
- [x] App `.gitignore` (tsbuildinfo, vite.config.js/d.ts)

### Testing

- [ ] Bridge: increase coverage (edge cases, error paths, auth failures)
- [ ] App: audio module edge-case tests
- [ ] Integration smoke test (bridge + app against each other, CI-level)

### Features

- [ ] Session rename from WebUI
- [x] Session delete from WebUI (works, needs glasses confirmation UX)
- [ ] TTS for AI responses (phone/Bluetooth headset — G2 has no speaker)

### Documentation

- [x] Project README (quickstart, architecture overview)
- [x] Bridge README (setup, configuration reference, env vars)
- [x] App README (sideload, Even Hub submission, troubleshooting)
- [x] CONTRIBUTING.md (dev setup, code style, PR process)
- [ ] Update ARCHITECTURE.md (remove stale references)

### Infrastructure

- [x] Podman Compose example (bridge + STT proxy)
- [ ] App `.ehpk` build workflow (CI)
- [ ] QR sideload dev workflow documentation

### Legal

- [x] LICENSE (MIT)

**Milestone:** Ready for GitHub/GitLab public release + Even Hub submission.

---

## Current Status

- [x] Phase 1 — Bridge MVP
- [x] Phase 2 — App Scaffold
- [x] Phase 3 — Voice Pipeline (bridge + app wiring done, E2E hardware test pending)
- [ ] Phase 4 — Quality & OSS Readiness (docs, license, compose done; testing + infra pending)
