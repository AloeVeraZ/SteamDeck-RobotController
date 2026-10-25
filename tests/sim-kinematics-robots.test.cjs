'use strict';
// Robots well beyond FTC, each modelled with the same joints, couplings and loops and checked against an independent
// answer (closed-form kinematics or geometry), so the engine's claims rest on more than one robot.
const {test}=require('node:test'),assert=require('node:assert/strict'),K=require('../ui/sim-kinematics.js');
const {apply,len,sub,dot,unit,cross,applyDir}=K.math,R=Math.PI/180;
const near=(a,b,tol,msg)=>{const x=[].concat(a),y=[].concat(b);x.forEach((v,i)=>assert.ok(Math.abs(v-y[i])<=tol,`${msg||''} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`));};
const model=raw=>K.sanitize(raw),at=(m,q,id,p)=>apply(K.pose(m,q).W.get(id),p);
// Standard Denavit–Hartenberg transform, for checking a serial arm independently of the engine.
function dh(theta,d,a,alpha){const ct=Math.cos(theta),st=Math.sin(theta),ca=Math.cos(alpha),sa=Math.sin(alpha);return [ct,st,0,0,-st*ca,ct*ca,sa,0,st*sa,-ct*sa,ca,0,a*ct,a*st,d,1];}
test('six-axis industrial arm (UR5 geometry): the tool point matches Denavit–Hartenberg forward kinematics',()=>{
  // UR5 DH (inches): d1 3.5, a2 -16.7, a3 -15.4, d4 4.3, d5 3.7, d6 3.2; alpha 90,0,0,90,-90,0.
  const d=[3.5,0,0,4.3,3.7,3.2],a=[0,-16.7,-15.4,0,0,0],al=[90,0,0,90,-90,0].map(x=>x*R);
  // Joint frames at the zero pose, from the same DH chain: joint i turns about z of frame i-1.
  let T=K.math.I4();const frames=[];for(let i=0;i<6;i++){frames.push(T);T=K.math.mul(T,dh(0,d[i],a[i],al[i]));}
  const tool0=apply(T,[0,0,0]);
  const joints=frames.map((F,i)=>({id:'j'+(i+1),type:'revolute',parent:i?'j'+i:null,origin:apply(F,[0,0,0]),axis:applyDir(F,[0,0,1]),lower:-360,upper:360}));
  const m=model({joints});
  for(const q of [[0,0,0,0,0,0],[30,-45,60,-20,90,15],[-120,-80,-40,110,-60,200]]){
    let Tq=K.math.I4();for(let i=0;i<6;i++)Tq=K.math.mul(Tq,dh(q[i]*R,d[i],a[i],al[i]));
    near(at(m,Object.fromEntries(q.map((v,i)=>['j'+(i+1),v])),'j6',tool0),apply(Tq,[0,0,0]),1e-9,`tool at ${q}`);}
  // Inverse kinematics reaches a point in the workspace.
  const target=[10,-8,12],{error}=K.reach(m,{joint:'j6',point:tool0,target});assert.ok(error<1e-3,`IK error ${error}`);
});
test('SCARA: two vertical pivots, a vertical slide and a wrist: x = a1 cos θ1 + a2 cos(θ1+θ2)',()=>{
  const a1=10,a2=8,m=model({joints:[{id:'shoulder',type:'revolute',axis:[0,0,1]},{id:'elbow',type:'revolute',parent:'shoulder',origin:[a1,0,0],axis:[0,0,1]},
    {id:'quill',type:'prismatic',parent:'elbow',origin:[a1+a2,0,0],axis:[0,0,-1],lower:0,upper:6},{id:'wrist',type:'continuous',parent:'quill',origin:[a1+a2,0,0],axis:[0,0,1]}]});
  for(const [t1,t2,dz] of [[20,30,1],[-60,100,4],[135,-45,6]]){const p=at(m,{shoulder:t1,elbow:t2,quill:dz,wrist:77},'wrist',[a1+a2,0,0]);
    near(p,[a1*Math.cos(t1*R)+a2*Math.cos((t1+t2)*R),a1*Math.sin(t1*R)+a2*Math.sin((t1+t2)*R),-dz],1e-9);}
});
test('Cartesian gantry: three slides add',()=>{
  const m=model({joints:[{id:'x',type:'prismatic',axis:[1,0,0],lower:0,upper:40},{id:'y',type:'prismatic',parent:'x',axis:[0,1,0],lower:0,upper:30},{id:'z',type:'prismatic',parent:'y',axis:[0,0,-1],lower:0,upper:10}]});
  near(at(m,{x:12,y:7,z:3},'z',[1,2,20]),[13,9,17],1e-12);near(at(m,{x:99},'z',[0,0,0]),[40,0,0],1e-12,'end stops hold');
});
test('telescoping lift: a cascade (each stage rides the last by the same amount) extends three times the first stage',()=>{
  const m=model({joints:[{id:'s1',type:'prismatic',axis:[0,0,1]},{id:'s2',type:'prismatic',parent:'s1',axis:[0,0,1]},{id:'s3',type:'prismatic',parent:'s2',axis:[0,0,1]}],
    couplings:[{kind:'cable',from:'s1',to:'s2',ratio:1},{kind:'cable',from:'s1',to:'s3',ratio:1}]});
  near(at(m,{s1:4},'s3',[0,0,0]),[0,0,12],1e-12);
});
test('gripper: the second finger mirrors the first (mimic, ratio −1), so the jaws close symmetrically',()=>{
  const m=model({joints:[{id:'left',type:'prismatic',origin:[0,1,0],axis:[0,-1,0],lower:0,upper:1},{id:'right',type:'prismatic',origin:[0,-1,0],axis:[0,-1,0]}],couplings:[{kind:'mimic',from:'left',to:'right',ratio:-1}]});
  const l=at(m,{left:.6},'left',[0,1,0]),r=at(m,{left:.6},'right',[0,-1,0]);near([l[1],r[1]],[.4,-.4],1e-12);
});
test('lead screw and cable spool: a motor turning drives a slide through its conversion ratio',()=>{
  // 8 mm lead screw (0.315 in/turn): 10 turns move the nut 3.15 in. A 1 in spool: one turn winds π in of cable.
  const m=model({joints:[{id:'nut',type:'screw',axis:[0,0,1],lead:.315},{id:'motor',type:'continuous'},{id:'lift',type:'prismatic',axis:[0,0,1]}],couplings:[{kind:'cable',from:'motor',to:'lift',ratio:Math.PI/360}]});
  near(at(m,{nut:3600},'nut',[0,0,0])[2],3.15,1e-9);near(at(m,{motor:720},'lift',[0,0,0])[2],2*Math.PI,1e-9);
});
test('swerve module: steering turns the wheel’s rolling direction; the wheel spins on the steered axle',()=>{
  const m=model({joints:[{id:'steer',type:'continuous',origin:[6,6,2],axis:[0,0,1]},{id:'wheel',type:'continuous',parent:'steer',origin:[6,6,2],axis:[0,1,0]}]});
  const W=K.pose(m,{steer:90,wheel:0}).W.get('wheel'),axle=unit(applyDir(W,[0,1,0])),roll=cross(axle,[0,0,1]);near(axle,[-1,0,0],1e-12,'axle turned');near(roll,[0,1,0],1e-12,'now it rolls left');
  near(at(m,{steer:90,wheel:90},'wheel',[6,6,4]),[6+2*Math.sin(90*R)*0,6+2,2+0],1e-9,'the top of the wheel rolls toward +y');
});
test('humanoid arm: ball shoulder, elbow, universal wrist; inverse kinematics puts the hand on a target',()=>{
  const m=model({joints:[{id:'shoulder',type:'ball',origin:[0,0,0],axis:[0,0,1],axis2:[1,0,0]},{id:'elbow',type:'revolute',parent:'shoulder',origin:[0,0,-11],axis:[0,1,0],lower:0,upper:150},{id:'wrist',type:'universal',parent:'elbow',origin:[0,0,-21],axis:[0,1,0],axis2:[1,0,0]}]});
  const hand=[0,0,-24],target=[8,6,-14],{q,error}=K.reach(m,{joint:'wrist',point:hand,target,joints:['shoulder','elbow']});assert.ok(error<1e-3,`hand at the target (${error})`);
  const e=q.elbow[0];assert.ok(e>=0&&e<=150,'the elbow stays within its limits');
  // Upper arm 11 in, forearm to hand 13 in: the elbow angle follows from the distance (law of cosines).
  const dist=len(target),want=180-Math.acos((11*11+13*13-dist*dist)/(2*11*13))/R;near(e,want,.05,'elbow bend');
});
test('quadruped leg: hip abduction, hip and knee put the foot where planar two-link geometry says',()=>{
  const thigh=8,shin=8,m=model({joints:[{id:'abd',type:'revolute',axis:[1,0,0]},{id:'hip',type:'revolute',parent:'abd',axis:[0,1,0]},{id:'knee',type:'revolute',parent:'hip',origin:[0,0,-thigh],axis:[0,1,0]}]});
  for(const [h,k] of [[30,-60],[-20,45]]){const p=at(m,{abd:0,hip:h,knee:k},'knee',[0,0,-thigh-shin]);
    // About +y, +θ swings -z toward -x: foot x = -(l1 sin h + l2 sin(h+k)).
    near([p[0],p[2]],[-(thigh*Math.sin(h*R)+shin*Math.sin((h+k)*R)),-(thigh*Math.cos(h*R)+shin*Math.cos((h+k)*R))],1e-9);}
  const foot=at(m,{abd:20,hip:0,knee:0},'knee',[0,0,-16]);near([foot[1],foot[2]],[16*Math.sin(20*R),-16*Math.cos(20*R)],1e-9,'abduction swings the leg sideways');
});
test('delta robot: three driven arms and ball-jointed forearms meeting at the platform (three-sphere intersection)',()=>{
  // Base arm pivots at radius rb (already less the platform's radius), arms of length la, forearms lf, 120° apart.
  const rb=6,la=5,lf=12,angles=[0,120,240].map(a=>a*R),joints=[],loops=[];
  angles.forEach((t,i)=>{const c=Math.cos(t),s=Math.sin(t),pivot=[rb*c,rb*s,0],elbow=[(rb+la)*c,(rb+la)*s,0],end=[(rb+la)*c,(rb+la)*s,-lf];
    joints.push({id:'arm'+i,type:'revolute',origin:pivot,axis:[-s,c,0],drive:{signal:'action'}},{id:'fore'+i,type:'ball',parent:'arm'+i,origin:elbow,axis:[0,0,1],axis2:[c,s,0]});
    if(i)loops.push({a:{joint:'fore0',point:[(rb+la),0,-lf]},b:{joint:'fore'+i,point:end}});});
  const m=model({joints,loops});
  // All three ends start apart at rest (each straight down from its own elbow): pull them together by solving.
  for(const q of [[20,20,20],[10,30,25]]){
    const p=K.pose(m,{arm0:q[0],arm1:q[1],arm2:q[2]});assert.ok(p.loopError<1e-4,`closed (${p.loopError})`);
    const end=apply(p.W.get('fore0'),[(rb+la),0,-lf]);
    // Independent answer: each elbow after its arm turns; the end is lf from all three (sphere intersection).
    angles.forEach((t,i)=>{const c=Math.cos(t),s=Math.sin(t),qq=q[i]*R,el=[(rb+la*Math.cos(qq))*c,(rb+la*Math.cos(qq))*s,-la*Math.sin(qq)];near(len(sub(end,el)),lf,1e-3,`forearm ${i} keeps its length`);});
  }
});
