'use strict';
// Moving a route to the other alliance. BIOBUZZ is point-symmetric about the field centre (the red GARDEN
// bottom-left matches the blue one top-right, F1 matches F3), so the other alliance's route is the same
// route turned 180° about the centre. An empty field has no alliances; there it is mirrored left-right.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../ui/sim-planner.js');
const near=(a,b,eps=1e-9)=>Math.abs(a-b)<eps,norm=d=>((d%360)+540)%360-180,r=v=>Math.round(v*1e6)/1e6,R=o=>JSON.parse(JSON.stringify(o),(k,v)=>typeof v==='number'?r(v):v);

const red={start:{x:9.1,y:26,heading:-90},zones:[{id:'b',type:'rect',x:30,y:40,width:10,height:4,angle:20},{id:'t',type:'triangle',x:50,y:20,width:6,height:8,angle:30},{id:'p',type:'polygon',points:[{x:10,y:10},{x:20,y:10},{x:15,y:18}]},{id:'c',type:'circle',x:40,y:100,radius:3}],
  pins:[{x:9.3,y:22,wait:0,action:'Shoot',turn:45,turnMode:'absolute',path:{kind:'action',action:'Spin up',rotate:'turn',heading:-180,controls:[{x:12,y:30},{x:20,y:60}]}},
    {x:24,y:106,turn:30,turnMode:'relative',target:{x:60,y:60},cell:'other',path:{rotate:'relative',angle:90}},
    {x:16,y:107,path:{rotate:'track',target:{x:59.25,y:58.56}}},{x:20,y:90,path:{rotate:'spin',spins:-1,power:.5}},{x:30,y:80,turnMode:'track',turn:0,target:{x:60,y:72},path:{rotate:'tangent'}}]};

test('BIOBUZZ: the other alliance gets the route turned 180° about the field centre',()=>{
  const blue=P.allianceRoute(red,{mode:'rotate',width:144,height:144});
  assert.deepEqual(R([blue.start.x,blue.start.y]),R([144-9.1,144-26]));assert.equal(blue.start.heading,90);
  const [a,b,c,d,e]=blue.pins;
  assert.deepEqual(R([a.x,a.y]),R([144-9.3,144-22]));assert.equal(norm(a.turn),norm(45+180));assert.equal(a.turnMode,'absolute');assert.equal(a.action,'Shoot');
  assert.equal(norm(a.path.heading),0);assert.deepEqual(a.path.controls,[{x:132,y:114},{x:124,y:84}]);assert.equal(a.path.kind,'action');
  // Relative turns, spins and alliance-relative cells read the same from the other side.
  assert.equal(b.turn,30);assert.equal(b.turnMode,'relative');assert.equal(b.path.angle,90);assert.equal(b.cell,'other');assert.deepEqual(b.target,{x:84,y:84});
  assert.deepEqual(R(c.path.target),R({x:144-59.25,y:144-58.56}));assert.equal(d.path.spins,-1);assert.equal(d.path.power,.5);assert.equal(e.path.rotate,'tangent');assert.deepEqual(e.target,{x:84,y:72});
  // Obstacles turn with the field.
  const box=blue.zones.find(z=>z.id==='b');assert.deepEqual([box.x,box.y],[114,104]);assert.equal(norm(box.angle),norm(200));
  assert.deepEqual(blue.zones.find(z=>z.id==='p').points,[{x:134,y:134},{x:124,y:134},{x:129,y:126}]);assert.deepEqual([blue.zones.find(z=>z.id==='c').x,blue.zones.find(z=>z.id==='c').y],[104,44]);
  // Turning twice gives the original route back.
  const back=P.allianceRoute(blue,{mode:'rotate',width:144,height:144});assert.ok(near(back.start.x,red.start.x)&&near(back.pins[0].path.controls[1].y,60));assert.equal(norm(back.pins[0].turn),45);
  assert.notEqual(blue.pins,red.pins);assert.equal(red.pins[0].x,9.3,'the original route is not changed');
});

test('empty field: mirrored left-right, so turns and spins change direction',()=>{
  const m=P.allianceRoute(red,{mode:'mirror',width:144,height:144});
  assert.deepEqual(R([m.start.x,m.start.y,m.start.heading]),R([144-9.1,26,-90]));
  const [a,b,,d]=m.pins;assert.equal(norm(a.turn),135);assert.equal(norm(a.path.heading),0);assert.deepEqual(a.path.controls,[{x:132,y:30},{x:124,y:60}]);
  assert.equal(b.turn,-30);assert.equal(b.path.angle,-90);assert.equal(d.path.spins,1);
  assert.equal(norm(m.zones.find(z=>z.id==='b').angle),-20);
});

test('the BIOBUZZ example drives the same on the blue side: same points, mirrored end point',{skip:!fs.existsSync(path.join(__dirname,'../sim-runtime/dsim-host.cjs'))&&'run node tools/simulation/build.cjs first'},async()=>{
  const Cli=require('../tools/deck-sim.cjs'),file=path.join(__dirname,'../examples/biobuzz-red-auto.json'),setup=Cli.readSetup(file);
  const runs=[];
  for(const alliance of ['red','blue']){
    const s=JSON.parse(JSON.stringify(setup)),l=Cli.layoutOf(s);if(alliance==='blue')Object.assign(l,P.allianceRoute(l,{mode:'rotate',width:l.width,height:l.height}),{alliance:'blue'});
    const {e,info}=await Cli.load(s,l);
    try{const route=Cli.planRoute(s,l,info),r=await e.run({kind:'route',route});assert.equal(r.ok,true);for(let i=0;i<40*60&&e.mode==='program';i++)await e.programTick();
      for(let i=0;i<150||e.world.time<30;i++)e.tick({forward:0,strafe:0,turn:0});runs.push({truth:e.truth(),mech:e.mechanismState(),end:l.pins.at(-1)});}finally{e.dispose();}
  }
  const [r,b]=runs;assert.ok(Math.hypot(b.truth.x-b.end.x,b.truth.y-b.end.y)<1.5,`blue ends at its end point (${b.truth.x.toFixed(1)}, ${b.truth.y.toFixed(1)})`);
  assert.equal(b.mech.tips,r.mech.tips,'the blue copy tips the blue hive as often as red tips red');assert.ok(b.mech.tips>=1);
});
