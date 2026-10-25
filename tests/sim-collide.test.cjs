'use strict';
// Sweeping a moving part to find what it hits: new contacts only, against oriented boxes.
const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('../ui/sim-discovery.js'),K=require('../ui/sim-kinematics.js'),C=require('../ui/sim-collide.js'),S=require('./fixtures/mechanism-shapes.cjs');
test('an arm turning toward a post hits it at the angle geometry says; parts assembled together do not count',()=>{
  const b=S.builder(),root=b.node('Robot'),base=b.node('Base',root),arm=b.node('Arm',root);
  b.add(b.node('Plate',base),S.box([-2,-2,-1],[2,2,0]));const post=b.add(b.node('Post',base),S.box([-.5,9.5,0],[.5,10.5,6]));
  const bar=b.add(b.node('Bar',arm),S.box([0,-.25,1],[12,.25,1.5]));b.add(b.node('Hub',arm),S.cylinder({center:[0,0,.5],axis:[0,0,1],r:.6,length:1}));
  const ctx=D.prepare(b.arrays()),model=K.sanitize({joints:[{id:'arm',type:'revolute',axis:[0,0,1],parts:['Robot/Arm'],lower:-170,upper:170}]});
  const s=C.sweep(ctx,model,'arm',{lower:-170,upper:170,step:1});
  // The bar's leading edge (0.25 in off its centre line) first reaches the post's nearest corner (0.5, 9.5).
  const hit=s.hits.find(h=>h.at>0);assert.ok(hit,'hits the post turning left');assert.ok(hit.parts.every(([a,o])=>a===bar&&o===post),'the bar and the post');
  const want=(Math.atan2(9.5,.5)-Math.asin(.25/Math.hypot(.5,9.5)))*180/Math.PI;assert.ok(hit.at>=want&&hit.at-want<1.01,`near ${want.toFixed(1)}° (${hit.at}°)`);
  assert.equal(s.free[0],-170,'the other way it turns freely to its limit');
  assert.ok(!s.hits.some(h=>h.parts.some(([,o])=>o!==post)),'the hub sitting on the plate is assembled, not a contact');
});
