'use strict';
// The Pedro Pathing 3 export, RUN on the virtual Control Hub with Pedro's real Follower: Pedro's own REV hub
// Mecanum drivetrain and Pinpoint/OTOS localizer, Foresight configured from the simulated robot
// (DeckSimPedro.starterConstants), all against the simulator's FTC SDK stand-ins and DSIM physics.
// Needs the simulator build (tools/simulation/build.cjs) and the Pedro jars (tools/simulation/fetch-pedro.cjs).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const runtime=path.join(__dirname,'../sim-runtime'),built=fs.existsSync(path.join(runtime,'dsim-host.cjs'))&&fs.existsSync(path.join(runtime,'driver/classes/deck/sim/RunBridge.class'));
const Fetch=require('../tools/simulation/fetch-pedro.cjs'),jars=Fetch.cached();
const skip=!built?'run node tools/simulation/build.cjs first':!jars?'run node tools/simulation/fetch-pedro.cjs first (downloads Pedro Pathing 3.0.2)':false;
const P=require('../ui/sim-planner.js'),Pedro=require('../ui/sim-pedro.js'),F=require('../ui/sim-ftc.js');
const start={x:24,y:24,heading:0},layout={name:'Pedro runtime',field:'empty',width:144,height:144,start,zones:[]};

async function drive(localization,pins,{defaultPower=.8,seconds=20,onTick}={}){
  const {SimEngine}=require('../src/sim-engine.cjs'),e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-pedro-')),now:()=>0});
  try{
    const info=await e.load({field:'empty',start,robot:{drivetrain:'mecanum',length:17,width:17,driveRpm:500},sensors:{localization,noise:0,gyroDrift:0,scaleError:0}});
    const route=P.plan({start,zones:[],pins,style:'spline',clearance:2,defaultPower},info.footprint,[],info.bounds),out=Pedro.files({route,layout,robot:info.robot,defaultPower});
    const files={...out.files,'org/firstinspires/ftc/teamcode/pedro/Constants.java':Pedro.starterConstants({hardware:F.hardware(info.robot,localization),tuning:info.tuning,className:'Constants'})};
    const started=await e.run({kind:'opmode',files,opMode:out.opMode,classpath:jars});assert.equal(started.ok,true,JSON.stringify(started));
    const phases=[];let doneAt=null;
    for(let i=0;i<seconds*60&&e.mode==='program';i++){await e.programTick();const ph=`${e.telemetry?.Leg||''} ${e.telemetry?.Phase||''}`.trim();if(ph&&phases.at(-1)!==ph)phases.push(ph);
      if(onTick&&await onTick(e,i))break;if(doneAt===null&&/Done$/.test(ph))doneAt=i/60;if(doneAt!==null&&i/60>doneAt+1)break;}
    return {e,phases,doneAt,truth:e.truth(),dispose:()=>e.dispose()};
  }catch(err){e.dispose();throw err;}
}

test('Pedro export runs with Pedro\'s Follower and Pinpoint: drives, pauses, turns and holds the end without restarting',{skip},async()=>{
  const r=await drive('fused',[{x:90,y:24,wait:.5},{x:110,y:90,path:{rotate:'turn',heading:90}}]);
  try{
    assert.ok(r.doneAt!==null&&r.doneAt<10,`finished (Done at ${r.doneAt} s): ${r.phases.join(' → ')}`);
    assert.deepEqual(r.phases.filter(p=>/Driving|Pause|Done/.test(p)),['1 of 2 Driving','1 of 2 Pause','2 of 2 Driving','2 of 2 Done']);
    const t=r.truth;assert.ok(Math.hypot(t.x-110,t.y-90)<1.5,`ended at (${t.x.toFixed(2)}, ${t.y.toFixed(2)})`);assert.ok(Math.abs(t.heading-Math.PI/2)<Math.PI/60,`heading ${(t.heading*180/Math.PI).toFixed(1)}°`);
  }finally{r.dispose();}
});

test('Pedro export with OTOS localization reaches its end point too',{skip},async()=>{
  const r=await drive('optical',[{x:100,y:60}]);
  try{assert.ok(r.doneAt!==null,r.phases.join(' → '));const t=r.truth;assert.ok(Math.hypot(t.x-100,t.y-60)<1.5,`ended at (${t.x.toFixed(2)}, ${t.y.toFixed(2)})`);}finally{r.dispose();}
});

test('Stop during a Pedro path zeroes the drive at once; a zero-power path keeps the robot stopped',{skip},async()=>{
  let stoppedAt=null;
  const r=await drive('fused',[{x:120,y:24}],{seconds:3,onTick:async(e,i)=>{if(i===45){await e.stop();stoppedAt=e.truth();return true;}return false;}});
  try{assert.ok(stoppedAt&&stoppedAt.x>26,'it was moving');assert.equal(r.e.mode==='program',false);assert.deepEqual([r.e.command.forward,r.e.command.strafe,r.e.command.turn],[0,0,0]);}finally{r.dispose();}
  const z=await drive('fused',[{x:60,y:24},{x:100,y:24,path:{power:0}}],{seconds:6});
  try{assert.ok(z.phases.some(p=>/Zero motor power/.test(p)),z.phases.join(' → '));const t=z.truth;assert.ok(Math.abs(t.x-60)<1.5,`stays at the end of the first path (x ${t.x.toFixed(2)})`);}finally{z.dispose();}
});

test('the BIOBUZZ example runs as a Pedro export with its mechanisms and parks',{skip},async()=>{
  const Cli=require('../tools/deck-sim.cjs'),setup=Cli.readSetup(path.join(__dirname,'../examples/biobuzz-red-auto.json')),{e,info,l}=await Cli.load(setup);
  try{const route=Cli.planRoute(setup,l,info),{files}=Cli.exported(setup,l,route,info,'pedro'),opMode=Object.keys(files).find(k=>/Pedro\.java$/.test(k)).replace(/\.java$/,'').replace(/\//g,'.');
    files['org/firstinspires/ftc/teamcode/pedro/Constants.java']=Pedro.starterConstants({hardware:F.hardware(info.robot,setup.sensors.localization),tuning:info.tuning,className:'Constants'});
    assert.equal((await e.run({kind:'opmode',files,opMode,classpath:jars})).ok,true);let done=false;
    for(let i=0;i<30*60&&e.mode==='program'&&!done;i++){await e.programTick();done=/Done$/.test(e.telemetry?.Phase||'');}
    assert.ok(done,`finished within the 30 s autonomous (${JSON.stringify(e.telemetry)})`);const end=l.pins.at(-1),t=e.truth();assert.ok(Math.hypot(t.x-end.x,t.y-end.y)<2,`parked at (${t.x.toFixed(1)}, ${t.y.toFixed(1)}) for (${end.x}, ${end.y})`);
  }finally{e.dispose();}
});
