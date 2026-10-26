'use strict';
// Real Windows code-only update: App package download, rebuild with the installed runtime,
// helper swap, versioned shortcut icon, restart, and saved-data preservation (fixture runtime).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
(async()=>{
  if(process.platform!=='win32')return;
  const folder=path.resolve(__dirname,'../test-results/update-app-install-'+Date.now()),destination=path.join(folder,'installed'),download=path.join(folder,'download'),base='0123456789ab';fs.mkdirSync(download,{recursive:true});
  fs.mkdirSync(path.join(destination,'app','ui'),{recursive:true});fs.mkdirSync(path.join(destination,'runtime'));
  fs.writeFileSync(path.join(destination,'app/package.json'),JSON.stringify({name:'deck-driver-station',version:'2.2.0'}));fs.copyFileSync(path.join(__dirname,'../ui/icon.ico'),path.join(destination,'app/ui/icon.ico'));
  fs.writeFileSync(path.join(folder,'robots.json'),'saved robots remain');
  // Fixture runtime: records each start next to itself, like the real app restarting.
  const buildScript=path.join(folder,'fixture.ps1');fs.writeFileSync(buildScript,`param([string]$Output)\nAdd-Type -TypeDefinition 'using System; using System.IO; public class Fixture { public static void Main() { File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"started.txt"),"restarted\\n"); } }' -OutputAssembly $Output -OutputType ConsoleApplication\n`);
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',buildScript,path.join(destination,'runtime/electron.exe')],{windowsHide:true});
  fs.writeFileSync(path.join(destination,'runtime/resources.pak'),'runtime data that must survive');fs.writeFileSync(path.join(destination,'DeckDriverStation.exe'),'launcher');
  fs.mkdirSync(path.join(destination,'icons'));fs.copyFileSync(path.join(__dirname,'../ui/icon.ico'),path.join(destination,'icons/deck-2.2.0.ico'));
  // A desktop-style shortcut in a fixture folder is not touched: only real shell folders are scanned.
  const source=path.join(folder,'app-source');fs.mkdirSync(path.join(source,'app','ui'),{recursive:true});
  fs.writeFileSync(path.join(source,'app/package.json'),JSON.stringify({name:'deck-driver-station',version:'2.3.0'}));fs.copyFileSync(path.join(__dirname,'../ui/icon.ico'),path.join(source,'app/ui/icon.ico'));
  const archive=path.join(folder,`DeckDriverStation-2.3.0-App-${base}.tar.gz`);execFileSync(path.join(process.env.SystemRoot,'System32','tar.exe'),['-czf',archive,'-C',source,'app'],{windowsHide:true});
  const receipt=path.join(folder,'handoff.json'),runner=path.join(folder,'runner.cjs');
  fs.writeFileSync(runner,`const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');const p=JSON.parse(process.argv[2]),{Updater,prepareInstall,launchInstall}=require(process.argv[3]),payload=fs.readFileSync(p.archive),name=path.basename(p.archive);
const full={name:'DeckDriverStation-2.3.0-Windows.zip',state:'uploaded',size:158000000,browser_download_url:'https://github.com/owner/robots/releases/download/testing-v2.3.0/DeckDriverStation-2.3.0-Windows.zip'};
const small={name,state:'uploaded',size:payload.length,digest:'sha256:'+createHash('sha256').update(payload).digest('hex'),browser_download_url:'https://github.com/owner/robots/releases/download/testing-v2.3.0/'+name};
const updater=new Updater({directory:p.download,version:'2.2.0',repo:'owner/robots',channel:'testing',platform:'win32',arch:'x64',base:p.base,fetcher:async url=>{if(url.includes('api.github.com'))return new Response(JSON.stringify([{tag_name:'testing-v2.3.0',prerelease:true,assets:[full,small]}]));if(url.endsWith(full.name))throw Error('full package must not be downloaded');return new Response(payload);}});
(async()=>{const check=await updater.check();if(check.asset.kind!=='app'||check.asset.size!==payload.length)throw Error('expected the App package: '+JSON.stringify(check.asset));await updater.downloadAndInstall(async download=>{const prepared=await prepareInstall(download,{appPath:path.join(p.destination,'app'),executable:path.join(p.destination,'runtime/electron.exe')});fs.writeFileSync(p.receipt,JSON.stringify({stage:download.folder,size:fs.statSync(download.file).size}));await launchInstall(prepared);});process.exit();})().catch(e=>{console.error(e);process.exit(1);});`);
  execFileSync(process.execPath,[runner,JSON.stringify({download,archive,destination,receipt,base}),path.resolve(__dirname,'../src/updater.cjs')],{windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
  const {stage,size}=JSON.parse(fs.readFileSync(receipt));
  const marker=path.join(destination,'runtime/started.txt');for(let i=0;i<240&&!fs.existsSync(marker);i++)await new Promise(r=>setTimeout(r,250));
  if(!fs.existsSync(marker))throw Error('Update restart failed: '+fs.readFileSync(path.join(stage,'install.log'),'utf8'));
  assert.ok(size<1024*1024,'App download should be small, was '+size);
  assert.equal(JSON.parse(fs.readFileSync(path.join(destination,'app/package.json'))).version,'2.3.0');
  assert.equal(fs.readFileSync(path.join(destination,'runtime/resources.pak'),'utf8'),'runtime data that must survive');
  assert.equal(fs.readFileSync(path.join(destination,'DeckDriverStation.exe'),'utf8'),'launcher');
  assert.ok(fs.existsSync(path.join(destination,'icons','deck-2.3.0.ico')),'versioned shortcut icon missing');
  assert.ok(fs.existsSync(path.join(destination,'icons','deck-2.2.0.ico')),'previous icon path must keep working for cached and synced shortcuts');
  assert.equal(JSON.parse(fs.readFileSync(path.join(stage,'previous/app/package.json'))).version,'2.2.0');
  assert.equal(fs.readFileSync(path.join(folder,'robots.json'),'utf8'),'saved robots remain');
  console.log(`PASS: a ${Math.round(size/1024)} KB App update rebuilt the Windows install with its existing runtime, swapped it, added a versioned shortcut icon, restarted, and kept saved data.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
