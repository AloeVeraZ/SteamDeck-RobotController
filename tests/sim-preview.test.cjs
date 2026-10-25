'use strict';
// Route preview (Plan → Paths): poses along the planned route without physics.
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../ui/sim-planner.js');
const fp={front:8,rear:8,half:8},near=(a,b,eps=1e-6)=>Math.abs(a-b)<eps;

test('preview poses run from the start to the last pin, with distance driven and turns on the spot',()=>{
  const start={x:24,y:24,heading:0},route=P.plan({start,zones:[],pins:[{x:64,y:24,turn:90},{x:64,y:84}],style:'sharp',clearance:1},fp);
  const poses=P.previewPoses(route,fp,start),first=poses[0],last=poses.at(-1);
  assert.deepEqual([first.x,first.y,first.heading,first.d,first.s],[24,24,0,0,0]);
  assert.ok(near(last.x,64,1e-6)&&near(last.y,84,1e-6));assert.ok(near(last.d,100,1e-6),String(last.d));
  // The pin's turn happens on the spot at (64, 24) and takes scrubber distance but no driving distance.
  const turning=poses.filter(p=>p.turning);assert.ok(turning.length>=18);assert.ok(turning.every(p=>near(p.x,64)&&near(p.y,24)&&near(p.d,40)));
  assert.ok(near(turning.at(-1).heading,90));assert.equal(turning[0].path,0);assert.equal(poses.at(-1).path,1);
  assert.ok(last.s>last.d+10,'turns add scrubber distance');
  for(let i=1;i<poses.length;i++)assert.ok(poses[i].s>=poses[i-1].s&&poses[i].d>=poses[i-1].d);
});

test('preview stands still at a pin while it pauses and runs its action; action paths carry theirs while driving',()=>{
  const start={x:24,y:24,heading:0},route=P.plan({start,zones:[],pins:[{x:64,y:24,wait:1,action:'Shoot',cell:'other'},{x:64,y:84,path:{kind:'action',action:'Intake'}}],style:'sharp',clearance:1},fp);
  const poses=P.previewPoses(route,fp,start),pause=poses.filter(p=>p.action===''),shot=poses.filter(p=>p.action==='Shoot');
  assert.ok(pause.length&&shot.length);assert.ok([...pause,...shot].every(p=>near(p.x,64)&&near(p.y,24)&&near(p.d,40)));
  assert.equal(shot[0].act,0);assert.equal(shot.at(-1).act,1);assert.equal(shot[0].cell,'other');
  assert.ok(near(pause.at(-1).s-pause[0].s,P.PREVIEW_SPEED),'a 1 s pause takes 1 s of scrubber');assert.ok(near(shot.at(-1).s-shot[0].s,1.5*P.PREVIEW_SPEED),'shoot until done shows 1.5 s');
  const driving=poses.filter(p=>p.action==='Intake');assert.ok(driving.length>10&&driving.every(p=>p.act===undefined&&p.path===1));
  for(let i=1;i<poses.length;i++)assert.ok(poses[i].s>=poses[i-1].s);
});

test('preview headings stay continuous: a spin path adds up to full turns',()=>{
  const start={x:30,y:40,heading:0},route=P.plan({start,zones:[],pins:[{x:110,y:40,path:{rotate:'spin',spins:2}}],clearance:2},fp);
  const poses=P.previewPoses(route,fp,start);
  assert.ok(near(poses.at(-1).heading-poses[0].heading,720,1),String(poses.at(-1).heading));
  for(let i=1;i<poses.length;i++)assert.ok(Math.abs(poses[i].heading-poses[i-1].heading)<=5+1e-9,`step ${i}`);
  assert.deepEqual(P.previewPoses(null,fp),[]);assert.deepEqual(P.previewPoses({segments:[]},fp),[]);
});
