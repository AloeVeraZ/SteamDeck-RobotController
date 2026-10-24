# Agent handoff

- Branch: `testing`. Commits are local only and nothing was pushed. `git log --oneline -15` lists this session's work, which starts after `4c1c039`.
- Node is not on PATH. Use `ELECTRON_RUN_AS_NODE=1 .cache/runtime-win32-x64-44.8.0/electron.exe` for tests, `deck-sim`, `build.cjs` and checks.
- Playwright for probes and the E2E: `C:/Users/angel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`.
  - Run the E2E with `DECK_PLAYWRIGHT=<that path> DECK_ELECTRON=<repo>/.cache/runtime-win32-x64-44.8.0/electron.exe`, then `tests/simulation-ui.cjs` (about 18 minutes).
  - Open a setup in the app with `--deck-sim-open=<file> --deck-sim-tab=plan` and a temporary `DECK_DATA_DIR`, so the user's saved setups are never touched.
- After editing `tools/simulation/java/**`, run `tools/simulation/build.cjs` (about 10 s).
- Real-library compile check: `tools/simulation/check-ftc-sdk.cjs` (needs network; downloads FTC SDK 12.0.0 and Pedro 3.0.2).
- Pedro runtime tests need `tools/simulation/fetch-pedro.cjs` first; it caches into `.cache/pedro/3.0.2`.
- Bash tool quirk: `\\` inside heredocs collapses to `\`. Write edit scripts with the Write tool.

## The user's request: optimize "lunala red auto"

Done and committed (`examples/lunala-red-auto.json` plus exports in `examples/lunala-red-auto/`).

- 9.98 s → 9.77 s with the simulator follower, 10.22 s → 9.83 s as OnBot Java, 10.25 s → 10.0 s as the Pedro export. Scoring is unchanged: 40 points, 12/12 shots.
- The user's own saved setup inside the app was not modified. They can open the optimized one with `deck-sim show examples/lunala-red-auto.json --tab plan`, which adds it as a new saved setup.

## Next steps

AGENT_BACKLOG.md is in priority order.
