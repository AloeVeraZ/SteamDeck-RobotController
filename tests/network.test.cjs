'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {Network,splitEscaped}=require('../src/network.cjs');const fs=require('node:fs');
test('NetworkManager escaped SSIDs containing colons and backslashes parse correctly',()=>{assert.deepEqual(splitEscaped('*:Robot\\: Deck:90:WPA2'),['*','Robot: Deck','90','WPA2']);assert.deepEqual(splitEscaped('x:Robot\\\\WiFi:y'),['x','Robot\\WiFi','y']);});
test('SteamOS status reads the active SSID rather than assuming the connection label',async()=>{
  const runner=async(_file,args)=>({stdout:args.includes('DEVICE,TYPE,STATE,CONNECTION')?'wlan0:wifi:connected:Friendly label':args.includes('GENERAL.CON-UUID')?'saved-id':'Robot: WiFi'});const n=new Network({platform:'linux',runner});assert.equal((await n.status()).ssid,'Robot: WiFi');
});
test('a saved SteamOS network opens without asking for a password again',async()=>{
  let connected=false;const calls=[];const runner=async(_f,args)=>{calls.push(args);const s=args.join(' ');if(s.includes('DEVICE,TYPE'))return {stdout:`wlan0:wifi:${connected?'connected':'disconnected'}:--`};if(s.includes('GENERAL.CON-UUID'))return {stdout:'id-1'};if(s.includes('UUID,TYPE,NAME'))return {stdout:'id-1:wifi:Custom label'};if(s.includes('802-11-wireless.ssid'))return {stdout:'Robot'};if(s.includes('connection up'))connected=true;return {stdout:''};};
  const n=new Network({platform:'linux',runner});assert.equal((await n.join('Robot')).ssid,'Robot');assert.ok(calls.some(a=>a.includes('up')));assert.ok(!calls.some(a=>a.includes('add')));
});
test('new network password uses a private short-lived file rather than process arguments',async()=>{
  let connected=false,secretPath;const calls=[];const runner=async(_f,args)=>{calls.push(args);const s=args.join(' ');if(s.includes('DEVICE,TYPE'))return {stdout:`wlan0:wifi:${connected?'connected':'disconnected'}:--`};if(s.includes('GENERAL.CON-UUID'))return {stdout:'id'};if(s.includes('UUID,TYPE,NAME'))return {stdout:''};if(s.includes('802-11-wireless.ssid'))return {stdout:'Robot'};if(s.includes('IN-USE,SSID'))return {stdout:':Robot:90:WPA2'};if(s.includes('passwd-file')){secretPath=args.at(-1);assert.equal(fs.readFileSync(secretPath,'utf8'),'802-11-wireless-security.psk:test-secret\n');connected=true;}return {stdout:''};};
  const n=new Network({platform:'linux',runner});await n.join('Robot','test-secret');assert.ok(secretPath);assert.equal(fs.existsSync(secretPath),false);assert.ok(!JSON.stringify(calls).includes('test-secret'));
});
test('new secure networks require a password before creating a connection',async()=>{
  const calls=[];const runner=async(_f,args)=>{calls.push(args);const s=args.join(' ');return {stdout:s.includes('DEVICE,TYPE')?'wlan0:wifi:disconnected:--':s.includes('IN-USE,SSID')?':Robot:90:WPA2':''};};const n=new Network({platform:'linux',runner});await assert.rejects(n.join('Robot'),e=>e.code==='NEEDS_PASSWORD');assert.ok(!calls.some(a=>a.includes('add')));
});
test('Windows scan lists SSIDs once and keeps strongest access point',async()=>{const n=new Network({platform:'win32',runner:async()=>({stdout:'SSID 1 : Robot\n    Signal : 95%\n    Authentication : WPA2-Personal\nSSID 2 : Robot\n    Signal : 40%\nSSID 3 : Home\n    Signal : 60%'})});assert.deepEqual((await n.scan()).map(r=>r.ssid),['Robot','Home']);});
test('Windows can create an open robot hotspot profile without a password',async()=>{let profile='',file;const n=new Network({platform:'win32',runner:async(_f,args)=>{if(args.includes('networks'))return {stdout:'SSID 1 : OpenRobot\n    Authentication : Open'};if(args.includes('add')){file=args.find(s=>s.startsWith('filename=')).slice(9);profile=fs.readFileSync(file,'utf8');}if(args.includes('interfaces'))return {stdout:'    SSID : OpenRobot'};return {stdout:'Success'};}});await n.joinWindows('OpenRobot','');assert.match(profile,/<authentication>open<\/authentication>/);assert.match(profile,/<encryption>none<\/encryption>/);assert.ok(!profile.includes('sharedKey'));assert.equal(fs.existsSync(file),false);});
test('Windows asks for a fresh Wi-Fi scan so networks other than the connected one appear',async()=>{
  let netsh=0,rescans=0;const lists=['SSID 1 : Home\n    Signal : 99%','SSID 1 : Home\n    Signal : 99%\nSSID 2 : 1234-RC\n    Signal : 70%\n    Authentication : WPA2-Personal'];
  const n=new Network({platform:'win32',sleep:async()=>{},runner:async(file,args)=>{if(file==='powershell.exe'){assert.ok(args.at(-1).endsWith('wifi-scan.ps1'));rescans++;return {stdout:'1'};}netsh++;return {stdout:lists[Math.min(netsh-1,1)]};}});
  assert.deepEqual((await n.scan()).map(r=>r.ssid),['Home','1234-RC']);assert.equal(rescans,1);
});
test('Windows location privacy blocks are explained instead of showing an empty list',async()=>{
  const n=new Network({platform:'win32',sleep:async()=>{},runner:async file=>({stdout:file==='powershell.exe'?'0':'Network shell commands need location permission to access WLAN information.'})});
  await assert.rejects(n.scan(),/Location/);
});
