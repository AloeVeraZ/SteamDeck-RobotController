(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckSimConfig=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // Shared by the editor and the local physics adapter. Labels describe drivetrain families,
  // not hardware integrations. H/Kiwi use the generic omni-wheel physics model.
  const drives={
    mecanum:{name:'Mecanum · 4 wheels',engine:'mecanum',holonomic:true},
    swerve:{name:'Swerve · independent modules',engine:'swerve',holonomic:true},
    tank:{name:'Tank · 4 wheels',engine:'tank',holonomic:false},
    tank2:{name:'Differential · 2 wheels + casters',engine:'tank',holonomic:false},
    tank6:{name:'Tank · 6 wheels / drop centre',engine:'tank',holonomic:false},
    tank8:{name:'Tank · 8 wheels',engine:'tank',holonomic:false},
    tracks:{name:'Tank · continuous tracks',engine:'tank',holonomic:false},
    xdrive:{name:'X-drive · 4 omni wheels',engine:'xdrive',holonomic:true},
    kiwi:{name:'Kiwi · 3 omni wheels',engine:'xdrive',holonomic:true,approximation:'Generic omni-wheel physics'},
    hdrive:{name:'H-drive / U-drive · omni wheels',engine:'xdrive',holonomic:true,approximation:'Generic omni-wheel physics'},
    diffSwerve:{name:'Differential swerve',engine:'swerve',holonomic:true,approximation:'Generic swerve physics'},
    coaxSwerve:{name:'Coaxial swerve',engine:'swerve',holonomic:true,approximation:'Generic swerve physics'},
    butterfly:{name:'Butterfly · mecanum set lowered',engine:'butterfly',holonomic:true}
  };
  const sensors={
    none:{name:'Legacy sensor-free test fixture',translation:false,imu:false,error:[0,0,0],hidden:true},
    odometry:{name:'2 odometry pods + IMU',translation:true,imu:true,error:[.003,.02,.5]},
    odometry3:{name:'3 odometry pods + IMU',translation:true,imu:true,error:[.003,.02,.5]},
    encoders:{name:'Drive encoders + IMU',translation:true,imu:true,error:[.015,.05,.5]},
    encodersOnly:{name:'Legacy encoder test fixture',translation:true,imu:false,error:[.015,.05,2],hidden:true},
    optical:{name:'SparkFun OTOS · optical + IMU',translation:true,imu:true,error:[.005,.025,.5]},
    fused:{name:'goBILDA Pinpoint · 2 pods + IMU',translation:true,imu:true,error:[.002,.01,.2]},
    vision:{name:'Legacy vision test fixture',translation:true,imu:true,error:[.01,.06,.5],hidden:true},
    gyro:{name:'IMU only · no position',translation:false,imu:true,error:[0,0,.5]},
    ideal:{name:'Internal deterministic test fixture',translation:true,imu:true,error:[0,0,0],hidden:true}
  };
  const finite=n=>typeof n==='number'&&Number.isFinite(n),positive=(n,f)=>finite(n)&&n>0?n:f;
  const intake=r=>finite(r?.intakeIn)?Math.max(0,r.intakeIn):({sloped:3,vector:3.5,triangle:3}[r?.intake]??0);
  // REV Control Hub: 10 A continuous per motor port (20 A absolute peak), 8–15 V input,
  // nominal 12 V. MotionModule's reference build uses external 3–18 V dual drivers,
  // a 12 V battery, regulated Pi 5 V and a separate servo rail. Its driver listing's
  // 10 A is an estimate, not a verified continuous rating. Neither model simulates fuses.
  // driveAmps is retained solely for old setup files; it is not an editable torque multiplier.
  const electrical={ftc:{defaultAmps:10,maxAmps:10,voltage:12,minVoltage:8,maxVoltage:15},motionmodule:{defaultAmps:10,voltage:12,minVoltage:3,maxVoltage:18}};
  function current(value,controller){const profile=electrical[controller];return Math.min(profile?.maxAmps??Infinity,positive(value,profile?.defaultAmps??20));}
  function robot(raw={},controller){return {drivetrain:Object.hasOwn(drives,raw.drivetrain)?raw.drivetrain:'mecanum',intakeIn:intake(raw),
    length:positive(raw.length,17.56),width:positive(raw.width,17.79),heightIn:positive(raw.heightIn,12),massLb:positive(raw.massLb,9.41),driveRpm:positive(raw.driveRpm,312),wheelDiameterMm:positive(raw.wheelDiameterMm,104),driveAmps:current(raw.driveAmps,controller),driveStyle:raw.driveStyle==='field'?'field':'robot',
    appearance:['strafer','swechanum','plain','custom'].includes(raw.appearance)?raw.appearance:raw.drivetrain==='swerve'?'swechanum':'strafer'};}
  function footprint(raw){const r=robot(raw);return {front:r.length/2+r.intakeIn,rear:r.length/2,half:r.width/2};}
  function bounds(layout){if(layout?.field!=='empty')return {x0:0,y0:0,x1:144,y1:144};
    return {x0:0,y0:0,x1:positive(layout.width,144),y1:positive(layout.height,144)};}
  const sensorChoices=controller=>controller==='motionmodule'?['gyro','odometry','odometry3','optical']:['encoders','odometry','odometry3','fused','optical','gyro'];
  const localization=(controller,mode)=>sensorChoices(controller).includes(mode)?mode:controller==='motionmodule'?'gyro':'encoders';
  return {drives,sensors,sensorChoices,localization,electrical,current,robot,intake,footprint,bounds,finite};
});
