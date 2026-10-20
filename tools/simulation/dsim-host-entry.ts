// Headless DSIM physics for the simulation host process. Everything here is
// DSIM's own code (PolyForm Noncommercial 1.0.0, see licenses/DSIM-LICENSE);
// this entry only selects the DOM-free pieces the Deck simulator steps.
export { initPhysics } from 'dsim/src/sim/physicsEngine';
export { solveRobots } from 'dsim/src/sim/physicsEngine';
export { updateRobot } from 'dsim/src/sim/robot';
export { driveParams } from 'dsim/src/sim/drivetrain';
export { footprintExtents } from 'dsim/src/sim/field';
export { robotExtents } from 'dsim/src/sim/physics';
export { createWorld, coerceSpec, DEFAULT_SPEC } from 'dsim/src/sim/spawn';
export { SIM_GAMES } from 'dsim/src/games/sim';
export { initPhysics3d, disposePhysics3dFor } from 'dsim/src/games/biobuzz/sim3d/engine';
export { SIM_DT, FIELD_HALF, INTAKE_PRESETS, ROBOT_MAX_SIZE } from 'dsim/src/config';
export { lengthLimits, widthLimits, rpmLimits } from 'dsim/src/sim/drivetrain';
