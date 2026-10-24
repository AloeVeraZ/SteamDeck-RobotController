# Agent handoff

- Branch: `testing`. The last commit is listed by `git log --oneline -5`. Commits are local and nothing was pushed.
- Helpers used for checks:
  - Node is not on PATH. Use `ELECTRON_RUN_AS_NODE=1 .cache/runtime-win32-x64-44.8.0/electron.exe`.
  - Playwright for Electron probes: `C:/Users/angel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`.
  - Open a setup in the app with `--deck-sim-open=<file> --deck-sim-tab=plan` and `DECK_DATA_DIR=<temp>`, so saved setups are never touched.
- After editing `tools/simulation/java/**`, run `tools/simulation/build.cjs`.
- Real-library compile check: `tools/simulation/check-ftc-sdk.cjs` (needs network).

## Unfinished work and next steps

AGENT_BACKLOG.md is in priority order. The user asked for the lunala red auto to be optimized at the end (backlog item 10).
