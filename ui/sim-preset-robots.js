(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DeckPresetRobots=api;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // The preset robots' CAD, joints, wiring and demo routes (Setup → Robot → Preset robot). Each is generated from FTC
  // parts with the Test robot's builders (ui/sim-test-robot.js) as STEP-import-style mesh records, so the app stores,
  // shows, discovers and rigs it like a team's own CAD, in every build. Original geometry modelled after the parts'
  // published sizes (approximate), MIT like the rest of Deck. DeckMechanisms.PRESETS holds their sizes, motors and
  // mechanisms; this file draws the robots to those sizes.
  // Frame: inches, x forward, y left, z up, the floor at z = 0; each chassis box is exactly its preset's length x width.
  const TR=globalThis.DeckTestRobot||(typeof require==='function'?require('./sim-test-robot.js'):null);
  const Mech=()=>globalThis.DeckMechanisms||(typeof require==='function'?require('./sim-mechanisms.js'):null);
  const Kin=()=>globalThis.DeckKinematics||(typeof require==='function'?require('./sim-kinematics.js'):null);
  const {C,lin,frame,pt,add,mul,RAD,X,Y,Z,EPS,WHEEL_R,MECANUM_HALF,box,obox,prism,lathe,cylinder,tube,band,disc,gear,part,holes,channel,motor,servo,mecanumWheel}=TR.kit;
  const K={...C,tire:lin(0x1f2022),blue:lin(0x2b6cd4),tube:lin(0xb8bec6),bumper:lin(0xc8282d)};
  const VERSION=1,CHASSIS='Chassis',ELECTRONICS='Electronics',DECK_Z=2.99,PLATE_Z=3.09,src='metadata';
  const CORNERS=[['FL',1,1],['FR',1,-1],['BL',-1,1],['BR',-1,-1]];
  // ---- shared parts --------------------------------------------------------------------------------------------------
  // goBILDA 1203 grid plate deck on the frame, its 14 mm holes on a 24 mm grid.
  function gridPlate(path,hx,hy){
    part(path,'Grid plate',C.alu,g=>box(g,[-hx,-hy,DECK_Z],[hx,hy,PLATE_Z]));
    const p=24/25.4,nx=Math.floor((2*hx-.6)/p)+1,ny=Math.floor((hy-.4)/p);
    part(path,'Hole pattern',C.hole,g=>{for(let r=-ny;r<=ny;r++)holes(g,frame([0,r*p,PLATE_Z+EPS],Z,X),nx,{small:Math.abs(r)<ny});});
  }
  // A REV Control Hub standing on edge (grey case, orange band, black port rows facing +y) and a REV Slim Battery, x0..x1
  // along the robot, the hub's case from y hy0 and the battery's from by0, both on z.
  function hubAndBattery(path,x0,x1,hy0,by0,z){
    const hy1=hy0+1.3,z1=z+4.05,by1=by0+1.4,hub=[...path,'Control Hub'],bat=[...path,'Battery'];
    part(hub,'REV Control Hub',K.hub,g=>box(g,[x0,hy0,z],[x1,hy1,z1-.22]));
    part(hub,'Orange band',K.orange,g=>{box(g,[x0,hy0,z1-.22],[x1,hy1,z1]);box(g,[x0-.01,hy0+.2,z+.6],[x0+.02,hy1-.2,z1-.4]);});
    part(hub,'Ports',K.black,g=>{for(const [a,b] of [[z+.35,z+.8],[z+1.05,z+1.5],[z+1.75,z+2.2]])box(g,[x0+.35,hy1,a],[x1-.35,hy1+.1,b]);box(g,[x0+.5,hy1,z+2.55],[x0+1.5,hy1+.08,z+3.2]);});
    part(hub,'Status LED',K.led,g=>box(g,[x1-.9,hy1,z+2.8],[x1-.6,hy1+.06,z+3.05]));
    part(bat,'REV Slim Battery',K.battery,g=>box(g,[x0,by0,z],[x1,by1,z+3]));
    part(bat,'Battery label',K.label,g=>box(g,[x0+.6,by0-EPS,z+.7],[x1-.6,by0,z+2.3]));
    part(bat,'Battery lead +',K.red,g=>cylinder(g,frame([x1,by0+.45,z+2.6],X,Y),.11,0,.9,8));
    part(bat,'Battery lead -',K.black,g=>cylinder(g,frame([x1,by0+.75,z+2.6],X,Y),.11,0,.9,8));
  }
  // A plain wheel with a rubber tyre: radius r, half width w, its axle along y at c; hub colour `hub`.
  function wheel(path,c,r,w,{hub=C.alu,spokes=5,label='Tire'}={}){
    const f=frame(c,Y,X);
    // The tyre's tread: a groove round its middle.
    part(path,label,K.tire,g=>lathe(g,f,[[r-.42,-w],[r-.05,-w],[r,-w+.08],[r,-.09],[r-.06,-.06],[r-.06,.06],[r,.09],[r,w-.08],[r-.05,w],[r-.42,w],[r-.42,-w]],{seg:36}));
    part(path,'Wheel hub',hub,g=>{tube(g,f,.2,r-.42,-w+.1,w-.1,30);});
    part(path,'Hole pattern',C.hole,g=>{for(const s of [1,-1])for(let k=0;k<spokes;k++){const a=k/spokes*2*Math.PI,m=(r-.42+.2)/2+.05;disc(g,frame(pt(f,m*Math.cos(a),m*Math.sin(a),s*(w-.1+EPS)),mul(Y,s),X),.22,10);}});
    part(path,'Hex bore',C.steel,g=>tube(g,f,.12,.2,-w,w,6));
  }
  // ---- Starter Mecanum: a goBILDA Strafer-style kit bot ----------------------------------------------------------------
  // U-channel frame, grid plate deck, four 104 mm mecanum wheels on Yellow Jackets, a Control Hub and battery: its
  // IMU and the drive motors' own encoders are the only sensors, as on a kit robot straight out of the box,, and a polycarbonate push plate. The side rails are 16.9 in (18 holes), inside the 17.56 in length.
  const MECANUM={id:'startermecanum',name:'Starter Mecanum',L:17.56,W:17.79};
  function starterMecanum(){
    const HX=MECANUM.L/2,HY=MECANUM.W/2,R=WHEEL_R,wy=HY-MECANUM_HALF,outY=wy-MECANUM_HALF-.365,railW=48/25.4,inY=outY-railW,end=HX-.012,WX=HX-2.9;
    for(const s of [1,-1]){const side=s>0?'left':'right';channel([CHASSIS,`U-Channel 1120 ${side}`],'U-Channel 1120 432mm','x',-8.45,8.45,s*outY,s);}
    // The front channel sits back by the push plate's thickness.
    channel([CHASSIS,'U-Channel 1120 front'],'U-Channel 1120 288mm','y',-inY,inY,HX-.14,1);channel([CHASSIS,'U-Channel 1120 back'],'U-Channel 1120 288mm','y',-inY,inY,-end,-1);
    gridPlate([CHASSIS,'Grid plate'],HX-.3,outY-railW/2-.3);
    for(const [k,sx,sy] of CORNERS){mecanumWheel([CHASSIS,'Mecanum wheel '+k],[sx*WX,sy*wy,R],sx,sy,outY);motor([CHASSIS,'Drive motor '+k],[sx*WX,sy*inY,R],[0,-sy,0],{shaft:outY-inY+.3});}
    // Push plate: clear polycarbonate across the front, below the deck so it pushes pieces on the floor.
    part([CHASSIS,'Push plate'],'Push plate',K.poly,g=>box(g,[HX-.125,-outY+.1,.55],[HX,outY-.1,4.2]));
    part([CHASSIS,'Push plate'],'Hole pattern',C.hole,g=>holes(g,frame([HX+EPS,0,3.6],X,Y),11,{small:false}));
    hubAndBattery([ELECTRONICS],-HX+.7,-HX+6.3,outY-railW/2-.25,-(outY-railW/2-.25)-1.4,PLATE_Z);
  }
  function mecanumJoints(name){const HX=MECANUM.L/2,HY=MECANUM.W/2,WX=HX-2.9,wy=HY-MECANUM_HALF;
    return CORNERS.map(([k,sx,sy])=>({id:'wheel'+k,name:'Mecanum wheel '+k,kind:'drive-wheel',type:'continuous',parts:[`${name}/${CHASSIS}/Mecanum wheel ${k}`],
      origin:[sx*WX,sy*wy,WHEEL_R],axis:[0,1,0],radius:+WHEEL_R.toFixed(4),roll:'mecanum',drive:{signal:'wheel'},source:src}));}
  // ---- A301 Swerve: NYC FIRST A301's square swerve base ---------------------------------------------------------------
  // A 1 in box-tube frame with a module under each corner: a fixed module plate and bearing, and below it the steering
  // yoke (ring gear, forks, axle) that turns about the module's centre with its 3 in wheel. The drive motor stands on the
  // plate above the wheel (coaxial) and an Axon steering servo's pinion turns the ring gear. Belly pan, Control Hub,
  // battery and a SparkFun OTOS in the middle.
  const SWERVE={id:'a301swerve',name:'A301 Swerve',L:17,W:17,module:5.9,r:1.5,width:.5};
  const PLATE={z0:4.45,z1:4.6},TUBE={z0:4.6,z1:5.6};
  function a301Swerve(){
    const H=SWERVE.L/2,M=SWERVE.module,R=SWERVE.r,w=SWERVE.width;
    // Frame: side tubes along x, front and back tubes between them.
    const tubeAlong=(path,lo,hi)=>{part(path,'Box tube 1x1',K.tube,g=>box(g,lo,hi));
      part(path,'Hole pattern',C.hole,g=>{const along=hi[0]-lo[0]>hi[1]-lo[1],n=Math.floor((along?hi[0]-lo[0]:hi[1]-lo[1])-.5);for(let k=0;k<n;k++){const t=(k-(n-1)/2);disc(g,frame(along?[t,(lo[1]+hi[1])/2,hi[2]+EPS]:[(lo[0]+hi[0])/2,t,hi[2]+EPS],Z,X),.1,8);}});};
    for(const s of [1,-1])tubeAlong([CHASSIS,`Frame tube ${s>0?'left':'right'}`],[-H,s>0?H-1:-H,TUBE.z0],[H,s>0?H:-H+1,TUBE.z1]);
    for(const s of [1,-1])tubeAlong([CHASSIS,`Frame tube ${s>0?'front':'back'}`],[s>0?H-1:-H,-H+1,TUBE.z0],[s>0?H:-H+1,H-1,TUBE.z1]);
    // Belly pan between the modules.
    part([CHASSIS,'Belly pan'],'Belly pan',K.poly,g=>{box(g,[-3.4,-H+1,PLATE.z1],[3.4,H-1,PLATE.z1+.1]);for(const s of [1,-1])box(g,s>0?[3.4,-3.4,PLATE.z1]:[-H+1,-3.4,PLATE.z1],s>0?[H-1,3.4,PLATE.z1+.1]:[-3.4,3.4,PLATE.z1+.1]);});
    for(const [k,sx,sy] of CORNERS){
      const c=[sx*M,sy*M],mod=[CHASSIS,'Swerve module '+k],up=frame([c[0],c[1],0],Z,X),steer=[...mod,'Steering'],in2=[-sx*Math.SQRT1_2,-sy*Math.SQRT1_2];
      part([...mod,'Module plate'],'Module plate',C.alu,g=>box(g,[c[0]-2.4,c[1]-2.4,PLATE.z0],[c[0]+2.4,c[1]+2.4,PLATE.z1]));
      part([...mod,'Module plate'],'Hole pattern',C.hole,g=>{for(const [dx,dy] of [[1.9,1.9],[1.9,-1.9],[-1.9,1.9],[-1.9,-1.9]])disc(g,frame([c[0]+dx,c[1]+dy,PLATE.z1+EPS],Z,X),.14,10);});
      part([...mod,'Module bearing'],'Module bearing',C.aluDark,g=>tube(g,up,1.55,1.85,3.9,PLATE.z0,40));
      // Steering: ring gear, yoke plate, two forks and the axle; the wheel in it.
      part(steer,'Ring gear 60T',C.gear,g=>gear(g,up,1.0,1.7,1.85,60,3.55,3.85));
      part(steer,'Yoke plate',K.black,g=>tube(g,up,.3,1.6,3.3,3.55,36));
      part(steer,'Forks',K.black,g=>{for(const s of [1,-1])prism(g,frame([c[0],c[1],0],Z,X),[[-1.05,s*(w+.12)],[1.05,s*(w+.12)],[1.05,s*(w+.24)],[-1.05,s*(w+.24)]],.7,3.3);});
      part(steer,'Axle',C.steel,g=>cylinder(g,frame([c[0],c[1],R],Y,X),.16,-w-.3,w+.3,6));
      wheel([...steer,'Wheel'],[c[0],c[1],R],R,w,{hub:K.blue,spokes:6,label:'Swerve wheel tire'});
      // Drive motor on the plate over the wheel, its belt down through the module (coaxial); steering servo inboard.
      motor([...mod,'Drive motor'],[c[0],c[1],PLATE.z1],Z,{label:'goBILDA 5203 Yellow Jacket 1150 rpm',shaft:.5});
      const sp=[c[0]+in2[0]*2.3,c[1]+in2[1]*2.3];servo([...mod,'Steering servo'],'Axon MINI+ steering servo',[sp[0],sp[1],PLATE.z1],[0,0,-1],[in2[0],in2[1],0]);
      part([...mod,'Steering servo'],'Steering pinion 20T',C.gear,g=>gear(g,frame([sp[0],sp[1],0],Z,X),.12,.42,.52,20,3.55,3.85));
      part([...mod,'Steering servo'],'Pinion shaft',C.steel,g=>cylinder(g,frame([sp[0],sp[1],0],Z,X),.12,3.85,PLATE.z1,6));
    }
    // OTOS under the belly pan at the centre, looking at the floor.
    part([CHASSIS,'SparkFun OTOS'],'SparkFun OTOS',K.red,g=>box(g,[-.5,-.5,PLATE.z0-.06],[.5,.5,PLATE.z0+.14]));
    part([CHASSIS,'SparkFun OTOS'],'OTOS standoffs',C.alu,g=>{for(const [dx,dy] of [[.38,.38],[-.38,.38],[.38,-.38],[-.38,-.38]])cylinder(g,frame([dx,dy,PLATE.z0+.14],Z),.06,0,PLATE.z1-PLATE.z0-.04,6);});
    hubAndBattery([ELECTRONICS],-2.8,2.8,1.1,-2.5,PLATE.z1+.1);
  }
  function swerveJoints(name){const M=SWERVE.module,R=SWERVE.r;
    return CORNERS.flatMap(([k,sx,sy])=>{const mod=`${name}/${CHASSIS}/Swerve module ${k}`;
      return [{id:'steer'+k,name:'Steering '+k,kind:'swerve-steer',type:'continuous',parts:[mod+'/Steering'],origin:[sx*M,sy*M,0],axis:[0,0,1],states:{forward:0,left:90},speed:720,drive:{signal:'steer'},source:src},
        {id:'wheel'+k,name:'Swerve wheel '+k,kind:'drive-wheel',type:'continuous',parent:'steer'+k,parts:[mod+'/Steering/Wheel'],origin:[sx*M,sy*M,R],axis:[0,1,0],radius:R,drive:{signal:'wheel'},source:src}];});}
  // ---- Starter Tank: REV's DUO FTC Starter Bot, or a generated tank like it -------------------------------------------
  // The generated one, for builds without REV's CAD: U-channel rails with three 96 mm traction wheels a side (the middle
  // pair 0.1 in lower), chained together and driven by one Yellow Jacket a side on the middle axle. In front, a sweeper
  // roller of compliant wheels over a polycarbonate ramp lifts pieces onto the hopper, which runs back between the
  // shooter's plates to an indexer roller that feeds a 96 mm flywheel under a curved hood: the shot leaves backward and
  // up, as the REV bot's does (the shooter is drawn facing forward and turned round, SHOOTER_TURNED).
  const TANK={id:'startertank',name:'Starter Tank',L:16.66,W:16.54,r:96/25.4/2,half:.55,wheelX:4.9,drop:.1};
  const INTAKE='Sweeper intake',SHOOTER='Fixed shooter (pollen + nectar)';
  const ROLLER={x:6.55,z:2.75,r:.95},FLY={x:1,z:8.6,r:96/25.4/2},HOOD_R=5.09,INDEX={x:-.95,z:4.7,r:.85},SIDE_Y=2;
  function starterTank(){
    const HX=TANK.L/2,HY=TANK.W/2,R=TANK.r,wy=HY-TANK.half,outY=wy-TANK.half-.35,railW=48/25.4,inY=outY-railW,end=HX-.012,front=HX-2.2;
    // Its side rails are 16.5 in (17 holes), inside the frame's length; a polycarbonate kick plate low across the front
    // edge, under the sweeper.
    for(const s of [1,-1]){const side=s>0?'left':'right';channel([CHASSIS,`U-Channel 1120 ${side}`],'U-Channel 1120 420mm','x',-8.25,8.25,s*outY,s);}
    part([CHASSIS,'Kick plate'],'Kick plate',K.poly,g=>box(g,[HX-.12,-outY,.9],[HX,outY,1.35]));
    channel([CHASSIS,'U-Channel 1120 front'],'U-Channel 1120 240mm','y',-inY,inY,front,1);channel([CHASSIS,'U-Channel 1120 back'],'U-Channel 1120 240mm','y',-inY,inY,-end,-1);
    gridPlate([CHASSIS,'Grid plate'],HX-.3,outY-railW/2-.3);
    for(const s of [1,-1]){const side=s>0?'left':'right',L=s>0?'L':'R';
      for(const [n,x] of [[1,TANK.wheelX],[2,0],[3,-TANK.wheelX]]){const z=R+(n===2?0:TANK.drop),path=[CHASSIS,`Drop centre traction wheel ${L}${n}`];
        wheel(path,[x,s*wy,z],R,TANK.half,{hub:K.orange});
        part(path,'Sprocket 15T',C.gear,g=>gear(g,frame([x,s*(outY+.17),z],Y,X),.2,.72,.82,15,-.06,.06));
        part(path,'Spacer',C.alu,g=>cylinder(g,frame([x,s*outY,z],Y,X),.3,0,s*(wy-TANK.half-outY),16));}
      part([CHASSIS,`Drive chain ${side}`],'Drive chain',K.black,g=>{for(const dz of [.8,-.8])box(g,[-TANK.wheelX,s*(outY+.12)-.04,R+TANK.drop/2+dz-.05],[TANK.wheelX,s*(outY+.22)+.04,R+TANK.drop/2+dz+.05]);});
      motor([CHASSIS,`Drive motor ${side}`],[0,s*inY,R],[0,-s,0],{shaft:outY-inY+.3});}
    // Sweeper intake ahead of the front channel, between the rails.
    const ramp=x=>.45+(7.45-x)*1.163,armY=inY-.1;
    part([INTAKE,'Side plates'],'Side plate',K.black,g=>{const f=frame([0,0,0],Y,X),pts=[[front,1.1],[HX-.05,1.1],[HX-.05,3.3],[ROLLER.x+.4,4.1],[front,4.1]].map(([x,z])=>[x,-z]);
      for(const s of [1,-1])prism(g,f,pts,s>0?armY-.1:-armY,s>0?armY:-armY+.1);});
    part([INTAKE,'Chute'],'Chute plate',K.poly,g=>{const f=frame([0,0,0],Y,X);prism(g,f,[[7.45,ramp(7.45)],[5.0,ramp(5.0)],[5.0,ramp(5.0)+.1],[7.45,ramp(7.45)+.1]].map(([x,z])=>[x,-z]),-armY+.12,armY-.12);});
    const rf=frame([ROLLER.x,0,ROLLER.z],Y,X),wheels=[-3.6,-2.4,-1.2,0,1.2,2.4,3.6];
    part([INTAKE,'Sweeper roller'],'Hex shaft',C.steel,g=>cylinder(g,rf,.16,-armY-.2,armY+.2,6));
    part([INTAKE,'Sweeper roller'],'Compliant wheel',K.green,g=>{for(const y of wheels)lathe(g,rf,[[.26,y-.3],[ROLLER.r-.06,y-.3],[ROLLER.r,y-.22],[ROLLER.r,y+.22],[ROLLER.r-.06,y+.3],[.26,y+.3],[.26,y-.3]],{seg:22});});
    part([INTAKE,'Sweeper roller'],'Wheel hub',K.greenHub,g=>{for(const y of wheels)tube(g,rf,.16,.3,y-.32,y+.32,8);});
    part([INTAKE,'Sweeper roller'],'Pulley',C.alu,g=>tube(g,rf,.16,.5,armY-.42,armY-.18,20));
    const mo={x:5.4,z:5};motor([INTAKE,'Intake motor'],[mo.x,armY-.1,mo.z],[0,-1,0],{gearbox:.8,shaft:.5,label:'goBILDA 5203 Yellow Jacket 1150 rpm'});
    part([INTAKE,'Intake motor'],'Belt',K.rubber,g=>{const a=[mo.x,mo.z],b=[ROLLER.x,ROLLER.z],d=[b[0]-a[0],b[1]-a[1]],l=Math.hypot(...d),u=[d[0]/l,0,d[1]/l],n=[u[2],0,-u[0]];
      for(const s of [1,-1])obox(g,frame([(a[0]+b[0])/2+n[0]*s*.48,armY-.3,(a[1]+b[1])/2+n[2]*s*.48],Y,u),l/2,.04,-.11,.11);});
    // Fixed shooter in the middle (drawn facing forward): hopper floor, side plates, indexer, flywheel and hood.
    const top=PLATE_Z+.25,dx=FLY.x-(-2.9),dz=top-3.64,side=frame([0,0,0],Y,X);
    part([SHOOTER,'Base plate'],'Base plate',C.alu,g=>box(g,[-4.1,-SIDE_Y-.3,PLATE_Z],[2.7,SIDE_Y+.3,top]));
    part([SHOOTER,'Hopper'],'Hopper floor',K.poly,g=>box(g,[-3.2,-SIDE_Y+.05,top+.3],[5.0,SIDE_Y-.05,top+.4]));
    part([SHOOTER,'Hopper'],'Hopper guides',C.alu,g=>{for(const s of [1,-1])box(g,[2.6,s>0?SIDE_Y-.1:-SIDE_Y,top+.4],[5.0,s>0?SIDE_Y:-SIDE_Y+.1,top+1.6]);
      for(const [x,y] of [[4.6,1.5],[4.6,-1.5]])cylinder(g,frame([x,y,PLATE_Z],Z),.12,0,top+.3-PLATE_Z,8);});
    const outline=[[-7.85,3.64],[-1.4,3.64],[-1.4,10.3],[-2.5,11.7],[-5.3,12.5],[-7.6,11.6],[-7.85,10.6]].map(([x,z])=>[x+dx,-(z+dz)]),st=.12;
    part([SHOOTER,'Side plates'],'Side plate',K.black,g=>{for(const s of [1,-1])prism(g,side,outline,s>0?SIDE_Y:-SIDE_Y-st,s>0?SIDE_Y+st:-SIDE_Y);});
    part([SHOOTER,'Side plates'],'Hole pattern',C.holeLight,g=>{for(const s of [1,-1])for(const [x,z,n] of [[-4.6,4.35,5],[-5.2,11.7,3]])holes(g,frame([x+dx,s*(SIDE_Y+st+EPS),z+dz],[0,s,0],X),n);});
    part([SHOOTER,'Side plates'],'Standoffs',C.alu,g=>{for(const [x,z] of [[-7.55,4.05],[-1.6,10.9]])cylinder(g,frame([x+dx,-SIDE_Y,z+dz],Y,X),.16,0,2*SIDE_Y,6);});
    const fw=frame([FLY.x,0,FLY.z],Y,X);
    part([SHOOTER,'Flywheel'],'96mm flywheel tire',K.rubber,g=>{for(const [a,b] of [[-.8,-.04],[.04,.8]])lathe(g,fw,[[1.55,a],[FLY.r-.05,a],[FLY.r,a+.06],[FLY.r,b-.06],[FLY.r-.05,b],[1.55,b],[1.55,a]],{seg:40});});
    part([SHOOTER,'Flywheel'],'Flywheel hub',C.alu,g=>{for(const [a,b] of [[-.74,-.1],[.1,.74]])tube(g,fw,.16,1.56,a,b,40);});
    part([SHOOTER,'Flywheel'],'Hole pattern',C.hole,g=>{for(const s of [1,-1])for(let k=0;k<6;k++){const a=k/6*2*Math.PI;disc(g,frame(pt(fw,Math.cos(a),Math.sin(a),s*(.74+EPS)),mul(Y,s),X),.26,12);}});
    part([SHOOTER,'Flywheel'],'Flywheel shaft',C.steel,g=>cylinder(g,fw,.16,-SIDE_Y-.05,SIDE_Y+st+.3,6));
    motor([SHOOTER,'Flywheel motor'],[FLY.x,-SIDE_Y-st,FLY.z],[0,-1,0],{gearbox:.35,label:'goBILDA 5203 Yellow Jacket 6000 rpm',shaft:.3});
    part([SHOOTER,'Hood'],'Hood plate',C.alu,g=>band(g,fw,HOOD_R,HOOD_R+.12,-1.9,1.9,-205,-150,24));
    part([SHOOTER,'Hood'],'Hood ribs',K.black,g=>{for(const s of [1,-1])band(g,fw,HOOD_R+.12,HOOD_R+.45,s>0?1.75:-1.9,s>0?1.9:-1.75,-205,-150,24);});
    part([SHOOTER,'Back guide'],'Back guide',K.poly,g=>band(g,fw,HOOD_R+.18,HOOD_R+.28,-1.7,1.7,-242,-212,10));
    // Indexer: a compliant-wheel roller under the hopper's end that lifts each piece into the flywheel.
    const xf=frame([INDEX.x,0,INDEX.z],Y,X);
    part([SHOOTER,'Indexer'],'Indexer roller',K.green,g=>{for(const y of [-1.2,0,1.2])lathe(g,xf,[[.26,y-.3],[INDEX.r-.06,y-.3],[INDEX.r,y-.22],[INDEX.r,y+.22],[INDEX.r-.06,y+.3],[.26,y+.3],[.26,y-.3]],{seg:22});});
    part([SHOOTER,'Indexer'],'Indexer shaft',C.steel,g=>cylinder(g,xf,.16,-SIDE_Y-.05,SIDE_Y+st+.3,6));
    motor([SHOOTER,'Indexer motor'],[INDEX.x,SIDE_Y+st,INDEX.z],[0,1,0],{gearbox:.8,label:'goBILDA 5203 Yellow Jacket 1150 rpm',shaft:.3});
    hubAndBattery([ELECTRONICS],-HX+.6,-HX+5.6,SIDE_Y+1.3,-SIDE_Y-1.3-1.4,PLATE_Z);
  }
  // The shooter's parts but its base plate and hopper, turned 180° about the robot's centre so it fires backward.
  const SHOOTER_TURNED=m=>m.path[1]===SHOOTER&&!['Base plate','Hopper'].includes(m.path[2]);
  function turned(list){for(const m of list)if(SHOOTER_TURNED(m))for(const a of [m.position,m.normal])for(let i=0;i<a.length;i+=3){a[i]=-a[i];a[i+1]=-a[i+1];}return list;}
  function tankJoints(name){const R=TANK.r,wy=TANK.W/2-TANK.half,S=`${name}/${SHOOTER}`,I=`${name}/${INTAKE}`;
    const wheels=[1,-1].flatMap(s=>[[1,TANK.wheelX],[2,0],[3,-TANK.wheelX]].map(([n,x])=>{const k=(s>0?'L':'R')+n;
      return {id:'wheel'+k,name:'Traction wheel '+k,kind:'drive-wheel',type:'continuous',parts:[`${name}/${CHASSIS}/Drop centre traction wheel ${k}`],origin:[x,s*wy,R+(n===2?0:TANK.drop)],axis:[0,1,0],radius:+R.toFixed(4),drive:{signal:'wheel'},source:src};}));
    // The flywheel's and the indexer's backs move up (carrying the piece; the shooter turned round, so about -y); the
    // roller's underside pulls pieces in.
    return [{id:'flywheel',name:'Flywheel',kind:'flywheel',type:'continuous',parts:[S+'/Flywheel'],origin:[-FLY.x,0,FLY.z],axis:[0,-1,0],radius:+FLY.r.toFixed(4),rpm:3200,drive:{signal:'flywheel',of:'shooter:0'},source:src},
      {id:'indexer',name:'Indexer',kind:'feeder',type:'continuous',parts:[S+'/Indexer'],origin:[-INDEX.x,0,INDEX.z],axis:[0,-1,0],radius:INDEX.r,rpm:400,drive:{signal:'feeder',of:'shooter:0'},source:src},
      {id:'roller',name:'Sweeper roller',kind:'roller-intake',type:'continuous',parts:[I+'/Sweeper roller'],origin:[ROLLER.x,0,ROLLER.z],axis:[0,1,0],radius:ROLLER.r,rpm:600,drive:{signal:'roller',of:'intake:0'},source:src},...wheels];}
  // REV's DUO FTC Starter Bot (2026-27), from REV's own CAD where the build has it: ui/assets/robots/revduo.deck.gz, made
  // locally by tools/simulation/prepare-revduo.cjs, which turns it into Deck's frame and files each moving part below into
  // an assembly of its own. Three 90 mm wheels a side (grip at the front, traction in the middle, omni at the back),
  // belted to one HD Hex 20:1 a side; two flap rollers on a Core Hex at the front lift pieces onto a polycarbonate ramp,
  // a feeder roller (a continuous Smart Robot Servo through 60-tooth gears) pushes each back under the 90 mm flywheel on
  // an HD Hex, which fires it backward up the ramp; a Smart Robot Servo swings the pollen pusher's arm out behind the
  // robot to comb pollen out of a flower. Positions in inches, Deck's frame, measured from the CAD.
  const REV={id:'revduo',name:'REV DUO FTC Starter Bot',L:16.66,W:16.54,heightIn:9.4,
    wheel:{z:1.772,r:1.772},wheels:[{name:'Wheel FL',x:5.96,y:7.4},{name:'Wheel FR',x:5.96,y:-7.4},{name:'Wheel ML',x:.3,y:7.5},{name:'Wheel MR',x:.3,y:-7.5},{name:'Wheel BL',x:-5.4,y:7.17},{name:'Wheel BR',x:-5.4,y:-7.17}],
    rollers:[{name:'Upper flap roller',x:5.7,z:7.16},{name:'Lower flap roller',x:7.82,z:3.48}],feeder:{name:'Feeder roller',x:.93,z:6.97},feederGear:{name:'Feeder drive gear',x:1.3,z:5.24},
    flywheel:{x:-3.15,z:7.44,r:1.772},pusher:{x:-4.98,y:-5.34,z:3.47,stowed:110}};
  function revJoints(name){const at=p=>`${name}/${p}`,W=REV.wheel;
    const wheels=REV.wheels.map(w=>({id:'wheel'+w.name.slice(-2),name:w.name,kind:'drive-wheel',type:'continuous',parts:[at('Drivetrain/'+w.name)],origin:[w.x,w.y,W.z],axis:[0,1,0],radius:W.r,drive:{signal:'wheel'},source:src}));
    // The flap rollers' undersides pull pieces in; the feeder's and the flywheel's undersides push them back (all about +y).
    const spin=(id,name,kind,parts,o,signal,of,rpm,axis=[0,1,0])=>({id,name,kind,type:'continuous',parts:[at(parts)],origin:[o.x,0,o.z],axis,rpm,drive:{signal,of},source:src});
    // The pusher's arm: down behind the robot in the CAD (out), swung up 110° to start inside the sizing box (stowed).
    const P=REV.pusher;
    return [spin('rollerUpper','Upper flap roller','roller-intake','Intake/Upper flap roller',REV.rollers[0],'roller','intake:0',300),spin('rollerLower','Lower flap roller','roller-intake','Intake/Lower flap roller',REV.rollers[1],'roller','intake:0',300),
      spin('feeder','Feeder roller','feeder','Feeder/Feeder roller',REV.feeder,'feeder','shooter:0',120),spin('feederGear','Feeder drive gear','feeder','Feeder/Feeder drive gear',REV.feederGear,'feeder','shooter:0',120,[0,-1,0]),
      {...spin('flywheel','Flywheel','flywheel','Launcher/Flywheel',REV.flywheel,'flywheel','shooter:0',2000),radius:REV.flywheel.r},
      {id:'pusher',name:'Pollen pusher arm',kind:'arm',type:'revolute',parts:[at('Pusher/Pusher arm')],origin:[P.x,P.y,P.z],axis:[0,1,0],lower:0,upper:115,states:{stowed:P.stowed,out:0},home:[P.stowed],speed:300,drive:{signal:'action'},source:src},...wheels];}
  // Its servo, so the arm has a port and a route action ("Pollen pusher out", "Pollen pusher stowed").
  const REV_ACTUATORS=[{id:'pusher',name:'Pollen pusher',kind:'servo',joint:'pusher',mode:'position',speed:300,states:{stowed:REV.pusher.stowed,out:0},home:REV.pusher.stowed,model:'rev-smart',device:'pusher'}];
  const REV_WIRING={devices:{'robot.left':{model:'rev-ultra-20',hub:'control',port:0},'robot.right':{model:'rev-ultra-20',hub:'control',port:1},'intakes.0.motor':{model:'rev-core-hex',hub:'control',port:2},
    'shooters.0.motor':{model:'rev-hd-hex',hub:'control',port:3},'shooters.0.indexer':{model:'rev-smart-cr',hub:'control',port:0},'kin.pusher':{model:'rev-smart',hub:'control',port:1},'robot.imu':{hub:'control',bus:0}},
    sensors:[{id:'flywheelEncoder',model:'motor-encoder',for:'shooters.0.motor',use:'velocity'}]};
  // ---- the presets ---------------------------------------------------------------------------------------------------
  // draw: its parts; joints: its moving parts (CAD frame = robot frame); heightIn: its CAD's height; sensors: where it
  // gets its position; wiring: Control Hub ports as on the robot; parts: its mechanisms' CAD assemblies; cad: the vendor
  // CAD the app shows in its place where the build has it (ui/assets/robots, personal local builds only); asset: a
  // prepared vendor CAD (with joints of its own, `variant`) used in place of the generated model where the build has it.
  const ROBOTS={
    startermecanum:{...MECANUM,cad:'strafer',draw:starterMecanum,joints:mecanumJoints,heightIn:7.25,wheelDiameterMm:104,localization:'encoders',imuSource:'hub',
      wiring:{devices:{'robot.frontLeft':{model:'gobilda-5203-1150',hub:'control',port:0},'robot.frontRight':{model:'gobilda-5203-1150',hub:'control',port:1},
        'robot.backLeft':{model:'gobilda-5203-1150',hub:'control',port:2},'robot.backRight':{model:'gobilda-5203-1150',hub:'control',port:3},'robot.imu':{hub:'control',bus:0}}}},
    a301swerve:{...SWERVE,cad:'swechanum',draw:a301Swerve,joints:swerveJoints,heightIn:9.25,wheelDiameterMm:76,localization:'optical',imuSource:'device',
      wiring:{devices:{'robot.frontLeft':{model:'gobilda-5203-1150',hub:'control',port:0},'robot.frontRight':{model:'gobilda-5203-1150',hub:'control',port:1},
        'robot.backLeft':{model:'gobilda-5203-1150',hub:'control',port:2},'robot.backRight':{model:'gobilda-5203-1150',hub:'control',port:3},
        'robot.steerFrontLeft':{model:'axon-mini-cr',hub:'control',port:0},'robot.steerFrontRight':{model:'axon-mini-cr',hub:'control',port:1},
        'robot.steerBackLeft':{model:'axon-mini-cr',hub:'control',port:2},'robot.steerBackRight':{model:'axon-mini-cr',hub:'control',port:3},
        'robot.imu':{hub:'control',bus:0},'robot.otos':{hub:'control',bus:1}}}},
    startertank:{...TANK,draw:starterTank,post:turned,joints:tankJoints,heightIn:12.5,wheelDiameterMm:96,localization:'encoders',imuSource:'hub',parts:{intakes:[INTAKE],shooters:[SHOOTER]},
      wiring:{devices:{'robot.left':{model:'gobilda-5203-435',hub:'control',port:0},'robot.right':{model:'gobilda-5203-435',hub:'control',port:1},
        'intakes.0.motor':{model:'gobilda-5203-1150',hub:'control',port:2},'shooters.0.indexer':{model:'gobilda-speed-cr',hub:'control',port:0},
        'shooters.0.motor':{model:'gobilda-5203-6000',hub:'control',port:3},'robot.imu':{hub:'control',bus:0}},
        sensors:[{id:'flywheelEncoder',model:'motor-encoder',for:'shooters.0.motor',use:'velocity'}]},
      asset:'revduo',variant:{...REV,joints:revJoints,actuators:REV_ACTUATORS,heightIn:REV.heightIn,wheelDiameterMm:90,wiring:REV_WIRING,parts:{intakes:['Intake'],shooters:['Launcher']}}}};
  // ---- demo routes -------------------------------------------------------------------------------------------------
  // BIOBUZZ red autonomous routes that show what each robot does (Deck inches from the audience-left corner, headings
  // counter-clockwise from +x), validated headlessly in tests/sim-preset-robots.test.cjs: no zone touched, ending at the
  // last pin inside the 30 s period.
  const P=(x,y,action,note,path,extra={})=>({x,y,wait:extra.wait||0,action,...(extra.turn!==undefined?{turn:extra.turn,turnMode:'absolute'}:{}),...(extra.actionSeconds!==undefined?{actionSeconds:extra.actionSeconds}:{}),...(extra.cell?{cell:extra.cell}:{}),...(note?{note}:{}),path});
  const plain=note=>({style:'sharp',note}),turn=(h,note,style='spline')=>({style,note,rotate:'turn',heading:h}),spin=note=>({kind:'action',action:'Spin up',style:'sharp',note}),take=note=>({kind:'action',action:'Intake',style:'sharp',note});
  const ROUTES={
    // The kit push bot drives square, as teams first test one: forward off the wall, a 90° turn, straight up the field to
    // (24, 120), turned around, straight back down to (24, 24), then up to park in the loading zone.
    startermecanum:{start:{x:10.11,y:27,heading:0},pins:[
      P(24,27,'','LEAVE: forward off the wall, then a 90° turn',plain('Drive forward'),{turn:90}),
      P(24,120,'','Up the field, then turned around',plain('Straight up the field'),{turn:-90}),
      P(24,24,'','Back down the field',plain('Straight back down')),
      P(21,107,'','PARK: partly in the red LOADING ZONE, facing it',plain('Up into the loading zone, pushing its pollen into the corner'),{turn:-180})]},
    // Swerve showing off: curves that spin the robot a whole turn while it drives, face the hive while it circles, spin
    // back the other way and face where it drives, then sweep the loading zone's pollen into the corner as it parks.
    a301swerve:{start:{x:9.83,y:27,heading:0},pins:[
      P(34,27,'','LEAVE: off the starting wall',plain('Off the wall')),
      P(62,28,'','',{style:'spline',note:'A full spin while it drives',rotate:'spin',spins:1}),
      P(30,54,'','',{style:'spline',note:'Facing the hive while it circles',rotate:'track',target:{x:72,y:72}}),
      P(32,86,'','',{style:'spline',note:'Spinning back the other way',rotate:'spin',spins:-1}),
      P(30,124,'','',{style:'spline',note:'Facing where it drives',rotate:'tangent'}),
      P(20.5,107,'','PARK: partly in the red LOADING ZONE, facing it',{style:'spline',note:'Into the loading zone, pushing its pollen into the corner'},{turn:-180})]},
    // REV's Starter Bot (its launcher fires out of the back; its flap rollers take pieces only across their 12.1 in), every
    // red pollen it can reach: the 4 preloaded into the up cell (tipping it); the garden pollen on the red tape by the start,
    // in at an angle down the left wall (a tank turns only where it has room, so the one pressed into the corner stays);
    // all the way up the left side to the hive, launcher first, for the other cell; then a quarter turn and into the
    // barrier for the 4 loading zone pollen lined up along it, shot last, and park with the pollen pusher out.
    startertank:{start:{x:9.67,y:27,heading:0},pins:[
      P(24,30,'Shoot','Back to the hive: the 4 preloaded pollen into the up (south) cell, tipping it',spin('Off the wall, flywheel spinning up')),
      P(13.6,30,'','',plain('Over to the left wall')),
      P(11.3,11,'Intake','The garden pollen sweep in',take('Down the wall at an angle: the flap rollers take the garden pollen on the red tape'),{actionSeconds:.6,wait:.2}),
      P(13.6,30,'','',plain('Back straight out')),
      P(28,104,'Shoot','The garden pollen into the north cell',spin('All the way up the left side, launcher first, spinning up'),{cell:'other'}),
      P(24,107.3,'','A quarter turn to face the barrier',plain('Back out of the hive'),{turn:-180}),
      P(11.5,107.3,'Intake','Against the barrier: the 4 pollen along it sweep in',take('Into the barrier, rollers on'),{actionSeconds:.6,wait:.2}),
      P(28,104,'Shoot','Last: the barrier pollen into the north cell',spin('Back to the hive, spinning up'),{cell:'other'}),
      P(18,109,'Pollen pusher out','PARK: partly in the red LOADING ZONE, the pollen pusher out',plain('Forward into the loading zone'))]}};
  // The demo route as a field of its own (the app gives it its id).
  function layout(id){const r=ROUTES[id];return {name:`${Mech().PRESETS[id].name} demo`,field:'biobuzz',alliance:'red',width:144,height:144,elements:true,start:{...r.start},zones:[],pins:JSON.parse(JSON.stringify(r.pins)),
    clearance:.25,style:'spline',rotate:false,route:null,tested:null};}
  const has=id=>Object.hasOwn(ROBOTS,id);
  // A preset as drawn: its prepared vendor CAD's variant when `asset` (the build has it), else the generated robot.
  const robotOf=(id,asset=false)=>{const r=ROBOTS[id];return asset&&r.variant?{...r,...r.variant}:r;};
  // The preset whose CAD a stored model is (it keeps the robot's name), or null; asset: whether it is the vendor CAD.
  // No model (or a nameless one) is no preset: a robot without a variant has variant?.name undefined too.
  const ofModel=m=>m?.name?Object.keys(ROBOTS).find(id=>[ROBOTS[id].name,ROBOTS[id].variant?.name].includes(m.name))||null:null;
  const assetModel=m=>!!m&&Object.values(ROBOTS).some(r=>r.variant?.name===m.name);
  // Model metadata the app stores with it (meta() adds the id and the parts found in it).
  const model=(id,asset)=>({name:robotOf(id,asset).name,units:'in',front:'+x',top:'+z',source:'step',bodyChassis:true,entered:['mass','wheel','rpm']});
  // Every part, as the STEP import gives them: [{path, name, position, normal, index, color}].
  function meshes(id){const r=ROBOTS[id];if(!r)throw Error('Unknown preset robot.');const list=TR.build(r.name,r.draw);return r.post?r.post(list):list;}
  // The import result the app stores (what src/sim-model.cjs gives for a STEP file), from its pure functions.
  function result(id,SM){const m=meshes(id);return {kind:'step',name:ROBOTS[id].name,...SM.merge(m),tree:SM.tree(m),groups:SM.groups(m),names:SM.names(m)};}
  const kinematics=(id,asset)=>{const r=robotOf(id,asset);return {model:null,unit:1,joints:r.joints(r.name),...(r.actuators?{actuators:JSON.parse(JSON.stringify(r.actuators))}:{})};};
  const wiring=(id,asset)=>JSON.parse(JSON.stringify(robotOf(id,asset).wiring));
  // What a preset puts in the project besides DeckMechanisms.PRESETS' size and mechanisms: the rest of the robot (its
  // height, wheels and wiring), sensors, IMU, kinematics (kinematics.model is set once the app has stored the CAD), the
  // mechanisms' CAD parts and its demo route as a field of its own.
  function apply(id,project,C,{asset=false}={}){
    const r=robotOf(id,asset),p=Mech().PRESETS[id],out={...project};
    out.controller='ftc';out.robot=C.robot({...project.robot,...p.robot,heightIn:r.heightIn,wheelDiameterMm:r.wheelDiameterMm,appearance:'custom',wiring:wiring(id,asset)},'ftc');
    out.sensors={...project.sensors,localization:r.localization};out.imuSource=r.imuSource;
    const m=Mech().presetMechanisms(id);if(r.parts)for(const list of ['intakes','shooters'])m[list]=m[list].map((x,n)=>r.parts[list][n]?{...x,parts:[r.parts[list][n]]}:x);
    out.mechanisms=m;out.kinematics=Kin().sanitize(kinematics(id,asset));out.robotPreset=id;return out;
  }
  return {VERSION,ROBOTS,ROUTES,REV,has,robotOf,ofModel,assetModel,model,meshes,result,kinematics,wiring,layout,apply};
});
