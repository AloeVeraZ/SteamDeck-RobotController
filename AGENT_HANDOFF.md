# Agent handoff

- Branch: `testing`. Commits are local only and nothing was pushed. `git log --oneline 4c1c039..HEAD` lists this session's work.
- Node is not on PATH. Use `ELECTRON_RUN_AS_NODE=1 .cache/runtime-win32-x64-44.8.0/electron.exe` for tests, `deck-sim`, `build.cjs` and checks.
  - Its Node 24 strips TypeScript types, which is how the Pedro Visualizer's own `.ts` modules were run against Deck's `.pp` output.
- Playwright for probes and the E2E: `C:/Users/angel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`.
  - Run the E2E with `DECK_PLAYWRIGHT=<that path> DECK_ELECTRON=<repo>/.cache/runtime-win32-x64-44.8.0/electron.exe`, then `tests/simulation-ui.cjs` (about 18 minutes).
  - All 16 sections pass.
  - Open a setup in the app with `--deck-sim-open=<file> --deck-sim-tab=plan` and a temporary `DECK_DATA_DIR`, so the user's saved setups are never touched.
- After editing `tools/simulation/java/**`, run `tools/simulation/build.cjs` (about 10 s).
- Real-library compile check: `tools/simulation/check-ftc-sdk.cjs` (needs network; downloads FTC SDK 12.0.0 and Pedro 3.0.2, then deletes them).
- Pedro runtime tests need `tools/simulation/fetch-pedro.cjs` first; it caches into `.cache/pedro/3.0.2`.
- After changing a code generator, regenerate the example exports:
  - `deck-sim export examples/<x>.json --format onbot|pp|pedro --out ...`
  - The output paths match the files already in `examples/`.
- Bash tool quirk: `\\` inside heredocs collapses to `\`. Write edit scripts with the Write tool.
  - The Edit tool and JSON tool arguments can also turn `\u002a` into `*`, so describe unicode escapes in words.
- `output/` (PDF reports and an AdvantageScope `.wpilog` from 21–23 October) predates this session and is untracked. It was left alone.
  - Its `.wpilog` is a handy real file: `deck-sim compare examples/biobuzz-red-auto.json output/advantagescope/biobuzz-red-auto.wpilog`.

## Coordinates (worth knowing before touching .pp or Pedro code)

- **Deck's game fields** are a 144 in square with the perimeter wall inside it: BIOBUZZ's playing area runs from 1.326 to 142.674 (`info.bounds`).
  - This matches Pedro's documented frame (FTC field-centre frame plus 72), so the Pedro Java export uses Deck coordinates as they are.
- **The Pedro Visualizer** draws a 141.5 in field starting at the inner wall.
  - `.pp` files for game fields are therefore shifted by the wall and record it as `deckOrigin`.
  - `fromPP` adds it back. A Visualizer file without `deckOrigin` gets the wall offset on game fields.
- **The Visualizer's own code is the oracle for `.pp` behaviour.** Its `.ts` modules (cloned at commit f953ee0) ran under the Electron Node with type stripping. Re-clone it and copy `utils/normalize.ts`, `pathTraversal.ts`, `headingInterpolation.ts`, `animation.ts` and their imports, with `.ts` added to the import specifiers.

## The user's request: optimize "lunala red auto"

Done and committed (`examples/lunala-red-auto.json` plus exports in `examples/lunala-red-auto/`).

| Runtime | Before | After |
|---|---|---|
| Simulator follower | 9.98 s | 9.77 s |
| OnBot Java | 10.22 s | 9.83 s |
| Pedro export | 10.25 s | 10.0 s |

- Scoring is unchanged: 40 points, 12/12 shots.
- The user's own saved setup inside the app was not modified. They can open the optimized one with `deck-sim show examples/lunala-red-auto.json --tab plan`, which adds it as a new saved setup.

## Next steps

AGENT_BACKLOG.md is in priority order.
