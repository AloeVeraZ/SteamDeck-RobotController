'use strict';
// A Control Hub's robot configuration (the XML the FTC SDK saves under FIRST/ and sends a Driver Station on
// CMD_REQUEST_PARTICULAR_CONFIGURATION): every device's name, what it is, and its hub and port. Then the check Send to
// robot runs before uploading code: every name the export looks up must be on the robot as the right kind of device.
// Shared by the desktop app, the simulated Control Hub and the tests.
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckRobotConfig=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  // Device XML tags from the FTC SDK 12.0 annotations (@MotorType, @ServoType, @DeviceProperties). A tag ending in Motor or
  // Gearmotor is a motor too, so motor types added later still count.
  const MOTORS=new Set(['Motor','goBILDA5201SeriesMotor','goBILDA5202SeriesMotor','Matrix12vMotor','NeveRest20Gearmotor','NeveRest3.7v1Gearmotor','NeveRest40Gearmotor','NeveRest60Gearmotor',
    'RevRobotics20HDHexMotor','RevRobotics40HDHexMotor','RevRoboticsCoreHexMotor','RevRoboticsHDHexMotor','RevRoboticsUltraplanetaryHDHexMotor','StudicaMaverick','TetrixMotor']);
  const SERVOS=new Set(['Servo','ServoFullRange']),CRSERVOS=new Set(['ContinuousRotationServo','RevSPARKMini']);
  const IMUS=new Set(['ControlHubImuBHI260AP','LynxEmbeddedIMU','RevExternalImu','AdafruitBNO055IMU','AndyMarkIMU']);
  // Elements that hold devices rather than being one.
  const HUBS=new Set(['LynxModule','ServoHub']),CONTAINERS=new Set(['Robot','LynxUsbDevice','LynxModule','ServoHub','EthernetDevice']);
  function kindOf(tag){
    if(MOTORS.has(tag)||/(Motor|Gearmotor)$/.test(tag))return 'motor';if(SERVOS.has(tag))return 'servo';if(CRSERVOS.has(tag))return 'crservo';
    if(IMUS.has(tag))return 'imu';if(tag==='goBILDAPinpoint')return 'pinpoint';if(tag==='SparkFunOTOS')return 'otos';if(tag==='Webcam')return 'webcam';return 'other';
  }
  const KINDS={motor:'a motor',servo:'a servo',crservo:'a continuous servo',motorOrCr:'a motor or a continuous servo',imu:'an IMU',pinpoint:'a goBILDA Pinpoint',otos:'a SparkFun OTOS',webcam:'a webcam',other:'another kind of device'};
  const fits=(need,kind)=>need==='motorOrCr'?kind==='motor'||kind==='crservo':need===kind;
  const decode=s=>s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi,(m,e)=>({lt:'<',gt:'>',quot:'"',apos:"'",amp:'&'})[e.toLowerCase()]??String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10)));
  // Robot configuration XML is plain: elements with attributes, no text. Comments and the XML declaration are blanked
  // out, keeping every position, so a tag inside them is not read. Yields each element as it opens ({tag, attrs, start,
  // end, selfClose, parents}) and as it closes ({close: the element, start}).
  function* elements(xml){
    const body=xml.replace(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g,m=>' '.repeat(m.length)),stack=[];
    for(const m of body.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g)){
      const [text,close,tag,attrText,selfClose]=m,start=m.index;
      if(close){const at=stack.map(e=>e.tag).lastIndexOf(tag);if(at>=0){yield {close:stack[at],start};stack.length=at;}continue;}
      const attrs={};for(const a of attrText.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[a[1]]=decode(a[2]??a[3]??'');
      const e={tag,attrs,start,end:start+text.length,selfClose:!!selfClose,parents:[...stack]};yield e;if(!selfClose)stack.push(e);
    }
  }
  const within=(e,tags)=>[...e.parents].reverse().find(p=>tags.has(p.tag));
  const PORTAL=new Set(['LynxUsbDevice']);
  // The configuration's devices and hubs. A hub is found by its portal (the USB device the robot reaches it through:
  // "(embedded)" for a Control Hub's own board) and its address; a device on one carries both as module.
  function parse(xml){
    if(typeof xml!=='string'||!/<Robot\b/.test(xml))throw Error('This is not an FTC robot configuration.');
    const devices=[],hubs=[];
    for(const e of elements(xml)){if(e.close)continue;const a=e.attrs,hub=within(e,HUBS),portal=within(e,PORTAL);
      if(HUBS.has(e.tag))hubs.push({name:a.name||e.tag,address:a.port!==undefined?Number(a.port):null,tag:e.tag,portal:portal?.attrs.serialNumber??'',parent:!!portal&&Number(portal.attrs.parentModuleAddress)===Number(a.port)});
      else if(!CONTAINERS.has(e.tag)&&a.name)devices.push({name:a.name,tag:e.tag,kind:kindOf(e.tag),hub:hub?.attrs.name||null,...(a.port!==undefined?{port:Number(a.port)}:{}),...(a.bus!==undefined?{bus:Number(a.bus)}:{}),
        ...(hub?.tag==='LynxModule'&&hub.attrs.port!==undefined?{module:{portal:portal?.attrs.serialNumber??'',address:Number(hub.attrs.port)}}:{})});
    }
    return {devices,hubs};
  }
  // Name words, so leftFront, left_front_drive, frontLeftMotor and LF all read as front + left.
  const ABBREVIATIONS={lf:['left','front'],fl:['front','left'],rf:['right','front'],fr:['front','right'],lb:['left','back'],bl:['back','left'],rb:['right','back'],br:['back','right'],lr:['left','back'],rl:['back','left'],rr:['right','back']};
  const SAME={rear:'back',flywheel:'shooter',launcher:'shooter',outtake:'shooter',collector:'intake',roller:'intake',feeder:'indexer',transfer:'indexer',pusher:'indexer',kicker:'indexer',gate:'indexer',turntable:'turret',odo:'pinpoint',otos:'otos',imu:'imu'};
  const FILLER=new Set(['motor','drive','wheel','servo','m','the','dc','cr','ex','device']);
  function tokens(name){
    const words=String(name||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().split(/[^a-z0-9]+|(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/).filter(Boolean);
    return [...new Set(words.flatMap(w=>ABBREVIATIONS[w]||[SAME[w]||w]).filter(w=>!FILLER.has(w)))].sort();
  }
  const likeness=(a,b)=>{if(a===b)return 3;if(a.toLowerCase()===b.toLowerCase())return 2;const x=tokens(a),y=tokens(b);return x.length&&x.length===y.length&&x.every((w,i)=>w===y[i])?1:0;};
  // needs: [{name, need: motor|servo|crservo|motorOrCr|imu|pinpoint|otos, label, ...}] from the export. Each gets a status:
  //   ok      the robot has that name, as the right kind of device;
  //   kind    the robot has the name, as another kind of device;
  //   missing the robot has no device with that name.
  // candidates: the robot's devices that would fit, best match first (a name the export already uses elsewhere last);
  // suggestion: the one to use when a name that plainly means the same device is there (leftFront for front_left).
  function check(needs,config){
    const devices=config?.devices||[],named=new Set(needs.map(n=>n.name)),used=new Set(needs.filter(n=>devices.some(d=>d.name===n.name&&fits(n.need,d.kind))).map(n=>n.name));
    const taken=new Set();
    const rows=needs.map(n=>{const found=devices.find(d=>d.name===n.name),status=!found?'missing':fits(n.need,found.kind)?'ok':'kind';
      const candidates=status==='ok'?[]:devices.filter(d=>fits(n.need,d.kind)).map(d=>({name:d.name,tag:d.kind,score:likeness(n.name,d.name)-(used.has(d.name)?10:0)})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
      // One robot device is suggested for one name only, in the order the export lists them.
      const best=candidates[0],suggestion=best&&best.score>0&&!taken.has(best.name)&&!(candidates[1]?.score===best.score)?best.name:null;if(suggestion)taken.add(suggestion);
      const fix=status==='kind'?FIXES[`${n.setting?.field}:${found.kind}`]:null;
      return {...n,status,...(fix?{fix}:{}),...(found?{found:{name:found.name,kind:found.kind,tag:found.tag,hub:found.hub,port:found.port}}:{}),candidates:candidates.map(c=>c.name),...(suggestion?{suggestion}:{})};});
    // Two different devices in Deck cannot share a name on the robot.
    const seen=new Map();for(const r of rows){const other=seen.get(r.name);if(other&&other.need!==r.need)r.duplicate=other.label;else seen.set(r.name,r);}
    const unused=devices.filter(d=>['motor','servo','crservo'].includes(d.kind)&&!named.has(d.name)).map(d=>({name:d.name,kind:d.kind}));
    return {rows,ok:rows.every(r=>r.status==='ok'&&!r.duplicate),unused};
  }
  // A device the robot has under that name, but as another kind, is often a Deck setting to change.
  const FIXES={'turretMotor:servo':'In Mechanisms, set the turret to turn on a servo.','indexer:servo':'In Mechanisms, set the feeder to a servo pusher or a servo gate.',
    'indexer:motor':'In Mechanisms, set the feeder to a motor or a continuous servo.','indexer:crservo':'In Mechanisms, set the feeder to a motor or a continuous servo.'};
  // A plain sentence for one row of the check.
  function explain(row){
    if(row.duplicate)return `"${row.name}" is also the name Deck uses for ${row.duplicate.toLowerCase()}. Each device needs its own name.`;
    if(row.status==='ok')return `"${row.name}" is ${KINDS[row.found.kind]}${row.found.hub?` on ${row.found.hub}`:''}${row.found.port!==undefined?`, port ${row.found.port}`:''}.`;
    if(row.status==='kind')return `"${row.name}" is ${KINDS[row.found.kind]} on the robot; the code needs ${KINDS[row.need]}.${row.fix?' '+row.fix:''}`;
    return `The robot has no "${row.name}".${row.suggestion?` Its "${row.suggestion}" looks like the same device.`:row.candidates.length?` It has ${row.candidates.length===1?'one':row.candidates.length} ${KINDS[row.need].replace(/^an? /,'')}${row.candidates.length===1?'':'s'} to choose from.`:` It has no ${KINDS[row.need].replace(/^an? /,'')} free.`}`;
  }
  // ---- writing a configuration -------------------------------------------------------------------------------------
  // Devices Deck adds get a port on a hub (a Control Hub or Expansion Hub: motor ports 0-3, servo ports 0-5, I2C buses
  // 0-3), are written as the FTC SDK writes them, and go into a configuration saved under a new name. Nothing already
  // in a configuration is changed.
  const PORTS={motor:4,servo:6,i2c:4};
  // Motor types for a new motor. The type sets the SDK's encoder resolution and its default velocity PIDF.
  const MOTOR_TYPES={goBILDA5202SeriesMotor:'goBILDA Yellow Jacket',RevRoboticsUltraplanetaryHDHexMotor:'REV UltraPlanetary HD Hex',RevRobotics20HDHexMotor:'REV HD Hex 20:1',
    RevRobotics40HDHexMotor:'REV HD Hex 40:1',RevRoboticsCoreHexMotor:'REV Core Hex',Motor:'Another motor'};
  // A hub's own IMU as CMD_DISCOVER_LYNX_MODULES reports it (LynxModuleImuType), and its configuration tag.
  const IMU_TAGS={BHI260:'ControlHubImuBHI260AP',BNO055:'LynxEmbeddedIMU'};
  // Tags on a servo port (FTC SDK 12.0 @ServoType), and on digital or analog ports (@DigitalIoDeviceType,
  // @AnalogSensorType), which take no motor, servo or I2C port.
  const SERVO_PORT=new Set([...SERVOS,...CRSERVOS,'RevBlinkinLedDriver']),OTHER_PORT=new Set(['DigitalDevice','RevTouchSensor','Led','AnalogInput','OpticalDistanceSensor','ModernRoboticsAnalogTouchSensor']);
  const DRIVE=new Set(['frontLeft','frontRight','backLeft','backRight','left','right']);
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);
  const moduleKey=m=>`${m.portal??''}#${m.address}`;
  const portFamily=device=>device==='servo'||device==='crservo'?'servo':device==='imu'||device==='pinpoint'||device==='otos'?'i2c':'motor';
  // A port on a hub: motor 0-3, servo 0-5, or the first device on I2C bus 0-3.
  const portKey=(module,family,port,bus=0)=>`${moduleKey(module)}:${family}:${family==='i2c'?bus+'.':''}${port}`;
  // The ports a configured device takes. A device type Deck does not know (a team's own) may be on a motor or a servo port.
  function portsTaken(d){
    if(!d.module||d.port===undefined)return [];if(d.bus!==undefined)return [portKey(d.module,'i2c',d.port,d.bus)];
    if(d.kind==='motor')return [portKey(d.module,'motor',d.port)];if(SERVO_PORT.has(d.tag))return [portKey(d.module,'servo',d.port)];
    return OTHER_PORT.has(d.tag)?[]:[portKey(d.module,'motor',d.port),portKey(d.module,'servo',d.port)];
  }
  // The devices a configuration lacks: the check's rows with no device of that name, each as Deck's settings describe it.
  const missingDevices=rows=>rows.filter(r=>r.status==='missing'&&!r.duplicate).map(r=>({name:r.name,label:r.label,device:r.device||(r.need==='motorOrCr'?'motor':r.need),setting:r.setting}));
  const tagFor=add=>add.device==='servo'?'Servo':add.device==='crservo'?'ContinuousRotationServo':add.device==='pinpoint'?'goBILDAPinpoint':add.device==='otos'?'SparkFunOTOS':add.motorType||'goBILDA5202SeriesMotor';
  // The hubs in the order devices go on them: the parent (the Control Hub, or the Expansion Hub a phone talks to) first.
  const hubOrder=modules=>[...modules].sort((a,b)=>Number(!!b.parent)-Number(!!a.parent)||a.address-b.address);
  // Ports for the devices to add. modules: the robot's hubs [{portal, address, name, parent, imu}]; devices: what its
  // configuration already has. adds: [{name, label, device: motor|crservo|servo|imu|pinpoint|otos, setting, motorType}].
  // Drive motors go on the parent hub first and other motors on another hub first, as teams usually wire them; servos
  // and sensors go on the parent hub first, sensors from I2C bus 1 (bus 0 has the hub's IMU). The IMU is the parent
  // hub's own. A name listed twice (an odometry pod read through its drive motor's port) gets one port.
  function planPorts(adds,{modules,devices=[]}){
    const used=new Set(devices.flatMap(portsTaken)),assignments=[],problems=[],seen=new Set(),hubs=hubOrder(modules),parent=hubs[0];
    if(!parent)return {assignments,problems:['The robot configuration has no Control Hub or Expansion Hub.']};
    for(const add of adds){if(seen.has(add.name))continue;seen.add(add.name);const family=portFamily(add.device);
      if(add.device==='imu'){const tag=IMU_TAGS[parent.imu],key=portKey(parent,'i2c',0,0);
        if(!tag)problems.push(`Deck could not tell which IMU ${parent.name} has. Add it as "${add.name}" in Configure Robot on the Driver Station.`);
        else if(used.has(key))problems.push(`I2C bus 0 of ${parent.name}, where its own IMU goes, is taken. Name the device there "${add.name}" in Configure Robot.`);
        else{used.add(key);assignments.push({...add,tag,module:parent,port:0,bus:0});}continue;}
      const order=family==='motor'&&!DRIVE.has(add.setting?.robot)?[...hubs.slice(1),parent]:hubs;let placed=null;
      for(const hub of order){for(let p=family==='i2c'?1:0;p<PORTS[family]&&!placed;p++){const at=family==='i2c'?{module:hub,port:0,bus:p}:{module:hub,port:p},key=portKey(hub,family,at.port,at.bus);if(!used.has(key)){used.add(key);placed=at;}}if(placed)break;}
      if(!placed){problems.push(`No ${family==='i2c'?'I2C bus':family+' port'} is free for "${add.name}" (${add.label}).${family==='motor'?' Add an Expansion Hub, or run a roller on a continuous servo.':family==='servo'?' Add an Expansion Hub.':''}`);continue;}
      assignments.push({...add,tag:tagFor(add),...placed});
    }
    return {assignments,problems};
  }
  const keyOf=a=>portKey(a.module,portFamily(a.device),a.port,a.bus);
  const portLabel=a=>`${a.module.name} ${a.bus!==undefined?`I2C bus ${a.bus}`:`${portFamily(a.device)} port ${a.port}`}`;
  // Every port one planned device could move to, and what is on each: taken (a configured device) or swap (another
  // planned device, which would move to this one's port). An IMU stays on its hub's I2C bus 0.
  function portChoices(assignments,index,{modules,devices=[]}){
    const a=assignments[index];if(!a||a.device==='imu')return [];const family=portFamily(a.device),taken=new Map();
    for(const d of devices)for(const key of portsTaken(d))taken.set(key,d.name);
    return hubOrder(modules).flatMap(module=>Array.from({length:family==='i2c'?PORTS.i2c-1:PORTS[family]},(_,i)=>family==='i2c'?{module,port:0,bus:i+1}:{module,port:i})).map(at=>{
      const key=portKey(at.module,family,at.port,at.bus),other=assignments.find((b,j)=>j!==index&&keyOf(b)===key);
      return {...at,key,label:portLabel({...at,device:a.device}),...(taken.has(key)?{taken:taken.get(key)}:{}),...(other?{swap:other.name}:{})};});
  }
  // Moves one planned device to another port; a planned device already there takes this one's port.
  function movePort(assignments,index,key,context){
    const choice=portChoices(assignments,index,context).find(c=>c.key===key);if(!choice)throw Error('That port is not on this robot.');if(choice.taken)throw Error(`${choice.label} has "${choice.taken}".`);
    const out=assignments.map(a=>({...a})),from=out[index],other=out.findIndex((b,j)=>j!==index&&keyOf(b)===key);
    if(other>=0)Object.assign(out[other],{module:from.module,port:from.port,bus:from.bus});Object.assign(from,{module:choice.module,port:choice.port,bus:choice.bus});return out;
  }
  const withType=(a,motorType)=>({...a,motorType,tag:tagFor({...a,motorType})});
  const deviceXml=a=>`<${a.tag} name="${escape(a.name)}" port="${a.port}"${a.bus!==undefined?` bus="${a.bus}"`:''} />`;
  // The robot takes a configuration as CMD_SAVE_CONFIGURATION "<file>;<xml>" and splits it at every ";", so a
  // configuration with one anywhere (in a name, or in &amp; and the like) cannot be sent.
  function sendable(xml){if(xml.includes(';'))throw Error('A name in this configuration has ; & < > " or \' in it, which cannot be sent to the robot. Rename it in Configure Robot first.');return xml;}
  // The robot's own configuration with the planned devices added inside their hubs. Everything else is kept as it was.
  function addDevices(xml,assignments){
    parse(xml);const hubs=[],edits=[];
    for(const e of elements(xml)){if(e.close){const h=hubs.find(h=>h.element===e.close);if(h)h.close=e.start;}
      else if(e.tag==='LynxModule')hubs.push({element:e,key:moduleKey({portal:within(e,PORTAL)?.attrs.serialNumber??'',address:Number(e.attrs.port)})});}
    for(const key of [...new Set(assignments.map(a=>moduleKey(a.module)))]){
      const hub=hubs.find(h=>h.key===key),mine=assignments.filter(a=>moduleKey(a.module)===key).sort(written);if(!hub)throw Error(`The configuration has no ${mine[0].module.name}.`);
      const e=hub.element,indent=/^[ \t]*/.exec(xml.slice(xml.lastIndexOf('\n',e.start)+1))[0],lines=mine.map(a=>indent+'    '+deviceXml(a)).join('\n');
      if(e.selfClose){edits.push({start:e.start,end:e.end,text:xml.slice(e.start,e.end).replace(/\s*\/>$/,'>')+'\n'+lines+'\n'+indent+'</LynxModule>'});continue;}
      if(hub.close===undefined)throw Error('The configuration is not complete.');
      const line=xml.lastIndexOf('\n',hub.close-1)+1;
      edits.push(/^[ \t]*$/.test(xml.slice(line,hub.close))&&line>e.end?{start:line,end:line,text:lines+'\n'}:{start:hub.close,end:hub.close,text:'\n'+lines+'\n'+indent});
    }
    let out=xml;for(const edit of edits.sort((a,b)=>b.start-a.start))out=out.slice(0,edit.start)+edit.text+out.slice(edit.end);
    const after=parse(out).devices;for(const a of assignments)if(!after.some(d=>d.name===a.name&&d.tag===a.tag))throw Error(`"${a.name}" could not be added.`);
    return sendable(out);
  }
  // A configuration for a robot that has none, from a scan of its hubs: every hub found, named as Configure Robot names
  // them, with the planned devices.
  const moduleName=(portal,m)=>portal.serial==='(embedded)'&&m.parent?'Control Hub':`Expansion Hub ${m.address}`;
  // The SDK writes a hub's motors, then its servos, then its I2C devices, each in port order.
  const FAMILY_ORDER={motor:0,servo:1,i2c:2},written=(a,b)=>FAMILY_ORDER[portFamily(a.device)]-FAMILY_ORDER[portFamily(b.device)]||(a.bus??0)-(b.bus??0)||a.port-b.port;
  function newConfiguration(portals,assignments){
    const lines=["<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>",'<Robot type="FirstInspires-FTC">'];let usb=0;
    for(const portal of portals){if(!portal.modules.length)continue;const parent=portal.modules.find(m=>m.parent)||portal.modules[0];
      lines.push(`    <LynxUsbDevice name="${portal.serial==='(embedded)'?'Control Hub Portal':`Expansion Hub Portal ${++usb}`}" serialNumber="${escape(portal.serial)}" parentModuleAddress="${parent.address}">`);
      for(const m of [...portal.modules].sort((a,b)=>Number(a.parent)-Number(b.parent)||a.address-b.address)){
        const mine=assignments.filter(a=>moduleKey(a.module)===moduleKey({portal:portal.serial,address:m.address})).sort(written),open=`        <LynxModule name="${escape(moduleName(portal,m))}" port="${m.address}"`;
        lines.push(...mine.length?[open+'>',...mine.map(a=>'            '+deviceXml(a)),'        </LynxModule>']:[open+' />']);}
      lines.push('    </LynxUsbDevice>');}
    lines.push('</Robot>','');const xml=lines.join('\n'),after=parse(xml).devices;
    for(const a of assignments)if(!after.some(d=>d.name===a.name))throw Error(`${a.module.name} was not found on the robot.`);
    return sendable(xml);
  }
  // The hubs a scan found (lynxModules answers). Only the Control Hub's own board is the parent when the robot has one.
  const modulesFromScan=portals=>{const hub=portals.some(p=>p.serial==='(embedded)');return portals.flatMap(p=>p.modules.map(m=>({portal:p.serial,address:m.address,name:moduleName(p,m),parent:m.parent&&(!hub||p.serial==='(embedded)'),imu:m.imu})));};
  // A configuration's hubs, each with its IMU from a scan; missing: the scan did not find it on the robot.
  const modulesOf=(config,portals)=>(config.hubs||[]).filter(h=>h.tag==='LynxModule'&&Number.isFinite(h.address)).map(h=>{
    const found=portals?.find(p=>p.serial===h.portal)?.modules.find(m=>m.address===h.address);
    return {portal:h.portal,address:h.address,name:h.name,parent:h.parent,...(found?{imu:found.imu}:portals?{missing:true}:{})};});
  // A configuration name the robot does not have yet ("competition Deck", then "competition Deck 2", ...). Names keep to
  // letters, digits, spaces, - and _ (the name is the robot's file name, and a ; ends it).
  function configurationName(base,existing=[]){
    const clean=String(base||'').replace(/[^\w -]+/g,' ').replace(/\s+/g,' ').replace(/^[\s-]+/,'').slice(0,36).trim()||'Deck';let name=clean,n=2;
    while(existing.some(e=>e.toLowerCase()===name.toLowerCase()))name=`${clean} ${n++}`;return name;
  }
  const validName=name=>typeof name==='string'&&/^[A-Za-z0-9_][\w -]{0,39}$/.test(name)&&name.trim()===name;
  // The robot's answers to CMD_SCAN (ScannedDevices: {map: [{key: serial, value: UsbDeviceType}]}) and
  // CMD_DISCOVER_LYNX_MODULES (LynxModuleMetaList: {serialNumber, modules: [{moduleAddress, isParent, imuType}]}).
  const lynxSerials=scan=>{const v=JSON.parse(scan);return (Array.isArray(v?.map)?v.map:[]).filter(e=>e?.value==='LYNX_USB_DEVICE'&&typeof e.key==='string').map(e=>e.key);};
  function lynxModules(list){const v=JSON.parse(list);return {serial:String(v?.serialNumber??''),modules:(Array.isArray(v?.modules)?v.modules:[]).filter(m=>Number.isInteger(m?.moduleAddress)).map(m=>({address:m.moduleAddress,parent:!!m.isParent,imu:typeof m.imuType==='string'?m.imuType:'UNKNOWN'}))};}
  return {parse,kindOf,check,explain,fits,tokens,KINDS,MOTOR_TYPES,IMU_TAGS,missingDevices,planPorts,portChoices,movePort,withType,portLabel,portKeyOf:keyOf,addDevices,newConfiguration,modulesOf,modulesFromScan,configurationName,validName,lynxSerials,lynxModules,deviceXml};
});
