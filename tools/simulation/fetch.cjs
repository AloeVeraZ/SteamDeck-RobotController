'use strict';
// Fetches every pinned input of the simulator build into .cache, verifying each one, so a clean
// checkout (or a CI runner) can run `node tools/simulation/build.cjs --public`:
//   - DSIM and Pedro Pathing, cloned at their pinned commits;
//   - the npm packages in tools/simulation/deps-package.json, from its lockfile;
//   - Eclipse Temurin JDK 21.0.12.1+1 for this machine (javac, jlink), and a reduced Java runtime
//     (jlink) for each requested target platform, built from that platform's own JDK modules;
//   - Gson 2.11.0.
// Every download is checked against the SHA-256 pinned here before use.
// Usage: node tools/simulation/fetch.cjs [--targets win32-x64,linux-x64,darwin-arm64]
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'../..'),cache=path.join(root,'.cache'),runtime=path.join(cache,'simulation-runtime');
const UPSTREAM={dsim:{url:'https://github.com/genius0412/dsim.git',commit:'0df84143a52dde4c7c196fb21b94264a13da91b6'},pedro:{url:'https://github.com/Pedro-Pathing/PedroPathing.git',commit:'cf4be31449a8963af3a7ce7951de09fd163bbb3d'}};
const TEMURIN='https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/';
const JDKS={
  'win32-x64':{file:'OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip',sha256:'f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e'},
  'linux-x64':{file:'OpenJDK21U-jdk_x64_linux_hotspot_21.0.12.1_1.tar.gz',sha256:'ce79869e1307ed8ee1e2baa86a412b1eb5b75d10a01006d788a6f968bcfaee94'},
  'darwin-arm64':{file:'OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.12.1_1.tar.gz',sha256:'3623232f33a9c3baadf304480b2535f9a3cba8a58d42ecbb438ba267315d9998'}
};
const GSON={url:'https://repo.maven.apache.org/maven2/com/google/code/gson/gson/2.11.0/gson-2.11.0.jar',sha256:'57928d6e5a6edeb2abd3770a8f95ba44dce45f3b23b7a9dc2b309c581552a78b'};
// The modules Pedro, the bridge and in-process compilation of team code need.
const MODULES='java.base,java.compiler,java.logging,jdk.compiler,jdk.zipfs';
const host=`${process.platform}-${process.arch}`;
const exe=name=>process.platform==='win32'?name+'.exe':name;
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function download(url,file,expected){
  if(fs.existsSync(file)&&sha256(file)===expected)return Promise.resolve(file);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  return new Promise((resolve,reject)=>{
    const get=(u,redirects=0)=>https.get(u,{headers:{'User-Agent':'deck-driver-station-build'}},res=>{
      if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location&&redirects<8){res.resume();return get(new URL(res.headers.location,u).href,redirects+1);}
      if(res.statusCode!==200){res.resume();return reject(Error(`${u}: HTTP ${res.statusCode}`));}
      const out=fs.createWriteStream(file+'.part');res.pipe(out);out.on('finish',()=>out.close(()=>{
        const actual=sha256(file+'.part');if(actual!==expected){fs.rmSync(file+'.part',{force:true});return reject(Error(`${path.basename(file)}: SHA-256 ${actual} does not match the pinned ${expected}.`));}
        fs.renameSync(file+'.part',file);resolve(file);}));out.on('error',reject);
    }).on('error',reject);
    get(url);
  });
}
// tar handles .tar.gz everywhere; Windows' bsdtar also reads .zip, and elsewhere unzip does.
function extract(archive,dir){
  fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  if(archive.endsWith('.zip')&&process.platform!=='win32')execFileSync('unzip',['-q',archive,'-d',dir],{stdio:'inherit'});
  else execFileSync('tar',['-xf',archive,'-C',dir],{stdio:'inherit'});
  const [top]=fs.readdirSync(dir);const home=path.join(dir,top);
  return fs.existsSync(path.join(home,'Contents/Home'))?path.join(home,'Contents/Home'):home;
}
function upstream(){
  for(const [name,{url,commit}] of Object.entries(UPSTREAM)){
    const dir=path.join(cache,'upstream',name);
    if(!fs.existsSync(path.join(dir,'.git')))execFileSync('git',['clone','--quiet',url,dir],{stdio:'inherit'});
    execFileSync('git',['-C',dir,'fetch','--quiet','origin',commit],{stdio:'inherit'});execFileSync('git',['-C',dir,'checkout','--quiet','--detach',commit],{stdio:'inherit'});
    console.log(`${name}: ${commit.slice(0,12)}`);
  }
}
function npm(){
  const deps=path.join(cache,'simulation-deps');fs.mkdirSync(deps,{recursive:true});
  fs.copyFileSync(path.join(__dirname,'deps-package.json'),path.join(deps,'package.json'));fs.copyFileSync(path.join(__dirname,'deps-package-lock.json'),path.join(deps,'package-lock.json'));
  execFileSync(process.platform==='win32'?'npm.cmd':'npm',['ci','--no-audit','--no-fund'],{cwd:deps,stdio:'inherit',shell:process.platform==='win32'});
  console.log('npm packages: installed from the lockfile');
}
async function java(targets){
  if(!JDKS[host])throw Error(`No pinned JDK for this machine (${host}).`);
  const hostArchive=await download(TEMURIN+JDKS[host].file,path.join(runtime,'downloads',JDKS[host].file),JDKS[host].sha256);
  const hostJdk=extract(hostArchive,path.join(runtime,'jdk'));console.log(`Host JDK: ${path.relative(root,hostJdk)}`);
  for(const target of targets){
    if(!JDKS[target])throw Error(`Unknown target ${target}; use ${Object.keys(JDKS).join(', ')}.`);
    const archive=await download(TEMURIN+JDKS[target].file,path.join(runtime,'downloads',JDKS[target].file),JDKS[target].sha256);
    const modules=target===host?path.join(hostJdk,'jmods'):path.join(extract(archive,path.join(runtime,'target-jdk',target)),'jmods');
    const out=path.join(runtime,'java-'+target);fs.rmSync(out,{recursive:true,force:true});
    execFileSync(path.join(hostJdk,'bin',exe('jlink')),['--module-path',modules,'--add-modules',MODULES,'--strip-debug','--no-header-files','--no-man-pages','--output',out],{stdio:'inherit'});
    console.log(`Java runtime for ${target}: ${path.relative(root,out)}`);
  }
  fs.rmSync(path.join(runtime,'target-jdk'),{recursive:true,force:true});
}
async function main(){
  // The build machine's own runtime is always made too: build.cjs runs the simulator with it.
  const arg=process.argv.indexOf('--targets'),targets=[...new Set([host,...(arg>0?process.argv[arg+1].split(','):[])])];
  upstream();npm();await java(targets);
  await download(GSON.url,path.join(runtime,'gson.jar'),GSON.sha256);console.log('Gson 2.11.0: verified');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
