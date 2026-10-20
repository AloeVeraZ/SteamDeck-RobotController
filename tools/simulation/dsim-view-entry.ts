// Browser-side DSIM rendering for the Deck simulator. The field, robot and element drawing,
// the BIOBUZZ 3D scene and its CAD field models are DSIM's own code and assets (PolyForm
// Noncommercial 1.0.0, see licenses/DSIM-LICENSE). three.js is MIT.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { World } from 'dsim/src/types';
import { drawField } from 'dsim/src/render/drawField';
import { drawBalls } from 'dsim/src/render/drawBalls';
import { drawRampStrips } from 'dsim/src/render/drawGoals';
import { drawRobot } from 'dsim/src/render/drawRobot';
import { drawBiobuzzField } from 'dsim/src/games/biobuzz/drawField';
import { drawBiobuzzRobot } from 'dsim/src/games/biobuzz/drawRobot';
import { drawBiobuzzBalls } from 'dsim/src/games/biobuzz/draw';
import { createBiobuzzScene } from 'dsim/src/games/biobuzz/scene/renderScene';
import { buildBiobuzzField, updateBiobuzzField } from 'dsim/src/games/biobuzz/scene/renderField';
import { buildBiobuzzElements, updateBiobuzzElements } from 'dsim/src/games/biobuzz/scene/renderElements';
import { buildBiobuzzRobots, updateBiobuzzRobots } from 'dsim/src/games/biobuzz/scene/renderRobots';
import { createSceneLights } from 'dsim/src/games/biobuzz/scene/renderCore';

const SCREEN_UP = { x: 0, y: 1 };

/**
 * One top-down DSIM frame in field inches. The caller sets the canvas transform (DSIM's centred
 * frame, +y up). This is the drawing order of DSIM's own `Renderer.render` for a single robot,
 * calling the active game's renderers directly so React and the client registry stay out.
 */
export function draw2d(ctx: CanvasRenderingContext2D, world: World, field = true, intakeOn = false): void {
  const biobuzz = world.game === 'biobuzz';
  if (!field) {
    // empty field: the Deck view draws the tiles; DSIM draws only the robot
  } else if (biobuzz) drawBiobuzzField(ctx, world, SCREEN_UP);
  else {
    drawField(ctx, world);
    drawRampStrips(ctx, world);
  }
  for (const r of world.robots) {
    const held = world.balls.filter((b) => b.state.kind === 'held' && b.state.robot === r.id);
    (biobuzz ? drawBiobuzzRobot : drawRobot)(ctx, r, intakeOn, held, SCREEN_UP, world);
  }
  if (biobuzz) drawBiobuzzBalls(ctx, world, SCREEN_UP, world.robots[0]?.id);
  else drawBalls(ctx, world, SCREEN_UP);
}

export {
  THREE, GLTFLoader, STLLoader, OBJLoader, OrbitControls, MeshoptDecoder, createBiobuzzScene,
  buildBiobuzzField, updateBiobuzzField, buildBiobuzzElements, updateBiobuzzElements, buildBiobuzzRobots, updateBiobuzzRobots, createSceneLights,
};
