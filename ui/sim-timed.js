(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckTimed=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),num=(v,f,a,b)=>typeof v==='number'&&Number.isFinite(v)?clamp(v,a,b):f;
  function settings(raw={}){return {power:num(raw.power,.45,.05,1),forwardSpeed:num(raw.forwardSpeed,60,1,500),strafeSpeed:num(raw.strafeSpeed,50,1,500),startup:num(raw.startup,.2,0,3),headingP:num(raw.headingP,1.6,0,10)};}
  function point(points,t){let p=points.map(q=>({...q}));while(p.length>1)p=p.slice(1).map((q,i)=>({x:p[i].x+(q.x-p[i].x)*t,y:p[i].y+(q.y-p[i].y)*t}));return p[0];}
  function compile(route,raw={}){
    if(!route?.segments?.length)throw Error('Plan a route first.');const config=settings(raw),steps=[],waits=new Map((route.stops||[]).map(s=>[s.segment,s]));let stopped=true,h=(route.heading||0)*Math.PI/180;
    for(const [index,segment]of route.segments.entries()){if(route.nonholonomic){h=segment.heading*Math.PI/180;steps.push({kind:'turn',heading:h,forward:0,strafe:0,seconds:30,segment:index});stopped=true;}const points=segment.points;if(!points?.length||points.some(p=>![p.x,p.y].every(Number.isFinite)))throw Error('The route has invalid points.');const length=points.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-points[i].x,p.y-points[i].y),0),count=segment.type==='line'?1:Math.max(4,Math.ceil(length/5));let a=points[0];
      for(let i=1;i<=count;i++){const b=point(points,i/count),dx=b.x-a.x,dy=b.y-a.y,forward=dx*Math.cos(h)+dy*Math.sin(h),left=-dx*Math.sin(h)+dy*Math.cos(h),duration=Math.max(Math.abs(forward)/(config.forwardSpeed*config.power),Math.abs(left)/(config.strafeSpeed*config.power));
        if(duration>1e-6){steps.push({heading:h,forward:forward/(config.forwardSpeed*duration),strafe:route.nonholonomic?0:left/(config.strafeSpeed*duration),seconds:duration+(stopped?config.startup:0),segment:index});stopped=false;}a=b;}
      const stop=waits.get(index);if(stop?.wait>0){steps.push({forward:0,strafe:0,seconds:Math.min(30,stop.wait),action:String(stop.action||''),segment:index});stopped=true;}}
    if(!steps.length)throw Error('The route has no movement.');return {heading:h,config,steps,duration:route.nonholonomic?null:steps.reduce((s,p)=>s+p.seconds,0)};
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
      return {done:false,drive:{forward:step.forward,strafe:step.strafe,turn:step.forward||step.strafe?turn:0},wait:step.action!==undefined?{action:step.action,remaining:step.seconds-this.elapsed}:null,segment:step.segment};
    }
  }
  return {settings,compile,Runner};
});
