# Contributing

Thanks for your interest in G2 Caduceus!

## Development Setup

See the [project README](README.md#quick-start) for bridge and app setup instructions.

## Testing on Hardware

To test on G2 glasses during development, use QR code sideloading with hot-reload. See [QR_SIDELOAD_WORKFLOW.md](QR_SIDELOAD_WORKFLOW.md) for the full step-by-step guide, prerequisites, and troubleshooting.

For UI layout testing without hardware, use the Even Hub simulator:

```bash
npx @evenrealities/evenhub-simulator@latest http://localhost:5173
```

## Code Style

### Bridge (Python)

- **Formatter**: [ruff](https://docs.astral.sh/ruff/) — run `ruff format src/ tests/`
- **Linter**: `ruff check src/ tests/` — strict mode (E, F, I, N, UP, B, SIM, RUF)
- **Types**: `mypy src/` — strict mode (currently allow_failure in CI)
- **Python**: >=3.11

### App (TypeScript)

- **Linter**: ESLint 9 flat config — `npx eslint src/`
- **Types**: `npx tsc --noEmit` — strict mode
- **Formatter**: Prettier via ESLint integration
- **Framework**: React + Vite + even-toolkit

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes with passing tests
3. Ensure CI is green (lint, typecheck, test, build)
4. Open a merge request targeting `main`

## Reporting Issues

Open an issue on [GitLab](https://gitlab.pfandl.cloud/coding-agent/g2-caduceus/-/issues) with:

- Description of the issue or feature request
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Your environment (glasses firmware, phone OS, bridge version)

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full 3-tier design and component responsibilities.
