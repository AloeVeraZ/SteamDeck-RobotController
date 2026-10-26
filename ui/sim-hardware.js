(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckHardware=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // How a robot is wired, as the team plugs it in: which hub and port each motor, servo and sensor is on, what model
  // it is and which sensor tells where a mechanism is. Facts from FIRST's FTC SDK 12.0 and REV's hub documentation
  // (docs/MECHANISM_RESEARCH.md §8). project.robot.wiring keeps only what the team set; Deck plans the rest:
  //   hubs:    {expansion: null | {address}, servoHub: null | {address}}; a Control Hub is always there.
  //   devices: {[settingKey]: {model?, hub: control|expansion|servoHub, port}} (an I2C device: bus in place of port).
  //   sensors: [{id, model, for: settingKey of what it measures (or kin.<joint id>), use: position|home|velocity|piece,
  //             hub, port? (analog 0-3, digital 0-7, encoder 0-3), bus? (I2C), channel? (an OctoQuad's 0-7), name?,
  //             inverted?, zeroVolts?, voltsPerUnit?, countsPerUnit?}]
  // A setting key names one physical device the way the export's rows name its setting: robot.frontLeft,
  // intakes.0.servo, shooters.1.hood, kin.<actuator id>, sensor.<sensor id>.
  const A=globalThis.DeckActuators||(typeof require==='function'?require('./sim-actuators.js'):null);
  const finite=Number.isFinite,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  // ---- hubs ---------------------------------------------------------------------------------------------------------
  // REV Control Hub and Expansion Hub: motor ports 0-3, each with an encoder input; servo ports 0-5 (5 V); analog 0-3
  // (2 connectors: blue wire n, white wire n+1; the SDK reads 0-3.3 V); digital 0-7 (4 connectors); I2C buses 0-3 (the
  // Control Hub's own IMU is on bus 0). Encoder ports 0 and 3 are decoded in hardware; 1 and 2 in software, which can
  // drop counts from a fast encoder such as a Through Bore (8192 a turn). A REV Servo Hub has servo ports 0-5 at 6 V.
  const HUBS={
    control:{id:'control',name:'Control Hub',part:'REV-31-1595',address:173,motor:4,encoder:4,servo:6,analog:4,digital:8,i2c:4,servoVolts:5,imuBus:0,fastEncoders:[0,3]},
    expansion:{id:'expansion',name:'Expansion Hub',part:'REV-31-1153',address:2,motor:4,encoder:4,servo:6,analog:4,digital:8,i2c:4,servoVolts:5,fastEncoders:[0,3]},
    servoHub:{id:'servoHub',name:'Servo Hub',part:'REV-11-1855',address:3,motor:0,encoder:0,servo:6,analog:0,digital:0,i2c:0,servoVolts:6}};
  const FAMILIES={motor:'motor port',encoder:'encoder port',servo:'servo port',analog:'analog port',digital:'digital port',i2c:'I2C bus'};
  const count=(hub,family)=>HUBS[hub]?.[family]||0;
  // ---- what drives a mechanism ----------------------------------------------------------------------------------------
  // DeckActuators' models (each with its configuration tag, xmlType), and legal motors the simulator has no numbers for:
  // they can be wired and written to a configuration, with the counts a turn the team enters.
  const EXTRA=[
    {id:'matrix-12v',name:'MATRIX 12V motor (Modern Robotics, now goBILDA 5000 series)',short:'MATRIX 12V',kind:'dcmotor',family:'MATRIX',xmlType:'Matrix12vMotor',ratio:52.8,rpm:190,cpr:1478.4,feedback:'encoder',simulated:false},
    {id:'gobilda-5201',name:'goBILDA 5201 spur gear motor (older kits)',short:'goBILDA 5201',kind:'dcmotor',family:'goBILDA 5201',xmlType:'goBILDA5201SeriesMotor',rpm:null,cpr:null,feedback:'encoder',simulated:false},
    {id:'other-motor',name:'Another legal motor (SWYFT Spike, NFR Yuksel, WATTOS Stingray): enter its counts a turn',short:'Another motor',kind:'dcmotor',family:'Other',xmlType:'Motor',rpm:null,cpr:null,feedback:'encoder',simulated:false}];
  const ACTUATORS=[...(A?A.ALL:[]),...EXTRA],MODELS=Object.fromEntries(ACTUATORS.map(m=>[m.id,m]));
  const ofKind=k=>ACTUATORS.filter(m=>m.kind===k),MOTORS=ofKind('dcmotor'),SERVOS=ofKind('servo'),CRSERVOS=ofKind('crservo'),LINEARS=ofKind('linear');
  const familyOfKind=k=>k==='dcmotor'?'motor':k==='servo'||k==='crservo'||k==='linear'?'servo':k==='imu'||k==='pinpoint'||k==='otos'?'i2c':null;
  const KIND_TAG={dcmotor:'goBILDA5202SeriesMotor',servo:'Servo',linear:'Servo',crservo:'ContinuousRotationServo'};
  const xmlTypeOf=(model,kind)=>MODELS[model]?.xmlType||KIND_TAG[kind]||null;
  // ---- sensors --------------------------------------------------------------------------------------------------------
  // family: the port it plugs into (encoder: a motor port's encoder input, read through the motor configured there).
  // measures: what a mechanism can use it for. channels: REV's touch sensor reads only on odd digital channels (n+1) and
  // REV's potentiometer only on even analog channels (n). Axon feedback: angle = (1 − V/3.3)·360° − offset, wrapping at
  // 0 and 3.3 V; Axon publishes no table and the voltage shifts under load, so the guided check calibrates it.
  const SENSORS=[
    {id:'motor-encoder',name:'Motor encoder (built into the motor)',short:'Motor encoder',kind:'motorEncoder',family:'encoder',xmlType:null,javaType:'DcMotorEx',measures:['position','velocity','home']},
    {id:'rev-through-bore',name:'REV Through Bore Encoder (REV-11-1271)',short:'REV Through Bore',kind:'throughBore',family:'encoder',xmlType:null,javaType:'DcMotorEx',measures:['position'],cpr:8192,fast:true},
    {id:'rev-through-bore-v2',name:'REV Through Bore Encoder V2',short:'REV Through Bore V2',kind:'throughBore',family:'encoder',xmlType:null,javaType:'DcMotorEx',measures:['position'],cpr:8192,fast:true},
    {id:'gobilda-pod-encoder',name:'goBILDA odometry pod or swingarm encoder (2000 counts a turn)',short:'goBILDA pod encoder',kind:'throughBore',family:'encoder',xmlType:null,javaType:'DcMotorEx',measures:['position','velocity'],cpr:2000},
    {id:'quadrature-encoder',name:'Another quadrature encoder (US Digital E4T, CUI AMT102, Andymark): set its counts a turn',short:'Quadrature encoder',kind:'throughBore',family:'encoder',xmlType:null,javaType:'DcMotorEx',measures:['position','velocity'],cpr:2048},
    {id:'rev-through-bore-abs',name:'REV Through Bore Encoder V2, absolute output on an analog port',short:'Through Bore V2 absolute',kind:'analogAbs',family:'analog',xmlType:'AnalogInput',javaType:'AnalogInput',measures:['position'],degrees:360,voltage:3.3,channels:'any'},
    {id:'axon-feedback',name:"Axon servo's feedback wire (its 4th wire)",short:'Axon feedback wire',kind:'axonFeedback',family:'analog',xmlType:'AnalogInput',javaType:'AnalogInput',measures:['position'],degrees:360,voltage:3.3,channels:'any'},
    {id:'rev-potentiometer',name:'REV Potentiometer (REV-31-1155)',short:'REV Potentiometer',kind:'potentiometer',family:'analog',xmlType:'AnalogInput',javaType:'AnalogInput',measures:['position'],degrees:270,voltage:3.3,channels:'even'},
    {id:'andymark-am5200',name:'AndyMark HexBore absolute encoder (am-5200), analog output',short:'AndyMark HexBore',kind:'analogAbs',family:'analog',xmlType:'AnalogInput',javaType:'AnalogInput',measures:['position'],degrees:360,voltage:1.056,channels:'any'},
    {id:'analog-absolute',name:'Another analog absolute encoder (US Digital MA3, Thrifty)',short:'Analog absolute encoder',kind:'analogAbs',family:'analog',xmlType:'AnalogInput',javaType:'AnalogInput',measures:['position'],degrees:360,voltage:3.3,channels:'any'},
    {id:'rev-touch',name:'REV Touch Sensor (REV-31-1425)',short:'REV Touch Sensor',kind:'touch',family:'digital',xmlType:'RevTouchSensor',javaType:'TouchSensor',measures:['home','piece'],channels:'odd',activeLow:true},
    {id:'rev-magnetic-limit',name:'REV Magnetic Limit Switch (REV-31-1462)',short:'REV Magnetic Limit Switch',kind:'magnetic',family:'digital',xmlType:'DigitalDevice',javaType:'DigitalChannel',measures:['home'],channels:'any',activeLow:true},
    {id:'limit-switch',name:'Limit switch or microswitch (goBILDA 3103-0001)',short:'Limit switch',kind:'limit',family:'digital',xmlType:'DigitalDevice',javaType:'DigitalChannel',measures:['home','piece'],channels:'any',activeLow:true},
    {id:'rev-color-v3',name:'REV Color Sensor V3 (REV-31-1557)',short:'REV Color Sensor V3',kind:'color',family:'i2c',xmlType:'RevColorSensorV3',javaType:'NormalizedColorSensor',measures:['piece'],rangeCm:[1,10]},
    {id:'rev-color-v2',name:'REV Color Sensor V2',short:'REV Color Sensor V2',kind:'color',family:'i2c',xmlType:'LynxColorSensor',javaType:'NormalizedColorSensor',measures:['piece'],rangeCm:[1,6]},
    {id:'rev-2m-distance',name:'REV 2m Distance Sensor (REV-31-1505)',short:'REV 2m Distance',kind:'distance',family:'i2c',xmlType:'REV_VL53L0X_RANGE_SENSOR',javaType:'DistanceSensor',measures:['piece','position'],rangeCm:[5,200]},
    {id:'andymark-tof',name:'AndyMark 2m TOF Lidar',short:'AndyMark TOF',kind:'distance',family:'i2c',xmlType:'AndyMarkTOF',javaType:'DistanceSensor',measures:['piece','position'],rangeCm:[5,200],sinceSdk:'11.1'},
    {id:'octoquad',name:'DigitalChickenLabs OctoQuad FTC (MK2): an encoder on one of its 8 channels',short:'OctoQuad',kind:'octoquad',family:'i2c',xmlType:'OctoQuadFTC',javaType:'OctoQuad',measures:['position','velocity'],channels:8}];
  const SENSOR_MODELS=Object.fromEntries(SENSORS.map(s=>[s.id,s]));
  const USES={position:'where it is',home:'when it is at its zero',velocity:'how fast it spins',piece:'when a piece is there'};
  const TELLS={position:w=>`where ${w} is`,home:w=>`when ${w} is at its zero`,velocity:w=>`how fast ${w} spins`,piece:w=>`when a piece is at ${w}`};
  const A_KIND={dcmotor:'a motor',servo:'a servo',crservo:'a continuous servo',linear:'a linear servo'};
  // ---- roles ----------------------------------------------------------------------------------------------------------
  // What each device does, what may drive it (actuator kinds; models follow), which sensors the export can use on it and
  // for what. A flywheel's speed comes only from its motor's encoder: a Through Bore's 8192 counts a turn overflow the
  // hub's 16-bit velocity above about 240 rpm. A REV potentiometer turns 270°, short of a turret's sweep.
  const HOME={touch:'home',magnetic:'home',limit:'home'},PIECE={color:'piece',distance:'piece',touch:'piece',limit:'piece'},ANGLE={axonFeedback:'position',analogAbs:'position'};
  const R=(name,family,kinds,sensors,explain,o={})=>({name,family,kinds,sensors,explain,...o});
  const ROLES={
    drive:R('Drive motor','motor',['dcmotor'],{motorEncoder:'position',throughBore:'position'},'Turns a wheel. Its encoder counts the wheel’s turns when the robot finds its place from the drive motors.'),
    steer:R('Swerve steering','servo',['crservo','servo','dcmotor'],{...ANGLE,throughBore:'position',motorEncoder:'position'},'Turns a swerve module to its angle. An absolute encoder (an Axon\u2019s feedback wire, a Through Bore V2) tells where it points.'),
    pod:R('Odometry pod','motor',[],{},'A free wheel with an encoder, plugged into a motor port’s encoder input. The robot reads it through the name configured on that port.'),
    imu:R('IMU','i2c',[],{},'The hub’s own IMU, on I2C bus 0: it tells which way the robot faces.'),
    pinpoint:R('goBILDA Pinpoint','i2c',[],{},'Reads both odometry pods and its own IMU and tells where the robot is. It goes on an I2C bus other than the IMU’s bus 0.'),
    otos:R('SparkFun OTOS','i2c',[],{},'Watches the floor and tells where the robot is. It goes on an I2C bus other than the IMU’s bus 0.'),
    roller:R('Intake roller','motor',['dcmotor','crservo'],{...PIECE,motorEncoder:'velocity'},'Spins the intake rollers on power, so it needs no sensor. A colour or distance sensor can tell a piece is in.'),
    ramp:R('Ramp','servo',['servo','linear'],{...ANGLE,potentiometer:'position',throughBore:'position',...HOME},'Lowers the ramp to take pieces and lifts it back. A servo goes to set positions; an Axon’s feedback wire or a potentiometer tells where it really is.'),
    kicker:R('Kicker','servo',['servo','linear'],{...ANGLE,potentiometer:'position',throughBore:'position',...HOME},'Swings down to scoop pieces in and back up. A servo goes to set positions; an Axon’s feedback wire or a potentiometer tells where it really is.'),
    flywheel:R('Flywheel','motor',['dcmotor'],{motorEncoder:'velocity'},'Spins the flywheel at a set speed. Only its motor’s own encoder can read that speed.'),
    feeder:R('Feeder','motor',['dcmotor','crservo','servo'],{...PIECE,motorEncoder:'position',throughBore:'position',...ANGLE},'Pushes pieces into the flywheel: a motor or continuous servo spins, a servo pusher or gate moves between two positions. A piece sensor can tell storage is empty.'),
    turret:R('Turret','motor',['dcmotor','servo','crservo'],{motorEncoder:'position',throughBore:'position',octoquad:'position',...ANGLE,...HOME},'Turns the shooter to aim. A motor counts its encoder (or a Through Bore on the turret, best on encoder port 0 or 3); a servo goes to positions; a continuous servo needs an absolute sensor such as an Axon’s feedback wire. A limit switch can find its zero.',{needs:{crservo:['axonFeedback','analogAbs','throughBore','octoquad']}}),
    hood:R('Hood','servo',['servo','linear'],{...ANGLE,potentiometer:'position',throughBore:'position',...HOME},'Tilts the hood to its shooting angle for Spin up and Shoot, and back after. A servo goes to set positions; an Axon’s feedback wire tells where it is.'),
    'kin-servo':R('Servo','servo',['servo'],{...ANGLE,potentiometer:'position',throughBore:'position',octoquad:'position',...HOME,color:'piece',distance:'piece'},'Goes to the part’s named positions. Its position is where it was told to go; an Axon’s feedback wire or a potentiometer tells where it really is.'),
    'kin-crservo':R('Continuous servo','servo',['crservo'],{...ANGLE,throughBore:'position',octoquad:'position',...HOME},'Spins on power. To stop at a named position it needs a sensor: an Axon’s feedback wire, an absolute encoder or a limit switch.',{needs:{crservo:['axonFeedback','analogAbs','throughBore','octoquad','touch','magnetic','limit']}}),
    'kin-motor':R('Motor','motor',['dcmotor'],{motorEncoder:'position',throughBore:'position',octoquad:'position',potentiometer:'position',analogAbs:'position',distance:'position',...HOME},'Runs to encoder counts for each named position, counted from the pose in the CAD. A limit switch can find that zero after a restart.'),
    'kin-linear':R('Linear servo','servo',['linear'],{...HOME,distance:'position',...ANGLE,throughBore:'position'},'Pushes its rod out to set positions; the position is where it was told to go.'),
    sensor:R('Sensor',null,[],{},'')};
  for(const r of Object.values(ROLES))r.models=r.kinds.flatMap(k=>ofKind(k).map(m=>m.id));
  const modelsFor=role=>(ROLES[role]?.models||[]).map(id=>MODELS[id]);
  const sensorsFor=role=>SENSORS.filter(s=>Object.hasOwn(ROLES[role]?.sensors||{},s.kind));
  // ---- setting keys ---------------------------------------------------------------------------------------------------
  // As sim-config's DEVICE_KEYS: drive motors, IMU, Pinpoint, OTOS and odometry pods.
  // Drive motors of drivetrains Deck exports no code for (Kiwi, H-drive, swerve...): wired as on the robot all the same.
  const MORE_DRIVE=['front','center','frontLeftB','frontRightB','backLeftB','backRightB'],STEER=['steerFrontLeft','steerFrontRight','steerBackLeft','steerBackRight'];
  const DEVICE_KEYS=['frontLeft','frontRight','backLeft','backRight','left','right','imu','pinpoint','otos','par','perp','par_left','par_right',...MORE_DRIVE,...STEER],DRIVE_KEYS=[...DEVICE_KEYS.slice(0,6),...MORE_DRIVE],PODS=['par','perp','par_left','par_right'];
  const FIELDS={intakes:['motor','motor2','servo'],shooters:['motor','motor2','indexer','turretMotor','hood']},ID=/^[A-Za-z][\w-]{0,31}$/,NAME=/^[A-Za-z][\w .-]{0,39}$/;
  function settingKey(s){
    if(typeof s==='string')return parseKey(s)?s:null;if(!s||typeof s!=='object')return null;
    if(typeof s.robot==='string')return `robot.${s.robot}`;if(typeof s.list==='string'&&Number.isInteger(s.index)&&typeof s.field==='string')return `${s.list}.${s.index}.${s.field}`;
    if(typeof s.kin==='string')return `kin.${s.kin}`;if(typeof s.sensor==='string')return `sensor.${s.sensor}`;return null;}
  function parseKey(key){
    if(typeof key!=='string')return null;let m;
    if((m=/^robot\.(\w+)$/.exec(key)))return DEVICE_KEYS.includes(m[1])?{robot:m[1]}:null;
    if((m=/^(intakes|shooters)\.([0-3])\.(\w+)$/.exec(key)))return FIELDS[m[1]].includes(m[3])?{list:m[1],index:+m[2],field:m[3]}:null;
    if((m=/^(kin|sensor)\.(.+)$/.exec(key)))return ID.test(m[2])?{[m[1]]:m[2]}:null;
    return null;}
  // The port family a device key is on when its kind is known from the key alone (a roller, feeder, turret or part may be
  // on a motor or a servo port, depending on what drives it).
  function keyFamily(key,model){
    const md=MODELS[model];if(md)return familyOfKind(md.kind);const k=parseKey(key);if(!k)return null;
    if(k.robot)return ['imu','pinpoint','otos'].includes(k.robot)?'i2c':STEER.includes(k.robot)?'servo':'motor';
    if(k.field==='servo'||k.field==='hood')return 'servo';if(k.list==='shooters'&&(k.field==='motor'||k.field==='motor2'))return 'motor';return null;}
  // ---- project.robot.wiring -------------------------------------------------------------------------------------------
  const EMPTY=()=>({hubs:{expansion:null,servoHub:null},devices:{},sensors:[]});
  const address=(v,d)=>{const a=finite(v)?Math.round(v):d;return a>=1&&a<=254&&a!==173?a:d;};
  const portIn=(v,n)=>finite(v)&&n>0?clamp(Math.round(v),0,n-1):null;
  const name=v=>typeof v==='string'&&NAME.test(v.trim())?v.trim():null;
  // Where one device or sensor is plugged in, or null: the hub must be on the robot and have that kind of port.
  function placement(raw,family,hubs,{channels=false}={}){
    const hub=raw?.hub;if(!(hub==='control'||(hub==='expansion'||hub==='servoHub')&&hubs[hub]))return null;
    if(family==='i2c'){const bus=portIn(raw.bus??raw.port,count(hub,'i2c'));return bus===null?null:{hub,bus,...(channels&&portIn(raw.channel,8)!==null?{channel:portIn(raw.channel,8)}:{})};}
    const n=family?count(hub,family):Math.max(count(hub,'motor'),count(hub,'servo')),port=portIn(raw.port,n);return port===null?null:{hub,port};}
  // Only what the team set is kept: unknown keys and models are dropped, ports held to the hub's range, and 32 sensors at
  // most. A port two devices claim is kept as set, so Setup shows it red (conflicts) until the team moves one of them.
  // Returns null when nothing is set. Never throws.
  function sanitizeWiring(raw){
    try{
      if(!raw||typeof raw!=='object')return null;const h=raw.hubs&&typeof raw.hubs==='object'?raw.hubs:{},out=EMPTY();
      if(h.expansion)out.hubs.expansion={address:address(h.expansion.address,2)};else if(h.expansion===false)out.hubs.expansion=false;
      if(h.servoHub){let a=address(h.servoHub.address,3);while(a===out.hubs.expansion?.address||a===173)a++;out.hubs.servoHub={address:a};}
      const devices=raw.devices&&typeof raw.devices==='object'?raw.devices:{};
      for(const key of Object.keys(devices).slice(0,160)){const v=devices[key],k=parseKey(key);if(!v||typeof v!=='object'||!k||k.sensor)continue;
        const e={};if(typeof v.model==='string'&&Object.hasOwn(MODELS,v.model))e.model=v.model;
        const family=keyFamily(key,e.model),at=placement(v,family,out.hubs);
        if(at)Object.assign(e,at);
        if(Object.keys(e).length)out.devices[key]=e;}
      const ids=new Set();
      for(const s of (Array.isArray(raw.sensors)?raw.sensors:[]).slice(0,64)){if(out.sensors.length>=32)break;
        const md=s&&typeof s==='object'?SENSOR_MODELS[s.model]:null,on=md&&typeof s.for==='string'&&parseKey(s.for)&&!parseKey(s.for).sensor?s.for:null;
        if(!on||typeof s.id!=='string'||!ID.test(s.id)||ids.has(s.id))continue;ids.add(s.id);
        const e={id:s.id,model:s.model,for:on,use:md.measures.includes(s.use)?s.use:/^shooters\.\d\.motor2?$/.test(on)&&md.measures.includes('velocity')?'velocity':md.measures[0]};
        if(md.kind!=='motorEncoder'){const at=placement(s,md.family,out.hubs,{channels:md.kind==='octoquad'});if(at&&at.hub!=='servoHub')Object.assign(e,at);}
        const n=name(s.name);if(n)e.name=n;if(s.inverted===true)e.inverted=true;
        if(finite(s.zeroVolts)&&s.zeroVolts>=0&&s.zeroVolts<=5)e.zeroVolts=+s.zeroVolts.toFixed(4);
        for(const f of ['voltsPerUnit','countsPerUnit'])if(finite(s[f])&&s[f]!==0&&Math.abs(s[f])<1e6)e[f]=+s[f].toPrecision(6);
        out.sensors.push(e);}
      return out.hubs.expansion||out.hubs.expansion===false||out.hubs.servoHub||Object.keys(out.devices).length||out.sensors.length?out:null;
    }catch{return null;}
  }
  // A robot's wiring with every part present (nothing set: a Control Hub alone, Deck plans every port).
  const wiringOf=robot=>sanitizeWiring(robot?.wiring)||EMPTY();
  // Keys after intake or shooter `removed` is deleted: later ones move down one; its own devices and sensors go.
  function reindex(wiring,list,removed){
    const w=sanitizeWiring(wiring);if(!w)return null;const move=key=>{const k=parseKey(key);if(!k||k.list!==list)return key;if(k.index===removed)return null;return k.index>removed?`${list}.${k.index-1}.${k.field}`:key;};
    const devices={};for(const [key,v] of Object.entries(w.devices)){const to=move(key);if(to)devices[to]=v;}
    return sanitizeWiring({...w,devices,sensors:w.sensors.map(s=>{const to=move(s.for);return to?{...s,for:to}:null;}).filter(Boolean)});}
  // Wiring without the keys keep(key) refuses (a part or joint no longer there), and the sensors on them.
  function prune(wiring,keep){const w=sanitizeWiring(wiring);if(!w)return null;
    return sanitizeWiring({...w,devices:Object.fromEntries(Object.entries(w.devices).filter(([k])=>keep(k))),sensors:w.sensors.filter(s=>keep(s.for))});}
  // ---- the devices a robot needs ----------------------------------------------------------------------------------------
  const hubName=(hub,w)=>hub==='control'?'Control Hub':hub==='expansion'?`Expansion Hub ${w?.hubs?.expansion?.address??2}`:hub==='servoHub'?`Servo Hub ${w?.hubs?.servoHub?.address??3}`:'';
  const portLabel=(p,family,w)=>!p?.hub?'':`${hubName(p.hub,w)} ${family==='i2c'?`I2C bus ${p.bus}`:`${FAMILIES[family]||'port'} ${p.port}`}${p.channel!==undefined?`, channel ${p.channel}`:''}`;
  const SIGNALS={roller:['roller'],ramp:['deploy'],kicker:['deploy'],flywheel:['flywheel'],feeder:['feeder'],turret:['turret'],hood:['hood']};
  const kindOfDevice=d=>d==='motor'?'dcmotor':d==='servo'||d==='crservo'||d==='linear'?d:d==='imu'||d==='pinpoint'||d==='otos'?d:null;
  function roleOf(setting,mech){
    if(setting?.robot)return DRIVE_KEYS.includes(setting.robot)?'drive':STEER.includes(setting.robot)?'steer':PODS.includes(setting.robot)?'pod':setting.robot;
    const f=setting?.field;if(setting?.list==='intakes')return f==='servo'?(mech?.intakes?.[setting.index]?.kind==='ramp'?'ramp':'kicker'):'roller';
    if(setting?.list==='shooters')return {motor:'flywheel',motor2:'flywheel',indexer:'feeder',turretMotor:'turret',hood:'hood'}[f]||null;return null;}
  const camel=v=>A?A.camel(v):String(v||'');
  const DEVICE_OF={motorEncoder:null,throughBore:'motor',axonFeedback:'analog',potentiometer:'analog',analogAbs:'analog',touch:'touch',magnetic:'digital',limit:'digital',color:'color',distance:'distance',octoquad:'octoquad'};
  const SUFFIX={position:'Position',home:'Home',velocity:'Speed',piece:'Piece'};
  // Every device the robot needs, one row each: {key, label, role, family, kind, device and need (as RobotConfig names
  // them), name, model, xmlType, hub?, port?, bus?, wired, encoder (its encoder input is read), sensors (what measures
  // it), joints (kinematics joint ids that move with it), parts (CAD assembly names)}, then one row per sensor (role
  // sensor, with for, use, channels?, fast?; its name is the configuration name it gets: the sensors on one OctoQuad
  // share "octoquad"). needs: DeckSimFtc.robotNeeds' rows (taken from DeckSimFtc when not given); kinematics actuators
  // and the hood are added when the needs lack them.
  const DL={frontLeft:'Front left drive motor',frontRight:'Front right drive motor',backLeft:'Back left drive motor',backRight:'Back right drive motor',left:'Left drive motor',right:'Right drive motor',front:'Front drive motor',center:'Centre (strafe) drive motor',
    frontLeftB:'Front left module, second motor',frontRightB:'Front right module, second motor',backLeftB:'Back left module, second motor',backRightB:'Back right module, second motor',steerFrontLeft:'Front left steering',steerFrontRight:'Front right steering',steerBackLeft:'Back left steering',steerBackRight:'Back right steering'};
  const slots=keys=>keys.map(k=>[k,DL[k]]),FOUR=['frontLeft','frontRight','backLeft','backRight'];
  const DRIVE_SLOTS={mecanum:slots(FOUR),xdrive:slots(FOUR),butterfly:slots(FOUR),tank:slots(['left','right']),tank2:slots(['left','right']),tank6:slots(['left','right']),tank8:slots(['left','right']),tracks:slots(['left','right']),
    kiwi:slots(['front','backLeft','backRight']),hdrive:slots(['left','right','center']),swerve:slots([...FOUR,...STEER]),coaxSwerve:slots([...FOUR,...STEER]),diffSwerve:slots([...FOUR,'frontLeftB','frontRightB','backLeftB','backRightB'])};
  function rows(project,needs){
    const p=project||{},robot=p.robot||{},w=wiringOf(robot),mech=p.mechanisms,kin=p.kinematics||{},joints=Array.isArray(kin.joints)?kin.joints:[],actuators=Array.isArray(kin.actuators)?kin.actuators:[];
    if(!Array.isArray(needs)){try{const F=globalThis.DeckSimFtc||(typeof require==='function'?require('./sim-ftc.js'):null);needs=F?F.robotNeeds(robot,p.sensors?.localization,mech):[];}catch{needs=[];}}
    const out=[],seen=new Set(),byKey=new Map(),localization=p.sensors?.localization;
    const jointsOf=(role,setting)=>{if(!setting?.list)return [];const part=`${setting.list==='intakes'?'intake':'shooter'}:${setting.index}`;
      return joints.filter(j=>j.drive&&(SIGNALS[role]||[]).includes(j.drive.signal)&&(j.drive.of===part||role==='feeder'&&j.drive.of==='any')).map(j=>j.id);};
    const add=(n,extra={})=>{const key=settingKey(n.setting);if(!key||seen.has(key))return;seen.add(key);const k=parseKey(key);if(!k||k.sensor)return;
      const act=k.kin?actuators.find(a=>a.id===k.kin):null,role=k.kin?`kin-${{dcmotor:'motor',servo:'servo',crservo:'crservo',linear:'linear'}[act?.kind]||'servo'}`:roleOf(n.setting,mech);if(!role)return;
      const e=w.devices[key]||{},model=act?.model||e.model||null,md=MODELS[model],kind=act?.kind||(md&&ROLES[role]?.kinds.includes(md.kind)&&md.kind==='linear'&&n.device==='servo'?'linear':kindOfDevice(n.device)),family=role==='pod'?'motor':familyOfKind(kind);
      // Whether it reads its own motor encoder: a flywheel's speed, a motor turret's or part's position (unless a Through
      // Bore or an OctoQuad channel reads it instead), drive motors when the robot finds its place from them.
      const outside=w.sensors.some(s=>s.for===key&&['throughBore','octoquad'].includes(SENSOR_MODELS[s.model].kind)&&s.use==='position');
      const encoder=role==='pod'||role==='flywheel'||(role==='turret'&&kind==='dcmotor'||role==='kin-motor')&&!outside||role==='drive'&&localization==='encoders'||w.sensors.some(s=>s.for===key&&s.model==='motor-encoder');
      const list=k.list?mech?.[k.list]?.[k.index]:null,parts=Array.isArray(list?.parts)?list.parts:[],moved=k.kin?(act?.joint?[act.joint]:[]):jointsOf(role,n.setting);
      const row={key,label:n.label,role,family,kind,device:role==='pod'?'motor':n.device||kind,need:n.need||(n.device==='linear'?'servo':n.device),name:n.name,model,xmlType:role==='pod'?'Motor':xmlTypeOf(model,kind),...(n.setting?{setting:n.setting}:{}),
        ...(e.hub?{hub:e.hub,...(e.bus!==undefined?{bus:e.bus}:{port:e.port})}:{}),wired:!!e.hub,encoder,sensors:[],...(moved.length?{joints:moved}:{}),...(parts.length?{parts}:{}),...extra};
      out.push(row);byKey.set(key,row);};
    for(const n of needs||[])add(n);
    if(!out.some(r=>r.role==='drive')){const slots=DRIVE_SLOTS[robot.drivetrain||'mecanum']||DRIVE_SLOTS.mecanum;
      for(const [key,label] of slots)add({name:key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),device:STEER.includes(key)?'crservo':'motor',label,setting:{robot:key}});}
    (mech?.enabled?mech.shooters||[]:[]).forEach((s,i)=>{if(s.hood)add({name:s.hood,device:'servo',label:`Shooter ${i+1} hood`,setting:{list:'shooters',index:i,field:'hood'}});});
    for(const a of actuators){if(!['servo','crservo','dcmotor','linear'].includes(a.kind))continue;const j=joints.find(x=>x.id===a.joint);if(j?.drive&&j.drive.signal!=='action')continue;
      const servoPwm=a.servo?.pwm;add({name:a.device||camel(a.name),device:a.kind==='dcmotor'?'motor':a.kind==='linear'?'servo':a.kind,label:a.name||a.id,setting:{kin:a.id}},{...(servoPwm?{pwm:servoPwm}:{}),...(a.reversed?{reversed:true}:{})});}
    for(const s of w.sensors){const md=SENSOR_MODELS[s.model],dev=byKey.get(s.for),k=parseKey(s.for),joint=k?.kin?joints.find(j=>j.id===k.kin):null;
      if(dev)dev.sensors.push({id:s.id,model:s.model,kind:md.kind,use:s.use,...(s.hub?{hub:s.hub,...(s.bus!==undefined?{bus:s.bus}:{port:s.port}),...(s.channel!==undefined?{channel:s.channel}:{})}:{})});
      if(md.kind==='motorEncoder')continue;
      const what=dev?.label||joint?.name||s.for,base=dev?.name||camel(joint?.name||k?.kin||s.for);
      out.push({key:`sensor.${s.id}`,id:s.id,label:`${what}: ${md.short}`,role:'sensor',family:md.family,kind:md.kind,device:DEVICE_OF[md.kind],need:DEVICE_OF[md.kind],name:s.name||(md.kind==='octoquad'?'octoquad':`${base}${md.family==='encoder'?'Encoder':SUFFIX[s.use]}`.slice(0,40)),model:s.model,xmlType:md.family==='encoder'?'Motor':md.xmlType,
        for:s.for,use:s.use,...(s.hub?{hub:s.hub,...(s.bus!==undefined?{bus:s.bus}:{port:s.port}),...(s.channel!==undefined?{channel:s.channel}:{})}:{}),wired:!!s.hub,encoder:md.family==='encoder',...(md.channels==='odd'||md.channels==='even'?{channels:md.channels}:{}),...(md.fast?{fast:true}:{}),
        ...(dev?.joints?{joints:dev.joints}:joint?{joints:[joint.id]}:{}),...(dev?.parts?{parts:dev.parts}:{})});}
    return out;
  }
  // ---- motors and servos named in a CAD -------------------------------------------------------------------------------
  // What a CAD part's name says it is: {kind: dcmotor|servo|crservo|linear, model: catalog id or null}, or null. Vendor
  // part numbers first (goBILDA 5203/5202-…, REV-41-…, 2000-0025-…), then names with an rpm or a gear ratio.
  const GB_RATIO={'0001':6000,'0003':1620,'0005':1150,'0014':435,'0019':312,'0027':223,'0051':117,'0071':84,'0100':60,'0139':43,'0188':30};
  const nearest=(rpm,list)=>list.reduce((a,b)=>Math.abs(b.rpm-rpm)<Math.abs(a.rpm-rpm)?b:a);
  function fromCadName(raw){
    const s=String(raw||'').toLowerCase().replace(/[_]+/g,' ');if(!s)return null;let m;
    const gb=MOTORS.filter(x=>/^gobilda-5203-/.test(x.id)),rpmOf=/(\d{2,4}(?:\.\d+)?)\s*rpm/.exec(s),ratioOf=/(\d{1,3}(?:\.\d+)?)\s*:\s*1\b/.exec(s);
    if((m=/520[23]-\d{4}-(\d{4})/.exec(s))&&GB_RATIO[m[1]])return {kind:'dcmotor',model:'gobilda-5203-'+GB_RATIO[m[1]]};
    if(/yellow ?jacket|520[23][- ]series|\b520[23]\b|gobilda.*motor/.test(s)){if(rpmOf)return {kind:'dcmotor',model:nearest(+rpmOf[1],gb).id};
      if(ratioOf){const r=+ratioOf[1];return {kind:'dcmotor',model:gb.reduce((a,b)=>Math.abs(6000/b.rpm-r)<Math.abs(6000/a.rpm-r)?b:a).id};}return {kind:'dcmotor',model:null};}
    if(/rev-?41-?1300|core ?hex/.test(s))return {kind:'dcmotor',model:'rev-core-hex'};
    if(/rev-?41-?1301|hd ?hex|ultraplanetary|rev-?41-?1600/.test(s)){const r=ratioOf?+ratioOf[1]:null,ultra=MOTORS.filter(x=>/^rev-ultra-|^rev-hd-hex/.test(x.id));
      return {kind:'dcmotor',model:rpmOf?nearest(+rpmOf[1],ultra).id:r?ultra.reduce((a,b)=>Math.abs(6000/b.rpm-r)<Math.abs(6000/a.rpm-r)?b:a).id:/ultraplanetary|1600/.test(s)?'rev-ultra-20':'rev-hd-hex'};}
    if(/neverest/.test(s))return {kind:'dcmotor',model:/3\.7|orbital 3/.test(s)?'neverest-3-7':/60/.test(s)?'neverest-60':/40/.test(s)?'neverest-40':'neverest-20'};
    if(/torquenado/.test(s))return {kind:'dcmotor',model:'torquenado'};if(/maverick/.test(s))return {kind:'dcmotor',model:'studica-maverick'};
    const cr=/continuous|\bcr\b|cont\.? ?rot/.test(s),pick=(id,crId)=>({kind:cr&&crId?'crservo':'servo',model:cr&&crId?crId:id});
    if(/2000-0025-0002|torque servo|dual mode.*torque/.test(s))return pick('gobilda-torque','gobilda-torque-cr');
    if(/2000-0025-0004|super ?speed/.test(s))return pick('gobilda-superspeed','gobilda-superspeed-cr');
    if(/2000-0025-0003|speed servo|dual mode.*speed/.test(s))return pick('gobilda-speed','gobilda-speed-cr');
    if(/2000-0025-0503|5[- ]turn/.test(s))return {kind:'servo',model:'gobilda-5turn'};
    if((m=/axon\s*(max|mini|micro)/.exec(s)))return pick('axon-'+m[1],'axon-'+m[1]+'-cr');
    if(/rev-?41-?3336|ultraspeed/.test(s))return {kind:'servo',model:'rev-smart-ultra'};
    if(/rev-?41-?1097|smart robot servo/.test(s))return pick('rev-smart','rev-smart-cr');
    if(/75007|200 fast/.test(s))return {kind:'servo',model:'studica-multimode-fast'};if(/75002|multi-?mode/.test(s))return pick('studica-multimode','studica-multimode-cr');
    if((m=/sr-servo-0([1-5])/.exec(s)))return {kind:'servo',model:'swyft-'+['speed','balance','torque','slim','nano'][+m[1]-1]};
    if(/plex-09-0017-0001/.test(s))return {kind:'servo',model:'plex-speed'};if(/plex-09-0017-0002/.test(s))return {kind:'servo',model:'plex-torque'};
    if((m=/torctex\s*(max|pro|micro)/.exec(s)))return {kind:'servo',model:'torctex-'+m[1]};
    if(/l16/.test(s)&&/actuonix|linear/.test(s))return {kind:'linear',model:/140/.test(s)?'actuonix-l16-140':/100/.test(s)?'actuonix-l16-100':'actuonix-l16-50'};
    if(/hls12/.test(s))return {kind:'linear',model:'hitec-hls12'};if(/hs-?485/.test(s))return {kind:'servo',model:'hitec-485'};
    // A part simply called a motor or a servo: its kind, its model left to the team.
    if(/\bservo\b/.test(s)&&!/servo (hub|horn|block|mount|bracket|shaft|plate|spline)|hub shaft/.test(s))return {kind:cr?'crservo':'servo',model:null};
    if(/\bmotor\b/.test(s)&&!/motor (mount|bracket|plate|pinion|spacer|shaft|gear|pulley)/.test(s))return {kind:'dcmotor',model:null};
    return null;}
  // Which device each actuator found in a CAD drives. parts: [{name, path (its assembly names, outermost first), kind,
  // model}]; devices: rows {key, role, family, scope: CAD refs of its mechanism, own: refs of what it moves}; key of each
  // part: its CAD ref. A part goes to a device of its family in whose mechanism it sits, preferring words in its path that
  // say what the device does and the parts the device moves; in a shooter the fastest motor turns the flywheel.
  // Returns [{key: device key, part, kind, model}].
  const ROLE_WORDS={flywheel:/fly ?wheel|launch|shoot|outtake/,turret:/turret|turntable|lazy ?susan|rotat/,hood:/hood/,feeder:/kick|feed|index|transfer|push|gate|flick/,
    ramp:/ramp|deploy|pivot|flip|wrist/,kicker:/kick|scoop/,roller:/roller|intake|sweep|brush|spin/,drive:/drive|chassis|mecanum|base|frame/,steer:/steer|swerve|module/};
  const FAMILY_KINDS={motor:['dcmotor','crservo'],servo:['servo','linear','crservo']};
  function assignCad(parts,devices){
    const within=(ref,refs)=>refs.some(r=>ref===r||ref.startsWith(r+'/')),pairs=[];
    for(const d of devices){const kinds=FAMILY_KINDS[d.family]||[];if(!kinds.length)continue;
      for(const p of parts){if(!kinds.includes(p.kind)||(d.family==='motor'&&p.kind==='crservo'&&!['roller','feeder','steer'].includes(d.role)))continue;
        // Its own name and the assemblies around it say what it drives ("Turret motor" on the chassis still turns the turret).
        const words=ROLE_WORDS[d.role],named=!!words&&words.test(p.name.toLowerCase()),inside=d.scope.length?within(p.key,d.scope):d.role==='drive';if(!inside&&!named)continue;
        let score=(inside?1:0)+(named?4:words&&words.test(p.path.join('/').toLowerCase())?3:0)+(d.own.length&&within(p.key,d.own)?2:0)-(d.scope.length?0:.5);
        if(d.role==='flywheel'||d.role==='turret'){const rpm=MODELS[p.model]?.rpm||0;score+=d.role==='flywheel'?rpm/10000:-rpm/10000;}
        pairs.push({d,p,score});}}
    pairs.sort((a,b)=>b.score-a.score);const used=new Set(),done=new Set(),out=[];
    for(const {d,p} of pairs){if(done.has(d.key)||used.has(p.key))continue;
      // Drive motors: one CAD part each, but four of one kind usually: every drive motor takes the model found.
      done.add(d.key);used.add(p.key);out.push({key:d.key,part:p.name,kind:p.kind,model:p.model});}
    return out;}
  // ---- an offline port plan -------------------------------------------------------------------------------------------
  const problem=(level,keys,text)=>({level,keys,text});
  // Ports to try, in order, for one row on one hub: touch sensors on odd digital channels and REV potentiometers on even
  // analog ones (REV's wiring); other switches take even channels first, keeping odd ones for touch sensors; a fast
  // encoder takes encoder port 0 or 3 first; I2C devices start at bus 1 (bus 0 has the hub's IMU).
  function portOrder(row,hub){const n=count(hub,row.family==='encoder'?'encoder':row.family),all=Array.from({length:n},(_,i)=>i);
    if(row.family==='i2c')return all.filter(i=>i>0);if(row.channels==='odd')return all.filter(i=>i%2);if(row.channels==='even')return all.filter(i=>i%2===0);
    if(row.family==='digital')return [...all.filter(i=>i%2===0),...all.filter(i=>i%2)];if(row.family==='encoder')return [0,3,1,2].filter(i=>i<n);return all;}
  // Hubs to try for a row: drive motors on the Control Hub first, other motors on the Expansion Hub first, servos on the
  // Control Hub, then a Servo Hub, then the Expansion Hub; sensors on the hub of what they measure first.
  function hubOrder(row,hubs,near){
    const order=row.family==='motor'?(row.role==='drive'||row.role==='imu'?['control','expansion']:['expansion','control']):row.family==='servo'?['control','servoHub','expansion']:['control','expansion'];
    const ok=order.filter(h=>hubs.includes(h)&&count(h,row.family)>0);return near&&ok.includes(near)?[near,...ok.filter(h=>h!==near)]:ok;}
  // A port for every row the team has not wired, around the ones they have: {assign: {[key]: {hub, port|bus, channel?,
  // wired, label, via?, conflict?}}, problems: [{level: red|amber, keys, text}]}. Rows that share a name (an odometry pod
  // read through its drive motor's name) share a port. A sensor on an encoder input shares the motor port it is on when
  // that motor does not read its own encoder (the robot reads it through that motor's name: via); with no motor there,
  // the configuration gets a motor entry under the sensor's name for it.
  function plan(rowList,wiring){
    const w=sanitizeWiring(wiring)||EMPTY(),hubs=['control',...(w.hubs.expansion?['expansion']:[]),...(w.hubs.servoHub?['servoHub']:[])];
    const list=(rowList||[]).filter(r=>r&&r.key&&r.family&&!(r.role==='sensor'&&r.kind==='motorEncoder')),used=new Map(),assign={},problems=[],byName=new Map();
    const at=r=>assign[r.key],label=(r,p)=>portLabel(p,r.family,w);
    const slots=(r,p)=>{if(r.family==='i2c')return [`${p.hub}:i2c:${p.bus}`];if(r.family==='encoder')return [`${p.hub}:encoder:${p.port}`];
      return [`${p.hub}:${r.family}:${p.port}`,...(r.family==='motor'&&r.encoder?[`${p.hub}:encoder:${p.port}`]:[])];};
    // Who holds a slot, and whether r may share it: the same name, or OctoQuad sensors on one OctoQuad.
    const clash=(r,p)=>{for(const s of slots(r,p)){const o=used.get(s);if(o&&o!==r&&!(o.name===r.name&&o.family===r.family)&&!(o.kind==='octoquad'&&r.kind==='octoquad'))return o;}
      if(r.family==='encoder'){const m=used.get(`${p.hub}:motor:${p.port}`);if(m&&(m.encoder||m.role==='pod'))return m;}return null;};
    const take=(r,p,wired)=>{for(const s of slots(r,p))if(!used.has(s))used.set(s,r);let via;
      if(r.family==='encoder'){const m=used.get(`${p.hub}:motor:${p.port}`);if(m&&m!==r&&!m.encoder)via=m.name;else used.set(`${p.hub}:motor:${p.port}`,r);}
      assign[r.key]={...p,wired,label:label(r,p),...(via?{via}:{})};if(r.family==='motor')byName.set(r.name,assign[r.key]);};
    const hubOk=(r,p)=>p.hub==='control'||hubs.includes(p.hub);
    // 1. What the team wired, where they wired it.
    for(const r of list){if(!r.hub)continue;const p={hub:r.hub,...(r.family==='i2c'?{bus:r.bus??r.port}:{port:r.port}),...(r.channel!==undefined?{channel:r.channel}:{})},n=count(p.hub,r.family);
      if(!hubOk(r,p)){problems.push(problem('red',[r.key],`${r.label} is wired to the ${HUBS[p.hub]?.name||'hub'}, which this robot does not have.`));continue;}
      const port=r.family==='i2c'?p.bus:p.port;if(!(Number.isInteger(port)&&port>=0&&port<n)){problems.push(problem('red',[r.key],`${hubName(p.hub,w)} has no ${FAMILIES[r.family]} ${port} for ${r.label}${n?'':`: it has no ${FAMILIES[r.family]}s`}.`));continue;}
      const o=clash(r,p);if(o){problems.push(problem('red',[o.key,r.key],`${label(r,p)} is used by ${o.label} and ${r.label}.`));assign[r.key]={...p,wired:true,label:label(r,p),conflict:true};continue;}
      take(r,p,true);}
    // 2. The rest, devices before the sensors that may share their ports.
    const rest=list.filter(r=>!at(r)&&!(r.hub&&problems.some(x=>x.keys.includes(r.key)&&!x.keys[1])));
    for(const r of [...rest.filter(r=>r.role!=='sensor'),...rest.filter(r=>r.role==='sensor')]){
      if(r.role==='imu'){const p={hub:'control',bus:0},o=clash(r,p);if(o)problems.push(problem('red',[o.key,r.key],`Control Hub I2C bus 0 has the hub’s own IMU; ${o.label} cannot go there.`));else take(r,p,false);continue;}
      const same=r.family==='motor'&&byName.get(r.name);if(same){assign[r.key]={...same,wired:false};continue;}
      // A sensor goes on the hub of what it measures; one on an encoder input first on that motor's own port (read through
      // its name) when the port counts in hardware or nothing else is free.
      const near=r.for?(at({key:r.for})||{}).hub:null,mine=r.family==='encoder'&&list.find(x=>x.key===r.for)?.family==='motor'?at({key:r.for}):null,own=mine&&{hub:mine.hub,port:mine.port};let placed=null;
      if(own&&(!r.fast||HUBS[own.hub].fastEncoders?.includes(own.port))&&!clash(r,own))placed=own;
      if(!placed)for(const hub of hubOrder(r,hubs,near)){
        if(r.kind==='octoquad'){const q=Object.entries(assign).find(([k,a])=>a.hub===hub&&list.find(x=>x.key===k)?.kind==='octoquad');
          if(q){const busy=new Set(list.filter(x=>x.kind==='octoquad'&&at(x)?.hub===hub&&at(x)?.bus===q[1].bus).map(x=>at(x).channel));const ch=[0,1,2,3,4,5,6,7].find(c=>!busy.has(c));if(ch!==undefined){placed={hub,bus:q[1].bus,channel:ch};break;}}}
        for(const port of portOrder(r,hub)){const p=r.family==='i2c'?{hub,bus:port,...(r.kind==='octoquad'?{channel:0}:{})}:{hub,port};if(!clash(r,p)){placed=p;break;}}if(placed)break;}
      if(!placed&&own&&!clash(r,own))placed=own;
      // An odometry pod with no motor port of its own goes on the encoder input of a motor that does not read its own
      // encoder (usually a drive motor): the robot reads it through that motor's name.
      if(!placed&&r.role==='pod'){const m=[...used.entries()].find(([slot,o])=>/:motor:/.test(slot)&&o.family==='motor'&&!o.encoder&&o.role!=='pod'&&!used.has(slot.replace(':motor:',':encoder:')));
        if(m){const [hub,,port]=m[0].split(':'),p={hub,port:+port};used.set(`${hub}:encoder:${port}`,r);assign[r.key]={...p,wired:false,label:label(r,p),via:m[1].name};
          problems.push(problem('amber',[r.key],`${r.label} goes on the encoder input of ${label(r,p)}, beside "${m[1].name}": the code reads it as "${r.name}", so name it "${m[1].name}" in Robot controller → Device names.`));continue;}}
      if(!placed){const fam=FAMILIES[r.family];problems.push(problem('amber',[r.key],`No ${fam} is free for ${r.label}.${r.family==='motor'?(w.hubs.expansion?' Run a roller on a continuous servo, or free a motor port.':' Add an Expansion Hub, or run a roller on a continuous servo.'):r.family==='servo'?(w.hubs.servoHub?' Free a servo port.':' Add a Servo Hub or an Expansion Hub.'):w.hubs.expansion?'':' Add an Expansion Hub.'}`));continue;}
      take(r,placed,false);
      if(r.fast&&r.family==='encoder'&&!HUBS[placed.hub].fastEncoders.includes(placed.port))problems.push(problem('amber',[r.key],`${r.label} is on ${assign[r.key].label}: ports 1 and 2 count in software and can miss counts from its ${SENSOR_MODELS[r.model]?.cpr||8192} a turn. Encoder ports 0 and 3 are taken.`));}
    return {assign,problems};
  }
  // Rows with their planned ports filled in (planned: Deck picked it).
  function placed(rowList,wiring){const {assign}=plan(rowList,wiring);return rowList.map(r=>{const a=assign[r.key];if(!a)return r;const {label,wired,...p}=a;return {...r,...p,portLabel:label,...(wired?{}:{planned:true})};});}
  // ---- problems -------------------------------------------------------------------------------------------------------
  // Everything wrong or worth a look in a robot's wiring: red for what cannot work (two devices on one port, a model
  // that is not what the mechanism runs on, a touch sensor on an even channel), amber for what to check.
  function conflicts(rowList,wiring){
    const w=sanitizeWiring(wiring)||EMPTY(),list=rowList||[],out=[],keys=new Set(list.map(r=>r.key));
    for(const r of list){const role=ROLES[r.role],md=MODELS[r.model];
      if(md&&r.role!=='sensor'){
        if(md.kind!==r.kind&&!(md.kind==='linear'&&r.kind==='servo')&&r.role!=='pod')out.push(problem('red',[r.key],`${r.label} is set to run on ${A_KIND[r.kind]||r.kind}, but its model, ${md.short}, is ${A_KIND[md.kind]||md.kind}.`));
        else if(role&&role.kinds.length&&!role.kinds.includes(md.kind))out.push(problem('red',[r.key],`A ${role.name.toLowerCase()} cannot run on ${md.short}.`));
        if(md.legal===false)out.push(problem('amber',[r.key],`${md.short} on ${r.label} is not on the 2026-27 pre-verified list: bring its data sheet to inspection.`));
        if(md.simulated===false&&!finite(md.cpr))out.push(problem('amber',[r.key],`Enter the counts a turn of ${md.short} on ${r.label}: Deck has no figure for it.`));}
      if(r.role==='sensor'){const dev=list.find(x=>x.key===r.for),allowed=dev?ROLES[dev.role]?.sensors||{}:null;
        if(!dev&&!/^kin\./.test(r.for||''))out.push(problem('amber',[r.key],`${r.label} measures a device this robot no longer has.`));
        else if(allowed&&!Object.hasOwn(allowed,r.kind))out.push(problem(dev.role==='flywheel'?'red':'amber',[r.key],dev.role==='flywheel'?`${dev.label}: only its motor’s own encoder can read its speed (a ${SENSOR_MODELS[r.model]?.short||'sensor'} overflows the hub’s speed reading).`:`Deck’s robot code does not use a ${SENSOR_MODELS[r.model]?.short||r.kind} on ${dev.label.toLowerCase()}.`));
        if(r.kind==='axonFeedback'&&dev){const dm=MODELS[dev.model];if(dev.kind!=='servo'&&dev.kind!=='crservo')out.push(problem('amber',[r.key],`${r.label}: the feedback wire comes from an Axon servo, and ${dev.label.toLowerCase()} runs on ${A_KIND[dev.kind]||dev.kind}.`));
          else if(dm&&dm.feedback!=='analog')out.push(problem('amber',[r.key],`${r.label}: ${dm.short} has no feedback wire; pick an Axon for ${dev.label.toLowerCase()}, or another sensor.`));}
        if(r.hub&&r.channels==='odd'&&r.port%2===0)out.push(problem('red',[r.key],`${r.label} is on ${portLabel(r,r.family,w)}; it reads only on odd digital channels (1, 3, 5 and 7).`));
        if(r.hub&&r.channels==='even'&&r.port%2===1)out.push(problem('red',[r.key],`${r.label} is on ${portLabel(r,r.family,w)}; it reads only on even analog channels (0 and 2).`));
        if(r.hub&&r.fast&&!HUBS[r.hub]?.fastEncoders?.includes(r.port))out.push(problem('amber',[r.key],`${r.label} is on ${portLabel(r,r.family,w)}: ports 1 and 2 count in software and can miss counts from a Through Bore. Use encoder port 0 or 3.`));}
      const needs=role?.needs?.[r.kind];if(needs&&!list.some(s=>s.for===r.key&&needs.includes(s.kind))&&!w.sensors.some(s=>s.for===r.key&&needs.includes(SENSOR_MODELS[s.model]?.kind)))
        out.push(problem('amber',[r.key],`${r.label} turns on a continuous servo: give it a sensor that tells where it is (an Axon’s feedback wire or an absolute encoder), or it can only run for set times.`));}
    for(const s of w.sensors)if(!keys.has(`sensor.${s.id}`)&&SENSOR_MODELS[s.model]?.kind!=='motorEncoder'&&!list.some(r=>r.key===s.for)&&list.length)out.push(problem('amber',[`sensor.${s.id}`],`Sensor "${s.id}" measures a device this robot no longer has.`));
    // BIOBUZZ R503: 8 motors and 8 servos at most.
    const motors=list.filter(r=>r.family==='motor'&&r.role!=='pod'&&r.role!=='sensor'),servos=list.filter(r=>r.family==='servo');
    if(motors.length>8)out.push(problem('amber',motors.map(r=>r.key),`The robot has ${motors.length} motors; the game allows 8 (R503).`));if(servos.length>8)out.push(problem('amber',servos.map(r=>r.key),`The robot has ${servos.length} servos; the game allows 8 (R503).`));
    const seen=new Set(out.map(p=>p.text));for(const p of plan(list,w).problems)if(!seen.has(p.text)){seen.add(p.text);out.push(p);}
    return out;
  }
  // The export's device list (DeckSimFtc.robotNeeds rows) with what Setup says of each: wired {hub, port|bus} and the
  // model with its configuration tag, for RobotConfig.check (moved, retype) and RobotConfig.planPorts (wired first).
  function wire(needs,wiring){const w=sanitizeWiring(wiring)||EMPTY();return (needs||[]).map(n=>{const e=w.devices[settingKey(n.setting)];if(!e)return n;
    return {...n,...(e.hub?{wired:{hub:e.hub,...(e.bus!==undefined?{bus:e.bus}:{port:e.port})}}:{}),...(e.model?{model:e.model,xmlType:MODELS[e.model].xmlType}:{})};});}
  // Rows (from placed(), so a sensor read through a motor's name is known) as RobotConfig.check needs them: every device
  // the robot's configuration must have under its name, sensors included; wired only where the team put it.
  const needs=rowList=>(rowList||[]).filter(r=>r.need&&r.name&&!r.via&&r.kind!=='motorEncoder').map(r=>({name:r.name,need:r.need,device:r.device,label:r.label,setting:r.setting||(r.role==='sensor'?{sensor:r.id}:undefined),
    ...(r.hub&&r.wired===true?{wired:{hub:r.hub,...(r.bus!==undefined?{bus:r.bus}:{port:r.port})}}:{}),...(r.model&&r.xmlType?{model:r.model,xmlType:r.xmlType}:{}),...(r.channels?{channels:r.channels}:{}),...(r.fast?{fast:true}:{}),...(r.pwm?{pwm:r.pwm}:{})}));
  // ---- plain words ----------------------------------------------------------------------------------------------------
  const lower=s=>String(s||'').replace(/^[A-Z](?![A-Z])/,c=>c.toLowerCase());
  // One sentence on a row: what it is, where it is plugged in, and what its sensors tell ("Axon MAX on Control Hub servo
  // port 2; its feedback wire on analog port 0 tells where shooter 1 hood is."). Pass rows from placed() for planned ports.
  function explain(row,wiring){
    if(!row)return '';const w=wiring?sanitizeWiring(wiring)||EMPTY():null,md=MODELS[row.model],sm=SENSOR_MODELS[row.model],where=row.hub?portLabel(row,row.family,w):'',at=where?` on ${where}`:': Deck picks its port';
    if(row.role==='imu')return `${row.label} "${row.name}": the Control Hub’s own IMU, on I2C bus 0. It tells which way the robot faces.`;
    if(row.role==='sensor'){const what=lower(String(row.label).split(':')[0]),via=row.via?` It is read through "${row.via}", the motor on that port.`:'';
      return `${sm?.short||'Sensor'} "${row.name}"${at}. It tells ${(TELLS[row.use]||TELLS.position)(what)}.${via}`;}
    const thing=row.role==='pod'?'Odometry pod':md?.short||{dcmotor:'Motor',servo:'Servo',crservo:'Continuous servo',linear:'Linear servo',pinpoint:'goBILDA Pinpoint',otos:'SparkFun OTOS'}[row.kind]||'Device';
    const tells=(row.sensors||[]).filter(s=>SENSOR_MODELS[s.model]).map(s=>{const k=SENSOR_MODELS[s.model],how=(TELLS[s.use]||TELLS.position)(lower(row.label)),on=!s.hub?'':s.hub===row.hub&&k.family!=='i2c'?` on ${FAMILIES[k.family]} ${s.port}`:` on ${portLabel(s,k.family,w)}`;
      return k.kind==='motorEncoder'?`its encoder tells ${how}`:k.kind==='axonFeedback'?`its feedback wire${on} tells ${how}`:`a ${lower(k.short)}${on} tells ${how}`;});
    return `${thing} "${row.name}"${at}${tells.length?'; '+tells.join('; '):''}.${ROLES[row.role]?.explain&&!row.hub&&!tells.length?' '+ROLES[row.role].explain:''}`;
  }
  return {HUBS,FAMILIES,MODELS,ACTUATORS,MOTORS,SERVOS,CRSERVOS,LINEARS,SENSORS,SENSOR_MODELS,ROLES,USES,DEVICE_KEYS,DRIVE_SLOTS,modelsFor,sensorsFor,xmlTypeOf,familyOfKind,
    fromCadName,assignCad,settingKey,parseKey,sanitizeWiring,wiringOf,reindex,prune,hubName,portLabel,rows,plan,placed,conflicts,wire,needs,explain};
});
