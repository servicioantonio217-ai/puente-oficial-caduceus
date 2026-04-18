     1|# Contributing
     2|
     3|Thanks for your interest in G2 Caduceus!
     4|
     5|## Development Setup
     6|
     7|See the [project README](../README.md#quick-start) for bridge and app setup instructions.
     8|
     9|## Testing on Hardware
    10|
    11|To test on G2 glasses during development, use QR code sideloading with hot-reload. See [QR_SIDELOAD_WORKFLOW.md](./QR_SIDELOAD_WORKFLOW.md) for the full step-by-step guide, prerequisites, and troubleshooting.
    12|
    13|For UI layout testing without hardware, use the Even Hub simulator:
    14|
    15|```bash
    16|npx @evenrealities/evenhub-simulator@latest http://localhost:5173
    17|```
    18|
    19|## Code Style
    20|
    21|### Bridge (Python)
    22|
    23|- **Formatter**: [ruff](https://docs.astral.sh/ruff/) — run `ruff format src/ tests/`
    24|- **Linter**: `ruff check src/ tests/` — strict mode (E, F, I, N, UP, B, SIM, RUF)
    25|- **Types**: `mypy src/` — strict mode (currently allow_failure in CI)
    26|- **Python**: >=3.11
    27|
    28|### App (TypeScript)
    29|
    30|- **Linter**: ESLint 9 flat config — `npx eslint src/`
    31|- **Types**: `npx tsc --noEmit` — strict mode
    32|- **Formatter**: Prettier via ESLint integration
    33|- **Framework**: React + Vite + even-toolkit
    34|
    35|## Pull Requests
    36|
    37|1. Create a feature branch from `main`
    38|2. Make your changes with passing tests
    39|3. Ensure CI is green (lint, typecheck, test, build)
    40|4. Open a merge request targeting `main`
    41|
    42|## Reporting Issues
    43|
    44|Open an issue on the project's GitLab issue tracker with:
    45|
    46|- Description of the issue or feature request
    47|- Steps to reproduce (for bugs)
    48|- Expected vs actual behavior
    49|- Your environment (glasses firmware, phone OS, bridge version)
    50|
    51|## Architecture
    52|
    53|See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full 3-tier design and component responsibilities.
    54|