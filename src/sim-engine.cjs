'use strict';
// Offline simulator core. Runs in the simulation utility process (src/sim-host.cjs) or directly in
// tests. Physics is DSIM's own (sim-runtime/dsim-host.cjs); autonomous programs run in a Pedro
// Pathing Java process in lockstep with the physics clock. Nothing here touches a real robot.
//
// Frames: the app uses inches with a bottom-left origin (+X right, +Y up, heading CCW from +X).
// DSIM is centred on the field, so app = DSIM + 72 on both axes; headings are identical.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const planner=require('../ui/sim-planner.js');
const OFFSET=72,DEG=180/Math.PI,ZERO={forward:0,strafe:0,turn:0};
const FIELDS={empty:'Empty field',decode:'DECODE (DSIM)',biobuzz:'BIOBUZZ (DSIM)'};
const LOCALIZATION={ideal:'Ideal (ground truth)',odometry:'Odometry pods + IMU',encoders:'Drive encoders + IMU',gyro:'Gyro only'};
const finite=n=>typeof n==='number'&&Number.isFinite(n),clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const toApp=p=>({x:p.x+OFFSET,y:p.y+OFFSET}),toDsim=p=>({x:p.x-OFFSET,y:p.y-OFFSET});

// Seeded normal noise so a run is reproducible.
function rng(seed){let s=(seed>>>0)||1;const u=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return (s+.5)/4294967296;};return ()=>Math.sqrt(-2*Math.log(u()))*Math.cos(2*Math.PI*u());}

function sensorConfig(raw={}){
  const mode=Object.hasOwn(LOCALIZATION,raw.localization)?raw.localization:'odometry';
  const defaults={ideal:[0,0,0],odometry:[.003,.02,.5],encoders:[.015,.05,.5],gyro:[0,0,.5]}[mode];
  const num=(v,d,max)=>finite(v)?clamp(v,0,max):d;
  return {localization:mode,scaleError:num(raw.scaleError,defaults[0],.1),noise:num(raw.noise,defaults[1],.5),gyroDrift:num(raw.gyroDrift,defaults[2],10),seed:finite(raw.seed)?raw.seed>>>0:1};
}

// Simulated sensors read the TRUTH and return what a localizer would measure: a robot-frame
// displacement from odometry (scale error, per-tick noise) and an IMU heading (drift, noise).
class Sensors{
  constructor(config,truth){this.config=config;this.normal=rng(config.seed);this.last={...truth};this.drift=0;}
  read(truth,dt){
    const c=this.config,mid=this.last.heading+wrap(truth.heading-this.last.heading)/2,fx=truth.x-this.last.x,fy=truth.y-this.last.y;
    let dx=fx*Math.cos(mid)+fy*Math.sin(mid),dy=-fx*Math.sin(mid)+fy*Math.cos(mid);this.last={...truth};
    this.drift+=c.gyroDrift/60/DEG*dt;const imu=truth.heading+this.drift+(c.localization==='ideal'?0:this.normal()*.0005);
    if(c.localization==='gyro')return {odo:null,imu};
    if(c.localization!=='ideal'){const n=c.noise*Math.hypot(dx,dy);dx=dx*(1+c.scaleError)+this.normal()*n;dy=dy*(1+c.scaleError)+this.normal()*n;}
    return {odo:{dx,dy},imu};
  }
}

function robotConfig(raw={}){
  const drivetrain=raw.drivetrain==='swerve'?'swerve':'mecanum',intake=['sloped','vector','triangle'].includes(raw.intake)?raw.intake:'sloped';
  const num=(v,d)=>finite(v)?v:d;
  return {drivetrain,intake,length:num(raw.length,14.5),width:num(raw.width,16.5),massLb:num(raw.massLb,23.5),driveRpm:num(raw.driveRpm,500)};
}

class SimEngine{
  constructor({runtimeDir=path.join(__dirname,'../sim-runtime'),workDir,emit=()=>{},now=()=>performance.now()}={}){
    this.runtimeDir=runtimeDir;this.workDir=workDir||path.join(require('node:os').tmpdir(),'deck-sim');this.emit=emit;this.now=now;
    this.dsim=require(path.join(runtimeDir,'dsim-host.cjs'));this.ready=null;
    this.world=null;this.info=null;this.config=null;this.mode='idle';this.playing=false;this.speed=1;this.manualInput=null;
    this.command={...ZERO};this.runSeq=0;this.child=null;this.pending=null;this.timer=null;this.busy=false;this.lastFrame=0;this.result=null;this.zones=[];
  }
  init(){return this.ready||(this.ready=(async()=>{await this.dsim.initPhysics();await this.dsim.initPhysics3d();})());}

  // ---------------------------------------------------------------- world
  async load(raw={}){
    await this.init();this.stopProgram('Simulation reloaded.');
    const field=Object.hasOwn(FIELDS,raw.field)?raw.field:'empty',physics=field==='biobuzz'&&raw.physics!=='2d'?'3d':'2d';
    const start=raw.start&&[raw.start.x,raw.start.y,raw.start.heading].every(finite)?{x:raw.start.x,y:raw.start.y,heading:raw.start.heading}:{x:9,y:72,heading:0};
    this.config={field,physics,start,robot:robotConfig(raw.robot),sensors:sensorConfig(raw.sensors),tuning:raw.tuning&&typeof raw.tuning==='object'?raw.tuning:{}};
    this.zones=Array.isArray(raw.zones)?raw.zones.slice(0,24).map(z=>{try{return planner.validateZone(z);}catch{return null;}}).filter(Boolean):[];
    this.build();
    const r=this.world.robots[0],D=this.dsim,ext=D.footprintExtents(r.spec),dp=D.driveParams(r.spec);
    const mod=this.module(),walls=4,bounds=mod?mod.bounds:{halfX:OFFSET,halfY:OFFSET};
    const fieldZones=mod?mod.colliders.statics.slice(walls).map((s,i)=>({id:`field-${i}`,type:'rect',x:s.tx+OFFSET,y:s.ty+OFFSET,width:2*s.hx,height:2*s.hy,angle:s.rot*DEG})):[];
    this.info={field,fieldName:FIELDS[field],physics,
      bounds:{x0:OFFSET-bounds.halfX,y0:OFFSET-bounds.halfY,x1:OFFSET+bounds.halfX,y1:OFFSET+bounds.halfY},fieldZones,
      footprint:{front:ext.front,rear:ext.rear,half:ext.half},
      robot:{drivetrain:r.spec.drivetrain,intake:r.spec.intake,length:r.spec.length,width:r.spec.width,massLb:r.spec.massLb,driveRpm:r.spec.driveRpm},
      drive:{maxSpeed:dp.maxSpeed,maxStrafe:dp.maxSpeed*dp.strafeMult,maxTurnDeg:dp.maxTurn*DEG,accel:dp.accel},
      sensors:this.config.sensors,localizationName:LOCALIZATION[this.config.sensors.localization],tuning:this.tuning(r.spec)};
    this.emitFrame(true);return this.info;
  }
  module(){return this.config.field==='empty'?null:this.dsim.SIM_GAMES[this.config.field];}
  build(){
    const D=this.dsim;if(this.world?.game==='biobuzz')D.disposePhysics3dFor(this.world);
    const c=this.config,spec=D.coerceSpec({...D.DEFAULT_SPEC,name:'Simulated robot',...c.robot},D.DEFAULT_SPEC,c.field==='biobuzz'?'biobuzz':'decode');
    const setup={id:0,alliance:'blue',spec,assists:{fieldCentric:false,aimAssist:false,autoIntake:false,autoFire:false},startIndex:0};
    const mod=this.module();
    this.world=mod?mod.createWorld('free',1,[setup],undefined,c.physics):D.SIM_GAMES.decode.createWorld('free',1,[setup]);
    if(!mod){this.world.balls=[];this.world.robots[0].hopper=[];}
    const r=this.world.robots[0],p=toDsim(c.start);
    Object.assign(r,{pos:p,heading:c.start.heading/DEG,turretHeading:c.start.heading/DEG,vel:{x:0,y:0},angVel:0,fieldCentric:false,aimAssist:false,autoIntake:false,autoFire:false});
    this.sensors=new Sensors(c.sensors,this.truth());this.estimate=null;this.command={...ZERO};this.result=null;this.trail=[];
  }
  colliders(){const T=10,H=OFFSET,w=(tx,ty,hx,hy)=>({tx,ty,hx,hy,rot:0});return this._empty||(this._empty={statics:[w(-H-T,0,T,H+2*T),w(H+T,0,T,H+2*T),w(0,-H-T,H+2*T,T),w(0,H+T,H+2*T,T)],bounds:{halfX:H,halfY:H}});}
  physicsStep(world,cmd){
    const D=this.dsim,dt=D.SIM_DT,input={driveX:-cmd.strafe,driveY:cmd.forward,rotate:cmd.turn,leftDrive:0,rightDrive:0,intake:false,fire:false};
    const mod=world===this.world?this.module():null;
    if(mod)mod.step(world,dt,new Map([[0,input]]));
    else{world.time+=dt;world.tick++;const r=world.robots[0],wrench=D.updateRobot(world,r,input,dt);D.solveRobots(world,dt,this.colliders(),undefined,new Map([[r.id,wrench]]));}
  }
  truth(){const r=this.world.robots[0],p=toApp(r.pos);return {x:p.x,y:p.y,heading:r.heading,vx:r.vel.x,vy:r.vel.y,omega:r.angVel,z:r.z||0};}

  // Measure the simulated drivetrain the way Pedro's tuning OpModes measure a robot: free speed,
  // then braking distance from two speeds (forward, strafe, turn) on a separate empty world.
  tuning(spec){
    const D=this.dsim,key=JSON.stringify([spec.drivetrain,spec.length,spec.width,spec.intake,spec.massLb,spec.driveRpm]);
    if(this._tuning?.key===key)return {...this._tuning.value,...this.userTuning()};
    const make=()=>{const w=D.SIM_GAMES.decode.createWorld('free',1,[{id:0,alliance:'blue',spec,assists:{fieldCentric:false,aimAssist:false,autoIntake:false,autoFire:false},startIndex:0}]);w.balls=[];Object.assign(w.robots[0],{pos:{x:0,y:0},heading:0,vel:{x:0,y:0},angVel:0,fieldCentric:false,autoIntake:false,autoFire:false,aimAssist:false,hopper:[]});return w;};
    const brake=(axis,power)=>{const w=make(),r=w.robots[0],cmd={...ZERO,[axis]:power};
      // Far walls: measure free motion, not a collision.
      const saved=this._empty;this._empty={statics:[],bounds:{halfX:1e6,halfY:1e6}};
      try{for(let i=0;i<90;i++)this.physicsStep(w,cmd);const v=axis==='turn'?r.angVel:Math.hypot(r.vel.x,r.vel.y),p0={...r.pos},h0=r.heading;for(let i=0;i<120;i++)this.physicsStep(w,ZERO);
        return {v:Math.abs(v),d:axis==='turn'?Math.abs(r.heading-h0):Math.hypot(r.pos.x-p0.x,r.pos.y-p0.y)};}finally{this._empty=saved;}};
    const fit=(a,b)=>{const det=a.v*a.v*b.v-b.v*b.v*a.v,q=(a.d*b.v-b.d*a.v)/det,l=(a.v*a.v*b.d-b.v*b.v*a.d)/det;return {q:Math.max(q,1e-6),l:Math.max(l,0)};};
    const f=fit(brake('forward',1),brake('forward',.5)),s=fit(brake('strafe',1),brake('strafe',.5)),h=fit(brake('turn',1),brake('turn',.5));
    const fwd=brake('forward',1),str=brake('strafe',1);
    const value={maxForward:fwd.v,maxStrafe:str.v,forwardDeceleration:fwd.v*fwd.v/(2*fwd.d),strafeDeceleration:str.v*str.v/(2*str.d),
      linearBrakeForward:f.l,linearBrakeStrafe:s.l,quadraticBrakeForward:f.q,quadraticBrakeStrafe:s.q,headingBrakeLinear:h.l,headingBrakeQuadratic:h.q,
      // Feedback gains and the path-speed cap were chosen by sweeping runs on DSIM's drive model
      // (max deviation ~1.1 in at 0.6 speed). They describe the simulated robot only.
      headingP:1.6,headingD:.06,translationalP:.5,translationalD:.012,maxPathSpeed:.6,holdTimeoutMs:2000};
    this._tuning={key,value};return {...value,...this.userTuning()};
  }
  userTuning(){const t=this.config?.tuning||{},out={};for(const k of ['headingP','headingD','translationalP','translationalD'])if(finite(t[k])&&t[k]>=0&&t[k]<=20)out[k]=t[k];if(finite(t.maxPathSpeed)&&t.maxPathSpeed>.05&&t.maxPathSpeed<=1)out.maxPathSpeed=t.maxPathSpeed;return out;}

  // ---------------------------------------------------------------- clock
  play(){if(!this.world)throw Error('Load the simulation first.');this.playing=true;this.anchor=null;if(!this.timer){this.timer=setInterval(()=>void this.pump(),4);this.timer.unref?.();}this.emitFrame(true);}
  pause(){this.playing=false;this.emitFrame(true);}
  setSpeed(speed){this.speed=clamp(finite(speed)?speed:1,.1,4);this.anchor=null;}
  manual(input){
    if(!input){this.manualInput=null;return;}
    const n=v=>finite(v)?clamp(v,-1,1):0;this.manualInput={x:n(input.x),y:n(input.y),turn:n(input.turn),fieldCentric:!!input.fieldCentric,precision:!!input.precision};
    if(this.mode==='idle'&&(this.manualInput.x||this.manualInput.y||this.manualInput.turn))this.mode='manual';
  }
  manualCommand(){
    const m=this.manualInput;if(!m)return {...ZERO};const h=this.world.robots[0].heading,k=m.precision?.4:1;let forward=m.y,left=-m.x;
    if(m.fieldCentric){forward=m.x*Math.cos(h)+m.y*Math.sin(h);left=-m.x*Math.sin(h)+m.y*Math.cos(h);}
    return {forward:forward*k,strafe:left*k,turn:-m.turn*k};
  }
  async pump(){
    if(this.busy||!this.playing||!this.world)return;
    const dt=this.dsim.SIM_DT,now=this.now();if(!this.anchor)this.anchor={wall:now,sim:this.world.time};
    let due=Math.floor(((now-this.anchor.wall)/1000*this.speed-(this.world.time-this.anchor.sim))/dt);
    if(due>8){this.anchor={wall:now,sim:this.world.time};due=1;}
    this.busy=true;
    try{for(let i=0;i<due&&this.playing;i++){if(this.mode==='program')await this.programTick();else this.tick(this.manualCommand());}}
    catch(e){this.fail(e.message);}finally{this.busy=false;}
    if(now-this.lastFrame>=32)this.emitFrame();
  }
  tick(cmd){
    this.command=cmd;this.physicsStep(this.world,cmd);const t=this.truth(),reading=this.sensors.read(t,this.dsim.SIM_DT);
    if(this.world.tick%3===0){this.trail.push({x:t.x,y:t.y,e:this.estimate?{x:this.estimate.x,y:this.estimate.y}:null});if(this.trail.length>2400)this.trail.splice(0,600);}
    const corners=planner.body({x:t.x,y:t.y,heading:t.heading*DEG},this.info.footprint);
    const hit=this.zones.filter(z=>planner.overlap(corners,planner.polygon(z))).map(z=>z.id);
    if(hit.length){this.violations=this.violations||new Set();for(const id of hit)this.violations.add(id);}
    this.hit=hit;return reading;
  }
  step(count=1){for(let i=0;i<count;i++)this.tick(this.manualCommand());this.emitFrame(true);}

  // ---------------------------------------------------------------- programs
  async run(program={}){
    if(!this.world)throw Error('Load the simulation first.');
    const kind=program.kind==='source'?'source':'route';
    if(kind==='route'&&!program.route?.segments?.length)throw Error('Plan a route first.');
    if(this.config.sensors.localization==='gyro'&&kind==='route')throw Error('Gyro-only sensing cannot measure X/Y, so Pedro cannot follow a path. Choose simulated odometry pods or drive encoders.');
    if(kind==='source'&&(typeof program.source!=='string'||!program.source.trim()))throw Error('Choose a Java program first.');
    if(kind==='source'&&program.source.length>200000)throw Error('Program source is limited to 200 KB.');
    this.stopProgram('Restarted.');this.build();this.violations=new Set();
    const seq=++this.runSeq,java=path.join(this.runtimeDir,'java/bin',process.platform==='win32'?'java.exe':'java');
    if(!fs.existsSync(java))throw Error('The simulator Java runtime is missing. Rebuild with tools/simulation/build.cjs.');
    const dir=path.join(this.workDir,`run-${process.pid}-${seq}`);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
    const cp=[path.join(this.runtimeDir,'pedro/classes'),path.join(this.runtimeDir,'pedro/gson.jar')].join(path.delimiter);
    const child=spawn(java,['-Xmx256m','-Xss4m','-XX:+UseSerialGC','-XX:TieredStopAtLevel=1','-Dfile.encoding=UTF-8','-cp',cp,'deck.sim.PedroBridge'],{cwd:dir,stdio:['pipe','pipe','pipe'],windowsHide:true});
    const bridge={child,seq,dir,buffer:'',stderr:'',waiters:[],exited:false,started:this.now(),kind,ticks:0};this.child=bridge;
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{bridge.buffer+=chunk;if(bridge.buffer.length>1<<20){this.fail('Program output exceeded the protocol limit.',seq);return;}let i;while((i=bridge.buffer.indexOf('\n'))>=0){const line=bridge.buffer.slice(0,i);bridge.buffer=bridge.buffer.slice(i+1);let msg;try{msg=JSON.parse(line);}catch{this.fail('The Pedro bridge sent an unreadable reply.',seq);return;}const w=bridge.waiters.shift();if(w)w.resolve(msg);}});
    child.stderr.on('data',chunk=>{if(bridge.stderr.length<20000)bridge.stderr+=chunk;});
    child.on('error',e=>{bridge.exited=true;for(const w of bridge.waiters.splice(0))w.reject(Error('Java could not start: '+e.message));});
    child.on('exit',code=>{bridge.exited=true;for(const w of bridge.waiters.splice(0))w.reject(Error(`The Pedro process exited (code ${code}).${bridge.stderr?' '+bridge.stderr.trim().slice(-500):''}`));});
    child.stdin.on('error',()=>{});
    const t=this.truth(),route=kind==='route'||program.route?.segments?.length?{heading:program.route.heading/DEG,segments:program.route.segments,pins:program.route.pins||[]}:null;
    const init={type:'init',workDir:dir,program:kind==='source'?{kind,source:program.source}:{kind},start:{x:t.x,y:t.y,heading:t.heading},route,
      drive:{kind:this.info.robot.drivetrain,halfLength:this.info.robot.length/2,halfWidth:this.info.robot.width/2},tuning:this.info.tuning};
    this.mode='program';this.playing=false;this.result=null;this.emit({type:'run',state:'starting',kind});this.emitFrame(true);
    let ready;try{ready=await this.request(bridge,init,30000,'Compiling and starting the program');}catch(e){if(seq===this.runSeq)this.fail(e.message,seq);return {ok:false,error:e.message};}
    if(seq!==this.runSeq)return {ok:false,error:'Stopped.'};
    if(ready.type==='error'){this.fail(this.describe(ready),seq,ready);return {ok:false,error:this.describe(ready)};}
    this.emit({type:'run',state:'running',kind,program:ready.program,log:ready.log});this.play();return {ok:true,program:ready.program};
  }
  request(bridge,message,timeout,what){
    return new Promise((resolve,reject)=>{
      if(bridge.exited)return reject(Error('The Pedro process is not running.'));
      const waiter={resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}};
      const timer=setTimeout(()=>{const i=bridge.waiters.indexOf(waiter);if(i>=0)bridge.waiters.splice(i,1);reject(Error(`${what} took longer than ${timeout/1000} s. The program may be stuck in a loop or waiting; loop() must return every tick.`));},timeout);
      bridge.waiters.push(waiter);const line=JSON.stringify(message);if(line.length>1<<20)return waiter.reject(Error('Program message too large.'));
      bridge.child.stdin.write(line+'\n');
    });
  }
  async programTick(){
    const bridge=this.child;if(!bridge||bridge.seq!==this.runSeq){this.mode='idle';return;}
    const reading=this.tick(this.command),seq=bridge.seq;bridge.ticks++;
    const msg={type:'tick',seq:bridge.ticks,t:this.world.time,dt:this.dsim.SIM_DT,odo:reading.odo,imu:reading.imu};
    // The first ticks include JIT warm-up; later ticks must return promptly.
    let reply;try{reply=await this.request(bridge,msg,bridge.ticks<30?5000:750,'One loop() call');}catch(e){this.fail(e.message,seq);return;}
    if(seq!==this.runSeq)return; // stopped while waiting: discard the stale reply
    if(reply.type==='error'){this.fail(this.describe(reply),seq,reply);return;}
    const d=reply.drive||{},n=v=>finite(v)?clamp(v,-1,1):0;this.command={forward:n(d.forward),strafe:n(d.strafe),turn:n(d.turn)};
    this.estimate=reply.estimate;this.follower=reply.follower;this.telemetry=reply.telemetry;
    if(reply.log?.length)this.emit({type:'log',lines:reply.log.slice(-60)});
    if(reply.done)this.finish(seq);
  }
  finish(seq){
    if(seq!==this.runSeq)return;const t=this.truth();
    this.result={reason:'finished',kind:this.child?.kind,time:this.world.time,truth:{x:t.x,y:t.y,heading:t.heading*DEG},estimate:this.estimate&&{x:this.estimate.x,y:this.estimate.y,heading:this.estimate.heading*DEG},violations:[...(this.violations||[])]};
    this.stopProgram();this.emit({type:'run',state:'finished',result:this.result});this.emitFrame(true);
  }
  describe(reply){const where={compile:'Compile error',load:'Could not load the program',init:'init() failed',loop:'loop() failed',bridge:'Pedro bridge error'}[reply.stage]||'Program error';return `${where}: ${reply.message}`;}
  fail(message,seq=this.runSeq,reply){
    if(seq!==this.runSeq)return;this.stopProgram();this.playing=false;
    this.emit({type:'run',state:'error',error:message,trace:reply?.trace||[],diagnostics:reply?.trace||[],log:reply?.log||[]});this.emitFrame(true);
  }
  // Ends any program: invalidates pending replies, kills the Java process and zeroes the drive.
  stopProgram(reason){
    const bridge=this.child;this.runSeq++;this.child=null;this.command={...ZERO};this.manualInput=null;
    if(this.mode==='program'||this.mode==='manual')this.mode='idle';
    if(bridge){for(const w of bridge.waiters.splice(0))w.reject(Error(reason||'Stopped.'));try{bridge.child.stdin.end(JSON.stringify({type:'stop'})+'\n');}catch{}try{bridge.child.kill();}catch{}setTimeout(()=>{try{fs.rmSync(bridge.dir,{recursive:true,force:true});}catch{}},2000).unref?.();}
  }
  stop(){const running=!!this.child;this.stopProgram('Stopped.');if(running)this.emit({type:'run',state:'stopped'});this.emitFrame(true);}
  reset(){this.stopProgram('Reset.');this.playing=false;this.build();this.violations=new Set();this.estimate=null;this.follower=null;this.telemetry=null;this.emit({type:'run',state:'reset'});this.emitFrame(true);}
  setZones(zones){this.zones=Array.isArray(zones)?zones.slice(0,24).map(z=>{try{return planner.validateZone(z);}catch{return null;}}).filter(Boolean):[];}
  setStart(start){if(!start||![start.x,start.y,start.heading].every(finite))throw Error('Invalid start pose.');this.config.start={...start};if(this.mode!=='program'){this.playing=false;this.build();this.emitFrame(true);}}

  // ---------------------------------------------------------------- frames
  frame(){
    const t=this.truth();
    return {type:'frame',time:this.world.time,tick:this.world.tick,mode:this.mode,playing:this.playing,speed:this.speed,
      truth:{x:t.x,y:t.y,heading:t.heading*DEG,vx:t.vx,vy:t.vy,omega:t.omega*DEG,z:t.z},command:this.command,
      estimate:this.estimate?{x:this.estimate.x,y:this.estimate.y,heading:this.estimate.heading*DEG}:null,
      follower:this.follower||null,telemetry:this.telemetry||null,hit:this.hit||[],violations:[...(this.violations||[])],result:this.result,
      world:this.world};
  }
  emitFrame(force=false){if(!this.world)return;const now=this.now();if(!force&&now-this.lastFrame<32)return;this.lastFrame=now;this.emit(this.frame());}
  dispose(){this.stopProgram('Closed.');this.playing=false;if(this.timer)clearInterval(this.timer);this.timer=null;if(this.world?.game==='biobuzz')this.dsim.disposePhysics3dFor(this.world);this.world=null;}
}
module.exports={SimEngine,FIELDS,LOCALIZATION,OFFSET,sensorConfig,robotConfig};
