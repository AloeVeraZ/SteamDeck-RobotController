'use strict';
// .pp headings as the Pedro Visualizer reads them: it turns a linear heading the short way and spreads it by arc
// length, so long turns, spins and turns along curves are written as piecewise linear pieces of at most 120° each.
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js');
const fp={front:8,rear:8,half:8},layoutOf=start=>({name:'Headings',field:'empty',width:144,height:144,start,zones:[]});
const heading=(start,pins)=>{const r=P.plan({start,zones:[],pins,style:'sharp',clearance:1},fp);return {r,h:JSON.parse(X.pp(r,layoutOf(start),{polygon:P.polygon,timestamp:'t'})).lines[0].heading};};
const pieces=h=>h.piecewiseHeading.segments;

test('a turn under 179° on a straight path stays a plain linear heading',()=>{
  const {h}=heading({x:24,y:24,heading:0},[{x:100,y:24,path:{rotate:'relative',angle:90}}]);
  assert.deepEqual(h,{type:'linear',startDeg:0,endDeg:90});
});

test('long turns, half turns and spins become pieces that each turn at most 120° the way the robot turns',()=>{
  for(const [path,total] of [[{rotate:'relative',angle:270},270],[{rotate:'relative',angle:-180},-180],[{rotate:'spin',spins:2},720],[{rotate:'spin',spins:-1},-360]]){
    const {h}=heading({x:24,y:40,heading:0},[{x:110,y:40,path}]),s=pieces(h);
    assert.equal(h.type,'piecewise',JSON.stringify(path));
    assert.equal(s[0].startProgress,0);assert.equal(s.at(-1).endProgress,1);
    s.forEach((p,i)=>{assert.equal(p.interpolationType,'linear');assert.ok(Math.abs(p.parameters.endDeg-p.parameters.startDeg)<=120+1e-9);assert.ok(p.endProgress>p.startProgress);if(i)assert.equal(p.startProgress,s[i-1].endProgress);if(i)assert.equal(p.parameters.startDeg,s[i-1].parameters.endDeg);});
    assert.equal(s[0].parameters.startDeg,0);assert.ok(Math.abs(s.at(-1).parameters.endDeg-total)<1e-6,JSON.stringify(path));
  }
});

test('a turn along a curve is placed by arc length where the robot reaches each angle',()=>{
  const {r,h}=heading({x:24,y:24,heading:0},[{x:110,y:100,path:{rotate:'relative',angle:120,shape:'custom',controls:[{x:90,y:20},{x:120,y:60}]}}]),s=pieces(h);
  assert.equal(h.type,'piecewise');assert.equal(s.length,12);
  // Pieces are equal in turn (equal steps of the curve parameter) but not in arc length on this uneven curve.
  const spans=s.map(p=>p.endProgress-p.startProgress);assert.ok(Math.max(...spans)-Math.min(...spans)>.02,String(spans));
  assert.ok(s.every(p=>Math.abs(p.parameters.endDeg-p.parameters.startDeg-10)<1e-6));assert.equal(r.segments[0].type,'curve');
});
