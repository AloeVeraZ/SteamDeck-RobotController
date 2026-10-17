'use strict';
// Real Windows extraction, replacement, backup, and restart, using a harmless fixture executable.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process');
const {prepareInstall,launchInstall}=require('../src/updater.cjs');
(async()=>{
  if(process.platform!=='win32')return;
  const folder=path.resolve(__dirname,'../test-results/update-install-'+Date.now()),destination=path.join(folder,'installed'),download=path.join(folder,'download');fs.mkdirSync(download,{recursive:true});
  const packageName='DeckDriverStation-2.2.0-Windows',source=path.join(folder,'payload',packageName);
  for(const root of [destination,source]){fs.mkdirSync(path.join(root,'app'),{recursive:true});fs.mkdirSync(path.join(root,'runtime'));fs.writeFileSync(path.join(root,'app/package.json'),JSON.stringify({name:'deck-driver-station',version:root===destination?'2.1.0':'2.2.0'}));}
  fs.writeFileSync(path.join(folder,'robots.json'),'saved robots remain');
  const buildScript=path.join(folder,'fixture.ps1');fs.writeFileSync(buildScript,`param([string]$Output,[string]$Source,[string]$Archive)\nAdd-Type -TypeDefinition 'using System; using System.IO; public class Fixture { public static void Main() { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"started.txt"),"restarted"); } }' -OutputAssembly $Output -OutputType ConsoleApplication\nCompress-Archive -LiteralPath $Source -DestinationPath $Archive\n`);
  const archive=path.join(download,packageName+'.zip');execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',buildScript,path.join(source,'runtime/electron.exe'),source,archive],{windowsHide:true});fs.copyFileSync(path.join(source,'runtime/electron.exe'),path.join(destination,'runtime/electron.exe'));
  const prepared=await prepareInstall({folder:download,file:archive,version:'2.2.0'},{appPath:path.join(destination,'app'),executable:path.join(destination,'runtime/electron.exe')});
  const runner=path.join(folder,'runner.cjs');fs.writeFileSync(runner,`const fs=require('node:fs');const p=JSON.parse(process.argv[2]);p.plan.pid=process.pid;fs.writeFileSync(p.planPath,JSON.stringify(p.plan));require(process.argv[3]).launchInstall(p).then(()=>process.exit());`);
  execFileSync(process.execPath,[runner,JSON.stringify(prepared),path.resolve(__dirname,'../src/updater.cjs')],{windowsHide:true});
  const marker=path.join(destination,'runtime/started.txt');for(let i=0;i<240&&!fs.existsSync(marker);i++)await new Promise(r=>setTimeout(r,250));
  if(!fs.existsSync(marker))throw Error('Update restart failed: '+fs.readFileSync(path.join(download,'install.log'),'utf8'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(destination,'app/package.json'))).version,'2.2.0');assert.equal(JSON.parse(fs.readFileSync(path.join(download,'previous/app/package.json'))).version,'2.1.0');assert.equal(fs.readFileSync(path.join(folder,'robots.json'),'utf8'),'saved robots remain');console.log('PASS: real Windows update extraction, process wait, replacement, previous-version backup, restart, and saved-data preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
