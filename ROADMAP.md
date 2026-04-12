# G2 Caduceus — Roadmap

## Overview

Implementation plan for building G2 Caduceus from scratch. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical design.

Each phase is self-contained and testable independently.

---

## Phase 1: Bridge MVP (Text-only)

> Goal: Working text-based chat via Bridge → AI Agent. Testable with curl.

- [ ] Project scaffold (pyproject.toml, FastAPI app, config via env vars)
- [ ] SQLite database setup (sessions + messages tables)
- [ ] Token authentication (client token, agent API key)
- [ ] Session CRUD endpoints (create, list, get, delete)
- [ ] `POST /v1/sessions/{id}/message` — forward to AI Agent, return response
- [ ] OpenAI Responses API compatible response format
- [ ] Response truncation (hard character limit, clean sentence boundary)
- [ ] Health endpoint (`GET /health`)
- [ ] Dockerfile
- [ ] `.gitlab-ci.yml` — lint (ruff), type check (mypy), unit tests (pytest), Docker build
- [ ] Basic README with setup instructions

**Milestone:** `curl`-testable text chat loop + green CI pipeline.

---

## Phase 2: App Scaffold (Text-only)

> Goal: Even Hub app with text chat on G2 glasses via Bridge. No voice yet.

- [ ] Project scaffold (Vite + TypeScript + even-toolkit + Even Hub SDK)
- [ ] `app.json` manifest (permissions, metadata)
- [ ] Screen router setup (even-toolkit `createGlassScreenRouter`)
- [ ] Screens: Splash → Menu → Chat → Settings
- [ ] Bridge API client (fetch wrapper, token auth, SSE streaming)
- [ ] Chat display (even-toolkit `buildChatDisplay` with prefixes)
- [ ] Menu screen (list: New Session, Sessions, Settings)
- [ ] Sessions screen (scrollable list of existing sessions)
- [ ] Settings screen (bridge URL + token input, save to SDK localStorage)
- [ ] Navigation between screens (scroll, tap, back)
- [ ] Exit mechanism (double-tap → system confirmation)
- [ ] QR sideload dev workflow
- [ ] CI: extend `.gitlab-ci.yml` — lint (eslint), type check (tsc), build (vite)

**Milestone:** Text chat on G2 glasses + green CI pipeline. Type on phone WebUI → see response on glasses.

---

## Phase 3: Voice Pipeline

> Goal: Speak into glasses → transcript → AI response → display on glasses.

### Phone (App)
- [ ] PCM audio capture from G2 glasses (even-toolkit + EvenAppBridge)
- [ ] Voice Activity Detection (VAD) — detect silence end
- [ ] PCM to WAV conversion (even-toolkit audio utils)
- [ ] Recording screen ("Listening..." indicator on glasses)
- [ ] Double-tap to start/stop recording
- [ ] Auto-stop on VAD silence
- [ ] Upload WAV to bridge: `POST /v1/sessions/{id}/audio`
- [ ] Display transcript + response on glasses

### Bridge (Server)
- [ ] `POST /v1/sessions/{id}/audio` endpoint (receive WAV)
- [ ] STT client: POST to configurable endpoint (`/v1/audio/transcriptions`)
- [ ] Whisper hallucination filtering
- [ ] Transcript → AI Agent → response pipeline
- [ ] Configurable STT endpoint + API key via env vars

**Milestone:** Full voice loop. Speak → read response on glasses.

---

## Phase 4: Polish & OSS Readiness

> Goal: Production-quality, publishable as open source.

### Features
- [ ] Response summarization mode (configurable LLM endpoint)
- [ ] Phone companion WebUI (even-toolkit web components for settings)
- [ ] Session resume (reconnect to existing AI agent conversation)
- [ ] Session rename / delete from glasses UI
- [ ] Error handling & reconnection (bridge offline, agent timeout, STT failure)
- [ ] Idle resilience (no freeze after 2 min, foreground/background lifecycle)
- [ ] Disconnect recovery (re-render on reconnect)

### Documentation
- [ ] Project README (quickstart, architecture overview, screenshots)
- [ ] Bridge README (setup, configuration reference, env vars)
- [ ] App README (sideload, Even Hub submission, troubleshooting)
- [ ] CONTRIBUTING.md (dev setup, code style, PR process)
- [ ] LICENSE

### Infrastructure
- [ ] `.gitignore` (both bridge/ and app/)
- [ ] Bridge Podman Compose example
- [ ] App `.ehpk` build workflow
- [ ] CI: final pipeline — bridge lint/test/build + app lint/build + integration smoke test

**Milestone:** Ready for GitHub/GitLab public release + Even Hub submission.

---

## Current Status

- [x] Architecture document finalized
- [ ] Phase 1 — Bridge MVP
- [ ] Phase 2 — App Scaffold
- [ ] Phase 3 — Voice Pipeline
- [ ] Phase 4 — Polish & OSS Readiness
