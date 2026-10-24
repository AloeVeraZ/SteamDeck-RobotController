'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),field=require('../ui/field-model.js');
test('default pose touches a wall; graph coordinates use bottom-left inches',()=>{
  assert.deepEqual(field.edgePose(),{x:9,y:72,heading:0});
  assert.deepEqual(field.fromGraph(48,36),{x:48,y:108,heading:0});
  assert.deepEqual(field.fromGraph(72,72),{x:72,y:72,heading:0});
  assert.deepEqual(field.fromGraph(-10,200),{x:9,y:9,heading:0});
});
test('rotated robot fits inside all four walls without snapping interior poses',()=>{
  for(const angle of [0,30,45,90,180,270,-90,450]){
    const edge=field.inset(angle),pose=field.constrain({x:0,y:144,heading:angle});
    assert.ok(Math.abs(pose.x-edge)<1e-9);assert.ok(Math.abs(pose.y-(144-edge))<1e-9);
    assert.deepEqual(field.validate({x:37.25,y:82.75,heading:angle}),{x:37.25,y:82.75,heading:field.heading(angle)});
  }
  assert.throws(()=>field.validate({x:9,y:9,heading:45}),/footprint/);
});
test('stored starting pose is versioned and validates untrusted or obsolete device storage',()=>{
  const pose={x:34.5,y:98,heading:270};assert.deepEqual(field.restore(field.serialize(pose)),pose);
  for(const raw of [null,'','bad','{}','null','{"version":2,"start":{}}','{"version":1,"start":{"x":0,"y":72,"heading":0}}','{"version":1,"start":{"x":"72","y":72,"heading":0}}'])assert.equal(field.restore(raw),null);
  for(const value of [NaN,Infinity,-Infinity,undefined]){
    assert.throws(()=>field.validate({x:value,y:72,heading:0}));assert.throws(()=>field.validate({x:72,y:72,heading:value}));
  }
});
test('turning a robot parked on a wall pivots it along that wall',()=>{
  const g={footprint:{front:9,rear:9,half:7},bounds:{x0:0,y0:0,x1:144,y1:144}},wall=field.edgePose(0,g);
  for(const angle of [70,45,90,-30,200]){
    const pose=field.turn(wall,angle,g),[x0]=field.extents(angle,g.footprint);
    assert.ok(Math.abs(pose.x+x0)<.06,`flush at ${angle}°`);assert.equal(pose.y,wall.y);assert.doesNotThrow(()=>field.validate(pose,g));
  }
  // A gap left by an earlier turn closes again; interior poses only turn in place.
  assert.ok(Math.abs(field.turn({x:10,y:30,heading:0},70,g).x+field.extents(70,g.footprint)[0])<.06);
  assert.deepEqual(field.turn({x:60,y:60,heading:0},70,g),{x:60,y:60,heading:70});
  const corner=field.turn(field.constrain({x:0,y:0,heading:0},g),30,g),[a0,,b0]=field.extents(30,g.footprint);
  assert.ok(Math.abs(corner.x+a0)<.06&&Math.abs(corner.y+b0)<.06);
});
