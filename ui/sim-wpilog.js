(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckWpilog=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // A simulator run as a WPILOG file (Run & review → Export → Save run log). It follows WPILib's data
  // log format and AdvantageKit's key layout, so log viewers such as AdvantageScope read the match
  // timeline, the robot pose, game pieces, a Mechanism2d of the robot's mechanisms and every value.
  const INCH=.0254,DEG=Math.PI/180;
  const text=s=>new TextEncoder().encode(s);
  // Little-endian, as short as possible (1-4 bytes for entry and size, 1-8 for the timestamp).
  const integer=(n,max)=>{const out=[];let v=BigInt(Math.max(0,Math.round(n)));do{out.push(Number(v&0xffn));v>>=8n;}while(v>0n&&out.length<max);return out;};
  class Writer{
    constructor(header='Deck Driver Station'){this.header=header;this.records=[];this.entries=new Map();this.last=new Map();}
    record(entry,us,data){const e=integer(entry,4),s=integer(data.length,4),t=integer(us,8),head=new Uint8Array(1+e.length+s.length+t.length);
      head[0]=(e.length-1)|((s.length-1)<<2)|((t.length-1)<<4);head.set(e,1);head.set(s,1+e.length);head.set(t,1+e.length+s.length);this.records.push(head,data);}
    start(name,type,us=0){if(this.entries.has(name))return this.entries.get(name).id;const id=this.entries.size+1,n=text(name),ty=text(type),meta=text(''),d=new Uint8Array(1+4+4+n.length+4+ty.length+4+meta.length),v=new DataView(d.buffer);
      d[0]=0;v.setUint32(1,id,true);v.setUint32(5,n.length,true);d.set(n,9);v.setUint32(9+n.length,ty.length,true);d.set(ty,13+n.length);v.setUint32(13+n.length+ty.length,meta.length,true);
      this.record(0,us,d);this.entries.set(name,{id,type});return id;}
    // Values are written only when they change; AdvantageScope holds the last value.
    put(name,type,us,bytes,key=null){const k=key??Array.from(bytes).join(',');if(this.last.get(name)===k)return;this.last.set(name,k);this.record(this.start(name,type,us),us,bytes);}
    boolean(name,us,v){this.put(name,'boolean',us,Uint8Array.of(v?1:0),String(!!v));}
    int(name,us,v){const d=new Uint8Array(8);new DataView(d.buffer).setBigInt64(0,BigInt(Math.round(v)),true);this.put(name,'int64',us,d,String(Math.round(v)));}
    double(name,us,v){if(!Number.isFinite(v))return;const d=new Uint8Array(8);new DataView(d.buffer).setFloat64(0,v,true);this.put(name,'double',us,d,String(+v.toFixed(6)));}
    string(name,us,v){this.put(name,'string',us,text(v),v);}
    doubles(name,us,values){const d=new Uint8Array(8*values.length),v=new DataView(d.buffer);values.forEach((x,i)=>v.setFloat64(8*i,x,true));this.put(name,'double[]',us,d,values.map(x=>+x.toFixed(6)).join(','));}
    schema(type,definition){const name='/.schema/struct:'+type;if(!this.entries.has(name))this.record(this.start(name,'structschema'),0,text(definition));}
    struct(name,type,us,values){const d=new Uint8Array(8*values.length),v=new DataView(d.buffer);values.forEach((x,i)=>v.setFloat64(8*i,x,true));this.put(name,'struct:'+type,us,d,values.map(x=>+x.toFixed(5)).join(','));}
    encode(){const h=text('WPILOG'),extra=text(this.header),size=this.records.reduce((s,r)=>s+r.length,0),out=new Uint8Array(h.length+2+4+extra.length+size),v=new DataView(out.buffer);
      out.set(h,0);v.setUint16(h.length,0x0100,true);v.setUint32(h.length+2,extra.length,true);out.set(extra,h.length+6);let p=h.length+6+extra.length;for(const r of this.records){out.set(r,p);p+=r.length;}return out;}
  }
  // The simulator's field (inches from the audience-left corner, +X right, +Y away from the audience,
  // heading counterclockwise from +X) in AdvantageScope's FTC "center/rotated" frame: metres from the
  // field centre, +X toward the audience-right as seen from the red wall, +Y away from the red wall.
  const pose=(x,y,headingDeg,origin)=>[-(y-origin.y)*INCH,(x-origin.x)*INCH,(headingDeg+90)*DEG];
  const point=(x,y,z,origin)=>[-(y-origin.y)*INCH,(x-origin.x)*INCH,(z||0)*INCH];
  // Frames recorded during a run (the simulator's frame messages) into a WPILOG.
  function fromFrames(frames,{alliance='red',mechanisms=null,robot={length:18,width:18},origin={x:72,y:72},name='Deck simulation'}={}){
    const w=new Writer(`Deck Driver Station · ${name}`);if(!frames.length)return w.encode();
    w.schema('Translation2d','double x;double y');w.schema('Rotation2d','double value');w.schema('Pose2d','Translation2d translation;Rotation2d rotation');w.schema('Translation3d','double x;double y;double z');
    const t0=frames[0].time,mech=mechanisms?.enabled?mechanisms:null,L=robot.length*INCH,W=robot.width*INCH;
    for(const f of frames){
      const us=Math.max(0,(f.time-t0)*1e6),phase=f.practice?.phase,running=f.mode==='program'||f.mode==='timed'||f.mode==='manual'||!!f.playing;
      w.boolean('/DriverStation/Enabled',us,running&&phase!=='transition'&&phase!=='finished');w.boolean('/DriverStation/Autonomous',us,phase?phase==='auto':f.mode!=='manual');w.int('/DriverStation/AllianceStation',us,alliance==='blue'?4:1);
      const t=f.truth;w.struct('/RealOutputs/Odometry/Robot','Pose2d',us,pose(t.x,t.y,t.heading,origin));
      if(f.estimate)w.struct('/RealOutputs/Odometry/Estimated','Pose2d',us,pose(f.estimate.x,f.estimate.y,f.estimate.heading,origin));
      w.double('/RealOutputs/Drive/SpeedInchesPerSec',us,Math.hypot(t.vx,t.vy));w.double('/RealOutputs/Drive/HeadingDegrees',us,((t.heading%360)+540)%360-180);w.double('/RealOutputs/Drive/TurnRateDegreesPerSec',us,t.omega);
      if(f.command)for(const k of ['forward','strafe','turn'])w.double('/RealOutputs/Drive/Command/'+k[0].toUpperCase()+k.slice(1),us,f.command[k]||0);
      // Game pieces on the field (not stored in a robot or already counted as scored).
      const balls=(f.fieldState?.balls||[]).filter(b=>!['held','stock'].includes(b.state?.kind));
      for(const [key,test] of [['Pollen',b=>b.color==='yellow'],['NectarRed',b=>b.color==='red'],['NectarBlue',b=>b.color==='blue']]){const list=balls.filter(test).flatMap(b=>point(b.pos.x+origin.x,b.pos.y+origin.y,b.pos.z??1.4,origin)),d=new Uint8Array(8*list.length),v=new DataView(d.buffer);list.forEach((x,i)=>v.setFloat64(8*i,x,true));w.put('/RealOutputs/GamePieces/'+key,'struct:Translation3d[]',us,d,list.map(x=>+x.toFixed(3)).join(','));}
      const m=f.mechanisms;
      if(mech&&m){
        w.double('/RealOutputs/Mechanisms/FlywheelPercent',us,m.flywheel*100);w.double('/RealOutputs/Mechanisms/TurretDegrees',us,m.turret);w.int('/RealOutputs/Mechanisms/PiecesHeld',us,m.held);w.int('/RealOutputs/Mechanisms/Shots',us,m.shots);
        if(Number.isFinite(m.score))w.int('/RealOutputs/Mechanisms/Score',us,m.score);w.boolean('/RealOutputs/Mechanisms/IntakeOn',us,!!m.command?.intake);w.boolean('/RealOutputs/Mechanisms/Feeding',us,!!m.command?.feed);w.boolean('/RealOutputs/Mechanisms/OnTarget',us,!!m.aligned);
        mechanism2d(w,us,mech,m,L,W);
      }
    }
    return w.encode();
  }
  // Mechanism2d, seen from above with the robot's front up: chassis, intake rollers (green while
  // running), stored pieces, and the shooter (turret angle, barrel length = flywheel speed).
  function mechanism2d(w,us,mech,m,L,W){
    const key='/RealOutputs/Mechanism',pad=.06,line=(path,angle,length,color,weight=4)=>{w.string(`${key}/${path}/.type`,us,'line');w.double(`${key}/${path}/angle`,us,angle);w.double(`${key}/${path}/length`,us,length);w.string(`${key}/${path}/color`,us,color);w.double(`${key}/${path}/weight`,us,weight);};
    const root=(name,x,y)=>{w.double(`${key}/${name}/x`,us,x);w.double(`${key}/${name}/y`,us,y);};
    w.string(`${key}/.type`,us,'Mechanism2d');w.string(`${key}/backgroundColor`,us,'#16181d');w.doubles(`${key}/dims`,us,[W+2*pad,L+2*pad]);
    // Chassis outline: width across, length up (front at the top).
    root('Chassis',pad,pad);line('Chassis/Back',0,W,'#8a9099',3);line('Chassis/Back/Right',90,L,'#8a9099',3);line('Chassis/Back/Right/Front',90,W,'#d7dbe0',4);line('Chassis/Back/Right/Front/Left',90,L,'#8a9099',3);
    const on=m.command?.intake?'#49cbb3':'#555b63',edges={front:[pad,pad+L-.02,0,W],back:[pad,pad+.02,0,W],left:[pad+.02,pad,90,L],right:[pad+W-.02,pad,90,L]};
    for(const e of mech.intakes.flatMap(i=>i.sides)){const name='Intake'+e[0].toUpperCase()+e.slice(1),[x,y,a,len]=edges[e];root(name,x,y);line(name+'/Roller',a,len,on,8);}
    // Storage slots: pollen (yellow) then nectar (red), filled with what the robot holds.
    const pollen=m.pollen??Math.min(m.held,mech.capacity.pollen),nectar=m.nectar??Math.max(0,m.held-pollen);
    [...Array.from({length:mech.capacity.pollen},(_,i)=>i<pollen?'#f2d14b':'#33373d'),...Array.from({length:mech.capacity.nectar},(_,i)=>i<nectar?'#e5484d':'#3d2a2c')].forEach((color,i)=>{root('Storage'+i,pad+.05+i*.05,pad+.06);line(`Storage${i}/Piece`,90,.035,color,10);});
    // Each shooter at its mount: a turret where it aims, a fixed shooter along its facing; barrel length = flywheel speed.
    const Mech=globalThis.DeckMechanisms||require('./sim-mechanisms.js'),r=Math.min(L,W)*.3;
    mech.shooters.forEach((s,n)=>{const [fx,fy]=Mech.MOUNT_AT[s.mount]||[0,0],angle=90+(s.type==='turret'?m.turret:Mech.FACING[s.facing]),name='Shooter'+(n+1);
      root(name,pad+W/2-fy*(W/2-.08),pad+L/2+fx*(L/2-.08));line(name+'/Barrel',angle,r*(.35+.65*m.flywheel),m.flywheel>=.95?(m.aligned?'#49cbb3':'#f2bc62'):'#7a7f87',m.command?.feed?10:6);});
  }
  return {Writer,fromFrames,pose};
});
