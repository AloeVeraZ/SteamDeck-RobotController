'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),model=require('../ui/sim-robot-model.js');
const det=([a,b,c])=>a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
test('every front/top choice gives a proper rotation (right-handed, no mirroring)',()=>{
  for(const front of Object.keys(model.AXES))for(const top of Object.keys(model.AXES)){
    const o=model.orientation({front,top}),r=model.rows(o);assert.equal(det(r),1,`${front}/${top}`);
  }
  assert.deepEqual(model.orientation({front:'+x',top:'-x'}),{front:'+x',top:'+z'},'parallel choices fall back');
});
test('view cube: marking a side as front or top re-maps the model and keeps the other choice',()=>{
  let o={front:'+x',top:'+z'};
  // The model's real front currently shows on the cube's LEFT side (model +y).
  assert.equal(model.modelAxisAt(o,'left'),'+y');o=model.setFront(o,'left');assert.deepEqual(o,{front:'+y',top:'+z'});
  assert.equal(model.modelAxisAt(o,'front'),'+y');assert.equal(model.modelAxisAt(o,'right'),'+x');
  // A Y-up CAD export: the model's top shows on the cube's BACK side.
  o=model.setTop({front:'+x',top:'+z'},'back');assert.deepEqual(o,{front:'+z',top:'-x'},'top taken from back; old front was parallel, so front becomes old top');
  o=model.setTop({front:'+z',top:'+x'},'left');assert.equal(o.front,'+z');assert.equal(model.modelAxisAt(o,'top'),model.modelAxisAt({front:'+z',top:'+x'},'left'));
  // Choosing the current top as front swaps them.
  assert.deepEqual(model.setFront({front:'+x',top:'+z'},'top'),{front:'+z',top:'+x'});
});
test('stored model metadata is validated',()=>{
  assert.equal(model.meta(null),null);assert.equal(model.meta({id:'../x.glb'}),null);
  assert.deepEqual(model.meta({id:'0123456789abcdef0123456789abcdef.glb',name:'Bot',units:'mm',front:'-y',top:'+x',source:'step'}),{id:'0123456789abcdef0123456789abcdef.glb',name:'Bot',units:'mm',front:'-y',top:'+x',source:'step'});
  assert.equal(model.meta({id:'0123456789abcdef0123456789abcdef.glb',units:'furlong'}).units,'in');
});
