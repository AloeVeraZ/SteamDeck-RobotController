// Dev tool: the Test setup's generated robot (ui/sim-test-robot.js) as a viewable GLB, one node per assembly and part and
// one material per colour, for Blender, screenshots and re-import tests through Import your robot (which finds the
// chassis, the ramp intake and the turret by their names). glTF's frame by default: metres, +Y up, the robot's front
// along +Z; --inches keeps the robot frame (inches, +Z up, front +X). --setup also writes the example setup and its pins.
//   node tools/simulation/make-test-robot.mjs <out.glb> [--inches] [--setup examples/test-setup.json]
// Three.js comes from .cache/simulation-deps (node tools/simulation/fetch.cjs or the simulation build installs it).
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),require=createRequire(import.meta.url),Robot=require('../../ui/sim-test-robot.js');
const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]&&!args[i+1].startsWith('--')?args.splice(i,2)[1]:(args.splice(i,1),true);};
const inches=flag('--inches')===true,setupFile=flag('--setup'),out=args[0];
if(!out&&!setupFile){console.error('Usage: node tools/simulation/make-test-robot.mjs <out.glb> [--inches] [--setup examples/test-setup.json]');process.exit(1);}
if(setupFile){
  // The example setup, as the app seeds it (its model is attached when the app opens it), and its pins for deck-sim pins.
  const setup=Robot.setup(),file=path.resolve(setupFile);fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(setup,null,2)+'\n');fs.writeFileSync(file.replace(/\.json$/i,'')+'.pins.json',JSON.stringify(setup.layouts[0].pins,null,2)+'\n');
  console.log(`Wrote ${path.relative(root,file)} (${setup.layouts[0].pins.length} pins) and its .pins.json.`);}
if(out){
  const deps=path.join(root,'.cache/simulation-deps/node_modules/three');if(!fs.existsSync(deps)){console.error('Three.js is missing: build the simulator first (node tools/simulation/build.cjs).');process.exit(1);}
  const T=await import(path.join(deps,'build/three.module.js')),{GLTFExporter}=await import(path.join(deps,'examples/jsm/exporters/GLTFExporter.js'));
  // GLTFExporter reads its binary through FileReader, which Node does not have.
  globalThis.FileReader??=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}readAsDataURL(b){b.arrayBuffer().then(r=>{this.result='data:application/octet-stream;base64,'+Buffer.from(r).toString('base64');this.onloadend?.();});}};
  // Robot (x forward, y left, z up, inches) to glTF (X left, Y up, Z forward, metres): a turn, so faces keep their winding.
  const to=inches?(x,y,z)=>[x,y,z]:(x,y,z)=>[y*.0254,z*.0254,x*.0254],dir=inches?(x,y,z)=>[x,y,z]:(x,y,z)=>[y,z,x];
  const scene=new T.Scene(),nodes=new Map(),materials=new Map(),meshes=Robot.meshes();let triangles=0;
  const node=keys=>{const key=keys.join('/');let n=nodes.get(key);if(!n){n=new T.Group();n.name=keys.at(-1);(keys.length>1?node(keys.slice(0,-1)):scene).add(n);nodes.set(key,n);}return n;};
  for(const m of meshes){
    const g=new T.BufferGeometry(),p=new Float32Array(m.position.length),n=new Float32Array(m.normal.length);
    for(let i=0;i<p.length;i+=3){p.set(to(m.position[i],m.position[i+1],m.position[i+2]),i);n.set(dir(m.normal[i],m.normal[i+1],m.normal[i+2]),i);}
    g.setAttribute('position',new T.BufferAttribute(p,3));g.setAttribute('normal',new T.BufferAttribute(n,3));g.setIndex(new T.BufferAttribute(m.index,1));triangles+=m.index.length/3;
    const key=m.color.join(',');if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color:new T.Color(...m.color),roughness:.6,metalness:m.color[0]>.5&&Math.abs(m.color[0]-m.color[2])<.1?.35:.05}));
    const mesh=new T.Mesh(g,materials.get(key));mesh.name=m.name;node(m.path).add(mesh);}
  // The joints the setup ships ride along as extras (robot frame, inches) for anyone inspecting the file.
  const top=nodes.get(Robot.NAME);top.userData={deckTestRobot:Robot.VERSION,frame:inches?'inches, +z up, front +x':'metres, +y up, front +z',joints:Robot.kinematics().joints};
  const glb=await new Promise((resolve,reject)=>new GLTFExporter().parse(scene,b=>resolve(Buffer.from(b)),reject,{binary:true}));
  const file=path.resolve(out);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,glb);
  console.log(`Wrote ${file}: ${meshes.length} parts in ${nodes.size} assemblies, ${triangles} triangles, ${materials.size} materials, ${(glb.length/1048576).toFixed(2)} MB.`);}
