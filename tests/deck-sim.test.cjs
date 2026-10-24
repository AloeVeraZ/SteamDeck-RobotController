'use strict';
// The terminal simulator (tools/deck-sim.cjs): pins built from flags match the app's own rules,
// robot CAD sizes the footprint, and a BIOBUZZ setup is created, planned, test-driven and
// exported entirely from the command line, with the exported OnBot Java run on the virtual hub.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const D=require('../tools/deck-sim.cjs'),P=require('../ui/sim-planner.js');
const root=path.join(__dirname,'..'),built=fs.existsSync(path.join(root,'sim-runtime/dsim-host.cjs'))&&fs.existsSync(path.join(root,'sim-runtime/driver/classes/deck/sim/RunBridge.class'));
async function cli(...argv){const out=[],log=console.log;console.log=(...a)=>out.push(a.join(' '));try{await D.main(argv);}finally{console.log=log;}return out.join('\n');}

test('flags become the same pins the app editors save',()=>{
  const {flags}=D.parse(['--wait','0.5','--action','Intake','--power','0.6','--path-action','Launch','--track','59.25,58.56','--turn','-90']);
  const pin=D.pinFrom(flags,'38','28');
  assert.deepEqual(pin,{x:38,y:28,wait:0,action:'Intake',actionSeconds:.5,turn:-90,turnMode:'absolute',path:{kind:'action',action:'Launch',power:.6,rotate:'track',target:{x:59.25,y:58.56}}});
  assert.deepEqual(D.clean(pin),pin,'cleaning is stable');
  assert.deepEqual(P.pinEffects(pin).path.target,{x:59.25,y:58.56});
  assert.equal(D.pinFrom(D.parse(['--power','7']).flags,'1','2').path.power,1,'power is clamped like the app');
  assert.throws(()=>D.pinFrom(D.parse(['--track','nope']).flags,'1','2'),/x,y in inches/);
  assert.deepEqual(D.parse(['--turn','-90','--show']).flags,{turn:'-90',show:true},'negative numbers are values, not flags');
});

test('robot CAD bounding boxes size the robot: binary STL in millimetres, OBJ and GLB',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-cad-')),stl=Buffer.alloc(84+2*50);stl.writeUInt32LE(2,80);
  const tri=[[0,0,0,431.8,0,0,0,406.4,0],[431.8,406.4,304.8,0,406.4,0,431.8,0,0]];tri.forEach((v,i)=>v.forEach((n,j)=>stl.writeFloatLE(n,84+i*50+12+j*4)));
  fs.writeFileSync(path.join(dir,'bot.stl'),stl);assert.deepEqual(await D.cadBox(path.join(dir,'bot.stl'),{}),{length:17,width:16,height:12});
  fs.writeFileSync(path.join(dir,'bot.obj'),'v 0 0 0\nv 17 0 0\nv 0 9 15\n');assert.deepEqual(await D.cadBox(path.join(dir,'bot.obj'),{units:'in',up:'y'}),{length:17,width:15,height:9});
  const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{min:[-.2,0,-.15],max:[.2,.3,.15]}]})),pad=Buffer.alloc((4-json.length%4)%4,' '),glb=Buffer.alloc(20);
  glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(20+json.length+pad.length,8);glb.writeUInt32LE(json.length+pad.length,12);glb.writeUInt32LE(0x4e4f534a,16);
  fs.writeFileSync(path.join(dir,'bot.glb'),Buffer.concat([glb,json,pad]));assert.deepEqual(await D.cadBox(path.join(dir,'bot.glb'),{}),{length:15.7,width:11.8,height:11.8});
  await assert.rejects(D.cadBox(path.join(dir,'bot.txt'),{}),/STEP/);
});

test('a BIOBUZZ route is built, planned, test-driven and exported from the terminal',{skip:!built&&'run node tools/simulation/build.cjs first'},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-cli-')),file=path.join(dir,'red.json');
  const facts=JSON.parse(await cli('field','biobuzz','--json'));
  assert.deepEqual(facts.hives.red.cells.south,{x:59.25,y:58.56});assert.equal(facts.hives.red.upAtStart,'south');assert.equal(facts.flowers.length,4);assert.ok(facts.obstacles.length>=6);
  await cli('new',file,'--field','biobuzz','--length','17','--width','17','--sensors','fused','--power','1','--class','RedTest');
  await assert.rejects(cli('start',file,'0','0','0'),/overlaps a wall/);
  await cli('start',file,'9.83','27','0');
  await cli('pin',file,'add','22','27');
  await cli('pin',file,'add','38','28','--wait','0.4','--path-action','Launch','--power','0.6','--track','59.25,58.56');
  await cli('pin',file,'add','16','107','--action','Park','--heading','0');
  const setup=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(setup.deckSimulation,2);assert.equal(setup.tuning.maxPathSpeed,1);assert.equal(setup.layouts[0].pins.length,3);
  assert.match(await cli('plan',file),/Route: \d+(\.\d+)? in, 1 pauses/);
  const drive=JSON.parse(await cli('test',file,'--json'));assert.equal(drive.zoneTouches,0);assert.ok(drive.finalMissIn<1.5&&drive.fitsAuto,JSON.stringify(drive));
  await cli('export',file,'--format','onbot','--out',dir+path.sep);const java=fs.readFileSync(path.join(dir,'RedTestAuto.java'),'utf8');
  assert.match(java,/MOTOR_POWER = \{1\.0, 0\.6, 1\.0\}/);assert.match(java,/public boolean launch\(Step step\)/);
  const hub=JSON.parse(await cli('test',file,'--code','onbot','--json'));assert.equal(hub.zoneTouches,0);assert.ok(hub.finalMissIn<3,JSON.stringify(hub));
});

test('the shipped BIOBUZZ example stays a full-power, in-time, collision-free autonomous that scores',{skip:!built&&'run node tools/simulation/build.cjs first'},async()=>{
  const file=path.join(root,'examples/biobuzz-red-auto.json'),setup=JSON.parse(fs.readFileSync(file,'utf8')),pins=setup.layouts[0].pins;
  assert.equal(setup.tuning.maxPathSpeed,1);assert.equal(setup.mechanisms.enabled,true);assert.equal(setup.layouts[0].alliance,'red');
  for(const p of pins)assert.equal(p.path?.power??1,1,'every path at full power');
  assert.ok(pins.some(p=>p.wait>0)&&pins.some(p=>p.path?.style==='spline')&&pins.filter(p=>p.action==='Shoot').length===2);
  const r=JSON.parse(await cli('test',file,'--json'));assert.equal(r.zoneTouches,0);assert.ok(r.fitsAuto&&r.finalMissIn<1.5,JSON.stringify(r));
  assert.ok(r.mechanisms.shots>=5&&r.mechanisms.held===0&&r.mechanisms.score>=20,JSON.stringify(r.mechanisms));
});

test('deck-sim pins keeps custom curves, tangent headings, targets, spins and actions exactly',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-sim-rt-')),setup=path.join(dir,'rt.json'),pinsFile=path.join(dir,'pins.json');
  const pins=[{x:60,y:40,wait:.5,action:'Shoot',path:{kind:'action',action:'Spin up',controls:[{x:40,y:60},{x:50,y:20}],rotate:'tangent',power:.6,note:'curve'}},
    {x:100,y:60,turn:90,turnMode:'absolute',path:{rotate:'track',target:{x:72,y:130}}},{x:100,y:110,path:{rotate:'spin',spins:-2,style:'spline'}},{x:40,y:110,action:'Intake',actionSeconds:.4,path:{rotate:'reverse'}}];
  fs.writeFileSync(pinsFile,JSON.stringify(pins));await cli('new',setup,'--field','empty');await cli('start',setup,'24','24','0');await cli('pins',setup,pinsFile);
  const saved=JSON.parse(fs.readFileSync(setup,'utf8')).layouts[0].pins;
  pins.forEach((p,i)=>{for(const k of ['x','y','wait','action','turn','actionSeconds'])if(p[k]!==undefined)assert.equal(saved[i][k],p[k],`pin ${i} ${k}`);for(const [k,v] of Object.entries(p.path))assert.deepEqual(saved[i].path[k],v,`pin ${i} path.${k}`);});
  assert.match(await cli('pin',setup,'add','30','80','--tangent','--curve','40,100,30,95'),/Pin 5/);const last=JSON.parse(fs.readFileSync(setup,'utf8')).layouts[0].pins.at(-1);
  assert.deepEqual([last.path.rotate,last.path.controls],['tangent',[{x:40,y:100},{x:30,y:95}]]);await assert.rejects(cli('pin',setup,'add','30','80','--curve','1,2,3'),/1 to 3 control points/);
});
