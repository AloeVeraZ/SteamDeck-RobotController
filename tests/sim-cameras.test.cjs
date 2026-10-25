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
  assert.deepEqual(K.settings({main:{fov:20},turret:{mode:'fixed',distance:9,fov:'x'}}).turret,{mode:'fixed',distance:2.5,height:1,swing:0,fov:56});
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

test('the turret camera turns with the turret and keeps it in view; it follows a shot through the air',()=>{
  const follow=K.path('turret',frames,ctx,{...K.DEFAULTS.turret,mode:'follow'});
  const look=(track,i)=>{const p=at(track,i);return Math.atan2(p.l[1]-p.p[1],p.l[0]-p.p[0])*180/Math.PI;};
  assert.ok(Math.abs(look(follow,index(4.5)))<15,'before the swing it looks forward');
  assert.ok(Math.abs(look(follow,index(6.4))-120)<15,`after the swing it looks along the turret (${look(follow,index(6.4)).toFixed(1)}°)`);
  // The turret stays near the middle of the picture: the camera is a fixed distance from the turret.
  const r=frames[index(5.5)].truth,c=at(follow,index(5.5));assert.ok(Math.hypot(c.p[0]-r.x,c.p[1]-r.y)<22);
  const shot=K.path('turret',frames,ctx,K.DEFAULTS.turret),i=index(6.9),ball=frames[i].fieldState.balls.find(b=>b.state.kind==='flight');
  const toBall=p=>dist(p.l,[ball.pos.x+72,ball.pos.y+72,ball.z]);assert.ok(toBall(at(shot,i))<toBall(at(follow,i))-5,'following the shot looks towards the piece in the air');
  const fixed=K.path('turret',frames,ctx,{...K.DEFAULTS.turret,mode:'fixed'});assert.ok(Math.abs(look(fixed,index(6.4)))<8,'fixed does not turn with the turret');
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

test('cameras stay inside the field near a wall',()=>{
  const near=videoRun().map(f=>({...f,truth:{...f.truth,x:f.truth.x+60}}));const all=K.paths(near,ctx);
  for(const id of ['mech','intake'])for(let i=0;i<near.length;i++){const p=at(all[id],i).p;assert.ok(p[0]<=ctx.bounds.x1+1.6,`${id} x ${p[0]}`);}
});

test('the rig comes from the mechanisms and the CAD parts',()=>{
  const R=K.rig({...base,parts:[{role:'intake',kind:'ramp',box:{x0:7,x1:11,y0:-6,y1:6,z0:0,z1:4}}]});
  assert.deepEqual(R.ramp.point,[9,0,2]);assert.equal(R.intake.side,'front');assert.equal(R.shooters.length,1);
  const bare=K.rig({footprint:{front:9,rear:9,half:9}});assert.equal(bare.ramp,null);assert.deepEqual(bare.intake.point,[8,0,3]);assert.equal(bare.hasMechanisms,false);
});
