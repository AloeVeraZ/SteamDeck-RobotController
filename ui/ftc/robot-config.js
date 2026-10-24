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
  // The configuration's devices and hubs. Robot configuration XML is plain: elements with attributes, no text.
  function parse(xml){
    if(typeof xml!=='string'||!/<Robot\b/.test(xml))throw Error('This is not an FTC robot configuration.');
    const devices=[],hubs=[],stack=[],body=xml.replace(/<!--[\s\S]*?-->/g,'').replace(/<\?[\s\S]*?\?>/g,'');
    for(const m of body.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g)){
      const [,close,tag,attrText,selfClose]=m;
      if(close){const at=stack.map(e=>e.tag).lastIndexOf(tag);if(at>=0)stack.length=at;continue;}
      const attrs={};for(const a of attrText.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[a[1]]=decode(a[2]??a[3]??'');
      const hub=[...stack].reverse().find(e=>HUBS.has(e.tag));
      if(HUBS.has(tag))hubs.push({name:attrs.name||tag,address:attrs.port!==undefined?Number(attrs.port):null,tag});
      else if(!CONTAINERS.has(tag)&&attrs.name)devices.push({name:attrs.name,tag,kind:kindOf(tag),hub:hub?.attrs.name||null,...(attrs.port!==undefined?{port:Number(attrs.port)}:{}),...(attrs.bus!==undefined?{bus:Number(attrs.bus)}:{})});
      if(!selfClose)stack.push({tag,attrs});
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
  return {parse,kindOf,check,explain,fits,tokens,KINDS};
});
