'use strict';
// The Video workspace's file writers: the MP4 and WebM files are laid out as players expect, with every picture and
// sound block indexed. (Encoding itself needs the app's WebCodecs encoders and is checked in the app.)
const {test}=require('node:test'),assert=require('node:assert/strict');
const X=require('../ui/sim-encode.js');
const pictures=(n,fps=30)=>Array.from({length:n},(_,i)=>({type:i%60===0?'key':'delta',timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps),data:new Uint8Array(100+i%7).fill(i&255)}));

test('an MP4 holds every picture at the video frame rate, its index first',()=>{
  const m=X.mp4({video:{codec:'avc',width:1280,height:720,timescale:30000}});for(const p of pictures(150))m.addVideo(p);m.videoDescription=Uint8Array.of(1,0x64,0,0x28,0xff,0xe1,0,0);
  const bytes=m.finish(),info=X.inspectMp4(bytes);
  assert.deepEqual(info.boxes,['ftyp','moov','mdat'],'starts playing before the whole file has loaded');
  const [v]=info.tracks;assert.equal(v.kind,'vide');assert.equal(v.codec,'avc1');assert.equal(v.samples,150);assert.equal(v.keyframes,3);assert.deepEqual([v.width,v.height],[1280,720]);
  assert.ok(Math.abs(v.duration-5)<1e-6,'150 pictures at 30 a second last 5 s');assert.ok(Math.abs(info.duration-5)<.001);
  // The index points at the pictures where they are.
  const first=bytes.subarray(v.offset,v.offset+100);assert.ok(first.every(b=>b===0));
});

test('an MP4 with sound has a second track the length of the sound',()=>{
  const m=X.mp4({video:{codec:'avc',width:640,height:360,timescale:30000},audio:{codec:'aac',sampleRate:48000,channels:2}});
  for(const p of pictures(60))m.addVideo(p);for(let i=0;i<94;i++)m.addAudio({timestamp:Math.round(i*1024*1e6/48000),duration:Math.round(1024*1e6/48000),data:new Uint8Array(200)});
  m.videoDescription=Uint8Array.of(1,0x42,0,0x1f,0xff,0xe1,0,0);m.audioDescription=Uint8Array.of(0x11,0x90);
  const info=X.inspectMp4(m.finish()),[v,a]=info.tracks;assert.equal(a.kind,'soun');assert.equal(a.codec,'mp4a');assert.equal(a.samples,94);assert.ok(Math.abs(a.duration-94*1024/48000)<.001);assert.equal(v.samples,60);
  const o=X.mp4({video:{codec:'avc',width:640,height:360},audio:{codec:'opus',sampleRate:48000,channels:2}});for(const p of pictures(30))o.addVideo(p);o.addAudio({timestamp:0,duration:20000,data:new Uint8Array(50)});o.videoDescription=Uint8Array.of(1);
  assert.equal(X.inspectMp4(o.finish()).tracks[1].codec,'Opus');
});

test('pictures the encoder reordered get presentation offsets',()=>{
  const m=X.mp4({video:{codec:'avc',width:320,height:240,timescale:30000}}),p=pictures(4);[p[1],p[2]]=[p[2],p[1]];for(const x of p)m.addVideo(x);m.videoDescription=Uint8Array.of(1);
  const bytes=m.finish();assert.ok(Buffer.from(bytes).includes(Buffer.from('ctts')));
  const plain=X.mp4({video:{codec:'avc',width:320,height:240,timescale:30000}});for(const x of pictures(4))plain.addVideo(x);plain.videoDescription=Uint8Array.of(1);assert.ok(!Buffer.from(plain.finish()).includes(Buffer.from('ctts')));
});

test('a WebM has its tracks, every block, cues at key pictures and the length',()=>{
  const m=X.webm({video:{codec:'vp9',width:1920,height:1080},audio:{codec:'opus',sampleRate:48000,channels:2}});for(const p of pictures(180))m.addVideo(p);
  for(let i=0;i<300;i++)m.addAudio({timestamp:i*20000,duration:20000,data:new Uint8Array(60)});m.audioDescription=new Uint8Array(19);
  const info=X.inspectWebm(m.finish());assert.deepEqual(info.codecs,['V_VP9','A_OPUS']);assert.deepEqual([info.width,info.height],[1920,1080]);assert.equal(info.blocks,480);assert.equal(info.keys,3);
  assert.ok(Math.abs(info.duration-6)<.05,`${info.duration} s`);
});

test('a broken file is reported, not read as good',()=>{
  const m=X.mp4({video:{codec:'avc',width:320,height:240}});for(const p of pictures(10))m.addVideo(p);m.videoDescription=Uint8Array.of(1);
  const bytes=m.finish();assert.throws(()=>X.inspectMp4(bytes.subarray(0,bytes.length-50)),/Broken MP4|outside/);
  assert.throws(()=>X.webm({video:{codec:'vp8',width:2,height:2}}).finish(),/No pictures/);assert.throws(()=>X.inspectWebm(Uint8Array.of(0,1,2)),/Not a WebM/);
});

test('only formats the system encoder accepts are offered',async()=>{
  const env={VideoEncoder:{isConfigSupported:async c=>({supported:/^vp8$|^avc1\.42/.test(c.codec)})},AudioEncoder:{isConfigSupported:async c=>({supported:c.codec==='opus'})}};
  const p=await X.probe({width:1920,height:1080,fps:30},env);assert.deepEqual(p.video.map(f=>[f.container,f.codec,f.config.codec]),[['mp4','avc','avc1.42e028'],['webm','vp8','vp8']]);
  assert.equal(p.audio.mp4.codec,'opus');assert.equal(p.audio.webm.codec,'opus');
  assert.deepEqual((await X.probe({width:1280,height:720,fps:30},{})).video,[]);assert.equal(X.LEVEL(1280,720,30),'1f');assert.equal(X.LEVEL(1920,1080,60),'2a');assert.equal(X.LEVEL(3840,2160,30),'33');
});
