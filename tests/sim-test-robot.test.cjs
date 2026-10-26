'use strict';
// The Test setup's generated robot (ui/sim-test-robot.js): inside its 17 x 17 x 14.5 in starting box, found by the app's
// CAD rules as a chassis, one deployable ramp intake and one turret taking both pieces, joints that resolve to its parts,
// stored and rigged like an imported STEP (with Three.js, when the simulation dependencies are built), the same route
// actions as any BIOBUZZ robot, and its long red autonomous run headlessly in the simulator physics.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const T=require('../ui/sim-test-robot.js'),SM=require('../src/sim-model.cjs'),Mech=require('../ui/sim-mechanisms.js'),K=require('../ui/sim-kinematics.js'),R=require('../ui/sim-robot-model.js');
const F=require('../ui/sim-ftc.js'),C=require('../ui/sim-config.js'),DS=require('../tools/deck-sim.cjs');
const threePath=path.join(__dirname,'../.cache/simulation-deps/node_modules/three');
const skip=fs.existsSync(threePath)?false:'build the simulation dependencies for Three.js';
const near=(a,b,tol,msg)=>[].concat(a).forEach((v,i)=>assert.ok(Math.abs(v-[].concat(b)[i])<=tol,`${msg||''} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const JOINTS=['turret','flywheel','hood','kicker','ramp','rollerLower','rollerUpper','wheelFL','wheelFR','wheelBL','wheelBR'];

test('the robot fits its 17 x 17 x 14.5 in starting box on the floor, faces outward and stays under 60k triangles',()=>{
  const m=T.meshes(),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let triangles=0,inward=0;
  for(const r of m){
    assert.equal(r.path[0],T.NAME);assert.ok(r.path.length>=2&&typeof r.name==='string'&&r.name,'each part sits in an assembly');
    assert.ok(r.position instanceof Float32Array&&r.normal instanceof Float32Array&&r.index instanceof Uint32Array);
    assert.equal(r.normal.length,r.position.length);assert.equal(r.index.length%3,0);assert.ok(r.color.length===3&&r.color.every(c=>c>=0&&c<=1));
    const p=i=>[r.position[3*i],r.position[3*i+1],r.position[3*i+2]],n=i=>[r.normal[3*i],r.normal[3*i+1],r.normal[3*i+2]];
    for(let i=0;i<r.position.length;i++){const a=i%3;lo[a]=Math.min(lo[a],r.position[i]);hi[a]=Math.max(hi[a],r.position[i]);}
    for(let i=0;i<r.position.length/3;i++)assert.ok(Math.abs(Math.hypot(...n(i))-1)<1e-4,'unit normals');
    // Counter-clockwise seen from outside (three.js draws front faces only).
    for(let t=0;t<r.index.length;t+=3){const [a,b,c]=[0,1,2].map(k=>r.index[t+k]);assert.ok(Math.max(a,b,c)<r.position.length/3);const g=cross(sub(p(b),p(a)),sub(p(c),p(a)));
      if(Math.hypot(...g)>1e-9&&dot(g,[0,1,2].map(k=>n(a)[k]+n(b)[k]+n(c)[k]))<=0)inward++;}
    triangles+=r.index.length/3;}
  assert.equal(inward,0,'no triangle faces inward');
  near([lo[0],lo[1],hi[0],hi[1]],[-8.5,-8.5,8.5,8.5],1e-3,'17 x 17 in');assert.ok(Math.abs(lo[2])<.03,`on the floor (lowest point ${lo[2]})`);assert.ok(hi[2]<=14.5,`${hi[2]} in tall`);
  assert.ok(triangles<=60000,`${triangles} triangles`);
  // The chassis assembly is the robot's length and width, so the app places it at scale 1.
  const chassis=SM.groups(m).find(g=>g.name==='Chassis');near([chassis.box[0],chassis.box[1],chassis.box[3],chassis.box[4]],[-8.5,-8.5,8.5,8.5],1e-3,'chassis box');
  // The same robot every time (the stored model's id is a hash of its bytes).
  const again=T.meshes();assert.equal(again.length,m.length);m.forEach((r,i)=>{assert.deepEqual(again[i].path,r.path);assert.deepEqual(Buffer.from(again[i].position.buffer),Buffer.from(r.position.buffer));});
});

test("the app's CAD rules find its chassis, one ramp intake at the front and one turret shooter taking both pieces",async()=>{
  // The window asks the main process for it (simFile('test-robot')) and gets what a STEP import gives.
  const {SimulationHost}=require('../src/sim-bridge.cjs'),host=new SimulationHost({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-test-robot-host-')),emit:()=>{}});
  const res=await host.file(null,null,'test-robot'),parts=T.metaParts(res.groups,Mech);
  assert.deepEqual(Object.keys(res).sort(),['colors','groups','index','kind','name','names','normals','part','parts','positions','tree','triangles']);
  assert.equal(res.name,T.NAME);assert.deepEqual(res.tree,SM.tree(T.meshes()));
  assert.equal(res.kind,'step');assert.equal(res.parts,T.meshes().length);assert.equal(res.index.length/3,res.triangles);assert.equal(res.part.length,res.positions.length/3);
  assert.deepEqual(parts.map(p=>[p.name,p.role,p.kind||p.type||null,p.pieces]),[['Chassis','chassis',null,null],['Ramp intake','intake','ramp',null],['Turret shooter (pollen + nectar)','shooter','turret','both']]);
  const meta=R.meta({...T.MODEL,id:'0'.repeat(32)+'.glb',parts}),boxes=R.partBoxes(meta),found=Mech.fromCad(boxes.parts,{length:boxes.extent.length,width:boxes.extent.width});
  assert.deepEqual([found.robot.length,found.robot.width],[17,17]);assert.ok(found.robot.heightIn<=14.5);
  assert.equal(found.intakes.length,1);assert.deepEqual([found.intakes[0].kind,found.intakes[0].sides,found.intakes[0].from],['ramp',['front'],'Ramp intake']);
  assert.equal(found.shooters.length,1);assert.deepEqual([found.shooters[0].type,found.shooters[0].pieces,found.shooters[0].mount],['turret','both','back']);
  assert.equal(Mech.drivetrainFromNames(res.names),'mecanum');
  // The setup's mechanisms are the ones found: same assemblies, edge, mouth width and turret mount.
  const m=Mech.sanitize(T.setup().mechanisms);
  assert.deepEqual([m.intakes[0].parts,m.intakes[0].sides,m.intakes[0].width],[['Ramp intake'],['front'],found.intakes[0].width]);
  assert.deepEqual([m.shooters[0].parts,m.shooters[0].mount,m.shooters[0].pieces],[['Turret shooter (pollen + nectar)'],'back','both']);
});

test('every joint moves parts of the model, riders sit on the turret, and the CAD pose is every joint at zero',()=>{
  const m=T.meshes(),P=K.partIndex(SM.tree(m)),raw=T.kinematics(),kin=K.sanitize(raw),byId=new Map(kin.joints.map(j=>[j.id,j]));
  assert.deepEqual(kin.joints.map(j=>j.id),JOINTS);assert.ok(kin.joints.every(j=>j.source==='metadata'),'kept on re-discovery');
  for(const j of kin.joints)assert.ok(P.expand(j.parts).size>0,`${j.id} names parts of the model`);
  const turret=P.expand(byId.get('turret').parts);
  for(const id of ['flywheel','hood','kicker']){const j=byId.get(id);assert.equal(j.parent,'turret');for(const k of P.expand(j.parts))assert.ok(turret.has(k),`${id} rides on the turret`);}
  assert.deepEqual(Object.fromEntries(kin.joints.map(j=>[j.id,j.drive.signal+(j.drive.of?' '+j.drive.of:'')])),
    {turret:'turret shooter:0',flywheel:'flywheel shooter:0',hood:'hood shooter:0',kicker:'feeder shooter:0',ramp:'deploy intake:0',rollerLower:'roller intake:0',rollerUpper:'roller intake:0',wheelFL:'wheel',wheelFR:'wheel',wheelBL:'wheel',wheelBR:'wheel'});
  // The turret turns where the mechanisms put a back turret, so CAD, engine and exports agree.
  near(byId.get('turret').origin.slice(0,2),Mech.mountOffset('back',{length:17,width:17}),1e-9,'turret pivot');
  // Lowered, the ramp's tip meets the floor about 5 in past the frame (the intake's reach).
  const ramp=byId.get('ramp'),at=K.pose(kin,{ramp:ramp.states.lowered}).W.get('ramp');let tip=[-Infinity,0,0],floor=Infinity;
  for(const k of P.expand(ramp.parts)){const r=m[k];for(let i=0;i<r.position.length;i+=3){const q=K.math.apply(at,[r.position[i],r.position[i+1],r.position[i+2]]);if(q[0]>tip[0])tip=q;floor=Math.min(floor,q[2]);}}
  assert.ok(floor>-.01&&floor<.15,`ramp lowered to ${floor.toFixed(3)} in`);near(tip[0]-8.5,T.setup().mechanisms.intakes[0].reach,.5,'ramp reach');
  // Feeding lifts the kicker's paddle. The shot leaves the hood's top end along the flywheel's rim: at 60° in the CAD, and
  // a positive tilt raises it (the game's 75° is a 15° tilt), as Configure from CAD sets a hood.
  const posed=(id,v,p)=>K.math.apply(K.pose(kin,{[id]:v}).W.get(id),p),hood=byId.get('hood'),c=hood.origin;
  assert.ok(posed('kicker',byId.get('kicker').states.feed,[-5.85,0,4.1])[2]>4.1+1.2,'kicker lifts the piece');
  const launch=v=>{const q=posed('hood',v,[c[0]+5.09*Math.cos(150*Math.PI/180),0,c[2]+5.09*Math.sin(150*Math.PI/180)]);return Math.atan2(q[2]-c[2],q[0]-c[0])*180/Math.PI-90;};
  near([launch(0),launch(15)],[hood.launch,hood.launch+15],1e-6,'launch angle');
  // Wheels roll on the floor at their own radius.
  for(const id of ['wheelFL','wheelFR','wheelBL','wheelBR']){const j=byId.get(id);near(j.origin[2],j.radius,1e-3,id);assert.equal(j.roll,'mecanum');}
  // A servo kicker swings out to feed and back to rest; a hood tilts to the game's launch angle while it shoots.
  const d=new K.Driver(K.forEngine(raw));for(let i=0;i<30;i++)d.tick(1/60,{feed:true,spin:true,hood:75});const fed=d.values();for(let i=0;i<60;i++)d.tick(1/60,{});const rest=d.values();
  near([fed.kicker,fed.hood,rest.kicker,rest.hood],[45,15,0,0],1e-6,'kicker and hood');
});

test('stored and rigged like an imported STEP: the same GLB bytes each time, parts kept, placed at scale 1, a link per joint',{skip},async()=>{
  const three=await import(pathToFileURL(path.join(threePath,'build/three.module.js')).href),{GLTFExporter}=await import(pathToFileURL(path.join(threePath,'examples/jsm/exporters/GLTFExporter.js')).href);
  const {GLTFLoader}=await import(pathToFileURL(path.join(threePath,'examples/jsm/loaders/GLTFLoader.js')).href),{mergeGeometries}=await import(pathToFileURL(path.join(threePath,'examples/jsm/utils/BufferGeometryUtils.js')).href);
  globalThis.FileReader??=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}readAsDataURL(b){b.arrayBuffer().then(r=>{this.result='data:application/octet-stream;base64,'+Buffer.from(r).toString('base64');this.onloadend?.();});}};
  globalThis.DeckThree={THREE:three,GLTFExporter,GLTFLoader,mergeGeometries,MeshoptDecoder:null};globalThis.DeckKinematics=K;globalThis.DeckMechanisms=Mech;
  const res=T.result(SM),body=await R.bodyFromImport(res),glb=await R.toGlb(body.geometry),again=await R.toGlb(body.geometry);
  assert.equal(Buffer.compare(Buffer.from(glb),Buffer.from(again)),0,'deterministic bytes');assert.ok(glb.length<6*1048576,`${glb.length} bytes`);
  const g=await R.fromGlb(glb),id=crypto.createHash('sha256').update(glb).digest('hex').slice(0,32)+'.glb';
  for(const a of ['position','normal','color','_part'])assert.ok(g.attributes[a],`keeps ${a}`);assert.deepEqual(g.userData.parts,res.tree);
  const meta=R.meta({...T.MODEL,id,parts:T.metaParts(res.groups,Mech)}),footprint={front:8.5,rear:8.5,half:8.5},holder=R.place(g,meta,footprint);
  near([holder.userData.modelScale.x,holder.userData.modelScale.y],[1,1],1e-3,'scale');
  const setup=T.setup(),kinematics=K.sanitize({...setup.kinematics,model:id}),rigged=R.rig(holder,{meta,mechanisms:Mech.sanitize(setup.mechanisms),kinematics,footprint,height:setup.robot.heightIn});
  assert.deepEqual([...R.linksOf(rigged).keys()].sort(),[...JOINTS].sort());assert.deepEqual(rigged.userData.kin.standIns,[],'nothing stands in for the turret or ramp');
  // Turning the turret 90° carries the flywheel's axle round the turret pivot.
  R.pose(rigged,{turret:90});rigged.updateMatrixWorld(true);const link=R.linksOf(rigged).get('flywheel'),fly=kinematics.joints.find(j=>j.id==='flywheel').origin,pivot=kinematics.joints.find(j=>j.id==='turret').origin;
  const moved=new three.Vector3(...fly).applyMatrix4(link.matrix),want=K.math.apply(rigged.userData.kin.P,[pivot[0]-(fly[1]-pivot[1]),pivot[1]+(fly[0]-pivot[0]),fly[2]]);
  near(moved.toArray(),want,1e-3,'flywheel about the pivot');
});

test('it runs the same route actions as any BIOBUZZ robot, on devices wired as on its Control Hub',()=>{
  const s=T.setup(),m=Mech.sanitize(s.mechanisms);
  assert.deepEqual(Mech.actions(m),['Intake','Ramp down','Ramp up','Spin up','Aim','Shoot']);
  const devices=F.mechanismDevices(m,{length:17,width:17}),of=role=>devices.find(d=>d.role===role);
  assert.deepEqual(['roller','ramp','flywheel','feeder','turret'].map(r=>[of(r)?.name,of(r)?.device]),[['intake','motor'],['ramp','servo'],['shooter','motor'],['kicker','servo'],['turret','motor']]);
  assert.equal(of('feeder').feeder,'pusher');assert.equal(m.shooters[0].hood,'hood');if(of('hood'))assert.deepEqual([of('hood').name,of('hood').device],['hood','servo']);
  // The robot settings survive sanitizing as the setup gives them: a CAD robot whose hitbox is its 17 x 17 chassis.
  const robot=C.robot(s.robot,'ftc');assert.deepEqual([robot.appearance,robot.length,robot.width,robot.heightIn,robot.driveRpm,robot.wheelDiameterMm],['custom',17,17,14,435,104]);
  assert.deepEqual(C.footprint(s.robot),{front:8.5,rear:8.5,half:8.5});
  // Its wiring (Control Hub and Expansion Hub 2) is kept whole and has no conflicts.
  const H=(()=>{try{return require('../ui/sim-hardware.js');}catch{return null;}})();
  if(H){const w=H.sanitizeWiring(s.robot.wiring);assert.deepEqual(w,{...s.robot.wiring,hubs:{...s.robot.wiring.hubs,servoHub:null}});
    const rows=H.rows({...s,robot,mechanisms:m});assert.deepEqual(H.conflicts(rows,w),[]);assert.ok(rows.filter(r=>r.role!=='sensor').every(r=>r.wired||r.hub),'every device has a port');}
  // The pins are already in the form the app and deck-sim keep.
  const l=s.layouts.find(x=>x.id===s.active);for(const p of l.pins)assert.deepEqual(DS.clean(p),p);
  assert.deepEqual([l.field,l.alliance,l.start,l.rotate,s.setupName,s.controller,s.sensors.localization],['biobuzz','red',{x:9.83,y:27,heading:0},false,'Test setup','ftc','fused']);
});

test('the long red autonomous runs headlessly: every pickup takes its pollen, the shots land, the joints move',async t=>{
  const {SimEngine}=require('../src/sim-engine.cjs'),s=T.setup(),l=s.layouts.find(x=>x.id===s.active),e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-test-robot-')),now:()=>0,emit:()=>{}});
  try{
    const info=await e.load({mechanisms:s.mechanisms,alliance:l.alliance,field:l.field,width:l.width,height:l.height,elements:true,start:l.start,zones:l.zones,robot:s.robot,controller:s.controller,sensors:s.sensors,timing:{...s.timing,power:1},tuning:s.tuning,kinematics:s.kinematics});
    const route=DS.planRoute(s,l,info);assert.ok(route.segments.length>0);assert.equal((await e.run({kind:'route',route})).ok,true);
    const picked=new Map(),range={};let last=e.mechanismState().pickedUp,leg=0,swings=0,out=false;
    // Pickups by leg (the path to a pin and what runs at it); a pause between keeps the leg before.
    for(let i=0;i<4200&&['program','timed'].includes(e.mode);i++){await e.programTick();const st=e.mechanismState();leg=e.mechAct?.leg??leg;
      if(st.pickedUp>last)picked.set(leg,(picked.get(leg)||0)+st.pickedUp-last);last=st.pickedUp;
      const joints=e.frame().joints||{};for(const [k,v] of Object.entries(joints)){const r=range[k]||(range[k]={min:Infinity,max:-Infinity,end:0});r.min=Math.min(r.min,v);r.max=Math.max(r.max,v);r.end=v;}
      // A kicker swing: out to feed, then back to rest.
      if(joints.kicker>40)out=true;else if(out&&joints.kicker<1){out=false;swings++;}}
    assert.ok(e.result,e.lastError||'the route finished');const ended=e.mechanismState();for(let i=0;i<150||e.world.time<30;i++)e.tick({forward:0,strafe:0,turn:0});const after=e.mechanismState();
    const intakes=l.pins.map((p,i)=>p.action==='Intake'?i:-1).filter(i=>i>=0),per=intakes.map(i=>picked.get(i)||0),goal=l.pins.at(-1);
    t.diagnostic(`${e.result.time.toFixed(2)} s, picked ${after.pickedUp} (${per.join(', ')} per pickup), shot ${ended.shots}, landed ${after.landed}, ${after.tips} tips, ${after.score} points`);
    assert.equal(e.result.violations.length,0,'no zone touches');assert.ok(Math.hypot(e.result.truth.x-goal.x,e.result.truth.y-goal.y)<2,'ends at the last pin');
    assert.ok(e.result.time>30&&e.result.time<60,`${e.result.time} s: a long demo past the 30 s period, within deck-sim's 60 s`);
    assert.equal(intakes.length,6,'garden, flower F2, loading zone, flower F1 and two floor groups');
    assert.ok(per.every(n=>n>=3)&&after.pickedUp>=22,`pickups ${per.join(', ')}`);assert.ok(ended.shots>=26&&after.landed>=22,`${after.landed} of ${ended.shots} shots landed`);assert.ok(after.tips>=2);
    // The parts move as the game drives them: the kicker swings out and back, the ramp folds down, the hood tilts.
    near([range.kicker.max,range.kicker.min,range.hood.max,range.ramp.max,range.ramp.end],[45,0,15,T.RAMP_DOWN,0],.5,'joints');assert.ok(swings>=ended.shots-4,`${swings} kicker swings for ${ended.shots} shots`);
    for(const id of ['turret','flywheel','rollerLower','rollerUpper'])assert.ok(range[id].max-range[id].min>10,`${id} moves`);
  }finally{e.dispose();}
});
