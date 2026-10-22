'use strict';
// The two shipped example setups (mecanum, 17 x 17 x 5 in, 500 RPM): plan each one's practice route,
// export it the way the app does, and run the export on the matching virtual device. The Control Hub
// export runs on the virtual Control Hub (Java, always available); the MotionModule export runs on
// MotionModule's real runtime when Python and the MotionModule source are present.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const P=require('../ui/sim-planner.js'),X=require('../ui/sim-export.js'),F=require('../ui/sim-ftc.js'),M=require('../ui/sim-motionmodule.js'),{SimEngine}=require('../src/sim-engine.cjs');
const root=path.join(__dirname,'..'),dir=path.join(root,'tests/fixtures/simulation-setups'),read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const motionModule=process.env.DECK_MOTIONMODULE_SOURCE||path.join(root,'../MotionModule'),deps=process.env.DECK_MOTIONMODULE_DEPS||path.join(root,'.cache/motionmodule-test-deps');
const python=[process.env.DECK_PYTHON,path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),'python3'].find(p=>p&&spawnSync(p,['-c','import sys;assert sys.version_info>=(3,9)'],{windowsHide:true}).status===0);
const built=fs.existsSync(path.join(root,'sim-runtime/driver/classes/deck/sim/hub/VirtualHub.class'));

async function load(setup){
  const l=setup.layouts.find(x=>x.id===setup.active),e=new SimEngine({workDir:fs.mkdtempSync(path.join(os.tmpdir(),'deck-setup-test-')),now:()=>0,emit:m=>{if(m?.state==='error')e.lastError=m.error;}});
  const info=await e.load({field:l.field,width:l.width,height:l.height,start:l.start,zones:l.zones,robot:setup.robot,controller:setup.controller,sensors:setup.sensors,timing:setup.timing,tuning:setup.tuning});
  const route=P.plan({start:l.start,zones:l.zones,pins:l.pins,clearance:l.clearance,style:l.style,rotate:l.rotate},info.footprint,info.fieldZones,info.bounds);
  return {e,info,l,route,goal:l.pins.at(-1)};
}
const until=async(e,mode,done=()=>false)=>{for(let i=0;i<3600&&e.mode===mode&&!done();i++)mode==='timed'?e.timedTick():await e.programTick();};

test('example setups: mecanum 17 x 17 x 5 in at 500 RPM for a Control Hub and a MotionModule',()=>{
  const hub=read('Control Hub mecanum 17x17.json'),mm=read('MotionModule mecanum 17x17.json');
  for(const s of [hub,mm]){assert.equal(s.deckSimulation,2);assert.deepEqual([s.robot.drivetrain,s.robot.length,s.robot.width,s.robot.heightIn,s.robot.driveRpm],['mecanum',17,17,5,500]);}
  assert.equal(hub.controller,'ftc');assert.equal(hub.sensors.localization,'encoders');assert.equal(mm.controller,'motionmodule');assert.equal(mm.sensors.localization,'gyro');
  assert.ok(mm.timing.forwardSpeed>80&&mm.timing.startup>0&&mm.timing.stopping>=0,'MotionModule timing is calibrated on the simulated robot');
});
test('Control Hub setup: the exported TeamCode runs on the virtual Control Hub and matches the simulation',{skip:!built&&'build the simulator first'},async()=>{
  const setup=read('Control Hub mecanum 17x17.json'),a=await load(setup),b=await load(setup);try{
    await a.e.run({route:a.route});await until(a.e,'program');assert.ok(a.e.result,a.e.lastError);
    const lay={...b.l,start:b.l.start},out=F.files({route:b.route,layout:lay,tuning:b.info.tuning,robot:b.info.robot,localization:setup.sensors.localization,setupName:'Control Hub mecanum 17x17',
      routeJava:X.java(b.route,lay,{polygon:P.polygon,className:'PlannedRoute',packageName:'org.firstinspires.ftc.teamcode'})});
    assert.equal((await b.e.run({kind:'opmode',files:out.files,opMode:out.opMode})).ok,true,b.e.lastError);await until(b.e,'program',()=>b.e.telemetry?.Phase==='Done');
    const sim=a.e.result.truth,hub=b.e.truth();
    assert.ok(Math.hypot(hub.x-a.goal.x,hub.y-a.goal.y)<3,`virtual Control Hub ended at ${hub.x.toFixed(2)}, ${hub.y.toFixed(2)}`);
    assert.ok(Math.hypot(hub.x-sim.x,hub.y-sim.y)<2.5,`simulated ${sim.x.toFixed(2)}, ${sim.y.toFixed(2)} vs exported ${hub.x.toFixed(2)}, ${hub.y.toFixed(2)}`);
    assert.equal(b.e.violations.size,0);
  }finally{a.e.dispose();b.e.dispose();}
});
test('MotionModule setup: the exported autonomous.py runs on the virtual MotionModule and matches the simulation',{skip:!python?'Python 3 is not available':!fs.existsSync(path.join(motionModule,'core/motion_module/autonomous.py'))?'MotionModule source not found':false},async()=>{
  const setup=read('MotionModule mecanum 17x17.json'),a=await load(setup),b=await load(setup);try{
    await a.e.run({route:a.route});await until(a.e,'timed');assert.ok(a.e.result);
    const source=M.autonomous(b.route,setup.timing,{name:b.l.name});assert.equal((await b.e.run({kind:'motionmodule',source,python,motionModule,deps})).ok,true,b.e.lastError);
    await until(b.e,'program');assert.ok(b.e.result,b.e.lastError);
    const sim=a.e.result.truth,mm=b.e.result.truth;
    assert.ok(Math.hypot(mm.x-sim.x,mm.y-sim.y)<2,`simulated ${sim.x.toFixed(2)}, ${sim.y.toFixed(2)} vs MotionModule ${mm.x.toFixed(2)}, ${mm.y.toFixed(2)}`);
    assert.ok(Math.hypot(mm.x-a.goal.x,mm.y-a.goal.y)<4,`virtual MotionModule ended at ${mm.x.toFixed(2)}, ${mm.y.toFixed(2)}`);
  }finally{a.e.dispose();b.e.dispose();}
});

// The shipped BIOBUZZ setup: blue alliance, 15 x 15 x 15 in, 5 lb, 500 RPM, goBILDA Pinpoint. Its 30-second
// autonomous cycles POLLEN into the blue HIVE (three TIPS) and parks partly in the blue LOADING ZONE.
const biobuzz=()=>JSON.parse(fs.readFileSync(path.join(root,'examples/simulation-setups/BIOBUZZ blue auto 15x15.json'),'utf8'));
const program=async(e,limit)=>{for(let i=0;i<60000&&e.mode==='program'&&e.world.time<limit;i++)await e.programTick();};
test('BIOBUZZ example setup: robot, sensing, and an intake / shoot cycle with a final park',()=>{
  const s=biobuzz(),l=s.layouts.find(x=>x.id===s.active);
  assert.deepEqual([s.robot.drivetrain,s.robot.length,s.robot.width,s.robot.heightIn,s.robot.massLb,s.robot.driveRpm,s.robot.driveAmps],['mecanum',15,15,15,5,500,10]);
  assert.equal(s.controller,'ftc');assert.equal(s.sensors.localization,'fused');assert.equal(l.field,'biobuzz');assert.equal(s.tuning.maxPathSpeed,1);
  const acts=l.pins.map(p=>p.action).filter(Boolean);
  assert.deepEqual(acts,['Shoot','Intake','Shoot','Intake','Shoot','Intake','Shoot','Intake','Shoot','Park']);
  // Every robot pose stays on the blue side during AUTO (G402: red owns x < 72).
  assert.ok([l.start,...l.pins].every(p=>p.x-s.robot.width/2>=72),'blue side only');
});
test('BIOBUZZ example setup: the autonomous runs on the BIOBUZZ field in under 30 seconds and parks',{skip:!built&&'build the simulator first'},async()=>{
  const s=biobuzz(),a=await load(s);try{
    await a.e.run({route:a.route});await program(a.e,40);assert.ok(a.e.result,a.e.lastError);
    const end=a.e.result.truth;assert.equal(a.e.result.reason,'finished');
    assert.ok(a.e.result.time<30,`finished at ${a.e.result.time.toFixed(2)} s`);assert.equal(a.e.violations.size,0);
    assert.ok(Math.hypot(end.x-a.goal.x,end.y-a.goal.y)<2.5,`ended at ${end.x.toFixed(2)}, ${end.y.toFixed(2)}`);
    // PARK: at least partly inside the blue LOADING ZONE, x 133-144, y 24-48.
    assert.ok(end.x+s.robot.width/2>133&&end.y>24&&end.y<48,'parked in the blue LOADING ZONE');
  }finally{a.e.dispose();}
});
test('BIOBUZZ example setup: the exported Pinpoint TeamCode runs on the virtual Control Hub and parks with the simulation',{skip:!built&&'build the simulator first'},async()=>{
  const s=biobuzz(),a=await load(s),b=await load(s);try{
    await a.e.run({route:a.route});await program(a.e,40);assert.ok(a.e.result,a.e.lastError);
    const lay={...b.l},out=F.files({route:b.route,layout:lay,tuning:b.info.tuning,robot:b.info.robot,localization:s.sensors.localization,setupName:'BIOBUZZ blue auto 15x15',
      routeJava:X.java(b.route,lay,{polygon:P.polygon,className:'PlannedRoute',packageName:'org.firstinspires.ftc.teamcode'})});
    assert.match(Object.values(out.files).join('\n'),/GoBildaPinpointDriver/);
    assert.equal((await b.e.run({kind:'opmode',files:out.files,opMode:out.opMode})).ok,true,b.e.lastError);
    for(let i=0;i<60000&&b.e.mode==='program'&&b.e.telemetry?.Phase!=='Done'&&b.e.world.time<40;i++)await b.e.programTick();
    const sim=a.e.result.truth,hub=b.e.truth();
    assert.ok(b.e.world.time<30,`virtual Control Hub took ${b.e.world.time.toFixed(2)} s`);
    assert.ok(Math.hypot(hub.x-a.goal.x,hub.y-a.goal.y)<3,`virtual Control Hub ended at ${hub.x.toFixed(2)}, ${hub.y.toFixed(2)}`);
    assert.ok(Math.hypot(hub.x-sim.x,hub.y-sim.y)<2.5,`simulated ${sim.x.toFixed(2)}, ${sim.y.toFixed(2)} vs exported ${hub.x.toFixed(2)}, ${hub.y.toFixed(2)}`);
    assert.equal(b.e.violations.size,0);
  }finally{a.e.dispose();b.e.dispose();}
});
