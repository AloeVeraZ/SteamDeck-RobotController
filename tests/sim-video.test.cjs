'use strict';
// Run videos (Run & review → Record, and Export → Run video): the parts of a run, the bar above the field and the crop.
const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('../ui/sim-video.js');

const run=phases=>phases.map((phase,i)=>({time:10+i*.5,truth:{x:0,y:0,heading:0},practice:phase?{phase,remaining:30-i*.5}:undefined}));

test('a full match splits into autonomous and teleop, without the transition',()=>{
  const s=V.sections(run(['auto','auto','auto','transition','transition','teleop','teleop','finished']));
  assert.deepEqual(s,{all:[0,7],auto:[0,2],teleop:[5,6]});
  assert.deepEqual(V.sections(run(['teleop','teleop'])),{all:[0,1],auto:null,teleop:[0,1]});
  assert.deepEqual(V.sections([]),{all:null,auto:null,teleop:null});
  // A run without a practice timer is the autonomous.
  assert.deepEqual(V.sections(run([null,null,null])),{all:[0,2],auto:[0,2],teleop:null});
});

test('MP4 is preferred and WebM is the fallback',()=>{
  assert.deepEqual(V.pickType(t=>t.startsWith('video/mp4')),{type:'video/mp4;codecs=avc1.640028',ext:'mp4'});
  assert.deepEqual(V.pickType(t=>t==='video/webm;codecs=vp8'),{type:'video/webm;codecs=vp8',ext:'webm'});
  assert.equal(V.pickType(()=>false),null);
  assert.equal(V.pickType(()=>{throw Error('no');}),null);
});

test('the bar shows the period clock, the name and the points',()=>{
  assert.deepEqual(V.caption({time:3,practice:{phase:'auto',remaining:27.2},mechanisms:{score:12}},{name:'Red auto'}),{phase:'Autonomous',color:'#2f8f5b',time:'0:28',name:'Red auto',score:'12 pts'});
  assert.equal(V.caption({time:3,practice:{phase:'teleop',remaining:95}}).time,'1:35');
  assert.equal(V.caption({time:3,practice:{phase:'teleop',remaining:0}}).time,'0:00');
  // No timer: seconds since filming started.
  assert.equal(V.caption({time:14.25},{start:10}).time,'4.3 s');
  assert.equal(V.caption(null).phase,'Run');
});

test('file names are safe and say which part of the run they are',()=>{
  assert.equal(V.title('Red: auto / cycles','auto'),'Red auto cycles - Autonomous');
  assert.equal(V.title('','teleop'),'Deck run - Teleop');
  assert.equal(V.title('../..\\x','all'),'x - Whole run');
});

test('the field is cropped from a scaled window picture, inside the picture, at even sizes',()=>{
  const c=V.crop({left:100,top:50,width:400,height:300},{width:1000,height:800},{width:2000,height:1600});
  assert.deepEqual(c,{x:200,y:100,width:800,height:600});
  const edge=V.crop({left:-10,top:700,width:400,height:300},{width:1000,height:800},{width:1000,height:800});
  assert.equal(edge.x,0);assert.equal(edge.y+edge.height,800);
  assert.deepEqual(V.outputSize(801,601),{width:802,height:602});assert.deepEqual(V.outputSize(1200,1000),{width:1200,height:1000});
  // Wider pictures are scaled to 1280, which the encoder keeps up with in real time.
  const big=V.outputSize(3000,2000);assert.equal(big.width,1280);assert.equal(big.height%2,0);
});
