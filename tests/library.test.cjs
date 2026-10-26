'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const {Library,normalizeUrl}=require('../src/library.cjs');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-library-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return path.join(dir,'robots.json');}
test('saved robots default to one controller and remember an explicit second controller',t=>{
 const file=setup(t),lib=new Library(file),p=lib.upsert({url:'robot.local'});assert.equal(p.controllerCount,1);
 lib.upsert({...p,controllerCount:2});assert.equal(new Library(file).get(p.id).controllerCount,2);assert.equal(lib.upsert({id:p.id,url:p.url}).controllerCount,2);
 for(const count of [0,3,'bad'])assert.throws(()=>lib.upsert({...p,controllerCount:count}));
 const old=JSON.parse(fs.readFileSync(file));delete old.robots[0].controllerCount;fs.writeFileSync(file,JSON.stringify(old));assert.equal(new Library(file).get(p.id).controllerCount,1);
});
test('IP, hostname, port, path, and query normalize; non-web URLs and credentials are refused',()=>{
  assert.equal(normalizeUrl('192.168.4.1'),'http://192.168.4.1/');assert.equal(normalizeUrl('robot.local:8080/drive?mode=teleop'),'http://robot.local:8080/drive?mode=teleop');
  for(const s of ['file:///etc/passwd','javascript:alert(1)','http://user:secret@robot.local',''])assert.throws(()=>normalizeUrl(s));
});
test('a robot persists with network association, inferred title, and last-used address',t=>{
  const file=setup(t),lib=new Library(file);const p=lib.upsert({url:'robot.local',ssid:'Robot WiFi'},{opened:true,title:'My robot dashboard'});const copy=new Library(file);assert.equal(copy.get(p.id).name,'My robot dashboard');assert.equal(copy.get(p.id).ssid,'Robot WiFi');assert.equal(copy.data.lastId,p.id);assert.ok(copy.get(p.id).lastOpened>0);
});
test('two robots on different hotspots may share the same IP without colliding',t=>{
  const lib=new Library(setup(t));const a=lib.upsert({url:'192.168.4.1',ssid:'Robot A'}),b=lib.upsert({url:'192.168.4.1',ssid:'Robot B'});assert.notEqual(a.id,b.id);assert.equal(lib.list('Robot B')[0].id,b.id);lib.upsert({url:'192.168.4.1',ssid:'Robot A'});assert.equal(lib.list().length,2);
});
test('explicit names survive later page titles; names and addresses can be edited or removed',t=>{
  const lib=new Library(setup(t)),p=lib.upsert({name:'PushBot',url:'pushbot.local',ssid:'Pushbot'});lib.updateTitle(p.id,'Login');assert.equal(lib.get(p.id).name,'PushBot');lib.upsert({id:p.id,name:'Workshop bot',url:'192.168.1.99',ssid:'Home'});assert.equal(lib.get(p.id).url,'http://192.168.1.99/');lib.remove(p.id);assert.equal(lib.list().length,0);
});
test('passwords are not saved as robot data',t=>{
  const file=setup(t),lib=new Library(file);lib.upsert({name:'Robot',ssid:'Home',url:'robot.local',password:'do-not-store-this'});assert.ok(!fs.readFileSync(file,'utf8').includes('do-not-store-this'));
});
test('version-one custom profiles migrate into generic saved websites',t=>{
  const file=setup(t);fs.writeFileSync(file,JSON.stringify({addresses:{pushbot:['http://pushbot.local']},custom:[{name:'Custom',ssid:'Home',addresses:['robot.local:8080']}]}));const lib=new Library(file);assert.equal(lib.list().length,2);assert.ok(lib.list().some(r=>r.name==='Custom'));assert.equal(JSON.parse(fs.readFileSync(file)).version,2);
});
test('a typed name overrides the website title on every reopen; clearing it returns to the title',t=>{
  const lib=new Library(setup(t)),auto=lib.upsert({url:'robot.local',ssid:'Home'},{opened:true,title:'Dashboard v1'});
  assert.equal(lib.upsert({...auto},{opened:true,title:'Dashboard v2'}).name,'Dashboard v2');
  const named=lib.upsert({id:auto.id,url:'robot.local',name:'Big Zippy',ssid:'Home'});assert.equal(named.autoName,false);
  assert.equal(lib.upsert({...named},{opened:true,title:'Dashboard v3'}).name,'Big Zippy');lib.updateTitle(named.id,'Login');assert.equal(lib.get(named.id).name,'Big Zippy');
  assert.equal(lib.upsert({id:named.id,url:'robot.local',name:'',ssid:'Home'},{opened:true,title:'Dashboard v4'}).name,'Dashboard v4');
});
test('the robot type is remembered for its address and reset when the address changes',t=>{
  const lib=new Library(setup(t)),p=lib.upsert({url:'192.168.43.1',ssid:'1234-RC',kind:'ftc'});assert.equal(lib.upsert({id:p.id,url:'192.168.43.1',ssid:'1234-RC'}).kind,'ftc');
  assert.equal(lib.upsert({id:p.id,url:'192.168.4.1',ssid:'1234-RC'}).kind,undefined);assert.equal(lib.upsert({url:'robot.local',kind:'bogus'}).kind,undefined);
});
