(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckKinematics=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // How a robot's parts move, kept apart from what they are for. Five ideas, each its own list:
  //   geometry    the CAD body's parts (leaves of its assembly tree), named by `parts` refs;
  //   joints      how a link (some parts) moves relative to its parent link: revolute, continuous, prismatic,
  //               cylindrical, screw, universal, ball, planar, floating, pin-slot or fixed (URDF/SDF/MJCF's set);
  //   actuators   what commands a joint: position, velocity, effort or named states, with speed and acceleration;
  //   couplings   motion passed on: a gear, belt, chain, rack, screw, cable or mimic sets one joint from another;
  //   loops       closed chains (four-bars, slider-cranks, parallel arms): a point on one link must stay on a point
  //               of another, and the free joints are solved so it does;
  //   actions     named, timed steps that command actuators (together, in sequence, after a delay).
  // A joint's origin and axes are in the CAD file's own frame at the pose the CAD was exported in (the rest pose),
  // like assembly mates. A link's motion is then W(child) = W(parent) · M(joint, q), every M expressed in that one
  // frame, so nested joints compose without local frames. Angles are degrees; distances are inches.
  // Nothing here knows about intakes or shooters: a game binds a joint to one of its signals with `drive`.
  const finite=Number.isFinite,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),DEG=Math.PI/180;
  const TYPES={
    fixed:{name:'Fixed',dof:[]},
    revolute:{name:'Pivot (limited)',dof:['deg']},
    continuous:{name:'Spin (unlimited)',dof:['deg']},
    prismatic:{name:'Slide',dof:['in']},
    cylindrical:{name:'Turn and slide',dof:['deg','in']},
    screw:{name:'Screw (turning moves it along)',dof:['deg']},
    universal:{name:'Universal (two pivots)',dof:['deg','deg']},
    ball:{name:'Ball (turns any way)',dof:['deg','deg','deg']},
    planar:{name:'Planar (slides on a plane and turns)',dof:['in','in','deg']},
    floating:{name:'Floating (free)',dof:['in','in','in','deg','deg','deg']},
    pinslot:{name:'Pin in a slot',dof:['deg','in']}};
  const ACTUATORS={servo:'Servo (to a position)',crservo:'Continuous servo',dcmotor:'DC motor',bldc:'Brushless motor',stepper:'Stepper',linear:'Linear actuator',pneumatic:'Pneumatic cylinder',hydraulic:'Hydraulic cylinder',spring:'Spring',none:'Nothing (moves with others)'};
  const MODES={position:'Position',velocity:'Speed',effort:'Effort',states:'Named positions'};
  const COUPLINGS={gear:'Gears',belt:'Belt or chain',rack:'Rack and pinion',screw:'Lead screw',cable:'Cable or spool',mimic:'Follows another joint'};
  // What a game can drive a joint with. The simulator's mechanism model gives these each tick.
  const SIGNALS={turret:'Turret angle',hood:'Hood (rest / shooting)',flywheel:'Flywheel speed',roller:'Intake rollers',deploy:'Deploys while intaking',feeder:'Feeder',wheel:'Drive wheel',steer:'Swerve steering',action:'Route actions'};
  // Spinning parts are drawn turning at most this fast (degrees a second) so a 3000 rpm flywheel does not strobe.
  const SHOW_SPIN=540;
  // ---------------------------------------------------------------- vectors and 4×4 matrices (column-major, as three.js)
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=a=>Math.hypot(a[0],a[1],a[2]);
  const unit=a=>{const l=len(a);return l>1e-12?scale(a,1/l):[0,0,1];};
  // A unit vector at right angles to a (the world axis least along it, crossed).
  const perpendicular=a=>{const u=unit(a),w=Math.abs(u[0])<.6?[1,0,0]:Math.abs(u[1])<.6?[0,1,0]:[0,0,1];return unit(cross(u,w));};
  const I4=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
  const apply=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
  const applyDir=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2],m[1]*p[0]+m[5]*p[1]+m[9]*p[2],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]];
  const trans=v=>[1,0,0,0,0,1,0,0,0,0,1,0,v[0],v[1],v[2],1];
  // Rotation by deg about a unit axis through the origin (Rodrigues).
  function rot(axis,deg){const [x,y,z]=unit(axis),a=deg*DEG,c=Math.cos(a),s=Math.sin(a),t=1-c;
    return [t*x*x+c,t*x*y+s*z,t*x*z-s*y,0, t*x*y-s*z,t*y*y+c,t*y*z+s*x,0, t*x*z+s*y,t*y*z-s*x,t*z*z+c,0, 0,0,0,1];}
  const about=(o,axis,deg)=>mul(trans(o),mul(rot(axis,deg),trans(scale(o,-1))));
  // General 4×4 inverse (placements may scale).
  function invert(m){
    const [a00,a01,a02,a03,a10,a11,a12,a13,a20,a21,a22,a23,a30,a31,a32,a33]=m;
    const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
    let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;if(!det)return I4();det=1/det;
    return [(a11*b11-a12*b10+a13*b09)*det,(a02*b10-a01*b11-a03*b09)*det,(a31*b05-a32*b04+a33*b03)*det,(a22*b04-a21*b05-a23*b03)*det,(a12*b08-a10*b11-a13*b07)*det,(a00*b11-a02*b08+a03*b07)*det,(a32*b02-a30*b05-a33*b01)*det,(a20*b05-a22*b02+a23*b01)*det,
      (a10*b10-a11*b08+a13*b06)*det,(a01*b08-a00*b10-a03*b06)*det,(a30*b04-a31*b02+a33*b00)*det,(a21*b02-a20*b04-a23*b00)*det,(a11*b07-a10*b09-a12*b06)*det,(a00*b09-a01*b07+a02*b06)*det,(a31*b01-a30*b03-a32*b00)*det,(a20*b03-a21*b01+a22*b00)*det];}
  // ---------------------------------------------------------------- a joint's own frame and motion
  // Axis a, a second axis b at right angles to it (the slot of a pin-slot, the second pivot of a universal joint, a
  // planar joint's first slide) and c = a × b.
  function frame(j){const a=unit(j.axis||[0,0,1]);let b=j.axis2?sub(j.axis2,scale(a,dot(j.axis2,a))):null;b=b&&len(b)>1e-6?unit(b):perpendicular(a);return {a,b,c:cross(a,b)};}
  const dofOf=j=>(TYPES[j?.type]||TYPES.fixed).dof;
  const valuesOf=(j,q)=>{const n=dofOf(j).length,v=Array.isArray(q)?q:[q];return Array.from({length:n},(_,i)=>finite(v[i])?v[i]:0);};
  // The joint's motion at q, in the rest frame. unit: inches per CAD unit (distances in q are inches).
  function motion(j,q,unitIn=1){
    const v=valuesOf(j,q),o=j.origin||[0,0,0],{a,b,c}=frame(j),d=x=>x/(unitIn||1);
    switch(j.type){
      case 'revolute':case 'continuous':return about(o,a,v[0]);
      case 'prismatic':return trans(scale(a,d(v[0])));
      case 'cylindrical':return mul(trans(scale(a,d(v[1]))),about(o,a,v[0]));
      case 'screw':return mul(trans(scale(a,d((j.lead||0)*v[0]/360))),about(o,a,v[0]));
      case 'universal':return mul(trans(o),mul(rot(a,v[0]),mul(rot(b,v[1]),trans(scale(o,-1)))));
      case 'ball':return mul(trans(o),mul(rot(a,v[0]),mul(rot(b,v[1]),mul(rot(c,v[2]),trans(scale(o,-1))))));
      case 'planar':return mul(trans(add(scale(b,d(v[0])),scale(c,d(v[1])))),about(o,a,v[2]));
      case 'floating':return mul(trans(add(add(scale(a,d(v[0])),scale(b,d(v[1]))),scale(c,d(v[2])))),mul(trans(o),mul(rot(a,v[3]),mul(rot(b,v[4]),mul(rot(c,v[5]),trans(scale(o,-1)))))));
      case 'pinslot':return mul(trans(scale(b,d(v[1]))),about(o,a,v[0]));
      default:return I4();}
  }
  // ---------------------------------------------------------------- the stored model
  const ID=/^[A-Za-z][\w-]{0,31}$/;
  const vec=(v,d)=>Array.isArray(v)&&v.length===3&&v.every(finite)?v.map(x=>+x.toFixed(5)):d;
  const text=(v,n=80)=>typeof v==='string'?v.trim().slice(0,n):'';
  const num=(v,d,a=-1e6,b=1e6)=>finite(v)?clamp(v,a,b):d;
  // Part refs: an assembly node's key (every part under it) or "#n" for one part instance (a leaf).
  const refs=v=>Array.isArray(v)?[...new Set(v.filter(r=>typeof r==='string'&&r&&r.length<=400))].slice(0,4000):[];
  const PROVENANCE={metadata:'From the file',inferred:'Found in your CAD',user:'Set by you',standin:'Stand-in shape'};
  function sanitizeJoint(raw,ids){
    if(!raw||typeof raw!=='object'||!ID.test(raw.id)||ids.has(raw.id))return null;ids.add(raw.id);
    const type=Object.hasOwn(TYPES,raw.type)?raw.type:'revolute',n=TYPES[type].dof.length,axis=unit(vec(raw.axis,[0,0,1]));
    const states={};if(raw.states&&typeof raw.states==='object')for(const [k,v] of Object.entries(raw.states).slice(0,8)){const name=text(k,24);if(name&&finite(v))states[name]=+v.toFixed(4);}
    const drive=raw.drive&&Object.hasOwn(SIGNALS,raw.drive.signal)?{signal:raw.drive.signal,...(typeof raw.drive.of==='string'&&/^(intake|shooter):[0-3]$|^any$/.test(raw.drive.of)?{of:raw.drive.of}:{})}:null;
    return {id:raw.id,name:text(raw.name)||raw.id,type,parent:typeof raw.parent==='string'&&ID.test(raw.parent)?raw.parent:null,parts:refs(raw.parts),
      origin:vec(raw.origin,[0,0,0]),axis:axis.map(x=>+x.toFixed(6)),...(vec(raw.axis2)?{axis2:vec(raw.axis2)}:{}),
      ...(finite(raw.lower)?{lower:raw.lower}:{}),...(finite(raw.upper)?{upper:raw.upper}:{}),
      ...(n&&Array.isArray(raw.home)&&raw.home.some(finite)?{home:valuesOf({type},raw.home)}:{}),
      ...(type==='screw'?{lead:num(raw.lead,.3,-100,100)}:{}),
      ...(Object.keys(states).length?{states}:{}),...(drive?{drive}:{}),
      // How fast it moves to a position (units a second), or how fast it spins at full speed (rpm).
      ...(finite(raw.speed)&&raw.speed>0?{speed:clamp(raw.speed,.01,1e5)}:{}),...(finite(raw.rpm)&&raw.rpm>0?{rpm:clamp(raw.rpm,.1,60000)}:{}),
      // A turret's heading in the CAD (degrees counterclockwise from the robot's front, seen from above).
      ...(finite(raw.zero)?{zero:+(((raw.zero%360)+540)%360-180).toFixed(3)}:{}),
      ...(finite(raw.radius)&&raw.radius>0?{radius:+raw.radius.toFixed(4)}:{}),
      // How a drive wheel rolls: a plain wheel only forward and back; a mecanum wheel's rollers also take sideways motion.
      ...(['mecanum','omni'].includes(raw.roll)?{roll:raw.roll}:{}),
      source:Object.hasOwn(PROVENANCE,raw.source)?raw.source:'user',...(finite(raw.confidence)?{confidence:clamp(+raw.confidence.toFixed(2),0,1)}:{}),...(text(raw.note,300)?{note:text(raw.note,300)}:{}),
      ...(Array.isArray(raw.alternatives)?{alternatives:raw.alternatives.slice(0,3).filter(a=>a&&vec(a.origin)&&vec(a.axis)).map(a=>({origin:vec(a.origin),axis:unit(vec(a.axis)),note:text(a.note,200)}))}:{})};
  }
  function sanitize(raw){
    const r=raw&&typeof raw==='object'?raw:{},ids=new Set();
    const joints=(Array.isArray(r.joints)?r.joints:[]).slice(0,96).map(j=>sanitizeJoint(j,ids)).filter(Boolean);
    // A parent must exist and must not lead back to the joint itself.
    const byId=new Map(joints.map(j=>[j.id,j]));for(const j of joints)if(j.parent&&!byId.has(j.parent))j.parent=null;
    for(const j of joints){const seen=new Set([j.id]);for(let p=j.parent;p;p=byId.get(p)?.parent){if(seen.has(p)){j.parent=null;break;}seen.add(p);}}
    const jointRef=v=>typeof v==='string'&&byId.has(v)?v:null,aid=new Set();
    const actuators=(Array.isArray(r.actuators)?r.actuators:[]).slice(0,96).map(a=>{if(!a||!ID.test(a.id)||aid.has(a.id)||!jointRef(a.joint))return null;aid.add(a.id);const j=byId.get(a.joint),n=Math.max(1,dofOf(j).length);
      const states={};if(a.states&&typeof a.states==='object')for(const [k,v] of Object.entries(a.states).slice(0,8)){const name=text(k,24);if(name&&finite(v))states[name]=v;}
      return {id:a.id,name:text(a.name)||a.id,kind:Object.hasOwn(ACTUATORS,a.kind)?a.kind:'servo',joint:a.joint,index:Math.round(num(a.index,0,0,n-1)),mode:Object.hasOwn(MODES,a.mode)?a.mode:'position',
        speed:num(a.speed,90,.001,1e5),accel:num(a.accel,0,0,1e7),ratio:num(a.ratio,1,-1e4,1e4)||1,...(finite(a.home)?{home:a.home}:{}),...(Object.keys(states).length?{states}:{}),...(finite(a.effort)?{effort:clamp(a.effort,-1,1)}:{})};}).filter(Boolean);
    const couplings=(Array.isArray(r.couplings)?r.couplings:[]).slice(0,96).map(c=>c&&jointRef(c.from)&&jointRef(c.to)&&c.from!==c.to?{kind:Object.hasOwn(COUPLINGS,c.kind)?c.kind:'mimic',from:c.from,to:c.to,ratio:num(c.ratio,1,-1e4,1e4),offset:num(c.offset,0),
      ...(finite(c.fromIndex)?{fromIndex:Math.max(0,Math.round(c.fromIndex))}:{}),...(finite(c.toIndex)?{toIndex:Math.max(0,Math.round(c.toIndex))}:{})}:null).filter(Boolean);
    // One coupling per driven joint (the first wins), so a joint is never set twice.
    const driven=new Set(),kept=[];for(const c of couplings){const key=c.to+':'+(c.toIndex||0);if(driven.has(key))continue;driven.add(key);kept.push(c);}
    const end=e=>e&&vec(e.point)&&(e.joint===null||e.joint===undefined||jointRef(e.joint))?{joint:jointRef(e.joint),point:vec(e.point)}:null;
    const loops=(Array.isArray(r.loops)?r.loops:[]).slice(0,24).map(l=>{const a=end(l?.a),b=end(l?.b);return a&&b&&a.joint!==b.joint?{a,b}:null;}).filter(Boolean);
    const actions=(Array.isArray(r.actions)?r.actions:[]).slice(0,48).map(sanitizeAction(new Set(actuators.map(a=>a.id)))).filter(Boolean);
    const out={version:1,model:typeof r.model==='string'&&/^[0-9a-f]{32}\.glb$|^builtin:[a-z]+$/.test(r.model)?r.model:null,unit:num(r.unit,1,1e-6,1e6),joints,actuators,couplings:kept,loops,actions};
    if(r.discovered===true)out.discovered=true;return out;
  }
  // An action: steps that command actuators. Each step starts `delay` seconds after the step it follows ends (or after
  // the action starts), so steps run together, in sequence or staggered. A position step ends when its actuator gets
  // there; a speed step ends after its `seconds`.
  const sanitizeAction=actuatorIds=>raw=>{
    if(!raw||typeof raw.name!=='string'||!raw.name.trim())return null;const steps=[];
    for(const s of (Array.isArray(raw.steps)?raw.steps:[]).slice(0,48)){if(!s||!actuatorIds.has(s.actuator))continue;const c=s.command||{};
      const command=typeof c.state==='string'?{state:text(c.state,24)}:finite(c.target)?{target:c.target}:finite(c.velocity)?{velocity:c.velocity}:finite(c.effort)?{effort:clamp(c.effort,-1,1)}:null;if(!command)continue;
      steps.push({actuator:s.actuator,command,after:Number.isInteger(s.after)&&s.after>=0&&s.after<steps.length?s.after:null,delay:num(s.delay,0,0,600),...(finite(s.seconds)?{seconds:clamp(s.seconds,0,600)}:{})});}
    return steps.length?{name:text(raw.name,40),steps}:null;};
  const EMPTY=()=>sanitize({});
  // ---------------------------------------------------------------- part refs against the CAD's assembly tree
  // tree: the stored body's parts ({nodes:[{name,parent}], leaf:[node index of each leaf]}).
  function partIndex(tree){
    const nodes=(tree?.nodes||[]).map((n,i)=>({i,name:n.name,parent:n.parent,children:[],leaves:[]}));
    for(const n of nodes)if(n.parent>=0&&nodes[n.parent])nodes[n.parent].children.push(n);
    (tree?.leaf||[]).forEach((at,leaf)=>nodes[at]?.leaves.push(leaf));
    const keyOf=n=>n.key??=(n.parent>=0&&nodes[n.parent]?keyOf(nodes[n.parent])+'/':'')+n.name;for(const n of nodes)keyOf(n);
    const byKey=new Map(nodes.map(n=>[n.key,n])),under=new Map();
    const leavesUnder=n=>{if(under.has(n.i))return under.get(n.i);const out=[...n.leaves];for(const c of n.children)out.push(...leavesUnder(c));under.set(n.i,out);return out;};
    const leafCount=(tree?.leaf||[]).length;
    return {nodes,byKey,leafCount,leavesUnder,
      // The leaves a list of refs names.
      expand(list){const out=new Set();for(const r of list||[]){if(r[0]==='#'){const k=+r.slice(1);if(Number.isInteger(k)&&k>=0&&k<leafCount)out.add(k);}else{const n=byKey.get(r);if(n)for(const k of leavesUnder(n))out.add(k);}}return out;},
      // The fewest refs for a set of leaves: whole assemblies where every leaf under one is in the set.
      compress(set){const out=[],taken=new Set();const visit=n=>{const all=leavesUnder(n);if(!all.length)return;if(all.every(k=>set.has(k))){out.push(n.key);for(const k of all)taken.add(k);return;}for(const c of n.children)visit(c);};
        for(const n of nodes.filter(n=>n.parent<0||!nodes[n.parent]))visit(n);for(const k of set)if(!taken.has(k))out.push('#'+k);return out;},
      name:leaf=>nodes[tree.leaf[leaf]]?.name||'Part '+(leaf+1),key:leaf=>nodes[tree.leaf[leaf]]?.key||''};
  }
  // ---------------------------------------------------------------- forward kinematics
  // Joints ordered parents first.
  function order(model){const byId=new Map(model.joints.map(j=>[j.id,j])),out=[],seen=new Set();const visit=j=>{if(seen.has(j.id))return;seen.add(j.id);if(j.parent&&byId.has(j.parent))visit(byId.get(j.parent));out.push(j);};model.joints.forEach(visit);return out;}
  // Every joint's value: given (actuated, from the engine or a preview), else set by a coupling, else its home. Limits
  // hold a revolute or prismatic joint.
  function resolve(model,given={}){
    const q={},byId=new Map(model.joints.map(j=>[j.id,j]));
    for(const j of model.joints){const g=given[j.id];q[j.id]=valuesOf(j,g!==undefined&&g!==null?g:j.home||0);}
    // Couplings in dependency order (a chain of gears); a loop of couplings stops after one pass round it.
    const pending=[...model.couplings];for(let pass=0;pass<pending.length+1&&pending.length;pass++){
      for(let i=0;i<pending.length;i++){const c=pending[i];if(pending.some(o=>o!==c&&o.to===c.from))continue;
        const from=q[c.from],to=q[c.to];if(from&&to)to[c.toIndex||0]=c.ratio*(from[c.fromIndex||0]??0)+c.offset;pending.splice(i--,1);}}
    for(const j of model.joints){const v=q[j.id];if(!v.length)continue;if(j.type==='revolute'||j.type==='prismatic'){if(finite(j.lower))v[0]=Math.max(j.lower,v[0]);if(finite(j.upper))v[0]=Math.min(j.upper,v[0]);}}
    return q;
  }
  // World motion of each joint's link (rest frame), parents first.
  function worlds(model,q,list=order(model)){const W=new Map(),u=model.unit||1;for(const j of list){const parent=j.parent&&W.get(j.parent)||I4();W.set(j.id,mul(parent,motion(j,q[j.id],u)));}return W;}
  // ---------------------------------------------------------------- closed loops
  // A loop says point A (on joint A's link, or the base) and point B (on joint B's link) are one point. The joints
  // that nothing else sets (no actuator, coupling or given value) along either chain are solved, by damped least
  // squares, so the points meet. From the rest pose (where the CAD has them meeting) the driven joints are moved in
  // steps, so the linkage stays on the branch the CAD was assembled in; the answer depends only on the inputs.
  const chain=(byId,id)=>{const out=[];for(let p=id;p;p=byId.get(p)?.parent)out.push(p);return out;};
  function solveLoops(model,q,{given={},fixed=new Set()}={}){
    if(!model.loops.length)return {q,error:0,solved:[]};
    const byId=new Map(model.joints.map(j=>[j.id,j])),coupled=new Set(model.couplings.map(c=>c.to));
    const free=[];for(const l of model.loops)for(const id of [...chain(byId,l.a.joint),...chain(byId,l.b.joint)]){const j=byId.get(id);
      if(!j||given[id]!==undefined||coupled.has(id)||fixed.has(id)||j.drive||free.includes(id)||!dofOf(j).length)continue;free.push(id);}
    if(!free.length)return {q,error:residualNorm(model,q),solved:[]};
    const list=order(model),slots=free.flatMap(id=>dofOf(byId.get(id)).map((u,i)=>({id,i,unit:u})));
    const read=()=>slots.map(s=>q[s.id][s.i]),write=x=>{slots.forEach((s,k)=>{q[s.id][s.i]=x[k];});};
    const residual=()=>{const W=worlds(model,q,list),r=[];for(const l of model.loops){const pa=apply(l.a.joint?W.get(l.a.joint):I4(),l.a.point),pb=apply(l.b.joint?W.get(l.b.joint):I4(),l.b.point);r.push(...sub(pa,pb));}return r;};
    // Homotopy: the given joints move from home to their values in steps of at most 10° (or 0.5 in).
    const target=Object.fromEntries(Object.keys(given).map(id=>[id,q[id].slice()])),home=Object.fromEntries(Object.keys(given).map(id=>[id,valuesOf(byId.get(id),byId.get(id).home||0)]));
    let span=0;for(const id of Object.keys(target))target[id].forEach((v,i)=>{span=Math.max(span,Math.abs(v-home[id][i])/(dofOf(byId.get(id))[i]==='in'?.5:10));});
    const steps=Math.max(1,Math.min(72,Math.ceil(span)));for(const id of free)q[id]=valuesOf(byId.get(id),byId.get(id).home||0);
    let x=read(),err=Infinity;
    for(let s=1;s<=steps;s++){
      for(const id of Object.keys(target))q[id]=target[id].map((v,i)=>home[id][i]+(v-home[id][i])*s/steps);
      let lambda=1e-3;
      for(let it=0;it<40;it++){
        write(x);const r=residual();err=Math.sqrt(r.reduce((a,v)=>a+v*v,0));if(err<1e-7)break;
        // Numerical Jacobian, columns per free value.
        const J=slots.map((sl,k)=>{const h=sl.unit==='in'?1e-4:1e-3,xs=x.slice();xs[k]+=h;write(xs);const rp=residual();write(x);return rp.map((v,m)=>(v-r[m])/h);});
        const n=slots.length,A=Array.from({length:n},(_,a)=>Array.from({length:n},(_,b)=>J[a].reduce((t,v,m)=>t+v*J[b][m],0))),g=Array.from({length:n},(_,a)=>J[a].reduce((t,v,m)=>t+v*r[m],0));
        let improved=false;
        for(let tries=0;tries<8&&!improved;tries++){
          const M=A.map((row,a)=>row.map((v,b)=>v+(a===b?lambda*(1+row[a]):0))),dx=solve(M,g.map(v=>-v));if(!dx)break;
          const xn=x.map((v,k)=>v+dx[k]);write(xn);const rn=residual(),en=Math.sqrt(rn.reduce((a,v)=>a+v*v,0));
          if(en<err){x=xn;err=en;lambda=Math.max(1e-9,lambda/3);improved=true;}else lambda*=4;}
        write(x);if(!improved)break;}
    }
    return {q,error:err,solved:free};
  }
  function residualNorm(model,q){const W=worlds(model,q);let s=0;for(const l of model.loops){const d=sub(apply(l.a.joint?W.get(l.a.joint):I4(),l.a.point),apply(l.b.joint?W.get(l.b.joint):I4(),l.b.point));s+=dot(d,d);}return Math.sqrt(s);}
  // Gaussian elimination with partial pivoting (small systems).
  function solve(A,b){const n=b.length,M=A.map((r,i)=>[...r,b[i]]);for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;if(Math.abs(M[p][c])<1e-14)return null;[M[c],M[p]]=[M[p],M[c]];
    for(let r=0;r<n;r++){if(r===c)continue;const f=M[r][c]/M[c][c];if(f)for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k];}}return M.map((r,i)=>r[n]/r[i]);}
  // The whole pose: values, solved loops, and each link's motion. given: {jointId: q} for the joints commanded.
  function pose(model,given={}){const q=resolve(model,given),loop=solveLoops(model,q,{given});return {q,W:worlds(model,q),loopError:loop.error,solved:loop.solved};}
  // ---------------------------------------------------------------- actuators
  // An actuator moves its joint toward a target at up to `speed` units a second, speeding up and slowing down at
  // `accel` (none: at full speed at once): a trapezoid. Deterministic: the same steps give the same motion.
  class Axis{
    constructor(q=0,{speed=90,accel=0,lower=-Infinity,upper=Infinity,wrap=false}={}){Object.assign(this,{q,v:0,target:q,velocity:null,speed,accel,lower,upper,wrap});}
    to(target){this.target=target;this.velocity=null;}
    spin(velocity){this.velocity=velocity;}
    get done(){return this.velocity===null?Math.abs(this.target-this.q)<1e-6&&Math.abs(this.v)<1e-6:false;}
    step(dt){
      if(this.velocity!==null){const want=clamp(this.velocity,-this.speed,this.speed),dv=this.accel>0?clamp(want-this.v,-this.accel*dt,this.accel*dt):want-this.v;this.v+=dv;this.q+=this.v*dt;}
      else{const d=this.target-this.q;if(Math.abs(d)<1e-9&&Math.abs(this.v)<1e-9){this.q=this.target;this.v=0;}
        else if(!(this.accel>0)){const move=Math.sign(d)*Math.min(Math.abs(d),this.speed*dt);this.q+=move;this.v=dt>0?move/dt:0;}
        else{const dir=Math.sign(d),a=this.accel;
          if(this.v*dir<0)this.v-=Math.sign(this.v)*Math.min(Math.abs(this.v),a*dt);
          else if(this.v*this.v/(2*a)>=Math.abs(d)-1e-12)this.v-=dir*Math.min(Math.abs(this.v),a*dt);
          else this.v=dir*Math.min(Math.abs(this.v)+a*dt,this.speed);
          this.q+=this.v*dt;if(Math.sign(this.target-this.q)!==dir||Math.abs(this.target-this.q)<1e-9){this.q=this.target;this.v=0;}}}
      if(this.q<this.lower){this.q=this.lower;this.v=0;}if(this.q>this.upper){this.q=this.upper;this.v=0;}
      if(this.wrap)this.q=((this.q%360)+360)%360;
    }
  }
  // Seconds a trapezoid takes to move d from rest to rest.
  function moveSeconds(d,speed,accel=0){d=Math.abs(d);if(!d)return 0;if(!(speed>0))return Infinity;if(!(accel>0))return d/speed;return d>=speed*speed/accel?d/speed+speed/accel:2*Math.sqrt(d/accel);}
  // ---------------------------------------------------------------- driving joints from a game and from actions
  // The engine runs one Driver per simulation. Each tick it reads the game's signals and steps the actuators, and
  // values() gives every driven joint's value (what the 3D view draws and recordings keep).
  //   signals: {turrets:[deg], flywheel:0..1, kick:[0..1|null per intake], intake, spin, aim, feed, rpm}
  class Driver{
    constructor(model){
      this.model=model;this.q={};this.axes=new Map();this.time=0;this.running=[];
      for(const j of model.joints){const v=valuesOf(j,j.home||0);this.q[j.id]=v.length===1?v[0]:v;}
      for(const a of model.actuators){const j=model.joints.find(x=>x.id===a.joint),home=valuesOf(j,j.home||0)[a.index]??0,lim=j.type==='revolute'||j.type==='prismatic';
        this.axes.set(a.id,new Axis(finite(a.home)?a.home:home,{speed:a.speed,accel:a.accel,lower:lim&&finite(j.lower)?j.lower:-Infinity,upper:lim&&finite(j.upper)?j.upper:Infinity}));}
      // Hoods move between their positions at their speed; a joint run by route actions moves to its named positions.
      for(const j of model.joints){const lim=j.type==='revolute'||j.type==='prismatic';
        if(j.drive?.signal==='hood')this.axes.set('hood:'+j.id,new Axis(j.states?.rest??0,{speed:j.speed||180}));
        if(j.drive?.signal==='action'&&dofOf(j).length===1&&!model.actuators.some(a=>a.joint===j.id))this.axes.set('joint:'+j.id,new Axis(valuesOf(j,j.home||0)[0],{speed:j.speed||90,lower:lim&&finite(j.lower)?j.lower:-Infinity,upper:lim&&finite(j.upper)?j.upper:Infinity}));}
      this.moves=[];
    }
    // Starts an action by name; its steps run as the ticks go by. A name that is a joint's name and one of its named
    // positions ("Lift up") moves that joint there. Returns false when the name means neither.
    start(name){const key=String(name).trim().toLowerCase(),action=this.model.actions.find(a=>a.name.toLowerCase()===key);
      if(action){this.running.push({action,t0:this.time,steps:action.steps.map(()=>({start:null,end:null}))});return true;}
      for(const j of this.model.joints){const axis=this.axes.get('joint:'+j.id),own=j.name.toLowerCase();if(!axis||!key.startsWith(own+' '))continue;
        const state=Object.keys(j.states||{}).find(k=>k.toLowerCase()===key.slice(own.length+1).trim());if(state===undefined)continue;axis.to(j.states[state]);this.moves.push({key,axis});return true;}
      return false;}
    busy(name){const key=String(name).trim().toLowerCase();return this.running.some(r=>r.action.name.toLowerCase()===key)||this.moves.some(m=>m.key===key&&!m.axis.done);}
    tick(dt,s={}){
      this.time+=dt;const m=this.model;
      for(const r of this.running)this.stepAction(r);this.running=this.running.filter(r=>r.steps.some(x=>x.end===null));
      // Hoods head for their shooting position while the shooter spins up, aims or feeds, and back to rest after.
      for(const j of m.joints)if(j.drive?.signal==='hood')this.axes.get('hood:'+j.id).to((s.spin||s.aim||s.feed)?j.states?.shoot??0:j.states?.rest??0);
      for(const [,axis] of this.axes)axis.step(dt);this.moves=this.moves.filter(m=>!m.axis.done);
      for(const j of m.joints){const axis=this.axes.get('joint:'+j.id);if(axis)this.q[j.id]=axis.q;}
      for(const a of m.actuators){const axis=this.axes.get(a.id),j=m.joints.find(x=>x.id===a.joint),v=valuesOf(j,this.q[j.id]);v[a.index]=axis.q/a.ratio;this.q[j.id]=v.length===1?v[0]:v;}
      for(const j of m.joints){const d=j.drive;if(!d)continue;const n=+String(d.of||'').split(':')[1]||0,rate=rpm=>Math.min(SHOW_SPIN,Math.abs(rpm)*6)*Math.sign(rpm);
        if(d.signal==='turret')this.q[j.id]=(s.turrets?.[n]??0)-(j.zero||0);
        else if(d.signal==='deploy'){const f=clamp(s.kick?.[n]??0,0,1),up=j.states?.raised??0,down=j.states?.lowered??0;this.q[j.id]=up+(down-up)*f;}
        else if(d.signal==='hood')this.q[j.id]=this.axes.get('hood:'+j.id).q;
        else if(d.signal==='flywheel')this.q[j.id]=wrap360(this.q[j.id]+rate((s.flywheel||0)*(j.rpm||s.rpm||3000))*dt);
        else if(d.signal==='roller')this.q[j.id]=wrap360(this.q[j.id]+rate(s.intake?(j.rpm||300):0)*dt);
        else if(d.signal==='feeder')this.q[j.id]=wrap360(this.q[j.id]+rate(s.feed?(j.rpm||200):0)*dt);}
    }
    stepAction(r){
      const steps=r.action.steps;
      steps.forEach((s,i)=>{const st=r.steps[i];
        if(st.start===null){const ready=s.after===null?r.t0:r.steps[s.after].end;if(ready!==null&&this.time>=ready+s.delay-1e-9){st.start=this.time;this.command(s.actuator,s.command);}}
        if(st.start!==null&&st.end===null){const axis=this.axes.get(s.actuator);if(!axis){st.end=this.time;return;}
          const timed=finite(s.seconds)||axis.velocity!==null;if(timed?this.time-st.start>=(s.seconds??0)-1e-9:axis.done){st.end=this.time;if(axis.velocity!==null&&finite(s.seconds))axis.spin(0);}}});
    }
    command(id,c){const a=this.model.actuators.find(x=>x.id===id),axis=this.axes.get(id);if(!a||!axis)return;
      if(c.state!==undefined){const v=a.states?.[c.state];if(finite(v))axis.to(v);}else if(finite(c.target))axis.to(c.target);else if(finite(c.velocity))axis.spin(c.velocity);else if(finite(c.effort))axis.spin(c.effort*a.speed);}
    values(){const out={};for(const [k,v] of Object.entries(this.q))out[k]=Array.isArray(v)?v.map(x=>+x.toFixed(4)):+v.toFixed(4);return out;}
  }
  const wrap360=v=>((v%360)+360)%360;
  // ---------------------------------------------------------------- action timeline
  // When each step of an action starts and ends, worked out ahead from the actuators' speeds (no ticking), so the
  // Setup preview can scrub it and a route knows how long it takes. from: {actuatorId: value} where they start.
  function timeline(model,action,from={}){
    const at={...from},out=[];
    for(const a of model.actuators)if(at[a.id]===undefined){const j=model.joints.find(x=>x.id===a.joint);at[a.id]=finite(a.home)?a.home:valuesOf(j,j.home||0)[a.index]??0;}
    action.steps.forEach((s,i)=>{const a=model.actuators.find(x=>x.id===s.actuator),begin=(s.after===null?0:out[s.after].end)+s.delay,c=s.command;
      let target=at[a.id],seconds=0;
      if(c.state!==undefined&&finite(a.states?.[c.state]))target=a.states[c.state];else if(finite(c.target))target=c.target;
      if(finite(c.velocity)||finite(c.effort))seconds=s.seconds??0;else seconds=Math.max(s.seconds??0,moveSeconds(target-at[a.id],a.speed,a.accel));
      out.push({actuator:a.id,start:begin,end:begin+seconds,from:at[a.id],to:target,velocity:finite(c.velocity)?c.velocity:finite(c.effort)?c.effort*a.speed:null});if(out[i].velocity===null)at[a.id]=target;});
    return {steps:out,duration:Math.max(0,...out.map(s=>s.end))};
  }
  // Actuator values at time t of a timeline (positions eased along each step's trapezoid; speeds integrated).
  function sampleTimeline(model,tl,t){const v={};for(const s of tl.steps){const a=model.actuators.find(x=>x.id===s.actuator);if(t<s.start)continue;
    if(s.velocity!==null){v[a.id]=(v[a.id]??s.from)+s.velocity*(Math.min(t,s.end)-s.start);continue;}
    const total=s.end-s.start,u=total>0?clamp((t-s.start)/total,0,1):1;v[a.id]=s.from+(s.to-s.from)*profile(u,a,Math.abs(s.to-s.from));}
    return v;}
  // Fraction of the distance covered at fraction u of a trapezoid's time.
  function profile(u,a,d){if(!(a.accel>0)||!d)return u;const T=moveSeconds(d,a.speed,a.accel),ta=Math.min(a.speed/a.accel,T/2),vmax=a.accel*ta,t=u*T;
    if(t<ta)return .5*a.accel*t*t/d;if(t>T-ta){const r=T-t;return 1-.5*a.accel*r*r/d;}return (.5*a.accel*ta*ta+vmax*(t-ta))/d;}
  // ---------------------------------------------------------------- inverse kinematics
  // Moves the free joints of a chain so a point on its last link reaches a target (damped least squares on the
  // same forward kinematics). Returns the values and how far off it ended. Limits are kept.
  function reach(model,{joint,point,target,given={},joints:chainIds}={}){
    const byId=new Map(model.joints.map(j=>[j.id,j])),ids=(chainIds||chain(byId,joint)).filter(id=>byId.has(id)&&dofOf(byId.get(id)).length);
    const q=resolve(model,given),slots=ids.flatMap(id=>dofOf(byId.get(id)).map((u,i)=>({id,i,unit:u}))),list=order(model);
    const end=()=>apply(worlds(model,q,list).get(joint)||I4(),point),err=()=>len(sub(end(),target));
    const limit=sl=>{const j=byId.get(sl.id);if(j.type==='revolute'||j.type==='prismatic'){if(finite(j.lower))q[sl.id][0]=Math.max(j.lower,q[sl.id][0]);if(finite(j.upper))q[sl.id][0]=Math.min(j.upper,q[sl.id][0]);}};
    let e=err(),lambda=.05;
    for(let it=0;it<200&&e>1e-5;it++){const p=end(),r=sub(target,p);
      const J=slots.map(sl=>{const h=sl.unit==='in'?1e-4:1e-3,old=q[sl.id][sl.i];q[sl.id][sl.i]=old+h;const d=sub(end(),p);q[sl.id][sl.i]=old;return scale(d,1/h);});
      const n=slots.length,A=Array.from({length:n},(_,a)=>Array.from({length:n},(_,b)=>dot(J[a],J[b])+(a===b?lambda:0))),g=J.map(c=>dot(c,r)),dx=solve(A,g);if(!dx)break;
      const before=slots.map(sl=>q[sl.id][sl.i]);slots.forEach((sl,k)=>{q[sl.id][sl.i]+=dx[k];limit(sl);});const en=err();
      if(en<e){e=en;lambda=Math.max(1e-6,lambda*.5);}else{slots.forEach((sl,k)=>{q[sl.id][sl.i]=before[k];});lambda*=3;if(lambda>1e6)break;}}
    return {q,error:e};
  }
  // ---------------------------------------------------------------- when the mechanism list changes
  // A game part was removed: joints driven by it lose that drive, and those of later parts move down one.
  function reindex(model,kind,removed){const out=structuredClone(model);for(const j of out.joints){const d=j.drive;if(!d?.of?.startsWith(kind+':'))continue;const n=+d.of.split(':')[1];
    if(n===removed){delete j.drive;j.note=(j.note?j.note+' ':'')+'Its mechanism was removed.';}else if(n>removed)d.of=kind+':'+(n-1);}return sanitize(out);}
  // What the engine needs: the joints with a drive, actuators and actions, without part lists.
  function forEngine(model){const m=sanitize(model);return {...m,joints:m.joints.map(({parts,alternatives,note,...j})=>j)};}
  return {TYPES,ACTUATORS,MODES,COUPLINGS,SIGNALS,PROVENANCE,SHOW_SPIN,sanitize,EMPTY,partIndex,order,resolve,worlds,motion,frame,dofOf,valuesOf,solveLoops,pose,reach,Axis,moveSeconds,Driver,timeline,sampleTimeline,reindex,forEngine,
    math:{sub,add,scale,dot,cross,len,unit,perpendicular,I4,mul,apply,applyDir,trans,rot,about,invert}};
});
