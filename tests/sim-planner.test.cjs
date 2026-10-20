'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const planner=require('../ui/sim-planner.js'),{ClipperLib}=require('../ui/vendor/planning.cjs');
const square={front:9,rear:9,half:9};
const plan=(zones,pins,options={})=>planner.plan({start:options.start||{x:12,y:72,heading:0},zones,pins,clearance:options.clearance??1,smooth:options.smooth},options.footprint||square,options.fieldZones||[],options.field);
const rect=(x,y,width,height,angle=0,id)=>({id:id||`r${x}-${y}`,type:'rect',x,y,width,height,angle});

// Distance between two convex polygons that do not overlap.
function segDist(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);}
function polyDist(A,B){if(planner.overlap(A,B,0))return 0;let d=Infinity;for(const [P,Q] of [[A,B],[B,A]])for(const p of P)for(let i=0;i<Q.length;i++)d=Math.min(d,segDist(p,Q[i],Q[(i+1)%Q.length]));return d;}
function clearanceOf(result,zones,footprint=square){let min=Infinity;for(const p of result.samples){const body=planner.body({...p,heading:result.heading},footprint);for(const z of zones)min=Math.min(min,polyDist(body,planner.polygon(z)));}return min;}
function assertSafe(result,zones,footprint=square,field=planner.FIELD){
  for(let i=1;i<result.samples.length;i++)assert.ok(planner.sweepClear(result.samples[i-1],result.samples[i],result.heading,zones,footprint,field),`sweep ${i} collides`);
  for(const p of result.samples)assert.ok(planner.safePose({...p,heading:result.heading},zones,footprint,field),'pose collides');
}
// Ground truth for "is there any route": breadth-first search over a 0.5-inch grid of robot
// centres whose grown footprint (with clearance) is collision-free.
function gridReachable(start,goal,zones,clearance,footprint=square){
  const step=.5,grown={front:footprint.front+clearance,rear:footprint.rear+clearance,half:footprint.half+clearance};
  const free=(x,y)=>planner.safePose({x,y,heading:start.heading},zones,grown)&&planner.safePose({x,y,heading:start.heading},[],footprint);
  const key=(i,j)=>i*1000+j,si=Math.round(start.x/step),sj=Math.round(start.y/step),gi=Math.round(goal.x/step),gj=Math.round(goal.y/step);
  const seen=new Set([key(si,sj)]),queue=[[si,sj]];
  while(queue.length){const [i,j]=queue.shift();if(Math.abs(i-gi)<=1&&Math.abs(j-gj)<=1)return true;for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const ni=i+di,nj=j+dj,k=key(ni,nj);if(seen.has(k))continue;seen.add(k);if(free(ni*step,nj*step))queue.push([ni,nj]);}}
  return false;
}

test('open field: one straight segment of the exact length',()=>{
  const r=plan([],[{x:120,y:72}]);assert.equal(r.segments.length,1);assert.ok(Math.abs(r.length-108)<1e-6);assert.equal(r.heading,0);
});
test('route bends around a barrier and keeps the whole footprint clear',()=>{
  const zones=[rect(72,72,20,60)],r=plan(zones,[{x:130,y:72}]);
  assert.ok(r.segments.length>1);assert.ok(r.length>118);assertSafe(r,zones);
  assert.ok(clearanceOf(r,zones)>=r.clearance/2-1e-3,'smoothing may use at most half the clearance');
});
test('Clipper-rounded union vertices on a grown boundary stay usable (tolerance regression)',()=>{
  // Two overlapping rotated barriers: Clipper's union adds intersection vertices rounded to
  // 1e-4 inch. With the old 1e-7 epsilon some of those land "inside" the other polygon and are
  // discarded; with the boundary tolerance every one of them is kept as a graph vertex.
  const zones=[rect(70,70,30,10,17.3,'a'),rect(78,74,30,10,-41.7,'b')],grown=planner.inflated(zones,square,0,1),union=[],clip=new ClipperLib.Clipper();
  clip.AddPaths(grown.map(p=>p.map(v=>({X:Math.round(v.x*1e4),Y:Math.round(v.y*1e4)}))),ClipperLib.PolyType.ptSubject,true);clip.Execute(ClipperLib.ClipType.ctUnion,union,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
  const vertices=union.flat().map(v=>({x:v.X/1e4,y:v.Y/1e4}));
  const strictLoss=vertices.filter(v=>grown.some(p=>planner.inside(v,p,1e-7))).length;
  const tolerantLoss=vertices.filter(v=>grown.some(p=>planner.inside(v,p))).length;
  assert.ok(strictLoss>0,'fixture should reproduce the rounding problem');assert.equal(tolerantLoss,0);
  const r=plan(zones,[{x:130,y:72}]);assertSafe(r,zones);
});
test('narrow passage: a gap wider than the footprint is used, a narrower one is refused',()=>{
  const wall=gap=>[rect(72,(144-gap)/4,12,(144-gap)/2,0,'low'),rect(72,144-(144-gap)/4,12,(144-gap)/2,0,'high')];
  const open=wall(20.2),r=plan(open,[{x:130,y:72}],{clearance:.5});assertSafe(r,open);
  assert.ok(Math.max(...r.samples.map(p=>p.y))<82&&Math.min(...r.samples.map(p=>p.y))>62,'route goes through the gap');
  assert.ok(clearanceOf(r,open)>=.25-1e-3);
  const shut=wall(18.5);assert.throws(()=>plan(shut,[{x:130,y:72}],{clearance:.5}),/No safe route/);
  assert.equal(gridReachable({x:12,y:72,heading:0},{x:130,y:72},shut,.5),false);
});
test('blocked and invalid goals give readable errors',()=>{
  const ring=[rect(110,72,4,50,0,'w'),rect(138,72,4,50,0,'e'),rect(124,49,32,4,0,'s'),rect(124,95,32,4,0,'n')];
  assert.throws(()=>plan(ring,[{x:124,y:72}]),/No safe route to pin 1/);
  assert.throws(()=>plan([rect(100,72,20,20)],[{x:100,y:72}]),/insufficient robot clearance/);
  assert.throws(()=>plan([rect(12,72,10,10)],[{x:100,y:72}]),/starting footprint/);
  assert.throws(()=>plan([],[]),/Add a destination pin/);
  assert.throws(()=>plan([],[{x:150,y:72}]),/inside the field/);
  assert.throws(()=>plan([],[{x:140,y:72}]),/insufficient robot clearance/,'centre too close to the wall for the footprint');
});
test('asymmetric intake footprint is respected at the wall',()=>{
  const intake={front:14,rear:7,half:8};
  assert.throws(()=>plan([],[{x:131,y:72}],{footprint:intake,start:{x:20,y:72,heading:0}}),/insufficient/);
  const r=plan([],[{x:129,y:72}],{footprint:intake,start:{x:20,y:72,heading:0}});assertSafe(r,[],intake);
  // Facing left the long intake side swaps walls.
  const back=plan([],[{x:16,y:72}],{footprint:intake,start:{x:100,y:72,heading:180}});assertSafe(back,[],intake);
  assert.throws(()=>plan([],[{x:13.5,y:72}],{footprint:intake,start:{x:100,y:72,heading:180}}),/insufficient/);
  const flush=plan([],[{x:14,y:72}],{footprint:intake,start:{x:100,y:72,heading:180}});assertSafe(flush,[],intake);
});
test('circles, triangles and rotated rectangles in one ordered multi-pin route',()=>{
  const zones=[{id:'c',type:'circle',x:50,y:60,radius:10},{id:'t',type:'triangle',x:95,y:90,width:24,height:20,angle:30},rect(60,115,30,8,45,'r')];
  const pins=[{x:75,y:40},{x:120,y:120},{x:30,y:125}],r=plan(zones,pins,{start:{x:15,y:20,heading:90}});assertSafe(r,zones);
  assert.equal(r.pins,3);const visits=pins.map(p=>r.vertices.findIndex(v=>v.pin&&planner.dist(v,p)<1e-6));
  assert.ok(visits.every(i=>i>0)&&visits[0]<visits[1]&&visits[1]<visits[2],'pins visited in order');
  for(const p of pins)assert.ok(r.samples.some(s=>planner.dist(s,p)<1e-6),'route passes every pin');
});
test('smoothing is tangent-continuous and never cuts a corner into a barrier',()=>{
  const zones=[rect(60,60,30,30),rect(100,100,30,30)],r=plan(zones,[{x:130,y:20},{x:130,y:130},{x:20,y:130}]);
  assertSafe(r,zones);const curves=r.segments.filter(s=>s.type==='curve');
  for(let i=1;i<r.segments.length;i++){const a=r.segments[i-1],b=r.segments[i];assert.ok(planner.dist(a.points.at(-1),b.points[0])<1e-9,'segments join');}
  for(const c of curves){const [a,p,b]=c.points,prev=r.segments[r.segments.indexOf(c)-1];const t1={x:p.x-a.x,y:p.y-a.y},t0={x:prev.points.at(-1).x-prev.points.at(-2).x,y:prev.points.at(-1).y-prev.points.at(-2).y};assert.ok(Math.abs(t1.x*t0.y-t1.y*t0.x)<1e-6*Math.hypot(t1.x,t1.y)*Math.hypot(t0.x,t0.y),'G1 at curve entry');}
  const sharp=plan(zones,[{x:130,y:20},{x:130,y:130},{x:20,y:130}],{smooth:false});assert.ok(sharp.segments.every(s=>s.type==='line'));assert.ok(r.length<=sharp.length+1e-6);
});
test('field bounds and field-element zones (BIOBUZZ walls at 70.674 in from centre)',()=>{
  const field={x0:72-70.674,y0:72-70.674,x1:72+70.674,y1:72+70.674},hive=[rect(72,124,40,12,0,'hive')];
  assert.throws(()=>plan([],[{x:72,y:72}],{field,start:{x:9,y:72,heading:0}}),/starting footprint/);
  assert.throws(()=>plan([],[{x:72,y:140}],{field,start:{x:72,y:20,heading:90}}),/insufficient/);
  const r=plan([],[{x:40,y:132}],{field,fieldZones:hive,start:{x:72,y:20,heading:90}});assertSafe(r,hive,square,field);assert.ok(r.segments.length>1,'route bends around the field element');
});
test('planner matches a grid-search oracle on random layouts',()=>{
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  let agreed=0;
  for(let trial=0;trial<24;trial++){
    const zones=Array.from({length:4},(_,i)=>rnd()<.5?rect(30+rnd()*84,20+rnd()*104,6+rnd()*26,6+rnd()*40,rnd()*90,'z'+i):{id:'z'+i,type:rnd()<.5?'circle':'triangle',x:30+rnd()*84,y:20+rnd()*104,radius:4+rnd()*12,width:10+rnd()*20,height:10+rnd()*20,angle:rnd()*360});
    const start={x:12,y:20+rnd()*104,heading:0},goal={x:126+rnd()*6,y:14+rnd()*116};
    if(!planner.safePose(start,zones,{front:10,rear:10,half:10}))continue;
    let r=null;try{r=planner.plan({start,zones,pins:[goal],clearance:1},square);}catch(e){assert.match(e.message,/No safe route|insufficient/);}
    const oracle=gridReachable(start,goal,zones,1);
    if(r){assertSafe(r,zones);}
    // A grid route implies a polygonal one; the planner may find routes the grid misses.
    if(oracle)assert.ok(r,`trial ${trial}: grid search found a route the planner missed`);
    agreed++;
  }
  assert.ok(agreed>=18);
});
test('24 barriers and many pins plan quickly',()=>{
  let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const zones=Array.from({length:24},(_,i)=>({id:'z'+i,type:['rect','circle','triangle'][i%3],x:30+(i%6)*17,y:20+Math.floor(i/6)*30,width:5+rnd()*4,height:5+rnd()*4,radius:2+rnd()*2,angle:rnd()*90}));
  const t=performance.now(),r=plan(zones,[{x:130,y:130},{x:130,y:14},{x:60,y:130}],{clearance:.25});
  assert.ok(performance.now()-t<5000,'planning took too long');assertSafe(r,zones);
});
