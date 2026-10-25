'use strict';
// URDF robots: joints from the file (confirmed), the body built at zero, mimic tags as couplings.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const U=require('../ui/sim-urdf.js'),K=require('../ui/sim-kinematics.js');
const xml=fs.readFileSync(path.join(__dirname,'fixtures/arm_gripper.urdf'),'utf8'),M=K.math;
const near=(a,b,tol,msg)=>{const x=[].concat(a),y=[].concat(b);x.forEach((v,i)=>assert.ok(Math.abs(v-y[i])<=tol,`${msg||''} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));};
const threePath=path.join(__dirname,'../.cache/simulation-deps/node_modules/three'),skip=fs.existsSync(threePath)?false:'build the simulation dependencies for Three.js';
test('a URDF is read: links, joints, the root, limits, mimic and the mesh files it names',()=>{
  const u=U.parse(xml);assert.equal(u.name,'arm_gripper');assert.equal(u.root,'base_link');assert.equal(u.links.length,6);assert.equal(u.joints.length,5);
  const r=u.joints.find(j=>j.name==='finger_right');assert.deepEqual(r.mimic,{joint:'finger_left',multiplier:-1,offset:0});near(u.joints[1].limit.upper,1.5708,1e-9);
  assert.deepEqual(U.meshFiles(u),['package://arm_gripper/meshes/camera.dae']);assert.deepEqual(u.links[0].visuals[0].colour,[.1,.3,.8],'material colour by name');
  assert.throws(()=>U.parse('<robot name="x"><link name="a"/><joint name="j" type="fixed"><parent link="a"/><child link="b"/></joint></robot>'),/does not have/);
  assert.throws(()=>U.parse('<model/>'),/not a URDF/);
});
test('rpy is roll about x, then pitch about y, then yaw about z (fixed axes)',()=>{
  const F=U.frameOf({xyz:[0,0,0],rpy:[Math.PI/2,0,Math.PI/2]});
  // x→ yaw 90 → y; y → roll 90 → z, then yaw leaves z: so local y ends along world z, local x along world y.
  near(M.applyDir(F,[1,0,0]),[0,1,0],1e-12);near(M.applyDir(F,[0,1,0]),[0,0,1],1e-12);
});
test('joints from the file move the links as the URDF says: confirmed, with limits in degrees and inches and mimic as a coupling',()=>{
  const u=U.parse(xml),k=K.sanitize({...U.toKinematics(u),model:'0123456789abcdef0123456789abcdef.glb'});
  const j=id=>k.joints.find(x=>x.id===id);
  assert.ok(k.joints.every(x=>x.source==='metadata'&&x.confidence===1),'from the file, not inferred');
  assert.equal(j('shoulder').parent,'turn');assert.deepEqual(j('shoulder').parts,['base_link/link1/link2']);near([j('shoulder').lower,j('shoulder').upper],[-90,90],.01);
  near(j('finger_left').upper,.02*U.IN_PER_M,1e-3,'0.02 m is 0.787 in');assert.equal(k.couplings[0].ratio,-1);assert.equal(j('finger_right').drive,undefined,'a mimic joint follows; nothing drives it');
  // The forearm's tip (0.3, 0, 0.3) at shoulder 30°, turn 90°: about +y 30° then about z 90°.
  const p=M.apply(K.pose(k,{turn:90,shoulder:30}).W.get('shoulder'),[.3,0,.3]),t=30*Math.PI/180;near(p,[0,.3*Math.cos(t),.3-.3*Math.sin(t)],1e-9);
  // Fingers: 0.5 in apart opens both, symmetrically.
  const q=K.pose(k,{finger_left:.5}),l=M.apply(q.W.get('finger_left'),[.3,.02,.3]),r=M.apply(q.W.get('finger_right'),[.3,-.02,.3]);near([l[1],r[1]],[.02+.5/U.IN_PER_M,-.02-.5/U.IN_PER_M],1e-9);
  // The fixed camera rides the forearm, turned 90° about its own z.
  const cam=j('camera_mount');assert.equal(cam.type,'fixed');assert.equal(cam.parent,'shoulder');near(cam.origin,[.1,0,.35],1e-9);
});
test('the body is built at zero with each link a part under its parent, so it splits along the joints',{skip},()=>{
  const T=require(threePath);globalThis.DeckThree={THREE:T};const u=U.parse(xml),{group,missing}=U.buildScene(u,T);
  assert.deepEqual(missing,['camera: package://arm_gripper/meshes/camera.dae'],'a Collada mesh is reported and its collision sphere drawn instead');
  const meshes=[];group.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.equal(meshes.length,6);
  // The forearm box sits from x 0 to 0.3 at height 0.3.
  const box=new T.Box3().setFromObject(group.getObjectByName('link2').children.find(c=>!c.name));near([box.min.x,box.max.x,(box.min.z+box.max.z)/2],[0,.3,.3],1e-6);
  // Names nest as the joints do: the forearm's node key is the path from the root link.
  let n=group.getObjectByName('finger_r'),names=[];while(n&&n!==group){if(n.name)names.unshift(n.name);n=n.parent;}assert.equal(names.join('/'),'base_link/link1/link2/finger_r');
});
test('the app reads a URDF from a ROS package: package:// meshes found in the folders above it, Collada reported',()=>{
  const os=require('node:os'),{SimulationHost}=require('../src/sim-bridge.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'deck-urdf-'));
  const pkg=path.join(root,'arm_gripper');fs.mkdirSync(path.join(pkg,'urdf'),{recursive:true});fs.mkdirSync(path.join(pkg,'meshes'));
  // A one-triangle binary STL for the forearm, and the camera's Collada file.
  const stl=Buffer.alloc(84+50);stl.writeUInt32LE(1,80);[0,0,1, 0,0,0, .3,0,0, 0,.04,0].forEach((v,i)=>stl.writeFloatLE(v,84+4*i));fs.writeFileSync(path.join(pkg,'meshes/forearm.stl'),stl);fs.writeFileSync(path.join(pkg,'meshes/camera.dae'),'<COLLADA/>');
  fs.writeFileSync(path.join(pkg,'urdf/arm.urdf'),xml.replace('<box size="0.3 0.04 0.04"/>','<mesh filename="package://arm_gripper/meshes/forearm.stl"/>'));
  const r=new SimulationHost({dataDir:root,emit:()=>{}}).readUrdf(path.join(pkg,'urdf/arm.urdf'));
  assert.equal(r.kind,'urdf');assert.deepEqual(r.files.map(f=>[f.ref,f.format,f.bytes.length]),[['package://arm_gripper/meshes/forearm.stl','stl',134]]);
  assert.deepEqual(r.missing,['package://arm_gripper/meshes/camera.dae (dae meshes are not read)']);
});
