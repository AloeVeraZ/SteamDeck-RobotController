'use strict';
// Configure from CAD: the mechanisms the team added (+ Add mechanism) are found in the CAD by the names most like
// them, whatever the CAD calls them, and the game's intakes and shooters take the CAD's named assemblies while keeping
// what the team chose.
const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../ui/sim-mechanism-types.js'),D=require('../ui/sim-discovery.js'),K=require('../ui/sim-kinematics.js'),Mech=require('../ui/sim-mechanisms.js');
const S=require('./fixtures/mechanism-shapes.cjs');
const rows=[[1,0,0],[0,1,0],[0,0,1]],near=(a,b,tol,msg)=>[].concat(a).forEach((v,i)=>assert.ok(Math.abs(v-[].concat(b)[i])<=tol,`${msg||''} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));

test('a CAD name like the mechanism: its type’s words, the team’s own name (plurals, a typo), not its hardware',()=>{
  const like=(kind,name,cad)=>T.likeness({kind,name},cad);
  assert.ok(like('lift','Lift','Lift <1>')>=3,'its own name and type');
  assert.ok(like('linear-slide','Extendo','Horizontal Extension')>=1,'another word for the same thing');
  assert.ok(like('lift','Lift','Viper slides')>=1,'one of its family (slides that lift)');
  assert.ok(like('claw','Grabby','Grabby v2 final')>=1,'the team’s own word, with version and final dropped');
  assert.ok(like('roller-intake','Intake','Intkae')>=1,'one typo');assert.ok(like('hang-hook','Hooks','Hook')>=1,'one of a plural');
  assert.ok(like('claw','Claw','Claw servo')<1,'its servo is a piece of it');assert.ok(like('lift','Lift','Lift motor mount')<1);
  assert.ok(like('claw','Claw','Lift')<=0,'another mechanism');assert.equal(like('roller-intake','Intake','48mm Gecko Wheel - 15A (GB)'),0,'a vendor part');
  assert.ok(like('claw','Claw','Claw')>like('claw','Claw','Outtake claw assembly'),'a closer name wins');
});

// A robot whose team names are its own: "Horizontal Ext" (an extendo on two rails), "Grabby" (a claw with two fingers
// on hinge pins) and a "Spinny boi" turntable nobody would guess.
function oddRobot(){
  const b=S.builder(),root=b.node('Robot'),chassis=b.node('Chassis',root),ext=b.node('Horizontal Ext',root),grab=b.node('Grabby',root),spin=b.node('Spinny boi',root),n=(name,parent)=>b.node(name,parent),L={};
  L.frame=b.add(n('Frame plate',chassis),S.box([-8,-8,1],[8,8,3]));
  L.outer=[-3,3].map(y=>b.add(n('Outer rail',ext),S.box([3,y-.3,3],[15,y+.3,3.6])));L.inner=[-3,3].map(y=>b.add(n('Inner rail',ext),S.box([4,y-.25,3.65],[16,y+.25,4.1])));
  L.base=b.add(n('Grabby base',grab),S.box([-6.5,5,5],[-5.5,9,7]));L.pins=[5.5,8.5].map(y=>b.add(n('Hinge pin',grab),S.cylinder({center:[-5.2,y,6],axis:[0,0,1],r:.12,length:2.2,seg:24})));
  L.fingers=[5.5,8.5].map(y=>b.add(n('Finger',grab),S.box([-5.4,y-.2,5.2],[-3,y+.2,6.8])));
  L.plate=b.add(n('Turn plate',spin),S.cylinder({center:[1,-4,5],axis:[0,0,1],r:2,length:.3,seg:48}));L.post=b.add(n('Post',spin),S.box([.6,-4.4,5.15],[1.4,-3.6,8]));
  const meta={id:'00112233445566778899aabbccddeeff.glb',units:'in',front:'+x',top:'+z',parts:[{name:'Chassis',role:'chassis',key:'Robot/Chassis',box:[-8,-8,1,8,8,3]}]};
  return {arrays:b.arrays(),leaves:L,meta};
}

test('the mechanisms the team added are found by name, and each finds its rails, hinge or turntable',()=>{
  const r=oddRobot(),ctx=D.prepare(r.arrays),L=r.leaves,leaves=j=>ctx.parts.expand(j.parts);
  const want=[{id:'extendo',kind:'linear-slide',name:'Extendo'},{id:'claw',kind:'claw',name:'Grabby'},{id:'turret',kind:'mini-turret',name:'Spinny boi'},{id:'hang',kind:'hang-hook',name:'Hang'}];
  const {joints,report}=D.discover(ctx,{rows,unit:1,meta:r.meta,mechanisms:Mech.sanitize({}),want});
  const forOf=id=>joints.filter(j=>j.for===id);
  const ext=forOf('extendo');assert.equal(ext.length,1,JSON.stringify(joints.map(j=>[j.name,j.kind,j.for])));assert.equal(ext[0].matched,'Horizontal Ext');
  assert.equal(ext[0].type,'prismatic');near(ext[0].axis,[1,0,0],1e-3,'reaches forward');assert.ok(L.inner.every(k=>leaves(ext[0]).has(k))&&L.outer.every(k=>!leaves(ext[0]).has(k)),'the inner rails ride');
  const claw=forOf('claw');assert.equal(claw.length,1);assert.equal(claw[0].kind,'claw');assert.equal(claw[0].matched,'Grabby');assert.ok(L.fingers.some(k=>leaves(claw[0]).has(k)),'a finger closes');
  assert.ok(joints.some(j=>j.kind==='claw'&&j!==claw[0]),'its other finger follows it');
  const yaw=forOf('turret');assert.equal(yaw.length,1,'a name no word list knows, matched by the team’s own name');near(yaw[0].axis,[0,0,1],1e-6,'turns about its plate, upright');near(yaw[0].origin,[1,-4,5],1e-3);
  assert.equal(forOf('hang').length,0,'nothing in this CAD is like a hang');
  assert.ok(report.some(x=>/From the names in your CAD/.test(x)),report.join(' | '));
  // Without the team's names, "Spinny boi" and "Grabby" say nothing.
  const plain=D.discover(ctx,{rows,unit:1,meta:r.meta,mechanisms:Mech.sanitize({})}).joints;assert.ok(!plain.some(j=>j.kind==='mini-turret'||j.kind==='claw'),JSON.stringify(plain.map(j=>j.kind)));
});

test('one CAD assembly per mechanism: two claws added take the two claw assemblies, best name first',()=>{
  const b=S.builder(),root=b.node('Robot'),n=(name,parent)=>b.node(name,parent);b.add(n('Frame',b.node('Chassis',root)),S.box([-8,-8,1],[8,8,3]));
  for(const [name,x] of [['Intake claw',-4],['Outtake claw',4]]){const c=b.node(name,root);b.add(n('Base',c),S.box([x-.5,-2,5],[x+.5,2,7]));
    for(const y of [-1.5,1.5]){b.add(n('Hinge pin',c),S.cylinder({center:[x+.7,y,6],axis:[0,0,1],r:.12,length:2.2,seg:24}));b.add(n('Finger',c),S.box([x+.6,y-.2,5.2],[x+3,y+.2,6.8]));}}
  const ctx=D.prepare(b.arrays()),meta={id:'00112233445566778899aabbccddeeff.glb',units:'in',front:'+x',top:'+z',parts:[]};
  const {joints}=D.discover(ctx,{rows,unit:1,meta,mechanisms:Mech.sanitize({}),want:[{id:'a',kind:'claw',name:'Outtake claw'},{id:'b',kind:'claw',name:'Intake grabber'}]});
  assert.equal(joints.find(j=>j.for==='a')?.matched,'Outtake claw');assert.equal(joints.find(j=>j.for==='b')?.matched,'Intake claw');
});

test('the game’s intakes and shooters take the CAD’s named assemblies and keep what the team chose',()=>{
  const cad={intakes:[{kind:'sweeper',sides:['front'],reach:6.5,width:15.5,height:6.25,from:'intake v4',parts:['intake v4','FRONT RAMP']},{kind:'sweeper',sides:['back'],reach:2,width:10,height:4,from:'rear intake',parts:['rear intake']}],
    shooters:[{type:'turret',pieces:'nectar',mount:'front',at:{x:4,y:0,z:14},from:'NECTAR V2',parts:['NECTAR V2','turret final']},{type:'turret',pieces:'pollen',mount:'back',at:{x:-5,y:0,z:14},from:'POLLEN V2',parts:['POLLEN V2','turret final']}]};
  // The team added a ramp intake (on the left) and one fixed pollen shooter with its own motor names.
  const team=Mech.sanitize({enabled:true,intakes:[{kind:'ramp',sides:['left'],servo:'ramp',downPos:.1,upPos:.9}],shooters:[{type:'fixed',pieces:'pollen',mount:'center',motor:'launcher'}]});
  const {mechanisms:m,matched,extra}=Mech.adoptCad(team,cad);
  assert.equal(m.intakes.length,1);assert.equal(m.intakes[0].kind,'ramp','its kind stays');assert.deepEqual(m.intakes[0].sides,['front'],'its side from the CAD');assert.equal(m.intakes[0].reach,6.5);
  assert.deepEqual(m.intakes[0].parts,['intake v4','FRONT RAMP']);assert.equal(m.intakes[0].servo,'ramp');assert.equal(m.intakes[0].downPos,.1);
  assert.equal(m.shooters.length,1);assert.equal(m.shooters[0].type,'fixed','fixed stays fixed');assert.equal(m.shooters[0].mount,'back','the pollen shooter’s spot');assert.equal(m.shooters[0].motor,'launcher');
  assert.deepEqual(m.shooters[0].parts,['POLLEN V2','turret final']);
  assert.equal(matched.length,2);assert.equal(extra.length,2,'the rear intake and the nectar turret are listed, not added');assert.ok(extra.some(x=>/rear intake/.test(x))&&extra.some(x=>/NECTAR/.test(x)),extra.join());
  // With nothing added, the CAD's are used.
  const all=Mech.adoptCad(Mech.sanitize({}),cad).mechanisms;assert.equal(all.enabled,true);assert.equal(all.intakes.length,2);assert.equal(all.shooters.length,2);
  // An intake the CAD has nothing for keeps a free side.
  const two=Mech.adoptCad(Mech.sanitize({enabled:true,intakes:[{kind:'kicker',sides:['front']},{kind:'siderollers',sides:['left']}],shooters:[]}),{intakes:[cad.intakes[0]],shooters:[]}).mechanisms;
  assert.deepEqual(two.intakes.map(i=>i.sides[0]),['front','left']);
});
