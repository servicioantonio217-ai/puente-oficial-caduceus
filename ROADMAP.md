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
- [x] Screens: Splash → Menu → Chat → Settings
- [x] Bridge API client (fetch wrapper, token auth)
- [x] Chat display (even-toolkit `buildChatDisplay` with prefixes)
- [x] Menu screen (list: New Session, Sessions, Settings)
- [x] Sessions screen (scrollable list of existing sessions)
- [x] Settings screen (bridge URL + token input, save to SDK localStorage)
- [x] Navigation between screens (scroll, tap, back)
- [x] Exit mechanism (double-tap → system confirmation)
- [x] CI: extend `.gitlab-ci.yml` — lint (eslint), type check (tsc), build (vite)

**Milestone:** Text chat on G2 glasses + green CI pipeline. Type on phone WebUI → see response on glasses.

**Note:** QR sideload dev workflow is a deployment concern (Phase 4), not a feature.

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
- [x] Recording toggle via `SELECT_HIGHLIGHTED` in chat screen (🎤 Listening... / 🔴 Tap to stop)
- [x] Upload WAV to bridge: `POST /v1/sessions/{id}/audio`
- [x] Display transcript + response on glasses after voice input
- [x] Full pipeline in AppContext (recording → WAV → bridge → transcript + response → messages)

### Integration

- [x] App wiring: chat.ts shows recording state, AppContext sends WAV to bridge
- [ ] E2E voice loop test: speak → see response on glasses (requires real hardware)
- [ ] Whisper hallucination filtering (low-priority — skip for MVP)

**Milestone:** Full voice loop. Speak → read response on glasses.

---

## Phase 4: Quality & OSS Readiness 🚧

> Goal: Clean, tested, publishable as open source.

### UI Redesign (branch: `feat/glasses-ui-redesign`)

- [x] Design system: split-panel layout, green (#97D077) accent, no box-drawing for menu items
- [x] Splash screen: bridge-connection-gated, pixel spinner, min 2s
- [x] Menu L0: persistent left panel, selected item with green border highlight
- [ ] Split-panel implementation (left menu ~160px + right content ~180px)
- [ ] Sessions screen: ListContainer with native scrolling, scroll bar when overflow
- [ ] Session list items: name + timestamp (default) OR first message preview (setting toggle)
- [ ] Chat screen: full-screen TextContainer, scrollable, last few messages
- [ ] Voice input always available in chat (not conditional on follow-up questions)
- [ ] Follow-up question buttons (max 3-5): TBD — depends on Responses API support
- [ ] Settings screen: split-panel, right side shows settings details
- [ ] New Session: opens chat in full screen

### Repo Hygiene

- [ ] Root `.gitignore` (node_modules, __pycache__, .mypy_cache, .pytest_cache, .ruff_cache, dist/)
- [ ] Remove tracked artifacts (node_modules, cache dirs) from git history
- [ ] Bridge `.gitignore` — verify completeness
- [ ] App `.gitignore` — verify completeness

### Testing

- [ ] Bridge: increase coverage (edge cases, error paths, auth failures)
- [ ] App: meaningful unit tests (replace trivial logic tests)
- [ ] App: audio module tests (VAD, PCM→WAV conversion, recorder state machine)
- [ ] Integration smoke test (bridge + app against each other, CI-level)

### Features

- [ ] Session rename from glasses UI
- [ ] Session delete from glasses UI
- [ ] Error handling & reconnection (bridge offline, agent timeout, STT failure)
- [ ] Idle resilience (no freeze after 2 min, foreground/background lifecycle)

### Documentation

- [ ] Project README (quickstart, architecture overview)
- [ ] Bridge README (setup, configuration reference, env vars)
- [ ] App README (sideload, Even Hub submission, troubleshooting)
- [ ] CONTRIBUTING.md (dev setup, code style, PR process)
- [ ] Update ARCHITECTURE.md (project structure, file paths)

### Infrastructure

- [ ] Podman Compose example (bridge + STT proxy)
- [ ] App `.ehpk` build workflow
- [ ] QR sideload dev workflow documentation

### Legal

- [ ] LICENSE (choose: MIT, Apache-2.0)

**Milestone:** Ready for GitHub/GitLab public release + Even Hub submission.

---

## Current Status

- [x] Phase 1 — Bridge MVP
- [x] Phase 2 — App Scaffold
- [x] Phase 3 — Voice Pipeline (bridge + app wiring done, E2E hardware test pending)
- [ ] Phase 4 — Quality & OSS Readiness (UI redesign in progress)
