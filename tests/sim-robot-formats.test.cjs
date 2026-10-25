'use strict';
// SDFormat and MJCF robots: their joints come from the file (confirmed), placed by each format's own frame rules, and
// checked here against kinematics worked out by hand from the fixtures' numbers.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const F=require('../ui/sim-robot-formats.js'),K=require('../ui/sim-kinematics.js'),M=K.math,R=Math.PI/180,IN=F.IN_PER_M;
const read=name=>fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8');
const near=(a,b,tol,msg)=>{const x=[].concat(a),y=[].concat(b);assert.equal(x.length,y.length,msg);x.forEach((v,i)=>assert.ok(Math.abs(v-y[i])<=tol,`${msg||''} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));};
const threePath=path.join(__dirname,'../.cache/simulation-deps/node_modules/three'),skip=fs.existsSync(threePath)?false:'build the simulation dependencies for Three.js';
// A point turned about an axis through a point (Rodrigues, written out apart from the engine).
function about(p,o,axis,deg){const l=Math.hypot(...axis),[x,y,z]=axis.map(c=>c/l),a=deg*R,c=Math.cos(a),s=Math.sin(a),v=[p[0]-o[0],p[1]-o[1],p[2]-o[2]],d=x*v[0]+y*v[1]+z*v[2];
  return [o[0]+v[0]*c+(y*v[2]-z*v[1])*s+x*d*(1-c),o[1]+v[1]*c+(z*v[0]-x*v[2])*s+y*d*(1-c),o[2]+v[2]*c+(x*v[1]-y*v[0])*s+z*d*(1-c)];}
const load=(name,kind)=>{const d=F.parse(kind,read(name));return {d,m:K.sanitize({...F.toKinematics(d),model:null})};};
const byName=(m,name)=>m.joints.find(j=>j.name===name);
function fourBar(a,b,c,d,theta){const t=theta*R,B={x:a*Math.cos(t),y:a*Math.sin(t)},ux=d-B.x,uy=-B.y,e=Math.hypot(ux,uy),along=(b*b-c*c+e*e)/(2*e),h=Math.sqrt(Math.max(0,b*b-along*along));
  return [1,-1].map(s=>({x:B.x+along*ux/e-s*h*uy/e,y:B.y+along*uy/e+s*h*ux/e}));}

test('SDFormat SCARA: relative_to, a //frame, an axis in the model frame and a turned tool frame put every joint where the file says',()=>{
  const {d,m}=load('scara.sdf','sdf');assert.equal(d.name,'scara');assert.deepEqual(d.links.map(l=>l.name),['base','link1','link2','quill','tool']);
  assert.ok(d.notes.some(n=>/other model/.test(n)),'the table in the world is left out, and said');
  const j=n=>byName(m,n);near(j('shoulder').origin,[0,0,.3],1e-12);near(j('elbow').origin,[.4,0,.3],1e-12);near(j('elbow').axis,[0,0,-1],1e-12,'expressed in the model frame');
  near(j('lift').origin,[.7,0,.35],1e-12,'the quill hangs from the frame on link2');near(j('lift').axis,[0,0,-1],1e-12);near(j('spin').origin,[.7,0,.25],1e-12);
  near(j('spin').axis,[0,1,0],1e-9,'x of a frame turned 90° about z');near(j('spin').lead,.005*IN,1e-5,'metres a turn, in inches');
  near([j('shoulder').lower,j('shoulder').upper],[-2.5/R,2.5/R],1e-3,'limits in degrees');near([j('lift').lower,j('lift').upper],[0,.2*IN],1e-3,'and inches');near(j('shoulder').speed,3/R,1e-2);
  assert.ok(m.joints.every(x=>x.source==='metadata'&&x.confidence===1),'confirmed from the file');
  // Independent: x = 0.4 cos θ1 + 0.3 cos(θ1 − θ2), with the elbow's axis pointing down; the quill lowers the tool.
  for(const [t1,t2,dz] of [[30,45,2],[-70,-100,5],[120,10,0]]){const p=M.apply(K.pose(m,{shoulder:t1,elbow:t2,lift:dz,spin:0}).W.get('spin'),[.7,0,.25]);
    near(p,[.4*Math.cos(t1*R)+.3*Math.cos((t1-t2)*R),.4*Math.sin(t1*R)+.3*Math.sin((t1-t2)*R),.25-dz/IN],1e-9,`tool at ${t1}, ${t2}, ${dz}`);}
  near(M.apply(K.pose(m,{spin:720}).W.get('spin'),[.7,0,.25]),[.7,.01,.25],1e-9,'two turns of a 5 mm screw move it 10 mm along its axis');
  // A visual turned 90° in degrees: the arm's cylinder (along its own z) lies along x.
  near(M.applyDir(d.links[1].visuals[0].matrix,[0,0,1]),[1,0,0],1e-9);near(d.links[0].visuals[0].colour,[.3,.3,.3],0);
});

test('SDFormat 1.6 four-bar: joint poses on the child link, the closing joint becomes a loop, a gearbox a coupling',()=>{
  const {d,m}=load('fourbar.sdf','sdf');
  assert.ok(!d.joints.some(j=>j.name==='j_close'),'the closing joint is not a joint of the tree');assert.equal(d.loops.length,2,'two points on its axis: a hinge');
  near(d.loops[0].a.point,[.060320153008738664,.04999897501000391,0],1e-12,'at the closing joint, given on the rocker');
  assert.ok(d.notes.some(n=>/included model/.test(n)),'the include is said, not guessed');
  for(const turn of [0,25,80,-40]){const p=K.pose(m,{j_crank:turn}),C=M.apply(p.W.get('j_rocker'),[.060320153008738664,.04999897501000391,0]);
    const want=fourBar(.02,.06,.05,.06,60+turn).sort((u,w)=>Math.hypot(u.x-C[0],u.y-C[1])-Math.hypot(w.x-C[0],w.y-C[1]))[0];
    assert.ok(p.loopError<1e-6,`closed at ${turn}° (${p.loopError})`);near([C[0],C[1]],[want.x,want.y],1e-6,`rocker end at crank +${turn}°`);}
  // θ2 = −2·θ1 about the gearbox axes; g2's own axis points down, so its value is +2·g1.
  const g=m.couplings.find(c=>c.to==='g2');assert.equal(g.from,'g1');near(g.ratio,2,1e-12);
  assert.ok(byName(m,'j_coupler').drive===undefined&&byName(m,'j_rocker').drive===undefined,'loop joints are solved, not driven');
  assert.ok(F.toKinematics(d).joints.length>=5);
});

test('MJCF arm: classes, childclass, euler, fromto, a two-joint wrist and the joint equality, against the chain by hand',()=>{
  const {d,m}=load('arm_mjcf.xml','mjcf');assert.equal(d.name,'mjcf_arm');
  assert.deepEqual(m.joints.map(j=>j.id),['yaw','shoulder','elbow','wrist_pitch','wrist_roll','finger_l','finger_r']);
  const j=n=>byName(m,n);assert.equal(j('yaw').type,'continuous','a hinge with no range turns freely');assert.equal(j('shoulder').type,'revolute');
  near([j('shoulder').lower,j('shoulder').upper],[-90,90],1e-9,'the range from its class');near(j('shoulder').axis,[0,1,0],1e-12,'the axis from its class');
  near([j('elbow').lower,j('elbow').upper],[0,135],1e-9,'its own range over the class');near([j('wrist_roll').lower,j('wrist_roll').upper],[-90,90],1e-9,'childclass reaches the hand');
  near(j('elbow').origin,[0,0,.45],1e-12);near(j('wrist_pitch').origin,[.25,0,.45],1e-12,'along the forearm, which euler 0 90 0 turned to +x');
  near(j('wrist_pitch').axis,[0,0,-1],1e-12,'the hand’s x is the world’s −z');near(j('wrist_roll').axis,[1,0,0],1e-12);
  assert.equal(j('wrist_roll').parent,'wrist_pitch','two joints in one body chain in order');assert.deepEqual(j('wrist_pitch').parts,[],'the first carries nothing');
  assert.deepEqual(j('wrist_roll').parts,['world/base/upper/fore/hand'],'the last carries the hand');near([j('finger_l').lower,j('finger_l').upper],[0,.03*IN],1e-3);
  const c=m.couplings.find(x=>x.to==='finger_r');assert.equal(c.from,'finger_l');near(c.ratio,1,1e-12);assert.equal(j('finger_r').drive,undefined,'a coupled finger follows');
  assert.deepEqual(m.actuators.map(a=>[a.id,a.kind,a.mode,a.ratio]),[['yaw_motor','dcmotor','effort',50],['shoulder_servo','servo','position',1],['velocity_elbow','dcmotor','velocity',1],['grip','servo','position',1]]);
  assert.ok(d.notes.some(n=>/muscle/.test(n)),'the muscle actuator is said to be unread');
  assert.deepEqual(F.meshFiles(d),['meshes/hand.stl'],'meshdir joined');const hand=d.links.find(l=>l.name==='hand');near(hand.visuals[0].geometry.scale,[.001,.001,.001],0);
  const upper=d.links.find(l=>l.name==='upper');assert.equal(upper.visuals.length,1);assert.equal(upper.collisions.length,1,'group 3 is a collision shape');
  near(upper.visuals[0].geometry.length,.3,1e-12,'fromto sets the length');near(d.links.find(l=>l.name==='base').visuals[0].colour,[.8,.3,.2],1e-12,'an rgba from the class wins over the material, as in MuJoCo');
  assert.equal(d.links.find(l=>l.name==='world').visuals.length,0,'the floor plane is not drawn');
  // Independent: turn the tool site (0.35, 0, 0.45) by each joint about its axis, innermost first.
  const q={yaw:70,shoulder:-30,elbow:50,wrist_pitch:20,wrist_roll:90};let want=[.35,0,.45];
  for(const [id,o,axis] of [['wrist_roll',[.25,0,.45],[1,0,0]],['wrist_pitch',[.25,0,.45],[0,0,-1]],['elbow',[0,0,.45],[0,1,0]],['shoulder',[0,0,.15],[0,1,0]],['yaw',[0,0,.1],[0,0,1]]])want=about(want,o,axis,q[id]);
  near(M.apply(K.pose(m,q).W.get('wrist_roll'),[.35,0,.45]),want,1e-9,'tool site');
  const grip=K.pose(m,{finger_l:.5});near(M.apply(grip.W.get('finger_r'),[.25-.08+.08,0,.47]),[.25,0,.47+.5/IN],1e-9,'the mirrored finger opens the other way');
});

test('MJCF four-bar and finger: a connect constraint closes the loop, a tendon held at zero couples dip to pip',()=>{
  const {d,m}=load('fourbar_mjcf.xml','mjcf');assert.equal(m.loops.length,1);
  assert.equal(byName(m,'crank').drive?.signal,'action','the motor’s joint is driven');assert.equal(byName(m,'rocker').drive,undefined,'the rocker is solved');
  near([byName(m,'coupler').lower,byName(m,'coupler').upper],[-3/R,3/R],1e-3,'radians to degrees');
  for(const turn of [15,-50,100]){const p=K.pose(m,{crank:turn}),C=M.apply(p.W.get('rocker'),[.060320153008738664,.04999897501000391,0]),want=fourBar(.02,.06,.05,.06,60+turn).sort((u,w)=>Math.hypot(u.x-C[0],u.y-C[1])-Math.hypot(w.x-C[0],w.y-C[1]))[0];
    assert.ok(p.loopError<1e-6,`closed at ${turn}°`);near([C[0],C[1]],[want.x,want.y],1e-6);}
  const t=m.couplings.find(c=>c.kind==='tendon');assert.equal(t.to,'dip','the joint no actuator drives is set');assert.equal(t.from,'pip');near(t.ratio,2/3,1e-12);
  near(K.resolve(m,{pip:60}).dip,[40],1e-9,'2·pip − 3·dip = 0');
  // The palm is turned 90° about z by its quaternion: the finger runs along +y from (0, −0.08, 0).
  near(byName(m,'mcp').origin,[0,-.08,0],1e-12);near(byName(m,'mcp').axis,[-1,0,0],1e-12);
});

test('MJCF details: radians, eulerseq, xyaxes, zaxis, axisangle, ball limits, free bodies, welds and unknown parts',()=>{
  const xml=`<mujoco model="t"><compiler angle="radian" eulerseq="XYZ"/><worldbody>
    <body name="a" euler="0 0 1.5707963267948966"><joint name="ja" axis="1 0 0" range="-1 1"/><geom size="0.01"/>
      <body name="b" pos="1 0 0" xyaxes="0 1 0 -1 0 0"><joint name="jb" axis="1 0 0"/></body>
      <body name="c" pos="0 1 0" zaxis="1 0 0"><joint name="jc" type="slide" axis="0 0 1"/></body>
      <body name="e" pos="0 0 1" axisangle="0 0 1 3.141592653589793"><joint name="je" type="ball" range="0 0.5"/></body></body>
    <body name="free"><freejoint/><geom type="box" size="0.1 0.1 0.1"/></body>
    <body name="w"><joint name="jw"/><geom size="0.01" material="red"/><geom size="0.01" material="red" rgba="0 1 0 1"/></body></worldbody><asset><material name="red" rgba="1 0 0 1"/></asset>
    <equality><weld body1="w" body2="a"/><flex flex="x"/></equality><actuator><motor tendon="t"/></actuator></mujoco>`;
  const d=F.parseMjcf(xml),m=K.sanitize(F.toKinematics(d)),j=n=>byName(m,n);
  near(j('ja').axis,[0,1,0],1e-12,'XYZ: yaw 90° turns x to y');near(j('jb').origin,[0,1,0],1e-12,'positions turn with their parent');near(j('jb').axis,[-1,0,0],1e-12,'xyaxes: x along the parent’s y');
  near(j('jc').axis,[0,1,0],1e-12,'zaxis 1 0 0 in a frame turned 90°');near([j('ja').lower,j('ja').upper],[-1/R,1/R],1e-3,'radian ranges');
  assert.equal(j('je').type,'ball');assert.deepEqual(j('je').limits.map(l=>l.map(v=>+v.toFixed(2))),[[-28.65,28.65],[-28.65,28.65],[-28.65,28.65]],'cone kept per angle');
  near(d.links.find(l=>l.name==='w').visuals.map(v=>v.colour).flat(),[1,0,0,0,1,0],0,'material colour unless an rgba is set');
  assert.equal(j('free_joint0').type,'floating');assert.equal(d.loops.length,3,'a weld is three points');
  assert.ok(d.notes.some(n=>/flex/.test(n))&&d.notes.some(n=>/tendon “t”/.test(n))&&d.notes.some(n=>/cone/.test(n)),'what is not read is said');
  assert.throws(()=>F.parseMjcf('<robot/>'),/not an MJCF/);assert.throws(()=>F.parseSdf('<mujoco/>'),/not an SDFormat/);
  assert.equal(F.kindOf('arm.xml','<?xml version="1.0"?>\n<!-- x --><mujoco model="a"/>'),'mjcf');assert.equal(F.kindOf('a.world',''),'sdf');assert.equal(F.kindOf('a.xml','<robot/>'),'urdf');assert.equal(F.kindOf('a.xml','<html/>'),null);
});

test('formats survive saving, and the body nests links as the joints nest them',{skip},()=>{
  const T=require(threePath);for(const [name,kind] of [['scara.sdf','sdf'],['arm_mjcf.xml','mjcf'],['fourbar_mjcf.xml','mjcf']]){const {d,m}=load(name,kind);assert.deepEqual(K.sanitize(JSON.parse(JSON.stringify(m))),m,`${name} stable`);
    const {group,missing}=F.buildScene(d,T);group.updateMatrixWorld(true);if(name==='arm_mjcf.xml')assert.deepEqual(missing,['hand: meshes/hand.stl'],'an unread mesh is reported');
    // Every link node's world matrix is the link's frame, and keys match the joints' parts.
    for(const l of d.links){const node=group.getObjectByName(l.name);near(node.matrixWorld.toArray(),l.frame,1e-9,`${name}: ${l.name} placed`);}
    for(const j of m.joints)for(const key of j.parts){let n=group,ok=true;for(const part of key.split('/')){n=n.children.find(c=>c.name===part);if(!n){ok=false;break;}}assert.ok(ok,`${name}: ${key} is in the body`);}}
  // The SCARA's base column: 0.3 m tall from the floor.
  const {d}=load('scara.sdf','sdf'),{group}=F.buildScene(d,T),box=new T.Box3().setFromObject(group.getObjectByName('base').children.find(c=>!c.name));near([box.min.z,box.max.z],[0,.3],1e-6);
});

test('the app reads SDFormat and MuJoCo files from disk with their meshes: meshdir, model:// and an .xml told apart by its root',()=>{
  const os=require('node:os'),{SimulationHost}=require('../src/sim-bridge.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'deck-formats-')),host=new SimulationHost({dataDir:root,emit:()=>{}});
  const stl=Buffer.alloc(84+50);stl.writeUInt32LE(1,80);[0,0,1, 0,0,0, 30,0,0, 0,40,0].forEach((v,i)=>stl.writeFloatLE(v,84+4*i));
  fs.mkdirSync(path.join(root,'arm/meshes'),{recursive:true});fs.writeFileSync(path.join(root,'arm/meshes/hand.stl'),stl);fs.writeFileSync(path.join(root,'arm/arm.xml'),read('arm_mjcf.xml'));
  const r=host.readDescription(path.join(root,'arm/arm.xml'));assert.equal(r.kind,'mjcf');assert.deepEqual(r.files.map(f=>[f.ref,f.format,f.bytes.length]),[['meshes/hand.stl','stl',134]]);assert.deepEqual(r.missing,[]);
  fs.mkdirSync(path.join(root,'models/scara_parts/meshes'),{recursive:true});fs.writeFileSync(path.join(root,'models/scara_parts/meshes/tip.stl'),stl);fs.mkdirSync(path.join(root,'models/scara'),{recursive:true});
  fs.writeFileSync(path.join(root,'models/scara/model.sdf'),read('scara.sdf').replace('<sphere><radius>0.02</radius></sphere>','<mesh><uri>model://scara_parts/meshes/tip.stl</uri></mesh>').replace('<box><size>0.3 0.05 0.05</size></box>','<mesh><uri>model://scara_parts/meshes/arm.dae</uri></mesh>'));
  const s=host.readDescription(path.join(root,'models/scara/model.sdf'));assert.equal(s.kind,'sdf');assert.deepEqual(s.files.map(f=>f.ref),['model://scara_parts/meshes/tip.stl']);assert.deepEqual(s.missing,['model://scara_parts/meshes/arm.dae (not found)']);
  fs.writeFileSync(path.join(root,'page.xml'),'<html/>');assert.throws(()=>host.readDescription(path.join(root,'page.xml')),/not a URDF, SDFormat or MuJoCo robot/);
});
