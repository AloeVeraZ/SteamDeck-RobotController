(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckRobotLog=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // A log from the real robot (or a Deck run) compared with the planned route: where it actually drove,
  // how far it strayed from the plan and where it stopped. Nothing here invents data: poses come only
  // from the file, and a file without poses is refused.
  //
  // Formats:
  //  - WPILOG (WPILib / AdvantageKit): a Pose2d entry (struct:Pose2d, or double[] [x, y, rotation]) such as
  //    /RealOutputs/Odometry/Robot. Metres and radians in the FTC field frame AdvantageScope uses and Deck's
  //    own run logs write: origin at the field centre, rotated 90° from Deck's frame.
  //  - CSV: a header row with x, y and heading (or h, theta, rotation) columns, optional t/time. Units are
  //    stated in the header ("x_in", "x_m", "heading_deg", "heading_rad") or chosen by the caller. The
  //    frame is Deck's and Pedro Pathing's (inches from the bottom-left corner, heading CCW from +X)
  //    unless origin 'center' is given (FTC SDK: field centre, the same axes).
  const INCH=.0254,DEG=Math.PI/180,norm=d=>((d%360)+540)%360-180;
  function wpilog(bytes){
    const u8=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(u8.buffer,u8.byteOffset,u8.byteLength),dec=new TextDecoder();
    if(u8.length<12||dec.decode(u8.subarray(0,6))!=='WPILOG')throw Error('Not a WPILOG file.');
    let p=12+v.getUint32(8,true);const entries=new Map(),data=new Map();
    const uint=(at,n)=>{let x=0;for(let i=n-1;i>=0;i--)x=x*256+u8[at+i];return x;};
    while(p<u8.length){
      const bits=u8[p],ne=(bits&3)+1,ns=((bits>>2)&3)+1,nt=((bits>>4)&7)+1;if(p+1+ne+ns+nt>u8.length)break;
      const entry=uint(p+1,ne),size=uint(p+1+ne,ns),us=uint(p+1+ne+ns,nt),at=p+1+ne+ns+nt;if(at+size>u8.length)break;
      if(entry===0){if(u8[at]===0){const id=v.getUint32(at+1,true),nl=v.getUint32(at+5,true),name=dec.decode(u8.subarray(at+9,at+9+nl)),tl=v.getUint32(at+9+nl,true),type=dec.decode(u8.subarray(at+13+nl,at+13+nl+tl));entries.set(id,{name,type});}}
      else if(entries.has(entry)){const e=entries.get(entry);if(/^(struct:Pose2d|double\[\])$/.test(e.type)&&size>=24){if(!data.has(entry))data.set(entry,[]);data.get(entry).push({t:us/1e6,x:v.getFloat64(at,true),y:v.getFloat64(at+8,true),r:v.getFloat64(at+16,true)});}}
      p=at+size;
    }
    const candidates=[...data.keys()].map(id=>({id,...entries.get(id),n:data.get(id).length}));
    const rank=c=>(/Odometry\/Robot$/.test(c.name)?0:/Robot$|Pose$|RobotPose/i.test(c.name)?1:/Estimated/i.test(c.name)?3:2)*10+(c.type==='struct:Pose2d'?0:1);
    candidates.sort((a,b)=>rank(a)-rank(b)||b.n-a.n);if(!candidates.length)throw Error('This WPILOG has no Pose2d entry (for example /RealOutputs/Odometry/Robot).');
    const pick=candidates[0],poses=data.get(pick.id).map(q=>({t:q.t,x:q.y/INCH+72,y:-q.x/INCH+72,heading:norm(q.r/DEG-90)}));
    return {format:'wpilog',key:pick.name,poses,others:candidates.slice(1).map(c=>c.name)};
  }
  function csv(text,{units,headingUnits,origin='corner'}={}){
    // Spreadsheet exports: a byte-order mark, quoted fields, and decimal commas when ";" separates the columns.
    const rows=String(text).replace(/^﻿/,'').split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));if(rows.length<2)throw Error('The CSV needs a header row and at least one pose.');
    const sep=rows[0].includes(';')&&!rows[0].includes(',')?';':rows[0].includes('\t')?'\t':',',cell=s=>s.trim().replace(/^"(.*)"$/,'$1').trim(),head=rows[0].split(sep).map(h=>cell(h).toLowerCase());
    // A column named exactly x, then one starting with x (x_in, x (m)), then one ending in x (pose_x, robot x).
    const col=(...res)=>{for(const re of res){const i=head.findIndex(h=>re.test(h));if(i>=0)return i;}return -1;},axis=a=>[new RegExp(`^${a}$`),new RegExp(`^${a}(_|\\s|\\(|$)`),new RegExp(`(^|[\\s_.\\/])${a}(\\s*\\(.*\\)|_(m|in|meters|metres|inches))?$`)];
    const xi=col(...axis('x')),yi=col(...axis('y')),hi=col(/^(heading|h|theta|rotation|angle|yaw)(\b|_|\s|\(|$)/,/(^|[\s_.\/])(heading|theta|rotation|yaw)(\b|_|\s|\(|$)/),ti=col(/^(t|time|timestamp|seconds)(\b|_|\s|\(|$)/);
    if(xi<0||yi<0)throw Error('The CSV header needs x and y columns (and heading for the robot’s direction).');
    const unitOf=i=>/(_|\(|\s)(m|meters|metres)\)?$/.test(head[i])?'m':/(_|\(|\s)(in|inch|inches)\)?$/.test(head[i])?'in':null;
    const linear=units||unitOf(xi)||'in',scale=linear==='m'?1/INCH:1;
    const number=s=>{const v=cell(s);return Number(sep===';'?v.replace(',','.'):v);};
    const values=rows.slice(1).map(r=>r.split(sep).map(number)).filter(r=>Number.isFinite(r[xi])&&Number.isFinite(r[yi]));
    if(!values.length)throw Error('The CSV has no rows with numeric x and y.');
    let hu=headingUnits||(hi>=0&&/(_|\(|\s)(rad|radians)\)?$/.test(head[hi])?'rad':hi>=0&&/(_|\(|\s)(deg|degrees)\)?$/.test(head[hi])?'deg':null);
    if(!hu&&hi>=0)hu=values.every(r=>!Number.isFinite(r[hi])||Math.abs(r[hi])<=2*Math.PI+.01)?'rad':'deg';
    const shift=origin==='center'?72:0;
    const poses=values.map((r,i)=>({t:ti>=0&&Number.isFinite(r[ti])?r[ti]:i/50,x:r[xi]*scale+shift,y:r[yi]*scale+shift,heading:hi>=0&&Number.isFinite(r[hi])?norm(hu==='rad'?r[hi]/DEG:r[hi]):null}));
    if(ti>=0&&poses.some((q,i)=>i&&q.t<poses[i-1].t))throw Error('CSV times must not go backwards.');
    return {format:'csv',key:`${head[xi]}, ${head[yi]}${hi>=0?', '+head[hi]:''} (${linear==='m'?'metres':'inches'}${hi>=0?', heading in '+(hu==='rad'?'radians':'degrees'):''})`,poses,others:[]};
  }
  function parse(file,options={}){
    const name=String(file.name||''),bytes=file.bytes instanceof Uint8Array?file.bytes:file.bytes?new Uint8Array(file.bytes):null;
    if(bytes&&bytes.length>=6&&new TextDecoder().decode(bytes.subarray(0,6))==='WPILOG')return wpilog(bytes);
    if(/\.wpilog$/i.test(name))throw Error('Not a WPILOG file.');
    const text=file.text??(bytes?new TextDecoder().decode(bytes):'');return csv(text,options);
  }
  const bez=(points,t)=>{let p=points;while(p.length>1)p=p.slice(1).map((q,i)=>({x:p[i].x+(q.x-p[i].x)*t,y:p[i].y+(q.y-p[i].y)*t}));return p[0];};
  // The log against the planned route: distance from each logged position to the nearest point of the
  // plan, and the stop against the last end point. Only measured positions are used.
  function compare(log,route){
    if(!log?.poses?.length)throw Error('The log has no poses.');if(!route?.segments?.length)throw Error('Plan a route first.');
    // Each plan sample remembers its segment, so the worst point can be pinned to a path (segment.to is its pin).
    const plan=route.segments.flatMap((s,k)=>Array.from({length:41},(_,j)=>({...bez(s.points,j/40),k})));
    const near=p=>{let best=Infinity,k=0;for(let i=1;i<plan.length;i++){const a=plan[i-1],b=plan[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);if(d<best){best=d;k=b.k;}}return {d:best,k};};
    const hits=log.poses.map(near),errors=hits.map(h=>h.d),worstAt=errors.indexOf(Math.max(...errors)),last=log.poses.at(-1),goal=route.segments.at(-1).points.at(-1),to=route.segments[hits[worstAt].k]?.to;
    return {samples:log.poses.length,duration:log.poses.at(-1).t-log.poses[0].t,meanError:errors.reduce((a,b)=>a+b,0)/errors.length,maxError:errors[worstAt],worst:log.poses[worstAt],worstPath:Number.isInteger(to)?to:null,endError:Math.hypot(last.x-goal.x,last.y-goal.y),end:last,goal};
  }
  return {parse,wpilog,csv,compare};
});
