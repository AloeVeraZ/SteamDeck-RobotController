# View cube changes

October 21, 2026 · Local Windows build 2.4.21 · `testing`

Built on the checkout used by Claude's current Driver Station session:
`C:\Users\angel\OneDrive\Documents\Github\SteamDeck-RobotController`.
The user's pasted Claude conversation supplied the interaction requirements.

## Appearance and interaction

- Replaced the overlapping CSS plates with one projected, beveled cube: six faces, twelve edges and eight corners. Faces have clear labels, light shading and blue hover/selection feedback.
- Clicking a face, edge or corner selects that view. The cube stays aligned with its camera.
- Holding the left mouse button on the cube requests pointer lock and hides the cursor. Mouse movement orbits the associated robot preview or the whole field around its existing center, preserving orbit distance. Releasing restores the pointer. Escape, focus loss and disposal release the interaction safely.
- Touch and environments that refuse pointer lock use captured dragging.
- Home keeps the existing isometric direction and behavior. Arrow keys also orbit; Shift selects larger steps and Ctrl smaller steps.
- Both instances use the same implementation: the robot preview in Setup and the 3D field in Path planning / Run & review.

The visual/navigation reference was [Onshape's view cube documentation](https://cad.onshape.com/help/Content/View/view_navigation_and_the_view_cube.htm). The requested left-button drag behavior follows the user's instructions.

## Verification

- All **204 automated tests passed**, with no failures or skipped tests. New tests cover a closed cube surface, all 26 view directions, orbit distance and target preservation, up-axis handling, movement reversal, pole limits and invalid input.
- Native Windows checks verified robot-preview face, edge and corner selection; robot and field drag-to-orbit; and Home in both locations.
- Rebuilt the Windows ZIP and installer and installed the build locally. Hash checks matched the installed cube files and Claude's current planner, simulation, main process and preload sources.
- Loaded Claude's existing `examples/simulation-setups/BIOBUZZ blue auto 15x15.json` through the app's Open setup file control. The app had opened an older saved setup; importing the BIOBUZZ export kept the other saved setups. The autonomous file itself was not changed.
- Saved app data was backed up before installation under `test-results/view-cube-2026-10-21/saved-data-backup/`.

Logs and the installed-file hash check are under `test-results/view-cube-2026-10-21/`. Validation was on Windows; physical touchscreen behavior and other operating systems were not exercised in this pass. No GitHub push or release was performed.
