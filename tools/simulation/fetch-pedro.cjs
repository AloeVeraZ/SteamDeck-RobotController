'use strict';
// Downloads Pedro Pathing core and revhub 3.0.2 (what the Pedro Quickstart pins) from Maven Central into
// .cache/pedro/3.0.2, after checking each file against Maven Central's published SHA-1. The simulator
// can then run a Pedro Pathing export on the virtual Control Hub with Pedro's real Follower
// (tests/sim-pedro-runtime.test.cjs, deck-sim test --code pedro). Nothing is bundled into the app.
// Usage: node tools/simulation/fetch-pedro.cjs
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const VERSION='3.0.2',root=path.join(__dirname,'../..'),dir=path.join(root,'.cache/pedro',VERSION);
const jars=()=>['core.jar','revhub.jar'].map(f=>path.join(dir,f));
const get=url=>new Promise((resolve,reject)=>https.get(url,res=>{if(res.statusCode!==200){res.resume();return reject(Error(`${url}: HTTP ${res.statusCode}`));}const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(Buffer.concat(chunks)));}).on('error',reject));
async function fetchPedro(){
  if(jars().every(f=>fs.existsSync(f)))return jars();
  const jdk=fs.readdirSync(path.join(root,'.cache/simulation-runtime/jdk')).map(d=>path.join(root,'.cache/simulation-runtime/jdk',d))[0];
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'deck-pedro-'));
  try{
    fs.mkdirSync(dir,{recursive:true});
    for(const [name,ext] of [['core','jar'],['revhub','aar']]){
      const url=`https://repo1.maven.org/maven2/com/pedropathing/${name}/${VERSION}/${name}-${VERSION}.${ext}`,bytes=await get(url),expected=(await get(url+'.sha1')).toString().trim().slice(0,40);
      const actual=crypto.createHash('sha1').update(bytes).digest('hex');if(actual!==expected)throw Error(`Pedro ${name} SHA-1 ${actual} does not match Maven Central's ${expected}.`);
      if(ext==='jar')fs.writeFileSync(path.join(dir,name+'.jar'),bytes);
      else{fs.writeFileSync(path.join(temp,'lib.aar'),bytes);execFileSync(path.join(jdk,'bin',process.platform==='win32'?'jar.exe':'jar'),['xf','lib.aar','classes.jar'],{cwd:temp});fs.copyFileSync(path.join(temp,'classes.jar'),path.join(dir,name+'.jar'));}
      console.log(`Pedro Pathing ${name} ${VERSION}: SHA-1 verified, saved to ${path.relative(root,path.join(dir,name+'.jar'))}.`);
    }
    fs.writeFileSync(path.join(dir,'SOURCE.txt'),`Pedro Pathing ${VERSION} (BSD 3-Clause, https://github.com/Pedro-Pathing/PedroPathing) from Maven Central: com.pedropathing:core and com.pedropathing:revhub (classes.jar of the .aar). Used only to test exports locally.\n`);
    return jars();
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
// The cached jars, or null when tools/simulation/fetch-pedro.cjs has not been run.
const cached=()=>jars().every(f=>fs.existsSync(f))?jars():null;
module.exports={fetchPedro,cached,VERSION,dir};
if(require.main===module)fetchPedro().then(()=>{},e=>{console.error(e.message);process.exitCode=1;});
