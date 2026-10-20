# Local simulation field visuals

At the user's request, this personal, noncommercial Windows build uses DSIM's field
rendering and BIOBUZZ field CAD instead of the earlier schematic field artwork.
DSIM is PolyForm Noncommercial 1.0.0, not open source. Its full LICENSE and NOTICE
are supplied in ui/vendor/licenses/DSIM-LICENSE and DSIM-NOTICE.

Required Notice: Copyright 2026 Dohun Kim (https://github.com/genius0412)

BIOBUZZ field and element meshes come from the pinned DSIM commit
0df84143a52dde4c7c196fb21b94264a13da91b6, public/models/biobuzz. The original CAD is
FIRST's STEP v26-27.2 (2026-09-15). DSIM's asset README, including its unresolved
redistribution notice, is copied next to the installed model. Field GLB SHA-256:
3d00a1132fdf93984158cee7c7cc7066706a765b7bad790111da4df88fb4c9be.

DECODE's full field CAD comes from FIRST:
https://ftc-resources.firstinspires.org/ftc/archive/2026/field/field-cad-step
ZIP SHA-256: 79b5a747a5189427dde74f50611b0f5af7341209ca5367d1d88a822ebea9b493.
The STEP is DECODE presented by RTX Full Field - am-5700_Full. It is locally meshed
with Open CASCADE and simplified with meshoptimizer; the 24 loose artifacts are
removed from the static mesh because the simulation renders dynamic bodies instead.
The prepared GLB uses centered inches and Z up; the view fits its nominal field
interior to the engine's 144-inch DECODE frame.

FIRST's field designs, CAD, artwork, and marks remain the property of their owners.
The CAD source terms permit personal, noncommercial use and restrict redistribution.
No redistribution permission is asserted here; nothing is pushed or published.
Neither this app nor DSIM is affiliated with or endorsed by FIRST or RTX.

Prepared DECODE GLB gzip SHA-256:
7fd6aac73fead31e75f9e654a6437a45ca1916f5b481c0a7ca8cdeeb475370e9.
Rebuild locally with prepare-robot.py <STEP> decode-field, then prepare-decode-field.mjs.
