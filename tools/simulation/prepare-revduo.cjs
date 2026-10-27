'use strict';
// Prepare REV's 2026-27 DUO FTC Starter Bot CAD as the Starter Tank preset's model: ui/assets/robots/revduo.deck.gz.
// Local builds only: REV's CAD is not redistributed (git-ignored, left out of release packages; see NOTICES.md).
//   node tools/simulation/prepare-revduo.cjs [<STEP file>]   (default .cache/simulation-cad/revduo.step)
// The STEP comes from REV's public Onshape document (Export → STEP, AP242). The app's own importer reads it; then every
// part is turned into Deck's robot frame (x forward, y left, z up: the CAD's front is -y, its left +x), each moving part
// is filed into an assembly of its own (each wheel, both intake flap rollers, the feeder roller and its drive gear, the
// flywheel, the pollen pusher's arm) so the preset's joints (ui/sim-preset-robots.js REV) name them, and every part is
// simplified with meshoptimizer (MIT) to keep the model light. The result is an import (src/sim-model.cjs encodeImport),
// gzipped, that the window stores and rigs as it does a team's STEP.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'),SM=require('../../src/sim-model.cjs'),PR=require('../../ui/sim-preset-robots.js');
const {REV}=PR,NAME=REV.name,step=path.resolve(process.argv[2]||path.join(root,'.cache/simulation-cad/revduo.step'));
const STEP_SHA='0aebfc11f596f8234f57bcbebe71bdc473c4eb3eb38877dca68e44b1c5b7995a',KEEP=.08;
(async()=>{
  const sha=crypto.createHash('sha256').update(fs.readFileSync(step)).digest('hex');if(sha!==STEP_SHA)console.warn(`Note: ${path.basename(step)} is not the STEP this was prepared from (${sha}).`);
  const {MeshoptSimplifier:S}=await import(pathToFileURL(path.join(root,'.cache/cad-build-deps/node_modules/meshoptimizer/meshopt_simplifier.module.js')).href);await S.ready;
  console.log('Reading',step);
  const v=await SM.convertStep(step,path.join(root,'sim-runtime'),{cacheDir:path.join(root,'.cache/simulation-cad/import-cache'),progress:p=>{if(p.stage==='read'&&p.done%12===0)console.log(`  read ${p.done}/${p.total}`);}});
  // Back into one record per part: its vertices (contiguous) and triangles, its path in the CAD's tree.
  const nodes=v.tree.nodes,keyOf=k=>nodes[k].parent>=0?[...keyOf(nodes[k].parent),nodes[k].name]:[nodes[k].name];
  const count=v.tree.leaf.length,first=new Int32Array(count).fill(-1),last=new Int32Array(count),tris=Array.from({length:count},()=>[]);
  for(let i=0;i<v.part.length;i++){const m=v.part[i];if(first[m]<0)first[m]=i;last[m]=i;}
  for(let t=0;t<v.index.length;t+=3)tris[v.part[v.index[t]]].push(v.index[t],v.index[t+1],v.index[t+2]);
  const records=[];let before=0,after=0;
  for(let m=0;m<count;m++){if(first[m]<0||!tris[m].length)continue;const a=first[m],n=last[m]-a+1,P=new Float32Array(n*3),N=new Float32Array(n*3),Cl=new Uint8Array(n*3);
    // CAD (x right... left, y back, z up) to Deck (x forward, y left, z up): X = -y, Y = x.
    for(let i=0;i<n;i++){const s=3*(a+i);P[3*i]=-v.positions[s+1];P[3*i+1]=v.positions[s];P[3*i+2]=v.positions[s+2];N[3*i]=-v.normals[s+1];N[3*i+1]=v.normals[s];N[3*i+2]=v.normals[s+2];Cl.set(v.colors.subarray(s,s+3),3*i);}
    let I=new Uint32Array(tris[m].map(k=>k-a));before+=I.length/3;
    // Simplified to about KEEP of its triangles (small parts kept as they are).
    // Hardware too small to see closely (screws, nuts, spacers, collars, belt and chain links, gearbox cartridges) goes
    // further, ignoring its seams.
    const small=/Screw|Nut|SHCS|BHCS|Standoff|Spacer|Collar|Bearing|Endcap|Bushing|Belt|Chain|REV-41-16(0[0-9]|15)/i.test(path.basename(String(v.tree.nodes[v.tree.leaf[m]].name)));
    if(I.length>360){const target=Math.max(36,Math.floor(I.length*(small?.05:KEEP)/3)*3),[next]=small?S.simplifySloppy(I,P,3,null,target,1):S.simplify(I,P,3,target,.02,['Prune']);if(next.length>=12)I=new Uint32Array(next);}
    const [remap,unique]=S.compactMesh(I),p=new Float32Array(unique*3),nn=new Float32Array(unique*3),c=new Uint8Array(unique*3);
    for(let i=0;i<n;i++){const j=remap[i];if(j===0xffffffff)continue;p.set(P.subarray(3*i,3*i+3),3*j);nn.set(N.subarray(3*i,3*i+3),3*j);c.set(Cl.subarray(3*i,3*i+3),3*j);}
    after+=I.length/3;const path0=keyOf(v.tree.leaf[m]);records.push({src:path0.slice(1),name:path0.at(-1),position:p,normal:nn,colorBytes:c,index:I});}
  // ---- file each moving part into its assembly ----------------------------------------------------------------------
  const box=r=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<r.position.length;i++){const a=i%3;lo[a]=Math.min(lo[a],r.position[i]);hi[a]=Math.max(hi[a],r.position[i]);}return {lo,hi,c:lo.map((x,a)=>(x+hi[a])/2),s:lo.map((x,a)=>hi[a]-x)};};
  const top=r=>String(r.src[0]||'').replace(/\s*<\d+>$/,''),named=(r,re)=>re.test(r.name),near=(b,axis,tol)=>Math.hypot(b.c[0]-axis.x,b.c[2]-axis.z)<tol;
  const SPINS=/Hex Shaft|Shaft Collar|Spacer|Sprocket|HUB|TREAD|Gear|Core|Flap|REV-41-1354|REV-41-1190|REV-41-1340|REV-40-1955|REV-20-1977|Servo Horn/i,STILL=/Bearing|679ZZ|Bracket|Plate|Motor|REV-41-1291|REV-41-1300|REV-41-160\d|REV-41-1615|Chain|Belt|Screw|Nut|SHCS|BHCS/i;
  const moved={},file=(r,where)=>{r.path=[NAME,...where];moved[where.join('/')]=(moved[where.join('/')]||0)+1;};
  for(const r of records){const b=box(r),t=top(r);r.box=b;
    if(t==='Drivetrain'&&SPINS.test(r.name)&&!STILL.test(r.name)&&Math.abs(b.c[1])>5.2&&Math.abs(b.c[2]-REV.wheel.z)<.7){
      const w=REV.wheels.reduce((x,y)=>Math.hypot(b.c[0]-y.x,b.c[1]-y.y)<Math.hypot(b.c[0]-x.x,b.c[1]-x.y)?y:x);if(Math.abs(b.c[0]-w.x)<1.8){file(r,['Drivetrain',w.name]);continue;}}
    if(t==='Intake'&&(named(r,/Flap|Core/)||SPINS.test(r.name)&&!STILL.test(r.name))){const roll=REV.rollers.reduce((x,y)=>Math.hypot(b.c[0]-y.x,b.c[2]-y.z)<Math.hypot(b.c[0]-x.x,b.c[2]-x.z)?y:x);
      if(named(r,/Flap/)||near(b,roll,.75)){file(r,['Intake',roll.name]);continue;}}
    if(t==='Feeder'&&SPINS.test(r.name)&&!STILL.test(r.name)){if(near(b,REV.feeder,.9)){file(r,['Feeder','Feeder roller']);continue;}if(near(b,REV.feederGear,.6)){file(r,['Feeder','Feeder drive gear']);continue;}}
    if(t==='Launcher'&&SPINS.test(r.name)&&!STILL.test(r.name)&&near(b,REV.flywheel,1.9)&&b.c[1]>-3.9){file(r,['Launcher','Flywheel']);continue;}
    // The pusher's arm: all of it but the servo, its mount and the screws holding them (inboard of the arm's plane).
    if(t==='Pollen Pusher'&&!named(r,/Servo V2|REV-41-1485/)&&!(named(r,/Screw|Nut/)&&b.c[1]>-5.12)){file(r,['Pusher','Pusher arm']);continue;}
    // "Pollen Pusher" is filed as "Pusher": the app's CAD rules read a name with "pollen" in it as a shooter.
    r.path=[NAME,t==='Pollen Pusher'?'Pusher':t,...r.src.slice(1)];}
  // Each part's colour: its vertices' average, as the import stored it (linear, 0-1).
  const meshes=records.map(r=>{const color=[0,1,2].map(k=>{let s=0;for(let i=k;i<r.colorBytes.length;i+=3)s+=r.colorBytes[i];return +(((s/(r.colorBytes.length/3)||0)/255)).toFixed(4);});
    return {path:r.path.slice(0,-1).length?r.path:[NAME,'Body'],name:r.name,position:r.position,normal:r.normal,index:r.index,color};});
  const merged=SM.merge(meshes),value={kind:'step',name:NAME,...merged,tree:SM.tree(meshes),groups:SM.groups(meshes),names:SM.names(meshes)};
  const out=path.join(root,'ui/assets/robots/revduo.deck.gz'),gz=zlib.gzipSync(SM.encodeImport(value),{level:9});fs.writeFileSync(out,gz);
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<merged.positions.length;i++){const a=i%3;lo[a]=Math.min(lo[a],merged.positions[i]);hi[a]=Math.max(hi[a],merged.positions[i]);}
  console.log(`${before} → ${after} triangles, ${meshes.length} parts, box ${lo.map(x=>x.toFixed(2))} .. ${hi.map(x=>x.toFixed(2))}`);
  console.log('moving parts',JSON.stringify(moved));console.log('groups',value.groups.map(g=>g.name).join(', '));
  const catalogFile=path.join(root,'ui/assets/robots/catalog.json'),catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
  catalog.revduo={...catalog.revduo,stepSha256:STEP_SHA,assetSha256:crypto.createHash('sha256').update(gz).digest('hex')};fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+'\n');
  console.log('Wrote',out,(gz.length/1048576).toFixed(1),'MB');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
