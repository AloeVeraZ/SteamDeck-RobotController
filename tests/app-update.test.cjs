'use strict';
// Code-only (App) updates: package choice by runtime base, and rebuilding a complete copy
// from the downloaded app/ plus this install's own runtime, on the platform running the test.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {selectRelease,assetName,prepareInstall}=require('../src/updater.cjs');
const base='0123456789ab',options={version:'2.1.0',channel:'testing',platform:'win32',arch:'x64',base};
const asset=(name,size)=>({name,size,state:'uploaded',browser_download_url:`https://github.com/owner/robots/releases/download/testing-v2.2.0/${name}`});
const release=assets=>({tag_name:'testing-v2.2.0',prerelease:true,draft:false,assets});
const full=asset(assetName('2.2.0','win32','x64'),158000000),small=asset(`DeckDriverStation-2.2.0-App-${base}.tar.gz`,420000),other=asset('DeckDriverStation-2.2.0-App-ffffffffffff.tar.gz',420000);

test('a matching runtime base downloads only the App package',()=>{
  const result=selectRelease([release([full,small,other])],options);
  assert.equal(result.kind,'app');assert.equal(result.asset.name,small.name);assert.equal(result.asset.size,420000);assert.equal(result.fullSize,158000000);
});
test('a different, missing or malformed base falls back to the full package',()=>{
  for(const b of ['ffffffffffff'.replace(/f/g,'e'),'',undefined,'../../evil','0123456789ab.tar.gz']){
    const result=selectRelease([release([full,small,other])],{...options,base:b});assert.equal(result.kind,'full',String(b));assert.equal(result.asset.name,full.name);
  }
});
test('an App package alone works only for its own base',()=>{
  assert.equal(selectRelease([release([small])],options).kind,'app');
  assert.throws(()=>selectRelease([release([small])],{...options,base:'eeeeeeeeeeee'}),/no .* download/);
});

const platform=process.platform,tar=platform==='win32'?path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'):'tar';
function installFixture(root){
  if(platform==='darwin'){
    const bundle=path.join(root,'Deck Driver Station.app'),contents=path.join(bundle,'Contents');
    fs.mkdirSync(path.join(contents,'MacOS'),{recursive:true});fs.mkdirSync(path.join(contents,'Resources','app'),{recursive:true});
    fs.writeFileSync(path.join(contents,'MacOS','Electron'),'runtime');fs.chmodSync(path.join(contents,'MacOS','Electron'),0o755);
    fs.writeFileSync(path.join(contents,'Info.plist'),'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>2.1.0</string><key>CFBundleVersion</key><string>2.1.0</string></dict></plist>\n');
    fs.writeFileSync(path.join(contents,'Resources','app','package.json'),JSON.stringify({name:'deck-driver-station',version:'2.1.0'}));
    return {appPath:path.join(contents,'Resources','app'),executable:path.join(contents,'MacOS','Electron'),destination:bundle};
  }
  const destination=path.join(root,'installed'),bin=platform==='win32'?'electron.exe':'electron';
  fs.mkdirSync(path.join(destination,'app'),{recursive:true});fs.mkdirSync(path.join(destination,'runtime','locales'),{recursive:true});
  fs.writeFileSync(path.join(destination,'runtime',bin),'runtime');fs.writeFileSync(path.join(destination,'runtime','locales','en-US.pak'),'locale');
  if(platform!=='win32'){fs.chmodSync(path.join(destination,'runtime',bin),0o755);fs.writeFileSync(path.join(destination,'launch.sh'),'#!/usr/bin/env bash\n');fs.chmodSync(path.join(destination,'launch.sh'),0o755);}
  else fs.writeFileSync(path.join(destination,'DeckDriverStation.exe'),'launcher');
  fs.writeFileSync(path.join(destination,'app','package.json'),JSON.stringify({name:'deck-driver-station',version:'2.1.0'}));
  return {appPath:path.join(destination,'app'),executable:path.join(destination,'runtime',bin),destination};
}
function appArchive(root,version){
  const source=path.join(root,'app-source');fs.mkdirSync(path.join(source,'app','ui'),{recursive:true});
  fs.writeFileSync(path.join(source,'app','package.json'),JSON.stringify({name:'deck-driver-station',version}));fs.writeFileSync(path.join(source,'app','ui','icon.icns'),'new icon');fs.writeFileSync(path.join(source,'app','build.json'),JSON.stringify({base}));
  const file=path.join(root,'download',`DeckDriverStation-${version}-App-${base}.tar.gz`);fs.mkdirSync(path.dirname(file),{recursive:true});
  execFileSync(tar,['-czf',file,'-C',source,'app'],{windowsHide:true});return file;
}

test('an App update is rebuilt into a complete copy that keeps this install\'s runtime',{skip:!['win32','linux','darwin'].includes(platform)},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'deck-app-update-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const install=installFixture(root),file=appArchive(root,'2.2.0');
  const prepared=await prepareInstall({file,folder:path.dirname(file),version:'2.2.0',kind:'app'},{appPath:install.appPath,executable:install.executable,platform,pid:123});
  const source=prepared.plan.source;assert.ok(source.startsWith(path.join(path.dirname(file),'extracted')));assert.equal(prepared.plan.destination,install.destination);
  if(platform==='darwin'){
    assert.equal(JSON.parse(fs.readFileSync(path.join(source,'Contents','Resources','app','package.json'))).version,'2.2.0');
    assert.equal(fs.readFileSync(path.join(source,'Contents','MacOS','Electron'),'utf8'),'runtime');
    assert.equal(fs.readFileSync(path.join(source,'Contents','Resources','deck.icns'),'utf8'),'new icon');
    assert.match(fs.readFileSync(path.join(source,'Contents','Info.plist'),'utf8'),/<string>2\.2\.0<\/string>/);
  }else{
    assert.equal(JSON.parse(fs.readFileSync(path.join(source,'app','package.json'))).version,'2.2.0');
    assert.equal(fs.readFileSync(path.join(source,'runtime','locales','en-US.pak'),'utf8'),'locale');
    if(platform==='win32')assert.equal(fs.readFileSync(path.join(source,'DeckDriverStation.exe'),'utf8'),'launcher');
    else assert.ok(fs.statSync(path.join(source,'launch.sh')).mode&0o111);
  }
  // The running install is only read, never changed, until the helper swaps copies.
  const installed=platform==='darwin'?path.join(install.appPath,'package.json'):path.join(install.destination,'app','package.json');
  assert.equal(JSON.parse(fs.readFileSync(installed)).version,'2.1.0');
});

test('App archives with paths outside app/ are rejected before extraction',{skip:!['win32','linux','darwin'].includes(platform)},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'deck-app-update-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const install=installFixture(root),source=path.join(root,'evil');fs.mkdirSync(path.join(source,'runtime'),{recursive:true});fs.writeFileSync(path.join(source,'runtime','electron'),'replaced');
  const file=path.join(root,'download','evil.tar.gz');fs.mkdirSync(path.dirname(file),{recursive:true});execFileSync(tar,['-czf',file,'-C',source,'runtime'],{windowsHide:true});
  await assert.rejects(prepareInstall({file,folder:path.dirname(file),version:'2.2.0',kind:'app'},{appPath:install.appPath,executable:install.executable,platform,pid:123}),/Unsafe update archive path/);
});
