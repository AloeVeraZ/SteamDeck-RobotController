# Package detection-e2e: report

## What was wrong (checked end to end before fixing)
Fixture robot (1 intake with rollers and a ramp on a servo hub, 2 turrets each with turntable + flywheel + concentric hood)
run through the real pipeline: STEP-shaped meshes → `merge/tree/groups/names` → `partRole` → `DeckRobotModel.meta/partBoxes`
→ `Mech.fromCad/adoptCad` → `DeckJointsPanel.discover` (sim-joints, no worker → `DeckDiscovery.discover`) → status line and list.

On HEAD (ef563b0), Configure from CAD did set up 2 turret shooters, but **Find again found 2 turrets with no flywheel and no
hood** for every style where a turret assembly holds its own shooter ("Turret <1>", "Left Turret Assembly", "Turret 1" in
"Shooter", Fusion "Turret v7:1"). Cause: discovery puts every leaf of a turret-only assembly in the turntable pool, never in
the shooter's own parts, so the flywheel/hood search saw nothing. Other faults found on the way:
- `groups().inner` listed only sub-assembly nodes. The STEP reader often files parts straight into the assembly's node
  (checked on the occt test files: `rod-assembly` → meshes "nut","rod"), so "Flywheel"/"Hood"/"Roller" were invisible to
  `partRole`: "(no flywheel is named in it…)", and an intake holding "Kicker" + mesh-only rollers became a kicker.
- `partRole`: any "kicker" inside an intake made it a kicker even with rollers (BIOBUZZ: rollers + folding ramp = ramp);
  `carries` listed hardware ("Flywheel shaft").
- `mechanismsIn` split an intake's "Intake roller top/bottom" into two intakes (holder dropped → ramp hinge lost) and a
  shooter's "Top/Bottom flywheel" into two shooters. A "Turret" assembly split into "Pollen shooter"/"Nectar shooter"
  lost its turret (holder excluded → both became fixed shooters).
- Turret joint carried the plate it is bolted to (for "Shooter L <1>" style assemblies).
- adoptCad matched text "Shooter 1 → “Turret” | Shooter 2 → “Turret”" (instance numbers stripped from copies).
- Find again's status said only "12 moving parts … Check each one" — nothing about which CAD parts are which.
- Side bug confirmed: `tree()` had `/s*<d+>$/` (no backslashes). Fixed to `/\s*<\d+>$/`.

## What I changed
- `src/sim-model.cjs`: tree regex fix; `groups().inner` now includes part (mesh) names filed straight into an assembly
  (not repeated when the node is that part's own instance: "<1>", "-1", " v1:1", ":1"); split rules keep a shooter's/turret's
  flywheel/hood copies and an intake's roller copies together ("Shooters" plural still splits);
  **`CACHE_VERSION` 3 → 4** so a STEP imported before (cached groups without the split) is read again.
- `ui/sim-mechanisms.js` (partRole/fromCad/adoptCad only): `CARRIED`/`PART_WORDS` (carries = outermost flywheel/hood/shooter
  name, or ramp/kicker + rollers name for intakes, hardware skipped); intake kind ramp when rollers + kicker inside;
  fromCad intake text "· a deployable ramp because it holds “Kicker v3:1” beside its rollers “Rollers v2:1”"; a turret-only
  holder turns the shooters split out of it; adoptCad keeps instance numbers when two names would read the same.
- `ui/sim-discovery.js`: a shooter whose CAD parts are only turret assemblies looks for flywheel + hood inside them;
  parts wholly under the turntable stay fixed; notes name the assembly ("“Turret <2>” turns about this axis because it
  turns on “Turntable”…", "“Hood” in “Turret <2>” pivots here…"); new report lines
  `Shooter N is <asm> in your CAD: a turret on “X”, flywheel “Y”, hood “Z”.` / `Intake N is <asm> in your CAD: rollers “R”,
  a ramp that swings down on “Servo Hub Shaft”…`; `nameOf` drops "<n>"; off-game (`fromNames`) intake assemblies on one
  side merge into one intake.
- `ui/sim-joints.js` (discover status only): shows those `(Shooter|Intake) N is` lines in the Find again status and returns
  them in `told` (Configure from CAD shows `told`).

## Contract notes for others
- Report lines `^(Shooter|Intake) \d+ is .* in your CAD: …` are new API for the status text.
- Meta part `carries` now also on intake parts (ramp/kicker name, rollers name); sim-robot-model already keeps it.
- Game joint ids/names unchanged (`turretN`, `flywheelN`, `hoodN` with `drive.of shooter:N-1`; `deploy1`, `roller1` on `intake:0`).

## Tests
- New `tests/sim-dual-turret-cad.test.cjs` (10 tests) + fixture `tests/fixtures/biobuzz-cad.cjs` (6 naming styles: onshape,
  sides (SolidWorks, parts inline), shooter (one "Shooter" holding "Turret 1/2" with Flywheel/Hood Assembly), kicker
  ("Shooter L/R <1>" + "Kicker Mech <1>"), fusion ("Turrets v3:1"/"Turret v7:1"), inline ("Turret <1>" + "Kicker <1>")).
  Asserts 2 turrets / 2 flywheels / 2 hoods / 1 roller / 1 deploy with correct `drive.of` and parents, leaves per turret
  (no mount plate, nothing of the other turret), zero ±180°, launch 60°, intake kind ramp, status text, list rows, Find again
  idempotent; team with 1 sweeper + 1 turret; "Turret" holding two shooters; tree/groups split rules. 10/10 pass; same file
  against HEAD's four source files: 9/10 fail.
- 22 test files touching these modules: 211 pass, 0 fail, 1 skipped (MotionModule source not set). Real STEP import test
  (`sim-engine` "STEP assembly import") passes.
- Full `node --test tests/*.test.cjs`: 531 pass, 1 fail, 14 skipped. The failure is `preview-assets` "/index.html missing
  sim-hardware.js" — index.html (another package) references `ui/sim-hardware.js`, not yet on disk; not from my change.

## Open issues
- A project imported before this build keeps the parts list made at import (`project.model.parts`); Configure from CAD /
  Find again on it use that old list. Turret copies that were already top-level assemblies work now; turrets nested in one
  "Shooter" need a re-import (cache bump makes that re-read). A lead could recompute parts from the stored GLB tree.
- Two CAD shooters with no piece named are both "pollen" (game physics launches nectar from the second); left as before.
- Off-game (other fields) a single-part "Flywheel" is not found by name (TY `piece` rule); out of scope.
