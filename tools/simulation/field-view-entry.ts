// DSIM field artwork only, used at the user's request for this personal local build.
// PolyForm Noncommercial 1.0.0; required notices are copied by build.cjs.
import {drawField} from 'dsim/src/render/drawField';
import {drawRampStrips} from 'dsim/src/render/drawGoals';
import {drawBiobuzzField,drawHiveCanopy} from 'dsim/src/games/biobuzz/drawField';
export {buildBiobuzzField,updateBiobuzzField} from 'dsim/src/games/biobuzz/scene/renderField';
export {buildBiobuzzElements,updateBiobuzzElements} from 'dsim/src/games/biobuzz/scene/renderElements';
export {hiveTiltAngle} from 'dsim/src/games/biobuzz/sim3d/tilt';
export {drawBiobuzzBalls} from 'dsim/src/games/biobuzz/draw';
const world:any={balls:[],robots:[],motif:[],goals:{red:{gatePos:0},blue:{gatePos:0}},humanPlayers:{red:{box:[]},blue:{box:[]}}};
export function drawDsimField(ctx:CanvasRenderingContext2D,game:string){
  if(game==='biobuzz'){drawBiobuzzField(ctx,world);drawHiveCanopy(ctx,world);}
  else{drawField(ctx,world);drawRampStrips(ctx,world);}
}
