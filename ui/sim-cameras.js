(function(root,factory){const value=factory(root);if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckCameras=value;})(typeof globalThis==='object'?globalThis:this,root=>{
  'use strict';
  // Run-video cameras. Each one is a path worked out from the recorded run, frame by frame: where the camera sits and
  // what it looks at ([x, y, z] in field inches, z up) and its field of view. The path depends only on the recorded
  // frames and the camera's settings, so a picture at 12.5 s is the same in the preview, after seeking and in an
  // export, and changing cameras never changes the run. Camera 1 is the original run-video camera (the follow camera
  // of Record), worked out exactly as it always was; the others watch the robot's own mechanisms.
  const DEG=Math.PI/180,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),finite=Number.isFinite;
  const mech=()=>root.DeckMechanisms||(typeof require==='function'?require('./sim-mechanisms.js'):null);
  const CAMERAS=[
    {id:'main',name:'Main',label:'Main · follow camera',key:'1',color:'#4ea1ff',
      hint:'The original run-video camera: behind and above the robot, turning to the goal while it shoots, with the whole field in the corner.'},
    {id:'mech',name:'Front-right',label:'Front-right · ramp & flower',key:'2',color:'#f2bc62',
      hint:'Low at the robot’s front-right corner, on the intake or ramp and whatever it reaches into: a flower’s pollen, pieces on the floor.',
      modes:{track:'Tracks the action',fixed:'Fixed on the robot'}},
    {id:'turret',name:'Turret',label:'Turret & shots',key:'3',color:'#b79bff',
      hint:'Behind the turret, turning with it, so the turret stays in view however fast it turns. Follows each shot to the goal.',
      modes:{projectile:'Follows the shot',follow:'Follows the turret',fixed:'Fixed on the robot'}},
    {id:'chase',name:'Rear chase',label:'Rear chase',key:'4',color:'#49cbb3',
      hint:'Low behind the chassis, trailing it smoothly through turns and strafes, further back the faster it drives.',
      modes:{smooth:'Smooth chase',tight:'Tight chase'}},
    {id:'intake',name:'Intake',label:'Front intake',key:'5',color:'#e5484d',
      hint:'In front of the intake, looking back at it, so pieces are seen going in.',
      modes:{follow:'Dynamic follow',fixed:'Fixed close-up'}}];
  const IDS=CAMERAS.map(c=>c.id),byId=Object.fromEntries(CAMERAS.map(c=>[c.id,c]));
  // Fine-tuning per camera: its mode, how far and how high it sits (1 is as designed), how far it swings round the
  // robot (degrees) and its field of view. Camera 1 has none: it stays the original.
  const DEFAULTS={main:{fov:50},mech:{mode:'track',distance:1,height:1,swing:0,fov:58},turret:{mode:'projectile',distance:1,height:1,swing:0,fov:56},chase:{mode:'smooth',distance:1,height:1,swing:0,fov:55},intake:{mode:'follow',distance:1,height:1,swing:0,fov:62}};
  function settings(raw){
    const out={};for(const id of IDS){const d=DEFAULTS[id],r=raw?.[id]||{};out[id]={...d};if(id==='main')continue;
      if(byId[id].modes[r.mode])out[id].mode=r.mode;for(const [k,[a,b]] of Object.entries({distance:[.5,2.5],height:[.3,3],swing:[-90,90],fov:[25,90]}))if(finite(r[k]))out[id][k]=clamp(r[k],a,b);}
    return out;
  }
  // ---------------------------------------------------------------- where the mechanisms are
  // Points on the robot (robot frame: inches, x forward, y left, z up from the floor) the cameras look at: the front
  // intake (or the first), the ramp, and each shooter's turret. From the CAD parts when the model names them, else
  // from the mechanism settings and the robot's size.
  const SIDE={front:[1,0],back:[-1,0],left:[0,1],right:[0,-1]};
  function rig({footprint,robot={},mechanisms,parts,aim}={}){
    const f=footprint||{front:9,rear:9,half:9},height=finite(robot.heightIn)?robot.heightIn:12,size=Math.max(14,f.front+f.rear),m=mechanisms?.enabled?mechanisms:null;
    const edge=side=>side==='front'?f.front:side==='back'?f.rear:f.half,box=p=>p?.box?[(p.box.x0+p.box.x1)/2,(p.box.y0+p.box.y1)/2,(p.box.z0+p.box.z1)/2]:null;
    const partFor=(role,kind)=>(parts||[]).find(p=>p.role===role&&(!kind||p.kind===kind));
    const at=(intake)=>{const side=(intake?.sides||['front']).find(s=>s==='front')||intake?.sides?.[0]||'front',[dx,dy]=SIDE[side]||SIDE.front,e=edge(side)-1;
      return {side,dir:[dx,dy],point:[dx*e,dy*e,clamp(finite(intake?.height)?intake.height/2:3,1.5,6)]};};
    const intakes=m?.intakes||[],front=intakes.find(i=>i.sides?.includes('front'))||intakes[0]||null,ramp=intakes.find(i=>i.kind==='ramp')||null;
    const intake=at(front),rampAt=ramp?at(ramp):null;
    // A CAD part for the intake or ramp moves the point to the part, when it sits on that side of the robot.
    const ip=box(partFor('intake',front?.kind)),rp=box(partFor('intake','ramp'));
    if(ip&&ip[0]*intake.dir[0]+ip[1]*intake.dir[1]>0)intake.point=[ip[0],ip[1],clamp(ip[2],1.5,8)];
    if(rampAt&&rp&&rp[0]*rampAt.dir[0]+rp[1]*rampAt.dir[1]>0)rampAt.point=[rp[0],rp[1],clamp(rp[2],1.5,8)];
    const M=mech(),dims={length:robot.length||17,width:robot.width||17};
    const shooters=(aim?.shooters||m?.shooters||[]).map((s,n)=>{const [ox,oy]=M?M.mountOffset(s.mount,dims):[0,0],a=s.at;
      return {n,type:s.type,point:a&&finite(a.x)&&finite(a.y)?[a.x,a.y,finite(a.z)?a.z:height]:[ox,oy,height],facing:M?.FACING?.[s.facing]||0};});
    const gate=!!m?.shooters?.some(s=>s.indexerKind==='gate');
    return {size,height,footprint:f,intake,ramp:rampAt,shooters,gate,hasMechanisms:!!m};
  }
  // ---------------------------------------------------------------- shared helpers
  const toWorld=(t,yaw,[x,y,z])=>[t.x+x*Math.cos(yaw)-y*Math.sin(yaw),t.y+x*Math.sin(yaw)+y*Math.cos(yaw),z];
  const lerp=(a,b,k)=>a.map((v,i)=>v+(b[i]-v)*k);
  const ease=(dt,tau,ready)=>ready?1-Math.exp(-Math.max(0,dt)/tau):1;
  // Keeps a camera inside the field (plus a margin), lifting it by what it lost so it looks down over the wall side.
  function inField(p,bounds,margin,lift=0){if(!bounds)return p;const x=clamp(p[0],bounds.x0-margin,bounds.x1+margin),y=clamp(p[1],bounds.y0-margin,bounds.y1+margin);
    return [x,y,p[2]+lift*Math.hypot(p[0]-x,p[1]-y)];}
  const ballXY=b=>[b.pos.x+72,b.pos.y+72,Math.max(0,b.z||0)];
  // Where each shooter points while it spins up, aims or shoots, and the goal along that line (within 25°).
  // This is the original run-video camera's own reading of the aim, also used to draw the aim beams.
  function aims(frame,aim){
    const m=frame?.mechanisms,t=frame?.truth,c=m?.command||{};if(!aim||!m||!t||!(c.feed||c.spin||c.aim||m.flywheel>.05))return [];
    const M=mech(),h=t.heading*DEG;
    return aim.shooters.map((s,n)=>{const [ox,oy]=M.mountOffset(s.mount,aim.dims),x=t.x+ox*Math.cos(h)-oy*Math.sin(h),y=t.y+ox*Math.sin(h)+oy*Math.cos(h);
      const dir=h+(s.type==='turret'?(m.turrets?.[n]??m.turret??0):M.FACING[s.facing]||0)*DEG;let len=48,goal=null;
      for(const g of aim.targets){const d=Math.hypot(g.x-x,g.y-y);if(Math.abs(wrap(Math.atan2(g.y-y,g.x-x)-dir))<25*DEG&&(!goal||d<len)){len=d;goal=g;}}
      return {x,y,dir,len,goal,on:!!(m.ready&&m.aligned)};});
  }
  // ---------------------------------------------------------------- camera 1: the original follow camera
  // Behind the robot and above it, turning with it (smoothly, so turning on the spot does not whip the picture
  // round). While the robot spins up, aims or shoots, and for 2 s after, the camera swings behind the robot towards
  // the goal and pulls up, so the robot, its aim and where the pieces land are all in view. A robot that has stood
  // still for 1.5 s (parked, or waiting) is seen from further back and higher up. `follow` carries it between pictures;
  // dt 0 starts afresh.
  function mainStep(follow,{frame,start,aim,footprint,bounds},dt){
    const t=frame?.truth||start;if(!t)return null;if(!dt)follow.ready=false;
    const k=tau=>follow.ready?1-Math.exp(-Math.max(0,dt)/tau):1,f=footprint||{front:9,rear:9},size=Math.max(14,f.front+f.rear),h=t.heading*DEG;
    follow.yaw=(follow.yaw||0)+wrap(h-(follow.yaw||0))*k(.7);
    const goal=aims(frame,aim).find(b=>b.goal)?.goal;if(goal){follow.goal=goal;follow.hold=2;}else follow.hold=Math.max(0,(follow.hold||0)-dt);
    follow.shot=(follow.shot||0)+((follow.hold>0&&follow.goal?1:0)-(follow.shot||0))*k(.6);
    follow.still=Math.hypot(t.vx||0,t.vy||0)>2||Math.abs(t.omega||0)>10?0:(follow.still||0)+Math.max(0,dt);follow.wide=(follow.wide||0)+((follow.still>1.5?1:0)-(follow.wide||0))*k(1.2);
    const r=[t.x,t.y,0],dir=[Math.cos(follow.yaw),Math.sin(follow.yaw),0];
    const far=1+.7*follow.wide;let pos=[r[0]-dir[0]*size*2.4*far,r[1]-dir[1]*size*2.4*far,size*2.3*(1+.9*follow.wide)],look=[r[0]+dir[0]*size*1.8,r[1]+dir[1]*size*1.8,0];
    if(follow.shot>.001&&follow.goal){const to=[follow.goal.x-r[0],follow.goal.y-r[1],0],len=Math.hypot(to[0],to[1]),d=len>1?[to[0]/len,to[1]/len,0]:dir;
      pos=lerp(pos,[r[0]-d[0]*size*2.4,r[1]-d[1]*size*2.4,size*2.6],follow.shot);look=lerp(look,[r[0]+to[0]*.4,r[1]+to[1]*.4,16],follow.shot);}
    // Not far outside the field, where the camera would look through the perimeter.
    if(bounds){pos[0]=clamp(pos[0],bounds.x0-18,bounds.x1+18);pos[1]=clamp(pos[1],bounds.y0-18,bounds.y1+18);}
    follow.pos=follow.ready&&follow.pos?lerp(follow.pos,pos,k(.3)):pos;follow.look=follow.ready&&follow.look?lerp(follow.look,look,k(.3)):look;follow.ready=true;
    return {p:follow.pos.slice(),l:follow.look.slice(),fov:50};
  }
  // ---------------------------------------------------------------- cameras 2 to 5
  // Something worth looking at near a point: the closest flower piece or loose piece within `reach` inches.
  function interest(world,point,reach,kinds){
    let best=null,bd=reach;for(const b of world?.balls||[]){const k=b.state?.kind;if(!kinds.includes(k))continue;const p=ballXY(b),d=Math.hypot(p[0]-point[0],p[1]-point[1]);if(d<bd){bd=d;best=p;}}
    return best;
  }
  // The newest piece in the air, launched from near the robot (by its own alliance) within the last moment.
  function shotInAir(world,t){let best=null;for(const b of world?.balls||[]){if(b.state?.kind!=='flight')continue;if(!best||b.id>best.id)best=b;}return best?{p:ballXY(best),d:Math.hypot(best.pos.x+72-t.x,best.pos.y+72-t.y)}:null;}
  // One picture of camera `id` from frame `frame`, `dt` seconds after the last one (0 starts afresh). `s` carries the
  // camera between pictures; `cfg` is its fine-tuning.
  function step(id,s,{frame,start,aim,footprint,bounds,rig:R},cfg,dt){
    if(id==='main')return mainStep(s,{frame,start,aim,footprint,bounds},dt);
    const t=frame?.truth||start;if(!t)return null;if(!dt)s.ready=false;
    const k=tau=>ease(dt,tau,s.ready),h=t.heading*DEG,D=cfg.distance,H=cfg.height,swing=cfg.swing*DEG,world=frame?.fieldState,m=frame?.mechanisms;
    const fixed=cfg.mode==='fixed',size=R.size,f=R.footprint;
    // The yaw the camera turns with: the robot's heading, smoothed (none when fixed to the robot).
    const tauYaw={mech:.22,turret:.12,chase:cfg.mode==='tight'?.25:.45,intake:.3}[id];
    s.yaw=s.ready&&!fixed?s.yaw+wrap(h-s.yaw)*k(tauYaw):h;
    let pos,look,fov=cfg.fov;
    if(id==='mech'){
      // Low at the front-right corner, looking at the ramp (or intake) and across the robot's front.
      const spot=(R.ramp||R.intake).point,target=[spot[0],spot[1],spot[2]];
      const rel=[f.front+9*D,-(f.half+9*D),6+5*D*H],c=Math.cos(swing),sn=Math.sin(swing),off=[rel[0]-target[0],rel[1]-target[1]];
      const p=[target[0]+off[0]*c-off[1]*sn,target[1]+off[0]*sn+off[1]*c,rel[2]];
      pos=toWorld(t,s.yaw,p);look=toWorld(t,s.yaw,target);
      // Tracking: the flower pollen (or loose piece) the intake is reaching for pulls the picture towards it.
      if(!fixed){const ahead=toWorld(t,h,[spot[0]+6,spot[1],spot[2]]),near=interest(world,ahead,22,['element','ground']);s.near=s.ready&&s.near?lerp(s.near,near||s.near,k(.4)):near||look;s.w=(s.w||0)+(((near?1:0))-(s.w||0))*k(.5);
        look=lerp(look,[s.near[0],s.near[1],Math.max(1.5,s.near[2])],.35*s.w);}
      pos=inField(pos,bounds,1.5,.6);
    }else if(id==='turret'){
      // Behind the turret, turning with it: the turret stays in the middle of the picture however fast it turns.
      const sh=R.shooters.find(x=>x.type==='turret')||R.shooters[0],n=sh?.n??0,pivot=sh?sh.point:[0,0,R.height];
      const turret=sh?(sh.type==='turret'?(m?.turrets?.[n]??m?.turret??0):sh.facing):0,aimYaw=h+turret*DEG+(fixed?0:swing);
      s.aim=s.ready&&!fixed?s.aim+wrap(aimYaw-s.aim)*k(.12):aimYaw;
      const base=toWorld(t,h,pivot),dir=[Math.cos(fixed?h+swing:s.aim),Math.sin(fixed?h+swing:s.aim)],left=[-dir[1],dir[0]];
      pos=[base[0]-dir[0]*15*D+left[0]*5,base[1]-dir[1]*15*D+left[1]*5,pivot[2]+8*D*H];look=[base[0]+dir[0]*34,base[1]+dir[1]*34,pivot[2]+1];
      if(cfg.mode==='projectile'){const air=shotInAir(world,t);s.ball=air&&air.d<160?air.p:s.ball;s.hold=air&&air.d<160?.8:Math.max(0,(s.hold||0)-dt);
        s.w=(s.w||0)+((s.hold>0?1:0)-(s.w||0))*k(.25);if(s.ball&&s.w>.001){look=lerp(look,s.ball,.65*s.w);pos=lerp(pos,[pos[0]-dir[0]*8,pos[1]-dir[1]*8,pos[2]+6],s.w);fov+=8*s.w;}}
      pos=inField(pos,bounds,6,.4);
    }else if(id==='chase'){
      // Trailing the chassis: further back the faster it goes, looking a little ahead of where it is going.
      const speed=Math.hypot(t.vx||0,t.vy||0),back=size*(1.55+.6*Math.min(1,speed/60))*D,yaw=s.yaw+swing;
      pos=[t.x-Math.cos(yaw)*back,t.y-Math.sin(yaw)*back,size*.72*H+3];look=[t.x+Math.cos(s.yaw)*size*.5+(t.vx||0)*.3,t.y+Math.sin(s.yaw)*size*.5+(t.vy||0)*.3,4];
      pos=inField(pos,bounds,10,.3);
    }else{
      // In front of the intake looking back at it; following, it leans towards the piece being picked up.
      const I=R.intake,[dx,dy]=I.dir,c=Math.cos(swing),sn=Math.sin(swing),out=[dx*c-dy*sn,dx*sn+dy*c],rel=[I.point[0]+out[0]*15*D,I.point[1]+out[1]*15*D,7*D*H+2];
      pos=toWorld(t,s.yaw,rel);look=toWorld(t,s.yaw,[I.point[0],I.point[1],Math.max(1.5,I.point[2]-1)]);
      if(!fixed){const near=interest(world,toWorld(t,h,[I.point[0]+dx*5,I.point[1]+dy*5,0]),14,['ground','element']);s.w=(s.w||0)+((near?1:0)-(s.w||0))*k(.35);s.near=near||s.near||look;
        look=lerp(look,[s.near[0],s.near[1],Math.max(1.5,s.near[2])],.3*s.w);}
      pos=inField(pos,bounds,1.5,.8);
    }
    // The position is smoothed too, so a bump does not shake the picture (fixed cameras stay rigid).
    const tauPos=fixed?0:{mech:.12,turret:.08,chase:cfg.mode==='tight'?.12:.2,intake:.1}[id];
    s.pos=s.ready&&tauPos?lerp(s.pos,pos,k(tauPos)):pos;s.look=s.ready&&tauPos?lerp(s.look,look,k(tauPos*.8)):look;s.ready=true;
    return {p:s.pos.slice(),l:s.look.slice(),fov};
  }
  // ---------------------------------------------------------------- whole-run paths
  // The path of one camera through a recording: seven numbers per frame (camera x, y, z, look x, y, z, fov).
  function path(id,frames,ctx,cfg){
    const out=new Float32Array(frames.length*7),s={};let last=null;
    frames.forEach((frame,i)=>{const dt=i?Math.max(0,frame.time-frames[i-1].time):0,p=step(id,s,{...ctx,frame},cfg||DEFAULTS[id],dt)||last||{p:[72,-40,80],l:[72,72,0],fov:50};last=p;
      out.set([...p.p,...p.l,p.fov],i*7);});
    return out;
  }
  // Every camera's path: {main: Float32Array, ...}. `cfg` from settings().
  function paths(frames,ctx,cfg){const c=settings(cfg),out={};for(const id of IDS)out[id]=path(id,frames,ctx,c[id]);return out;}
  // The frame index at or before `time` (seconds of the recording), by halving.
  function indexAt(frames,time){let lo=0,hi=frames.length-1;if(hi<0)return -1;if(time<=frames[0].time)return 0;if(time>=frames[hi].time)return hi;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(frames[mid].time<=time)lo=mid;else hi=mid;}return lo;}
  // A camera's pose at any time, between the two recorded frames around it.
  function poseAt(track,frames,time){
    const i=indexAt(frames,time);if(i<0)return null;const j=Math.min(frames.length-1,i+1),span=frames[j].time-frames[i].time,k=span>0?clamp((time-frames[i].time)/span,0,1):0;
    const a=i*7,b=j*7,v=n=>track[a+n]+(track[b+n]-track[a+n])*k;return {p:[v(0),v(1),v(2)],l:[v(3),v(4),v(5)],fov:v(6)};
  }
  return {CAMERAS,IDS,DEFAULTS,settings,rig,aims,mainStep,step,path,paths,indexAt,poseAt};
});
