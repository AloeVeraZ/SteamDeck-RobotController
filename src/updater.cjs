'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {pipeline}=require('node:stream/promises');
const {Readable,Transform}=require('node:stream');
const {execFile,spawn}=require('node:child_process');
const {promisify}=require('node:util');const run=promisify(execFile);
const LIMIT=700*1024*1024;
function repository(value){const s=String(value||'').trim().replace(/^https:\/\/github\.com\//,'').replace(/\.git$/,'').replace(/\/$/,'');if(!/^[\w-]+\/[\w.-]+$/.test(s))throw Error('Enter a GitHub repository as owner/repository.');return s;}
function compare(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;}
function assetName(version,platform,arch){const suffix=platform==='linux'&&arch==='x64'?'SteamDeck.tar.gz':platform==='win32'&&arch==='x64'?'Windows.zip':platform==='darwin'&&arch==='arm64'?'macOS-arm64.zip':null;if(!suffix)throw Error('Updates support Steam Deck x64, Windows x64, and Apple Silicon.');return `DeckDriverStation-${version}-${suffix}`;}
function selectRelease(releases,{version,channel,platform,arch}){
  const pattern=channel==='testing'?/^testing-v(\d+\.\d+\.\d+)$/:/^v(\d+\.\d+\.\d+)$/;
  const candidates=releases.filter(r=>!r.draft&&!!r.prerelease===(channel==='testing')&&pattern.test(r.tag_name)).map(r=>({...r,version:r.tag_name.match(pattern)[1]})).sort((a,b)=>compare(b.version,a.version));
  if(!candidates.length)return {status:'unpublished',message:`No ${channel} releases have been published yet.`};
  const r=candidates[0];if(compare(r.version,version)<=0)return {status:'current',latest:r.version,message:`You’re up to date. Latest ${channel} release: ${r.version}.`};
  const name=assetName(r.version,platform,arch),asset=r.assets?.find(a=>a.name===name&&a.state==='uploaded');
  if(!asset)throw Error(`Release ${r.version} has no ${name} download yet.`);
  return {status:'available',latest:r.version,tag:r.tag_name,asset,notes:String(r.body||'').slice(0,8000),message:`Version ${r.version} is available.`};
}
class Updater{
  constructor({directory,version,repo,channel='testing',platform=process.platform,arch=process.arch,fetcher=fetch,onProgress=()=>{}}){Object.assign(this,{directory,version,channel,platform,arch,fetcher,onProgress});this.file=path.join(directory,'update-settings.json');this.repo=repository(repo);try{this.repo=repository(JSON.parse(fs.readFileSync(this.file)).repository);}catch{}this.release=null;this.busy=false;}
  info(){return {version:this.version,repository:this.repo,channel:this.channel,platform:this.platform,arch:this.arch};}
  async response(url,max=120000){const r=await this.fetcher(url,{headers:{'User-Agent':'DeckDriverStation','Accept':url.includes('api.github.com')?'application/vnd.github+json':'application/octet-stream','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(max)});if(!r.ok){if(r.status===404)throw Error('Repository or release not found. It may be private or not published yet.');if(r.status===403||r.status===429)throw Error('GitHub rate limit or access restriction. Try again later.');throw Error(`GitHub returned HTTP ${r.status}.`);}return r;}
  async check(repo=this.repo){if(this.busy)throw Error('An update operation is already in progress.');this.busy=true;this.release=null;this.downloaded=null;try{this.repo=repository(repo);fs.mkdirSync(this.directory,{recursive:true});fs.writeFileSync(this.file,JSON.stringify({repository:this.repo}),{mode:0o600});const releases=[];for(let page=1;page<=5;page++){const r=await this.response(`https://api.github.com/repos/${this.repo}/releases?per_page=100&page=${page}`,20000);const part=await r.json();if(!Array.isArray(part))throw Error('Invalid GitHub release response.');releases.push(...part);if(part.length<100)break;}const result=selectRelease(releases,this);if(result.asset){this.validateUrl(result.asset.browser_download_url,result.tag);this.release=result;}return {...this.info(),...result,asset:result.asset?{name:result.asset.name,size:result.asset.size}:undefined};}finally{this.busy=false;}}
  validateUrl(url,tag){const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||!u.pathname.startsWith(`/${this.repo}/releases/download/${encodeURIComponent(tag)}/`))throw Error('The update download must belong to this GitHub repository and release.');return u.href;}
  async download(){if(this.busy)throw Error('An update operation is already in progress.');if(!this.release)throw Error('Check for updates first.');this.busy=true;try{
    const {asset,tag}=this.release;let hash=asset.digest?.match(/^sha256:([a-f0-9]{64})$/i)?.[1].toLowerCase();
    if(!hash){const url=this.validateUrl(asset.browser_download_url,tag)+'.sha256';const text=await(await this.response(url,20000)).text();const match=text.trim().match(/^([a-f0-9]{64})\s+\*?([^\r\n]+)$/i);if(!match||match[2]!==asset.name)throw Error('The release has no valid SHA-256 checksum.');hash=match[1].toLowerCase();}
    const folder=path.join(this.directory,'updates',randomUUID());fs.mkdirSync(folder,{recursive:true,mode:0o700});const file=path.join(folder,asset.name),partial=file+'.part';let bytes=0;const digest=createHash('sha256');
    try{const response=await this.response(this.validateUrl(asset.browser_download_url,tag),300000);await pipeline(Readable.fromWeb(response.body),new Transform({transform:(chunk,_enc,cb)=>{bytes+=chunk.length;if(bytes>LIMIT)return cb(Error('Update download exceeds the size limit.'));digest.update(chunk);this.onProgress({bytes,total:asset.size||0});cb(null,chunk);}}),fs.createWriteStream(partial,{mode:0o600,flags:'wx'}));if(asset.size&&bytes!==asset.size)throw Error('Update download was incomplete.');if(digest.digest('hex')!==hash)throw Error('Update checksum mismatch. The update was not installed.');fs.renameSync(partial,file);}catch(e){fs.rmSync(partial,{force:true});throw e;}
    this.downloaded={file,folder,version:this.release.latest};return {...this.downloaded,verified:true};
  }finally{this.busy=false;}}
}
function installRoot(appPath,executable,platform){
  if(platform==='darwin'){const suffix=path.join('Contents','Resources','app');if(!appPath.endsWith(suffix))return null;const root=appPath.slice(0,-suffix.length-1);return path.resolve(executable)===path.join(root,'Contents','MacOS','Electron')?root:null;}
  const root=path.dirname(appPath);return path.basename(appPath)==='app'&&path.resolve(path.dirname(executable))===path.join(root,'runtime')?root:null;
}
async function prepareInstall(download,{appPath,executable,platform=process.platform,pid=process.pid}){
  const destination=installRoot(appPath,executable,platform);if(!destination)throw Error('This is a development copy. Install the downloaded package first; in-app updates work in the installed app.');
  const stage=path.join(download.folder,'extracted');fs.mkdirSync(stage);
  if(platform==='win32')await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'update-extract.ps1'),download.file,stage],{windowsHide:true,timeout:180000,maxBuffer:1024*1024});
  else if(platform==='darwin')await run('/usr/bin/ditto',['-x','-k',download.file,stage],{timeout:180000});
  else {const {stdout}=await run('tar',['-tzf',download.file],{timeout:30000,maxBuffer:4*1024*1024});if(stdout.split('\n').some(s=>s.startsWith('/')||s.split('/').includes('..')))throw Error('Unsafe update archive path.');await run('tar',['-xzf',download.file,'-C',stage],{timeout:180000});}
  const kind=platform==='win32'?'Windows':platform==='darwin'?'macOS':'SteamDeck';const source=platform==='darwin'?path.join(stage,'Deck Driver Station.app'):path.join(stage,`DeckDriverStation-${download.version}-${kind}`);
  const meta=JSON.parse(fs.readFileSync(path.join(source,platform==='darwin'?'Contents/Resources/app/package.json':'app/package.json')));if(meta.version!==download.version||meta.name!=='deck-driver-station')throw Error('The extracted update is not the expected application version.');
  const bin=path.join(source,platform==='darwin'?'Contents/MacOS/Electron':platform==='win32'?'runtime/electron.exe':'runtime/electron');if(!fs.statSync(bin).isFile())throw Error('The update runtime is missing.');
  const plan={source,destination,pid,platform,stage:download.folder};const planPath=path.join(download.folder,'install-plan.json');fs.writeFileSync(planPath,JSON.stringify(plan),{mode:0o600});
  const script=path.join(download.folder,platform==='win32'?'install.ps1':'install.sh');fs.copyFileSync(path.join(__dirname,platform==='win32'?'update-install.ps1':'update-install.sh'),script);return {plan,planPath,script};
}
async function launchInstall(prepared){const {plan,script,planPath}=prepared;const logPath=path.join(plan.stage,'install.log');
  if(plan.platform==='win32'){
    // Start-Process creates an independent hidden console. PowerShell otherwise
    // exits without running the helper when its console-owning launcher quits.
    await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'update-launch.ps1'),script,planPath,logPath],{windowsHide:true,timeout:15000});return;
  }
  const log=fs.openSync(logPath,'a');const child=spawn('/bin/bash',[script,plan.source,plan.destination,String(plan.pid),plan.platform,plan.stage],{detached:true,stdio:['ignore',log,log]});fs.closeSync(log);child.unref();await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});}
module.exports={Updater,repository,selectRelease,compare,assetName,installRoot,prepareInstall,launchInstall};
