'use strict';
// Configure Robot's device pictures and the pinout: every type has a picture and facts, wiring notes ride in the
// configuration, the pinout lays out every device without overlaps, and product photos are fetched only from listings.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../ui/ftc/robot-config.js'),A=require('../ui/ftc/device-art.js'),P=require('../ui/ftc/pinout.js'),{DevicePhotos,productImage}=require('../src/device-photos.cjs');
const {SENSOR_CONFIG_XML,CONFIG_XML}=require('../tools/ftc-sim.cjs');
const examples=path.join(__dirname,'../examples/robot-configurations'),read=name=>fs.readFileSync(path.join(examples,name),'utf8');
const sheet=(xml,extra={})=>{const {devices,hubs}=C.parse(xml);return P.build({name:'test',hubs,devices:devices.filter(d=>d.module).map(d=>({...d,family:C.familyOfTag(d.tag)})),other:devices.filter(d=>!d.module),notes:C.notesOf(xml),java:d=>C.javaFor(d).type,...extra});};

test('every device type Configure Robot offers has a picture, a maker and a description',()=>{
  const tags=[...Object.keys(C.MOTOR_TYPES),...Object.values(C.EDIT_TYPES).flat().map(([t])=>t)];
  for(const tag of tags){const i=A.info(tag);assert.ok(A.DEVICES[tag],`${tag} has an entry`);assert.ok(i.name&&i.what&&i.maker,`${tag} has facts`);assert.match(A.svg(tag),/^<svg[^>]+viewBox="0 0 160 120"/);}
  for(const tag of Object.keys(A.PHOTOS))assert.ok(tag.startsWith('#')||A.DEVICES[tag],`${tag} photo is for a known device`);
  for(const [tag,[page]] of Object.entries(A.PHOTOS))assert.match(page,/^https:\/\//,`${tag} listing is https`);
  assert.equal(A.photoOf('goBILDA5202SeriesMotor').site,'gobilda.com');assert.equal(A.photoOf('Motor'),null);
});

test('goBILDA and UltraPlanetary gearing: output speed and encoder counts',()=>{
  const g=A.gearOf('goBILDA5202SeriesMotor','13.7:1');assert.equal(g.rpm,435);assert.equal(g.cpr,384.5);assert.equal(A.gearOf('goBILDA5202SeriesMotor','19.2:1').cpr,537.7);assert.equal(A.gearOf('goBILDA5202SeriesMotor','188:1').cpr,5281.1);
  assert.equal(A.gearOf('goBILDA5202SeriesMotor','19.2:1').rpm,312);
  const u=A.gearOf('RevRoboticsUltraplanetaryHDHexMotor','4x5');assert.equal(u.ratio,'20:1');assert.equal(u.rpm,317);
  assert.equal(A.gearOf('RevRoboticsCoreHexMotor','13.7:1'),null);
});

test('wiring notes ride in the configuration as a comment the SDK skips',()=>{
  const base=C.rebuild(CONFIG_XML,C.parse(CONFIG_XML).devices.filter(d=>d.module));
  const xml=C.withNotes(base,{front_left:{gear:'13.7:1',encoder:false},'back-right':{gear:'19.2:1'},junk:{x:1}});
  assert.match(xml,/<Robot type="FirstInspires-FTC">\n    <!-- Deck wiring: \{/);
  const comment=/<!--([\s\S]*?)-->/.exec(xml)[1];assert.ok(!comment.includes('--')&&!comment.includes(';'),'no -- or ; inside the comment');
  assert.deepEqual(C.notesOf(xml),{front_left:{gear:'13.7:1',encoder:false},'back-right':{gear:'19.2:1'}});
  assert.deepEqual(C.parse(xml).devices,C.parse(base).devices,'devices read the same');
  // Saving again replaces the comment; no notes removes it.
  assert.equal((C.withNotes(xml,{a:{encoder:false}}).match(/Deck wiring/g)||[]).length,1);assert.equal(C.withNotes(xml,{}),base);
  assert.deepEqual(C.notesOf('<Robot><!-- Deck wiring: not json --></Robot>'),{});
});

test('a rebuilt configuration lists each hub’s devices in the SDK’s order, LEDs with their port family',()=>{
  const xml=read('aloetest max.xml'),tags=[...xml.matchAll(/<(\w+) name="[^"]+" port="\d+"( bus)?/g)].filter(m=>!/^(LynxModule)$/.test(m[1])).map(m=>C.familyOfTag(m[1])+(m[2]?'':'')),order=['motor','servo','analog','digital','i2c'];
  for(let i=1;i<tags.length;i++)assert.ok(order.indexOf(tags[i-1])<=order.indexOf(tags[i]),`${tags[i-1]} before ${tags[i]}`);
  assert.equal(C.familyOfTag('QWIIC_LED_STICK'),'i2c');assert.equal(C.familyOfTag('Led'),'digital');assert.equal(C.familyOfTag('RevBlinkinLedDriver'),'servo');
  const {devices}=C.parse(xml),again=C.withNotes(C.rebuild(xml,devices.filter(d=>d.module)),C.notesOf(xml));assert.equal(again,xml,'rebuilding gives the same file');
});

test('aloetest: four Yellow Jackets at 435 RPM with no encoder cables and the Control Hub IMU',()=>{
  const xml=read('aloetest.xml'),{devices}=C.parse(xml),notes=C.notesOf(xml);
  assert.deepEqual(devices.map(d=>[d.name,d.tag,d.port,d.bus]),[['frontRight','goBILDA5202SeriesMotor',0,undefined],['backLeft','goBILDA5202SeriesMotor',1,undefined],['frontLeft','goBILDA5202SeriesMotor',2,undefined],['backRight','goBILDA5202SeriesMotor',3,undefined],['imu','ControlHubImuBHI260AP',0,0]]);
  for(const n of ['frontLeft','frontRight','backLeft','backRight'])assert.deepEqual(notes[n],{gear:'13.7:1',encoder:false});
  const s=sheet(xml);assert.deepEqual(s.warnings,[]);assert.equal(s.rows.length,5,'no encoder rows');
  assert.equal((s.svg.match(/No encoder cable/g)||[]).length,4);assert.equal((s.svg.match(/435 RPM · 13\.7:1/g)||[]).length,4);assert.match(s.svg,/Built in · no cable/);
});

test('the pinout places every hub and card without overlaps',()=>{
  for(const xml of [read('aloetest.xml'),read('aloetest max.xml'),SENSOR_CONFIG_XML,CONFIG_XML]){const s=sheet(xml),b=s.boxes;
    for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++){const p=b[i],q=b[j],apart=p.x+p.w<=q.x||q.x+q.w<=p.x||p.y+p.h<=q.y||q.y+q.h<=p.y;assert.ok(apart,`overlap: ${JSON.stringify(p)} and ${JSON.stringify(q)}`);}
    for(const x of b)assert.ok(x.x>=0&&x.y>=0&&x.x+x.w<=s.width&&x.y+x.h<=s.height,'inside the sheet');}
  const max=sheet(read('aloetest max.xml'));assert.equal(max.rows.length,28+4,'every device, and the four encoder cables');assert.deepEqual(max.warnings,[]);
  assert.match(max.svg,/I2C BUS 3 · 3/);assert.match(sheet(SENSOR_CONFIG_XML).svg,/RS485 to Expansion Hub 2/);
});

test('the pinout warns about I2C address clashes and a touch sensor on an even channel',()=>{
  const xml=`<Robot type="FirstInspires-FTC"><LynxUsbDevice name="Control Hub Portal" serialNumber="(embedded)" parentModuleAddress="173"><LynxModule name="Control Hub" port="173">
    <RevTouchSensor name="touch" port="2" /><RevColorSensorV3 name="left" port="0" bus="1" /><RevColorSensorV3 name="right" port="1" bus="1" /><REV_VL53L0X_RANGE_SENSOR name="dist" port="0" bus="2" /><AdafruitColorSensor name="ada" port="1" bus="2" />
    </LynxModule></LynxUsbDevice></Robot>`;
  const w=sheet(xml).warnings.join('\n');assert.match(w,/“left” and “right” both use address 0x52/);assert.match(w,/“dist” and “ada” both use address 0x29/);assert.match(w,/odd channel/);
});

test('photos in the pinout replace the drawings',()=>{
  const s=sheet(read('aloetest.xml'),{photos:{goBILDA5202SeriesMotor:'data:image/jpeg;base64,AAAA','#ControlHub':'data:image/jpeg;base64,BBBB'}});
  assert.equal((s.svg.match(/href="data:image\/jpeg;base64,AAAA"/g)||[]).length,4);assert.match(s.svg,/href="data:image\/jpeg;base64,BBBB"/);
});

test('a product photo is the listing’s og:image, fetched once and kept',async t=>{
  assert.equal(productImage('<meta content="/img/a.png" property="og:image">','https://www.revrobotics.com/rev-41-1300/'),'https://www.revrobotics.com/img/a.png');
  assert.equal(productImage('<meta property="og:image" content="http://cdn.example.com/x.jpg?a=1&amp;b=2" />','https://a.example/'),'https://cdn.example.com/x.jpg?a=1&b=2');
  assert.equal(productImage('<meta name="twitter:image" content="https://a.example/t.webp">','https://a.example/'),'https://a.example/t.webp');
  assert.equal(productImage('<title>none</title>','https://a.example/'),null);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-photos-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const asked=[],png=Buffer.from('89504e470d0a1a0a','hex');
  const fake=async url=>{asked.push(url);if(url===A.PHOTOS.RevRoboticsCoreHexMotor[0])return new Response('<meta property="og:image" content="https://cdn.example/core.png">',{headers:{'content-type':'text/html'}});
    if(url==='https://cdn.example/core.png')return new Response(png,{headers:{'content-type':'image/png'}});if(url.includes('41-1301'))return new Response('<meta property="og:image" content="https://cdn.example/page.html">');return new Response('<html></html>',{headers:{'content-type':'text/html'}});};
  const photos=new DevicePhotos(dir,{fetch:fake});
  assert.equal(await photos.photo('RevRoboticsCoreHexMotor'),'data:image/png;base64,'+png.toString('base64'));
  assert.equal(await photos.photo('RevRoboticsCoreHexMotor'),'data:image/png;base64,'+png.toString('base64'));assert.equal(asked.length,2,'kept after the first fetch');
  assert.equal(await photos.photo('https://evil.example/x'),null);assert.equal(await photos.photo('Motor'),null,'only listed devices');
  assert.equal(await photos.photo('RevRobotics40HDHexMotor'),null,'a page that is not a photo is refused');assert.ok(!fs.existsSync(path.join(dir,'RevRobotics40HDHexMotor.html')));
  const n=asked.length;assert.equal(await photos.photo('RevRobotics40HDHexMotor'),null);assert.equal(asked.length,n,'a failure waits before trying again');
});

test('wiring notes kept on the computer are checked like the ones in a file',()=>{
  assert.deepEqual(C.cleanNotes({a:{gear:'13.7:1',encoder:false,x:1},b:{gear:5},c:null,d:'x'}),{a:{gear:'13.7:1',encoder:false}});
  assert.deepEqual(C.cleanNotes(null),{});assert.deepEqual(C.cleanNotes([1]),{});
});
