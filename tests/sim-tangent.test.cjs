'use strict';
// Facing along the path (Pedro Pathing's tangent heading) and backwards along it (reverse tangent).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),Pedro=require('../ui/sim-pedro.js');
const fp={front:8.5,rear:8.5,half:8.5},norm=d=>((d%360)+540)%360-180,layoutOf=start=>({name:'Tangent',field:'empty',fieldName:'Empty field',width:144,height:144,start,zones:[]});

test('a tangent path faces along its curve; reverse faces backwards',()=>{
  const start={x:24,y:24,heading:0},r=P.plan({start,zones:[],pins:[{x:110,y:24,path:{rotate:'tangent',controls:[{x:50,y:80},{x:90,y:80}]}}],clearance:2},fp),s=r.segments[0];
  assert.equal(s.tangent,true);assert.equal(s.reverse,undefined);
  for(const t of [0,.25,.5,.75,1]){const a=P.headingAt(s,t),d=P.tangentAt(s.points,t);assert.ok(Math.abs(norm(a-d))<1e-9);}
  assert.ok(Math.abs(norm(s.heading-Math.atan2(56,26)*180/Math.PI))<1e-6,'starts facing toward the first control point');assert.ok(Math.abs(norm(P.headingAt(s,.5)))<1e-6,'level at the top of the curve');
  const back=P.plan({start:{...start,heading:180},zones:[],pins:[{x:110,y:24,path:{rotate:'reverse'}}],clearance:2},fp).segments[0];
  assert.equal(back.reverse,true);assert.ok(Math.abs(norm(P.headingAt(back,.5)-180))<1e-6,'drives backwards along a straight path');
});

test('the robot turns in place to face along the path first, and the next path inherits the end heading',()=>{
  const start={x:24,y:24,heading:0},r=P.plan({start,zones:[],pins:[{x:24,y:110,path:{rotate:'tangent'}},{x:100,y:110}],clearance:2},fp),legs=X.legs(r);
  assert.ok(Math.abs(norm(legs[0].heading-90))<1e-6,'first leg starts facing +Y');assert.ok(Math.abs(norm(r.segments.at(-1).heading-90))<1e-6,'the next path keeps that heading');
  assert.ok(r.turnDegrees>=89,'the turn in place is counted');
});

test('a tangent path that needs room to turn next to a wall is reported',()=>{
  // Facing +Y from the left wall needs a quarter turn where the robot touches the wall.
  assert.throws(()=>P.plan({start:{x:9.5,y:24,heading:0},zones:[],pins:[{x:9.5,y:120,path:{rotate:'tangent'}}],clearance:2},{front:8.5,rear:8.5,half:4}),/no room to turn while driving/);
});

test('exports use tangent interpolators: Deck Java, Pedro .tangent()/.reverseTangent() and .pp tangential',()=>{
  const start={x:24,y:24,heading:0},layout=layoutOf(start);
  const r=P.plan({start,zones:[],pins:[{x:110,y:24,path:{rotate:'tangent',controls:[{x:50,y:80},{x:90,y:80}]}},{x:110,y:100,path:{rotate:'reverse'}}],clearance:2},fp);
  const java=X.java(r,layout,{polygon:P.polygon});assert.match(java,/\.heading\(tangent\(false\)\)/);assert.match(java,/\.heading\(tangent\(true\)\)/);assert.match(java,/private static Interpolator tangent\(boolean reverse\)/);
  const pedro=Object.values(Pedro.files({route:r,layout}).files).join('\n');assert.match(pedro,/\.tangent\(\)/);assert.match(pedro,/\.reverseTangent\(\)/);
  const pp=JSON.parse(X.pp(r,layout,{polygon:P.polygon,timestamp:'t'}));assert.equal(pp.lines[0].endPoint.heading,'tangential');assert.equal(pp.lines.at(-1).endPoint.reverse,true);
});

const runtime=path.join(__dirname,'../sim-runtime'),built=fs.existsSync(path.join(runtime,'dsim-host.cjs'))&&fs.existsSync(path.join(runtime,'driver/classes/deck/sim/RunBridge.class'));
test('in the simulator the robot faces along the curve while it drives',{skip:built?false:'run node tools/simulation/build.cjs first'},async()=>{
  const {SimEngine}=require('../src/sim-engine.cjs'),e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-tangent-')),now:()=>0});
  try{const start={x:24,y:24,heading:60},info=await e.load({field:'empty',start,sensors:{localization:'odometry',noise:0,gyroDrift:0,scaleError:0}});
    const r=P.plan({start,zones:[],pins:[{x:110,y:24,path:{rotate:'tangent',controls:[{x:50,y:80},{x:90,y:80}]}}],clearance:2},info.footprint,[],info.bounds),s=r.segments[0];
    assert.equal((await e.run({kind:'route',route:r})).ok,true);let worst=0,samples=0;
    for(let i=0;i<900&&e.mode==='program';i++){await e.programTick();const t=e.truth();
      // Compare with the tangent at the closest point of the curve, away from the ends where the robot settles.
      let best=null;for(let j=0;j<=200;j++){const q=bezier(s.points,j/200),d=Math.hypot(q.x-t.x,q.y-t.y);if(!best||d<best.d)best={d,u:j/200};}
      if(best.u>.15&&best.u<.85&&best.d<2){samples++;worst=Math.max(worst,Math.abs(norm(t.heading*180/Math.PI-P.tangentAt(s.points,best.u))));}}
    assert.ok(e.result,'finished');assert.ok(samples>20,`enough samples (${samples})`);assert.ok(worst<12,`heading stayed within 12° of the tangent (worst ${worst.toFixed(1)}°)`);
  }finally{e.dispose();}
});
function bezier(points,t){let p=points;while(p.length>1)p=p.slice(1).map((q,i)=>({x:p[i].x+(q.x-p[i].x)*t,y:p[i].y+(q.y-p[i].y)*t}));return p[0];}
