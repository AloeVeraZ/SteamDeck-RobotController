# UX improvement log: Simulation (Setup → Path planning → Run & review)

All work is local and uncommitted on `testing`, per the user's request. I verified it in the real Electron app (Playwright driving `electron.exe` with the BIOBUZZ red example route `examples/biobuzz-red-auto.json` and a fresh project) and with unit tests. The browser preview cannot run physics ("Preview only"), so it was used only for layout.

## Baseline (before changes)

- Unit suite: 261/262 pass. `24 barriers and many pins plan quickly` already failed on a time budget (about 7 s against 5 s), including when run alone.
- `tests/simulation-ui.cjs` (Electron E2E) already fails on the current working tree. Its first check expects the Settings touch-keyboard default to be on. With that check skipped, it stops at `#sim-appearance`, which another session put inside a `<div hidden>`. Neither is related to this work. The E2E suite needs updating to match the current Setup layout.

## Iteration 1: Run & review answers "did it work?"

**Problems seen in the real app (BIOBUZZ red auto):**
- Three unexplained times: the status said "Finished in 10.53 s", Run analysis said "Run time 14.6 s" (it was really time recorded so far and kept growing), and the clock read 0:16.
- Diagnostics reported "1 contact event" while the status said "No zones touched". The count included the robot starting flush against the wall.
- Nothing said where time was lost or what to change, and nothing linked back to the path.
- Run analysis duplicated the Summary block below it.

**Changes:**
- New `ui/sim-report.js`, a pure report builder plus renderer, unit-tested in `tests/sim-report.test.cjs`. From the recorded frames it shows:
  - A verdict.
  - Route time against the autonomous period.
  - End-point error and sensor-estimate drift.
  - Contacts with wall, structure or no-go zones that began after leaving the start pose, tied to the path where each happened.
  - Points.
  - A per-path time bar split into driving, turning in place, stopped for an action or pause, and stopped idle. Clicking a path replays its start.
  - Up to three data-grounded next steps with **Edit path N** buttons.
  - A note that results are simulated estimates.
- The report replaces the duplicate "Run analysis" box. The Summary row "Run time" is renamed "Time recorded".
- Diagnostics' contact count uses the report's start-aware count. "Currently touching" a wall only applies while a route is moving.
- `DeckSimData.create()` gains `seek(seconds)`.

**Found while verifying:** The app's CSP (`style-src 'self'`) ignores `style` attributes, so the bar widths are set through the CSSOM. Time spent standing still to shoot was first reported as "stopped, nothing running"; mechanism commands now count as action time.

**Result on the example route:** "Route finished cleanly in 10.5 s · 19.5 s to spare". Path 6 is the longest leg at 3.0 s, and the robot stands still for 3.7 s of actions (mostly shooting at the ends of paths 1 and 5). The suggestion to run actions while driving points at a feature the app already has (action paths).

## Iteration 2: Path planning shows time and makes Optimize findable

- After edits settle, the planned route is test-driven in the background with the same `evaluate` call Optimize uses (about 1.1 s; it returned exactly the Run time, 10.53 s). The status line shows "Route checks passed · about 10.5 s in simulation", flagged if it is over the autonomous period or the test drive touched something or missed the end point. It waits while a route is being driven, but runs once the route has finished even if the practice clock is still counting.
- Optimize gets a plain-language explanation. Saved Optimize rows are labelled "Last Optimize test drives:", because example files can hold stale results (13.33 s next to a current 10.5 s). The run report suggests Optimize when it has not been run.
- Run & review with no route now says "No route yet…" and shows **Go to Path planning**. Before, Run failed with "Set a starting pose and add route pins first."
- Start pose fields show 2 decimals (`10.11` instead of `10.105999999999993`).

## Iteration 3: Setup honesty

- The "Physical game elements" hint said mechanisms and scoring were not included, which is false: with elements on, step 3's mechanisms pick up and score. It now says what the checkbox does (balls on or off).
- The Custom robot specs start with a **Measure your robot** note. Numbers the CAD did not fill in are an example robot, and simulated speed, timing and collisions come from them.

## Iteration 4: One vocabulary for paths

- The Diagnostics legend described "Yellow / White" markers, but light theme draws them brown and black. It now says "Numbered markers on the field are path end points: red has a clearance or path issue, amber pauses or runs an action, plain only drives."
- UI copy now says path and end point instead of pin: the left run status ("from the last path’s end point"), the "Paused at end of path" telemetry row, the planning banner ("Path 3" instead of "Pin 3", matching the **Edit path N** buttons), the Diagnostics empty states, the plan-error status, and **Clear all paths**. Element ids, Java telemetry and export text are unchanged; tests match those.

## Verification

- Unit tests: 265 tests, 264 pass. The one failure is the pre-existing planner time-budget test.
- `tests/sim-report.test.cjs`: 3/3 pass. It covers per-path splits, ignoring start-pose wall contact, attributing a contact to its path, the time-limit verdict, and unlinked legs when leg and path counts differ.
- Electron probe after iteration 4: same 10.53 s result, new wording in status, Diagnostics and banner, no page errors.
- Electron probes: run report content and layout in light and dark; Edit path jumps to Path planning with that path selected; bar click replays at 3.02 s; planning estimate appears on load and after an edit, including right after a run; no-route guidance and the Go to Path planning button; robot-step note.

## Self-evaluation (0–5, evidence above)

| Category | Before | Now | Notes |
|---|---|---|---|
| Beginner friendliness | 3.0 | 3.8 | Run & review now explains results. Path list editing is still dense. |
| Navigation clarity | 3.5 | 4.0 | Report and no-route links go back to the exact path or step. |
| Visual quality | 3.5 | 3.8 | Report uses the existing tokens. Left column and right panel still repeat telemetry. |
| Workflow efficiency | 3.0 | 3.8 | Time estimate without pressing Run. Edit-path jump. |
| Learnability | 3.0 | 3.6 | Next steps teach cause and effect. Path-modifier legend is still terse. |
| Error prevention | 3.0 | 3.6 | False contact warning removed. Over-time flagged before running. |
| Technical functionality | 5.0 | 5.0 | No engine, planner, export or file-format change. All capabilities kept. |
| Simulation integrity | 4.5 | 5.0 | Every reported number comes from recorded frames or the same physics test drive. Estimates are labelled. |

The 4.5 targets for beginner categories are not yet met. The next iteration is below.

## Next iteration prompt

**Current state:** Run report, planning time estimate, Optimize discoverability, no-route guidance and Setup honesty fixes are in and verified as above.

**Remaining problems:**
1. The path list's colored dots are explained only in the Help tab.
2. Run & review's left column and the Data panel repeat telemetry, and the Play/Stop/Reset row sits beside Run with no explanation of the difference.
3. The E2E suite `tests/simulation-ui.cjs` is broken by earlier Setup changes, so there is no automated end-to-end guard.
4. Planner perf test over budget (pre-existing).

**Constraints:** Keep planner, engine, follower, export formats and saved-project shape unchanged. Keep `#sim-run-status` text (tests match "Finished in … No zones touched").

**Next objective:** Repair `tests/simulation-ui.cjs` for the current Setup layout (hidden `#sim-appearance`, touch-keyboard default) so the whole beginner flow has an end-to-end guard. Then remove the telemetry repeated between Run & review's left column and the Data panel, and explain Play/Pause vs Run.

**Files:** `ui/simulation.js` (pinPanel, refreshDiagnostics, run status), `ui/sim-workspace.css`.

**Acceptance:** Electron probe of the example route shows consistent wording in Paths, Diagnostics, Run status and the report. Unit suite unchanged. E2E selectors untouched.
