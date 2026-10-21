'use strict';
// Offline simulator core. Runs in the simulation utility process (src/sim-host.cjs) or directly in
// tests. Physics is DSIM's own (sim-runtime/dsim-host.cjs); autonomous programs run in a Pedro
// Pathing Java process in lockstep with the physics clock. Nothing here touches a real robot.
//
// Frames: the app uses inches with a bottom-left origin (+X right, +Y up, heading CCW from +X).
// DSIM is centred on the field. Standard games add 72 on each axis; custom empty fields add
// half their configured width/depth. Headings are identical.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const planner=require('../ui/sim-planner.js');
const config=require('../ui/sim-config.js');
const {PracticeClock}=require('./sim-practice.cjs');
const Timed=require('../ui/sim-timed.js');
const OFFSET=72,DEG=180/Math.PI,ZERO={forward:0,strafe:0,turn:0};
const FIELDS={empty:'Empty field',decode:'DECODE',biobuzz:'BIOBUZZ'};
// What each game's planning obstacles are, for the UI.
const OBSTACLES={empty:'',decode:'goals and ramps',biobuzz:'hive legs and flower bases'};
const LOCALIZATION=Object.fromEntries(Object.entries(config.sensors).map(([k,v])=>[k,v.name]));
const finite=n=>typeof n==='number'&&Number.isFinite(n),clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

// Seeded normal noise so a run is reproducible.
function rng(seed){let s=(seed>>>0)||1;const u=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return (s+.5)/4294967296;};return ()=>Math.sqrt(-2*Math.log(u()))*Math.cos(2*Math.PI*u());}

function sensorConfig(raw={}){
  const mode=Object.hasOwn(LOCALIZATION,raw.localization)?raw.localization:'encoders';
  const defaults=config.sensors[mode].error;
  const num=(v,d,max)=>finite(v)?clamp(v,0,max):d;
  return {localization:mode,scaleError:num(raw.scaleError,defaults[0],.1),noise:num(raw.noise,defaults[1],.5),gyroDrift:num(raw.gyroDrift,defaults[2],10),seed:finite(raw.seed)?raw.seed>>>0:1};
}

// Simulated sensors read the TRUTH and return what a localizer would measure: a robot-frame
// displacement from odometry (scale error, per-tick noise) and an IMU heading (drift, noise).
class Sensors{
  constructor(config,truth){this.config=config;this.normal=rng(config.seed);this.last={...truth};this.drift=0;this.heading=truth.heading;}
  read(truth,dt){
    const c=this.config,mid=this.last.heading+wrap(truth.heading-this.last.heading)/2,fx=truth.x-this.last.x,fy=truth.y-this.last.y;
    let dx=fx*Math.cos(mid)+fy*Math.sin(mid),dy=-fx*Math.sin(mid)+fy*Math.cos(mid);const turn=wrap(truth.heading-this.last.heading);this.last={...truth};
    const profile=config.sensors[c.localization];if(c.localization==='none')return {odo:null,imu:this.heading};
    this.drift+=c.gyroDrift/60/DEG*dt;const imu=truth.heading+this.drift+(c.localization==='ideal'?0:this.normal()*.0005);
    if(!profile.translation)return {odo:null,imu};
    if(!profile.imu)this.heading+=turn*(1+c.scaleError)+this.normal()*c.noise*Math.abs(turn);
    if(c.localization!=='ideal'){const n=c.noise*Math.hypot(dx,dy);dx=dx*(1+c.scaleError)+this.normal()*n;dy=dy*(1+c.scaleError)+this.normal()*n;}
    return {odo:{dx,dy},imu:profile.imu?imu:this.heading};
  }
}

function robotConfig(raw={}){
  return config.robot(raw);
}

class SimEngine{
  constructor({runtimeDir=path.join(__dirname,'../sim-runtime'),workDir,emit=()=>{},now=()=>performance.now()}={}){
    this.runtimeDir=runtimeDir;this.workDir=workDir||path.join(require('node:os').tmpdir(),'deck-sim');this.emit=emit;this.now=now;
    this.dsim=require(path.join(runtimeDir,'dsim-host.cjs'));this.ready=null;
    this.world=null;this.info=null;this.config=null;this.mode='idle';this.playing=false;this.speed=1;this.manualInput=null;this.practice=null;this.practiceInputAt=-Infinity;
    this.command={...ZERO};this.runSeq=0;this.child=null;this.pending=null;this.timer=null;this.busy=false;this.lastFrame=0;this.result=null;this.zones=[];
  }
  init(){return this.ready||(this.ready=(async()=>{await this.dsim.initPhysics();await this.dsim.initPhysics3d();})());}

  // ---------------------------------------------------------------- world
  async load(raw={}){
    await this.init();this.stopProgram('Simulation reloaded.');this.practice=null;this.playing=false;this.lastLoad=raw;
    const field=Object.hasOwn(FIELDS,raw.field)?raw.field:'empty',physics=field==='biobuzz'&&raw.physics!=='2d'?'3d':'2d';
    const start=raw.start&&[raw.start.x,raw.start.y,raw.start.heading].every(finite)?{x:raw.start.x,y:raw.start.y,heading:raw.start.heading}:{x:9,y:72,heading:0};
    this.config={field,physics,start,controller:raw.controller==='motionmodule'?'motionmodule':'ftc',timing:Timed.settings(raw.timing),elements:field!=='empty'&&raw.elements!==false,robot:robotConfig(raw.robot),bounds:config.bounds({...raw,field}),sensors:sensorConfig(raw.controller==='motionmodule'?{...raw.sensors,localization:config.localization('motionmodule',raw.sensors?.localization)}:raw.sensors),tuning:raw.tuning&&typeof raw.tuning==='object'?raw.tuning:{}};this._empty=null;
    this.origin=field==='empty'?{x:this.config.bounds.x1/2,y:this.config.bounds.y1/2}:{x:OFFSET,y:OFFSET};
    this.zones=Array.isArray(raw.zones)?raw.zones.slice(0,24).map(z=>{try{return planner.validateZone(z);}catch{return null;}}).filter(Boolean):[];
    this.build();
    const r=this.world.robots[0],D=this.dsim,ext=D.footprintExtents(r.spec),dp=D.driveParams(r.spec);
    const mod=this.module(),walls=4,bounds=mod?mod.bounds:{halfX:OFFSET,halfY:OFFSET};
    const fieldZones=mod?mod.colliders.statics.slice(walls).map((s,i)=>({id:`field-${i}`,type:'rect',x:s.tx+OFFSET,y:s.ty+OFFSET,width:2*s.hx,height:2*s.hy,angle:s.rot*DEG})):[];
    if(field==='decode')for(const a of ['red','blue'])fieldZones.push({id:'goal-'+a,type:'polygon',points:D.goalTriangle(a).map(p=>({x:p.x+OFFSET,y:p.y+OFFSET}))});
    // BIOBUZZ's 3D structures (hive frames, flower supports), for drawing only: planning uses the
    // floor-level obstacles above, which are the same solids DSIM's planar solve uses.
    const structures=field==='biobuzz'?D.cadStatics().map(s=>{const p=[];for(let i=0;i<s.points.length;i+=3)p.push(+(s.points[i]+OFFSET).toFixed(3),+(s.points[i+1]+OFFSET).toFixed(3),+s.points[i+2].toFixed(3));return p;}):[];
    const structureParts=field==='biobuzz'?D.cadStatics().map((s,i)=>({name:s.name,kind:s.class,points:structures[i]})):[];
    if(field==='biobuzz'){const data=D.fieldColliders3d();for(const a of ['red','blue']){const tray=data.trays[a],angle=D.cadCaptureTheta(a),c=Math.cos(angle),s=Math.sin(angle);for(const hull of tray.hulls){const points=[];for(let i=0;i<hull.points.length;i+=3){const [x,y,z]=hull.points.slice(i,i+3);points.push(x+tray.pivot[0]+OFFSET,y*c-z*s+tray.pivot[1]+OFFSET,y*s+z*c+tray.pivot[2]);}structureParts.push({name:a+' '+hull.name,kind:hull.class,alliance:a,points});}}}
    const flowers=field==='biobuzz'?D.fieldColliders3d().flowers.map(f=>({name:f.id,rings:f.rings.map(r=>({z:r.z,hole:r.hole,x:r.bore[0]+OFFSET,y:r.bore[1]+OFFSET}))})):[];
    const goals=field==='decode'?['red','blue'].map(alliance=>{const rect=D.classifierRect(alliance);return {alliance,triangle:D.goalTriangle(alliance).map(p=>({x:p.x+OFFSET,y:p.y+OFFSET})),openingZ:D.GOAL_OPENING_Z,classifier:{x0:rect.x0+OFFSET,x1:rect.x1+OFFSET,y0:rect.y0+OFFSET,y1:rect.y1+OFFSET,height:D.CLASSIFIER_HEIGHT}};}):[];
    const trays=field==='biobuzz'?Object.fromEntries(['red','blue'].map(a=>[a,{pivot:D.fieldColliders3d().trays[a].pivot.map((v,i)=>v+(i<2?OFFSET:0)),reference:D.cadCaptureTheta(a)}])):{};
    this.info={field,fieldName:FIELDS[field],obstacleName:OBSTACLES[field],physics,structures,structureParts,flowers,goals,trays,
      bounds:field==='empty'?this.config.bounds:{x0:OFFSET-bounds.halfX,y0:OFFSET-bounds.halfY,x1:OFFSET+bounds.halfX,y1:OFFSET+bounds.halfY},fieldZones,
      footprint:{front:ext.front,rear:ext.rear,half:ext.half},
      robot:{...this.config.robot},driveProfile:config.drives[this.config.robot.drivetrain],
      drive:{maxSpeed:dp.maxSpeed,maxStrafe:dp.maxSpeed*dp.strafeMult,maxTurnDeg:dp.maxTurn*DEG,accel:dp.accel},
      sensors:this.config.sensors,localizationName:LOCALIZATION[this.config.sensors.localization],tuning:this.tuning(r.spec)};
    this.emitFrame(true);return this.info;
  }
  module(){return this.config.field==='empty'?null:this.dsim.SIM_GAMES[this.config.field];}
  build(){
    const D=this.dsim;if(this.world?.game==='biobuzz')D.disposePhysics3dFor(this.world);
    const c=this.config,engineDrive=config.drives[c.robot.drivetrain].engine,spec=D.coerceSpec({...D.DEFAULT_SPEC,...c.robot,drivetrain:engineDrive,intake:'sloped'},D.DEFAULT_SPEC,c.field==='biobuzz'?'biobuzz':'decode');
    const setup={id:0,alliance:'blue',spec,assists:{fieldCentric:false,aimAssist:false,autoIntake:false,autoFire:false},startIndex:0};
    const mod=this.module();
    this.world=mod?mod.createWorld('free',1,[setup],undefined,c.physics):D.SIM_GAMES.decode.createWorld('free',1,[setup]);
    this.world.balls=c.elements?this.world.balls.filter(b=>b.state?.kind!=='held'):[];if(Array.isArray(this.world.robots[0].hopper))this.world.robots[0].hopper=[];
    this.applyBarriers();
    const r=this.world.robots[0],p={x:c.start.x-this.origin.x,y:c.start.y-this.origin.y};
    // The game engine's competition limits do not apply to an offline pushbot. Override after
    // spawn coercion, before the first physics step (including lazy Rapier body construction).
    Object.assign(r.spec,{length:c.robot.length,width:c.robot.width,heightIn:c.robot.heightIn,stowHeightIn:c.robot.heightIn,massLb:c.robot.massLb,driveRpm:c.robot.driveRpm,deckDriveAmps:c.robot.driveAmps,drivetrain:engineDrive,deckIntakeReach:c.robot.intakeIn});
    Object.assign(r,{pos:p,heading:c.start.heading/DEG,turretHeading:c.start.heading/DEG,vel:{x:0,y:0},angVel:0,fieldCentric:false,aimAssist:false,autoIntake:false,autoFire:false});
    this.sensors=new Sensors(c.sensors,this.truth());this.estimate=null;this.command={...ZERO};this.result=null;this.trail=[];
  }
  colliders(){const T=10,b=this.config.bounds,x0=b.x0-this.origin.x,x1=b.x1-this.origin.x,y0=b.y0-this.origin.y,y1=b.y1-this.origin.y,w=x1-x0,h=y1-y0,wall=(tx,ty,hx,hy)=>({tx,ty,hx,hy,rot:0});return this._empty||(this._empty={statics:[wall(x0-T,(y0+y1)/2,T,h/2+2*T),wall(x1+T,(y0+y1)/2,T,h/2+2*T),wall((x0+x1)/2,y0-T,w/2+2*T,T),wall((x0+x1)/2,y1+T,w/2+2*T,T)],bounds:{halfX:w/2,halfY:h/2}});}
  applyBarriers(){const triangles=[];for(const zone of this.zones){let p=planner.polygon(zone);if(p.length===2){const [a,b]=p,angle=Math.atan2(b.y-a.y,b.x-a.x)*DEG;p=planner.polygon({type:'rect',x:(a.x+b.x)/2,y:(a.y+b.y)/2,width:Math.hypot(b.x-a.x,b.y-a.y),height:1,angle});}const points=p.flatMap(q=>[q.x-this.origin.x,q.y-this.origin.y]),indices=this.dsim.Earcut.triangulate(points);for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3).flatMap(j=>points.slice(j*2,j*2+2)));}this.world.deckPolygons=triangles;}
  physicsStep(world,cmd){
    const D=this.dsim,dt=D.SIM_DT,input={driveX:-cmd.strafe,driveY:cmd.forward,rotate:cmd.turn,leftDrive:clamp(cmd.forward-cmd.turn,-1,1),rightDrive:clamp(cmd.forward+cmd.turn,-1,1),intake:false,fire:false};
    const mod=world===this.world?this.module():null;
    if(mod){const previous=mod.colliders.deckPolygons;mod.colliders.deckPolygons=world.deckPolygons;try{mod.step(world,dt,new Map([[0,input]]));}finally{mod.colliders.deckPolygons=previous;}}
    else{world.time+=dt;world.tick++;const r=world.robots[0],wrench=D.updateRobot(world,r,input,dt),colliders={...this.colliders(),deckPolygons:world.deckPolygons};D.solveRobots(world,dt,colliders,undefined,new Map([[r.id,wrench]]));}
  }
  truth(){const r=this.world.robots[0];return {x:r.pos.x+this.origin.x,y:r.pos.y+this.origin.y,heading:r.heading,vx:r.vel.x,vy:r.vel.y,omega:r.angVel,z:r.z||0};}

  // Measure the simulated drivetrain the way Pedro's tuning OpModes measure a robot: free speed,
  // then braking distance from two speeds (forward, strafe, turn) on a separate empty world.
  tuning(spec){
    const D=this.dsim,key=JSON.stringify([spec.drivetrain,spec.length,spec.width,spec.intake,spec.deckIntakeReach,spec.massLb,spec.driveRpm,spec.deckDriveAmps]);
    if(this._tuning?.key===key)return {...this._tuning.value,...this.userTuning()};
    const make=()=>{const w=D.SIM_GAMES.decode.createWorld('free',1,[{id:0,alliance:'blue',spec,assists:{fieldCentric:false,aimAssist:false,autoIntake:false,autoFire:false},startIndex:0}]);w.balls=[];Object.assign(w.robots[0].spec,spec);Object.assign(w.robots[0],{pos:{x:0,y:0},heading:0,vel:{x:0,y:0},angVel:0,fieldCentric:false,autoIntake:false,autoFire:false,aimAssist:false,hopper:[]});return w;};
    const brake=(axis,power)=>{if(axis==='strafe'&&D.driveParams(spec).strafeMult===0)return brake('forward',power);const w=make(),r=w.robots[0],cmd={...ZERO,[axis]:power};
      // Far walls: measure free motion, not a collision.
      const saved=this._empty;this._empty={statics:[],bounds:{halfX:1e6,halfY:1e6}};
      const dp=D.driveParams(spec),limit=axis==='turn'?dp.maxTurn:dp.maxSpeed*(axis==='strafe'?dp.strafeMult:1),accel=axis==='turn'?dp.turnAccel:dp.accel,steps=Math.min(18000,Math.max(90,Math.ceil(4*limit/Math.max(.01,accel)/D.SIM_DT)));
      try{for(let i=0;i<steps;i++)this.physicsStep(w,cmd);const v=axis==='turn'?r.angVel:Math.hypot(r.vel.x,r.vel.y),p0={...r.pos},h0=r.heading;for(let i=0;i<Math.max(120,steps);i++){this.physicsStep(w,ZERO);if(Math.hypot(r.vel.x,r.vel.y)<1e-5&&Math.abs(r.angVel)<1e-5)break;}
        return {v:Math.abs(v),d:axis==='turn'?Math.abs(r.heading-h0):Math.hypot(r.pos.x-p0.x,r.pos.y-p0.y)};}finally{this._empty=saved;}};
    // Foresight solves q·v² + l·v = distance; with l = 0 and distance 0 its root is 0/0 = NaN at
    // the end of a path. Keep a 1 ms linear term (≤ 0.1 in of braking at full speed).
    const LINEAR_MIN=1e-3,fit=(a,b)=>{const det=a.v*a.v*b.v-b.v*b.v*a.v;if(Math.abs(det)<1e-9)return {q:Math.max(1e-6,a.d/Math.max(1e-9,a.v*a.v)),l:LINEAR_MIN};const q=(a.d*b.v-b.d*a.v)/det,l=(a.v*a.v*b.d-b.v*b.v*a.d)/det;return {q:Math.max(q,1e-6),l:Math.max(l,LINEAR_MIN)};};
    const fwd=brake('forward',1),f=fit(fwd,brake('forward',.5)),tank=D.driveParams(spec).strafeMult===0;
    const str=tank?fwd:brake('strafe',1),s=tank?f:fit(str,brake('strafe',.5)),h=fit(brake('turn',1),brake('turn',.5));
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
  pause(){this.playing=false;this.manualInput=null;if(this.practice)this.practice.neutralRequired=true;this.emitFrame(true);}
  setSpeed(speed){this.speed=clamp(finite(speed)?speed:1,.1,4);this.anchor=null;}
  manual(input){
    if(!input){this.manualInput=null;return;}
    const n=v=>finite(v)?clamp(v,-1,1):0;this.manualInput={x:n(input.x),y:n(input.y),turn:n(input.turn),fieldCentric:!!input.fieldCentric,precision:!!input.precision};
    if(this.mode==='idle'&&(this.manualInput.x||this.manualInput.y||this.manualInput.turn))this.mode='manual';
  }
  manualCommand(){
    const m=this.manualInput;if(!m)return {...ZERO};const h=this.world.robots[0].heading,k=m.precision?.4:1;let forward=m.y,left=-m.x;
    if(m.fieldCentric){forward=m.x*Math.cos(h)+m.y*Math.sin(h);left=-m.x*Math.sin(h)+m.y*Math.cos(h);if(!config.drives[this.config.robot.drivetrain].holonomic){const magnitude=Math.hypot(m.x,m.y),error=wrap(Math.atan2(m.y,m.x)-h);return {forward:magnitude>.05?Math.min(1,magnitude)*Math.max(0,Math.cos(error))*(Math.abs(error)<.2?1:0)*k:0,strafe:0,turn:clamp((magnitude>.05?error*1.5:0)-m.turn,-1,1)*k};}}
    return {forward:forward*k,strafe:left*k,turn:-m.turn*k};
  }
  async pump(){
    if(this.busy||!this.playing||!this.world)return;
    const dt=this.dsim.SIM_DT,now=this.now();if(!this.anchor)this.anchor={wall:now,sim:this.world.time};
    let due=Math.floor(((now-this.anchor.wall)/1000*this.speed-(this.world.time-this.anchor.sim))/dt);
    if(due>8){this.anchor={wall:now,sim:this.world.time};due=1;}
    this.busy=true;
    try{for(let i=0;i<due&&this.playing;i++)await this.practiceTick();}
    catch(e){this.fail(e.message);}finally{this.busy=false;}
    if(now-this.lastFrame>=32)this.emitFrame();
  }
  tick(cmd){
    this.command=cmd;this.physicsStep(this.world,cmd);const t=this.truth(),reading=this.sensors.read(t,this.dsim.SIM_DT);
    if(this.world.tick%3===0){this.trail.push({x:t.x,y:t.y,e:this.estimate?{x:this.estimate.x,y:this.estimate.y}:null});if(this.trail.length>2400)this.trail.splice(0,600);}
    const corners=planner.body({x:t.x,y:t.y,heading:t.heading*DEG},this.info.footprint);
    const hit=this.zones.filter(z=>planner.zoneHits(corners,z)).map(z=>z.id);
    if(hit.length){this.violations=this.violations||new Set();for(const id of hit)this.violations.add(id);}
    this.hit=hit;return reading;
  }
  step(count=1){for(let i=0;i<count;i++)this.tick(this.manualCommand());this.emitFrame(true);}

  // ---------------------------------------------------------------- programs
  async startPractice(raw={}){
    this.stop();this.practice=null;
    if(!planner.safePose(this.config.start,[],this.info.footprint,this.info.bounds))throw Error('The starting robot footprint must fit inside this field. Change the field size, robot size or starting pose.');
    if(raw.mode==='teleop'){this.reset();this.practice=new PracticeClock('teleop',raw.timing);this.mode='manual';this.play();return {ok:true};}
    const result=await this.run(raw.program||{});if(result.ok)this.practice=new PracticeClock(raw.mode,raw.timing);this.emitFrame(true);return result;
  }
  practiceInput(pad){
    if(!this.practice||this.practice.phase!=='teleop'||!this.playing){this.manualInput=null;return;}
    const n=v=>finite(v)?clamp(v,-1,1):0,valid=pad&&pad.mapping==='standard',x=valid?n(pad.axes?.[0]):0,y=valid?-n(pad.axes?.[1]):0,turn=valid?n(pad.axes?.[2]):0;
    if(!valid){this.manualInput=null;this.practice.neutralRequired=true;return;}
    if(this.practice.neutralRequired){this.manualInput=null;if(Math.max(Math.abs(x),Math.abs(y),Math.abs(turn))<=.06){this.practice.neutralRequired=false;this.practiceInputAt=this.now();}return;}
    this.practiceInputAt=this.now();this.manualInput={x,y,turn,fieldCentric:this.config.robot.driveStyle==='field',precision:!!pad.buttons?.[4]?.pressed};
  }
  async practiceTick(){
    const practice=this.practice,seq=this.runSeq;
    if(practice&&practice.phase==='teleop'&&this.now()-this.practiceInputAt>500){this.manualInput=null;practice.neutralRequired=true;}
    if(this.mode==='program')await this.programTick();else if(this.mode==='timed')this.timedTick();else this.tick(practice&&practice.phase!=='teleop'?ZERO:this.manualCommand());
    if(!practice||practice!==this.practice||!this.playing)return;
    // A run failure invalidates the session; a clean early finish holds still until AUTO ends.
    if(seq!==this.runSeq&&this.child)return;
    const change=practice.advance(this.dsim.SIM_DT);if(!change)return;
    if(change.from==='auto'&&(this.child||this.timed)){const t=this.truth();this.result={reason:'time-limit',kind:this.child?.kind||'timed',time:this.world.time,truth:{x:t.x,y:t.y,heading:t.heading*DEG},violations:[...(this.violations||[])]};this.emit({type:'run',state:'auto-time-limit',result:this.result});}
    this.stopProgram('Practice phase ended.');const r=this.world.robots[0];r.vel={x:0,y:0};r.angVel=0;this.practiceInputAt=-Infinity;
    if(change.to==='teleop'){this.mode='manual';this.estimate=null;this.follower=null;this.telemetry=null;}
    if(change.to==='finished'){this.playing=false;this.emit({type:'run',state:'practice-finished',result:this.result});}
    this.emit({type:'practice',...practice.snapshot()});this.emitFrame(true);
  }
  async run(program={}){
    if(!this.world)throw Error('Load the simulation first.');
    if(!planner.safePose(this.config.start,[],this.info.footprint,this.info.bounds))throw Error('The starting robot footprint must fit inside this field. Change the field size, robot size or starting pose.');
    const kind=program.kind==='source'?'source':'route';
    if(kind==='route'&&!program.route?.segments?.length)throw Error('Plan a route first.');
    const timed=kind==='route'&&!config.sensors[this.config.sensors.localization].translation;
    if(kind==='source'&&!config.sensors[this.config.sensors.localization].translation)throw Error('IMU-only sensing cannot measure X/Y for this Pedro Java program. Run the timed planned route, or select odometry in the FTC setup.');
    if(kind==='route'&&!config.drives[this.config.robot.drivetrain].holonomic)program={...program,route:planner.tankRoute(program.route,this.zones.concat(this.info.fieldZones),this.info.footprint,this.info.bounds)};
    if(kind==='source'&&(typeof program.source!=='string'||!program.source.trim()))throw Error('Choose a Java program first.');
    if(kind==='source'&&program.source.length>200000)throw Error('Program source is limited to 200 KB.');
    this.stopProgram('Restarted.');this.build();this.violations=new Set();
    if(timed){this.timed=new Timed.Runner(program.route,this.config.timing);this.mode='timed';this.estimate=null;this.follower=null;this.emit({type:'run',state:'starting',kind:'timed'});this.emit({type:'run',state:'running',kind:'timed'});this.play();return {ok:true,program:'Timed power + IMU heading hold'};}
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
    const t=this.truth(),route=program.route?.segments?.length?{heading:program.route.heading/DEG,segments:program.route.segments,stops:(program.route.stops||[]).map(s=>({x:s.x,y:s.y,wait:finite(s.wait)?clamp(s.wait,0,30):0,action:typeof s.action==='string'?s.action.slice(0,40):'',segment:Number.isInteger(s.segment)?s.segment:-1}))}:null;
    const init={type:'init',workDir:dir,program:kind==='source'?{kind,source:program.source}:{kind},start:{x:t.x,y:t.y,heading:t.heading},route,
      drive:{kind:config.drives[this.info.robot.drivetrain].engine,halfLength:this.info.robot.length/2,halfWidth:this.info.robot.width/2},tuning:this.info.tuning};
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
    this.estimate=reply.estimate;this.follower=reply.follower;this.telemetry=reply.telemetry;this.waiting=reply.wait||null;
    if(reply.log?.length)this.emit({type:'log',lines:reply.log.slice(-60)});
    if(reply.done)this.finish(seq);
  }
  finish(seq){
    if(seq!==this.runSeq)return;const t=this.truth();
    this.result={reason:'finished',kind:this.timed?'timed':this.child?.kind,time:this.world.time,truth:{x:t.x,y:t.y,heading:t.heading*DEG},estimate:this.estimate&&{x:this.estimate.x,y:this.estimate.y,heading:this.estimate.heading*DEG},violations:[...(this.violations||[])]};
    this.stopProgram();this.emit({type:'run',state:'finished',result:this.result});this.emitFrame(true);
  }
  timedTick(){const runner=this.timed;if(!runner)return;const reading=this.tick(this.command),next=runner.advance(this.dsim.SIM_DT,reading.imu);this.command=next.drive;this.waiting=next.wait;this.follower={pathIndex:next.segment||0};this.estimate=null;if(next.done)this.finish(this.runSeq);}
  describe(reply){const where={compile:'Compile error',load:'Could not load the program',init:'init() failed',loop:'loop() failed',bridge:'Pedro bridge error'}[reply.stage]||'Program error';return `${where}: ${reply.message}`;}
  fail(message,seq=this.runSeq,reply){
    if(seq!==this.runSeq)return;this.stopProgram();this.playing=false;this.practice=null;
    this.emit({type:'run',state:'error',error:message,trace:reply?.trace||[],diagnostics:reply?.trace||[],log:reply?.log||[]});this.emitFrame(true);
  }
  // Ends any program: invalidates pending replies, kills the Java process and zeroes the drive.
  stopProgram(reason){
    const bridge=this.child;this.runSeq++;this.child=null;this.timed=null;this.command={...ZERO};this.manualInput=null;this.waiting=null;
    if(['program','manual','timed'].includes(this.mode))this.mode='idle';
    if(bridge){for(const w of bridge.waiters.splice(0))w.reject(Error(reason||'Stopped.'));try{bridge.child.stdin.end(JSON.stringify({type:'stop'})+'\n');}catch{}try{bridge.child.kill();}catch{}setTimeout(()=>{try{fs.rmSync(bridge.dir,{recursive:true,force:true});}catch{}},2000).unref?.();}
  }
  stop(){const running=!!this.child||!!this.timed||!!this.practice;this.practice=null;this.playing=false;this.stopProgram('Stopped.');if(this.world){this.world.robots[0].vel={x:0,y:0};this.world.robots[0].angVel=0;}if(running)this.emit({type:'run',state:'stopped'});this.emitFrame(true);}
  reset(){this.practice=null;this.stopProgram('Reset.');this.playing=false;this.build();this.violations=new Set();this.estimate=null;this.follower=null;this.telemetry=null;this.emit({type:'run',state:'reset'});this.emitFrame(true);}
  setZones(zones){this.zones=Array.isArray(zones)?zones.slice(0,24).map(z=>{try{return planner.validateZone(z);}catch{return null;}}).filter(Boolean):[];this.lastLoad={...this.lastLoad,zones:structuredClone(this.zones)};if(this.world){if(this.world.game==='biobuzz')this.dsim.disposePhysics3dFor(this.world);this.applyBarriers();}}
  setStart(start){if(!start||![start.x,start.y,start.heading].every(finite))throw Error('Invalid start pose.');if(this.practice||this.timed)this.stop();this.config.start={...start};this.lastLoad={...this.lastLoad,start:{...start}};if(this.mode!=='program'){this.playing=false;this.build();this.emitFrame(true);}}

  // Test-drive candidate routes on fresh, headless copies of this simulation (same field, robot,
  // sensors and follower) as fast as the CPU allows. Nothing here moves the visible robot.
  async evaluate(candidates,progress=()=>{}){
    if(!this.lastLoad)throw Error('Load the simulation first.');
    if(!Array.isArray(candidates)||!candidates.length||candidates.length>6)throw Error('Give 1 to 6 routes to compare.');
    const results=[],request=structuredClone(this.lastLoad);
    for(let i=0;i<candidates.length;i++){
      progress(i,candidates.length);
      let failure='';const trial=new SimEngine({runtimeDir:this.runtimeDir,workDir:path.join(this.workDir,'trial'),now:()=>0,emit:m=>{if(m.type==='run'&&m.state==='error')failure=m.error;}});
      try{
        await trial.load(request);const started=await trial.run({kind:'route',route:candidates[i]});
        if(!started.ok){results.push({ok:false,error:started.error});continue;}
        for(let guard=0;['program','timed'].includes(trial.mode)&&guard<3600;guard++)if(trial.mode==='timed')trial.timedTick();else await trial.programTick();
        const r=trial.result;results.push(r?{ok:true,time:r.time,violations:r.violations.length,truth:r.truth}:{ok:false,error:['program','timed'].includes(trial.mode)?'Did not finish within 60 s.':failure||'The test drive stopped early.'});
      }catch(e){results.push({ok:false,error:e.message});}finally{trial.dispose();}
    }
    return results;
  }

  // ---------------------------------------------------------------- frames
  frame(){
    const t=this.truth();
    return {type:'frame',time:this.world.time,tick:this.world.tick,mode:this.mode,playing:this.playing,speed:this.speed,
      truth:{x:t.x,y:t.y,heading:t.heading*DEG,vx:t.vx,vy:t.vy,omega:t.omega*DEG,z:t.z},command:this.command,
      estimate:this.estimate?{x:this.estimate.x,y:this.estimate.y,heading:this.estimate.heading*DEG}:null,
      follower:this.follower||null,telemetry:this.telemetry||null,hit:this.hit||[],violations:[...(this.violations||[])],result:this.result,wait:this.waiting||null,practice:this.practice?.snapshot()||null,execution:this.timed?'timed':this.child?'pedro':null,
      fieldState:{game:this.config.field,time:this.world.time,tick:this.world.tick,balls:this.world.balls.map(b=>({...b,pos:{...b.pos},state:{...b.state}})),robots:[],biobuzz:this.world.biobuzz?structuredClone(this.world.biobuzz):undefined}};
  }
  emitFrame(force=false){if(!this.world)return;const now=this.now();if(!force&&now-this.lastFrame<32)return;this.lastFrame=now;this.emit(this.frame());}
  dispose(){this.stopProgram('Closed.');this.playing=false;if(this.timer)clearInterval(this.timer);this.timer=null;if(this.world?.game==='biobuzz')this.dsim.disposePhysics3dFor(this.world);this.world=null;}
}
module.exports={SimEngine,FIELDS,LOCALIZATION,OFFSET,sensorConfig,robotConfig};
