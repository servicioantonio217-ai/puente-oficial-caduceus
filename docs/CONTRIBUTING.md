# Contributing to G2 Caduceus

Thanks for your interest! This guide covers everything you need to go from clone to your first passing merge request.

## Quick Start

```bash
# 1. Clone the repo
git clone git@gitlab.example.com:group/project.git
cd g2-caduceus

# 2. Bridge setup (Python ≥ 3.11)
cd bridge
pip install -e ".[dev]"
cd ..

# 3. App setup (Node.js ≥ 18)
cd app
npm install
cd ..

# 4. Verify everything works
cd bridge && pytest tests/ -v && cd ..
cd app && npx vitest run && cd ..
```

## Development Setup

### Bridge (Python)

**Prerequisites:** Python ≥ 3.11, pip

```bash
cd bridge
pip install -e ".[dev]"
```

This installs the `g2_bridge` package in editable mode plus dev tools: pytest, pytest-asyncio, ruff, mypy, and httpx.

Run the bridge locally:

```bash
cd bridge
G2_BRIDGE_TOKEN=your-token \
G2_AGENT_API_URL=http://localhost:8642/v1 \
G2_AGENT_API_KEY=your-agent-key \
  python -m uvicorn g2_bridge.main:app --host 0.0.0.0 --port 8000
```

> **Important:** Use `python -m uvicorn`, not bare `uvicorn`. This ensures the same Python interpreter that has `g2_bridge` installed runs the server.

Verify the bridge is running:

```bash
curl http://localhost:8000/health
```

### App (TypeScript)

**Prerequisites:** Node.js ≥ 18, npm

```bash
cd app
npm install
npm run dev     # Starts dev server at http://0.0.0.0:5173
```

The dev server binds to `0.0.0.0:5173` (all interfaces) so it's accessible from other devices on your network for sideloading to glasses.

> **Note:** The app only works inside the Even Hub WebView on G2 glasses. It does **not** function in regular browsers — use the Even Hub simulator for UI layout testing (see [Testing on Hardware](#testing-on-hardware)).

### Full-Stack Development

To work on both bridge and app simultaneously:

1. Start the bridge in one terminal (see above)
2. Start the app dev server in another terminal (`cd app && npm run dev`)
3. Configure the app to point at your bridge (via the settings screen on glasses or simulator)

## Running Tests

### Bridge Tests

```bash
cd bridge
pytest tests/ -v                    # Run all tests with verbose output
pytest tests/test_sessions.py       # Run a single test file
pytest tests/test_sessions.py::test_create_session  # Run a single test
pytest tests/ -k "auth"             # Run tests matching a keyword
```

Tests use **in-memory SQLite** — no database setup needed. The test suite includes 149+ tests covering all routers, services, and edge cases.

**Test patterns used in this project:**

- **ASGI transport testing** — tests use `httpx.AsyncClient` with `ASGITransport` against the real FastAPI app (no network calls). See `tests/conftest.py` for the `client` fixture.
- **pytest-asyncio** — all async tests are auto-discovered (`asyncio_mode = "auto"`). Just write `async def test_foo(client):`.
- **Auth headers** — most endpoints require `{"Authorization": "Bearer test-client-token"}` (see `conftest.py` for test settings).

### App Tests

```bash
cd app
npx vitest run                      # Run all tests
npx vitest run --reporter=verbose   # Verbose output
npx vitest run src/__tests__/logic.test.ts  # Single file
npx vitest --watch                  # Watch mode (re-runs on file changes)
```

Tests use **jsdom** environment. Some browser APIs (like `Blob.arrayBuffer()`) don't fully work in jsdom — tests mock these where needed.

## Linting and Formatting

### Bridge (Python)

```bash
cd bridge
ruff check src/ tests/              # Lint — check for errors
ruff check --fix src/ tests/        # Auto-fix lint issues
ruff format src/ tests/             # Format code
ruff format --check src/ tests/     # Verify formatting (used in CI)
mypy src/                           # Type check (strict mode)
```

**Ruff rules (strict):** E, F, I, N, UP, B, SIM, RUF — line length 100.

> **Important:** `ruff check --fix` and `ruff format` are separate operations. You must run both. `--fix` does NOT format code.

**mypy** runs in strict mode but CI allows it to fail (`allow_failure: true`). Fix type errors incrementally.

### App (TypeScript)

```bash
cd app
npx eslint src/ --max-warnings 0    # Lint — zero warnings policy
npx tsc --noEmit                     # Type check (strict mode)
npm run build                        # Verify production build succeeds
```

ESLint 9 flat config (`eslint.config.js`) with zero-warning policy. TypeScript strict mode enabled.

## CI Pipeline

Every push and merge request triggers the CI pipeline. Here's what your MR faces:

| Stage | Job | What it does |
|-------|-----|-------------|
| lint | `bridge:lint` | `ruff check` + `ruff format --check` |
| lint | `app:lint` | `eslint src/ --max-warnings 0` |
| typecheck | `bridge:typecheck` | `mypy src/` (allowed to fail) |
| typecheck | `app:typecheck` | `tsc --noEmit` |
| test | `bridge:test` | `pytest tests/ -v` |
| test | `app:test` | `vitest run --reporter=verbose` |
| build | `bridge:container` | Podman container build + push to registry |
| build | `app:build` | `npm run build` — artifacts: `app/dist/` |
| package | `app:package` | `evenhub pack` → `.ehpk` Even Hub package |
| release | `create:release` | Tag-triggered only — builds release notes + assets |

**Replicate CI locally before pushing:**

```bash
# Bridge — lint + format + typecheck + test
cd bridge
ruff check src/ tests/ && ruff format --check src/ tests/ && mypy src/ && pytest tests/ -v

# App — lint + typecheck + test + build
cd app
npx eslint src/ --max-warnings 0 && npx tsc --noEmit && npx vitest run && npm run build
```

## Testing on Hardware

To test on G2 glasses during development, use QR code sideloading with hot-reload. See [QR_SIDELOAD_WORKFLOW.md](./QR_SIDELOAD_WORKFLOW.md) for the full step-by-step guide.

For UI layout testing without hardware, use the Even Hub simulator:

```bash
npx @evenrealities/evenhub-simulator@latest http://localhost:5173
```

The simulator renders the app UI but does **not** support audio, touchpad, Bluetooth, or SDK bridge storage.

## Branch Naming and Commits

### Branch Naming

Use lowercase, hyphen-separated prefixes:

- `feat/<short-description>` — new features
- `fix/<short-description>` — bug fixes
- `docs/<short-description>` — documentation changes
- `refactor/<short-description>` — code restructuring

Examples: `feat/session-limit-auto-eviction`, `fix/dockerfile-module-not-found`, `docs/review-contributing-md`

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) style:

```
feat: add session auto-eviction when limit is reached
fix: prevent concurrent message race condition dropping first message
docs: review CONTRIBUTING.md against actual codebase
refactor: migrate to even-toolkit storage API
chore: update CI base images
```

**All code-related content must be in English** — issue descriptions, MR titles, commit messages, code comments, and documentation.

## Merge Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feat/my-feature
   ```

2. **Make your changes** with passing tests. Ensure CI is green:
   - Bridge: lint ✓, format ✓, tests ✓
   - App: lint ✓, typecheck ✓, tests ✓, build ✓

3. **Push your branch** and open a merge request targeting `main`.

4. **MR description** should include:
   - What changed and why
   - How to test the changes
   - Reference the issue: `Closes group/project#<iid>`

5. **After merge**, clean up:
   ```bash
   git checkout main && git pull
   git branch -d feat/my-feature         # Delete local branch
   git push origin --delete feat/my-feature  # Delete remote branch
   git fetch --prune origin              # Sync remote refs
   ```

## Project Conventions

These are project-specific conventions that aren't obvious from the code alone:

### General

- **Python:** Pinned to `≥ 3.11`
- **Language:** All code, documentation, commit messages, issue descriptions, and MR content must be in English.
- **License:** MIT — all contributions are under the same license.

### Bridge

- **G2_ prefix:** All bridge environment variables use the `G2_` prefix (e.g., `G2_BRIDGE_TOKEN`, `G2_AGENT_API_URL`). See `bridge/src/g2_bridge/config.py` for the full list.
- **App name:** The app is called "G2 Caduceus" in manifest and docs. The bridge package is `g2_bridge`.
- **Database:** SQLite via aiosqlite. Production path: `/data/g2_bridge.db`. Tests use in-memory SQLite (`:memory:`).
- **Container builds:** Uses Podman (not Docker). The `Dockerfile` uses a multi-stage build with `python:3.11-slim`.

### App

- **Framework:** React 19 + Vite + even-toolkit SDK + Tailwind CSS
- **even-toolkit imports:** Use `even-toolkit/<module>` (e.g., `even-toolkit/action-bar`), not `even-toolkit/glass-action-bar`.
- **Action bar in chat screen:** Use `actionBar: ' '` (space string), NOT `buildStaticActionBar()`. The space string is required to keep the chat screen visible.
- **Package format:** `.ehpk` (Even Hub package), built via `npx evenhub pack app.json dist -o caduceus.ehpk`.
- **Package ID:** `com.g2caduceus.app`

### Testing

- **Bridge tests:** Use `ASGITransport` with `httpx.AsyncClient` — no mocking of the FastAPI app. The `conftest.py` `client` fixture handles setup.
- **App tests:** Use `vi.fn()` and `vi.stubGlobal()` for mocking in jsdom. No component rendering tests currently (glass screen rendering requires the Even Hub simulator).

## Reporting Issues

Open an issue on the [GitLab issue tracker](https://gitlab.example.com/group/project/-/issues) with:

- Description of the issue or feature request
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Your environment (glasses firmware, phone OS, bridge version)

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full 3-tier design, component responsibilities, API contract, and data flows.
