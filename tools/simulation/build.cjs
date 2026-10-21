'use strict';
// Reproducible local build of the simulator's third-party pieces. Inputs are the pinned,
// git-ignored upstream clones and dependency folders under .cache; outputs are git-ignored:
//   ui/vendor/        browser bundles, DSIM field models and license notices
//   sim-runtime/      DSIM headless physics bundle, compiled Pedro bridge, Java runtime
// Usage: node tools/simulation/build.cjs [--skip-java]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'../..'),cache=path.join(root,'.cache'),deps=path.join(cache,'simulation-deps/node_modules'),runtime=path.join(cache,'simulation-runtime');
const upstream={dsim:{dir:path.join(cache,'upstream/dsim'),commit:'0df84143a52dde4c7c196fb21b94264a13da91b6'},pedro:{dir:path.join(cache,'upstream/pedro'),commit:'cf4be31449a8963af3a7ce7951de09fd163bbb3d'}};
// Must match tools/simulation/deps-package.json (installed into .cache/simulation-deps).
const versions={esbuild:'0.25.12','@dimforge/rapier2d-compat':'0.19.3','@dimforge/rapier3d-deterministic-compat':'0.20.0',three:'0.186.0','clipper-lib':'6.4.2',dijkstrajs:'1.0.3','occt-import-js':'0.0.23'};
const vendor=path.join(root,'ui/vendor'),out=path.join(root,'sim-runtime'),skipJava=process.argv.includes('--skip-java');
// --public: a build for redistribution. Third-party CAD whose terms do not allow redistribution (FIRST
// field models, vendor chassis) is left out; the app falls back to drawings and plain shapes.
const publicBuild=process.argv.includes('--public');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function check(){
  for(const [name,{dir,commit}] of Object.entries(upstream)){
    const head=execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(head!==commit)throw Error(`${name} clone is at ${head}; expected pinned ${commit}.`);
    const dirty=execFileSync('git',['-C',dir,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim();
    if(dirty)throw Error(`${name} clone has local modifications:\n${dirty}`);
  }
  for(const [name,version] of Object.entries(versions)){const actual=JSON.parse(fs.readFileSync(path.join(deps,name,'package.json'),'utf8')).version;if(actual!==version)throw Error(`${name} ${actual} installed; expected ${version}.`);}
  const robots=JSON.parse(fs.readFileSync(path.join(root,'ui/assets/robots/catalog.json'),'utf8'));for(const id of ['strafer','swechanum'])if(fs.existsSync(path.join(root,'ui/assets/robots',id+'.glb.gz'))&&sha(path.join(root,'ui/assets/robots',id+'.glb.gz'))!==robots[id].assetSha256)throw Error(`Bundled ${id} CAD differs from its prepared hash.`);
}
function copy(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});fs.cpSync(from,to,{recursive:true});}
async function bundles(){
  const esbuild=require(path.join(deps,'esbuild'));
  // DSIM's online-only modules stay out of the bundle; see stubs/discordActivity.ts.
  const stubs={name:'deck-dsim-stubs',setup(b){b.onResolve({filter:/net\/discordActivity$/},()=>({path:path.join(__dirname,'stubs/discordActivity.ts')}));}};
  // Offline robots use a typed intake reach rather than a game's fixed intake preset.
  const footprint={name:'deck-offline-footprint',setup(b){b.onLoad({filter:/[\\/]src[\\/]sim[\\/]field\.ts$/},args=>{const text=fs.readFileSync(args.path,'utf8'),from='const reach = C.INTAKE_PRESETS[spec.intake].reach;';if(text.split(from).length!==2)throw Error('Review the DSIM footprint adapter.');return {contents:text.split(from).join('const reach = (spec as RobotSpec & {deckIntakeReach?:number}).deckIntakeReach ?? C.INTAKE_PRESETS[spec.intake].reach;'),loader:'ts'};});}};
  const pushbot={name:'deck-offline-pushbot',setup(b){b.onLoad({filter:/[\\/]games[\\/]biobuzz[\\/]sim3d[\\/]bodies\.ts$/},args=>{let text=fs.readFileSync(args.path,'utf8');const patches={
    'export function chassis3dShapes(spec: RobotSpec, heightIn: number): Chassis3dShape[] {':'const deckReach = (spec as RobotSpec & {deckIntakeReach?:number}).deckIntakeReach; if (deckReach !== undefined) return [{cx:deckReach/2,cy:0,cz:0,hx:(spec.length+deckReach)/2,hy:spec.width/2,hz:heightIn/2}];',
    'export function chassis3dPocketShapes(spec: RobotSpec, heightIn: number): Chassis3dShape[] {':'if ((spec as RobotSpec & {deckIntakeReach?:number}).deckIntakeReach !== undefined) return [];',
    'export function chassis3dReachShapes(spec: RobotSpec, heightIn: number, rampReady: boolean): Chassis3dShape[] {':'if ((spec as RobotSpec & {deckIntakeReach?:number}).deckIntakeReach !== undefined) return [];'};
    for(const [from,code] of Object.entries(patches)){if(text.split(from).length!==2)throw Error('Review the BIOBUZZ pushbot collider adapter.');text=text.split(from).join(from+'\n'+code);}return {contents:text,loader:'ts'};});}};
  const barriers={name:'deck-offline-barriers',setup(b){b.onLoad({filter:/[\\/]sim[\\/]physicsEngine\.ts$/},args=>{let text=fs.readFileSync(args.path,'utf8'),from='function buildStatics(rw: RAPIER.World, colliders: FieldColliders, groups?: number, friction?: number): void {';if(text.split(from).length!==2)throw Error('Review 2D barrier adapter.');text=text.split(from).join(from+'\nfor (const points of (colliders as FieldColliders & {deckPolygons?:number[][]}).deckPolygons ?? []) { const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(points)); if(desc) rw.createCollider(statics(desc,groups,friction)); }');return {contents:text,loader:'ts'};});
    b.onLoad({filter:/[\\/]sim3d[\\/]engineImpl\.ts$/},args=>{let text=fs.readFileSync(args.path,'utf8'),from='buildStatics3d(RAPIER, world3d, PHYS_WALL_FRICTION);';if(text.split(from).length!==2)throw Error('Review 3D barrier adapter.');text=text.split(from).join(from+'\nfor (const points of (world as World & {deckPolygons?:number[][]}).deckPolygons ?? []) { const p:number[]=[];for(let i=0;i<points.length;i+=2)for(const z of [0,12])p.push(points[i],points[i+1],z);const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(p));if(desc)world3d.createCollider(desc.setFriction(PHYS_WALL_FRICTION).setRestitution(0)); }');return {contents:text,loader:'ts'};});
    b.onLoad({filter:/[\\/](sim[\\/]artifactSolids|games[\\/]biobuzz[\\/]robot)\.ts$/},args=>{let text=fs.readFileSync(args.path,'utf8').split('\r\n').join('\n'),from='): RobotSolids {\n  const hl = r.spec.length / 2;';if(text.split(from).length!==2)throw Error('Review pushbot element-solid adapter.');text=text.split(from).join('): RobotSolids {\nconst deckReach=(r.spec as RobotSpec & {deckIntakeReach?:number}).deckIntakeReach;if(deckReach!==undefined)return {chassis:{kind:"box",cx:deckReach/2,cy:0,hx:(r.spec.length+deckReach)/2,hy:r.spec.width/2},structure:[],held:[]};\n  const hl = r.spec.length / 2;');return {contents:text,loader:'ts'};});}};
  // Approximate current-limited torque, applied in both headless and rendered physics.
  const current={name:'deck-drive-current',setup(b){b.onLoad({filter:/[\\/]sim[\\/]drivetrain\.ts$/},args=>{let text=fs.readFileSync(args.path,'utf8');const from='p.accelMult;',to='p.accelMult * clamp(((spec as RobotSpec & {deckDriveAmps?:number}).deckDriveAmps ?? 20) / 20, .05, 2);';if(text.split(from).length!==2)throw Error('Review drive current adapter.');text=text.split(from).join(to);const force='p.pushMult * rpmPush * (1 - powerDraw);';if(text.split(force).length!==2)throw Error('Review current push adapter.');text=text.split(force).join('p.pushMult * rpmPush * (1 - powerDraw) * clamp(((spec as RobotSpec & {deckDriveAmps?:number}).deckDriveAmps ?? 20) / 20, .05, 2);');return {contents:text,loader:'ts'};});}};
  // FLOAT zero-power behaviour: an unpowered axis coasts on friction instead of braking. Coast rates
  // are from a tuned DECODE mecanum robot's Pedro AutoTune (natural deceleration 83.6 in/s² forward,
  // 68.8 strafe); one robot's data, so an approximation. Powered braking is unchanged.
  const coast={name:'deck-float-coast',setup(b){b.onLoad({filter:/[\\/]sim[\\/]robot\.ts$/},args=>{let text=fs.readFileSync(args.path,'utf8');
    const move='    shoved ? C.MOTOR_SHOVE_BRAKE : C.MOTOR_BRAKE_MULT,',yaw='    shovedYaw ? C.MOTOR_SHOVE_BRAKE : C.MOTOR_BRAKE_MULT,';if(text.split(move).length!==2||text.split(yaw).length!==2)throw Error('Review float coast adapter.');
    const decel='((s: number, c: number, n: number) => (83.6 * c * c + (dp.strafeMult > 0 && dp.strafeMult < 1 ? 68.8 : 83.6) * n * n))(Math.hypot(velRobot.x, velRobot.y) || 1, velRobot.x / (Math.hypot(velRobot.x, velRobot.y) || 1), velRobot.y / (Math.hypot(velRobot.x, velRobot.y) || 1))';
    // Powered braking: the same robot's braking distance d(v) = l·v + q·v² (forward l 0.1323, q 0.0015;
    // strafe 0.0502, 0.0023; heading 0.0855, 0.0038) implies a(v) = v / (l + 2·q·v). It never falls
    // below the coast rate and never exceeds DSIM's traction-limited brake.
    const brake=(l,q,v,floor,cap)=>`Math.min(${cap}, Math.max(${floor}, ${v} / (${l} + 2 * ${q} * ${v})))`;
    const speed='Math.hypot(velRobot.x, velRobot.y)',forward=`Math.abs(velRobot.x) / (${speed} || 1)`;
    const linear=`(${forward} * ${forward} * ${brake(0.1323,0.0015,speed,83.6,'C.MOTOR_BRAKE_MULT * dp.accel')} + (1 - ${forward} * ${forward}) * ${brake('(dp.strafeMult > 0 && dp.strafeMult < 1 ? 0.0502 : 0.1323)','(dp.strafeMult > 0 && dp.strafeMult < 1 ? 0.0023 : 0.0015)',speed,'(dp.strafeMult > 0 && dp.strafeMult < 1 ? 68.8 : 83.6)','C.MOTOR_BRAKE_MULT * dp.accel')}) / Math.max(dp.accel, 1e-6)`;
    text=text.split(move).join(`    (r as RobotState & {deckFloat?: boolean}).deckFloat && unpowered ? ${decel} / Math.max(dp.accel, 1e-6) : shoved ? C.MOTOR_SHOVE_BRAKE : ${linear},`);
    // Static friction: a stopped chassis does not creep under less than ~4% power (FTC drive motors
    // need a few percent to break away), so a robot holding a point stays put under tiny corrections.
    const still='  const unpowered = targetFwd === 0 && targetStrafe === 0;';if(text.split(still).length!==2)throw Error('Review static friction adapter.');
    text=text.split(still).join(`  if (Math.hypot(velRobot.x, velRobot.y) < 0.5 && Math.hypot(targetFwd, targetStrafe) < 0.04 * dp.maxSpeed) { targetFwd = 0; targetStrafe = 0; }\n  if (Math.abs(r.angVel) < 0.02 && Math.abs(targetOmega) < 0.04 * dp.maxTurn) targetOmega = 0;\n${still}`);
    const radius='(Math.hypot(r.spec.length, r.spec.width) / 2)';
    text=text.split(yaw).join(`    (r as RobotState & {deckFloat?: boolean}).deckFloat && targetOmega === 0 ? 83.6 / ${radius} / Math.max(dp.turnAccel, 1e-6) : shovedYaw ? C.MOTOR_SHOVE_BRAKE : ${brake(0.0855,0.0038,'Math.abs(r.angVel)',`83.6 / ${radius}`,'C.MOTOR_BRAKE_MULT * dp.turnAccel')} / Math.max(dp.turnAccel, 1e-6),`);
    return {contents:text,loader:'ts'};});}};
  const common={bundle:true,logLevel:'warning',nodePaths:[deps],alias:{dsim:upstream.dsim.dir},plugins:[stubs,footprint,pushbot,barriers,current,coast],legalComments:'eof',target:'es2022',minify:true,
    define:{'import.meta.env':JSON.stringify({BASE_URL:'deck-asset://dsim/',DEV:false,PROD:true,MODE:'production'})}};
  await esbuild.build({...common,entryPoints:[path.join(__dirname,'planning-entry.js')],format:'iife',globalName:'DeckPlanningLibs',platform:'browser',outfile:path.join(vendor,'planning.js')});
  await esbuild.build({...common,entryPoints:[path.join(__dirname,'planning-entry.js')],format:'cjs',platform:'node',outfile:path.join(vendor,'planning.cjs')});
  await esbuild.build({...common,entryPoints:[path.join(__dirname,'dsim-host-entry.ts')],format:'cjs',platform:'node',outfile:path.join(out,'dsim-host.cjs')});
  await esbuild.build({...common,define:{'import.meta.env':JSON.stringify({BASE_URL:'./vendor/',DEV:false,PROD:true,MODE:'production'})},entryPoints:[path.join(__dirname,'view-entry.js')],format:'iife',globalName:'DeckThree',platform:'browser',outfile:path.join(vendor,'three-view.js')});
}
function assets(){
  fs.rmSync(path.join(vendor,'models'),{recursive:true,force:true});
  if(!publicBuild)for(const name of ['field.glb','field-low.glb','elements.glb','README.md'])copy(path.join(upstream.dsim.dir,'public/models/biobuzz',name),path.join(vendor,'models/biobuzz',name));
  const decode=path.join(root,'ui/assets/fields/decode.glb.gz');if(!publicBuild&&fs.existsSync(decode)){if(sha(decode)!=='7fd6aac73fead31e75f9e654a6437a45ca1916f5b481c0a7ca8cdeeb475370e9')throw Error('DECODE field CAD changed; review its source and hash.');fs.mkdirSync(path.join(vendor,'models/decode'),{recursive:true});fs.writeFileSync(path.join(vendor,'models/decode/field.glb'),require('node:zlib').gunzipSync(fs.readFileSync(decode)));}
  for(const stale of ['dsim','dsim-view.js'])fs.rmSync(path.join(vendor,stale),{recursive:true,force:true});
  const occt=path.join(deps,'occt-import-js/dist');for(const file of ['occt-import-js.js','occt-import-js.wasm'])copy(path.join(occt,file),path.join(out,'occt',file));
  const licenses=path.join(vendor,'licenses');fs.rmSync(licenses,{recursive:true,force:true});fs.mkdirSync(licenses,{recursive:true});
  const notices={'DSIM-LICENSE':path.join(upstream.dsim.dir,'LICENSE'),'DSIM-NOTICE':path.join(upstream.dsim.dir,'NOTICE'),
    'PEDRO-LICENSE':path.join(upstream.pedro.dir,'LICENSE'),'OCCT-IMPORT-JS-LICENSE':path.join(deps,'occt-import-js/dist/license.occt-import-js.txt'),'OPENCASCADE-LICENSE':path.join(deps,'occt-import-js/dist/license.occt.txt'),'THREE-LICENSE':path.join(deps,'three/LICENSE'),
    'RAPIER3D-LICENSE':path.join(deps,'@dimforge/rapier3d-deterministic-compat/LICENSE'),'DIJKSTRAJS-LICENSE':path.join(deps,'dijkstrajs/LICENSE.md')};
  for(const [name,file] of Object.entries(notices)){if(!fs.existsSync(file))throw Error('Missing license file '+file);fs.copyFileSync(file,path.join(licenses,name));}
  // The CAD notices describe CAD that only personal local builds include.
  for(const [from,name] of [['ui/assets/robots/NOTICES.md','ROBOT-CAD-NOTICES.md'],['ui/assets/fields/NOTICES.md','FIELD-CAD-NOTICES.md']]){
    if(publicBuild)fs.rmSync(path.join(licenses,name),{force:true});else fs.copyFileSync(path.join(root,from),path.join(licenses,name));}
  // These two packages ship their terms in package metadata or a source header, not a file.
  fs.writeFileSync(path.join(licenses,'RAPIER2D-NOTICE.txt'),'@dimforge/rapier2d-compat 0.19.3 is licensed under the Apache License 2.0 (package.json "license": "Apache-2.0"). Its npm package omits the text; RAPIER3D-LICENSE is the same Apache-2.0 license from the same authors (Dimforge).\n');
  const clipper=fs.readFileSync(path.join(deps,'clipper-lib/clipper.js'),'utf8'),header=clipper.slice(0,clipper.indexOf('*/')+2);
  if(!/Boost Software License/.test(header))throw Error('Clipper license header not found.');fs.writeFileSync(path.join(licenses,'CLIPPER-NOTICE.txt'),header+'\n\nBoost Software License 1.0: https://www.boost.org/LICENSE_1_0.txt\n');
}
function java(){
  const jdk=fs.readdirSync(path.join(runtime,'jdk')).map(d=>path.join(runtime,'jdk',d))[0],javac=path.join(jdk,'bin',process.platform==='win32'?'javac.exe':'javac');
  const build=path.join(cache,'simulation-build'),src=path.join(build,'src'),classes=path.join(out,'pedro/classes');
  fs.rmSync(build,{recursive:true,force:true});fs.rmSync(classes,{recursive:true,force:true});fs.mkdirSync(src,{recursive:true});
  // Pedro reads System.nanoTime() for PID derivatives/integrals, Foresight's hold timeout and
  // Follower.update(). Redirect exactly those reads to the simulation clock so a paused or
  // accelerated simulation cannot wind up an integral or expire a timeout in wall time.
  let patched=0;const pedroSrc=path.join(upstream.pedro.dir,'core/src/main/java');
  for(const file of walk(pedroSrc).filter(f=>f.endsWith('.java'))){
    let text=fs.readFileSync(file,'utf8');const count=(text.match(/System\.nanoTime\(\)/g)||[]).length;
    if(count){text=text.replace(/System\.nanoTime\(\)/g,'deck.sim.SimClock.nanoTime()');patched+=count;}
    const target=path.join(src,path.relative(pedroSrc,file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);
  }
  if(patched!==12)throw Error(`Expected 12 System.nanoTime() reads in Pedro core; found ${patched}. Review the clock patch.`);
  // Pedro's real FTC adapter (revhub: Mecanum, the odometry/Pinpoint/OTOS localizers, IMU wrappers),
  // compiled against the virtual Control Hub's SDK stand-ins. OctoQuad and servo-steered swerve
  // hardware are not emulated, so those files are left out.
  const revhubSrc=path.join(upstream.pedro.dir,'revhub/src/main/java');let revhubFiles=0;
  for(const file of walk(revhubSrc).filter(f=>f.endsWith('.java')&&!/(OctoQuad|Swerve|CoaxialPod)/.test(path.basename(f)))){
    const text=fs.readFileSync(file,'utf8').replace(/System\.nanoTime\(\)/g,'deck.sim.SimClock.nanoTime()');
    const target=path.join(src,path.relative(revhubSrc,file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);revhubFiles++;
  }
  if(revhubFiles!==17)throw Error(`Expected 17 Pedro revhub sources; found ${revhubFiles}. Review the virtual Control Hub file list.`);
  copy(path.join(__dirname,'java'),src);
  const files=walk(src).filter(f=>f.endsWith('.java')),list=path.join(build,'sources.txt');fs.writeFileSync(list,files.map(f=>'"'+f.replace(/\\/g,'/')+'"').join('\n'));
  fs.mkdirSync(classes,{recursive:true});
  execFileSync(javac,['--release','17','-encoding','UTF-8','-nowarn','-cp',path.join(runtime,'gson.jar'),'-d',classes,'@'+list],{stdio:'inherit'});
  fs.copyFileSync(path.join(runtime,'gson.jar'),path.join(out,'pedro/gson.jar'));
  fs.copyFileSync(path.join(upstream.pedro.dir,'LICENSE'),path.join(out,'pedro/PEDRO-LICENSE'));
  fs.writeFileSync(path.join(out,'pedro/GSON-NOTICE.txt'),'Gson 2.11.0 (com.google.code.gson:gson), Apache License 2.0. Copyright 2008 Google Inc.\nhttps://www.apache.org/licenses/LICENSE-2.0\n');
  // This machine's reduced runtime (tools/simulation/fetch.cjs builds one per platform; releases ship
  // them beside the app instead, see tools/package.py).
  const hostRuntime=[path.join(runtime,`java-${process.platform}-${process.arch}`),path.join(runtime,'java')].find(d=>fs.existsSync(d));
  fs.rmSync(path.join(out,'java'),{recursive:true,force:true});copy(hostRuntime,path.join(out,'java'));
  return patched;
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
(async()=>{
  check();fs.mkdirSync(vendor,{recursive:true});fs.mkdirSync(out,{recursive:true});
  await bundles();assets();const clockReads=skipJava?null:java();
  const files=[...walk(vendor),...walk(path.join(root,'ui/assets/robots')).filter(f=>!f.endsWith('.glb')),...walk(path.join(root,'ui/assets/fields')),...['dsim-host.cjs','occt/occt-import-js.js','occt/occt-import-js.wasm'].map(f=>path.join(out,f))].filter(f=>!f.includes(path.sep+'licenses'+path.sep));
  let previous=null;try{previous=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8')).java;}catch{}
  const manifest={upstream:Object.fromEntries(Object.entries(upstream).map(([k,v])=>[k,v.commit])),versions,java:skipJava?previous:{runtime:fs.readFileSync(path.join(out,'java/release'),'utf8').match(/JAVA_VERSION="([^"]+)"/)[1],gson:'2.11.0',pedroClockReadsPatched:clockReads},
    outputs:Object.fromEntries(files.map(f=>[path.relative(root,f).replace(/\\/g,'/'),sha(f)]))};
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,1));
  console.log('Simulation build complete:',Object.keys(manifest.outputs).length,'outputs.');
})().catch(e=>{console.error(e.message||e);process.exitCode=1;});
