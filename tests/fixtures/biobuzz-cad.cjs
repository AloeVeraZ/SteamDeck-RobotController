'use strict';
// A BIOBUZZ robot as a STEP import hands it over: one mesh per part, each with its part name and the assembly
// instance names above it (root first), as src/step-worker.cjs records them. One front intake (rollers between side
// plates) with a ramp that swings down on a servo hub, and two turrets side by side at the back, each carrying its own
// shooter (a flywheel with a concentric hood). Robot frame = CAD frame: x forward, y left, z up, inches, floor at z = 0.
// style: how the team named its assemblies (see STYLES); every style has the same parts in the same places.
const S=require('./mechanism-shapes.cjs');
// The parts, by what they are. Turret k sits at y = +4 (k = 0, the left one) or -4 (k = 1, the right one).
function parts(){
  const out=[],add=(id,name,shape,color=[.62,.65,.7])=>out.push({id,name,shape,color});
  add('frame','Frame',S.box([-8,-8,1],[8,8,4]));
  [[5,7.5,'FL'],[5,-7.5,'FR'],[-5,7.5,'BL'],[-5,-7.5,'BR']].forEach(([x,y,k])=>add('wheel'+k,'104mm Mecanum Wheel',S.cylinder({center:[x,y,2],axis:[0,1,0],r:2,length:1.5}),[.98,.78,.12]));
  for(const k of [0,1]){const y=k?-4:4,t=`t${k}.`;
    add(t+'mount','Turret mount plate',S.box([-7,y-3,4.6],[0,y+3,5]));
    add(t+'ring','Turntable',S.cylinder({center:[-3.5,y,5.4],axis:[0,0,1],r:2.6,length:.25,seg:60}));
    add(t+'flywheel','Flywheel',S.cylinder({center:[-3.5,y,8.5],axis:[0,1,0],r:1.4,length:1}),[.12,.12,.13]);
    add(t+'shaft','Flywheel shaft',S.cylinder({center:[-3.5,y,8.5],axis:[0,1,0],r:.15,length:3,seg:12}));
    add(t+'hood','Hood',S.arcBand({center:[-3.5,y,8.5],axis:[0,1,0],r:3.6,t:.2,width:2,from:-30,to:60,start:[1,0,0]}));
    add(t+'plateL','Side plate',S.box([-6,y+1.4,5.6],[-1,y+1.6,11]));
    add(t+'plateR','Side plate',S.box([-6,y-1.6,5.6],[-1,y-1.4,11]));}
  // The intake: rollers between side plates; the ramp's arms and plate hinge on a servo hub shaft above them.
  add('roller','Roller',S.cylinder({center:[9.5,0,1.6],axis:[0,1,0],r:1,length:12}),[.2,.6,.3]);
  add('rollerAxle','Roller axle',S.cylinder({center:[9.5,0,1.6],axis:[0,1,0],r:.15,length:13,seg:12}));
  add('sideL','Intake side plate',S.box([5,6.2,.5],[10,6.4,5.5]));add('sideR','Intake side plate',S.box([5,-6.4,.5],[10,-6.2,5.5]));
  add('hub','Servo Hub Shaft',S.cylinder({center:[8.5,6.5,5],axis:[0,1,0],r:.6,length:.5}));
  add('bearing','Bearing',S.cylinder({center:[8.5,-6.5,5],axis:[0,1,0],r:.3,length:.2,seg:16}));
  add('armL','Arm',S.box([8.2,6.8,4.7],[14,7,5.6]));add('armR','Arm',S.box([8.2,-7,4.7],[14,-6.8,5.6]));
  add('rampPlate','Ramp plate',S.box([13.5,-7,2.5],[14,7,5.6]));
  return out;
}
const T0=['t0.mount','t0.ring','t0.flywheel','t0.shaft','t0.hood','t0.plateL','t0.plateR'],T1=T0.map(id=>id.replace('t0.','t1.'));
const DRIVE=['frame','wheelFL','wheelFR','wheelBL','wheelBR'],ROLLERS=['roller','rollerAxle','sideL','sideR'],RAMP=['hub','bearing','armL','armR','rampPlate'];
// Each style: the assembly path above each part (without the root), ending with the part's own instance, numbered as
// the CAD program names copies: Onshape "Flywheel <1>", SolidWorks "Flywheel-1", Fusion "Flywheel v1:1", or not at all
// (plain). Each mesh keeps the bare part name, as the STEP reader gives it. 'inline': the part has no instance of its own,
// its mesh sits in the assembly's node (the reader does this for many exporters: "nut", "bolt" in "rod-assembly").
const NUMBER={onshape:(name,n)=>`${name} <${n}>`,solidworks:(name,n)=>`${name}-${n}`,fusion:(name,n)=>`${name} v1:${n}`,plain:name=>name,inline:()=>null};
const inst=(ids,above,numbered='plain')=>{const seen=new Map(),out={};for(const id of ids){const name=parts().find(p=>p.id===id).name,n=(seen.get(name)||0)+1;seen.set(name,n);const own=NUMBER[numbered](name,n);out[id]=own?[...above,own]:[...above];}return out;};
const STYLES={
  // Onshape: every sub-assembly an instance, "Turret <1>" and "Turret <2>" each with its Flywheel, Hood and Turntable;
  // the ramp is its own assembly next to the intake.
  onshape:{root:'BIOBUZZ Robot',ramp:'Intake Ramp <1>',paths:{...inst(DRIVE,['Drivetrain <1>'],'onshape'),...inst(T0,['Turret <1>'],'onshape'),...inst(T1,['Turret <2>'],'onshape'),
    ...inst(ROLLERS,['Intake <1>'],'onshape'),...inst(RAMP,['Intake Ramp <1>'],'onshape')}},
  // SolidWorks: left and right turret assemblies; the deployable ramp inside the intake beside its rollers. Parts sit in
  // their assemblies' nodes (no instance of their own).
  sides:{root:'Robot',ramp:'Deployable Ramp-1',paths:{...inst(DRIVE,['Chassis-1'],'inline'),...inst(T0,['Left Turret Assembly-1'],'inline'),...inst(T1,['Right Turret Assembly-1'],'inline'),
    ...inst(ROLLERS,['Intake-1','Rollers-1'],'inline'),...inst(RAMP,['Intake-1','Deployable Ramp-1'],'inline')}},
  // Copies of one turret assembly named "Turret <1>" and "Turret <2>" with their parts in them (no instances of their
  // own), and the ramp named "Kicker" in an "Intake" holding the rollers.
  inline:{root:'BIOBUZZ',ramp:'Kicker <1>',paths:{...inst(DRIVE,['Drivetrain <1>'],'inline'),...inst(T0,['Turret <1>'],'inline'),...inst(T1,['Turret <2>'],'inline'),
    ...inst(ROLLERS,['Intake <1>'],'inline'),...inst(RAMP,['Intake <1>','Kicker <1>'],'inline')}},
  // One "Shooter" assembly holding both turrets (each with a flywheel and a hood sub-assembly); a "Ramp Deploy" assembly.
  shooter:{root:'BIOBUZZ v3',ramp:'Ramp Deploy',paths:{...inst(DRIVE,['Drive Base']),
    ...inst(['t0.mount','t0.ring'],['Shooter','Turret 1']),...inst(['t0.flywheel','t0.shaft','t0.plateL','t0.plateR'],['Shooter','Turret 1','Flywheel Assembly']),...inst(['t0.hood'],['Shooter','Turret 1','Hood Assembly']),
    ...inst(['t1.mount','t1.ring'],['Shooter','Turret 2']),...inst(['t1.flywheel','t1.shaft','t1.plateL','t1.plateR'],['Shooter','Turret 2','Flywheel Assembly']),...inst(['t1.hood'],['Shooter','Turret 2','Hood Assembly']),
    ...inst(ROLLERS,['Front Intake']),...inst(RAMP,['Ramp Deploy'])}},
  // A kicker mech (the deployable ramp) and two shooter assemblies named as copies ("Shooter L", "Shooter R"), each
  // holding its own turret; nested one level down in the top assembly, Onshape-numbered.
  kicker:{root:'Top',ramp:'Kicker Mech <1>',paths:{...inst(DRIVE,['BIOBUZZ <1>','Chassis <1>'],'onshape'),...inst(T0,['BIOBUZZ <1>','Shooter L <1>'],'onshape'),...inst(T1,['BIOBUZZ <1>','Shooter R <1>'],'onshape'),
    ...inst(ROLLERS,['BIOBUZZ <1>','Intake <1>'],'onshape'),...inst(RAMP,['BIOBUZZ <1>','Kicker Mech <1>'],'onshape')}},
  // Fusion: a "Turrets" assembly holding two copies of one turret; the kicker inside the intake beside its rollers.
  fusion:{root:'BIOBUZZ v12',ramp:'Kicker v3:1',paths:{...inst(DRIVE,['Drivetrain v4:1'],'fusion'),...inst(T0,['Turrets v3:1','Turret v7:1'],'fusion'),...inst(T1,['Turrets v3:1','Turret v7:2'],'fusion'),
    ...inst(ROLLERS,['Intake v5:1','Rollers v2:1'],'fusion'),...inst(RAMP,['Intake v5:1','Kicker v3:1'],'fusion')}},
};
// The meshes of one style, and which mesh (leaf) each part id is.
function biobuzzCad(style='onshape'){
  const st=STYLES[style];if(!st)throw Error('no style '+style);
  const meshes=[],leaf={};
  for(const p of parts()){const above=st.paths[p.id];if(!above)throw Error(`${style}: no path for ${p.id}`);leaf[p.id]=meshes.length;
    meshes.push({name:p.name,color:p.color,position:Float32Array.from(p.shape.positions),normal:null,index:Uint32Array.from(p.shape.index),path:[st.root,...above]});}
  return {meshes,leaf,style:st};
}
module.exports={biobuzzCad,STYLES:Object.keys(STYLES),T0,T1,DRIVE,ROLLERS,RAMP};
