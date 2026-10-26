'use strict';
// Mechanisms (intake, storage, indexer, shooter, turret): the shared settings and action vocabulary,
// the feed-cycle timing the simulator and robot code share, the generated Control Hub Java and
// MotionModule Python, and real BIOBUZZ runs where pieces are picked up, launched and scored.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const Mech=require('../ui/sim-mechanisms.js'),P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),F=require('../ui/sim-ftc.js'),MM=require('../ui/sim-motionmodule.js'),Timed=require('../ui/sim-timed.js'),D=require('../tools/deck-sim.cjs'),{SimEngine}=require('../src/sim-engine.cjs');
const root=path.join(__dirname,'..'),built=fs.existsSync(path.join(root,'sim-runtime/dsim-host.cjs'))&&fs.existsSync(path.join(root,'sim-runtime/driver/classes/deck/sim/hub/VirtualHub.class'));
const python=[process.env.DECK_PYTHON,path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),'python3','python'].find(p=>p&&spawnSync(p,['-c','import sys;assert sys.version_info>=(3,9)'],{windowsHide:true}).status===0);
const on=(extra={})=>Mech.sanitize({enabled:true,...extra});
const robot={drivetrain:'mecanum',length:17,width:17,heightIn:12,driveRpm:312,intakeIn:0},start={x:9.83,y:27,heading:0};
// Spin up on the way out, shoot every preload at the first pin, sweep the red garden, shoot again.
const pins=[{x:24,y:30,action:'Shoot',path:{kind:'action',action:'Spin up'}},{x:22,y:20,path:{rotate:'turn',heading:-90,style:'spline'}},
  {x:16,y:12.5,wait:.6,action:'Intake',path:{kind:'action',action:'Intake',style:'sharp'}},{x:24,y:24,path:{style:'sharp'}},{x:36,y:28,action:'Shoot',path:{kind:'action',action:'Spin up',style:'spline'}}];

test('settings are sanitized for BIOBUZZ: parts, capacity and preloads; route action names map to mechanism commands',()=>{
  // An older single-intake, single-shooter save still loads as parts.
  const m=Mech.sanitize({enabled:true,storage:9,preload:7,intake:{side:'everywhere',motor:'bad name!'},shooter:{type:'fixed',mount:'center',hood:10},turret:{min:-500,max:500}});
  assert.equal(m.storage,4,'BIOBUZZ robots hold at most 4');assert.deepEqual(m.capacity,{pollen:4,nectar:0});assert.deepEqual(m.preload,{pollen:4});
  assert.deepEqual(m.intakes,[{kind:'sweeper',sides:['front'],reach:0,width:null,height:4,motor:'intake',power:1}]);assert.deepEqual([m.shooters[0].type,m.shooters[0].mount,m.shooters[0].facing],['fixed','center','front']);
  assert.equal(m.shooter.hood,70);assert.deepEqual([m.turret.min,m.turret.max],[-180,180]);
  assert.deepEqual(Mech.engineSpec(m).bbMech.launcher,{kind:'turret',mount:'center',hoodDeg:70},'every shooter fires one piece at a time');assert.equal(Mech.engineSpec(on()).scoreMode,'turret');
  assert.deepEqual(Mech.sanitize({enabled:true,intake:{side:'all'}}).intakes[0].sides,['front','back','left','right']);
  // Two shooters keep what each shoots, but never sit in the center or next to each other.
  const two=Mech.sanitize({enabled:true,shooters:[{type:'fixed',pieces:'nectar',mount:'center'},{type:'turret',pieces:'pollen',mount:'center'},{type:'turret'}],capacity:{pollen:3,nectar:3},preload:{pollen:9}});
  assert.deepEqual(two.shooters.map(s=>[s.type,s.pieces,s.mount]),[['fixed','nectar','front'],['turret','pollen','back']],'each keeps what it shoots; they move apart');
  assert.deepEqual([two.capacity,two.storage],[{pollen:3,nectar:3},4],'each kind has its own limit, 4 together');assert.deepEqual(two.preload,{pollen:3});
  assert.deepEqual(Mech.engineSpec(two).bbMech.launcher,{kind:'twinturret',mount:'front',mount2:'back',hoodDeg:75});
  assert.equal(Mech.sanitize({enabled:true,shooters:[{pieces:'pollen'}],capacity:{pollen:2,nectar:2}}).capacity.nectar,0,'nectar needs a shooter that takes it');
  // Intakes on any mix of sides; each side belongs to one intake.
  const mixed=Mech.sanitize({enabled:true,intakes:[{sides:['front','left']},{sides:['left','back'],kind:'ramp'}]});
  assert.deepEqual(mixed.intakes.map(i=>[i.sides,i.motor,i.kind]),[[['front','left'],'intake','sweeper'],[['back'],'intake2','ramp']]);
  assert.equal(Mech.engineIntakeMount(mixed),'edges:front,back,left');assert.equal(Mech.engineIntakeMount(on()),null);
  assert.deepEqual(Mech.locate({x:8,y:-7},17,17),{mount:'frontright',edge:'front'});assert.deepEqual(Mech.locate({x:-1,y:8},17,17),{mount:'left',edge:'left'});
  assert.deepEqual(['Intake','spin up','Aim','Shoot','Shoot 3','Park',''].map(n=>Mech.action(n)),[{kind:'intake'},{kind:'spin'},{kind:'aim'},{kind:'shoot',count:0},{kind:'shoot',count:3},{kind:'custom'},{kind:'none'}]);
  assert.deepEqual(Mech.actions(on({storage:2})),['Intake','Spin up','Aim','Shoot'],'one Shoot: a time on the pin or path sets how long');assert.deepEqual(Mech.actions(Mech.sanitize({})),[]);
  assert.deepEqual(Mech.target(on(),'biobuzz','red'),{x:59.25,y:72-15.519*Math.cos(Math.PI/6)});assert.ok(Mech.target(on(),'biobuzz','blue').y>72);
  // A fixed shooter faces the target at Shoot pins and along shooting paths that set no heading.
  const t={x:60,y:58},ready=Mech.prepare([{x:1,y:1,action:'Shoot'},{x:2,y:2,action:'Shoot',turn:45,turnMode:'absolute'},{x:3,y:3,path:{kind:'action',action:'Shoot 2'}}],on({shooter:{type:'fixed'}}),t);
  assert.deepEqual([ready[0].turnMode,ready[0].target,ready[1].turn,ready[2].path.rotate],['track',t,45,'track']);assert.equal(Mech.prepare(pins,on(),t),pins,'turrets aim themselves');
  const side=Mech.prepare([{x:0,y:0,action:'Shoot'}],on({shooters:[{type:'fixed',facing:'left'}]}),{x:10,y:10})[0];assert.deepEqual([side.turn,side.turnMode],[-45,'absolute'],'a left-firing shooter turns its left side to the target');
});

test('Shoot 3 fires a staged piece as soon as it is spun up and aimed, then one per indexing time; pieces queue by transfer time',()=>{
  const m=on({indexer:{seconds:.4},shooter:{spinUp:.5},turret:{speed:90}}),model=new Mech.Model(m,4),runner=new Mech.Runner(m),dt=1/60;let held=4,time=0,busy=true,fires=[];
  while(busy&&time<10){const step=runner.commands({name:'Shoot 3',leg:0,moving:false},model.state(),time);busy=step.busy;const out=model.tick(dt,step.cmd,{pose:{x:30,y:20,heading:0},target:{x:60,y:58},held});if(out.fire){fires.push(+time.toFixed(2));held--;}time+=dt;}
  assert.equal(fires.length,3);assert.equal(held,1);assert.equal(model.state().shots,3);
  assert.ok(fires[0]>=.5-.05&&fires[0]<.5+.1,'a preload in the shooter fires once spun up: '+fires);assert.ok(fires[1]-fires[0]>=.4-.05&&fires[2]-fires[1]>=.4-.05,'each next piece needs the indexing time: '+fires);
  assert.deepEqual([0,1,2,3].map(k=>Mech.travel(Mech.sanitize({enabled:true,transfer:{seconds:2}}),k)),[2,1.5,1,.5],'later pieces stop behind earlier ones sooner');
  assert.ok(Math.abs(model.state().turret-Math.atan2(38,30)*180/Math.PI)<=2,'the turret turned to the target');
  // Intake runs only while its action runs; Spin up keeps the flywheel going until a shot finishes.
  const r2=new Mech.Runner(m);assert.equal(r2.commands({name:'Intake',leg:1,moving:true},model.state(),0).cmd.intake,true);assert.equal(r2.commands(null,model.state(),0).cmd.intake,false);
  r2.commands({name:'Spin up',leg:2,moving:true},model.state(),0);assert.equal(r2.commands(null,model.state(),0).cmd.spin,true);
});

test('the Control Hub export runs the mechanisms itself; RobotActions keeps only the team\'s own actions',()=>{
  const m=on({intake:{motor:'roller'},indexer:{kind:'crservo',name:'feeder'},shooter:{rpm:4200,ticksPerRev:28},turret:{ticksPerDegree:3}}),layout={name:'Mech test',start,zones:[]},route=P.plan({start,zones:[],pins:[...pins,{x:30,y:40,action:'Park'}],clearance:2,style:'spline'},{front:8.5,rear:8.5,half:8.5});
  const out=F.files({route,layout,tuning:{},robot,localization:'fused',mechanisms:m,target:{x:59.25,y:58.56},routeJava:X.java(route,layout,{polygon:P.polygon})}),dir='org/firstinspires/ftc/teamcode/';
  const mech=out.files[dir+'Mechanisms.java'],route_=out.files[dir+'RouteActions.java'],team=out.files[dir+'RobotActions.java'];
  assert.match(mech,/INTAKE_1 = "roller";/);assert.match(mech,/FLYWHEEL_1 = "shooter";/);assert.match(mech,/FEEDER_1 = "feeder";/);assert.match(mech,/TURRET_1 = "turret";/);assert.match(mech,/FLYWHEEL_TICKS_PER_SECOND = 1960\.0/);assert.match(mech,/TURRET_TICKS_PER_DEGREE = 3\.0/);assert.match(mech,/flywheel1\.setVelocity\(speed\)/);
  // Rollers and roller feeders are DcMotorSimple, so the code runs whether the robot has a motor or a continuous servo there.
  assert.match(mech,/feeder1 = map\.get\(DcMotorSimple\.class, FEEDER_1\);\n\s+feeder1\.setDirection\(direction\(FEEDER_1_REVERSED\)\)/);assert.match(mech,/intake1 = map\.get\(DcMotorSimple\.class, INTAKE_1\)/);
  assert.match(route_,/public boolean shoot\(Step step\) \{\n\s+return mech\.shoot\(0, step\);/);assert.match(route_,/mech\.intake\(!done\)/);assert.match(route_,/mech\.init\(hardwareMap\)/);
  assert.match(team,/public boolean park\(Step step\)/);assert.doesNotMatch(team,/^\s*public boolean (shoot|intake|spinUp)\(/m,'built-in actions are not team methods');assert.match(team,/super\.stop\(\)/);
  assert.match(team,/\/\/ +@Override\n\s+\/\/ +public boolean shoot\(Step step\) \{/,'the team file shows how to override a built-in action');
  assert.deepEqual(out.hardware.mechanisms,{intakes:[{name:'roller',kind:'motor',mount:1,part:0}],shooters:[{flywheels:[{name:'shooter',mount:1}],ticksPerSecond:1960,indexer:{name:'feeder',kind:'crservo',mount:1},turret:{name:'turret',kind:'motor',ticksPerDegree:3,mount:1}}]});
  // Two intakes and two shooters: one device list each; a fixed shooter has no turret motor.
  const both=F.files({route,layout,tuning:{},robot,localization:'fused',mechanisms:on({intakes:[{sides:['front']},{sides:['back']}],shooters:[{type:'turret'},{type:'fixed',pieces:'nectar',mount:'back'}],capacity:{pollen:2,nectar:2}}),target:{x:59.25,y:58.56},routeJava:X.java(route,layout,{polygon:P.polygon})}).files[dir+'Mechanisms.java'];
  assert.match(both,/INTAKE_1 = "intake";[\s\S]*INTAKE_2 = "intake2";/);assert.match(both,/FLYWHEEL_1 = "shooter";[\s\S]*FLYWHEEL_2 = "shooter2";/);assert.match(both,/FEEDER_1 = "indexer";[\s\S]*FEEDER_2 = "indexer2";/);
  assert.match(both,/TURRET_1 = "turret";/);assert.doesNotMatch(both,/TURRET_2 =/,'a fixed shooter has no turret motor');assert.match(both,/Shooter 2 \(nectar\): fixed at the back, firing toward the front/);
  const one=F.onBotJava({route,layout,tuning:{},robot,localization:'fused',mechanisms:m,target:{x:59.25,y:58.56},routeJava:X.java(route,layout,{polygon:P.polygon})});
  assert.match(one.source,/public static class Mechanisms \{/);assert.match(one.source,/DeckFollower\.Pose pose/);assert.doesNotMatch(one.source,/^import deck\./m);
  // Without mechanisms the export is unchanged: no Mechanisms file, placeholder slots.
  const plain=F.files({route,layout,tuning:{},robot,localization:'fused',routeJava:X.java(route,layout,{polygon:P.polygon})});assert.equal(plain.files[dir+'Mechanisms.java'],undefined);assert.match(plain.files[dir+'RobotActions.java'],/public boolean shoot\(Step step\)/);
});

test('the MotionModule export runs the mechanisms on its own outputs and aims the turret from the plan',()=>{
  const m=on(),route=P.plan({start,zones:[],pins,clearance:2,style:'spline'},{front:8.5,rear:8.5,half:8.5}),timing=Timed.settings({}),source=MM.autonomous(route,timing,{name:'Mech',mechanisms:m,target:{x:59.25,y:58.56}}),actions=MM.actionsFile(route,{name:'Mech',mechanisms:m});
  assert.match(source,/^class Mechanisms:/m);assert.match(source,/BUILT_IN = \{"spin_up", "shoot", "intake"\}/);assert.match(source,/return MECHANISMS\.run\("shoot", 0, step\)/);assert.match(source,/^AIMS = \{\d+: /m);
  assert.doesNotMatch(actions,/def shoot\(|def intake\(/);assert.deepEqual(MM.mechanismHardware(m),{intakes:[{channel:5,servo:false,mount:1,part:0}],shooters:[{indexer:{channel:6,servo:false,mount:1},flywheels:[{channel:7,mount:1}],turret:{servo:0,center:90,perDegree:1,mount:1}}]});
  // MotionModule has four free motor channels (5-8): a fifth mechanism motor is called out in the code.
  const big=on({intakes:[{sides:['front']},{sides:['back']}],shooters:[{type:'turret'},{type:'fixed',pieces:'nectar',mount:'back'}],capacity:{pollen:2,nectar:2}});
  assert.equal(MM.motorsOver(big),2);assert.match(MM.autonomous(route,timing,{name:'Big',mechanisms:big,target:{x:59.25,y:58.56}}),/need 2 more/);
  assert.doesNotMatch(MM.autonomous(route,timing,{name:'Plain'}),/^class Mechanisms:/m);
  if(python){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-mm-mech-'));fs.writeFileSync(path.join(dir,'autonomous.py'),source);fs.writeFileSync(path.join(dir,'robot_actions.py'),actions);
    const r=spawnSync(python,['-m','py_compile',path.join(dir,'autonomous.py'),path.join(dir,'robot_actions.py')],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);}
});

test('BIOBUZZ: the planned route and its exported OnBot Java pick up, launch and score the same pieces',{skip:!built&&'run node tools/simulation/build.cjs first'},async()=>{
  const runs=[];
  for(const code of [null,'onbot']){
    const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-mech-')),now:()=>0,emit:msg=>{if(msg?.state==='error')e.lastError=msg.error;}});
    try{const m=on(),info=await e.load({field:'biobuzz',alliance:'red',mechanisms:m,start,robot,sensors:{localization:'fused'}});
      assert.equal(e.world.robots[0].hopper.length,4,'starts with the 4 preloaded pollen');
      const route=P.plan({start,zones:[],pins,clearance:2,style:'spline',defaultPower:1},info.footprint,info.fieldZones,info.bounds);route.defaultPower=1;
      if(code){const layout={name:'Mech',start,zones:[]},out=F.onBotJava({route,layout,tuning:info.tuning,robot:info.robot,localization:'fused',mechanisms:info.mechanisms,target:info.target,routeJava:X.java(route,layout,{polygon:P.polygon})});
        assert.equal((await e.run({kind:'opmode',files:out.files,opMode:out.opMode})).ok,true,e.lastError);for(let i=0;i<3600&&e.mode==='program'&&e.telemetry?.Phase!=='Done';i++)await e.programTick();}
      else{assert.equal((await e.run({kind:'route',route})).ok,true);for(let i=0;i<3600&&e.mode==='program';i++)await e.programTick();}
      const s=e.mechanismState();runs.push(s);assert.equal(e.violations?.size||0,0);
      assert.ok(s.shots>=5,`${code||'route'}: launched the 4 preloads and garden pollen (${s.shots} shots)`);assert.equal(s.held,0);assert.ok(s.tips>=1&&s.score>=20,`${code||'route'}: tipped the red hive (${s.score} points)`);
    }finally{e.dispose();}
  }
  assert.equal(runs[0].shots,runs[1].shots,'the exported code shoots exactly what the simulator planned');
});

test('a turret aimed away from the hive misses: where it points is physical',{skip:!built&&'run node tools/simulation/build.cjs first'},async()=>{
  const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-miss-')),now:()=>0,emit:()=>{}});
  try{await e.load({field:'biobuzz',alliance:'red',mechanisms:on({target:{x:20,y:120}}),start,robot,sensors:{localization:'fused'}});
    const route=P.plan({start,zones:[],pins:[pins[0]],clearance:2,style:'spline',defaultPower:1},e.info.footprint,e.info.fieldZones,e.info.bounds);await e.run({kind:'route',route});
    for(let i=0;i<3600&&e.mode==='program';i++)await e.programTick();for(let i=0;i<240;i++)e.tick({forward:0,strafe:0,turn:0});
    const s=e.mechanismState();assert.equal(s.shots,4);assert.equal(s.score,0);assert.equal(s.tips,0);
  }finally{e.dispose();}
});

test('the terminal sets mechanisms and the alliance in plain flags',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-cli-mech-')),file=path.join(dir,'m.json'),out=[],log=console.log;console.log=(...a)=>out.push(a.join(' '));
  try{await D.main(['new',file,'--field','biobuzz','--alliance','blue']);await D.main(['mech',file,'--shooter','fixed','--mount','back','--spin-up','1.2','--index-seconds','0.5','--intake-side','frontback']);
    await assert.rejects(D.main(['mech',file,'--intake','vacuum']),/--intake is one of/);await D.main(['alliance',file,'red']);
  }finally{console.log=log;}
  const s=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(s.mechanisms.enabled,true);assert.deepEqual([s.mechanisms.shooters[0].type,s.mechanisms.shooters[0].mount],['fixed','back']);assert.equal(s.mechanisms.shooter.spinUp,1.2);assert.equal(s.mechanisms.indexer.seconds,.5);assert.deepEqual(s.mechanisms.intakes[0].sides,['front','back']);assert.equal(s.layouts[0].alliance,'red');
  console.log=(...a)=>out.push(a.join(' '));
  try{await D.main(['mech',file,'--intakes','front+left:sweeper,back:ramp','--shooters','turret@center:pollen,fixed@back>back:nectar','--pollen','2','--nectar','2','--preload','2']);
    await assert.rejects(D.main(['mech',file,'--shooters','cannon@front']),/--shooters entries/);}finally{console.log=log;}
  const t=JSON.parse(fs.readFileSync(file,'utf8')).mechanisms;assert.deepEqual(t.intakes.map(i=>[i.sides,i.kind]),[[['front','left'],'sweeper'],[['back'],'ramp']]);
  assert.deepEqual(t.shooters.map(x=>[x.type,x.mount,x.facing,x.pieces]),[['turret','front','front','pollen'],['fixed','back','back','nectar']]);assert.deepEqual([t.capacity,t.preload],[{pollen:2,nectar:2},{pollen:2}]);
  assert.match(out.join('\n'),/Shooter 1: fixed, firing front at back · pollen/);
});

test('run analysis counts pieces picked up, shot and landed; the run becomes a WPILOG AdvantageScope reads',()=>{
  const Data=require('../ui/sim-data.js'),W=require('../ui/sim-wpilog.js');
  const frame=(time,x,extra={})=>({time,mode:'program',truth:{x,y:72,heading:0,vx:10,vy:0,omega:0},estimate:{x,y:72.5,heading:0},command:{forward:1,strafe:0,turn:0},violations:[],practice:{phase:'auto'},
    mechanisms:{flywheel:.5,turret:30,held:1,shots:3,landed:2,pickedUp:2,score:20,tips:1,aligned:true,command:{intake:true,feed:false}},fieldState:{balls:[{id:1,color:'yellow',pos:{x:0,y:-60},state:{kind:'ground'}},{id:2,color:'yellow',pos:{x:1,y:1},state:{kind:'held'}}]},...extra});
  const frames=[frame(10,72),frame(11,82)],a=Data.analysis(frames);
  assert.deepEqual([a.time,a.pickedUp,a.shots,a.landed,a.accuracy,a.tips,a.score],[1,2,3,2,67,1,20]);assert.deepEqual(Data.rows(a).find(r=>r[0]==='Landed in the hive'),['Landed in the hive','2 of 3 (67%)']);
  const bytes=W.fromFrames(frames,{alliance:'red',mechanisms:on(),robot:{length:17,width:17}}),buf=Buffer.from(bytes);
  assert.equal(buf.toString('ascii',0,6),'WPILOG');assert.equal(buf.readUInt16LE(6),0x0100);
  // Decode every record: entry starts, then data sized to their types.
  let p=12+buf.readUInt32LE(8);const entries={},values={};
  while(p<buf.length){const bf=buf[p++],read=n=>{let v=0;for(let i=0;i<n;i++)v+=buf[p+i]*2**(8*i);p+=n;return v;},e=read((bf&3)+1),size=read(((bf>>2)&3)+1),t=read(((bf>>4)&7)+1),d=buf.subarray(p,p+size);p+=size;
    if(e===0&&d[0]===0){const n=d.readUInt32LE(5),name=d.toString('utf8',9,9+n),tl=d.readUInt32LE(9+n);entries[d.readUInt32LE(1)]={name,type:d.toString('utf8',13+n,13+n+tl)};}else(values[entries[e].name]??=[]).push({t,d});}
  assert.equal(p,buf.length);const types=Object.fromEntries(Object.values(entries).map(x=>[x.name,x.type]));
  assert.equal(types['/RealOutputs/Odometry/Robot'],'struct:Pose2d');assert.equal(types['/RealOutputs/GamePieces/Pollen'],'struct:Translation3d[]');assert.equal(types['/DriverStation/Autonomous'],'boolean');assert.equal(types['/.schema/struct:Pose2d'],'structschema');
  assert.equal(values['/RealOutputs/Mechanism/.type'][0].d.toString(),'Mechanism2d');
  // FTC center/rotated frame: 10 in to the right of the field centre is +Y in AdvantageScope, heading 0 points up (+90°).
  const second=values['/RealOutputs/Odometry/Robot'][1].d;assert.ok(Math.abs(second.readDoubleLE(0))<1e-9);assert.ok(Math.abs(second.readDoubleLE(8)-.254)<1e-9);assert.ok(Math.abs(second.readDoubleLE(16)-Math.PI/2)<1e-9);
  assert.equal(values['/RealOutputs/Odometry/Robot'][1].t,1e6,'timestamps in microseconds from the start');
  assert.equal(values['/RealOutputs/GamePieces/Pollen'][0].d.length,24,'one free pollen; held ones ride in the robot');
});

test('the Data tab graphs recorded values over the run, with gaps where a value was not recorded',()=>{
  const Data=require('../ui/sim-data.js'),signal=k=>Data.SIGNALS.find(s=>s.key===k);
  const frames=Array.from({length:1001},(_,i)=>({time:5+i/100,truth:{x:i/10,y:72,heading:190,vx:3,vy:4,omega:0},estimate:i<500?{x:i/10+1,y:72,heading:190}:null,command:{forward:.5,strafe:0,turn:0}}));
  const speed=Data.series(frames,signal('speed'),100);
  assert.ok(speed.length<=101,'thinned to about the requested number of points');assert.deepEqual(speed[0],[0,5]);assert.ok(Math.abs(speed.at(-1)[0]-10)<1e-9,'ends at the last frame');
  assert.equal(Data.series(frames,signal('heading'))[0][1],-170,'heading wrapped to ±180');
  const error=Data.series(frames,signal('error'));assert.equal(error[0][1],1);assert.equal(error.at(-1)[1],null,'no estimate, no value');
  assert.ok(Data.series(frames,signal('flywheel')).every(p=>p[1]===null),'no mechanisms recorded');
});

test('a shooter with no intake: no Intake action, and the robot code has no intake motor',()=>{
  const m=on({intake:{enabled:false}});assert.equal(m.intake.enabled,false);assert.deepEqual(Mech.actions(m).slice(0,2),['Spin up','Aim']);
  const r=new Mech.Runner(m);assert.equal(r.commands({name:'Intake',leg:0,moving:true},new Mech.Model(m).state(),0).cmd.intake,false);
  const route=P.plan({start,zones:[],pins:[{x:30,y:30,action:'Shoot'}],clearance:2},{front:8.5,rear:8.5,half:8.5}),layout={name:'No intake',start,zones:[]};
  const out=F.files({route,layout,tuning:{},robot,localization:'fused',mechanisms:m,target:{x:59,y:58},routeJava:X.java(route,layout,{polygon:P.polygon})}),mech=out.files['org/firstinspires/ftc/teamcode/Mechanisms.java'];
  assert.doesNotMatch(mech,/INTAKE_1 =|intake1/);assert.equal(out.hardware.mechanisms.intakes,undefined);
  assert.equal(MM.mechanismHardware(m).intakes,undefined);assert.match(MM.autonomous(route,Timed.settings({}),{mechanisms:m,target:{x:59,y:58}}),/INTAKES = \[\]/);
});
test('an all-around intake catches pieces with any edge; a front intake only with its front',{skip:!built&&'run node tools/simulation/build.cjs first'},async()=>{
  const caught={};
  for(const side of ['front','all']){const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-sides-')),now:()=>0,emit:()=>{}});
    try{await e.load({field:'biobuzz',alliance:'red',mechanisms:on({preload:0,intake:{side}}),start:{x:12,y:22,heading:90},robot,sensors:{localization:'fused'}});
      e.mechCmd={intake:true,spin:false,aim:false,feed:false};for(let i=0;i<180;i++)e.tick({forward:-.35,strafe:0,turn:0});for(let i=0;i<60;i++)e.tick({forward:0,strafe:0,turn:0});caught[side]=e.world.robots[0].hopper.length;}finally{e.dispose();}}
  assert.equal(caught.front,0,'backing into pollen with a front intake');assert.ok(caught.all>=3,'backing into pollen with an all-around intake: '+caught.all);
});

test('intakes on a mix of sides catch with those sides only, and stop at the pollen capacity',{skip:!built&&'run node tools/simulation/build.cjs first'},async()=>{
  const caught={};
  for(const [name,mech] of [['left',{intakes:[{sides:['left']}]}],['back+left',{intakes:[{sides:['front']},{sides:['back','left']}]}],['capped',{intakes:[{sides:['back']}],capacity:{pollen:2}}]]){
    const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-mix-')),now:()=>0,emit:()=>{}});
    try{await e.load({field:'biobuzz',alliance:'red',mechanisms:on({preload:{pollen:0},...mech}),start:{x:12,y:22,heading:90},robot,sensors:{localization:'fused'}});
      assert.equal(e.world.robots[0].spec.deckCaps.pollen,mech.capacity?.pollen??4);
      e.mechCmd={intake:true,spin:false,aim:false,feed:false};for(let i=0;i<180;i++)e.tick({forward:-.35,strafe:0,turn:0});for(let i=0;i<60;i++)e.tick({forward:0,strafe:0,turn:0});caught[name]=e.world.robots[0].hopper.length;}finally{e.dispose();}}
  assert.equal(caught.left,0,'backing into pollen with only a left intake');assert.ok(caught['back+left']>=3,'a second intake on the back catches: '+caught['back+left']);assert.equal(caught.capped,2,'pollen capacity 2');
});

test('two shooters (a turret and a fixed nectar shooter) and two intakes: the exported OnBot Java runs them like the simulator',{skip:!built&&'run node tools/simulation/build.cjs first'},async()=>{
  const runs=[],m=on({intakes:[{sides:['front']},{sides:['back']}],shooters:[{type:'turret',pieces:'pollen',mount:'front'},{type:'fixed',pieces:'nectar',mount:'back',facing:'back',indexerKind:'crservo'}],capacity:{pollen:3,nectar:1},preload:{pollen:3}});
  for(const code of [null,'onbot']){
    const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-two-')),now:()=>0,emit:msg=>{if(msg?.state==='error')e.lastError=msg.error;}});
    try{const info=await e.load({field:'biobuzz',alliance:'red',mechanisms:m,start,robot,sensors:{localization:'fused'}});assert.equal(e.world.robots[0].hopper.length,3);
      const route=P.plan({start,zones:[],pins:[pins[0]],clearance:2,style:'spline',defaultPower:1},info.footprint,info.fieldZones,info.bounds);route.defaultPower=1;
      if(code){const layout={name:'Two',start,zones:[]},out=F.onBotJava({route,layout,tuning:info.tuning,robot:info.robot,localization:'fused',mechanisms:info.mechanisms,target:info.target,routeJava:X.java(route,layout,{polygon:P.polygon})});
        assert.equal((await e.run({kind:'opmode',files:out.files,opMode:out.opMode})).ok,true,e.lastError);for(let i=0;i<3600&&e.mode==='program'&&e.telemetry?.Phase!=='Done';i++)await e.programTick();}
      else{assert.equal((await e.run({kind:'route',route})).ok,true);for(let i=0;i<3600&&e.mode==='program';i++)await e.programTick();}
      for(let i=0;i<240;i++)e.tick({forward:0,strafe:0,turn:0});const s=e.mechanismState();runs.push(s);assert.equal(s.shots,3,`${code||'route'} shots`);assert.ok(s.landed>=2,`${code||'route'}: ${s.landed} landed`);
    }finally{e.dispose();}
  }
  assert.equal(runs[0].landed,runs[1].landed);
});

test('teleop practice: right trigger shoots, right bumper intakes, and nothing runs until the sticks are centred',{skip:!built&&'run node tools/simulation/build.cjs first'},async()=>{
  const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-teleop-')),now:()=>0,emit:()=>{}}),pad=(buttons={},axes=[0,0,0,0])=>({mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:!!buttons[i],value:buttons[i]?1:0}))});
  try{await e.load({field:'biobuzz',alliance:'red',mechanisms:on(),start:{x:30,y:24,heading:90},robot,sensors:{localization:'fused'}});
    await e.startPractice({mode:'teleop',timing:{autoSeconds:30,transitionSeconds:8,teleopSeconds:120}});
    e.practiceInput(pad({7:true},[0,-1,0,0]));await e.practiceTick();assert.equal(e.mechCmd.feed,false,'held trigger with a deflected stick does not shoot before the sticks are centred');
    e.practiceInput(pad());await e.practiceTick();
    for(let i=0;i<420;i++){e.practiceInput(pad({7:true}));await e.practiceTick();}
    const s=e.mechanismState();assert.ok(s.shots>=3,'shots: '+s.shots);assert.equal(e.mechCmd.feed,true);
    e.practiceInput(pad({5:true}));await e.practiceTick();assert.deepEqual([e.mechCmd.intake,e.mechCmd.feed],[true,false]);
  }finally{e.dispose();}
});

test('at a pin the robot pauses, then runs the action for its set time, then drives on; a path action can run for part of the path',async()=>{
  const route=P.plan({start,zones:[],pins:[{x:40,y:30,wait:.5,action:'Shoot',actionSeconds:1},{x:70,y:30,path:{kind:'action',action:'Intake',actionSeconds:.6}}],clearance:2},{front:8.5,rear:8.5,half:8.5});
  const legs=X.legs(route);assert.deepEqual([legs[0].wait,legs[0].action,legs[0].actionSeconds],[.5,'Shoot',1]);assert.equal(legs[1].moving.seconds,.6);
  assert.equal(P.pinEffects({x:1,y:1,wait:2,action:'Intake'}).actionSeconds,2,'older routes ran the intake for the pause');
  const java=X.java(route,{name:'Timed actions',start,zones:[]},{polygon:P.polygon});assert.match(java,/ACTION_SECONDS = \{1, 0\}/);assert.match(java,/MOVING_SECONDS = \{0, 0\.6\}/);assert.match(java,/Leg 1: drive to pin 1; pause 0\.5 s; run "Shoot" for 1 s/);
  const plan=Timed.compile(route,{power:.6}),k=plan.steps.findIndex(s=>s.action==='Shoot');assert.deepEqual([plan.steps[k-1].seconds,plan.steps[k].seconds,plan.steps[k].forSeconds],[.5,1,true],'pause step, then a 1 s Shoot');
  assert.match(MM.autonomous(route,Timed.settings({}),{mechanisms:on(),target:{x:59,y:58}}),/MOVING_SECONDS = \{\d+: 0\.6/);
  if(!built)return;
  const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-dur-')),now:()=>0,emit:()=>{}});
  try{const info=await e.load({field:'biobuzz',alliance:'red',mechanisms:on(),start,robot,sensors:{localization:'fused'}});
    const r=P.plan({start,zones:[],pins:[{x:24,y:30,wait:.5,action:'Shoot',actionSeconds:1.5},{x:30,y:40}],clearance:2,defaultPower:1},info.footprint,info.fieldZones,info.bounds);r.defaultPower=1;
    await e.run({kind:'route',route:r});let paused=null,firstShot=null,left=null;
    for(let i=0;i<3600&&e.mode==='program';i++){await e.programTick();const t=e.world.time;if(e.telemetry?.phase==='Pause'&&paused===null)paused=t;if(firstShot===null&&e.mechanismState().shots>0)firstShot=t;if(paused!==null&&left===null&&e.mechAct===null&&e.telemetry?.phase&&/Driving/.test(e.telemetry.phase))left=t;}
    assert.ok(paused!==null&&firstShot!==null,'paused then shot');assert.ok(firstShot-paused>=.45,`no shot during the pause (${(firstShot-paused).toFixed(2)} s)`);
    assert.ok(left-paused>=1.9&&left-paused<2.6,`left after the pause and 1.5 s of shooting (${(left-paused).toFixed(2)} s)`);
  }finally{e.dispose();}
});

test('a STEP assembly sets the robot up from its named parts: chassis size, intakes and shooters',()=>{
  // The kept tree: the first level that splits the robot into assemblies, each with its box and inner names.
  // Each mesh carries the assembly names above it (the same from every piece of a split read).
  const mesh=(pts,...path)=>({position:Float32Array.from(pts),index:new Uint32Array([0,1,2]),path:['Robot','Robot asm',...path]});
  const meshes=[mesh([-8.5,-7.5,0, 8.5,7.5,6, 0,0,0],'Chassis'),mesh([8.5,-6,0, 12.5,6,4, 10,0,2],'Front Intake'),mesh([-2,-2,6, 2,2,14, 0,0,8],'Shooter','Turret ring'),mesh([-8,-6,6, -4,-2,12, -6,-4,8],'Nectar Launcher'),mesh([-3,-3,4, 3,3,8, 0,0,6],'Feeder')];
  const groups=require('../src/sim-model.cjs').groups(meshes);
  assert.deepEqual(require('../src/sim-model.cjs').names([...meshes,{...mesh([0,0,0,0,0,0,0,0,0],'Drive','104mm Mecanum Wheel (GB) <3>'),name:'hub'}]).slice(-3),['Drive','104mm Mecanum Wheel (GB)','hub']);
  assert.equal(Mech.drivetrainFromNames(['Drive','104mm Mecanum Wheel (GB)']),'mecanum');assert.equal(Mech.drivetrainFromNames(['SDS swerve module']),'swerve');assert.equal(Mech.drivetrainFromNames(['plate']),null);
  assert.deepEqual(groups.map(g=>g.name),['Chassis','Front Intake','Shooter','Nectar Launcher','Feeder']);assert.deepEqual(groups[2].inner,['Turret ring']);
  const parts=groups.map(g=>({name:g.name,...Mech.partRole(g.name,g.inner),box:g.box}));
  assert.deepEqual(parts.map(p=>[p.role,p.pieces,p.type]),[['chassis',null,null],['intake',null,null],['shooter',null,'turret'],['shooter','nectar','fixed'],['indexer',null,null]]);
  const M=require('../ui/sim-robot-model.js'),boxes=M.partBoxes({units:'in',front:'+x',top:'+z',parts});
  assert.deepEqual(boxes.chassis,{x:0,y:0,length:17,width:15});
  const out=Mech.fromCad(boxes.parts,{length:18,width:18});
  assert.deepEqual(out.robot,{length:17,width:15,heightIn:14});
  assert.deepEqual(out.intakes.map(i=>[i.sides,i.reach,i.width,i.height]),[[['front'],4,12,4]]);
  assert.deepEqual(out.shooters.map(s=>[s.type,s.pieces,s.mount]),[['turret','pollen','center'],['fixed','nectar','backright']]);
  assert.equal(out.found.length,5,out.found.join(' | '));
  // A model whose front is its -y axis: its +x side is the robot's left, so the intake is on the left.
  const turned=Mech.fromCad(M.partBoxes({units:'in',front:'-y',top:'+z',parts}).parts,{});assert.deepEqual(turned.intakes[0].sides,['left']);
});

test('setting a new front on the CAD carries the intakes and shooters with it and keeps the team’s settings',()=>{
  const M=require('../ui/sim-robot-model.js');
  const parts=[{name:'Chassis',role:'chassis',box:[-8.5,-7.5,0,8.5,7.5,6]},{name:'Front Intake',role:'intake',kind:'sweeper',box:[8.5,-6,0,12.5,6,4]},
    {name:'Shooter',role:'shooter',type:'turret',box:[-2,-2,6,2,2,14]},{name:'Nectar Launcher',role:'shooter',pieces:'nectar',type:'fixed',box:[-8,-6,6,-4,-2,12]}];
  const cad=o=>{const b=M.partBoxes({units:'in',...o,parts});return Mech.fromCad(b.parts,{length:b.extent.length,width:b.extent.width});};
  // Imported thinking the CAD's right (-y) was its front, so the intake landed on the robot's left; then a sideways
  // roller, a slower motor and a hand-placed back intake were set up.
  const wrong={front:'-y',top:'+z'},right={front:'+x',top:'+z'},before=cad(wrong),after=cad(right);
  assert.deepEqual(before.intakes[0].sides,['left']);
  const set=Mech.sanitize({enabled:true,intakes:[{...before.intakes[0],kind:'siderollers',power:.6,motor:'roller',at:{x:0,y:9}},{kind:'sweeper',sides:['back'],motor:'rear'}],shooters:before.shooters});
  assert.equal(M.turnBetween(wrong,right),3,'the old front is now the robot’s right: three quarter turns counterclockwise');
  assert.equal(M.turnBetween(right,right),0);assert.equal(M.turnBetween(right,{front:'+x',top:'+y'}),null,'a new top is not a turn');
  const m=Mech.reoriented(set,{turn:M.turnBetween(wrong,right),before,after});
  assert.deepEqual(m.intakes.map(i=>[i.sides,i.reach,i.width,i.kind,i.power,i.motor]),[[['front'],4,12,'siderollers',.6,'roller'],[['back'],0,null,'sweeper',1,'rear']],'the named part follows the CAD; a side picked with the buttons is the robot’s and stays');
  assert.deepEqual(m.intakes[0].at,{x:9,y:0},'a spot clicked on the model turns with it');
  assert.deepEqual(m.shooters.map(s=>[s.type,s.pieces,s.mount]),Mech.sanitize({intakes:[],shooters:after.shooters}).shooters.map(s=>[s.type,s.pieces,s.mount]));
  assert.equal(m.shooters[1].facing,'right','a fixed shooter that fired at the old front now fires at the robot’s right');
  // Turning back restores the setup; mechanisms that are off are left alone.
  const back=Mech.reoriented(m,{turn:M.turnBetween(right,wrong),before:after,after:before});
  assert.deepEqual(back.intakes.map(i=>[i.sides,i.at]),[[['left'],{x:0,y:9}],[['back'],undefined]]);assert.deepEqual(back.shooters.map(s=>[s.mount,s.facing]),set.shooters.map(s=>[s.mount,s.facing]));
  // Without CAD part names, a shooter placed by clicking the model turns with it; one set with the buttons stays.
  const clicked=Mech.sanitize({enabled:true,intakes:[],shooters:[{type:'fixed',mount:'front',facing:'front',at:{x:6,y:0}}]}),picked=Mech.sanitize({enabled:true,intakes:[],shooters:[{type:'fixed',mount:'front',facing:'front'}]});
  assert.deepEqual(['mount','facing','at'].map(k=>Mech.reoriented(clicked,{turn:1}).shooters[0][k]),['left','left',{x:0,y:6}]);
  assert.deepEqual(Mech.reoriented(picked,{turn:1}),picked);
  const off=Mech.sanitize({enabled:false,intakes:[{sides:['front']}]});assert.deepEqual(Mech.reoriented(off,{turn:1,before,after}),off);
  // A new top (not a turn): parts named in the CAD still follow it; the rest stays put.
  const up=Mech.reoriented(set,{turn:null,before,after});assert.deepEqual(up.intakes.map(i=>i.sides),[['front'],['back']]);
});

test('a kicker swings down before it picks up, and what it scoops moves up after it swings back',()=>{
  const m=Mech.sanitize({enabled:true,intakes:[{kind:'kicker',sides:['front'],down:.5,up:.4}],shooters:[{type:'turret',pieces:'pollen',mount:'center'}],transfer:{seconds:1}});
  assert.equal(m.intakes[0].kind,'kicker');assert.equal(m.intakes[0].servo,'kicker');assert.equal(Mech.liftSeconds(m),.4);
  const model=new Mech.Model(m,0),run=(t,cmd,held)=>{let out;for(let i=0;i<Math.round(t/.01);i++)out=model.tick(.01,cmd,{pose:{x:0,y:0,heading:0},target:{x:50,y:0},held});return out;};
  // Swinging down: its edge does not pick up yet; all the way down it does.
  assert.deepEqual(run(.3,{intake:true},0).edgesOff,['front']);assert.deepEqual(run(.25,{intake:true},0).edgesOff,[]);
  // A piece scooped while down waits in the kicker, then moves up after the swing back.
  run(.1,{intake:true},1);assert.equal(model.state().moving,1);run(.3,{intake:false},1);assert.equal(model.queue[0].arrives,Infinity);
  run(.15,{intake:false},1);assert.ok(Number.isFinite(model.queue[0].arrives),'transfer starts once it is up');
  assert.equal(Mech.partRole('Kicker arm').kind,'kicker');
  // Exports drive the kicker servo.
  const ftc=require('../ui/sim-ftc.js');assert.deepEqual(ftc.mechanismHardware?ftc.mechanismHardware(m).kickers:[{name:'kicker',down:0,up:1}],[{name:'kicker',down:0,up:1}]);
});

test('a deployable ramp is a sweeper with a ramp on a servo: the ramp moves only when sent, and its pieces move straight in',()=>{
  const m=on({intakes:[{kind:'ramp',sides:['front'],down:.5,up:.4,servo:'rampServo',motor:'rollers'}],transfer:{seconds:1}});
  assert.deepEqual(m.intakes[0],{kind:'ramp',sides:['front'],reach:0,width:null,height:4,motor:'rollers',power:1,down:.5,up:.4,servo:'rampServo',downPos:0,upPos:1});
  const plain=on({intakes:[{kind:'ramp',sides:['front']}]}).intakes[0];assert.equal(plain.servo,'ramp');assert.equal(plain.down,.3,'the game physics folds a ramp down in 0.3 s');
  assert.equal(Mech.liftSeconds(m),0,'shooting does not wait for a ramp to fold up');assert.equal(Mech.engineSpec(m).bbMech.intake.kind,'ramp');
  const model=new Mech.Model(m,0),run=(t,cmd,held)=>{let out;for(let i=0;i<Math.round(t/.01);i++)out=model.tick(.01,cmd,{pose:{x:0,y:0,heading:0},target:{x:50,y:0},held});return out;};
  // Intaking leaves the ramp up: its rollers still take pieces off the floor.
  let out=run(.4,{intake:true},0);assert.deepEqual([out.ramp.down,out.edgesOff],[false,[]]);assert.deepEqual(model.state().ramps,[0]);
  // Sent down (Ramp down, or robot code moving its servo): the physics ramp settles when it gets there, and it stays down.
  out=run(.2,{intake:true,ramp:true},0);assert.deepEqual(out.edgesOff,[]);assert.equal(out.ramp.down,true);assert.ok(Math.abs(out.ramp.eta-.3)<.02,'eta '+out.ramp.eta);
  out=run(.31,{intake:false,ramp:true},0);assert.deepEqual(model.state().ramps,[1]);assert.equal(out.ramp.down,true,'it stays down with the intake off');
  // A piece it takes starts moving up at once (a kicker would hold it until it swings back up).
  run(.1,{intake:true,ramp:true},1);assert.ok(Number.isFinite(model.queue[0].arrives));
  out=run(.1,{intake:false,ramp:false},1);assert.deepEqual([out.ramp.down,out.edgesOff],[false,[]]);
  // A kicker still swings down while the intake runs, and picks up only once it is all the way down.
  const kicker=new Mech.Model(on({intakes:[{kind:'kicker',sides:['front'],down:.4,up:.4}]}),0);let o=kicker.tick(.01,{intake:true},{held:0});
  assert.deepEqual(o.edgesOff,['front']);for(let i=0;i<45;i++)o=kicker.tick(.01,{intake:true},{held:0});assert.deepEqual(o.edgesOff,[]);
  // The physics' kind is the first intake that reaches into flowers: a sweeper first does not hide a ramp.
  assert.equal(Mech.flowerKind(on({intakes:[{sides:['front']},{kind:'ramp',sides:['back']}]})),'ramp');assert.equal(Mech.flowerKind(on()),'sweeper');
  // Exports fold the ramp with its servo and run its rollers as an intake motor.
  const hw=F.mechanismHardware(m);assert.deepEqual([hw.intakes,hw.ramps],[[{name:'rollers',kind:'motor',mount:1,part:0}],[{name:'rampServo',down:0,up:1}]]);
  const layout={name:'Ramp',start,zones:[]},route=P.plan({start,zones:[],pins,clearance:2,style:'spline'},{front:8.5,rear:8.5,half:8.5});
  const java=F.files({route,layout,tuning:{},robot,localization:'fused',mechanisms:m,target:{x:59.25,y:58.56},routeJava:X.java(route,layout,{polygon:P.polygon})}).files['org/firstinspires/ftc/teamcode/Mechanisms.java'];
  // Intake runs only the rollers; ramp(down) moves the ramp, and Ramp down / Ramp up wait its time at a pin.
  assert.match(java,/INTAKE_1 = "rollers";/);assert.match(java,/RAMP_1 = "rampServo";/);assert.match(java,/public void ramp\(boolean down\) \{\n\s+ramp1\.setPosition\(down \? RAMP_1_DOWN : RAMP_1_UP\);/);
  assert.doesNotMatch(java.slice(java.indexOf('public void intake('),java.indexOf('public void ramp(')),/ramp1/,'intake() leaves the ramp alone');
  assert.match(java,/RAMP_DOWN_SECONDS = 0\.5, RAMP_UP_SECONDS = 0\.4;/);assert.match(F.mechanismAction('Ramp down',m),/mech\.ramp\(true\);\n\s+return step\.moving \|\| mech\.rampsAt\(true, step\.elapsed\);/);assert.match(java,/public boolean rampsAt\(boolean down, double elapsed\) \{\n\s+double timed = down \? RAMP_DOWN_SECONDS : RAMP_UP_SECONDS;\n\s+return elapsed >= timed;/,'without a sensor the ramp keeps its time');
  const py=MM.autonomous(route,Timed.settings({}),{name:'Ramp',mechanisms:m,target:{x:59.25,y:58.56}});assert.match(py,/RAMPS = \[\n\s+\("rampServo", 0, 0\.0, 180\.0\),/);
  assert.match(py,/for servo, down, up in self\.kickers:\n/);assert.match(py,/def ramp\(self, down\):/);assert.match(py,/RAMP_DOWN_SECONDS, RAMP_UP_SECONDS = 0\.5, 0\.4/);
  assert.deepEqual(MM.mechanismHardware(m).ramps,[{servo:0,down:0,up:180}]);
});

test('two shooters can ride one turret, or each have their own',()=>{
  const both=(sharesTurret,mount='center')=>on({shooters:[{type:'turret',pieces:'pollen',mount},{type:'turret',pieces:'nectar',mount:'right',sharesTurret}],capacity:{pollen:3,nectar:1}});
  const shared=both(true);
  assert.deepEqual(shared.shooters.map(s=>[s.mount,s.turretMotor,!!s.sharesTurret]),[['center','turret',false],['center','turret',true]],'the second sits on the first one\'s turret, turned by its motor; the center is allowed');
  assert.deepEqual(Mech.engineSpec(shared).bbMech.launcher,{kind:'twinturret',mount:'center',mount2:'center',hoodDeg:75});
  assert.match(Mech.summary(shared),/two shooters on one turret \(pollen, nectar\)/);
  const apart=both(false);assert.deepEqual(apart.shooters.map(s=>[s.mount,s.turretMotor,'sharesTurret' in s]),[['front','turret',false],['back','turret2',false]],'own turrets stay apart, each with its own motor');
  assert.equal(on({shooters:[{type:'turret'},{type:'fixed',sharesTurret:true}]}).shooters[1].sharesTurret,undefined,'a fixed shooter has no turret to share');
  // One turret aims both: they point the same way from the same spot.
  const model=new Mech.Model(shared,0);for(let i=0;i<200;i++)model.tick(.01,{aim:true},{pose:{x:0,y:0,heading:0},target:{x:40,y:30},held:0});
  const s=model.state();assert.equal(s.turrets[0],s.turrets[1]);assert.ok(Math.abs(s.turrets[0]-36.87)<.5,'aims at the target: '+s.turrets[0]);assert.equal(s.aligned,true);
  // Exports: one turret motor; the second shooter has none of its own.
  assert.deepEqual(F.mechanismHardware(shared).shooters.map(x=>!!x.turret),[true,false]);assert.deepEqual(MM.mechanismHardware(shared).shooters.map(x=>!!x.turret),[true,false]);
  const layout={name:'Shared',start,zones:[]},route=P.plan({start,zones:[],pins,clearance:2,style:'spline'},{front:8.5,rear:8.5,half:8.5});
  const java=F.files({route,layout,tuning:{},robot,localization:'fused',mechanisms:shared,target:{x:59.25,y:58.56},routeJava:X.java(route,layout,{polygon:P.polygon})}).files['org/firstinspires/ftc/teamcode/Mechanisms.java'];
  assert.match(java,/TURRET_1 = "turret";/);assert.doesNotMatch(java,/TURRET_2 =/);assert.match(java,/Shooter 2 \(nectar\): on shooter 1's turret/);
});

test('the terminal sets a ramp intake and a shared turret',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-cli-share-')),file=path.join(dir,'m.json'),out=[],log=console.log;console.log=(...a)=>out.push(a.join(' '));
  try{await D.main(['new',file,'--field','biobuzz']);await D.main(['mech',file,'--intakes','front:ramp','--shooters','turret@left:pollen,turret@right:nectar','--nectar','1','--shared-turret','on']);
    await assert.rejects(D.main(['mech',file,'--shooters','turret@left:pollen,fixed@back:nectar','--shared-turret','on']),/needs two turret shooters/);}finally{console.log=log;}
  const t=JSON.parse(fs.readFileSync(file,'utf8')).mechanisms;assert.deepEqual(t.shooters.map(s=>[s.mount,!!s.sharesTurret]),[['left',false],['left',true]]);assert.equal(t.intakes[0].servo,'ramp');
  assert.match(out.join('\n'),/Intake 1: Deployable ramp on the front · motor "intake" at 1 · servo "ramp" \(down in 0.3 s, up in 0.3 s\)/);assert.match(out.join('\n'),/Shooter 2: on shooter 1's turret at left/);
});

test('BIOBUZZ: only a folded-down ramp takes a flower\'s pollen; two shooters on one turret both launch from it',{skip:!built&&'run node tools/simulation/build.cjs first'},async()=>{
  // F1 stands on the red wall at y 48.6 and opens toward the field: drive the front intake into it.
  const flower=async(intakes,cmd={})=>{const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-flower-')),now:()=>0,emit:()=>{}});
    try{await e.load({field:'biobuzz',alliance:'red',mechanisms:on({intakes,preload:{pollen:0}}),start:{x:24,y:48.6,heading:180},robot,sensors:{localization:'fused'}});
      e.mechCmd={intake:true,spin:false,aim:false,feed:false,...cmd};for(let i=0;i<600;i++)e.tick({forward:i<200?.25:.05,strafe:0,turn:0});return e.world.robots[0].hopper.length;}finally{e.dispose();}};
  assert.ok(await flower([{kind:'ramp',sides:['front']}],{ramp:true})>=1,'a ramp folded down takes the flower\'s pollen');
  assert.equal(await flower([{kind:'ramp',sides:['front']}]),0,'intaking alone leaves the ramp up: it cannot reach the flower');
  assert.equal(await flower([{kind:'sweeper',sides:['front']}]),0,'a sweeper cannot reach into a flower');
  assert.equal(await flower([{kind:'ramp',sides:['front']}],{ramp:false}),0,'a ramp held up takes nothing');
  assert.equal(await flower([{kind:'sweeper',sides:['front']},{kind:'ramp',sides:['back']}]),0,'only the ramp\'s own side reaches into a flower');
  const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-shared-')),now:()=>0,emit:()=>{}});
  try{await e.load({field:'biobuzz',alliance:'red',mechanisms:on({shooters:[{type:'turret',pieces:'pollen',mount:'left'},{type:'turret',pieces:'nectar',sharesTurret:true}],capacity:{pollen:3,nectar:1},preload:{pollen:3}}),start:{x:30,y:24,heading:90},robot,sensors:{localization:'fused'}});
    assert.deepEqual([e.world.robots[0].spec.bbMech.launcher.mount,e.world.robots[0].spec.bbMech.launcher.mount2],['left','left']);
    e.mechCmd={intake:false,spin:true,aim:true,feed:true};for(let i=0;i<500;i++)e.tick({forward:0,strafe:0,turn:0});const s=e.mechanismState();
    assert.equal(s.turrets[0],s.turrets[1]);assert.equal(s.shots,3);assert.ok(s.landed>=2,'landed '+s.landed);}finally{e.dispose();}
});

test('a robot from CAD collides as its chassis: intakes take pieces past the edge but do not grow the hitbox',{skip:!built&&'run node tools/simulation/build.cjs first'},async()=>{
  const footprint=async appearance=>{const e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-hitbox-')),now:()=>0,emit:()=>{}});
    try{await e.load({field:'biobuzz',alliance:'red',mechanisms:on({intakes:[{kind:'sweeper',sides:['front'],reach:3}]}),robot:{...robot,length:15,width:16,appearance},start});
      const spec=e.world.robots[0].spec;return {footprint:e.info.footprint,bodyOnly:!!spec.deckBodyOnly,mouth:spec.deckIntakeBoxes.front.reach};}finally{e.dispose();}};
  const cad=await footprint('custom'),plain=await footprint('plain');
  assert.deepEqual(cad.footprint,{front:7.5,rear:7.5,half:8},'CAD robot: length × width only');assert.equal(cad.bodyOnly,true);assert.equal(cad.mouth,3,'the intake still reaches 3 in for pieces');
  assert.equal(plain.footprint.front,10.5,'a robot without CAD keeps its intake in the hitbox');
});
test('CAD import: without an assembly named Chassis, the chassis is every part except the intakes',()=>{
  const parts=[{name:'Intake',role:'intake',box:{x0:6,x1:10,y0:-6,y1:6,z0:0,z1:3}},{name:'Frame',role:'other',box:{x0:-6,x1:6,y0:-7,y1:7,z0:0,z1:6}}];
  const out=Mech.fromCad(parts,{length:16,width:14,chassis:{name:'All parts except the intakes',derived:true,length:12,width:14}});
  assert.deepEqual([out.robot.length,out.robot.width],[12,14]);assert.equal(out.intakes[0].reach,4,'the intake sticks out 4 in past the chassis');
  assert.equal(Mech.fromCad(parts,{length:16,width:14}).intakes[0].reach,2,'measured against the whole CAD, not a stale robot size');
});

test('CAD auto setup finds every separate mechanism: two shooters on two independent turrets, and one of each otherwise',()=>{
  const M=require('../ui/sim-robot-model.js'),part=(name,box)=>({name,...Mech.partRole(name,[]),box});
  // The BIOBUZZ robot's own assemblies (inches, its file frame: front is -y, top +z). One "turret final" assembly holds
  // both turntables, under a pollen flywheel on one side and a nectar flywheel on the other.
  const robotCad=[part('drivetrain',[-12.11,-7.33,3.8,3.46,9.07,11.23]),part('indexer final',[-9.52,-7.09,4.31,.52,9.25,12.49]),part('turret final',[-10.34,-6.27,11.52,1.54,9.03,13.63]),
    part('POLLEN V2',[-8.25,2.64,13.26,-.5,9.13,17.99]),part('NECTAR V2',[-8.68,-6.71,13.25,.33,.62,17.99]),part('intake v4',[-12.25,-13.84,6.61,3.68,-3.41,12.96]),part('Belt',[-10.79,-5.99,6.39,.44,1.66,10.07])];
  const cad=(parts,front='-y')=>{const b=M.partBoxes({units:'in',front,top:'+z',parts,bodyChassis:true});return Mech.fromCad(b.parts,{length:b.extent.length,width:b.extent.width,chassis:b.chassis?.derived?b.chassis:null});};
  const out=cad(robotCad);
  assert.equal(out.intakes.length,1,'one intake');assert.deepEqual(out.intakes[0].parts,['intake v4']);
  assert.deepEqual(out.shooters.map(s=>[s.type,s.pieces,s.mount,s.parts]),[['turret','pollen','back',['POLLEN V2','turret final']],['turret','nectar','front',['NECTAR V2','turret final']]]);
  // Each sits where its flywheel is on the model (inches from the chassis center), not at a grid cell.
  assert.ok(Math.abs(out.shooters[0].at.x+5)<.1&&Math.abs(out.shooters[1].at.x-3.9)<.1,JSON.stringify(out.shooters.map(s=>s.at)));
  assert.deepEqual(out.capacity,{pollen:4,nectar:4},'a nectar shooter gets room for nectar');
  const m=Mech.sanitize({enabled:true,intakes:out.intakes,shooters:out.shooters,capacity:out.capacity});
  assert.deepEqual(m.shooters.map(s=>[s.mount,s.turretMotor,!!s.sharesTurret,s.parts.length]),[['back','turret',false,2],['front','turret2',false,2]],'independent turrets, each on its own motor and linked to its own parts');
  assert.match(Mech.summary(m),/turret \(pollen\) and turret \(nectar\)/);assert.deepEqual(Mech.engineSpec(m).bbMech.launcher,{kind:'twinturret',mount:'back',mount2:'front',hoodDeg:75});
  // In the simulator the two turrets aim on their own, from their own spots: they point different ways at one target.
  const model=new Mech.Model(m,0,{length:16.5,width:15.5});for(let i=0;i<300;i++)model.tick(.01,{aim:true},{pose:{x:72,y:72,heading:0},target:{x:72,y:110},held:0});
  const s=model.state();assert.equal(s.aligned,true);assert.ok(Math.abs(s.turrets[0]-s.turrets[1])>1,'two independent angles: '+s.turrets);
  // A robot with one of each: a turret, its flywheel and its hood stacked at one spot are one shooter.
  const single=cad([part('Chassis',[-8,-8,0,8,8,5]),part('Front intake',[-6,-11,0,6,-8,4]),part('Turret',[-3,-3,5,3,3,7]),part('Shooter',[-2.5,-2,7,2.5,2.5,12]),part('Shooter hood',[-2,1,9,2,4,13])]);
  assert.deepEqual(single.shooters.map(s=>[s.type,s.mount,s.parts]),[['turret','center',['Shooter','Shooter hood','Turret']]]);assert.equal(single.intakes.length,1);assert.equal(single.capacity,undefined);
  // Two turret assemblies of their own, each carrying its flywheel, are two turrets; a third shooter is named but left out.
  const twin=cad([part('Chassis',[-8,-8,0,8,8,5]),part('Left turret',[3,-3,5,8,3,8]),part('Pollen flywheel',[4,-2,8,7,2,12]),part('Right turret',[-8,-3,5,-3,3,8]),part('Nectar flywheel',[-7,-2,8,-4,2,12]),part('Spare launcher',[-2,6,5,2,8,9])],'-y');
  assert.deepEqual(twin.shooters.map(s=>[s.type,s.pieces,s.parts]),[['turret','pollen',['Pollen flywheel','Left turret']],['turret','nectar',['Nectar flywheel','Right turret']]]);
  assert.ok(twin.found.some(f=>/Spare launcher.*not set up/.test(f)),twin.found.join(' | '));
  // Exports: each turret has its own motor and aims from its own spot (Control Hub Java and MotionModule).
  const route=P.plan({start,zones:[],pins,clearance:2,style:'spline'},{front:8.5,rear:8.5,half:8.5}),layout={name:'Twin',start,zones:[]},target={x:59.25,y:58.56},size={length:16.5,width:15.5};
  const java=F.files({route,layout,tuning:{},robot:{...robot,...size},localization:'fused',mechanisms:m,target,routeJava:X.java(route,layout,{polygon:P.polygon})}).files['org/firstinspires/ftc/teamcode/Mechanisms.java'];
  assert.match(java,/TURRET_1 = "turret";[\s\S]*TURRET_2 = "turret2";/);assert.match(java,/TURRET_1_X = -[\d.]+, TURRET_1_Y = -?[\d.]+;[\s\S]*TURRET_2_X = [\d.]+, TURRET_2_Y = -?[\d.]+;/);
  assert.deepEqual(MM.mechanismHardware(m).shooters.map(x=>x.turret?.servo),[0,1]);
  const source=MM.autonomous(route,Timed.settings({}),{name:'Twin',mechanisms:m,target,robot:size}),aims=/^AIMS = \{(.*)\}$/m.exec(source)[1];
  assert.match(aims,/^\d+: \(-?[\d.]+, -?[\d.]+\)/,'one angle per turret: '+aims);assert.ok([...aims.matchAll(/\((-?[\d.]+), (-?[\d.]+)\)/g)].some(([,a,b])=>a!==b),aims);
  // The generated aim() points each turret servo at its own angle, or every turret at one angle.
  if(python){const aim=/\n    def aim\(self, degrees\):\n[\s\S]*?(?=\n    def )/.exec(source)[0];
    const code=`import time\nclass O:\n    def __init__(self): self.angles = []\n    def set_angle(self, v): self.angles.append(v)\nclass Mechanisms:\n    TURRET_MIN, TURRET_MAX, TURRET_SPEED, TURRET_SERVO_CENTER, TURRET_SERVO_PER_DEGREE = -170.0, 170.0, 240.0, 90.0, 1.0${aim}\nm = Mechanisms()\nm.turrets, m.turret_angle, m.turret_ready_at = [(O(), 1), (O(), 1)], [0.0, 0.0], 0.0\nm.aim((10.0, -20.0))\nm.aim(5.0)\nprint([t.angles for t, sign in m.turrets])\n`;
    const r=spawnSync(python,['-c',code],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'[[100.0, 95.0], [70.0, 95.0]]');}
});
