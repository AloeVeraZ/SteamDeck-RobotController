'use strict';
// The preset robots' generated CAD (ui/sim-preset-robots.js): each the size its preset says, found by the app's CAD rules
// as the drivetrain it is (and the tank's sweeper and fixed shooter), joints that resolve to its parts (swerve wheels
// riding their steering), wiring with no problems, and its demo route run headlessly in the simulator physics.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const PR=require('../ui/sim-preset-robots.js'),T=require('../ui/sim-test-robot.js'),SM=require('../src/sim-model.cjs'),Mech=require('../ui/sim-mechanisms.js'),K=require('../ui/sim-kinematics.js');
const C=require('../ui/sim-config.js'),W=require('../ui/sim-wiring.js'),DS=require('../tools/deck-sim.cjs');
const near=(a,b,tol,msg)=>[].concat(a).forEach((v,i)=>assert.ok(Math.abs(v-[].concat(b)[i])<=tol,`${msg||''} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));
const IDS=['startermecanum','a301swerve','startertank'];
// REV's Starter Bot CAD, prepared locally (tools/simulation/prepare-revduo.cjs); builds without it skip its checks.
const revFile=path.join(__dirname,'../ui/assets/robots/revduo.deck.gz'),noRev=fs.existsSync(revFile)?false:'prepare REV’s Starter Bot CAD (tools/simulation/prepare-revduo.cjs)';
const engineOf=d=>C.drives[d].engine;

test('there is a generated robot for every preset, and the Test robot is unchanged by sharing its builders',()=>{
  assert.deepEqual(Object.keys(PR.ROBOTS),Object.keys(Mech.PRESETS));assert.deepEqual(IDS,Object.keys(PR.ROBOTS));
  for(const id of IDS){assert.equal(PR.ROBOTS[id].name,Mech.PRESETS[id].name);assert.equal(PR.ofModel({name:PR.ROBOTS[id].name}),id);}
  assert.equal(PR.ofModel({name:T.NAME}),null);assert.equal(T.meshes().length,113);assert.ok(T.meshes().every(m=>m.path[0]===T.NAME));
});

for(const id of IDS)test(`${id}: its preset's length and width on the floor, outward faces, the drivetrain its parts are named for`,()=>{
  const r=PR.ROBOTS[id],p=Mech.PRESETS[id],m=PR.meshes(id),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let triangles=0;
  for(const x of m){assert.equal(x.path[0],r.name);assert.ok(x.position instanceof Float32Array&&x.index instanceof Uint32Array&&x.normal.length===x.position.length);
    for(let i=0;i<x.position.length;i++){const a=i%3;lo[a]=Math.min(lo[a],x.position[i]);hi[a]=Math.max(hi[a],x.position[i]);}triangles+=x.index.length/3;}
  near([hi[0]-lo[0],hi[1]-lo[1]],[p.robot.length,p.robot.width],.03,'length x width');assert.ok(Math.abs(lo[2])<.03,`on the floor (${lo[2]})`);assert.ok(hi[2]<=r.heightIn,`${hi[2]} in tall`);
  assert.ok(triangles<=60000,`${triangles} triangles`);
  const res=PR.result(id,SM),groups=res.groups.map(g=>[g.name,Mech.partRole(g.name,g.inner).role]);assert.equal(engineOf(Mech.drivetrainFromNames(res.names)),engineOf(p.robot.drivetrain));
  const chassis=res.groups.find(g=>g.name==='Chassis');near([chassis.box[3]-chassis.box[0],chassis.box[4]-chassis.box[1]],[p.robot.length,p.robot.width],.03,'chassis box');
  assert.deepEqual(groups,id==='startertank'?[['Chassis','chassis'],['Sweeper intake','intake'],['Fixed shooter (pollen + nectar)','shooter'],['Electronics','other']]:[['Chassis','chassis'],['Electronics','other']]);
  if(id==='startertank'){const s=res.groups.find(g=>g.name.startsWith('Fixed shooter')),i=res.groups.find(g=>g.name==='Sweeper intake');
    assert.deepEqual([Mech.partRole(s.name,s.inner).type,Mech.partRole(s.name,s.inner).pieces],['fixed','both']);assert.notEqual(Mech.partRole(i.name,i.inner).kind,'ramp');}
  // The same robot every time (the stored model's id is a hash of its bytes).
  const again=PR.meshes(id);m.forEach((x,i)=>assert.deepEqual(Buffer.from(again[i].position.buffer),Buffer.from(x.position.buffer)));
});

for(const id of IDS)test(`${id}: every joint moves parts of the model; wheels roll on the floor; swerve wheels ride their steering`,()=>{
  const m=PR.meshes(id),P=K.partIndex(SM.tree(m)),kin=K.sanitize(PR.kinematics(id)),raw=PR.kinematics(id);
  assert.equal(kin.joints.length,raw.joints.length,'none dropped');for(const j of kin.joints)assert.ok(P.expand(j.parts).size>0,`${j.id} names parts of the model`);
  const wheels=kin.joints.filter(j=>j.drive?.signal==='wheel');assert.equal(wheels.length,{startermecanum:4,a301swerve:4,startertank:6}[id]);
  for(const j of wheels){const lift=id==='startertank'&&j.origin[0]!==0?PR.ROBOTS.startertank.drop:0;near(j.origin[2]-lift,j.radius,1e-3,j.id);}
  if(id==='a301swerve')for(const k of ['FL','FR','BL','BR']){const steer=kin.joints.find(j=>j.id==='steer'+k),wheel=kin.joints.find(j=>j.id==='wheel'+k);
    assert.deepEqual([steer.drive.signal,wheel.parent,steer.axis],['steer','steer'+k,[0,0,1]]);const all=P.expand(steer.parts);for(const p of P.expand(wheel.parts))assert.ok(all.has(p),'the wheel is inside its module');}
  if(id==='startertank')assert.deepEqual(['flywheel','indexer','roller'].map(k=>{const j=kin.joints.find(x=>x.id===k);return j.drive.signal+' '+j.drive.of;}),['flywheel shooter:0','feeder shooter:0','roller intake:0']);
});

for(const id of IDS)test(`${id}: applied to a setup it is a locked FTC robot with clean wiring and its mechanisms on its CAD`,()=>{
  const s=PR.apply(id,T.setup(),C),p=Mech.PRESETS[id];
  assert.deepEqual([s.controller,s.robotPreset,s.robot.drivetrain,s.robot.length,s.robot.width,s.robot.appearance],['ftc',id,p.robot.drivetrain,p.robot.length,p.robot.width,'custom']);
  assert.equal(s.sensors.localization,PR.ROBOTS[id].localization);assert.ok(C.sensorChoices('ftc').includes(s.sensors.localization));
  const st=W.state(s);assert.equal(st.error,null);assert.deepEqual(st.problems,[],'no wiring problems');assert.ok(st.rows.length>=4&&st.rows.every(r=>r.wired),'every device on the port the preset gives it');
  assert.equal(s.mechanisms.enabled,!!p.mechanisms);if(id==='startertank'){assert.deepEqual([s.mechanisms.intakes[0].parts,s.mechanisms.shooters[0].parts],[['Sweeper intake'],['Fixed shooter (pollen + nectar)']]);}
  const l=PR.layout(id);assert.deepEqual([l.field,l.alliance,l.name],['biobuzz','red',`${p.name} demo`]);for(const pin of l.pins)assert.deepEqual(DS.clean(pin),pin);
});

test('a fixed shooter aimed at the other cell faces that cell, not the start cell',()=>{
  const back=Mech.sanitize(Mech.presetMechanisms('startertank')),front=Mech.sanitize({...back,shooters:[{...back.shooters[0],facing:'front'}]}),start={x:59.25,y:58.56},other={x:59.25,y:85.44};
  const pins=[{x:24,y:30,action:'Shoot'},{x:28,y:104,action:'Shoot',cell:'other'}],[a,b]=Mech.prepare(pins,front,start);
  assert.deepEqual([a.target,b.target],[start,other]);
  // The Starter Bot's launcher fires out of its back: Shoot pins turn its back to the cell.
  const bearing=(p,q)=>Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI,[c,d]=Mech.prepare(pins,back,start);
  near([c.turn,d.turn],[bearing(pins[0],start)-180,bearing(pins[1],other)+180],.01,'back to the cell');
});

test("REV's Starter Bot: its prepared CAD has an assembly for each moving part, its joints move them, wired with no problems",{skip:noRev},()=>{
  const v=SM.decodeImport(require('node:zlib').gunzipSync(fs.readFileSync(revFile))),P=K.partIndex(v.tree),s=PR.apply('startertank',T.setup(),C,{asset:true}),kin=s.kinematics;
  assert.equal(v.name,PR.REV.name);assert.ok(v.triangles<=400000,`${v.triangles} triangles`);assert.ok(PR.assetModel({name:v.name})&&PR.ofModel({name:v.name})==='startertank');
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<v.positions.length;i++){const a=i%3;lo[a]=Math.min(lo[a],v.positions[i]);hi[a]=Math.max(hi[a],v.positions[i]);}
  assert.ok(Math.abs(lo[2])<.03,'on the floor');const chassis=v.groups.find(g=>g.name==='Drivetrain');near([chassis.box[3]-chassis.box[0],chassis.box[4]-chassis.box[1]],[16.66,16.54],.03,'chassis box');
  assert.deepEqual(v.groups.map(g=>[g.name,Mech.partRole(g.name,g.inner).role]).filter(([,r])=>r!=='other'),[['Drivetrain','chassis'],['Launcher','shooter'],['Feeder','indexer'],['Intake','intake']]);
  assert.deepEqual(kin.joints.map(j=>j.id).sort(),['feeder','feederGear','flywheel','pusher','rollerLower','rollerUpper','wheelBL','wheelBR','wheelFL','wheelFR','wheelML','wheelMR']);
  for(const j of kin.joints){const parts=P.expand(j.parts);assert.ok(parts.size>0,`${j.id} names parts of the model`);
    // Each turns about its own axle: the parts it moves sit round its origin (the pusher's arm reaches out from its pivot).
    if(j.type==='continuous'){let far=0;for(const k of parts)for(let i=0;i<v.part.length;i++)if(v.part[i]===k){const d=Math.hypot(v.positions[3*i]-j.origin[0],v.positions[3*i+2]-j.origin[2]);far=Math.max(far,d);}assert.ok(far<2.6,`${j.id} parts within ${far.toFixed(2)} in of its axle`);}}
  for(const j of kin.joints.filter(j=>j.drive?.signal==='wheel'))near(j.origin[2],j.radius,1e-3,j.id);
  assert.deepEqual(kin.actuators.map(a=>[a.id,a.joint,a.states]),[['pusher','pusher',{stowed:110,out:0}]]);
  // The route actions that swing the pusher's arm out and stow it.
  const act=name=>K.resolveAction(K.forEngine(kin),name);assert.deepEqual([act('Pollen pusher out')?.kind,act('Pollen pusher out')?.value,act('Pollen pusher stowed')?.value],['move',0,110]);
  const st=W.state(s);assert.deepEqual(st.problems,[]);assert.ok(st.rows.every(r=>r.wired),'every device on its port');assert.deepEqual(st.rows.filter(r=>/^robot\.(left|right)$/.test(r.key)).map(r=>r.model),['rev-ultra-20','rev-ultra-20']);
});

for(const id of IDS)test(`${id}: its demo route runs headlessly inside the 30 s period, touching no zone and ending at its last pin`,async t=>{
  const {SimEngine}=require('../src/sim-engine.cjs'),s=PR.apply(id,T.setup(),C),l={...PR.layout(id),id:'demo'},e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-preset-')),now:()=>0,emit:()=>{}});
  try{
    const info=await e.load({mechanisms:s.mechanisms,alliance:l.alliance,field:l.field,width:l.width,height:l.height,elements:true,start:l.start,zones:l.zones,robot:s.robot,controller:s.controller,sensors:s.sensors,timing:{...s.timing,power:1},tuning:s.tuning,kinematics:s.kinematics});
    const route=DS.planRoute({...s,layouts:[l],active:l.id},l,info);assert.ok(route.segments.length>0);assert.equal((await e.run({kind:'route',route})).ok,true);
    const moved={};for(let i=0;i<4200&&['program','timed'].includes(e.mode);i++){await e.programTick();for(const [k,v] of Object.entries(e.frame().joints||{}))moved[k]=(moved[k]||0)+Math.abs(v);}
    assert.ok(e.result,e.lastError||'the route finished');const end=l.pins.at(-1),st=e.mechanismState();
    t.diagnostic(`${e.result.time.toFixed(2)} s${st?`, picked ${st.pickedUp}, shot ${st.shots}, landed ${st.landed}, ${st.tips} tips`:''}`);
    assert.equal(e.result.violations.length,0,'no zone touches');assert.ok(Math.hypot(e.result.truth.x-end.x,e.result.truth.y-end.y)<1.5,'ends within 1.5 in of the last pin (as the app checks)');assert.ok(e.result.time<30,`${e.result.time} s`);
    // It ends partly in the red loading zone (x below 12.9 in, y 95.9 to 118.6 in): PARK.
    const f=C.footprint(s.robot);assert.ok(e.result.truth.x-Math.max(f.front,f.half)<12.9&&e.result.truth.y>95.9&&e.result.truth.y<118.6,'parked');
    if(id==='startertank'){assert.ok(st.pickedUp>=2,`picked ${st.pickedUp}`);assert.ok(st.landed>=6&&st.tips>=1,`${st.landed} of ${st.shots} landed`);for(const k of ['flywheel','indexer','roller'])assert.ok(moved[k]>0,`${k} turns`);}
  }finally{e.dispose();}
});
