(function(root,factory){const value=factory(root);if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckUrdf=value;})(typeof globalThis==='object'?globalThis:this,root=>{
  'use strict';
  // URDF robots: the one common format that carries joints as data. A URDF lists links (each with visual shapes: boxes,
  // cylinders, spheres or meshes) and joints (fixed, revolute, continuous, prismatic, floating, planar), each placing its
  // child link in its parent's frame, with an axis, limits and optionally mimicking another joint. Here a URDF becomes:
  //   * one body, every link drawn where it sits with all joints at zero (that pose is the rest pose), each link its own
  //     part under its parent link, so the body splits along the joints;
  //   * DeckKinematics joints from the file ("metadata": confirmed, not inferred), mimic tags as couplings.
  // URDF lengths are metres and angles radians; the body stays in metres (CAD unit) and joint values are inches and
  // degrees, like every other joint.
  const K=()=>root.DeckKinematics||(typeof require==='function'?require('./sim-kinematics.js'):null);
  const IN_PER_M=39.3700787,DEG=180/Math.PI;
  // ---------------------------------------------------------------- a small XML reader (URDF is plain elements and attributes)
  function parseXml(text){
    const rootNode={name:'#root',attrs:{},children:[],text:''},stack=[rootNode];let i=0;const s=String(text);
    while(i<s.length){
      const lt=s.indexOf('<',i);if(lt<0)break;if(lt>i)stack.at(-1).text+=s.slice(i,lt);
      if(s.startsWith('<!--',lt)){const end=s.indexOf('-->',lt+4);i=end<0?s.length:end+3;continue;}
      if(s.startsWith('<?',lt)||s.startsWith('<!',lt)){const end=s.indexOf('>',lt);i=end<0?s.length:end+1;continue;}
      const gt=s.indexOf('>',lt);if(gt<0)break;const body=s.slice(lt+1,gt).trim();i=gt+1;
      if(body[0]==='/'){if(stack.length>1)stack.pop();continue;}
      const self=body.endsWith('/'),inner=self?body.slice(0,-1).trim():body,m=/^([^\s/>]+)/.exec(inner);if(!m)continue;
      const node={name:m[1],attrs:{},children:[],text:''};const re=/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;let a;
      while((a=re.exec(inner.slice(m[1].length))))node.attrs[a[1]]=(a[3]??a[4]).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
      stack.at(-1).children.push(node);if(!self)stack.push(node);
    }
    return rootNode;
  }
  const kids=(n,name)=>(n?.children||[]).filter(c=>c.name===name),kid=(n,name)=>kids(n,name)[0]||null,txt=n=>(n?.text||'').trim();
  const nums=(v,d)=>{const x=String(v??'').trim().split(/\s+/).map(Number);return x.length===d.length&&x.every(Number.isFinite)?x:d;};
  const origin=n=>({xyz:nums(kid(n,'origin')?.attrs.xyz,[0,0,0]),rpy:nums(kid(n,'origin')?.attrs.rpy,[0,0,0])});
  function geometry(n){
    const g=kid(n,'geometry');if(!g)return null;const box=kid(g,'box'),cyl=kid(g,'cylinder'),sph=kid(g,'sphere'),mesh=kid(g,'mesh');
    if(box)return {type:'box',size:nums(box.attrs.size,[.1,.1,.1])};
    if(cyl)return {type:'cylinder',radius:+cyl.attrs.radius||.05,length:+cyl.attrs.length||.1};
    if(sph)return {type:'sphere',radius:+sph.attrs.radius||.05};
    if(mesh)return {type:'mesh',filename:String(mesh.attrs.filename||''),scale:nums(mesh.attrs.scale,[1,1,1])};
    return null;
  }
  // The robot as data: links with their visual (and collision) shapes, joints, and colours by material name.
  function parse(text){
    const doc=parseXml(text),robot=kid(doc,'robot');if(!robot)throw Error('That is not a URDF robot (no <robot> element).');
    const colours={};const colourOf=m=>{const c=kid(m,'color');return c?nums(c.attrs.rgba,[.62,.65,.7,1]).slice(0,3):null;};
    for(const m of kids(robot,'material')){const c=colourOf(m);if(c)colours[m.attrs.name]=c;}
    const links=kids(robot,'link').map(l=>({name:String(l.attrs.name||''),
      visuals:kids(l,'visual').map(v=>{const m=kid(v,'material');return {origin:origin(v),geometry:geometry(v),colour:m?colourOf(m)||colours[m.attrs.name]||null:null};}).filter(v=>v.geometry),
      collisions:kids(l,'collision').map(c=>({origin:origin(c),geometry:geometry(c)})).filter(c=>c.geometry)}));
    const joints=kids(robot,'joint').map(j=>{const lim=kid(j,'limit'),mim=kid(j,'mimic');return {name:String(j.attrs.name||''),type:String(j.attrs.type||'fixed'),parent:String(kid(j,'parent')?.attrs.link||''),child:String(kid(j,'child')?.attrs.link||''),
      origin:origin(j),axis:nums(kid(j,'axis')?.attrs.xyz,[1,0,0]),...(lim?{limit:{lower:+lim.attrs.lower,upper:+lim.attrs.upper,velocity:+lim.attrs.velocity}}:{}),
      ...(mim?{mimic:{joint:String(mim.attrs.joint||''),multiplier:Number.isFinite(+mim.attrs.multiplier)?+mim.attrs.multiplier:1,offset:Number.isFinite(+mim.attrs.offset)?+mim.attrs.offset:0}}:{})};});
    const names=new Set(links.map(l=>l.name)),children=new Set(joints.map(j=>j.child)),rootLink=links.find(l=>!children.has(l.name))?.name;
    if(!rootLink)throw Error('That URDF has no root link (every link is some joint’s child).');
    for(const j of joints)if(!names.has(j.parent)||!names.has(j.child))throw Error(`Joint “${j.name}” joins a link the URDF does not have.`);
    const drives=[],notes=[];
    for(const t of kids(robot,'transmission')){const js=kids(t,'joint'),as=kids(t,'actuator'),type=txt(kid(t,'type'))||String(t.attrs.type||'');
      if(js.length!==1||as.length!==1){notes.push(`Transmission “${t.attrs.name||''}” (${type||'no type'}) joins ${js.length} joints and ${as.length} actuators; only one-to-one transmissions are read.`);continue;}
      const red=Number(txt(kid(as[0],'mechanicalReduction'))),iface=txt(kid(js[0],'hardwareInterface'))||txt(kid(as[0],'hardwareInterface'));
      drives.push({joint:String(js[0].attrs.name||''),name:String(as[0].attrs.name||js[0].attrs.name||''),reduction:Number.isFinite(red)&&red?red:1,mode:/Velocity/i.test(iface)?'velocity':/Effort/i.test(iface)?'effort':'position'});}
    for(const rc of kids(robot,'ros2_control'))for(const j of kids(rc,'joint')){const name=String(j.attrs.name||''),cmd=kids(j,'command_interface').map(c=>String(c.attrs.name||''));if(!cmd.length||drives.some(d=>d.joint===name))continue;
      drives.push({joint:name,name:name+'_motor',reduction:1,mode:cmd.includes('position')?'position':cmd.includes('velocity')?'velocity':'effort'});}
    return {name:String(robot.attrs.name||'robot'),links,joints,root:rootLink,drives,notes};
  }
  // ---------------------------------------------------------------- frames at zero
  // URDF rpy: fixed-axis roll about x, then pitch about y, then yaw about z: R = Rz(yaw)·Ry(pitch)·Rx(roll).
  function frameOf(o){const M=K().math,[r,p,y]=o.rpy;return M.mul(M.trans(o.xyz),M.mul(M.rot([0,0,1],y*DEG),M.mul(M.rot([0,1,0],p*DEG),M.rot([1,0,0],r*DEG))));}
  // Each link's frame in the robot's (root link's) frame with every joint at zero, parents first.
  function linkFrames(u){
    const M=K().math,out=new Map([[u.root,M.I4()]]),byParent=new Map();for(const j of u.joints){if(!byParent.has(j.parent))byParent.set(j.parent,[]);byParent.get(j.parent).push(j);}
    const order=[u.root];for(let k=0;k<order.length;k++)for(const j of byParent.get(order[k])||[]){if(out.has(j.child))continue;out.set(j.child,M.mul(out.get(j.parent),frameOf(j.origin)));order.push(j.child);}
    return {frames:out,order};
  }
  // ---------------------------------------------------------------- joints from the file
  // The URDF's joints as DeckKinematics joints in the body's frame (metres), confirmed. parts: each link's node key as
  // the body's assembly tree names it (robot / root link / … / link).
  function toKinematics(u,{keyOf}={}){
    const parentLink=new Map(u.joints.map(j=>[j.child,j.parent])),path=n=>{const out=[];for(let x=n,g=0;x&&g<1000;x=parentLink.get(x),g++)out.unshift(x);return out.join('/');};keyOf=keyOf||path;
    const M=K().math,{frames}=linkFrames(u),types={revolute:'revolute',continuous:'continuous',prismatic:'prismatic',fixed:'fixed',floating:'floating',planar:'planar'};
    const idOf=name=>{const s=String(name).replace(/[^\w-]+/g,'_').slice(0,30);return /^[A-Za-z]/.test(s)?s:'j_'+s;},byChild=new Map(u.joints.map(j=>[j.child,j])),ids=new Map();
    for(const j of u.joints){let id=idOf(j.name),n=2;while([...ids.values()].includes(id))id=idOf(j.name).slice(0,26)+'_'+n++;ids.set(j.name,id);}
    const joints=u.joints.map(j=>{const F=M.mul(frames.get(j.parent),frameOf(j.origin)),type=types[j.type]||'fixed',up=byChild.get(j.parent),lin=type==='prismatic';
      const axis=M.unit(M.applyDir(F,M.unit(j.axis))),plane=type==='planar'?{axis2:M.applyDir(F,M.perpendicular(M.unit(j.axis)))}:{};
      const limit=j.limit&&Number.isFinite(j.limit.lower)&&Number.isFinite(j.limit.upper)&&(type==='revolute'||type==='prismatic')?{lower:+(j.limit.lower*(lin?IN_PER_M:DEG)).toFixed(4),upper:+(j.limit.upper*(lin?IN_PER_M:DEG)).toFixed(4)}:{};
      const speed=j.limit&&j.limit.velocity>0?{speed:+(j.limit.velocity*(lin?IN_PER_M:DEG)).toFixed(3)}:{};
      return {id:ids.get(j.name),name:j.name,type,parent:up?ids.get(up.name):null,parts:keyOf?[keyOf(j.child)].filter(Boolean):[],origin:M.apply(F,[0,0,0]),axis,...plane,...limit,...speed,
        drive:{signal:'action'},source:'metadata',confidence:1,note:`From the URDF: ${j.type} joint “${j.name}” (${j.parent} → ${j.child}).`};});
    const couplings=u.joints.filter(j=>j.mimic&&ids.has(j.mimic.joint)).map(j=>{const lin=j.type==='prismatic',from=u.joints.find(x=>x.name===j.mimic.joint),fromLin=from?.type==='prismatic';
      // Mimic: q = multiplier·q_other + offset in SI units; converted to this joint's units from the other's.
      return {kind:'mimic',from:ids.get(j.mimic.joint),to:ids.get(j.name),ratio:j.mimic.multiplier*(lin?IN_PER_M:DEG)/(fromLin?IN_PER_M:DEG),offset:j.mimic.offset*(lin?IN_PER_M:DEG)};});
    for(const c of couplings){const j=joints.find(x=>x.id===c.to);if(j)delete j.drive;}
    // Transmissions and ros2_control joints: actuators on the joints they name, the reduction as their ratio.
    const aid=new Set(),actuators=(u.drives||[]).filter(d=>ids.has(d.joint)&&!couplings.some(c=>c.to===ids.get(d.joint))).map(d=>{let id=String(d.name).replace(/[^\w-]+/g,'_').slice(0,28);if(!/^[A-Za-z]/.test(id))id='a_'+id;
      while(aid.has(id)||[...ids.values()].includes(id))id=('act_'+id).slice(0,30);aid.add(id);const j=u.joints.find(x=>x.name===d.joint),lin=j.type==='prismatic';
      return {id,name:d.name,kind:'dcmotor',joint:ids.get(d.joint),mode:d.mode,ratio:d.reduction,speed:j.limit?.velocity>0?+(j.limit.velocity*(lin?IN_PER_M:DEG)).toFixed(3):lin?6:90};});
    return {unit:IN_PER_M,joints,couplings,actuators};
  }
  // ---------------------------------------------------------------- the body
  // A Three.js group: robot → root link → child links (nested as the joints nest them), each link holding its visual
  // meshes where they sit at zero. meshes: {filename: Object3D or BufferGeometry} for the mesh files that were read.
  // Returns the group and what could not be drawn.
  function buildScene(u,T,{meshes={},resolve=f=>f}={}){
    const M=K().math,{frames,order}=linkFrames(u),group=new T.Group();group.name=u.name;const nodes=new Map(),missing=[];
    const parentOf=new Map(u.joints.map(j=>[j.child,j.parent]));
    for(const name of order){const node=new T.Group();node.name=name;nodes.set(name,node);const p=parentOf.get(name);(p?nodes.get(p):group).add(node);
      // Nested groups each carry their link's frame relative to the parent link's, so world matrices are the zero pose.
      const rel=p?M.mul(M.invert(frames.get(p)),frames.get(name)):frames.get(name);node.matrixAutoUpdate=false;node.matrix.fromArray(rel);}
    for(const link of u.links){const node=nodes.get(link.name);if(!node)continue;
      let shapes=link.visuals;const unread=shapes.filter(v=>v.geometry.type==='mesh'&&!meshes[resolve(v.geometry.filename)]);
      // A visual mesh that could not be read (a Collada file) falls back to the link's collision shapes.
      if(unread.length){missing.push(...unread.map(v=>`${link.name}: ${v.geometry.filename}`));if(unread.length===shapes.length&&link.collisions.length)shapes=link.collisions;else shapes=shapes.filter(v=>!unread.includes(v));}
      for(const v of shapes){const g=v.geometry,colour=new T.Color(...(v.colour||[.62,.65,.7])),make=geo=>new T.Mesh(geo,new T.MeshStandardMaterial({color:colour}));let object=null;
        if(g.type==='box')object=make(new T.BoxGeometry(...g.size));
        // A URDF cylinder runs along its own z.
        else if(g.type==='cylinder'){const c=new T.CylinderGeometry(g.radius,g.radius,g.length,32);c.rotateX(Math.PI/2);object=make(c);}
        else if(g.type==='sphere')object=make(new T.SphereGeometry(g.radius,24,16));
        else{const read=meshes[resolve(g.filename)];if(!read)continue;
          // A mesh keeps its own colours unless the URDF gives one.
          if(read.isObject3D){object=read.clone(true);if(v.colour)object.traverse(o=>{if(o.isMesh)o.material=new T.MeshStandardMaterial({color:colour});});}else object=make(read);
          object.scale.set(...g.scale);}
        const holder=new T.Group();holder.matrixAutoUpdate=false;holder.matrix.fromArray(frameOf(v.origin));holder.add(object);node.add(holder);}}
    group.updateMatrixWorld(true);return {group,missing};
  }
  // Mesh files a URDF names, for the main process to find and read.
  function meshFiles(u){return [...new Set(u.links.flatMap(l=>[...l.visuals,...l.collisions]).filter(v=>v.geometry.type==='mesh').map(v=>v.geometry.filename))];}
  return {parse,parseXml,linkFrames,frameOf,toKinematics,buildScene,meshFiles,IN_PER_M};
});
