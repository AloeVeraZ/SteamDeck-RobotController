'use strict';
// Custom curves: Bezier control points the user places and drags (like Pedro Pathing's visualizer).
// The planner drives them exactly as drawn, reports a blocked curve instead of re-routing it, and every
// export carries the same control points.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),Pedro=require('../ui/sim-pedro.js');
const fp={front:8.5,rear:8.5,half:8.5},start={x:24,y:24,heading:0},hive={id:'hive',type:'rect',x:70,y:60,width:20,height:20};
const curved={x:110,y:24,path:{controls:[{x:50,y:80},{x:90,y:80}]}};
const bez=(points,t)=>{let p=points;while(p.length>1)p=p.slice(1).map((q,i)=>({x:p[i].x+(q.x-p[i].x)*t,y:p[i].y+(q.y-p[i].y)*t}));return p[0];};

test('a custom curve is planned exactly as drawn, with its heading settings',()=>{
  const r=P.plan({start,zones:[],pins:[curved,{x:110,y:100}],style:'spline',clearance:2},fp);
  assert.deepEqual(r.segments[0].points,[{x:24,y:24},{x:50,y:80},{x:90,y:80},{x:110,y:24}]);assert.equal(r.segments[0].type,'curve');assert.equal(r.segments[0].custom,true);
  assert.equal(r.stops[0].segment,0);assert.equal(r.segments.at(-1).points.at(-1).y,100);
  // One control point is a quadratic curve; a heading change is spread along the custom curve.
  const q=P.plan({start,zones:[],pins:[{x:110,y:24,path:{controls:[{x:67,y:70}],rotate:'turn',heading:90}}],clearance:2},fp);
  assert.equal(q.segments[0].points.length,3);assert.equal(q.segments[0].heading,0);assert.equal(q.segments[0].endHeading,90);
});

test('a blocked custom curve is reported for its path, never silently re-routed',()=>{
  assert.throws(()=>P.plan({start,zones:[hive],pins:[curved],clearance:2},fp),/Path to pin 1: the custom curve takes the robot into a wall, obstacle or the field edge/);
  const issues=P.analyze({start,zones:[hive],pins:[{x:60,y:24},curved],clearance:2},fp,[],undefined,true);
  assert.deepEqual(issues.map(i=>[i.pin,i.code]),[[1,'path']]);assert.match(issues[0].message,/pin 2: the custom curve/);
  // A curve whose handles leave the field takes the robot over the wall.
  assert.throws(()=>P.plan({start,zones:[],pins:[{x:110,y:24,path:{controls:[{x:50,y:-30},{x:90,y:-30}]}}],clearance:2},fp),/custom curve/);
});

test('control points are sanitized, kept by Optimize and ignored by tank robots',()=>{
  assert.deepEqual(P.pathEffects({controls:[{x:1.23456,y:2},{x:NaN,y:1},null,{x:3,y:4},{x:5,y:6},{x:7,y:8}]}).controls,[{x:1.235,y:2},{x:3,y:4},{x:5,y:6}]);
  assert.equal(P.pathEffects({controls:[]}).controls,null);assert.equal(P.pathEffects({}).controls,null);
  // Optimize only varies automatic shapes: the custom path keeps its control points in every candidate.
  const candidates=P.shapeCandidates({start,zones:[],pins:[curved,{x:110,y:100}],style:'spline'});
  for(const c of candidates)assert.deepEqual(c.project.pins[0].path.controls,curved.path.controls);assert.ok(candidates.every(c=>c.project.pins[0].path.shapeAuto===false));
  // Tank-style robots turn in place between straight legs; a stored curve does not change that.
  const tank=P.plan({start,zones:[],pins:[curved],nonholonomic:true,clearance:2},fp);assert.ok(tank.segments.every(s=>s.type==='line'));
});

test('every export carries the custom control points',()=>{
  const layout={name:'Curve',field:'empty',fieldName:'Empty field',width:144,height:144,start,zones:[]},r=P.plan({start,zones:[],pins:[curved],clearance:2},fp);
  assert.match(X.java(r,layout,{polygon:P.polygon}),/Paths\.curve\(v\(24, 24\), v\(50, 80\), v\(90, 80\), v\(110, 24\)\)/);
  assert.deepEqual(JSON.parse(X.pp(r,layout,{polygon:P.polygon,timestamp:'t'})).lines[0].controlPoints,[{x:50,y:80},{x:90,y:80}]);
  const pedro=Object.values(Pedro.files({route:r,layout}).files).join('\n');assert.match(pedro,/Paths\.curve\(v\(24, 24\), v\(50, 80\), v\(90, 80\), v\(110, 24\)\)\.constant\(Math\.toRadians\(0\)\)/);
});

const runtime=path.join(__dirname,'../sim-runtime'),built=fs.existsSync(path.join(runtime,'dsim-host.cjs'))&&fs.existsSync(path.join(runtime,'driver/classes/deck/sim/RunBridge.class'));
test('the simulated robot drives the custom curve, not a straight line',{skip:built?false:'run node tools/simulation/build.cjs first'},async()=>{
  const {SimEngine}=require('../src/sim-engine.cjs'),e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-curve-')),now:()=>0});
  try{const info=await e.load({field:'empty',start,sensors:{localization:'odometry',noise:0,gyroDrift:0,scaleError:0}});
    const r=P.plan({start,zones:[],pins:[curved],clearance:2},info.footprint,[],info.bounds),curve=r.segments[0].points;
    assert.equal((await e.run({kind:'route',route:r})).ok,true);let highest=0,worst=0;
    for(let i=0;i<900&&e.mode==='program';i++){await e.programTick();const t=e.truth();highest=Math.max(highest,t.y);
      let near=Infinity;for(let j=0;j<=200;j++){const q=bez(curve,j/200);near=Math.min(near,Math.hypot(q.x-t.x,q.y-t.y));}worst=Math.max(worst,near);}
    assert.ok(e.result,'the route finished');assert.ok(highest>60,`the robot rose along the curve (peak y ${highest.toFixed(1)}; the curve peaks at 66)`);
    assert.ok(worst<3,`stayed within 3 in of the drawn curve (worst ${worst.toFixed(2)} in)`);const t=e.truth();assert.ok(Math.hypot(t.x-110,t.y-24)<1.5);
  }finally{e.dispose();}
});
