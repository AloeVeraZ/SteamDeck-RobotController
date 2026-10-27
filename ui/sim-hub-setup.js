(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DeckHubSetup=api;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // One-button setup from the Control Hub: the robot's active configuration (read over USB) is matched to everything Setup
  // wires (drive motors, the IMU and position sensor, each mechanism's motors and servos, their sensors), by name and by
  // kind, and each match takes the robot's name, hub and port, and its motor type when that names one model. The robot's
  // position sensor (a Pinpoint or an OTOS) sets the localization, and its Expansion Hub is turned on at its address.
  // plan() only decides; apply() returns the changed project. Shared by Setup and the tests.
  const g=name=>globalThis[name]||(typeof require==='function'?require({DeckHardware:'./sim-hardware.js',DeckWiring:'./sim-wiring.js',DeckRobotConfig:'./ftc/robot-config.js',DeckSimConfig:'./sim-config.js',DeckMechanisms:'./sim-mechanisms.js',DeckKinematics:'./sim-kinematics.js'}[name]):null);
  const DIRS=new Set(['front','back','left','right','center','centre']),DRIVE_WORDS=/^(steer|turn|swerve|azimuth|angle|rot\w*|dt|chassis|base|mecanum|tank|module|mod|\d)$/;
  // Words that say what a sensor is, not what it is on ("liftHome" is the lift's limit switch).
  const SENSOR_WORDS=new Set(['sensor','home','limit','switch','touch','button','color','colour','distance','dist','range','tof','pot','potentiometer','encoder','enc','abs','absolute','analog','magnet','magnetic','piece','position','pos','feedback','beam','break','v3']);
  const ACT_KINDS={motor:['motor'],servo:['servo'],crservo:['crservo'],motorOrCr:['motor','crservo'],linear:['servo']};
  // What a role may run on, as RobotConfig kinds: a roller on a motor or a continuous servo, a feeder also on a servo...
  const ROLE_KINDS={roller:['motor','crservo'],feeder:['motor','crservo','servo'],turret:['motor','servo','crservo'],steer:['crservo','servo','motor']};
  const SENSOR_KINDS=new Set(['touch','digital','analog','color','distance']);
  const words=name=>g('DeckRobotConfig').tokens(name);
  const dirsOf=t=>t.filter(w=>DIRS.has(w)).map(w=>w==='centre'?'center':w).sort().join(' ');
  // Which hub of Setup ('control', 'expansion' or 'servoHub') a configured device is on, from the configuration's hubs.
  function hubsOf(config){
    const lynx=(config.hubs||[]).filter(h=>h.tag==='LynxModule'&&Number.isFinite(h.address)),servo=(config.hubs||[]).filter(h=>h.tag==='ServoHub'&&Number.isFinite(h.address));
    const control=lynx.find(h=>h.parent)||lynx.find(h=>h.address===173)||lynx[0]||null,others=lynx.filter(h=>h!==control).sort((a,b)=>a.address-b.address);
    return {control,expansion:others[0]||null,extra:others.slice(1),servoHub:servo[0]||null};}
  function placeOf(dev,hubs){const m=dev.module;if(!m)return null;const same=h=>h&&h.address===m.address&&(h.portal||'')===(m.portal||'');
    const hub=m.servoHub?(same(hubs.servoHub)?'servoHub':null):same(hubs.control)?'control':same(hubs.expansion)?'expansion':null;if(!hub)return null;
    return dev.bus!==undefined?{hub,bus:dev.bus}:Number.isInteger(dev.port)?{hub,port:dev.port}:null;}
  const kindsFor=row=>ROLE_KINDS[row.role]||ACT_KINDS[row.need]||[row.need];
  // How well a robot device fits one of Setup's rows: 0 is no match. A drive motor matches on its direction words alone
  // (frontLeft, FL, left_front_drive); anything else on the words its name shares with the row's name and label, never
  // across sides (leftLift is not rightLift).
  function score(row,dev){
    if(!kindsFor(row).includes(dev.kind)&&!(row.role==='sensor'&&g('DeckRobotConfig').fits(row.need,dev.kind)))return 0;
    if(dev.name===row.name)return 100;if(dev.name.toLowerCase()===row.name.toLowerCase())return 95;
    const dt=words(dev.name),rt=[...new Set([...words(row.name),...(row.role==='drive'||row.role==='steer'?[]:words(row.label))])];
    if(row.role==='drive'||row.role==='steer'){const want=dirsOf(words(row.key.slice(6))),have=dirsOf(dt);if(!want||want!==have)return 0;
      const steerish=dt.some(w=>/^(steer|turn|swerve|azimuth|angle|rot)/.test(w));if(steerish!==(row.role==='steer'))return 0;
      // Any other word says it is something else (leftLift, frontIntake), unless it is one teams put on drive motors.
      return dt.some(w=>!DIRS.has(w)&&!DRIVE_WORDS.test(w))?0:80;}
    if(['imu','pinpoint','otos'].includes(row.role))return 70;
    const a=dirsOf(dt),b=dirsOf(rt);if(a&&b&&a!==b)return 0;
    const base=row.role==='sensor'?dt.filter(w=>!SENSOR_WORDS.has(w)):dt,shared=base.filter(w=>rt.includes(w)).length;if(!shared)return 0;
    return 20+Math.round(40*shared/new Set([...base,...rt]).size);}
  // A sensor the robot has that Setup does not: put it on the device its name is about, as the model its type says.
  function sensorFor(dev,rows){
    const H=g('DeckHardware'),dt=words(dev.name).filter(w=>!SENSOR_WORDS.has(w)),n=dev.name.toLowerCase();
    const models=H.SENSORS.filter(m=>m.xmlType===dev.tag||dev.kind==='digital'&&m.xmlType==='DigitalDevice'||dev.kind==='analog'&&m.xmlType==='AnalogInput');
    let best=null;
    for(const row of rows){if(['sensor','pod','imu','pinpoint','otos'].includes(row.role))continue;const allowed=H.ROLES[row.role]?.sensors||{};
      const rt=[...new Set([...words(row.name),...words(row.label)])],shared=dt.filter(w=>rt.includes(w)).length;if(!shared)continue;
      const a=dirsOf(dt),b=dirsOf(rt);if(a&&b&&a!==b)continue;
      const fit=models.filter(m=>Object.hasOwn(allowed,m.kind)).sort((x,y)=>hint(y,n)-hint(x,n));if(!fit.length)continue;
      const s=shared/new Set([...dt,...rt]).size;if(!best||s>best.s)best={s,row,model:fit[0],use:allowed[fit[0].kind]};}
    return best;}
  const hint=(m,n)=>(/pot/.test(n)&&m.kind==='potentiometer'||/axon/.test(n)&&m.kind==='axonFeedback'||/magnet/.test(n)&&m.kind==='magnetic'||/(limit|switch)/.test(n)&&m.kind==='limit'||/v2/.test(n)&&/v2/.test(m.id)||/(abs|bore)/.test(n)&&m.kind==='analogAbs'?1:0);
  // The model a configured motor or servo type names, when it names only one (goBILDA5202SeriesMotor is every Yellow
  // Jacket ratio, so that keeps Setup's model).
  function modelOf(row,dev){const H=g('DeckHardware'),now=H.MODELS[row.model];if(now&&now.xmlType===dev.tag)return null;
    const list=H.ACTUATORS.filter(m=>m.xmlType===dev.tag&&(H.ROLES[row.role]?.kinds||[]).includes(m.kind));return list.length===1?list[0].id:null;}
  const LOCALIZATION={pinpoint:'fused',otos:'optical'};
  // project: Setup's project; config: {devices, hubs} (RobotConfig.parse of the active configuration).
  // only: 'chassis' matches the drivetrain and the IMU alone (a preset robot, whose mechanisms are its own).
  function plan(project,config,{only}={}){
    const W=g('DeckWiring'),devices=(config?.devices||[]).filter(d=>d.module||d.kind==='imu'),hubs=hubsOf(config||{}),chassis=only==='chassis',out={localization:null,assign:[],sensors:[],missing:[],unused:[],notes:[],hubs:{}};
    // The position sensor first: it decides which rows Setup has.
    let p=project;const loc=['pinpoint','otos'].map(k=>devices.some(d=>d.kind===k)?LOCALIZATION[k]:null).find(Boolean);
    if(!chassis&&loc&&project.controller==='ftc'&&project.sensors?.localization!==loc){out.localization=loc;p={...project,sensors:{...project.sensors,localization:loc}};}
    const rows=W.state(p).rows.filter(r=>r.role!=='pod'&&(!chassis||W.stepOf(r.key)==='robot'&&!['pinpoint','otos'].includes(r.role)));
    out.hubs.expansion=hubs.expansion?{address:hubs.expansion.address}:false;if(hubs.servoHub)out.hubs.servoHub={address:hubs.servoHub.address};
    if(hubs.extra.length)out.notes.push(`Setup wires one Expansion Hub; ${hubs.extra.map(h=>h.name).join(', ')} ${hubs.extra.length===1?'is':'are'} left out.`);
    // Every fitting pair, best first; each row and each device is used once.
    const pairs=[];for(const row of rows)for(const dev of devices){const s=score(row,dev);if(s>0)pairs.push({row,dev,s});}
    pairs.sort((a,b)=>b.s-a.s||a.row.key.localeCompare(b.row.key)||a.dev.name.localeCompare(b.dev.name));
    const doneRow=new Set(),doneDev=new Set();
    for(const {row,dev,s} of pairs){if(doneRow.has(row.key)||doneDev.has(dev))continue;doneRow.add(row.key);doneDev.add(dev);
      const at=row.role==='imu'?null:placeOf(dev,hubs),model=row.role==='sensor'?null:modelOf(row,dev),kind=kindsFor(row).includes(dev.kind)&&!(ACT_KINDS[row.need]||[row.need]).includes(dev.kind)?dev.kind:null;
      out.assign.push({key:row.key,label:row.label,name:dev.name,was:row.name,family:row.family,tag:dev.tag,exact:s>=95,...(at||{}),...(model?{model}:{}),...(kind?{kind}:{}),...(row.role==='sensor'?{sensor:row.id}:{})});}
    for(const row of rows)if(!doneRow.has(row.key)&&row.role!=='imu')out.missing.push({key:row.key,label:row.label,name:row.name});
    // Chassis only: the robot's mechanism devices are none of Setup's business, so only a leftover drive-like motor is listed.
    for(const dev of devices){if(doneDev.has(dev)||!['motor','servo','crservo',...SENSOR_KINDS].includes(dev.kind)||chassis&&!(dev.kind==='motor'&&dirsOf(words(dev.name))))continue;
      const fit=!chassis&&SENSOR_KINDS.has(dev.kind)?sensorFor(dev,rows):null,at=placeOf(dev,hubs);
      if(fit&&at){doneDev.add(dev);out.sensors.push({name:dev.name,model:fit.model.id,for:fit.row.key,forLabel:fit.row.label,use:fit.use,...at});continue;}
      out.unused.push({name:dev.name,kind:dev.kind,where:`${dev.hub||''}${dev.bus!==undefined?` I2C bus ${dev.bus}`:dev.port!==undefined?` port ${dev.port}`:''}`.trim()});}
    return out;}
  // The project with the plan in it: names where Setup keeps them (robot.devices, a mechanism's field, a moving part's
  // actuator), ports and models in robot.wiring, new sensors, hubs and the localization.
  function apply(project,result){
    const H=g('DeckHardware'),W=g('DeckWiring'),C=g('DeckSimConfig'),MECH=g('DeckMechanisms'),K=g('DeckKinematics'),p=structuredClone(project);
    if(result.localization)p.sensors={...p.sensors,localization:result.localization};
    let w=p.robot.wiring;w=W.setHub(w,'expansion',!!result.hubs.expansion,result.hubs.expansion?.address);if(result.hubs.servoHub)w=W.setHub(w,'servoHub',true,result.hubs.servoHub.address);
    const devices={...(p.robot.devices||{})};
    for(const a of result.assign){const k=H.parseKey(a.key);if(!k)continue;
      if(a.sensor){w=H.sanitizeWiring({...H.wiringOf({wiring:w}),sensors:H.wiringOf({wiring:w}).sensors.map(s=>s.id===a.sensor?{...s,name:a.name,...(a.hub?{hub:a.hub,...(a.bus!==undefined?{bus:a.bus}:{port:a.port})}:{})}:s)});continue;}
      if(k.robot)devices[k.robot]={...(devices[k.robot]||{}),name:a.name};
      else if(k.list){const part=p.mechanisms[k.list]?.[k.index];if(part){part[k.field]=a.name;
        if(a.kind&&k.list==='intakes'&&/^motor2?$/.test(k.field))part.device=a.kind==='crservo'?'crservo':'motor';
        if(a.kind&&k.field==='indexer')part.indexerKind={motor:'motor',crservo:'crservo',servo:'pusher'}[a.kind];
        if(a.kind&&k.field==='turretMotor')p.mechanisms.turret.kind=a.kind==='servo'?'servo':'motor';}}
      else if(k.kin){const second=/-2$/.test(k.kin),act=p.kinematics.actuators.find(x=>x.id===k.kin||second&&x.id+'-2'===k.kin);if(act){if(second&&act.id!==k.kin)act.device2=a.name;else act.device=a.name;}}
      if(a.hub&&a.family)w=W.setPort(w,a.key,a.family==='i2c'?`${a.hub}:${a.bus}`:`${a.hub}:${a.port}`,a.family);
      if(a.model)w=W.setModel(w,a.key,a.model);}
    if(result.sensors.length){const cur=H.wiringOf({wiring:w}),ids=new Set(cur.sensors.map(s=>s.id)),add=[];
      for(const s of result.sensors){let id=s.name.replace(/[^\w-]/g,'').slice(0,28)||'sensor';if(!/^[A-Za-z]/.test(id))id='s'+id;for(let n=2;ids.has(id);n++)id=`${id.slice(0,26)}${n}`;ids.add(id);
        add.push({id,model:s.model,for:s.for,use:s.use,name:s.name,hub:s.hub,...(s.bus!==undefined?{bus:s.bus}:{port:s.port})});}
      w=H.sanitizeWiring({...cur,sensors:[...cur.sensors,...add]});}
    p.robot=C.robot({...p.robot,devices,wiring:w},p.controller);p.mechanisms=MECH.sanitize(p.mechanisms);p.kinematics=K.sanitize(p.kinematics);
    return p;}
  // One sentence for the status line, and one line a match for the list under it.
  function summary(result){const n=result.assign.length+result.sensors.length;
    return n?`Set up from the Control Hub: ${n} device${n===1?'':'s'} matched${result.missing.length?`, ${result.missing.length} Setup device${result.missing.length===1?'':'s'} not on the robot`:''}${result.unused.length?`, ${result.unused.length} on the robot Setup has nothing for`:''}.`:'Nothing on the Control Hub matches what this setup has. Name its devices as the robot does (frontLeft, lift, claw…), or add the mechanisms first.';}
  function lines(result){const where=a=>a.hub?` · ${a.hub==='control'?'Control Hub':a.hub==='expansion'?'Expansion Hub':'Servo Hub'} ${a.bus!==undefined?`I2C bus ${a.bus}`:`port ${a.port}`}`:'';
    return [...result.assign.map(a=>({level:a.exact?'ok':'guess',text:`${a.label} → “${a.name}”${where(a)}${a.was!==a.name?` (was “${a.was}”)`:''}`})),
      ...result.sensors.map(s=>({level:'ok',text:`New sensor on ${s.forLabel} → “${s.name}”${where(s)}`})),
      ...(result.localization?[{level:'ok',text:`Position sensor: ${result.localization==='fused'?'goBILDA Pinpoint':'SparkFun OTOS'} (the robot has one)`}]:[]),
      ...result.missing.map(m=>({level:'missing',text:`${m.label} (“${m.name}”) is not on the robot: Send to robot can add it`})),
      ...result.unused.map(u=>({level:'unused',text:`“${u.name}” (${u.kind}${u.where?', '+u.where:''}) is on the robot; nothing in Setup uses it`})),
      ...result.notes.map(t=>({level:'missing',text:t}))];}
  return {plan,apply,summary,lines,score,hubsOf};
});
