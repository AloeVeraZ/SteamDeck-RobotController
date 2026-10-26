'use strict';
// Exported MotionModule autonomous.py on the virtual MotionModule: MotionModule's real runtime
// (load_autonomous, controller with MockGPIO, confirmed Mecanum mixer, heading controllers) driven
// in lockstep with the simulator. Needs Python 3 and the MotionModule source; skipped without them.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const P=require('../ui/sim-planner.js'),M=require('../ui/sim-motionmodule.js'),Timed=require('../ui/sim-timed.js'),{SimEngine}=require('../src/sim-engine.cjs');
const root=path.join(__dirname,'..'),motionModule=process.env.DECK_MOTIONMODULE_SOURCE||path.join(root,'../MotionModule'),deps=process.env.DECK_MOTIONMODULE_DEPS||path.join(root,'.cache/motionmodule-test-deps');
const python=[process.env.DECK_PYTHON,path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),'python3'].find(p=>p&&spawnSync(p,['-c','import sys;assert sys.version_info>=(3,9)'],{windowsHide:true}).status===0);
const skip=!python?'Python 3 is not available (set DECK_PYTHON)':!fs.existsSync(path.join(motionModule,'core/motion_module/autonomous.py'))?'MotionModule source not found (set DECK_MOTIONMODULE_SOURCE)':false;

async function engine(robot,zones,start){
  let error='';const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-mm-test-')),now:()=>0,emit:m=>{if(m?.state==='error')error=m.error;}});
  const load=timing=>e.load({field:'empty',start,robot,zones,controller:'motionmodule',sensors:{localization:'gyro'},timing});
  await load();const timing={headingP:1.6,...e.timedCalibration(.45)};await load(timing);return {e,timing,error:()=>error};
}
async function compare(robot,zones,start,pins,clearance){
  const a=await engine(robot,zones,start),b=await engine(robot,zones,start);try{
    const route=P.plan({start,zones,pins,clearance,style:'sharp'},a.e.info.footprint,[],a.e.info.bounds),source=M.autonomous(route,a.timing,{name:'Test route'});
    await a.e.run({route});for(let i=0;i<3600&&a.e.mode==='timed';i++)a.e.timedTick();
    const started=await b.e.run({kind:'motionmodule',source,python,motionModule,deps});assert.equal(started.ok,true,b.error());
    for(let i=0;i<3600&&b.e.mode==='program';i++)await b.e.programTick();assert.ok(b.e.result,b.error()||'MotionModule routine did not finish');
    return {route,source,sim:a.e.result,mm:b.e.result};
  }finally{a.e.dispose();b.e.dispose();}
}

test('MotionModule export: a real autonomous.py with the route as a timed PLAN',()=>{
  const route=P.plan({start:{x:20,y:30,heading:0},zones:[],pins:[{x:90,y:30,wait:.5,action:'Score'},{x:90,y:100}],clearance:2,style:'sharp'},{front:8.5,rear:8.5,half:8.5});
  const source=M.autonomous(route,{power:.45,forwardSpeed:90,strafeSpeed:72,startup:0,stopping:.13,strafeStopping:.09},{name:'Check'});
  assert.match(source,/def create_autonomous\(module, drive\):/);assert.match(source,/IMU_TO_MIXER_SIGN = -1\.0/);assert.match(source,/from motion_module\.heading import HeadingController, Settle, TurnPID, wrap180/);
  assert.match(source,/\("drive", 1\.0, 0\.0, /);assert.match(source,/\("hold", 0\.5\),\n    \("action", "Score", 0\.0\)/);assert.match(source,/\("drive", 0\.0, -1\.0, /);
  assert.deepEqual(M.plan(route,{power:.45}).steps.map(s=>s[0]),["power","drive","hold","action","drive"]);
});
test('timed calibration fits speed and start/stop compensation from test drives',()=>{
  const fit=Timed.settings({stopping:.13});assert.equal(fit.strafeStopping,.13);
  const r=Timed.compile({heading:0,segments:[{type:'line',points:[{x:0,y:0},{x:60,y:0}]}],stops:[]},{power:.5,forwardSpeed:100,startup:.05,stopping:.2});
  assert.ok(Math.abs(r.steps[0].seconds-(60/50+.05-.2))<1e-9,'start compensation added, stop compensation removed before a stop');
});
test('the exported autonomous.py runs on the virtual MotionModule and matches the simulated timed run',{skip},async()=>{
  const {sim,mm}=await compare({drivetrain:'mecanum',length:17,width:17,heightIn:5,driveRpm:500,intakeIn:0},[],{x:20,y:30,heading:0},[{x:90,y:30,wait:.5,action:'Score'},{x:90,y:100}],2);
  assert.ok(Math.hypot(sim.truth.x-mm.truth.x,sim.truth.y-mm.truth.y)<1.5,`simulator ${JSON.stringify(sim.truth)} vs MotionModule ${JSON.stringify(mm.truth)}`);
  assert.ok(Math.hypot(mm.truth.x-90,mm.truth.y-100)<2,JSON.stringify(mm.truth));assert.ok(Math.abs(mm.time-sim.time)<.5);
});
test('MotionModule turns with its own TurnPID where a turning route needs it',{skip},async()=>{
  const gap=[{id:'l',type:'rect',x:31.5,y:72,width:63,height:4},{id:'r',type:'rect',x:112.5,y:72,width:63,height:4}];
  const {route,source,mm}=await compare({drivetrain:'mecanum',length:24,width:12,heightIn:5,driveRpm:500,intakeIn:0},gap,{x:72,y:30,heading:0},[{x:72,y:115}],1);
  assert.equal(route.turns,true);assert.match(source,/\("turn", 90\.0\)/);
  assert.ok(Math.abs(mm.truth.heading-90)<3,JSON.stringify(mm.truth));// MotionModule's turn settles anywhere within its ±3° tolerance, so the drive after it lands a little wider.
  assert.ok(Math.hypot(mm.truth.x-72,mm.truth.y-115)<3,JSON.stringify(mm.truth));assert.deepEqual(mm.violations,[]);
});

test('names with backslashes or triple quotes cannot break the exported Python',()=>{
  const start={x:24,y:24,heading:0},timing=Timed.settings({});
  for(const name of ['C:\\New route','Red \\x auto \\u00','"""quoted"""','ends with \\']){
    const route=P.plan({start,zones:[],pins:[{x:90,y:24,action:name,wait:.3},{x:90,y:90,path:{kind:'action',action:name+' 2'}}],style:'sharp',clearance:1},{front:8,rear:8,half:8});
    for(const src of [M.autonomous(route,timing,{name}),M.actionsFile(route,{name})]){
      // Inside every docstring, backslashes come in pairs, so none of them starts an escape.
      for(const block of src.split('"""').filter((_,i)=>i%2))for(const run of block.match(/\\+/g)||[])assert.equal(run.length%2,0,block.slice(0,120));
      if(python){const r=spawnSync(python,['-I','-W','error','-c','import ast,sys;ast.parse(sys.stdin.read())'],{input:src,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);}
    }
  }
});
