'use strict';
// The Video workspace's five cameras: paths worked out from a recorded run, the same every time, smooth, and each
// watching what it is for.
const {test}=require('node:test'),assert=require('node:assert/strict');
const K=require('../ui/sim-cameras.js'),{videoRun,context}=require('./fixtures/video-run.cjs');
const frames=videoRun(),base=context(),ctx={...base,rig:K.rig(base)};
const at=(track,i)=>({p:[...track.slice(i*7,i*7+3)],l:[...track.slice(i*7+3,i*7+6)],fov:track[i*7+6]});
const index=t=>Math.round(t*30);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

test('five cameras, the first being the original follow camera, each with its own key',()=>{
  assert.deepEqual(K.IDS,['main','mech','turret','chase','intake']);assert.deepEqual(K.CAMERAS.map(c=>c.key),['1','2','3','4','5']);
  assert.equal(K.CAMERAS[0].modes,undefined,'camera 1 has no modes: it stays the original');
  assert.deepEqual(K.settings({main:{fov:20},turret:{mode:'fixed',distance:9,fov:'x'}}).turret,{mode:'fixed',distance:2.5,height:1,swing:0,fov:60});
  // The turret camera's old "follows the shot" mode is gone: an edit saved with it gets the camera inside the turret.
  assert.equal(K.settings({turret:{mode:'projectile'}}).turret.mode,'pov');
  assert.deepEqual(K.settings({}).main,{fov:50});
});

test('a camera path depends only on the run: the same twice, and seeking lands on the recorded picture',()=>{
  const a=K.paths(frames,ctx),b=K.paths(frames,ctx);
  for(const id of K.IDS){assert.equal(a[id].length,frames.length*7);assert.ok(a[id].every(Number.isFinite),id+' has no gaps');assert.deepEqual([...a[id]],[...b[id]],id+' is deterministic');}
  const i=index(5.5),p=K.poseAt(a.turret,frames,frames[i].time);assert.deepEqual(p,at(a.turret,i));
  const mid=K.poseAt(a.chase,frames,(frames[i].time+frames[i+1].time)/2),A=at(a.chase,i),B=at(a.chase,i+1);
  for(let k=0;k<3;k++)assert.ok(Math.abs(mid.p[k]-(A.p[k]+B.p[k])/2)<1e-3,'between frames the pose is in between');
  assert.equal(K.indexAt(frames,0),0);assert.equal(K.indexAt(frames,999),frames.length-1);
});

test('camera 1 works out exactly as the original follow camera did',()=>{
  // The original stepped a follow state with the time between pictures; mainStep is that code.
  const s={},track=K.paths(frames,ctx).main;frames.forEach((f,i)=>{const p=K.mainStep(s,{frame:f,aim:ctx.aim,footprint:ctx.footprint,bounds:ctx.bounds},i?f.time-frames[i-1].time:0);
    assert.deepEqual(p.p.map(v=>Math.fround(v)),at(track,i).p);});
  // Behind and above the robot while it drives forward along +x.
  const i=index(2.5),p=at(track,i),r=frames[i].truth;assert.ok(p.p[0]<r.x-20&&p.p[2]>30);
});

test('no camera jumps between frames: smoothed paths move a little at a time',()=>{
  const all=K.paths(frames,ctx);
  for(const id of ['main','mech','chase','intake','turret'])for(let i=1;i<frames.length;i++){const a=at(all[id],i-1),b=at(all[id],i);
    assert.ok(dist(a.p,b.p)<4,`${id} moves ${dist(a.p,b.p).toFixed(2)} in at frame ${i}`);}
});

const look=(track,i)=>{const p=at(track,i);return Math.atan2(p.l[1]-p.p[1],p.l[0]-p.p[0])*180/Math.PI;};
const pitch=(track,i)=>{const p=at(track,i);return Math.atan2(p.l[2]-p.p[2],Math.hypot(p.l[0]-p.p[0],p.l[1]-p.p[1]))*180/Math.PI;};
test('the turret camera rides inside the turret, looking where it aims, and holds steady through a volley',()=>{
  const pov=K.path('turret',frames,ctx,K.DEFAULTS.turret);assert.equal(K.DEFAULTS.turret.mode,'pov');
  // Just over the turret (the robot's top) and on it: a few inches behind its pivot, whichever way it turns.
  for(const t of [.5,2.5,5.5,6.5]){const i=index(t),r=frames[i].truth,c=at(pov,i),d=Math.hypot(c.p[0]-r.x,c.p[1]-r.y);assert.ok(d>2.5&&d<4.5,`on the turret at ${t} s (${d.toFixed(2)} in)`);assert.ok(c.p[2]>ctx.robot.heightIn+1&&c.p[2]<ctx.robot.heightIn+4,`just over the robot's top at ${t} s`);}
  assert.ok(Math.abs(look(pov,index(4.5)))<3,'before the swing it looks forward');
  assert.ok(Math.abs(look(pov,index(6.4))-120)<3,`after the swing it looks along the turret (${look(pov,index(6.4)).toFixed(1)}°)`);
  // Shots go out at 6.3 s and 6.7 s: the picture does not go after them. The camera stays put and the view only
  // finishes tilting up to the goal, slowly and one way (no bob up and down).
  let tilt=0;for(let i=index(6.2);i<index(7.2);i++){const a=at(pov,i),b=at(pov,i+1);assert.ok(dist(a.p,b.p)<1e-3,'the camera stays put');
    const yaw=Math.abs(look(pov,i+1)-look(pov,i)),d=pitch(pov,i+1)-pitch(pov,i);assert.ok(yaw<.05,`the view turns ${yaw.toFixed(2)}° at frame ${i}`);
    assert.ok(Math.abs(d)<.6&&d>=-1e-3,`the view tilts ${d.toFixed(2)}° at frame ${i}`);tilt+=d;}
  assert.ok(tilt<6,`it tilts ${tilt.toFixed(1)}° in all through the volley`);
  assert.ok(pitch(pov,index(6.8))>pitch(pov,index(2))+5,'it tilts up to the goal it aims at');
  // Behind the turret is the camera it was: turning with the turret a fixed distance behind it.
  const follow=K.path('turret',frames,ctx,{...K.DEFAULTS.turret,mode:'follow'});
  assert.ok(Math.abs(look(follow,index(4.5)))<15,'before the swing it looks forward');
  assert.ok(Math.abs(look(follow,index(6.4))-120)<15,`after the swing it looks along the turret (${look(follow,index(6.4)).toFixed(1)}°)`);
  const r=frames[index(5.5)].truth,c=at(follow,index(5.5));assert.ok(Math.hypot(c.p[0]-r.x,c.p[1]-r.y)<22);
  const fixed=K.path('turret',frames,ctx,{...K.DEFAULTS.turret,mode:'fixed'});assert.ok(Math.abs(look(fixed,index(6.4)))<8,'fixed does not turn with the turret');
});

test('with two shooters the turret camera rides the one that fires',()=>{
  // The nectar shooter at the front fires red pieces; the pollen one at the back fires none.
  const two={...base,aim:{...base.aim,shooters:[{type:'turret',mount:'back',facing:'front',pieces:'pollen'},{type:'turret',mount:'front',facing:'front',pieces:'nectar'}]}};
  const red=videoRun().map(f=>({...f,fieldState:{...f.fieldState,balls:f.fieldState.balls.map(b=>b.state.kind==='flight'?{...b,color:'red'}:b)}}));
  // Each shooter's pivot is 4.7 in from the centre; the camera sits 4 in behind the one it rides.
  const c=at(K.path('turret',red,{...two,rig:K.rig(two)},K.DEFAULTS.turret),index(.5)),r=red[index(.5)].truth;assert.ok(Math.abs(c.p[0]-r.x-.7)<.3,`over the front shooter (${(c.p[0]-r.x).toFixed(2)})`);
  const c2=at(K.path('turret',videoRun(),{...two,rig:K.rig(two)},K.DEFAULTS.turret),index(.5));assert.ok(Math.abs(c2.p[0]-r.x+8.7)<.3,`yellow pieces: over the back one (${(c2.p[0]-r.x).toFixed(2)})`);
});

test('the rear chase camera trails the chassis, further back at speed; the intake camera looks back at the intake',()=>{
  const all=K.paths(frames,ctx),still=at(all.chase,index(.9)),fast=at(all.chase,index(2.8)),r0=frames[index(.9)].truth,r1=frames[index(2.8)].truth;
  assert.ok(still.p[0]<r0.x&&fast.p[0]<r1.x,'behind the robot');assert.ok(r1.x-fast.p[0]>r0.x-still.p[0]+2,'further back while driving fast');
  const ic=at(all.intake,index(.5)),r=frames[index(.5)].truth;assert.ok(ic.p[0]>r.x+ctx.footprint.front,'in front of the robot');assert.ok(ic.l[0]<ic.p[0],'looking back at it');
  const fx=K.path('intake',frames,ctx,{...K.DEFAULTS.intake,mode:'fixed'});assert.ok(Math.abs(at(fx,index(5)).p[1]-frames[index(5)].truth.y)<1e-3,'fixed close-up is rigid on the robot');
});

test('the front-right camera sits at the front-right corner on the ramp, and leans to the flower it reaches',()=>{
  const all=K.paths(frames,ctx),c=at(all.mech,index(.5)),r=frames[index(.5)].truth;
  assert.ok(c.p[0]>r.x+ctx.footprint.front&&c.p[1]<r.y-ctx.footprint.half,'front-right of the robot');
  const fixedLook=at(K.path('mech',frames,ctx,{...K.DEFAULTS.mech,mode:'fixed'}),index(.5)).l;assert.ok(Math.abs(fixedLook[0]-(r.x+ctx.rig.ramp.point[0]))<1e-3,'looking at the ramp');
  const fixed=K.path('mech',frames,ctx,{...K.DEFAULTS.mech,mode:'fixed'}),i=index(2);assert.ok(dist(at(all.mech,i).l,at(fixed,i).l)>.5,'tracking leans towards the piece ahead');
});

test('cameras stay out of the wall when the robot drives up to it: inside it, or up over its top',()=>{
  // The robot ends 2 in from the wall, so the front-right and intake cameras cannot sit where they were designed to.
  const near=videoRun().map(f=>({...f,truth:{...f.truth,x:f.truth.x+48}}));const all=K.paths(near,ctx);
  for(const id of K.IDS)for(let i=0;i<near.length;i++){const p=at(all[id],i).p,inside=p[0]<=ctx.bounds.x1-2.4;
    assert.ok(inside||p[2]>=14.4&&p[0]<=ctx.bounds.x1+32,`${id} at ${p.map(v=>v.toFixed(1))} (frame ${i})`);
    if(i){const q=at(all[id],i-1).p;assert.ok(dist(p,q)<4,`${id} moves ${dist(p,q).toFixed(2)} in at frame ${i}`);}}
  // Where nothing is in the way they are as designed.
  const free=K.paths(frames,ctx);for(const id of ['mech','intake']){const a=at(all[id],0),b=at(free[id],0);assert.ok(Math.abs(a.p[0]-48-b.p[0])<1e-3&&Math.abs(a.p[1]-b.p[1])<1e-3&&Math.abs(a.p[2]-b.p[2])<1e-3,`${id} is as designed away from the wall`);}
});

test('the field becomes boxes: a slanting hive leg a slim one, each flower one round its posts and pollen',()=>{
  // A 1 × 1 × 40 in bar leaning 30° from upright, as an engine structure part (its 8 corners).
  const lean=30*Math.PI/180,points=[];for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [0,40])points.push(60+x*Math.cos(lean)+z*Math.sin(lean),72+y,z*Math.cos(lean)-x*Math.sin(lean));
  const post=(x,y)=>[x,y,0,x+1,y,0,x,y+1,0,x+1,y+1,0,x,y,21,x+1,y,21,x,y+1,21,x+1,y+1,21];
  const F=K.field({field:'biobuzz',bounds:ctx.bounds,structureParts:[{name:'hive_red_frame_a_frame_leg',points},{name:'flower_0_flower_hips_pipe',points:post(2,46)},{name:'flower_0_flower_hips_pipe_3',points:post(5,49)}],trays:{red:{pivot:[59,72,44]}}});
  assert.equal(F.solids.length,2);assert.equal(F.goalZ,40);assert.equal(F.wall,12);
  const [leg,flower]=F.solids,volume=o=>8*o.e[0]*o.e[1]*o.e[2];assert.ok(volume(leg)<45,`the leg's box holds ${volume(leg).toFixed(0)} in³, not its ${(21*1*35).toFixed(0)} in³ slope`);
  assert.deepEqual(flower.e.map(v=>+v.toFixed(2)),[2,2,10.5]);assert.deepEqual(flower.c.map(v=>+v.toFixed(2)),[4,48,10.5]);
});

test('a camera moves round a structure in its way: never inside it, still seeing what it watches, gliding there',()=>{
  // A flower-sized post stands where the intake camera would be once the robot has driven forward.
  const post={c:[110,30,11],u:[[1,0,0],[0,1,0],[0,0,1]],e:[2.25,2.25,11],r:11.5},F={bounds:ctx.bounds,wall:12,solids:[post],goalZ:40},C={...ctx,field:F};
  const free=K.path('intake',frames,ctx,K.DEFAULTS.intake),moved=K.path('intake',frames,C,K.DEFAULTS.intake),R=ctx.rig;
  const inside=(P,g=0)=>P.every((v,k)=>Math.abs(v-post.c[k])<post.e[k]+g);
  assert.ok(frames.some((_,i)=>inside(at(free,i).p,2.5)),'as designed it would be in the post');
  for(let i=0;i<frames.length;i++){const P=at(moved,i).p,t=frames[i].truth,h=t.heading*Math.PI/180,S=[t.x+R.intake.point[0]*Math.cos(h),t.y+R.intake.point[0]*Math.sin(h),R.intake.point[2]];
    assert.ok(!inside(P,1.5),`frame ${i}: the camera is not in the post`);
    // Nothing of the post between the camera and the intake (sampled along the line).
    for(let k=1;k<20;k++){const q=S.map((v,j)=>v+(P[j]-v)*k/20);assert.ok(!inside(q),`frame ${i}: the post hides the intake`);}
    if(i)assert.ok(dist(P,at(moved,i-1).p)<4,`frame ${i}: it glides`);}
  assert.deepEqual([...moved.slice(0,7*15)],[...free.slice(0,7*15)],'far from the post it is the camera as designed');
});

test('the rig comes from the mechanisms and the CAD parts',()=>{
  const R=K.rig({...base,parts:[{role:'intake',kind:'ramp',box:{x0:7,x1:11,y0:-6,y1:6,z0:0,z1:4}}]});
  assert.deepEqual(R.ramp.point,[9,0,2]);assert.equal(R.intake.side,'front');assert.equal(R.shooters.length,1);
  const bare=K.rig({footprint:{front:9,rear:9,half:9}});assert.equal(bare.ramp,null);assert.deepEqual(bare.intake.point,[8,0,3]);assert.equal(bare.hasMechanisms,false);
});
