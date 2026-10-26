'use strict';
// What drives a mechanism (ui/sim-actuators.js): FTC motors and servos with their makers' numbers, a servo's positions
// as the robot code sends them (the SDK's 600–2400 µs pulses for 0 and 1), a motor's encoder counts through its gearing,
// and the settings a part's actuator keeps (ui/sim-kinematics.js).
const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('../ui/sim-actuators.js'),K=require('../ui/sim-kinematics.js'),T=require('../ui/sim-mechanism-types.js');
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,`${msg||''} ${a} ≠ ${b}`);

test('a servo turns its rated degrees across 500–2500 µs, so the SDK default 0–1 (600–2400 µs) is 90% of it',()=>{
  const at=(model,pwm)=>A.perUnit({kind:'servo',model,servo:{...(pwm?{pwm}:{})}});
  near(at('gobilda-torque'),270,1e-9,'goBILDA 300° servo');near(at('gobilda-torque',A.PWM.full),300,1e-9,'with setPwmRange(500, 2500)');
  near(at('rev-smart'),243,1e-9,'REV Smart Robot Servo 270°');near(at('axon-max'),315,1e-9,'Axon 350°');near(at('gobilda-5turn'),1620,1e-9,'goBILDA 5-turn');
  // A linear servo is rated over 1–2 ms, so the default 0–1 spans 1.8 times its stroke and it moves from 0.222 to 0.778.
  const l=A.create({id:'p',joint:'j',name:'Pusher',spec:{kind:'linear',model:'actuonix-l16-50'}});near(A.perUnit(l),50/25.4*1.8,1e-3);
  near(l.servo.min,2/9,1e-4,'retracted');near(l.servo.max,7/9,1e-4,'out');near(l.servo.center,2/9,1e-4,'the CAD has it retracted');
  near(A.limits(l)[1],50/25.4,1e-3,'it goes out its whole stroke');
});

test('named positions as the code sends them: the CAD pose at the center, held between min and max, either way round',()=>{
  const a={kind:'servo',model:'gobilda-speed',ratio:1,servo:{min:.2,max:.8,center:.5}};
  near(A.position(a,0),.5,1e-12);near(A.position(a,27),.6,1e-12,'27° of 270°');near(A.position(a,-27),.4,1e-12);
  assert.equal(A.position(a,200),.8,'held at its highest');assert.equal(A.position(a,-200),.2,'and lowest');
  near(A.valueAt(a,.6),27,1e-9);assert.deepEqual(A.limits(a).map(v=>+v.toFixed(6)),[-81,81]);
  const rev={...a,reversed:true};near(A.position(rev,27),.4,1e-12,'higher positions turn it the other way');near(A.valueAt(rev,.4),27,1e-9);
  // Geared 2:1 (the servo turns twice as far as the part): half the position change per degree of the part.
  near(A.position({...a,ratio:2},27),.7,1e-12);
  const d=A.device(a,{open:0,closed:27});assert.deepEqual(d,{type:'Servo',name:'part',positions:{open:.5,closed:.6}});
});

test('a DC motor counts its encoder through the gearing after it: a 435 rpm goBILDA on a 1.4 in spool',()=>{
  const lift=T.motorFor('lift');assert.equal(lift.model,'gobilda-5203-435');
  const a=A.create({id:'lift_motor',joint:'lift',name:'Lift',spec:lift});
  assert.equal(a.kind,'dcmotor');assert.equal(a.cpr,384.5);assert.equal(a.response,'motor');assert.equal(a.motor.free,435*6);assert.equal(a.motor.stall,1.83);assert.equal(a.device,'lift');
  near(A.countsPer(a),384.5/(Math.PI*1.4),1e-9,'counts per inch');assert.equal(A.ticks(a,24),Math.round(24*384.5/(Math.PI*1.4)));
  near(A.speedOf(a),435/60*Math.PI*1.4,1e-6,'inches a second with no load');
  const d=A.device({...a,reversed:true},{down:0,up:24});assert.equal(d.type,'DcMotorEx');assert.equal(d.reversed,true);assert.deepEqual(d.ticks,{down:0,up:2098});
  // It saves, and the simulator moves the lift with the motor's torque line through the spool.
  const model=K.sanitize({joints:[T.joint('lift',{id:'lift',name:'Lift'})],actuators:[a]}),s=model.actuators[0];
  assert.equal(s.model,'gobilda-5203-435');assert.equal(s.cpr,384.5);assert.equal(s.device,'lift');near(s.ratio,360/(Math.PI*1.4),1e-6);
  const drv=new K.Driver(model);assert.equal(drv.start('Lift up'),true);for(let i=0;i<600;i++)drv.tick(.01,{});near(drv.values().lift,24,.05,'it reaches up');
});

test('another model keeps the positions the team set; a servo in place of a motor drops the motor’s numbers',()=>{
  const m=A.create({id:'x',joint:'j',name:'Arm',spec:T.motorFor('arm')});assert.equal(m.model,'gobilda-5203-117');near(m.ratio,3,1e-9,'20:60 belt');
  const s=A.withModel({...m,servo:{center:.4}},'axon-max');assert.equal(s.kind,'servo');assert.equal(s.cpr,undefined);assert.equal(s.response,undefined);assert.equal(s.motor,undefined);
  assert.equal(s.servo.center,.4);assert.equal(s.servo.range,350);
  const back=A.withModel(s,'gobilda-5203-312');assert.equal(back.servo,undefined);assert.equal(back.cpr,537.7);
  // A servo for a 0°–180° virtual four-bar is centred so both ends fit its sweep.
  const v=A.create({id:'v',joint:'v',name:'V4B',spec:T.motorFor('v4b'),states:{down:0,up:180}});const p=[A.position(v,0),A.position(v,180)];
  assert.ok(p[0]>0&&p[1]<1,JSON.stringify(p));near(p[0]+p[1],1,1e-3);
  // A servo driving a slide through a linkage covers the slide's travel in its whole sweep.
  const ls=A.create({id:'e',joint:'e',name:'Extendo',spec:T.motorFor('linkage-slide'),travel:18,states:{in:0,out:18}});
  near(A.position(ls,0),0,1e-4);near(A.position(ls,18),1,1e-4);
});

test('every model has the numbers the panel and the simulator need, and each type’s usual model exists',()=>{
  for(const m of A.ALL){assert.ok(m.name&&m.short,m.id);
    if(m.kind==='servo'||m.kind==='linear')assert.ok(m.range>0&&m.speed>0&&m.pulse[1]>m.pulse[0],m.id);
    if(m.kind==='crservo')assert.ok(m.rpm>0,m.id);if(m.kind==='dcmotor')assert.ok(m.rpm>0&&m.cpr>0&&m.stall>0,m.id);}
  assert.equal(new Set(A.ALL.map(m=>m.id)).size,A.ALL.length,'ids are unique');
  for(const t of T.LIST)if(t.motor?.model)assert.ok(A.MODELS[t.motor.model],`${t.id}: ${t.motor.model}`);
  // goBILDA's own figures: counts are 28 per motor turn times the gearbox (its exact ratio, within 1% of the name's).
  for(const m of A.MOTORS.filter(x=>x.family==='goBILDA 5203 Yellow Jacket'))near(m.cpr,28*m.ratio,.01*m.cpr,m.id);
  // Settings that do not make sense are not kept.
  const s=K.sanitize({joints:[{id:'j',type:'revolute'}],actuators:[{id:'a',joint:'j',kind:'servo',model:'NOT A MODEL',device:'2bad',servo:{min:.9,max:.1,center:2,pwm:[2400,600]},cpr:-3}]}).actuators[0];
  assert.equal(s.model,undefined);assert.equal(s.device,undefined);assert.deepEqual(s.servo,{min:.1,max:.9,center:.9,range:300});assert.equal(s.cpr,undefined);
});
