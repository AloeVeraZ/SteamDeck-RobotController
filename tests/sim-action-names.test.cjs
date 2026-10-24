'use strict';
// Action names become code slots: names in any script get a slot, and every name that maps to a slot dispatches to it.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),F=require('../ui/sim-ftc.js'),M=require('../ui/sim-motionmodule.js'),T=require('../ui/sim-timed.js'),C=require('../ui/sim-config.js');
const NAMES=['Shoot','shoot','射击','Стрелять','🎯','射击 2','Lanzar épée','class','3 point'];
const start={x:20,y:20,heading:0},layout={name:'Names',field:'empty',width:144,height:144,start,zones:[]};
const route=P.plan({start,zones:[],pins:NAMES.map((n,i)=>({x:30+(i%3)*35,y:30+Math.floor(i/3)*35,action:n,wait:.1})),style:'sharp',clearance:1,defaultPower:.8},{front:8,rear:8,half:8});

test('names in any script get their own slot; names differing only in case share one',()=>{
  assert.equal(X.slot('Shoot'),X.slot('shoot'));assert.equal(X.slot('射击'),'actionU5c0451fb');assert.equal(X.pySlot('射击'),'action_u5c0451fb');
  assert.notEqual(X.slot('射击'),X.slot('Стрелять'));assert.notEqual(X.slot('射击 2'),X.slot('Стрелять 2'),'digits alone do not merge different scripts');
  assert.equal(X.slot('🎯'),'actionU1f3af');assert.equal(X.slot(''),'');assert.equal(X.slot('  '),'');
  // Latin names keep the slot names they always had (teams' RobotActions.java overrides them by name).
  assert.equal(X.slot('Lanzar épée'),'lanzarEPeE');assert.equal(X.slot('class'),'classAction');assert.equal(X.slot('3 point'),'action3Point');assert.equal(X.slot('Intake front'),'intakeFront');
  const list=X.actions(route),shoot=list.find(a=>a.slot==='shoot');assert.deepEqual(shoot.names,['Shoot','shoot']);assert.equal(list.length,NAMES.length-1);
});

test('every action name dispatches to its slot in Java and Python, and the code compiles',()=>{
  const robot={...C.robot({},'ftc'),length:16,width:16},routeJava=X.java(route,layout,{polygon:P.polygon}),tc=F.files({route,layout,tuning:{},robot,localization:'odometry',routeJava});
  const routeActions=Object.entries(tc.files).find(([k])=>k.endsWith('RouteActions.java'))[1];
  for(const name of NAMES)assert.match(routeActions,new RegExp(`case "${name}": return ${X.slot(name)}\\(step\\);`),name);
  const py=M.autonomous(route,T.settings({}),{name:'Names'});for(const name of NAMES)assert.ok(py.includes(`    ${JSON.stringify(name)}: ${JSON.stringify(X.pySlot(name))},`),name);
  const runtime=path.join(__dirname,'../sim-runtime'),javac=path.join(runtime,'java/bin',process.platform==='win32'?'javac.exe':'javac');
  if(!fs.existsSync(javac))return;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-names-')),files=Object.entries(tc.files).map(([rel,src])=>{const f=path.join(dir,'src',rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,src);return f;});
  const r=spawnSync(javac,['-encoding','UTF-8','-cp',path.join(runtime,'driver/classes'),'-d',path.join(dir,'out'),...files],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});
