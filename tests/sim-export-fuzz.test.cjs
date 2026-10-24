'use strict';
// Seeded random routes (headings, spins, tracking, curves, action paths, powers, pauses, turns) through every code
// generator, with measured tuning and with none: no NaN, Infinity, undefined or [object Object] may reach the code.
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),F=require('../ui/sim-ftc.js'),Pedro=require('../ui/sim-pedro.js'),M=require('../ui/sim-motionmodule.js'),T=require('../ui/sim-timed.js'),C=require('../ui/sim-config.js');
const TUNING={maxForward:86.6,maxStrafe:69.3,forwardDeceleration:83.8,strafeDeceleration:68.9,linearBrakeForward:.0941,linearBrakeStrafe:.0403,quadraticBrakeForward:.00176,quadraticBrakeStrafe:.00237,headingBrakeLinear:.0601,headingBrakeQuadratic:.00486,headingP:3.95,translationalP:.304,translationalD:.012,headingD:.1,translationalSmall:.101,maxPathSpeed:.7};
const leak=/\bNaN\b|\bInfinity\b|\bundefined\b|\[object Object\]/,comment=/^\s*(\*|\/\/|\/\*\*|#)/,allowed=/Double\.NaN|Double\.isNaN|float\("nan"\)|math\.nan/g;

function routes(seed,count){
  const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;},pick=a=>a[Math.floor(rnd()*a.length)],out=[];
  for(let k=0;k<count;k++){const start={x:20+rnd()*20,y:20+rnd()*20,heading:pick([0,90,-90,180,45])},pins=[];
    for(let i=0,n=1+Math.floor(rnd()*4);i<n;i++){const p={x:30+rnd()*90,y:30+rnd()*90};
      if(rnd()<.3)p.wait=+(rnd()*2).toFixed(2);if(rnd()<.3)p.action=pick(['Intake','Shoot','Spin up','Aim','Custom thing']);if(rnd()<.2)p.turn=pick([0,90,-90,180]);
      if(rnd()<.6){const path={},r=pick(['turn','relative','spin','tangent','reverse','track',null]);if(r)path.rotate=r;if(r==='turn')path.heading=pick([0,45,90,180,-135]);if(r==='relative')path.angle=pick([90,-270,400]);if(r==='spin')path.spins=pick([1,-2,3]);if(r==='track')path.target={x:72,y:72};
        if(rnd()<.3)path.power=pick([0,.3,1]);if(rnd()<.2){path.kind='action';path.action=pick(['Intake','Shoot']);}if(rnd()<.2){path.shape='custom';path.controls=[{x:30+rnd()*90,y:30+rnd()*90}];}p.path=path;}
      pins.push(p);}
    try{out.push({start,route:P.plan({start,zones:[],pins,style:pick(['sharp','spline']),clearance:1,defaultPower:rnd()<.5?.8:undefined},{front:8,rear:8,half:8})});}catch{}}
  return out;
}

test('random routes through every generator never write NaN, Infinity or undefined into the code',()=>{
  const list=routes(20261024,80),robot={...C.robot({},'ftc'),length:16,width:16};assert.ok(list.length>=70,'most random routes plan');
  for(const tuning of [TUNING,{}])for(const [k,{start,route}] of list.entries()){
    const layout={name:'Fuzz',field:'empty',width:144,height:144,start,zones:[]},routeJava=X.java(route,layout,{polygon:P.polygon});
    const outputs={java:routeJava,pp:X.pp(route,layout,{polygon:P.polygon}),...F.files({route,layout,tuning,robot,localization:['odometry','fused','encoders','optical','odometry3'][k%5],routeJava}).files,
      onbot:F.onBotJava({route,layout,tuning,robot,localization:'odometry',routeJava}).source,autonomous:M.autonomous(route,T.settings({}),{name:'Fuzz'}),actions:M.actionsFile(route,{name:'Fuzz'})};
    try{Object.assign(outputs,Pedro.files({route,layout,setupName:'Fuzz',robot,hardware:F.hardware(robot,'odometry'),tuning}).files);}catch(e){assert.match(e.message,/Pedro|cannot|not/,e.message);}
    for(const [name,src] of Object.entries(outputs)){const bad=String(src).split('\n').filter(l=>!comment.test(l)&&leak.test(l.replace(allowed,'')));
      assert.deepEqual(bad,[],`route ${k} (${Object.keys(tuning).length?'tuned':'no tuning'}) ${name}`);}
  }
});
