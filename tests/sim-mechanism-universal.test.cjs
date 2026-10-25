'use strict';
// Transmissions, actuators, sensors and actions beyond one joint driving one part, each checked against an answer worked
// out independently of the engine: ros2_control's differential transmission, CoreXY belt kinematics, the Willis
// equation from pitch-line speeds, an eccentric cam, a Geneva wheel, gm0's rigging orders, a DC motor's exponential
// spin-up, and a closed geared five-bar.
const {test}=require('node:test'),assert=require('node:assert/strict'),K=require('../ui/sim-kinematics.js');
const {apply,len,sub}=K.math,R=Math.PI/180;
const near=(a,b,tol,msg)=>{const x=[].concat(a),y=[].concat(b);assert.equal(x.length,y.length,msg);x.forEach((v,i)=>assert.ok(Math.abs(v-y[i])<=tol,`${msg||''} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));};
const model=raw=>K.sanitize(raw),at=(m,q,id,p)=>apply(K.pose(m,q).W.get(id),p);
// Rodrigues, written out again so the checks do not lean on the engine's own rotation.
function turn(v,axis,deg){const l=Math.hypot(...axis),[x,y,z]=axis.map(c=>c/l),a=deg*R,c=Math.cos(a),s=Math.sin(a),d=x*v[0]+y*v[1]+z*v[2];
  return [v[0]*c+(y*v[2]-z*v[1])*s+x*d*(1-c),v[1]*c+(z*v[0]-x*v[2])*s+y*d*(1-c),v[2]*c+(x*v[1]-y*v[0])*s+z*d*(1-c)];}
const run=(d,name,dt=1/240,cap=60)=>{assert.equal(d.start(name),true,`${name} starts`);let t=0;while(d.busy(name)&&t<cap){d.tick(dt,{});t+=dt;}return t;};
// Four-bar position analysis: both places the coupler and rocker can meet (circle–circle intersection).
function fourBar(a,b,c,d,theta){const t=theta*R,B={x:a*Math.cos(t),y:a*Math.sin(t)},ux=d-B.x,uy=-B.y,e=Math.hypot(ux,uy),along=(b*b-c*c+e*e)/(2*e),h=Math.sqrt(Math.max(0,b*b-along*along));
  return [1,-1].map(s=>({x:B.x+along*ux/e-s*h*uy/e,y:B.y+along*uy/e+s*h*ux/e}));}

test('a four-bar driven by a motor stays closed in a run: the driver sends only what it drives, and pose() solves the rest',()=>{
  const a=2,b=6,c=5,d=6,rest=60,[C0]=fourBar(a,b,c,d,rest).sort((p,q)=>q.y-p.y),B0={x:a*Math.cos(rest*R),y:a*Math.sin(rest*R)};
  const m=model({joints:[{id:'crank',type:'continuous',axis:[0,0,1]},{id:'coupler',type:'revolute',parent:'crank',origin:[B0.x,B0.y,0],axis:[0,0,1]},{id:'rocker',type:'revolute',origin:[d,0,0],axis:[0,0,1]}],
    actuators:[{id:'motor',joint:'crank',kind:'dcmotor',speed:90}],loops:[{a:{joint:'coupler',point:[C0.x,C0.y,0]},b:{joint:'rocker',point:[C0.x,C0.y,0]}}],actions:[{name:'Turn',steps:[{actuator:'motor',command:{target:45}}]}]});
  const dr=new K.Driver(m);run(dr,'Turn');const v=dr.values();assert.deepEqual(Object.keys(v),['crank'],'only the driven joint');near(v.crank,45,1e-9);
  const p=K.pose(m,v),[x,y]=apply(p.W.get('rocker'),[C0.x,C0.y,0]),want=fourBar(a,b,c,d,rest+45).sort((u,w)=>Math.hypot(u.x-x,u.y-y)-Math.hypot(w.x-x,w.y-y))[0];
  assert.ok(p.loopError<1e-5,`closed (${p.loopError})`);near([x,y],[want.x,want.y],1e-4,'rocker end where the circles meet');
});

test('differential wrist: pitch and roll from two motors, as ros2_control’s DifferentialTransmission writes it',()=>{
  // x_j1 = (x_a1/n_a1 + x_a2/n_a2)/(2·n_j1), x_j2 = (x_a1/n_a1 − x_a2/n_a2)/(2·n_j2); here n_a = 2 (motor gearboxes), n_j = 1.
  const na=2,nj=1,k=1/(2*na*nj),m=model({joints:[{id:'a1',type:'continuous'},{id:'a2',type:'continuous'},{id:'pitch',type:'revolute',origin:[0,0,0],axis:[0,1,0]},{id:'roll',type:'continuous',parent:'pitch',origin:[0,0,0],axis:[1,0,0]}],
    couplings:[{kind:'differential',from:'a1',to:'pitch',ratio:k,plus:[{from:'a2',ratio:k}]},{kind:'differential',from:'a1',to:'roll',ratio:k,plus:[{from:'a2',ratio:-k}]}]});
  for(const [a1,a2] of [[120,40],[-90,200],[360,360]]){const pitch=(a1/na+a2/na)/(2*nj),roll=(a1/na-a2/na)/(2*nj),q=K.resolve(m,{a1,a2});near([q.pitch[0],q.roll[0]],[pitch,roll],1e-9,`joints for ${a1}, ${a2}`);
    // The tool (3 in along the forearm, 1 up) is rolled about the forearm, then pitched with it.
    near(at(m,{a1,a2},'roll',[3,0,1]),turn(turn([3,0,1],[1,0,0],roll),[0,1,0],pitch),1e-9,'tool point');}
  near(K.resolve(m,{a1:100,a2:100}).roll,[0],1e-12,'equal motors pitch without rolling');near(K.resolve(m,{a1:100,a2:-100}).pitch,[0],1e-12,'opposite motors roll without pitching');
});

test('CoreXY gantry: ΔX = (ΔA + ΔB)/2 and ΔY = (ΔA − ΔB)/2 of belt travel; one motor alone moves diagonally',()=>{
  const d=.5,r=Math.PI*d/360,m=model({joints:[{id:'A',type:'continuous'},{id:'B',type:'continuous'},{id:'x',type:'prismatic',axis:[1,0,0],lower:0,upper:12},{id:'y',type:'prismatic',parent:'x',axis:[0,1,0],lower:0,upper:12}],
    couplings:[{kind:'differential',from:'A',to:'x',ratio:r/2,plus:[{from:'B',ratio:r/2}]},{kind:'differential',from:'A',to:'y',ratio:r/2,plus:[{from:'B',ratio:-r/2}]}]});
  for(const [A,B] of [[1000,600],[720,0],[1500,1500]]){const p=at(m,{A,B},'y',[0,0,0]);near([p[0],p[1]],[Math.min(12,r*(A+B)/2),Math.max(0,Math.min(12,r*(A-B)/2))],1e-9,`effector for A ${A}, B ${B}`);}
  const p=at(m,{A:720,B:0},'y',[0,0,0]);near(p[0],p[1],1e-12,'A alone: 45°');
});

test('planetary gearset: the carrier turns as the pitch-line speeds say, and every member can be the output',()=>{
  const Ns=12,Nr=36,joints=[{id:'sun',type:'continuous'},{id:'ring',type:'continuous'},{id:'carrier',type:'continuous'}];
  // Independent: the planet's centre moves at the mean of its two mesh speeds, ωc·(Rs + Rp) = (ωs·Rs + ωr·Rr)/2 with
  // Rr = Rs + 2·Rp, so ωc = (ωs·Rs + ωr·Rr)/(Rs + Rr); radii go as tooth counts.
  const carrier=(ws,wr)=>(ws*Ns+wr*Nr)/(Ns+Nr);
  const m=model({joints,couplings:[K.planetary({sun:'sun',ring:'ring',carrier:'carrier',sunTeeth:Ns,ringTeeth:Nr})]});
  near(K.resolve(m,{sun:400}).carrier,[carrier(400,0)],1e-9,'ring held: 4:1 (1 + Nr/Ns)');near(carrier(400,0),100,1e-12);
  near(K.resolve(m,{sun:-50,ring:90}).carrier,[carrier(-50,90)],1e-9,'both turning');
  const sun=model({joints,couplings:[K.planetary({sun:'sun',ring:'ring',carrier:'carrier',sunTeeth:Ns,ringTeeth:Nr,out:'sun'})]}),ring=model({joints,couplings:[K.planetary({sun:'sun',ring:'ring',carrier:'carrier',sunTeeth:Ns,ringTeeth:Nr,out:'ring'})]});
  const qs=K.resolve(sun,{carrier:25,ring:10}).sun[0],qr=K.resolve(ring,{carrier:25,sun:70}).ring[0];near(carrier(qs,10),25,1e-9,'sun as the output');near(carrier(70,qr),25,1e-9,'ring as the output');
});

test('cam and follower: an eccentric disc lifts a flat follower by e·(1 − cos θ), every turn',()=>{
  const e=.5,curve=Array.from({length:73},(_,i)=>[i*5,e*(1-Math.cos(i*5*R))]);
  const m=model({joints:[{id:'cam',type:'continuous',axis:[0,1,0]},{id:'follower',type:'prismatic',axis:[0,0,1]}],couplings:[{kind:'cam',from:'cam',to:'follower',curve,period:360}]});
  for(const th of [0,37,90,181,359,725,-40])near(K.resolve(m,{cam:th}).follower,[e*(1-Math.cos(th*R))],1e-3*e,`lift at ${th}°`);
  assert.deepEqual(m.couplings[0].curve.length,73,'the table is kept');assert.equal(m.couplings[0].period,360);
});

test('Geneva drive: four slots, a quarter turn of the wheel per turn of the crank, still in between',()=>{
  // Engaged for α = θ − 180° within ±45°: tan β = sin α / (√2 − cos α) (centre distance = crank/sin 45°).
  const geneva=th=>{const a=th-180;return a<=-45?0:a>=45?90:45+Math.atan2(Math.sin(a*R),Math.SQRT2-Math.cos(a*R))/R;};
  const curve=[[0,0],...Array.from({length:91},(_,i)=>[135+i,geneva(135+i)]),[360,90]];
  const m=model({joints:[{id:'crank',type:'continuous'},{id:'wheel',type:'continuous'}],couplings:[{kind:'linkage',from:'crank',to:'wheel',curve,period:360}]});
  near(K.resolve(m,{crank:100}).wheel,[0],1e-9,'dwell before the pin enters');near(K.resolve(m,{crank:180}).wheel,[45],1e-9,'half way through its quarter turn');
  near(K.resolve(m,{crank:200.5}).wheel,[geneva(200.5)],.02,'between table points (1° table)');near(K.resolve(m,{crank:540}).wheel,[135],1e-9,'second turn adds a quarter');near(K.resolve(m,{crank:1020}).wheel,[270],1e-9);
});

test('slides: continuous rigging extends the top stage first (gm0); cascade moves every stage at once',()=>{
  const L=[10,10,10],stages=['s1','s2','s3'],joints=[{id:'travel',type:'prismatic',axis:[0,0,1]},...stages.map((id,i)=>({id,type:'prismatic',parent:i?stages[i-1]:null,axis:[0,0,1],lower:0,upper:L[i]}))];
  const cont=model({joints,couplings:K.rigging('continuous',stages,{lengths:L,from:'travel'})}),stage=(m,T)=>stages.map(id=>K.resolve(m,{travel:T})[id][0]);
  near(stage(cont,5),[0,0,5],1e-12,'the top stage moves first');near(stage(cont,15),[0,5,10],1e-12,'then the one below it');near(stage(cont,30),[10,10,10],1e-12);near(stage(cont,45),[10,10,10],1e-12,'held at full extension');
  near(at(cont,{travel:17},'s3',[0,0,0])[2],17,1e-12,'the top rides the whole travel');
  const casc=model({joints:joints.slice(1),couplings:K.rigging('cascade',stages)});near(at(casc,{s1:4},'s3',[0,0,0])[2],12,1e-12,'cascade: three stages, three times the first');
});

test('transmission: a motor through a 2:1 belt and an 8 mm lead screw; targets and speeds are in the joint’s units',()=>{
  const lead=8/25.4,stages=[{kind:'belt',driver:20,driven:40},{kind:'screw',lead}];
  const m=model({joints:[{id:'nut',type:'prismatic',axis:[0,0,1],lower:0,upper:10}],actuators:[{id:'lift',joint:'nut',kind:'dcmotor',transmission:stages,speed:312*6/(2*360/lead),states:{low:0,high:4}}],sensors:[{id:'enc',kind:'encoder',actuator:'lift',cpr:28}],
    actions:[{name:'Up',steps:[{actuator:'lift',command:{state:'high'}}]}]});
  const a=m.actuators[0];near(a.ratio,2*360/lead,1e-9,'motor degrees per inch');assert.equal(K.actuatorUnit(a,m.joints[0]),'deg','the motor turns; the nut slides');
  near(a.speed,312/60*lead/2,1e-9,'312 rpm through 2:1 onto an 8 mm lead: in/s');
  const d=new K.Driver(m),t=run(d,'Up');near(t,4/a.speed,1.001/240,'4 in at that speed, to the tick');near(d.values().nut,4,1e-9);
  near(d.read('enc'),Math.round(4*a.ratio/360*28),0,'the encoder counts motor turns (28 counts a turn): 4 in is 4·ratio/360 turns');
});

test('DC motor model: spins up as ωf·(1 − e^(−t/τ)), slows under load to ωf·(1 − τL/τs), and stalls past it',()=>{
  // A bare motor: 6000 rpm free (36000 °/s), 0.105 N·m stall, 1e-5 kg·m² on the shaft: τ = J·ωf/τs.
  const free=36000,stall=.105,J=1e-5,tau=J*free*R/stall,make=(motor,extra={})=>model({joints:[{id:'shaft',type:'continuous'}],actuators:[{id:'m',joint:'shaft',kind:'dcmotor',mode:'effort',response:'motor',motor:{free,stall,inertia:J,...motor},...extra}],actions:[{name:'Go',steps:[{actuator:'m',command:{effort:1},seconds:1}]}]});
  const d=new K.Driver(make({}));d.start('Go');const dt=1/240;let t=0,checks=[tau,3*tau,.2];for(const tc of checks){while(t<tc-1e-12){d.tick(Math.min(dt,tc-t),{});t+=Math.min(dt,tc-t);}near(d.axes.get('m').v,free*(1-Math.exp(-t/tau)),1e-6*free,`speed at ${t.toFixed(4)} s`);}
  const loaded=new K.Driver(make({load:.4*stall}));loaded.start('Go');for(let i=0;i<230;i++)loaded.tick(dt,{});near(loaded.axes.get('m').v,free*.6,1e-6*free,'a 40% load costs 40% of the speed');
  const stalled=new K.Driver(make({load:1.2*stall}));stalled.start('Go');for(let i=0;i<120;i++)stalled.tick(dt,{});assert.ok(stalled.axes.get('m').v<0,'a load beyond stall back-drives it');
  // Commanded beside simulated: the state shows what it was told and what it is doing.
  const s=loaded.state().m;assert.deepEqual(s.command,{mode:'effort',value:1});assert.ok(Math.abs(s.v-free*.6)<1);
});

test('motor model on an arm: position control settles without overshoot, a load leaves the steady error a P controller would',()=>{
  // An arm through a 100:1 gearbox: 6000 rpm, 0.105 N·m bare motor. At the joint: 360 °/s free, 10.5 N·m stall.
  const mk=motor=>model({joints:[{id:'arm',type:'revolute',axis:[0,1,0],lower:-10,upper:120}],actuators:[{id:'m',joint:'arm',kind:'dcmotor',transmission:[{kind:'gearbox',ratio:100}],response:'motor',motor:{free:36000,stall:.105,inertia:.05,...motor},states:{down:0,up:90}}],
    actions:[{name:'Up',steps:[{actuator:'m',command:{state:'up'}}]}]});
  const m=mk({}),a=m.actuators[0],d=new K.Driver(m);let top=0,t=0;d.start('Up');while(d.busy('Up')&&t<10){d.tick(1/240,{});t+=1/240;top=Math.max(top,d.values().arm);}
  assert.ok(Math.abs(d.values().arm-90)<.05,`reached (${d.values().arm})`);assert.ok(top<=90.05,`no overshoot (${top})`);
  // At most free speed at the joint, so at least 90/360 s.
  assert.ok(t>=.25,`no faster than the motor allows (${t.toFixed(3)} s)`);near(a.ratio,100,0);
  // With gravity's 3 N·m at the joint and the default p = 1/(ωf·T): u = τL/τs at rest, so the arm stops τL/(τs·p) short.
  const L=3,g=new K.Driver(mk({load:L})),axis=g.axes.get('m'),{p}=axis.motor,stallJ=axis.motor.stall;let tt=0;g.start('Up');while(g.busy('Up')&&tt<20){g.tick(1/240,{});tt+=1/240;}
  assert.ok(tt<20,'the action finishes once the arm has stopped');near(90-g.values().arm,L/(stallJ*p),.02,'steady-state error of proportional control');near(stallJ,.105*100*1,1e-9,'stall torque through the gearbox');
});

test('pneumatic cylinder: only rests at its ends; the timeline agrees with the driver',()=>{
  const m=model({joints:[{id:'rod',type:'prismatic',axis:[1,0,0],lower:0,upper:4}],actuators:[{id:'cyl',joint:'rod',kind:'pneumatic',response:'pneumatic',speed:16}],
    actions:[{name:'Half',steps:[{actuator:'cyl',command:{target:2.2}}]},{name:'Back',steps:[{actuator:'cyl',command:{target:1.9}}]}]});
  const d=new K.Driver(m),t=run(d,'Half');near(d.values().rod,4,1e-9,'past half way: out to its end');near(t,.25,1.001/240);run(d,'Back');near(d.values().rod,0,1e-9,'short of half way: back in');
  const tl=K.timeline(m,m.actions[0]);near([tl.steps[0].to,tl.duration],[4,.25],1e-9,'the timeline sends it to the end too');
});

test('sensors and waits: run a lift up until its top switch closes, then wait on the encoder; times agree with the speed',()=>{
  const m=model({joints:[{id:'lift',type:'prismatic',axis:[0,0,1],lower:0,upper:30}],actuators:[{id:'motor',joint:'lift',kind:'dcmotor',speed:6}],
    sensors:[{id:'top',kind:'limit',joint:'lift',at:18,band:.25},{id:'enc',kind:'encoder',actuator:'motor',cpr:100}],
    actions:[{name:'Home up',steps:[{actuator:'motor',command:{velocity:6}},{wait:{sensor:'top',is:true},timeout:20},{actuator:'motor',command:{velocity:0},after:1,seconds:0},{actuator:'motor',command:{velocity:-6},after:2},{wait:{sensor:'enc',below:1000},after:2},{actuator:'motor',command:{velocity:0},after:4,seconds:0}]}]});
  assert.equal(m.actions[0].steps.length,6,'waits are kept');assert.equal(m.sensors.length,2);
  const tl=K.timeline(m,m.actions[0]);assert.ok(tl.track,'waits are timed by running the driver');
  // The switch closes at 17.75 in (18 − 0.25): 17.75/6 s. The encoder (100 counts an inch) drops below 1000 at 10 in.
  near(tl.steps[1].end,17.75/6,2/240,'switch closed');const down=tl.steps[4];near(down.end-down.start,(17.75-10)/6,3/240,'encoder reached');
  const d=new K.Driver(m),t=run(d,'Home up');near(t,tl.duration,1e-9,'the driver ends when the timeline says');assert.ok(Math.abs(d.values().lift-10)<.1);
  near(K.sampleTimeline(m,tl,1).motor,6,.03,'sampled from the run');
});

test('actions as presets: a pick runs open, lower, close, raise; an action that runs itself ends at once',()=>{
  const m=model({joints:[{id:'arm',name:'Arm',type:'revolute',axis:[0,1,0],lower:0,upper:90,states:{up:0,down:80},speed:160,drive:{signal:'action'}},{id:'claw',name:'Claw',type:'revolute',axis:[1,0,0],lower:0,upper:40,states:{closed:0,open:40},speed:200,drive:{signal:'action'}}],
    actions:[{name:'Open',steps:[{actuator:'claw',command:{state:'open'}}]},{name:'Close',steps:[{actuator:'claw',command:{state:'closed'}}]},
      {name:'Pick',steps:[{action:'Open'},{actuator:'arm',command:{state:'down'}},{action:'Close',after:1,delay:.1},{actuator:'arm',command:{state:'up'},after:2}]},{name:'Loop',steps:[{action:'Loop'}]}]});
  const pick=m.actions.find(a=>a.name==='Pick'),tl=K.timeline(m,pick);
  // Open (0.2 s) and lower (0.5 s) together; close 0.1 s after lowering (0.2 s); raise (0.5 s): 1.3 s.
  near(tl.duration,.5+.1+.2+.5,1e-9,'preset steps add up');assert.ok(tl.steps.some(s=>s.depth===1&&s.actuator==='claw'),'nested steps are listed one deeper');
  near(K.sampleTimeline(m,tl,.7).claw,20,1e-9,'half closed half way through closing (0.6 s to 0.8 s)');
  const d=new K.Driver(m),t=run(d,'Pick');near(t,1.3,1.001/240,'sequential steps hand over without losing ticks');near([d.values().arm,d.values().claw],[0,0],1e-9);
  const l=new K.Driver(m);l.start('Loop');l.tick(.01,{});assert.equal(l.busy('Loop'),false,'no endless recursion');near(K.timeline(m,m.actions.find(a=>a.name==='Loop')).duration,0,0);
});

test('end stops on every joint type: a pin stays in its slot, a universal joint within its angles, an actuator on the slot too',()=>{
  const m=model({joints:[{id:'pin',type:'pinslot',axis:[0,0,1],axis2:[1,0,0],limits:[null,[0,2]]},{id:'u',type:'universal',axis:[0,0,1],axis2:[1,0,0],limits:[[-30,30],[-20,20]]},{id:'cyl',type:'cylindrical',axis:[1,0,0],limits:[null,[0,6]]}],
    actuators:[{id:'slide',joint:'pin',index:1,speed:10}],actions:[{name:'Out',steps:[{actuator:'slide',command:{target:5}}]}]});
  near(K.resolve(m,{pin:[50,5]}).pin,[50,2],1e-12,'held at the end of its slot; the pivot is free');near(K.resolve(m,{u:[45,-45]}).u,[30,-20],1e-12);near(K.resolve(m,{cyl:[720,-1]}).cyl,[720,0],1e-12);
  const d=new K.Driver(m);run(d,'Out');near(d.values().pin,[0,2],1e-9,'the actuator stops at the slot’s end');
  const r=K.reach(m,{joint:'pin',point:[0,0,0],target:[5,0,0],joints:['pin']});near(r.q.pin[1],2,1e-9,'inverse kinematics keeps the stop');
});

test('a geared five-bar: two cranks coupled by gears, the coupler links closed by the loop solver',()=>{
  // Cranks at A (0,0) and E (4,0), length 2, geared 1:−1; links 5 and 5 meet at P. Independent: P is where circles of
  // radius 5 about each crank end meet (the upper one, as built).
  const r=2,l=5,A=[0,0],E=[4,0],th0=90,ends=th=>[[A[0]+r*Math.cos(th*R),A[1]+r*Math.sin(th*R)],[E[0]+r*Math.cos((180-th)*R),E[1]+r*Math.sin((180-th)*R)]];
  const meet=([b,d])=>{const ux=d[0]-b[0],uy=d[1]-b[1],e=Math.hypot(ux,uy),h=Math.sqrt(l*l-e*e/4);return [b[0]+ux/2-h*uy/e,b[1]+uy/2+h*ux/e];};
  const [B0,D0]=ends(th0),P0=meet([B0,D0]);
  const m=model({joints:[{id:'left',type:'continuous',origin:[...A,0],axis:[0,0,1]},{id:'right',type:'continuous',origin:[...E,0],axis:[0,0,1]},
    {id:'linkL',type:'revolute',parent:'left',origin:[...B0,0],axis:[0,0,1]},{id:'linkR',type:'revolute',parent:'right',origin:[...D0,0],axis:[0,0,1]}],
    couplings:[{kind:'gear',from:'left',to:'right',ratio:-1}],loops:[{a:{joint:'linkL',point:[...P0,0]},b:{joint:'linkR',point:[...P0,0]}}]});
  for(const turn of [-30,20,45]){const p=K.pose(m,{left:turn}),P=apply(p.W.get('linkL'),[...P0,0]);assert.ok(p.loopError<1e-5,`closed at ${turn}° (${p.loopError})`);near(p.q.right,[-turn],1e-12,'the gear turns the other crank back');
    near(P.slice(0,2),meet(ends(th0+turn)),1e-4,`coupler point at ${turn}°`);}
});

test('everything new survives saving: sanitize is stable through JSON, and bad parts are dropped',()=>{
  const raw={joints:[{id:'a',type:'continuous'},{id:'b',type:'continuous'},{id:'c',type:'pinslot',axis:[0,0,1],axis2:[1,0,0],limits:[[0,1],[0,2],[9,9]]}],
    actuators:[{id:'m',joint:'a',transmission:[{kind:'gearbox',ratio:20},{kind:'spool',diameter:1.5},{kind:'warp'},{kind:'belt',driver:0,driven:3}],response:'motor',motor:{free:6000,stall:.1,load:.2,p:.01,count:2}},{id:'p',joint:'b',response:'pneumatic'},{id:'z',joint:'b',response:'motor',motor:{free:-1}}],
    couplings:[{kind:'tendon',from:'a',to:'c',ratio:.5,plus:[{from:'b',ratio:.25},{from:'nope',ratio:1},{from:'c',ratio:1}],poly:[0,0,0]},{kind:'cam',from:'a',to:'b',curve:[[0,0],[90,1],[90,5],['x',1],[180,0]],period:180}],
    sensors:[{id:'enc',kind:'encoder',actuator:'m'},{id:'sw',kind:'limit',joint:'c',index:1,at:2},{id:'bad',kind:'radar',joint:'a'},{id:'v',kind:'velocity',joint:'a'},{id:'a',kind:'limit',joint:'a'}],
    actions:[{name:'Go',steps:[{action:'Other'},{wait:{sensor:'sw',is:true},timeout:3},{wait:{sensor:'nope',is:true}},{wait:{},timeout:1},{actuator:'m',command:{target:3}}]}]};
  const s=K.sanitize(raw);assert.deepEqual(K.sanitize(JSON.parse(JSON.stringify(s))),s,'stable through save and load');
  assert.deepEqual(s.actuators[0].transmission.map(x=>x.kind),['gearbox','spool'],'unknown or impossible stages go');near(s.actuators[0].ratio,20*360/(Math.PI*1.5),1e-6,'ratio from the stages');
  assert.equal(s.actuators[0].motor.count,2);assert.equal(s.actuators[1].response,'pneumatic');assert.equal(s.actuators[2].response,undefined,'a motor model without its figures is ideal');
  assert.deepEqual(s.couplings[0].plus,[{from:'b',ratio:.25}],'inputs must exist and not be the driven joint');assert.equal(s.couplings[0].poly,undefined,'zero terms go');
  assert.deepEqual(s.couplings[1].curve,[[0,0],[90,1],[180,0]],'one output per input, in order');
  assert.deepEqual(s.joints[2].limits,[[0,1],[0,2]],'one stop per value');assert.deepEqual(s.sensors.map(x=>x.id),['enc','sw'],'speed sensors need an actuator; ids are unique across joints and actuators');
  assert.deepEqual(s.actions[0].steps.map(x=>Object.keys(x)[0]),['action','wait','wait','actuator'],'a wait on a missing sensor goes');
  const old=K.sanitize({joints:[{id:'a'}]});assert.equal(old.sensors,undefined,'models without sensors keep their shape');
});
