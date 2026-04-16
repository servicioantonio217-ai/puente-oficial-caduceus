     1|# G2 Caduceus — Architecture
     2|
     3|## Overview
     4|
     5|Three-tier architecture connecting the Even Realities G2 smart glasses to AI agents via a bridge server.
     6|
     7|```
     8|G2 Glasses ──BT──► Phone (Even Hub App + WebUI) ──HTTP──► G2 Bridge Server ──HTTP──► AI Agent API
     9|```
    10|
    11|**Design principle:** Complexity decreases bottom-up. The server (24/7, always-on) handles the heavy lifting. The phone (battery-powered, resource-constrained) stays minimal.
    12|
    13|**Open source goal:** All components are designed to be universal and modular. No hard-coded provider dependencies. Users configure their own endpoints, API keys, and models.
    14|
    15|## Components
    16|
    17|### 1. AI Agent API (existing, pluggable)
    18|
    19|Any OpenAI Responses API-compatible endpoint. Tested with [Hermes Agent](https://github.com/nousresearch/hermes-agent).
    20|
    21|- OpenAI Responses API format
    22|- Stateful conversations via `conversation` parameter
    23|- Full tool access: terminal, file ops, web search, memory, skills
    24|- Streaming (SSE) with tool progress indicators
    25|- Bearer token auth
    26|
    27|This is NOT part of the G2 Caduceus project — it's an external dependency we consume.
    28|
    29|### 2. G2 Bridge Server
    30|
    31|A standalone Python application (FastAPI + uvicorn) deployed on the user's server.
    32|
    33|**Responsibilities:**
    34|- Authentication (client token, AI agent API key)
    35|- Session management (create, resume, list, delete, switch)
    36|- Conversation history persistence (SQLite)
    37|- STT processing (audio → configurable STT endpoint → text)
    38|- Request/response orchestration (client → AI agent → client)
    39|- Response adaptation for G2 display constraints (truncation / summarization)
    40|- AI agent API credential management
    41|
    42|**NOT responsible for:**
    43|- Display rendering (phone app's job via even-toolkit)
    44|- Audio recording (phone app's job via even-toolkit + EvenAppBridge)
    45|- User configuration UI on phone (phone app's WebUI job)
    46|
    47|**Deployment:**
    48|- Docker container or systemd service
    49|- Configurable via environment variables or config file
    50|- Single binary/tarball or Docker image
    51|
    52|**API Contract (between phone and bridge):**
    53|
    54|All endpoints use the client token for auth (`Authorization: Bearer ***
    55|
    56|```
    57|GET  /health                          — Health check
    58|POST /v1/sessions                     — Create new session (optionally name it)
    59|GET  /v1/sessions                     — List all sessions
    60|GET  /v1/sessions/{id}                — Get session details + history
    61|DELETE /v1/sessions/{id}              — Delete session
    62|POST /v1/sessions/{id}/message        — Send text message (streamed response)
    63|POST /v1/sessions/{id}/audio          — Send audio (WAV, returns transcript + response)
    64|POST /v1/sessions/{id}/resume         — Resume a paused session
    65|```
    66|
    67|**Response format (OpenAI Responses API compatible):**
    68|
    69|```json
    70|{
    71|  "id": "resp_abc123",
    72|  "status": "completed",
    73|  "conversation": "session-uuid",
    74|  "output": [
    75|    {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "..."}]}
    76|  ],
    77|  "usage": {"input_tokens": 50, "output_tokens": 200}
    78|}
    79|```
    80|
    81|**Streaming:** Same endpoints support `"stream": true` → SSE response.
    82|
    83|**STT Pipeline (bridge-side):**
    84|
    85|```
    86|Phone sends WAV → Bridge receives → POST to configurable STT endpoint → Transcript
    87|                                                                                   ↓
    88|Phone ← Response ← AI Agent API ← Transcript forwarded to AI Agent
    89|```
    90|
    91|- STT endpoint is user-configurable (default: OpenAI `/v1/audio/transcriptions`)
    92|- Works with any OpenAI-compatible STT provider (LiteLLM proxy, OpenAI, local Whisper, etc.)
    93|- Audio format: WAV (PCM 16kHz, mono, S16LE) — same format the G2 glasses produce
    94|- Whisper hallucination filtering built-in
    95|- Why bridge-side STT:
    96|  1. Single point of configuration — user sets STT endpoint/key once on server
    97|  2. API keys never leave the server (same as AI agent key)
    98|  3. Other clients (CLI, desktop) benefit automatically
    99|  4. Phone stays thin — only audio capture + VAD
   100|
   101|**Response Adaptation (bridge-side):**
   102|
   103|The bridge adapts AI agent responses for G2 display constraints (576×288px, ~400-500 chars per page).
   104|
   105|Configurable modes (per session or global):
   106|
   107|| Mode | Behavior | Cost | Latency |
   108||------|----------|------|---------|
   109|| `truncate` | Hard character limit, clean sentence boundary cutoff | None | None |
   110|| `summarize` | LLM call to condense response | Model-dependent | +1-3s |
   111|
   112|- Default: `truncate` (no extra cost, no extra latency)
   113|- `summarize` mode: user configures model and endpoint independently from the main AI agent
   114|- Alternatively: AI agent system prompt can request short responses (user's choice, outside bridge scope)
   115|
   116|**Storage:**
   117|- SQLite database for sessions, messages, and conversation state
   118|- Each session maps to an AI agent `conversation` parameter
   119|- Session metadata: name, created_at, updated_at, message_count, agent_conversation_id
   120|- Bridge is the source of truth for conversation history
   121|
   122|**Security — two-layer auth:**
   123|
   124|1. **Client → Bridge:** Bearer token (random-generated on bridge setup, user enters in WebUI)
   125|2. **Bridge → AI Agent:** Bearer token (configured in bridge env/config)
   126|3. **Bridge → STT:** API key (configured in bridge env/config)
   127|
   128|The bridge is the only component that knows any API keys. Phone never sees them.
   129|
   130|### 3. Phone — Even Hub App (WebUI + G2 Display)
   131|
   132|An Even Hub app running in the Even Realities App's WebView. Built with TypeScript + Vite, using [even-toolkit](https://github.com/fabioglimb/even-toolkit) for glasses display and navigation.
   133|
   134|**Dependencies:**
   135|- `@evenrealities/even_hub_sdk` — Official Even Hub SDK (bridge init, audio capture, events)
   136|- `even-toolkit` — Screen router, display builders, navigation helpers, chat display, icons, bridge wrapper
   137|
   138|**Responsibilities:**
   139|- Audio capture from G2 glasses (via even-toolkit + EvenAppBridge)
   140|- Voice Activity Detection (VAD) — detect when user stops speaking
   141|- PCM to WAV conversion and upload to bridge
   142|- Display rendering on G2 glasses (via even-toolkit screen router + display builders)
   143|- Touchpad input handling (via even-toolkit navigation helpers)
   144|- Session list browsing and switching
   145|- Configuration input (bridge address + token) via WebUI
   146|- Phone-side companion UI (settings, session browser) via even-toolkit web components
   147|
   148|**NOT responsible for:**
   149|- STT processing (delegated to bridge)
   150|- AI agent communication (delegated to bridge)
   151|- Persistent storage of conversations (delegated to bridge)
   152|
   153|**Key constraint:** EvenAppBridge is ONLY available inside the Even Realities App's WebView. The app MUST run there — not on the server, not in a regular browser.
   154|
   155|**Glasses Screens (per-screen architecture via even-toolkit):**
   156|
   157|| Screen | Content | Navigation |
   158||--------|---------|------------|
   159|| **Splash** | Disabled (no pixel spinner on G2) | N/A |
   160|| **Home** | List: New Session, Sessions | Scroll + Tap to select |
   161|| **Sessions** | Scrollable list of existing sessions | Scroll + Tap to open, Back to home |
   162|| **Chat** | Status header + AI conversation display | Scroll for history, Tap to record |
   163|
   164|Settings (bridge URL, token) are configured via the phone WebUI companion, not on glasses.
   165|
   166|**Chat display format (even-toolkit `buildChatDisplay`):**
   167|- `> ` prefix — user prompt
   168|- Normal text — assistant response
   169|- `>> ` prefix — tool call indicator
   170|- `! ` prefix — error
   171|- Scroll indicators (▲/▼) for multi-page content
   172|
   173|**Configuration (stored in SDK localStorage):**
   174|- Bridge server URL (e.g., `http://192.168.1.100:8643`)
   175|- Bridge client token (random-generated, user copies from bridge)
   176|- G2 display preferences (font size, theme)
   177|
   178|## Data Flow
   179|
   180|### Voice Input
   181|
   182|```
   183|1. User double-taps on G2 glasses to start recording
   184|2. App captures PCM audio via even-toolkit + EvenAppBridge.audioControl(true)
   185|3. VAD monitors audio levels, detects silence end
   186|4. App converts PCM → WAV, sends to Bridge: POST /v1/sessions/{id}/audio
   187|5. Bridge runs STT (configurable endpoint) → gets transcript
   188|6. Bridge sends transcript to AI Agent: POST /v1/responses
   189|7. AI Agent processes (tools, skills, etc.) → returns response
   190|8. Bridge adapts response (truncate/summarize) → returns to app
   191|9. App displays response on G2 via even-toolkit chat display builder
   192|```
   193|
   194|### Text Input (via WebUI or voice transcript)
   195|
   196|```
   197|1. User sends text (WebUI or after STT)
   198|2. App sends to Bridge: POST /v1/sessions/{id}/message
   199|3. Bridge forwards to AI Agent: POST /v1/responses
   200|4. Response flows back: AI Agent → Bridge → App → G2 display
   201|```
   202|
   203|### Session Management
   204|
   205|```
   206|1. App requests session list: GET /v1/sessions
   207|2. Bridge returns sessions from SQLite
   208|3. User selects/resumes session on G2 or WebUI
   209|4. App sends next message with session context
   210|5. Bridge maps session to AI Agent conversation parameter
   211|```
   212|
   213|## Authentication
   214|
   215|Two layers:
   216|
   217|1. **Client → Bridge:** Bearer token (random-generated on bridge setup, user enters in WebUI)
   218|2. **Bridge → AI Agent:** Bearer token (configured in bridge env/config)
   219|
   220|The bridge is the only component that knows the AI agent API key. Phone never sees it.
   221|
   222|## G2 Display Constraints
   223|
   224|- 576x288px per eye, 4-bit greyscale (16 green shades)
   225|- ~400-500 chars per page, scroll-based pagination
   226|- Max 4 image containers, 8 other containers per page
   227|- Exactly 1 container with `isEventCapture: 1`
   228|- No background fill, no CSS/DOM — container-based rendering via SDK
   229|- 10 text lines per screen (even-toolkit `G2_TEXT_LINES`)
   230|- 7 content slots below header (even-toolkit `DEFAULT_CONTENT_SLOTS`)
   231|
   232|The bridge MUST truncate/summarize responses before sending to the app. The app should NOT receive full-length AI agent responses.
   233|
   234|## Tech Stack
   235|
   236|| Component | Language | Framework | Runtime |
   237||-----------|----------|-----------|---------|
   238|| Bridge Server | Python | FastAPI + uvicorn + httpx + aiosqlite | Docker / systemd |
   239|| Even Hub App | TypeScript | Vite + even-toolkit + Even Hub SDK | WebView (Even Realities App) |
   240|| Storage | — | SQLite | On bridge server |
   241|| STT | — | Any OpenAI-compatible `/v1/audio/transcriptions` | User-configured |
   242|
   243|## Project Structure
   244|
   245|```
   246|g2-caduceus/
├── .gitlab-ci.yml               # CI pipeline (lint, typecheck, test, build)
├── .gitignore
├── LICENSE                      # MIT
├── README.md                    # Project overview + quickstart
├── docs/
│   ├── ARCHITECTURE.md          # This file
│   ├── CONTRIBUTING.md          # Dev setup, code style, PR process
│   ├── E2E_TEST_PLAN.md         # End-to-end testing guide
│   ├── PHASE5_TODO.md           # Phase 5 bug tracker
│   ├── QR_SIDELOAD_WORKFLOW.md  # QR sideload dev workflow
│   ├── ROADMAP.md               # Development roadmap
│   └── plans/                   # Planning documents
   256|├── bridge/                      # G2 Bridge Server (Python)
   257|│   ├── .gitignore
   258|│   ├── Dockerfile
   259|│   ├── pyproject.toml           # Dependencies (FastAPI, httpx, aiosqlite, etc.)
   260|│   ├── README.md                # Setup, configuration reference, env vars
   261|│   ├── src/
   262|│   │   └── g2_bridge/
   263|│   │       ├── __init__.py
   264|│   │       ├── main.py          # FastAPI app entry point
   265|│   │       ├── config.py        # Configuration (env vars)
   266|│   │       ├── auth.py          # Token authentication
   267|│   │       ├── database.py      # SQLite session/message storage
   268|│   │       ├── models.py        # SQLAlchemy/dataclass models
   269|│   │       ├── agent_client.py  # AI Agent Responses API client (OpenAI-compatible)
   270|│   │       ├── stt_client.py    # STT client (OpenAI-compatible /v1/audio/transcriptions)
   271|│   │       ├── response.py      # Response adaptation (truncate / summarize)
   272|│   │       └── routers/
   273|│   │           ├── __init__.py
   274|│   │           ├── health.py    # Health check endpoint
   275|│   │           ├── sessions.py  # Session CRUD
   276|│   │           ├── messages.py  # Text message endpoint
   277|│   │           └── audio.py     # Audio upload + STT endpoint
   278|│   └── tests/
   279|│       ├── conftest.py
   280|│       ├── test_agent_client.py
   281|│       ├── test_audio.py
   282|│       ├── test_audio_endpoint.py
   283|│       ├── test_auth.py
   284|│       ├── test_config_models.py
   285|│       ├── test_database.py
   286|│       ├── test_health.py
   287|│       ├── test_messages.py
   288|│       ├── test_response.py
   289|│       ├── test_response_edge_cases.py
   290|│       └── test_sessions.py
   291|└── app/                         # Even Hub App (TypeScript)
   292|    ├── .gitignore
   293|    ├── app.json                 # Even Hub manifest
   294|    ├── eslint.config.js
   295|    ├── index.html
   296|    ├── package.json             # even-toolkit + @evenrealities/even_hub_sdk
   297|    ├── README.md                # Sideload, Even Hub submission, troubleshooting
   298|    ├── tsconfig.json
   299|    ├── vite.config.ts
   300|    └── src/
   301|        ├── main.tsx             # Entry point (React root)
   302|        ├── App.tsx              # Routes + layouts
   303|        ├── app.css              # Global styles
   304|        ├── types.ts             # Domain types (Session, ChatMessage, etc.)
   305|        ├── api.ts               # Bridge API client (fetch wrapper)
   306|        ├── storage.ts           # Persistent settings (localStorage)
   307|        ├── vite-env.d.ts        # Vite type declarations
   308|        ├── contexts/
   309|        │   └── AppContext.tsx   # App state (sessions, chat, config)
   310|        ├── audio/
   311|        │   ├── index.ts         # Audio module exports
   312|        │   ├── recorder.ts      # VAD + PCM capture
   313|        │   └── even-bridge.ts   # EvenAppBridge wrapper
   314|        ├── glass/               # Glasses display layer (even-toolkit)
   315|        │   ├── shared.ts        # Snapshot + Actions types
   316|        │   ├── selectors.ts     # Screen router wiring
   317|        │   ├── splash.ts        # Splash screen (disabled)
   318|        │   ├── AppGlasses.tsx   # useGlasses hook integration
   319|        │   ├── ui-helpers.ts    # G2 display helpers
   320|        │   └── screens/
   321|        │       ├── home.ts      # Home menu (glasses)
   322|        │       ├── sessions.ts  # Session browser (glasses)
   323|        │       └── chat.ts      # Chat display (glasses)
   324|        ├── screens/             # Phone WebUI screens (React)
   325|        │   ├── ChatScreen.tsx   # Chat WebUI (phone)
   326|        │   ├── SessionsScreen.tsx # Session browser WebUI (phone)
   327|        │   └── Settings.tsx     # Settings WebUI (phone)
   328|        └── __tests__/
   329|            ├── api.test.ts
   330|            ├── audio.test.ts
   331|            ├── logic.test.ts
   332|            └── storage.test.ts
   333|```
   334|
   335|## Deployment
   336|
   337|### Bridge Server
   338|
   339|```bash
   340|# Option 1: Podman
   341|podman build -t g2-bridge ./bridge
   342|podman run -d \
   343|  -p 8643:8000 \
   344|  -e G2_AGENT_API_URL=http://localhost:8642/v1 \
   345|  -e G2_AGENT_API_KEY=*** \
   346|  -e G2_STT_API_URL=http://litellm:4000/v1/audio/transcriptions \
   347|  -e G2_STT_API_KEY=*** \
   348|  -e G2_BRIDGE_TOKEN=*** \
   349|  -v g2-data:/data \
   350|  g2-bridge
   351|
   352|# Option 2: systemd (native)
   353|pip install ./bridge
   354|g2-bridge --host 0.0.0.0 --port 8643
   355|```
   356|
   357|### Even Hub App
   358|
   359|```bash
   360|cd app
   361|npm install
   362|npm run dev        # Dev server (QR sideload)
   363|evenhub qr --url "http://192.168.x.x:5173"
   364|npm run pack       # Build .ehpk for Even Hub submission
   365|```
   366|
   367|## Decisions Log
   368|
   369|### Why a separate bridge server instead of direct phone → AI Agent API?
   370|
   371|1. **Separation of concerns:** Phone app stays thin (UI + audio capture). All logic on server.
   372|2. **Session management:** AI Agent's `/v1/responses` has a 100-response LRU limit. Bridge adds proper SQLite-backed session storage.
   373|3. **STT orchestration:** Audio processing on server, not in a phone WebView. Single point of config.
   374|4. **Response adaptation:** G2 display needs truncated/summarized responses. Bridge handles this centrally.
   375|5. **Extensibility:** Other clients (CLI, desktop, other wearables) can use the same bridge API.
   376|6. **Security:** API keys never leave the server. Phone only has the bridge token.
   377|
   378|### Why even-toolkit as a dependency?
   379|
   380|1. **Official design system:** Recommended by Even Realities, follows their 2025 UIUX Design Guidelines.
   381|2. **Screen router:** Per-screen architecture with co-located display + action logic. Eliminates manual `rebuildPageContainer` management.
   382|3. **Chat display builder:** Purpose-built for AI conversation output on G2 (prefixes, scroll, pagination).
   383|4. **Navigation helpers:** `moveHighlight`, `clampIndex`, `wrapIndex` — battle-tested by multiple published apps.
   384|5. **STT audio utilities:** PCM capture, VAD, WAV conversion — reuse for audio pipeline to bridge.
   385|6. **Web components:** 55+ React components for phone companion UI (settings, session browser).
   386|7. **Icons:** 191 pixel-art icons matching Even Realities design language.
   387|8. **Maintenance:** Active project (38+ commits, Apr 2026), MIT licensed, used by 5+ published apps.
   388|
   389|### Why STT on the bridge, not the phone?
   390|
   391|1. **Single config point:** User sets STT endpoint/key once on server, not on every client.
   392|2. **Key security:** STT API key stays on server (same as AI agent key).
   393|3. **Universal benefit:** CLI, desktop, future clients all get STT automatically.
   394|4. **Architecture consistency:** "Complexity decreases bottom-up." Server handles processing.
   395|5. **Minimal latency impact:** Phone → Bridge over LAN is <10ms. Bottleneck is the STT API call regardless of who initiates it.
   396|
   397|### Why OpenAI Responses API format for the bridge?
   398|
   399|1. **Standard:** Clients can use existing OpenAI SDKs.
   400|2. **Stateful:** Built-in conversation management via `conversation` parameter.
   401|3. **Streaming:** SSE support out of the box.
   402|4. **Tool visibility:** Responses API exposes tool calls for progress display.
   403|5. **Universal:** Works with Hermes, OpenAI, and any compatible endpoint.
   404|
   405|### Why no HTTPS in the bridge?
   406|
   407|1. **User responsibility:** Users with public-facing deployments add their own reverse proxy (Caddy, Nginx, Cloudflare Tunnel).
   408|2. **Simplicity:** Bridge runs on LAN by default. HTTPS adds complexity (certificates, renewal) with no benefit for local use.
   409|3. **Modularity:** TLS termination is a separate concern. Don't couple it to the application.
   410|
   411|### Why Python/FastAPI for the bridge?
   412|
   413|1. **AI agent ecosystem:** Hermes and most AI tools are Python. Same tooling, same deployment patterns.
   414|2. **Async:** FastAPI handles concurrent requests natively.
   415|3. **Lightweight:** Minimal resource footprint for a 24/7 service.
   416|4. **Universal:** Easy to containerize, widely understood, large library ecosystem.
   417|