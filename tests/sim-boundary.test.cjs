'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../ui/sim-planner.js');

test('boundary tolerance keeps rotated obstacle edges usable without admitting interior points',()=>{
  for(const angle of [0,17,45,89]){
    const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
    const point=(x,y)=>({x:72+x*c-y*s,y:72+x*s+y*c});
    const poly=[point(-10,-10),point(10,-10),point(10,10),point(-10,10)];
    for(const side of [-1,1])for(const offset of [-2*P.TOL,-P.TOL/2,0,P.TOL/2,2*P.TOL]){
      const vertical=point(side*(10-offset),0),horizontal=point(0,side*(10-offset));
      for(const p of [vertical,horizontal]){
        assert.equal(P.inside(p,poly),offset>P.TOL,`inside at ${angle} degrees, offset ${offset}`);
        assert.equal(P.contains(p,poly),offset>=0,`contains at ${angle} degrees, offset ${offset}`);
      }
    }
    for(const corner of poly){assert.equal(P.contains(corner,poly),true);assert.equal(P.contains(corner,poly,true),false);}
  }
});
