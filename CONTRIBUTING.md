# Contributing

Thanks for your interest in G2 Caduceus!

## Development Setup

See the [project README](README.md#quick-start) for bridge and app setup instructions.

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
