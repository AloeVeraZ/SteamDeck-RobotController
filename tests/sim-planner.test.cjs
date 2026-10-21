'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const planner=require('../ui/sim-planner.js'),{ClipperLib}=require('../ui/vendor/planning.cjs');
const square={front:9,rear:9,half:9};
const plan=(zones,pins,options={})=>planner.plan({start:options.start||{x:12,y:72,heading:0},zones,pins,clearance:options.clearance??1,smooth:options.smooth,rotate:options.rotate},options.footprint||square,options.fieldZones||[],options.field);
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
  // At the starting heading the intake cannot reach x=131; turning around puts the short rear there.
  assert.throws(()=>plan([],[{x:131,y:72}],{footprint:intake,start:{x:20,y:72,heading:0},rotate:false}),/insufficient/);
  const turned=plan([],[{x:131,y:72}],{footprint:intake,start:{x:20,y:72,heading:0}});assert.equal(turned.turns,true);assert.ok(planner.safePose({x:131,y:72,heading:turned.segments.at(-1).heading},[],intake));
  for(const s of turned.segments)assert.ok(planner.sweepClear(s.points[0],s.points[1],s.heading,[],intake));
  const r=plan([],[{x:129,y:72}],{footprint:intake,start:{x:20,y:72,heading:0}});assertSafe(r,[],intake);
  // Facing left the long intake side swaps walls.
  const back=plan([],[{x:16,y:72}],{footprint:intake,start:{x:100,y:72,heading:180}});assertSafe(back,[],intake);
  assert.throws(()=>plan([],[{x:13.5,y:72}],{footprint:intake,start:{x:100,y:72,heading:180},rotate:false}),/insufficient/);
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
test('spline routes: cubic, tangent-continuous through waypoints, safe, and tension relaxes near zones',()=>{
  const zones=[rect(60,60,26,30),rect(100,100,24,24)],pins=[{x:128,y:20},{x:128,y:128},{x:20,y:128}];
  const r=planner.plan({start:{x:12,y:72,heading:0},zones,pins,clearance:2,style:'spline'},square);assertSafe(r,zones);assert.equal(r.style,'spline');
  assert.ok(r.segments.some(s=>s.type==='curve'&&s.points.length===4),'cubic Bezier segments');
  for(let i=1;i<r.segments.length;i++){const a=r.segments[i-1],b=r.segments[i];assert.ok(planner.dist(a.points.at(-1),b.points[0])<1e-9);
    const t0={x:a.points.at(-1).x-a.points.at(-2).x,y:a.points.at(-1).y-a.points.at(-2).y},t1={x:b.points[1].x-b.points[0].x,y:b.points[1].y-b.points[0].y};
    const cross=t0.x*t1.y-t0.y*t1.x,dot=t0.x*t1.x+t0.y*t1.y;if(Math.hypot(t0.x,t0.y)>1e-6&&Math.hypot(t1.x,t1.y)>1e-6)assert.ok(Math.abs(cross)<1e-6*Math.hypot(t0.x,t0.y)*Math.hypot(t1.x,t1.y)&&dot>0,`G1 at joint ${i}`);}
  assert.ok(clearanceOf(r,zones)>=r.clearance/2-1e-3);
  // Tight space: tension must give way rather than cut into the zone.
  const tight=[rect(72,72,40,40)],t=planner.plan({start:{x:12,y:72,heading:0},zones:tight,pins:[{x:132,y:72}],clearance:.5,style:'spline'},square);assertSafe(t,tight);
});
test('pins with a pause end a leg; stops map to the segment that reaches each pin',()=>{
  const pins=[{x:60,y:30,wait:1.5,action:'Intake'},{x:110,y:40},{x:120,y:110,wait:0}],r=planner.plan({start:{x:12,y:72,heading:0},zones:[rect(72,72,16,16)],pins,clearance:1,style:'spline'},square);
  assert.equal(r.stops.length,3);r.stops.forEach((s,i)=>{assert.ok(planner.dist(r.segments[s.segment].points.at(-1),pins[i])<1e-6,`stop ${i}`);});
  assert.equal(r.stops[0].wait,1.5);assert.equal(r.stops[0].action,'Intake');
  const into=r.segments[r.stops[0].segment],out=r.segments[r.stops[0].segment+1];
  // A full stop: the curve arrives and leaves along its own chord (no tangent carried through).
  const chordIn={x:into.points.at(-1).x-into.points[0].x,y:into.points.at(-1).y-into.points[0].y},arrive={x:into.points.at(-1).x-into.points.at(-2).x,y:into.points.at(-1).y-into.points.at(-2).y};
  assert.ok(Math.abs(chordIn.x*arrive.y-chordIn.y*arrive.x)<1e-6*Math.hypot(chordIn.x,chordIn.y)*Math.hypot(arrive.x,arrive.y));assert.ok(out);
});
test('export: Pedro Java (compiles against Pedro core) and .pp with waits and zones',()=>{
  const exporter=require('../ui/sim-export.js'),zones=[rect(72,72,16,16,0,'z1')],start={x:12,y:72,heading:0},pins=[{x:60,y:30,wait:1.5,action:'Intake "front"'},{x:120,y:110}];
  const r=planner.plan({start,zones,pins,clearance:1,style:'spline'},square),layout={name:'Empty field 1',field:'empty',fieldName:'Empty field',start,zones};
  assert.deepEqual(exporter.legs(r).map(l=>l.pin),[1,2]);
  const java=exporter.java(r,layout,{className:'PlannedRoute',packageName:'org.firstinspires.ftc.teamcode',polygon:planner.polygon});
  assert.match(java,/public static final double\[\] WAIT_SECONDS = \{1\.5, 0\};/);assert.match(java,/"Intake \\"front\\""/);assert.match(java,/Paths\.curve\(v\(/);assert.match(java,/NO_GO_ZONES = \{\n {8}\{\{/);
  assert.throws(()=>exporter.java(r,layout,{className:'bad name',polygon:planner.polygon}),/Class name/);
  const pp=JSON.parse(exporter.pp(r,layout,{polygon:planner.polygon,timestamp:'t'}));
  assert.deepEqual(pp.startPoint,{x:12,y:72,heading:'constant',degrees:0});assert.equal(pp.lines.length,r.segments.length);
  const stopLine=pp.lines[r.stops[0].segment];assert.equal(stopLine.waitAfterMs,1500);assert.equal(stopLine.waitAfterName,'Intake "front"');
  assert.ok(pp.lines.some(l=>l.controlPoints?.length===2),'cubic control points');assert.equal(pp.shapes[0].vertices.length,4);
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
  const runtime=path.join(__dirname,'../sim-runtime'),javac=path.join(runtime,'java/bin',process.platform==='win32'?'javac.exe':'javac');
  if(!fs.existsSync(javac))return;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-export-')),src=path.join(dir,'org/firstinspires/ftc/teamcode');fs.mkdirSync(src,{recursive:true});fs.writeFileSync(path.join(src,'PlannedRoute.java'),java);
  execFileSync(javac,['-cp',path.join(runtime,'pedro/classes'),'-d',path.join(dir,'out'),path.join(src,'PlannedRoute.java')],{stdio:'pipe'});
  assert.ok(fs.existsSync(path.join(dir,'out/org/firstinspires/ftc/teamcode/PlannedRoute.class')));
});
test('free-form shapes: a two-point wall, a concave U whose pocket stays reachable, and a self-crossing outline',()=>{
  const wall=[{id:'w',type:'polygon',points:[{x:72,y:30},{x:72,y:114}]}];
  const r=plan(wall,[{x:130,y:72}],{start:{x:20,y:72,heading:0},clearance:1});assertSafe(r,wall);assert.ok(Math.max(...r.samples.map(p=>p.y))>114||Math.min(...r.samples.map(p=>p.y))<30,'goes around an end of the wall');
  assert.throws(()=>plan([{id:'w2',type:'polygon',points:[{x:72,y:16},{x:72,y:128}]}],[{x:130,y:72}],{start:{x:20,y:72,heading:0},clearance:1}),/No safe route/,'gaps narrower than the robot are refused');
  // U open to the right: the robot can drive into the pocket, which a convex hull would wrongly fill.
  const u={id:'u',type:'polygon',points:[{x:60,y:40},{x:120,y:40},{x:120,y:52},{x:76,y:52},{x:76,y:92},{x:120,y:92},{x:120,y:104},{x:60,y:104}]};
  assert.equal(planner.parts(planner.validateZone(u)).length,6,'concave outline split into triangles');
  const inside=plan([u],[{x:100,y:72}],{start:{x:132,y:72,heading:180},clearance:.5});assertSafe(inside,[u]);
  assert.ok(planner.safePose({x:100,y:72,heading:180},[u],square),'pocket is free space');
  assert.equal(planner.zoneHits(planner.body({x:68,y:72,heading:0},square),planner.validateZone(u)),true,'the U itself is solid');
  const bow={id:'b',type:'polygon',points:[{x:40,y:40},{x:80,y:80},{x:80,y:40},{x:40,y:80}]};assert.equal(planner.parts(planner.validateZone(bow)).length,1,'self-crossing falls back to its outline hull');
  assert.throws(()=>planner.validateZone({type:'polygon',points:[{x:1,y:1}]}),/2 to 40 points/);
});
test('spline: a dead-end pin the route leaves the way it came becomes a stop, never a zero-length tangent',()=>{
  // Pin 1 sits in a pocket: the route goes in and back out along the same line.
  const zones=[rect(72,100,60,8,0,'top'),rect(72,44,60,8,0,'bottom')],pins=[{x:80,y:72},{x:20,y:120}];
  const r=planner.plan({start:{x:20,y:72,heading:0},zones,pins,clearance:1,style:'spline'},square);assertSafe(r,zones);
  for(const s of r.segments){const a=s.points[0],b=s.points[1],c=s.points.at(-2),d=s.points.at(-1);assert.ok(planner.dist(a,b)>1e-6&&planner.dist(c,d)>1e-6,'non-zero end tangents');}
});
