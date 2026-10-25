(function(root,factory){const value=factory(root);if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckRobotFormats=value;})(typeof globalThis==='object'?globalThis:this,root=>{
  'use strict';
  // Robot formats that carry joints as data, besides URDF (sim-urdf.js): SDFormat (Gazebo) and MJCF (MuJoCo). Each is
  // read into one description: links (shapes, and each link's frame at the pose the file is written in), joints (type,
  // origin and axes in that same frame, limits), and what ties joints together (couplings, closed loops) or drives them
  // (actuators). From it come the body (links nested as the joints nest them, so it splits along the joints) and
  // DeckKinematics joints "From the file". Lengths stay metres in the body (the CAD unit); joint values are inches and
  // degrees, like every other joint.
  //   SDFormat  poses through the frame graph (relative_to, //frame, nested models; the 1.4–1.6 rules for older files),
  //             axes through expressed_in; revolute, continuous, prismatic, fixed, ball, universal, revolute2 and screw
  //             joints; gearbox joints become couplings; a joint that closes a loop becomes a loop constraint.
  //   MJCF      default classes and childclass, compiler angle units and eulerseq, every orientation form, several
  //             joints in one body (applied in order), geoms (fromto too) and meshes (meshdir, scale, refpos/refquat),
  //             equality connect and weld (loops), joint equality with polycoef and fixed-tendon equality (couplings),
  //             actuators with their gear.
  //   USD       text USD (.usda): UsdPhysics revolute, prismatic, spherical and fixed joints between rigid bodies,
  //             transform ops, metersPerUnit and upAxis, Cube/Sphere/Cylinder/Capsule/Cone/Mesh shapes, drives
  //             (actuators) and PhysX mimic joints (couplings). Binary USD and composition (references) are not read.
  // What cannot be read is said in `notes`, never guessed.
  const K=()=>root.DeckKinematics||(typeof require==='function'?require('./sim-kinematics.js'):null);
  const IN_PER_M=39.3700787,DEG=180/Math.PI,finite=Number.isFinite;
  // ---------------------------------------------------------------- XML with text (SDFormat keeps values in elements)
  const decode=t=>t.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  function parseXml(text){
    const rootNode={name:'#root',attrs:{},children:[],text:''},stack=[rootNode];let i=0;const s=String(text);
    while(i<s.length){
      const lt=s.indexOf('<',i);if(lt<0)break;if(lt>i)stack.at(-1).text+=decode(s.slice(i,lt));
      if(s.startsWith('<!--',lt)){const end=s.indexOf('-->',lt+4);i=end<0?s.length:end+3;continue;}
      if(s.startsWith('<![CDATA[',lt)){const end=s.indexOf(']]>',lt);stack.at(-1).text+=s.slice(lt+9,end<0?s.length:end);i=end<0?s.length:end+3;continue;}
      if(s.startsWith('<?',lt)||s.startsWith('<!',lt)){const end=s.indexOf('>',lt);i=end<0?s.length:end+1;continue;}
      const gt=s.indexOf('>',lt);if(gt<0)break;const body=s.slice(lt+1,gt).trim();i=gt+1;
      if(body[0]==='/'){if(stack.length>1)stack.pop();continue;}
      const self=body.endsWith('/'),inner=self?body.slice(0,-1).trim():body,m=/^([^\s/>]+)/.exec(inner);if(!m)continue;
      const node={name:m[1],attrs:{},children:[],text:''},re=/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;let a;
      while((a=re.exec(inner.slice(m[1].length))))node.attrs[a[1]]=decode(a[3]??a[4]);
      stack.at(-1).children.push(node);if(!self)stack.push(node);
    }
    return rootNode;
  }
  const kids=(n,name)=>(n?.children||[]).filter(c=>c.name===name),kid=(n,name)=>kids(n,name)[0]||null,txt=n=>(n?.text||'').trim();
  const nums=(v,d)=>{const x=String(v??'').trim().split(/\s+/).filter(Boolean).map(Number);return d&&x.length===d.length&&x.every(finite)?x:!d&&x.length&&x.every(finite)?x:d;};
  const num=(v,d)=>{const x=parseFloat(v);return finite(x)?x:d;};
  const safe=n=>String(n||'').replace(/\//g,'_').trim().slice(0,80);
  // ---------------------------------------------------------------- rotations (column-major 4×4, as DeckKinematics)
  const X=()=>K().math;
  // Unit quaternion (w, x, y, z) as a rotation matrix.
  function quat(w,x,y,z){const n=Math.hypot(w,x,y,z)||1;w/=n;x/=n;y/=n;z/=n;
    return [1-2*(y*y+z*z),2*(x*y+w*z),2*(x*z-w*y),0, 2*(x*y-w*z),1-2*(x*x+z*z),2*(y*z+w*x),0, 2*(x*z+w*y),2*(y*z-w*x),1-2*(x*x+y*y),0, 0,0,0,1];}
  // Fixed-axis roll, pitch, yaw in degrees (URDF and SDFormat): R = Rz(yaw)·Ry(pitch)·Rx(roll).
  const rpy=([r,p,y])=>{const M=X();return M.mul(M.rot([0,0,1],y),M.mul(M.rot([0,1,0],p),M.rot([1,0,0],r)));};
  // The rotation taking +z to a direction by the smallest turn (MJCF zaxis and fromto).
  function zTo(d){const M=X(),z=M.unit(d),c=z[2];if(c>1-1e-12)return M.I4();if(c<-1+1e-12)return M.rot([1,0,0],180);return M.rot(M.cross([0,0,1],z),Math.acos(Math.max(-1,Math.min(1,c)))*DEG);}
  const relative=(parent,child)=>X().mul(X().invert(parent),child);
  // ---------------------------------------------------------------- SDFormat
  function parseSdf(text){
    const M=X(),doc=parseXml(text),sdf=kid(doc,'sdf');if(!sdf)throw Error('That is not an SDFormat file (no <sdf> element).');
    const version=num(sdf.attrs.version,1.7),notes=[];
    const models=[...kids(sdf,'model'),...kids(sdf,'world').flatMap(w=>kids(w,'model'))];if(!models.length)throw Error('That SDFormat file has no <model>.');
    const jointCount=m=>kids(m,'joint').length+kids(m,'model').reduce((s,n)=>s+jointCount(n),0),model=models.reduce((a,b)=>jointCount(b)>jointCount(a)?b:a);
    if(models.length>1)notes.push(`Read “${model.attrs.name}”, the model with the most joints; ${models.length-1} other model${models.length>2?'s were':' was'} left out.`);
    // A <pose>: x y z roll pitch yaw (radians, or degrees with degrees="true"), or x y z qx qy qz qw with
    // rotation_format="quat_xyzw"; in the frame named by relative_to (frame="" in 1.5 and 1.6).
    const pose=el=>{const p=kid(el,'pose');if(!p)return {M:M.I4(),rel:null};const v=txt(p).split(/\s+/).filter(Boolean).map(Number).map(x=>finite(x)?x:0),xyz=[v[0]||0,v[1]||0,v[2]||0];
      const R=p.attrs.rotation_format==='quat_xyzw'?quat(v[6]??1,v[3]||0,v[4]||0,v[5]||0):rpy([v[3]||0,v[4]||0,v[5]||0].map(a=>p.attrs.degrees==='true'?a:a*DEG));
      return {M:M.mul(M.trans(xyz),R),rel:p.attrs.relative_to||p.attrs.frame||null};};
    // Every frame of the model and its nested models: name → its pose and the frame that pose is in. Links default to
    // their model's frame, joints to their child link, //frame to what it is attached to (pose_frame_semantics).
    const frames=new Map(),links=[],joints=[];
    const scan=(el,prefix,own)=>{frames.set(prefix+'__model__',own);
      const scoped=n=>!n?null:n==='world'?'world':n==='__model__'?prefix+'__model__':prefix+n;
      for(const inc of kids(el,'include'))notes.push(`The included model ${txt(kid(inc,'uri'))||''} is not read; only what the file itself holds is.`);
      for(const l of kids(el,'link')){const name=prefix+l.attrs.name,p=pose(l);frames.set(name,{M:p.M,rel:scoped(p.rel)??prefix+'__model__'});links.push({el:l,name,prefix,scoped});}
      for(const j of kids(el,'joint')){const name=prefix+j.attrs.name,p=pose(j),child=scoped(txt(kid(j,'child'))),parent=scoped(txt(kid(j,'parent')));frames.set(name,{M:p.M,rel:scoped(p.rel)??child});joints.push({el:j,name,prefix,child,parent,scoped});}
      for(const f of kids(el,'frame')){const p=pose(f);frames.set(prefix+f.attrs.name,{M:p.M,rel:scoped(p.rel)??scoped(f.attrs.attached_to)??prefix+'__model__'});}
      for(const n of kids(el,'model')){const p=pose(n);scan(n,prefix+n.attrs.name+'::',{M:p.M,rel:scoped(p.rel)??prefix+'__model__'});}};
    scan(model,'',{M:M.I4(),rel:null});
    const world=new Map(),busy=new Set();
    const W=name=>{if(!name||name==='world')return M.I4();if(world.has(name))return world.get(name);const f=frames.get(name);if(!f){notes.push(`A pose refers to “${name}”, which the model does not have.`);world.set(name,M.I4());return M.I4();}
      if(busy.has(name)){notes.push(`The poses around “${name}” refer to each other in a circle.`);return M.I4();}busy.add(name);const out=M.mul(W(f.rel),f.M);busy.delete(name);world.set(name,out);return out;};
    const linkNames=new Set(links.map(l=>l.name));
    const shape=(el,link,scoped)=>{const p=pose(el),Wv=M.mul(W(scoped(p.rel)??link),p.M),g=geometrySdf(kid(el,'geometry'));if(!g)return null;const mat=kid(el,'material'),c=nums(txt(kid(mat,'diffuse')))||nums(txt(kid(mat,'ambient')));
      return {matrix:relative(W(link),Wv),geometry:g,colour:c&&c.length>=3?c.slice(0,3):null};};
    const outLinks=links.map(l=>({name:l.name,frame:W(l.name),visuals:kids(l.el,'visual').map(v=>shape(v,l.name,l.scoped)).filter(Boolean),collisions:kids(l.el,'collision').map(v=>shape(v,l.name,l.scoped)).filter(Boolean)}));
    // Joints in the model's frame.
    const out=[],gearboxes=[];
    for(const j of joints){const type=String(j.el.attrs.type||''),F=W(j.name);
      if(type==='gearbox'){gearboxes.push(j);continue;}
      if(!linkNames.has(j.child)||j.parent!=='world'&&j.parent&&!linkNames.has(j.parent)){notes.push(`Joint “${j.name}” joins a link the model does not have; it was left out.`);continue;}
      const axisOf=a=>{if(!a)return null;const x=kid(a,'xyz'),v=nums(txt(x),[0,0,1]);let frame=F;
        if(version>=1.7){if(x?.attrs.expressed_in)frame=W(j.scoped(x.attrs.expressed_in));}else if(version<1.5||txt(kid(a,'use_parent_model_frame'))==='true')frame=W(j.prefix+'__model__');
        const lim=kid(a,'limit'),lo=num(txt(kid(lim,'lower')),NaN),hi=num(txt(kid(lim,'upper')),NaN),vel=num(txt(kid(lim,'velocity')),NaN),real=v=>finite(v)&&Math.abs(v)<1e15;
        return {dir:M.unit(M.applyDir(frame,v)),...(real(lo)&&real(hi)&&lo<=hi?{lower:lo,upper:hi}:{}),...(vel>0&&vel<1e15?{velocity:vel}:{})};};
      const a1=axisOf(kid(j.el,'axis')),a2=axisOf(kid(j.el,'axis2')),base={name:j.name,parent:j.parent==='world'?null:j.parent,child:j.child,origin:M.apply(F,[0,0,0]),sdf:type};
      const zf=M.unit(M.applyDir(F,[0,0,1])),xf=M.unit(M.applyDir(F,[1,0,0]));
      if(type==='revolute'||type==='continuous'||type==='prismatic')out.push({...base,type,axis:a1?.dir||zf,...(type!=='continuous'&&a1?.lower!==undefined?{lower:a1.lower,upper:a1.upper}:{}),...(a1?.velocity?{velocity:a1.velocity}:{})});
      else if(type==='universal'||type==='revolute2')out.push({...base,type:'universal',axis:a1?.dir||zf,axis2:a2?.dir||xf,...(a1?.lower!==undefined||a2?.lower!==undefined?{limits:[a1?.lower!==undefined?[a1.lower,a1.upper]:null,a2?.lower!==undefined?[a2.lower,a2.upper]:null]}:{})});
      else if(type==='ball')out.push({...base,type:'ball',axis:zf,axis2:xf});
      else if(type==='screw'){
        // Metres a turn, right-handed positive (screw_thread_pitch); the older thread_pitch is radians a metre, positive left-handed.
        const sp=num(txt(kid(j.el,'screw_thread_pitch')),NaN),tp=num(txt(kid(j.el,'thread_pitch')),NaN),lead=finite(sp)?sp:finite(tp)&&tp?-2*Math.PI/tp:1;
        out.push({...base,type:'screw',axis:a1?.dir||zf,lead,...(a1?.lower!==undefined?{limits:[[a1.lower,a1.upper]]}:{})});}
      else if(type==='fixed')out.push({...base,type:'fixed',axis:zf});
      else{notes.push(`Joint “${j.name}” is a ${type||'untyped'} joint, which is not read; it is held fixed.`);out.push({...base,type:'fixed',axis:zf});}}
    const d=tree({format:'sdf',name:safe(model.attrs.name||'robot'),links:outLinks,joints:out,notes});
    // A gearbox: θ2 = −ratio·θ1, θ1 the parent's angle and θ2 the child's, each from the reference body about its axis.
    for(const g of gearboxes){const ref=g.scoped(txt(kid(g.el,'gearbox_reference_body'))),ratio=num(txt(kid(g.el,'gearbox_ratio')),1),F=W(g.name);
      const ax=a=>M.unit(M.applyDir(F,nums(txt(kid(kid(g.el,a),'xyz')),[0,0,1])));
      const between=(link,axis)=>{const j=d.joints.find(x=>x.parent===ref&&x.child===link||x.parent===link&&x.child===ref);if(!j||j.type!=='revolute'&&j.type!=='continuous')return null;return {j,s:(j.child===link?1:-1)*Math.sign(M.dot(j.axis,axis)||1)};};
      const one=between(g.parent,ax('axis')),two=between(g.child,ax('axis2'));
      if(one&&two)d.couplings.push({kind:'gear',from:one.j.name,to:two.j.name,ratio:-ratio*one.s*two.s,offset:0});else d.notes.push(`Gearbox “${g.name}” needs revolute joints from “${ref}” to both of its links; it was left out.`);}
    return d;
  }
  function geometrySdf(g){
    if(!g)return null;const box=kid(g,'box'),cyl=kid(g,'cylinder'),sph=kid(g,'sphere'),cap=kid(g,'capsule'),ell=kid(g,'ellipsoid'),mesh=kid(g,'mesh');
    if(box)return {type:'box',size:nums(txt(kid(box,'size')),[1,1,1])};
    if(cyl)return {type:'cylinder',radius:num(txt(kid(cyl,'radius')),.5),length:num(txt(kid(cyl,'length')),1)};
    if(sph)return {type:'sphere',radius:num(txt(kid(sph,'radius')),.5)};
    if(cap)return {type:'capsule',radius:num(txt(kid(cap,'radius')),.5),length:num(txt(kid(cap,'length')),1)};
    if(ell)return {type:'ellipsoid',radii:nums(txt(kid(ell,'radii')),[1,1,1])};
    if(mesh)return {type:'mesh',filename:txt(kid(mesh,'uri')),scale:nums(txt(kid(mesh,'scale')),[1,1,1])};
    return null;
  }
  // ---------------------------------------------------------------- the link tree and loops
  // Orders links parents first from the base, gives each its parent link, and turns a joint whose child is already
  // reached into a loop constraint at its origin: two points on its axis for a pivot (a hinge exactly), three for a
  // fixed joint, one (a ball) otherwise. Links the file nests without a joint (MJCF bodies) stay welded to their parent;
  // several joints from a body's parent into that body (MJCF) are one chain, not a loop.
  function tree(d){
    const M=X(),byName=new Map(d.links.map(l=>[l.name,l])),children=new Set(d.joints.map(j=>j.child)),seen=new Set(),order=[],kept=[],loops=d.loops||[],welded=new Map();
    for(const l of d.links)if(l.parent&&!children.has(l.name)&&byName.has(l.parent)){if(!welded.has(l.parent))welded.set(l.parent,[]);welded.get(l.parent).push(l.name);}
    const reach=(name,parent)=>{seen.add(name);order.push(name);byName.get(name).parent=parent;};
    for(const l of d.links)if(!children.has(l.name)&&!(l.parent&&byName.has(l.parent)))reach(l.name,null);
    const queue=[null,...order],done=new Set();
    for(let k=0;k<queue.length;k++){const at=queue[k];
      for(const j of d.joints){if(done.has(j)||j.parent!==at)continue;done.add(j);
        if(seen.has(j.child)){if(d.format==='mjcf'&&byName.get(j.child).parent===at)kept.push(j);else loops.push(...closure(j));continue;}
        reach(j.child,at);queue.push(j.child);kept.push(j);}
      for(const name of welded.get(at)||[])if(!seen.has(name)){reach(name,at);queue.push(name);}}
    for(const j of d.joints)if(!done.has(j))d.notes.push(`Joint “${j.name}” is not connected to the robot's base; it was left out.`);
    for(const l of d.links)if(!seen.has(l.name))reach(l.name,null);
    function closure(j){const pts=j.type==='fixed'?[[0,0,0],[.05,0,0],[0,.05,0]]:j.type==='revolute'||j.type==='continuous'?[[0,0,0],j.axis.map(v=>v*.05)]:[[0,0,0]];
      if(!['fixed','revolute','continuous','ball'].includes(j.type))d.notes.push(`Joint “${j.name}” closes a loop; it is held as a point where its links meet.`);
      return pts.map(p=>{const at=j.type==='fixed'?M.apply(byName.get(j.child).frame,p):M.add(j.origin,p);return {a:{link:j.parent,point:at},b:{link:j.child,point:at}};});}
    return {...d,links:order.map(n=>byName.get(n)),joints:kept,loops,couplings:d.couplings||[],actuators:d.actuators||[]};
  }
  // ---------------------------------------------------------------- MJCF
  function parseMjcf(text){
    const M=X(),doc=parseXml(text),mj=kid(doc,'mujoco');if(!mj)throw Error('That is not an MJCF model (no <mujoco> element).');
    const notes=[],comp=kids(mj,'compiler').reduce((o,c)=>({...o,...c.attrs}),{}),degrees=(comp.angle||'degree')!=='radian',seq=/^[xyzXYZ]{3}$/.test(comp.eulerseq||'')?comp.eulerseq:'xyz';
    const autolimits=comp.autolimits!=='false',meshdir=comp.meshdir??comp.assetdir??'',angle=v=>degrees?v:v*DEG,rad=v=>degrees?v/DEG:v;
    for(const inc of [...kids(mj,'include'),...kids(kid(mj,'worldbody'),'include')])notes.push(`The included file ${inc.attrs.file||''} is not read; only what this file holds is.`);
    // Default classes: each inherits its parent's values for every element type and overrides some (top class "main").
    const classes=new Map();
    const readDefault=(el,inherit)=>{const own={};for(const [k,v] of Object.entries(inherit||{}))own[k]={...v};for(const c of el.children)if(c.name!=='default')own[c.name]={...(own[c.name]||{}),...c.attrs};
      classes.set(el.attrs.class||'main',own);for(const c of kids(el,'default'))readDefault(c,own);};
    for(const d of kids(mj,'default'))readDefault(d,classes.get('main'));
    // An element's attributes: its own over its class (explicit, else the nearest childclass, else main).
    const attrs=(el,cc)=>({...((classes.get(el.attrs.class||cc||'main')||classes.get('main')||{})[el.name]||{}),...el.attrs});
    // A frame's orientation: quat (w x y z), axisangle, euler (eulerseq; lower case turns with the frame, upper case
    // about the parent's axes), xyaxes or zaxis.
    const orient=a=>{
      if(a.quat){const q=nums(a.quat,[1,0,0,0]);return quat(...q);}
      if(a.axisangle){const v=nums(a.axisangle,[0,0,1,0]);return M.rot(v.slice(0,3),angle(v[3]));}
      if(a.euler){const e=nums(a.euler,[0,0,0]);let R=M.I4();[...seq].forEach((c,i)=>{const r=M.rot({x:[1,0,0],y:[0,1,0],z:[0,0,1]}[c.toLowerCase()],angle(e[i]));R=c===c.toLowerCase()?M.mul(R,r):M.mul(r,R);});return R;}
      if(a.xyaxes){const v=nums(a.xyaxes,[1,0,0,0,1,0]),x=M.unit(v.slice(0,3)),y=M.unit(M.sub(v.slice(3),M.scale(x,M.dot(v.slice(3),x)))),z=M.cross(x,y);return [...x,0,...y,0,...z,0,0,0,0,1];}
      if(a.zaxis)return zTo(nums(a.zaxis,[0,0,1]));
      return M.I4();};
    const place=a=>M.mul(M.trans(nums(a.pos,[0,0,0])),orient(a));
    const meshes=new Map(),materials=new Map(),tendons=new Map();
    for(const as of kids(mj,'asset')){
      for(const m of kids(as,'mesh')){const a=attrs(m,null),name=a.name||String(a.file||'').replace(/^.*[\\/]/,'').replace(/\.[^.]+$/,'');
        meshes.set(name,{file:a.file?(/^([a-z]:|[\\/])/i.test(a.file)||!meshdir?a.file:meshdir.replace(/[\\/]$/,'')+'/'+a.file):null,scale:nums(a.scale,[1,1,1]),refpos:nums(a.refpos,[0,0,0]),refquat:nums(a.refquat,[1,0,0,0])});}
      for(const m of kids(as,'material')){const a=attrs(m,null);if(a.name)materials.set(a.name,nums(a.rgba,[1,1,1,1]));}}
    for(const t of kids(mj,'tendon')){for(const f of kids(t,'fixed'))tendons.set(f.attrs.name,kids(f,'joint').map(j=>({joint:j.attrs.joint,coef:num(j.attrs.coef,0)})));
      for(const s of kids(t,'spatial'))tendons.set(s.attrs.name,null);}
    const links=[],joints=[],sites=new Map();let unnamed=0;
    const world={name:'world',frame:M.I4(),visuals:[],collisions:[]};links.push(world);
    // Geoms: groups 0–2 are drawn (MuJoCo shows those by default); higher groups, and see-through ones, are collision shapes.
    const geom=(el,link,Wf,cc)=>{const a=attrs(el,cc),type=a.type||'sphere',size=nums(a.size)||[];if(type==='plane'||type==='hfield'||type==='sdf')return;
      let local=place(a),g=null;const ft=nums(a.fromto,[0,0,0,0,0,0]),from=a.fromto!==undefined?{c:ft.slice(0,3).map((v,i)=>(v+ft[i+3])/2),d:M.sub(ft.slice(3),ft.slice(0,3))}:null;
      if(from)local=M.mul(M.trans(from.c),zTo(from.d));
      const half=from?M.len(from.d)/2:size[1]??.05;
      if(type==='sphere')g={type:'sphere',radius:size[0]??.05};
      else if(type==='capsule')g={type:'capsule',radius:size[0]??.05,length:2*half};
      else if(type==='cylinder')g={type:'cylinder',radius:size[0]??.05,length:2*half};
      else if(type==='box')g={type:'box',size:from?[2*(size[0]??.05),2*(size[0]??.05),2*half]:[0,1,2].map(i=>2*(size[i]??.05))};
      else if(type==='ellipsoid')g={type:'ellipsoid',radii:[0,1,2].map(i=>size[i]??.05)};
      else if(type==='mesh'){const m=meshes.get(a.mesh);if(!m||!m.file){notes.push(`Mesh “${a.mesh||'?'}” has no file (inline vertices are not drawn).`);return;}
        // Vertices are given relative to refpos and refquat; the compiler's own centring is undone by the geom, so the file's vertices sit in the geom frame.
        local=M.mul(local,M.mul(M.invert(quat(...m.refquat)),M.trans(m.refpos.map(v=>-v))));g={type:'mesh',filename:m.file,scale:m.scale};}
      // rgba (from the geom or its class) wins over the material when it differs from MuJoCo's own default.
      if(!g)return;const own=nums(a.rgba,[.5,.5,.5,1]),set=own.some((v,i)=>v!==[.5,.5,.5,1][i]),rgba=set||!materials.has(a.material)?own:materials.get(a.material);
      const shape={matrix:relative(link.frame,M.mul(Wf,local)),geometry:g,colour:rgba.slice(0,3)};(num(a.group,0)<=2&&rgba[3]>0?link.visuals:link.collisions).push(shape);};
    const walk=(el,link,Wf,cc)=>{
      for(const c of el.children){
        if(c.name==='body'){const name=safe(c.attrs.name)||`body${++unnamed}`,L={name,parent:link.name,frame:M.mul(Wf,place(c.attrs)),visuals:[],collisions:[]};links.push(L);const ccc=c.attrs.childclass||cc;
          // Joints of one body apply in the order written, each at its own position in the body frame.
          let k=0;for(const j of c.children.filter(x=>x.name==='joint'||x.name==='freejoint')){const a=attrs(j,ccc),type=j.name==='freejoint'?'free':a.type||'hinge',jname=safe(a.name)||`${name}_joint${k}`;k++;
            const origin=M.apply(L.frame,type==='free'?[0,0,0]:nums(a.pos,[0,0,0])),axis=M.unit(M.applyDir(L.frame,nums(a.axis,[0,0,1]))),range=nums(a.range,[0,0]),ref=num(a.ref,0);
            const limited=a.limited==='true'||(a.limited!=='false'&&autolimits&&a.range!==undefined),base={name:jname,parent:link.name,child:name,origin,mj:type};
            if(type==='hinge')joints.push({...base,type:limited?'revolute':'continuous',axis,...(limited?{lower:rad(range[0]-ref),upper:rad(range[1]-ref)}:{}),...(ref?{ref:rad(ref)}:{})});
            else if(type==='slide')joints.push({...base,type:'prismatic',axis,...(limited?{lower:range[0]-ref,upper:range[1]-ref}:{}),...(ref?{ref}:{})});
            else if(type==='ball'){joints.push({...base,type:'ball',axis:M.unit(M.applyDir(L.frame,[0,0,1])),axis2:M.unit(M.applyDir(L.frame,[1,0,0])),...(limited?{limits:[0,1,2].map(()=>[-rad(range[1]),rad(range[1])])}:{})});
              if(limited)notes.push(`Ball joint “${jname}” has a cone limit; it is kept as the same limit on each of its three angles.`);}
            else joints.push({...base,type:'floating',axis:M.unit(M.applyDir(L.frame,[0,0,1])),axis2:M.unit(M.applyDir(L.frame,[1,0,0]))});}
          walk(c,L,L.frame,ccc);}
        else if(c.name==='frame')walk(c,link,M.mul(Wf,place(c.attrs)),c.attrs.childclass||cc);
        else if(c.name==='geom')geom(c,link,Wf,cc);
        else if(c.name==='site'){const a=attrs(c,cc);if(a.name)sites.set(a.name,{link:link.name,point:M.apply(M.mul(Wf,place(a)),[0,0,0])});}}};
    const wb=kid(mj,'worldbody');if(!wb)throw Error('That MJCF model has no <worldbody>.');walk(wb,world,M.I4(),null);
    // Joints of one body chain inside it: each after the one before. The description keeps them as written; toKinematics nests them.
    const byLink=new Map(links.map(l=>[l.name,l])),jointBy=new Map(joints.map(j=>[j.name,j])),loops=[],couplings=[],actuators=[];
    for(const e of kids(mj,'equality').flatMap(x=>x.children)){const a=attrs(e,null);
      if(e.name==='connect'){
        if(a.site1&&a.site2){const s1=sites.get(a.site1),s2=sites.get(a.site2);if(s1&&s2)loops.push({a:{link:s1.link,point:s1.point},b:{link:s2.link,point:s2.point}});continue;}
        const b1=byLink.get(safe(a.body1)),b2=a.body2?byLink.get(safe(a.body2)):world;if(!b1||!b2){notes.push('A connect constraint names a body the model does not have.');continue;}
        const p=M.apply(b1.frame,nums(a.anchor,[0,0,0]));loops.push({a:{link:b1.name,point:p},b:{link:b2.name,point:p}});}
      else if(e.name==='weld'){const b1=byLink.get(safe(a.body1)),b2=a.body2?byLink.get(safe(a.body2)):world;if(!b1||!b2){notes.push('A weld constraint names a body the model does not have.');continue;}
        // Welded where the file has them: three points of body1's frame stay on body2 (orientation as well as position).
        for(const p of [[0,0,0],[.05,0,0],[0,.05,0]]){const w=M.apply(b1.frame,p);loops.push({a:{link:b1.name,point:w},b:{link:b2.name,point:w}});}}
      else if(e.name==='joint'){
        // y − y0 = a0 + a1·(x − x0) + … + a4·(x − x0)⁴ about the reference pose, which is where joint values are zero here.
        const y=jointBy.get(safe(a.joint1)),x=a.joint2?jointBy.get(safe(a.joint2)):null,c=nums(a.polycoef)||[0,1,0,0,0];if(!y){notes.push(`A joint constraint names “${a.joint1}”, which the model does not have.`);continue;}
        if(!x){y.lockedAt=c[0]||0;continue;}couplings.push({kind:'mimic',from:x.name,to:y.name,ratio:c[1]??1,offset:c[0]||0,...(c.slice(2).some(v=>v)?{poly:c.slice(2,5)}:{})});}
      else if(e.name==='tendon'){
        // Fixed tendons are sums of joint values: L1 − L1₀ = a0 + a1·(L2 − L2₀) (linear terms only). One joint of the first
        // tendon, the last not driven by an actuator, is set from all the others.
        const t1=tendons.get(a.tendon1),t2=a.tendon2?tendons.get(a.tendon2):[],c=nums(a.polycoef)||[0,1,0,0,0];
        if(!t1||t2===null||t2===undefined||c.slice(2).some(v=>v)){notes.push(`Tendon constraint on “${a.tendon1}” is not read (spatial tendons and non-linear tendon couplings are not).`);continue;}
        const driven=new Set(kids(mj,'actuator').flatMap(x=>x.children).map(x=>safe(x.attrs.joint))),usable=t1.filter(t=>t.coef&&jointBy.has(safe(t.joint))),dep=[...usable].reverse().find(t=>!driven.has(safe(t.joint)))||usable.at(-1);
        if(!dep){notes.push(`Tendon constraint on “${a.tendon1}” names no joint of the model.`);continue;}
        const terms=[...t1.filter(t=>t!==dep).map(t=>({from:safe(t.joint),ratio:-t.coef/dep.coef})),...(t2||[]).map(t=>({from:safe(t.joint),ratio:(c[1]??1)*t.coef/dep.coef}))].filter(t=>jointBy.has(t.from));
        if(!terms.length){jointBy.get(safe(dep.joint)).lockedAt=(c[0]||0)/dep.coef;continue;}
        couplings.push({kind:'tendon',from:terms[0].from,to:safe(dep.joint),ratio:terms[0].ratio,offset:(c[0]||0)/dep.coef,...(terms.length>1?{plus:terms.slice(1)}:{})});}
      else notes.push(`The ${e.name} constraint is not read.`);}
    const KINDS={motor:['dcmotor','effort'],position:['servo','position'],velocity:['dcmotor','velocity'],intvelocity:['servo','position'],cylinder:['pneumatic','position'],general:['servo','position'],damper:null,adhesion:null,muscle:null};
    for(const a of kids(mj,'actuator').flatMap(x=>x.children)){const at=attrs(a,null),kind=KINDS[a.name];if(kind===null||kind===undefined){notes.push(`The ${a.name} actuator${at.name?` “${at.name}”`:''} is not read.`);continue;}
      if(!at.joint||!jointBy.has(safe(at.joint))){notes.push(`Actuator “${at.name||a.name}” drives ${at.tendon?`tendon “${at.tendon}”`:'something other than a joint'}; it is not read.`);continue;}
      actuators.push({name:safe(at.name)||`${a.name}_${safe(at.joint)}`,joint:safe(at.joint),kind:kind[0],mode:kind[1],gear:(nums(at.gear)||[1])[0]||1});}
    return tree({format:'mjcf',name:safe(mj.attrs.model||'robot'),links,joints,loops,couplings,actuators,notes});
  }
  // ---------------------------------------------------------------- OpenUSD (text .usda) with UsdPhysics joints
  // USDA, the text form of USD (Isaac Sim and Omniverse robots): prims, their attributes and relationships, read
  // without composition. References, payloads and variants name other files or alternatives, and are reported.
  const STOP=new Set([' ','\t','\n','\r','(',')','[',']','{','}','=',',',';','"',"'",'@','<','#']);
  function tokensUsda(s){
    const out=[];let i=0;const n=s.length;if(s.startsWith('#usda'))i=s.indexOf('\n')+1||n;
    while(i<n){const c=s[i];
      if(c===' '||c==='\t'||c==='\n'||c==='\r'){i++;continue;}
      if(c==='#'){const e=s.indexOf('\n',i);i=e<0?n:e+1;continue;}
      if('()[]{}=,;'.includes(c)){out.push(c);i++;continue;}
      if(c==='"'||c==="'"){const q=s.startsWith(c+c+c,i)?c+c+c:c;let j=i+q.length,v='';while(j<n&&!s.startsWith(q,j)){if(s[j]==='\\'&&q.length===1){v+=s[j+1];j+=2;}else v+=s[j++];}out.push({str:v});i=j+q.length;continue;}
      if(c==='@'){const q=s.startsWith('@@@',i)?'@@@':'@',e=s.indexOf(q,i+q.length);out.push({asset:s.slice(i+q.length,e<0?n:e)});i=e<0?n:e+q.length;continue;}
      if(c==='<'){const e=s.indexOf('>',i);out.push({path:s.slice(i+1,e<0?n:e)});i=e<0?n:e+1;continue;}
      let j=i;while(j<n&&!STOP.has(s[j]))j++;const w=s.slice(i,j);i=j;
      const x=w==='inf'||w==='+inf'?Infinity:w==='-inf'?-Infinity:Number(w);out.push(w!==''&&/^[-+.\d]/.test(w)&&!Number.isNaN(x)?x:w);}
    return out;
  }
  function parseUsda(text){
    const M=X(),t=tokensUsda(String(text)),notes=[];let k=0;
    const peek=()=>t[k],next=()=>t[k++],skip=(open,close)=>{let depth=0;do{const x=next();if(x===open)depth++;else if(x===close)depth--;}while(depth>0&&k<t.length);};
    const value=()=>{const x=next();if(x==='('||x==='['){const close=x==='('?')':']',list=[];while(k<t.length&&peek()!==close){if(peek()===','){k++;continue;}list.push(value());}k++;return list;}
      if(x==='{'){k--;skip('{','}');return {};}return x&&typeof x==='object'&&'str' in x?x.str:x;};
    // Metadata in parentheses: key = value, list edits (prepend, append, add, delete, reorder), or a doc string.
    const EDITS=['prepend','append','add','delete','reorder'];
    const metadata=()=>{const out={};k++;while(k<t.length&&peek()!==')'){let x=next();if(typeof x==='object'||x===';'||x===',')continue;
      if(EDITS.includes(x)){const edit=x;x=next();if(peek()==='='){k++;const v=value();if(edit!=='delete')out[x]=[...(out[x]||[]),...[].concat(v)];}continue;}
      if(peek()==='='){k++;out[x]=value();}}k++;return out;};
    const prim=(spec,parent)=>{let type='';if(typeof peek()==='string')type=next();const nm=next(),name=nm&&typeof nm==='object'?nm.str:String(nm);
      const p={spec,type,name,path:(parent?parent.path:'')+'/'+name,attrs:{},rels:{},meta:peek()==='('?metadata():{},children:[],parent};
      if(peek()!=='{')return p;k++;
      while(k<t.length&&peek()!=='}'){const x=next();
        if(x==='def'||x==='over'||x==='class'){const c=prim(x,p);if(x==='def')p.children.push(c);continue;}
        if(x==='variantSet'){next();if(peek()==='=')k++;if(peek()==='{')skip('{','}');notes.push(`Variants of ${p.path} are not read (the default is used).`);continue;}
        if(x===';'||typeof x==='object')continue;
        let w=x;while(['custom','uniform','varying','config',...EDITS].includes(w))w=next();
        if(w==='rel'){const name=next();let v=null;if(peek()==='='){k++;v=value();}if(peek()==='(')metadata();p.rels[name]=[].concat(v).filter(e=>e&&typeof e==='object'&&e.path).map(e=>e.path);continue;}
        // An attribute: a type (an array type ends in []), a name, perhaps = value, perhaps (metadata).
        if(peek()==='['){k+=2;}const name=next();if(typeof name!=='string')continue;
        let v;if(peek()==='='){k++;v=value();}if(peek()==='(')metadata();if(!/\.(timeSamples|connect|spline)$/.test(name))p.attrs[name]=v;}
      k++;return p;};
    const layer=peek()==='('?metadata():{},roots=[];
    while(k<t.length){const x=next();if(x==='def'||x==='over'||x==='class'){const p=prim(x,null);if(x==='def')roots.push(p);}}
    if(!roots.length)throw Error('That USD file defines no prims.');
    const all=[];const walk=p=>{all.push(p);p.children.forEach(walk);};roots.forEach(walk);
    for(const p of all){const m=p.meta;if(m.references||m.payload)notes.push(`${p.path} refers to another file (${[].concat(m.references||m.payload).map(r=>r&&typeof r==='object'?r.asset||r.path:r).join(', ')}), which is not read.`);}
    // The robot is the default prim when the layer names one.
    const top=roots.find(r=>r.name===layer.defaultPrim)||null,inside=p=>!top||p===top||p.path.startsWith(top.path+'/');
    // Scene units to metres (USD's fallback is centimetres), and a Y-up scene turned to Z up.
    const mpu=finite(layer.metersPerUnit)?layer.metersPerUnit:.01,yUp=(layer.upAxis??'Y')==='Y';
    if(!finite(layer.metersPerUnit))notes.push('The file does not give its unit (metersPerUnit); USD’s default, centimetres, is used.');
    const base=M.mul([mpu,0,0,0,0,mpu,0,0,0,0,mpu,0,0,0,0,1],yUp?M.rot([1,0,0],90):M.I4());
    // xformOpOrder lists ops outermost first: [translate, rotateXYZ, scale] scales, then turns about X, Y, Z, then moves.
    const AX={X:[1,0,0],Y:[0,1,0],Z:[0,0,1]};
    const op=(p,name)=>{const inv=name.startsWith('!invert!'),key=inv?name.slice(8):name,v=p.attrs[key],kind=key.split(':')[1]||'';let m=M.I4();
      if(kind==='translate')m=M.trans((v||[0,0,0]).map(Number));
      else if(kind==='scale'){const s=Array.isArray(v)?v.map(Number):[+(v??1),+(v??1),+(v??1)];m=[s[0],0,0,0,0,s[1],0,0,0,0,s[2],0,0,0,0,1];}
      else if(kind==='orient'){const q=(v||[1,0,0,0]).map(Number);m=quat(q[0],q[1],q[2],q[3]);}
      else if(kind==='transform'&&Array.isArray(v))m=v.flat().map(Number);
      else if(/^rotate[XYZ]$/.test(kind))m=M.rot(AX[kind[6]],+v||0);
      else if(/^rotate[XYZ]{3}$/.test(kind)){const a=(v||[0,0,0]).map(Number);[...kind.slice(6)].forEach((ax,i)=>{m=M.mul(M.rot(AX[ax],a[i]||0),m);});}
      return inv?M.invert(m):m;};
    const worlds=new Map(),world=p=>{if(!p)return base;if(worlds.has(p))return worlds.get(p);const order=[].concat(p.attrs.xformOpOrder||[]);let m=order[0]==='!resetXformStack!'?base:world(p.parent);
      for(const name of order)if(name!=='!resetXformStack!')m=M.mul(m,op(p,name));worlds.set(p,m);return m;};
    const apis=p=>[].concat(p.meta.apiSchemas||[]).map(String),byPath=new Map(all.map(p=>[p.path,p]));
    const JOINTS=new Set(['PhysicsRevoluteJoint','PhysicsPrismaticJoint','PhysicsSphericalJoint','PhysicsFixedJoint','PhysicsDistanceJoint','PhysicsJoint']);
    const jointPrims=all.filter(p=>JOINTS.has(p.type)&&inside(p)&&p.attrs['physics:jointEnabled']!==false);
    const bodyPaths=new Set(all.filter(p=>inside(p)&&apis(p).includes('PhysicsRigidBodyAPI')).map(p=>p.path));
    for(const j of jointPrims)for(const r of ['physics:body0','physics:body1'])if(j.rels[r]?.[0]&&byPath.has(j.rels[r][0]))bodyPaths.add(j.rels[r][0]);
    // Links: each body, and the robot itself for shapes that belong to no body. Names stay short where they are unique.
    const counts=new Map();for(const p of bodyPaths){const nm=p.split('/').pop();counts.set(nm,(counts.get(nm)||0)+1);}
    const linkName=path=>{const nm=path.split('/').pop();return safe(counts.get(nm)>1?path.slice(1).replace(/\//g,'_'):nm);};
    const rootName=safe(top?.name||'stage'),links=[{name:rootName,frame:base,visuals:[],collisions:[]}],linkBy=new Map();
    for(const path of bodyPaths){const L={name:linkName(path),frame:world(byPath.get(path)),visuals:[],collisions:[]};links.push(L);linkBy.set(path,L);}
    const ownerOf=p=>{for(let x=p;x;x=x.parent)if(bodyPaths.has(x.path))return linkBy.get(x.path);return links[0];};
    // Shapes: Cube, Sphere, Cylinder, Capsule, Cone and Mesh with their schema defaults. Guides, and shapes under a scope
    // named for collisions, are collision shapes.
    const along=a=>a==='X'?M.rot([0,1,0],90):a==='Y'?M.rot([1,0,0],-90):M.I4();
    for(const p of all){if(!inside(p)||p.attrs.visibility==='invisible')continue;const a=p.attrs;let g=null,local=M.I4();
      if(p.type==='Cube'){const s=+(a.size??2);g={type:'box',size:[s,s,s]};}
      else if(p.type==='Sphere')g={type:'sphere',radius:+(a.radius??1)};
      else if(p.type==='Cylinder'){g={type:'cylinder',radius:+(a.radius??1),length:+(a.height??2)};local=along(a.axis);}
      else if(p.type==='Capsule'){g={type:'capsule',radius:+(a.radius??.5),length:+(a.height??1)};local=along(a.axis);}
      else if(p.type==='Cone'){g={type:'cone',radius:+(a.radius??1),length:+(a.height??2)};local=along(a.axis);}
      else if(p.type==='Mesh'&&Array.isArray(a.points)&&Array.isArray(a.faceVertexIndices)){const sizes=[].concat(a.faceVertexCounts||[]),idx=a.faceVertexIndices,tri=[];let at=0;
        for(const c of sizes){for(let f=1;f+1<c;f++)tri.push(idx[at],idx[at+f],idx[at+f+1]);at+=c;}g={type:'triangles',positions:a.points.flat().map(Number),indices:tri};}
      if(!g)continue;const L=ownerOf(p),dc=a['primvars:displayColor'],colour=Array.isArray(dc)?(Array.isArray(dc[0])?dc[0]:dc).map(Number):null;
      const shape={matrix:relative(L.frame,M.mul(world(p),local)),geometry:g,colour:colour&&colour.length===3?colour:null};
      let collision=a.purpose==='guide';for(let x=p.parent;x&&!collision;x=x.parent)if(/collision/i.test(x.name))collision=true;(collision?L.collisions:L.visuals).push(shape);}
    // Joints: the frame is localPos0/localRot0 in body0's frame (no body0: the world), the axis X, Y or Z of that frame.
    // Revolute limits are degrees, prismatic ones scene units; a low limit above the high one locks the joint.
    const joints=[],couplings=[],actuators=[];
    const ordered=[...jointPrims.filter(j=>j.attrs['physics:excludeFromArticulation']!==true),...jointPrims.filter(j=>j.attrs['physics:excludeFromArticulation']===true)];
    for(const j of ordered){const a=j.attrs,b0=j.rels['physics:body0']?.[0]||null,b1=j.rels['physics:body1']?.[0]||null,name=safe(j.name);
      if(!b1||!linkBy.has(b1)||b0&&!linkBy.has(b0)){notes.push(`Joint “${name}” has no body to move; it was left out.`);continue;}
      const frameOn=(b,pos,rot)=>{const W=b?world(byPath.get(b)):base,q=(rot||[1,0,0,0]).map(Number);return M.mul(W,M.mul(M.trans((pos||[0,0,0]).map(Number)),quat(q[0],q[1],q[2],q[3])));};
      const F=frameOn(b0,a['physics:localPos0'],a['physics:localRot0']),F1=frameOn(b1,a['physics:localPos1'],a['physics:localRot1']),origin=M.apply(F,[0,0,0]);
      if(j.type!=='PhysicsDistanceJoint'&&j.type!=='PhysicsJoint'&&M.len(M.sub(origin,M.apply(F1,[0,0,0])))>1e-4)notes.push(`Joint “${name}”: its two body frames do not meet in this pose; body0’s is used.`);
      const axis=M.unit(M.applyDir(F,AX[a['physics:axis']]||[1,0,0])),lo=a['physics:lowerLimit'],hi=a['physics:upperLimit'],limited=finite(lo)&&finite(hi);
      const at={name,parent:b0?linkBy.get(b0).name:null,child:linkBy.get(b1).name,origin,usd:j.type.replace(/^Physics|Joint$/g,'').toLowerCase()||'generic'};
      if(j.type==='PhysicsRevoluteJoint'){if(limited&&lo>hi)joints.push({...at,type:'fixed',axis});else joints.push({...at,type:limited?'revolute':'continuous',axis,...(limited?{lower:lo/DEG,upper:hi/DEG}:{})});}
      else if(j.type==='PhysicsPrismaticJoint'){if(limited&&lo>hi)joints.push({...at,type:'fixed',axis});else joints.push({...at,type:'prismatic',axis,...(limited?{lower:lo*mpu,upper:hi*mpu}:{})});}
      else if(j.type==='PhysicsSphericalJoint'){const cone=[a['physics:coneAngle0Limit'],a['physics:coneAngle1Limit']].filter(v=>finite(v)&&v>=0),c=cone.length?Math.max(...cone)/DEG:null;
        joints.push({...at,type:'ball',axis,axis2:M.unit(M.applyDir(F,AX[{X:'Y',Y:'Z',Z:'X'}[a['physics:axis']]||'Y'])),...(c!==null?{limits:[[-c,c],[-c,c],[-c,c]]}:{})});
        if(c!==null)notes.push(`Spherical joint “${name}” has a cone limit; it is kept as the same limit on each of its three angles.`);}
      else if(j.type==='PhysicsFixedJoint')joints.push({...at,type:'fixed',axis});
      else{notes.push(`Joint “${name}” is a ${j.type==='PhysicsDistanceJoint'?'distance':'generic (D6)'} joint, which is not read; it was left out.`);continue;}
      // Drives: a stiffness holds a target position (a servo); damping alone holds a speed.
      for(const d of ['angular','linear'])if(apis(j).includes('PhysicsDriveAPI:'+d)){const st=a[`drive:${d}:physics:stiffness`];actuators.push({name:`${name}_drive`,joint:name,kind:st>0?'servo':'dcmotor',mode:st>0?'position':'velocity',gear:1});}
      // PhysX mimic joints: q + gearing·q_reference + offset = 0 (PxArticulationReducedCoordinate::createMimicJoint).
      for(const api of apis(j).filter(x=>x.startsWith('PhysxMimicJointAPI:'))){const ax=api.split(':')[1],ref=j.rels[`physxMimicJoint:${ax}:referenceJoint`]?.[0],g=a[`physxMimicJoint:${ax}:gearing`],off=+(a[`physxMimicJoint:${ax}:offset`]||0);
        if(ref&&byPath.has(ref)&&finite(g)){couplings.push({kind:'mimic',from:safe(byPath.get(ref).name),to:name,ratio:-g,offset:j.type==='PhysicsPrismaticJoint'?-off*mpu:-off/DEG});if(off)notes.push(`Mimic joint “${name}”: its offset is read in degrees (scene units for a slide), USD’s units.`);}}}
    return tree({format:'usd',name:rootName,links,joints,couplings,actuators,notes});
  }
  // ---------------------------------------------------------------- from the description
  const unitsOf=type=>K().dofOf({type});
  // The description's joints as DeckKinematics joints (CAD frame in metres), confirmed. A link with several joints
  // (an MJCF body) chains them, the last carrying its parts. Joints on a closed loop are left for the loop solver
  // unless an actuator in the file drives them; joints set by couplings follow their inputs.
  function toKinematics(d,{keyOf}={}){
    const Kn=K(),byLink=new Map(d.links.map(l=>[l.name,l])),path=n=>{const out=[];for(let x=byLink.get(n),g=0;x&&g<1000;x=byLink.get(x.parent),g++)out.unshift(x.name);return out.join('/');};keyOf=keyOf||path;
    const ids=new Map(),taken=new Set(),idOf=name=>{if(ids.has(name))return ids.get(name);const base=(s=>/^[A-Za-z]/.test(s)?s:'j_'+s)(String(name).replace(/[^\w-]+/g,'_')).slice(0,30);let id=base,n=2;while(taken.has(id))id=base.slice(0,26)+'_'+n++;taken.add(id);ids.set(name,id);return id;};
    const actuated=new Set(d.actuators.map(a=>a.joint)),coupled=new Set(d.couplings.map(c=>c.to)),scale=u=>u==='in'?IN_PER_M:DEG;
    const carrier=new Map(),joints=[],looped=new Set();
    for(const l of d.links){const own=d.joints.filter(j=>j.child===l.name);let parent=l.parent?carrier.get(l.parent)??null:null;
      own.forEach((j,k)=>{const id=idOf(j.name),u=unitsOf(j.type),s=scale(u[0]),lim=(lo,hi,un)=>[+(lo*scale(un)).toFixed(4),+(hi*scale(un)).toFixed(4)];
        joints.push({id,name:j.name,type:j.type,parent,parts:k===own.length-1?[keyOf(l.name)]:[],origin:j.origin,axis:j.axis,...(j.axis2?{axis2:j.axis2}:{}),
          ...(finite(j.lower)&&finite(j.upper)?(([lo,hi])=>({lower:lo,upper:hi}))(lim(j.lower,j.upper,u[0])):{}),
          ...(j.limits?{limits:j.limits.map((x,i)=>x?lim(x[0],x[1],u[i]):null)}:{}),...(j.type==='screw'?{lead:+(j.lead*IN_PER_M).toPrecision(10)}:{}),
          ...(j.velocity?{speed:+(j.velocity*s).toFixed(3)}:{}),...(finite(j.lockedAt)?{home:[+(j.lockedAt*s).toFixed(4)]}:{}),
          ...(u.length===1&&!coupled.has(j.name)&&!finite(j.lockedAt)?{drive:{signal:'action'}}:{}),source:'metadata',confidence:1,
          note:`From the ${({sdf:'SDFormat',mjcf:'MJCF',usd:'USD'})[d.format]} file: ${j.sdf||j.mj||j.usd||j.type} joint “${j.name}” (${j.parent||'base'} → ${j.child}).`});parent=id;});
      carrier.set(l.name,parent);}
    const jointOf=link=>link?carrier.get(link)??null:null,byId=new Map(joints.map(j=>[j.id,j]));
    const loops=d.loops.map(l=>({a:{joint:jointOf(l.a.link),point:l.a.point},b:{joint:jointOf(l.b.link),point:l.b.point}})).filter(l=>l.a.joint!==l.b.joint);
    // The joints a loop leaves free are solved, not driven, unless the file drives them.
    for(const l of loops)for(const end of [l.a,l.b])for(let p=end.joint;p;p=byId.get(p)?.parent)looped.add(p);
    for(const j of joints)if(looped.has(j.id)&&!actuated.has(d.joints.find(x=>ids.get(x.name)===j.id)?.name))delete j.drive;
    const unitOfJoint=name=>scale(unitsOf(d.joints.find(j=>j.name===name)?.type)[0]);
    const couplings=d.couplings.filter(c=>ids.has(c.from)&&ids.has(c.to)).map(c=>{const sy=unitOfJoint(c.to),sx=unitOfJoint(c.from);
      return {kind:c.kind,from:ids.get(c.from),to:ids.get(c.to),ratio:c.ratio*sy/sx,offset:(c.offset||0)*sy,...(c.poly?{poly:c.poly.map((p,k)=>p*sy/sx**(k+2))}:{}),
        ...(c.plus?{plus:c.plus.filter(t=>ids.has(t.from)).map(t=>({from:ids.get(t.from),ratio:t.ratio*sy/unitOfJoint(t.from)}))}:{})};});
    const aid=new Set(),actuators=d.actuators.filter(a=>ids.has(a.joint)).map(a=>{let id=String(a.name).replace(/[^\w-]+/g,'_').slice(0,28);if(!/^[A-Za-z]/.test(id))id='a_'+id;if(taken.has(id)||aid.has(id))id=('act_'+id).slice(0,30);aid.add(id);
      const j=d.joints.find(x=>x.name===a.joint),u=unitsOf(j.type)[0];return {id,name:a.name,kind:a.kind,joint:ids.get(a.joint),mode:a.mode,ratio:a.gear,speed:j.velocity?+(j.velocity*scale(u)).toFixed(3):u==='in'?6:90};});
    return {unit:IN_PER_M,joints,couplings,loops,actuators};
  }
  // A Three.js group: links nested as the joints nest them (each a part under its parent link), each holding its
  // shapes where they sit in the file's pose. meshes: {filename: Object3D or BufferGeometry} for the files read.
  function buildScene(d,T,{meshes={},resolve=f=>f}={}){
    const M=X(),group=new T.Group();group.name=d.name;const nodes=new Map(),missing=[];
    for(const l of d.links){const node=new T.Group();node.name=l.name;nodes.set(l.name,node);(l.parent?nodes.get(l.parent):group).add(node);
      node.matrixAutoUpdate=false;node.matrix.fromArray(l.parent?relative(d.links.find(x=>x.name===l.parent).frame,l.frame):l.frame);}
    for(const l of d.links){const node=nodes.get(l.name);let shapes=l.visuals;const unread=shapes.filter(v=>v.geometry.type==='mesh'&&!meshes[resolve(v.geometry.filename)]);
      if(unread.length){missing.push(...unread.map(v=>`${l.name}: ${v.geometry.filename}`));shapes=shapes.filter(v=>!unread.includes(v));}
      if(!shapes.length&&!l.visuals.length||unread.length&&!shapes.length)shapes=l.collisions.filter(v=>v.geometry.type!=='mesh'||meshes[resolve(v.geometry.filename)]);
      for(const v of shapes){const g=v.geometry,colour=new T.Color(...(v.colour||[.62,.65,.7])),make=geo=>new T.Mesh(geo,new T.MeshStandardMaterial({color:colour}));let object=null;
        if(g.type==='box')object=make(new T.BoxGeometry(...g.size));
        // Cylinders and capsules run along their own z (Three.js builds them along y).
        else if(g.type==='cylinder'){const c=new T.CylinderGeometry(g.radius,g.radius,g.length,32);c.rotateX(Math.PI/2);object=make(c);}
        else if(g.type==='capsule'){const c=new T.CapsuleGeometry(g.radius,g.length,8,24);c.rotateX(Math.PI/2);object=make(c);}
        else if(g.type==='sphere')object=make(new T.SphereGeometry(g.radius,24,16));
        else if(g.type==='ellipsoid'){const s=new T.SphereGeometry(1,24,16);s.scale(...g.radii);object=make(s);}
        else if(g.type==='cone'){const c=new T.ConeGeometry(g.radius,g.length,32);c.rotateX(Math.PI/2);object=make(c);}
        // A mesh written in the file itself (USD): its points and triangles.
        else if(g.type==='triangles'){const b=new T.BufferGeometry();b.setAttribute('position',new T.Float32BufferAttribute(g.positions,3));b.setIndex(g.indices);b.computeVertexNormals();object=make(b);}
        else{const read=meshes[resolve(g.filename)];if(!read)continue;object=read.isObject3D?read.clone(true):make(read);object.scale.set(...g.scale);}
        const holder=new T.Group();holder.matrixAutoUpdate=false;holder.matrix.fromArray(v.matrix);holder.add(object);node.add(holder);}}
    group.updateMatrixWorld(true);return {group,missing};
  }
  // Mesh files the description names, for the main process to find and read.
  const meshFiles=d=>[...new Set(d.links.flatMap(l=>[...l.visuals,...l.collisions]).filter(v=>v.geometry.type==='mesh').map(v=>v.geometry.filename))];
  // Which reader a file needs: by extension, and for .xml by its root element.
  function kindOf(name,text){const ext=String(name).toLowerCase().replace(/^.*\./,'.');if(ext==='.sdf'||ext==='.world')return 'sdf';if(ext==='.mjcf')return 'mjcf';
    if(ext==='.usda'||ext==='.usd')return String(text||'').startsWith('#usda')?'usd':'usd-binary';if(ext==='.usdc'||ext==='.usdz')return 'usd-binary';
    if(ext==='.xml'){const head=String(text||'').replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g,'').trimStart();return head.startsWith('<mujoco')?'mjcf':head.startsWith('<sdf')?'sdf':head.startsWith('<robot')?'urdf':null;}return null;}
  const parse=(kind,text)=>kind==='sdf'?parseSdf(text):kind==='usd'?parseUsda(text):parseMjcf(text);
  return {parse,parseSdf,parseMjcf,parseUsda,parseXml,toKinematics,buildScene,meshFiles,kindOf,IN_PER_M};
});
