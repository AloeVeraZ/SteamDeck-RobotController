(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckTimed=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),num=(v,f,a,b)=>typeof v==='number'&&Number.isFinite(v)?clamp(v,a,b):f;
  function settings(raw={}){return {power:num(raw.power,.45,.05,1),forwardSpeed:num(raw.forwardSpeed,60,1,500),strafeSpeed:num(raw.strafeSpeed,50,1,500),startup:num(raw.startup,.2,0,3),stopping:num(raw.stopping,0,0,2),strafeStopping:num(raw.strafeStopping,num(raw.stopping,0,0,2),0,2),headingP:num(raw.headingP,1.6,0,10)};}
  // Values a team would measure on the floor, taken from the simulated robot instead: speed at full
  // power, the time lost reaching cruise speed, and how far it rolls after power is cut (as time at cruise).
  function calibrate(tuning,drive,power=.45){const v=tuning.maxForward*power;
    return {forwardSpeed:+tuning.maxForward.toFixed(1),strafeSpeed:+tuning.maxStrafe.toFixed(1),startup:+Math.min(3,v/(2*Math.max(1,drive.accel))).toFixed(3),stopping:+Math.min(2,tuning.linearBrakeForward+tuning.quadraticBrakeForward*v).toFixed(3),
      strafeStopping:+Math.min(2,tuning.linearBrakeStrafe+tuning.quadraticBrakeStrafe*tuning.maxStrafe*power).toFixed(3)};}
  function point(points,t){let p=points.map(q=>({...q}));while(p.length>1)p=p.slice(1).map((q,i)=>({x:p[i].x+(q.x-p[i].x)*t,y:p[i].y+(q.y-p[i].y)*t}));return p[0];}
  function compile(route,raw={}){
    if(!route?.segments?.length)throw Error('Plan a route first.');const config=settings(raw),steps=[],stops=route.stops||[],waits=new Map(stops.map(s=>[s.segment,s]));let to=0;let stopped=true,h=(route.heading||0)*Math.PI/180;
    for(const [index,segment]of route.segments.entries()){
      // Tank routes turn before every leg; holonomic turning routes only where the heading changes.
      if(Number.isFinite(segment.heading)){const next=segment.heading*Math.PI/180;if(route.nonholonomic||Math.abs(Math.atan2(Math.sin(next-h),Math.cos(next-h)))>1e-6){steps.push({kind:'turn',heading:next,forward:0,strafe:0,seconds:30,segment:index});stopped=true;}h=next;}const points=segment.points;if(!points?.length||points.some(p=>![p.x,p.y].every(Number.isFinite)))throw Error('The route has invalid points.');const length=points.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-points[i].x,p.y-points[i].y),0),turning=Number.isFinite(segment.endHeading)&&Number.isFinite(segment.heading),count=Math.max(segment.type==='line'?1:Math.max(4,Math.ceil(length/5)),turning?Math.ceil(Math.abs(segment.endHeading-segment.heading)/10):1);let a=points[0];
      // A path the robot turns or spins along is driven in short pieces, each aimed at its share of the turn.
      while(to<stops.length-1&&stops[to].segment<index)to++;const moving=stops[to]?.path?.kind==='action'?String(stops[to].path.action||'Action path'):undefined,rad=d=>d*Math.PI/180,at=t=>rad(segment.heading+(segment.endHeading-segment.heading)*t);
      for(let i=1;i<=count;i++){if(turning)h=at((i-.5)/count);const b=point(points,i/count),dx=b.x-a.x,dy=b.y-a.y,forward=dx*Math.cos(h)+dy*Math.sin(h),left=-dx*Math.sin(h)+dy*Math.cos(h),duration=Math.max(Math.abs(forward)/(config.forwardSpeed*config.power),Math.abs(left)/(config.strafeSpeed*config.power));
        if(duration>1e-6){steps.push({heading:turning?at(i/count):h,...(turning?{mid:h}:{}),...(moving?{moving}:{}),forward:forward/(config.forwardSpeed*duration),strafe:route.nonholonomic?0:left/(config.strafeSpeed*duration),seconds:duration+(stopped?config.startup:0),segment:index});stopped=false;}a=b;}
      if(turning)h=rad(segment.endHeading);
      // At a pin: turn in place if it asks for a heading, then hold for its action and pause.
      const stop=waits.get(index);if(stop&&Number.isFinite(stop.turn)){const next=rad(stop.turn);if(Math.abs(Math.atan2(Math.sin(next-h),Math.cos(next-h)))>1e-6){steps.push({kind:'turn',heading:next,forward:0,strafe:0,seconds:30,segment:index});stopped=true;}h=next;}
      if(stop&&(stop.wait>0||stop.action)){steps.push({forward:0,strafe:0,seconds:Math.min(30,stop.wait||0),action:String(stop.action||''),segment:index});stopped=true;}}
    // Stop compensation: a drive step that ends in a stop ends early by the time the robot rolls on.
    for(let i=0;i<steps.length;i++){const s=steps[i],next=steps[i+1];if(s.kind!=='turn'&&(s.forward||s.strafe)&&(!next||next.kind==='turn'||(!next.forward&&!next.strafe))){const f=Math.abs(s.forward),l=Math.abs(s.strafe);s.seconds=Math.max(.02,s.seconds-(f*config.stopping+l*config.strafeStopping)/(f+l));}}
    if(!steps.length)throw Error('The route has no movement.');return {heading:h,config,steps,duration:steps.some(s=>s.kind==='turn')?null:steps.reduce((s,p)=>s+p.seconds,0)};
  }
  class Runner{
    constructor(route,config){this.plan=compile(route,config);this.index=0;this.elapsed=0;this.time=0;}
    advance(dt,imu){
      this.time+=dt;this.elapsed+=dt;let step=this.plan.steps[this.index];
      if(step?.kind==='turn'){
        const error=Math.atan2(Math.sin(step.heading-imu),Math.cos(step.heading-imu)),rate=this.lastImu===undefined?0:Math.atan2(Math.sin(imu-this.lastImu),Math.cos(imu-this.lastImu))/dt;this.lastImu=imu;
        this.settled=Math.abs(error)<Math.PI/120&&Math.abs(rate)<.12?(this.settled||0)+dt:0;
        if(this.settled>=.15){this.index++;this.elapsed=0;this.settled=0;this.lastImu=undefined;step=this.plan.steps[this.index];}
        else{if(this.elapsed>=step.seconds)throw Error('IMU chassis turn did not settle within 30 seconds.');return {done:false,drive:{forward:0,strafe:0,turn:clamp(error*Math.max(.5,this.plan.config.headingP)-rate*.08,-.5,.5)},segment:step.segment};}
      }else{
        while(step&&step.kind!=='turn'&&this.elapsed>=step.seconds){this.elapsed-=step.seconds;step=this.plan.steps[++this.index];}
        if(step?.kind==='turn'){this.elapsed=0;return {done:false,drive:{forward:0,strafe:0,turn:0},segment:step.segment};}
      }
      if(!step)return {done:true,drive:{forward:0,strafe:0,turn:0}};
      const target=step.heading??this.plan.heading,error=Math.atan2(Math.sin(target-imu),Math.cos(target-imu)),turn=clamp(error*this.plan.config.headingP,-.5,.5);
      return {done:false,drive:{forward:step.forward,strafe:step.strafe,turn:step.forward||step.strafe?turn:0},wait:step.action!==undefined?{action:step.action,remaining:step.seconds-this.elapsed}:null,acting:step.moving||null,segment:step.segment};
    }
  }
  return {settings,calibrate,compile,Runner};
});
