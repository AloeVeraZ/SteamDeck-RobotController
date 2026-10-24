(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.DeckRobotModel=model;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // The team's robot model: one rigid body (every imported part merged, no joints), oriented by
  // which model side is the FRONT and which is the TOP, sitting on the floor and centred on the
  // collision footprint. It is visual only: collisions and planning use the footprint settings.
  // Robot frame: +X front, +Y left, +Z up (inches).
  const AXES={'+x':[1,0,0],'-x':[-1,0,0],'+y':[0,1,0],'-y':[0,-1,0],'+z':[0,0,1],'-z':[0,0,-1]};
  const UNITS={in:1,mm:1/25.4,cm:1/2.54,m:39.3701};
  // Robot-frame directions, named as the view cube shows them.
  const SIDES={front:[1,0,0],back:[-1,0,0],left:[0,1,0],right:[0,-1,0],top:[0,0,1],bottom:[0,0,-1]};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const axisName=v=>Object.keys(AXES).find(k=>dot(AXES[k],v)>.5);
  function orientation(raw){
    const front=Object.hasOwn(AXES,raw?.front)?raw.front:'+x',top=Object.hasOwn(AXES,raw?.top)?raw.top:'+z';
    return Math.abs(dot(AXES[front],AXES[top]))>.5?{front:'+x',top:'+z'}:{front,top};
  }
  // Rows F, L, T: the model axes that become robot front, left and top.
  function rows(o){const {front,top}=orientation(o),F=AXES[front],T=AXES[top];return [F,cross(T,F),T];}
  // Which model axis currently shows on a robot-frame side (e.g. what the cube calls "left").
  function modelAxisAt(o,side){const d=SIDES[side],[F,L,T]=rows(o);return axisName([0,1,2].map(i=>d[0]*F[i]+d[1]*L[i]+d[2]*T[i]));}
  // Make the model side now showing at `side` the robot's front (or top), keeping the other choice
  // when it stays perpendicular and otherwise taking the previous one.
  function setFront(o,side){const cur=orientation(o),axis=modelAxisAt(cur,side);return Math.abs(dot(AXES[axis],AXES[cur.top]))>.5?{front:axis,top:cur.front}:{front:axis,top:cur.top};}
  function setTop(o,side){const cur=orientation(o),axis=modelAxisAt(cur,side);return Math.abs(dot(AXES[axis],AXES[cur.front]))>.5?{front:cur.top,top:axis}:{front:cur.front,top:axis};}
  function assignSide(o,side,target){const cur=orientation(o),axis=AXES[modelAxisAt(cur,side)],wanted=axis.map(v=>v*(['back','right','bottom'].includes(target)?-1:1));
    const perpendicular=preferred=>[preferred,'+z','+x','+y'].find(a=>Math.abs(dot(wanted,AXES[a]))<.5);
    if(target==='front'||target==='back')return {front:axisName(wanted),top:perpendicular(cur.top)};
    if(target==='top'||target==='bottom')return {front:perpendicular(cur.front),top:axisName(wanted)};
    const top=perpendicular(cur.top);return {front:axisName(cross(wanted,AXES[top])),top};
  }
  // Quarter turns counterclockwise (seen from above) that carry the model, in the robot frame, from orientation a
  // to orientation b; null when the top changed too (then its sides do not simply turn).
  function turnBetween(a,b){const [Fa,,Ta]=rows(a),[Fb,Lb,Tb]=rows(b);if(dot(Ta,Tb)<.5)return null;
    return ((Math.round(Math.atan2(dot(Lb,Fa),dot(Fb,Fa))/(Math.PI/2))%4)+4)%4;}
  function meta(raw){
    if(!raw||typeof raw.id!=='string'||!/^[0-9a-f]{32}\.glb$/.test(raw.id))return null;
    const parts=Array.isArray(raw.parts)?raw.parts.slice(0,64).filter(p=>p&&Array.isArray(p.box)&&p.box.length===6&&p.box.every(Number.isFinite)).map(p=>({name:String(p.name||'').slice(0,80),role:['chassis','intake','shooter','indexer'].includes(p.role)?p.role:'other',
      ...(['pollen','nectar','both'].includes(p.pieces)?{pieces:p.pieces}:{}),...(['turret','fixed'].includes(p.type)?{type:p.type}:{}),...(['sweeper','siderollers','ramp'].includes(p.kind)?{kind:p.kind}:{}),...(typeof p.key==='string'?{key:p.key.slice(0,400)}:{}),...(p.chosen===true?{chosen:true}:{}),box:p.box.slice()})):[];
    return {id:raw.id,name:String(raw.name||'Robot model').slice(0,120),units:Object.hasOwn(UNITS,raw.units)?raw.units:'in',...orientation(raw),source:raw.source==='step'?'step':'mesh',...(parts.length?{parts}:{}),...(raw.autoSize===true?{autoSize:true}:{}),...(raw.bodyChassis===true?{bodyChassis:true}:{}),...(Array.isArray(raw.entered)?{entered:raw.entered.filter(k=>['mass','wheel','rpm'].includes(k))}:{})};
  }
  let THREE=null;
  function three(){if(!THREE){THREE=globalThis.DeckThree;if(!THREE)throw Error('3D library not loaded.');}return THREE;}
  // ---- one body -------------------------------------------------------------------------
  function geometryFromArrays(m){
    const {THREE:T}=three(),g=new T.BufferGeometry(),colors=new Float32Array(m.colors.length);for(let i=0;i<colors.length;i++)colors[i]=m.colors[i]/255;
    g.setAttribute('position',new T.BufferAttribute(m.positions,3));g.setAttribute('color',new T.BufferAttribute(colors,3));g.setIndex(new T.BufferAttribute(m.index,1));
    // Which part each vertex belongs to, and the assembly tree, so the team can click a part and say what it is.
    if(m.part?.length===m.positions.length/3&&m.tree?.nodes)g.setAttribute('_part',new T.BufferAttribute(m.part,1));if(m.tree?.nodes)g.userData.parts=m.tree;
    if(m.normals&&m.normals.some(v=>v!==0))g.setAttribute('normal',new T.BufferAttribute(m.normals,3));else g.computeVertexNormals();return g;
  }
  async function parseMesh(format,bytes){
    const L=three(),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    if(format==='stl')return new L.THREE.Mesh(new L.STLLoader().parse(buffer),new L.THREE.MeshStandardMaterial({color:0x9aa4b2}));
    if(format==='obj')return new L.OBJLoader().parse(new TextDecoder().decode(buffer));
    const loader=new L.GLTFLoader();loader.setMeshoptDecoder(L.MeshoptDecoder);
    return new Promise((resolve,reject)=>loader.parse(format==='gltf'?new TextDecoder().decode(buffer):buffer,'',gltf=>resolve(gltf.scene),e=>reject(Error('That model could not be read: '+(e?.message||e)))));
  }
  // Every mesh in the file, in its placed position, with its colour baked per vertex, merged.
  function mergeObject(object){
    const L=three(),T=L.THREE,parts=[],nodes=[],leaf=[],keys=new Map();object.updateMatrixWorld(true);
    const nodeOf=o=>{if(!o||o===object)return -1;const parent=nodeOf(o.parent);if(!o.name)return parent;const k=parent+'/'+o.name;let i=keys.get(k);if(i===undefined){i=nodes.length;keys.set(k,i);nodes.push({name:o.name.slice(0,80),parent});}return i;};
    object.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes.position)return;
      let g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);if(g.index)g=g.toNonIndexed();
      const count=g.attributes.position.count,color=new Float32Array(count*3),src=g.attributes.color,mat=[].concat(o.material)[0],base=mat?.color||new T.Color(.62,.65,.7);
      for(let i=0;i<count;i++){color[i*3]=src?src.getX(i):base.r;color[i*3+1]=src?src.getY(i):base.g;color[i*3+2]=src?src.getZ(i):base.b;}
      const clean=new T.BufferGeometry();clean.setAttribute('position',g.attributes.position);clean.setAttribute('color',new T.BufferAttribute(color,3));
      let at=nodeOf(o);if(at<0){at=nodes.length;nodes.push({name:'Part '+(leaf.length+1),parent:-1});}clean.setAttribute('_part',new T.BufferAttribute(new Float32Array(count).fill(leaf.length),1));leaf.push(at);parts.push(clean);});
    if(!parts.length)throw Error('That file has no 3D geometry.');
    const merged=L.mergeGeometries(parts,false);merged.computeVertexNormals();merged.userData.parts={nodes,leaf};return merged;
  }
  async function bodyFromImport(result){
    if(result.kind==='step')return {geometry:geometryFromArrays(result),parts:result.parts,units:'in',source:'step',groups:Array.isArray(result.groups)?result.groups:[]};
    const object=await parseMesh(result.format,result.bytes);let parts=0;object.traverse(o=>{if(o.isMesh)parts++;});
    return {geometry:mergeObject(object),parts,units:result.format==='stl'?'mm':result.format==='obj'?'mm':'m',source:'mesh'};
  }
  function material(){const {THREE:T}=three();return new T.MeshStandardMaterial({vertexColors:true,roughness:.65,metalness:.05});}
  async function toGlb(geometry){
    const L=three(),mesh=new L.THREE.Mesh(geometry,material());
    return new Promise((resolve,reject)=>new L.GLTFExporter().parse(mesh,buffer=>resolve(new Uint8Array(buffer)),e=>reject(Error('Could not store the model: '+(e?.message||e))),{binary:true}));
  }
  async function fromGlb(bytes){const scene=await parseMesh('glb',bytes);let geometry=null;scene.traverse(o=>{if(o.isMesh&&!geometry)geometry=o.geometry;});if(!geometry)throw Error('Stored model is empty.');return geometry;}
  // ---- parts: what the team clicks ---------------------------------------------------------
  // The assembly tree of a stored body: each node's key (names from the top, joined by "/"), children and parts.
  function partTree(geometry){
    const t=geometry?.userData?.parts,attr=geometry?.attributes?._part;if(!t?.nodes?.length||!attr)return null;
    const nodes=t.nodes.map((n,i)=>({index:i,name:n.name,parent:n.parent,children:[],meshes:[]}));
    for(const n of nodes){n.key=n.parent>=0?null:n.name;if(n.parent>=0)nodes[n.parent]?.children.push(n);}
    const keyOf=n=>n.key??=(keyOf(nodes[n.parent])+'/'+n.name);for(const n of nodes)keyOf(n);
    (t.leaf||[]).forEach((at,mesh)=>nodes[at]?.meshes.push(mesh));
    // The top: the first level that splits the robot into several assemblies.
    let top=nodes.filter(n=>n.parent<0);while(top.length===1&&top[0].children.length&&!top[0].meshes.length)top=top[0].children;
    const under=n=>{const out=new Set(n.meshes);for(const c of n.children)for(const m of under(c))out.add(m);return out;};
    return {nodes,top,under,byKey:new Map(nodes.map(n=>[n.key,n])),
      // The node a part (mesh) sits in at the level below `inside` (or at the top), for click-to-select then click-to-go-in.
      at(mesh,inside=null){let n=nodes[t.leaf[mesh]];if(!n)return null;const chain=[];for(let x=n;x;x=x.parent>=0?nodes[x.parent]:null)chain.unshift(x);
        const i=inside?chain.indexOf(inside):-1,start=i>=0?i:chain.findIndex(x=>top.includes(x))-1;return chain[start+1]||chain.at(-1);}};
  }
  // The box of some parts (in the model file's frame and units), as [x0,y0,z0,x1,y1,z1].
  function meshesBox(geometry,meshes){
    const p=geometry.attributes.position,a=geometry.attributes._part,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<p.count;i++){if(!meshes.has(a.getX(i)))continue;const v=[p.getX(i),p.getY(i),p.getZ(i)];for(let k=0;k<3;k++){if(v[k]<lo[k])lo[k]=v[k];if(v[k]>hi[k])hi[k]=v[k];}}
    return lo.every(Number.isFinite)?[...lo,...hi].map(v=>+v.toFixed(3)):null;
  }
  // The named CAD parts as boxes in the robot frame (inches: x forward and y left from the chassis center, or
  // the whole model's when there is no chassis part; z up from the model's bottom).
  function partBoxes(m){
    if(!Array.isArray(m?.parts)||!m.parts.length)return null;
    const [F,L,T]=rows(m),s=UNITS[m.units]||1,to=p=>[dot(F,p)*s,dot(L,p)*s,dot(T,p)*s];
    const boxes=m.parts.map(p=>{const c=[];for(const x of [p.box[0],p.box[3]])for(const y of [p.box[1],p.box[4]])for(const z of [p.box[2],p.box[5]])c.push(to([x,y,z]));
      return {...p,lo:[0,1,2].map(i=>Math.min(...c.map(v=>v[i]))),hi:[0,1,2].map(i=>Math.max(...c.map(v=>v[i])))};});
    const union=list=>({lo:[0,1,2].map(i=>Math.min(...list.map(b=>b.lo[i]))),hi:[0,1,2].map(i=>Math.max(...list.map(b=>b.hi[i])))}),{lo,hi}=union(boxes),body=boxes.filter(b=>b.role!=='intake');
    // No assembly named Chassis: in CAD imported since setups gained chassis hitboxes (bodyChassis), the chassis is
    // every part except the intakes, so an intake that sticks out stays outside the robot's size and hitbox.
    const chassis=boxes.find(b=>b.role==='chassis')||(m.bodyChassis&&body.length&&body.length<boxes.length?{name:'All parts except the intakes',derived:true,...union(body)}:null),ref=chassis||{lo,hi};
    const cx=(ref.lo[0]+ref.hi[0])/2,cy=(ref.lo[1]+ref.hi[1])/2,floor=lo[2];
    return {chassis:chassis?{x:cx,y:cy,length:chassis.hi[0]-chassis.lo[0],width:chassis.hi[1]-chassis.lo[1],...(chassis.derived?{name:chassis.name,derived:true}:{})}:null,extent:{length:hi[0]-lo[0],width:hi[1]-lo[1]},
      parts:boxes.map(({lo:a,hi:b,box:_,...p})=>({...p,box:{x0:a[0]-cx,x1:b[0]-cx,y0:a[1]-cy,y1:b[1]-cy,z0:a[2]-floor,z1:b[2]-floor}}))};
  }
  // The body in the robot frame: scaled to inches, oriented, bottom on the floor, centred on the footprint
  // (on its chassis part when the CAD names one, so intakes that stick out stay where they are).
  function place(geometry,m,footprint){
    const {THREE:T}=three(),[F,L,Up]=rows(m),s=UNITS[m.units]||1,rot=new T.Matrix4().set(F[0],F[1],F[2],0,L[0],L[1],L[2],0,Up[0],Up[1],Up[2],0,0,0,0,1);
    const mesh=geometry.isObject3D?geometry.clone(true):new T.Mesh(geometry,material()),inner=new T.Group(),holder=new T.Group();
    const transform=new T.Group();transform.matrixAutoUpdate=false;transform.matrix.copy(new T.Matrix4().makeScale(s,s,s).premultiply(rot));transform.add(mesh);inner.add(transform);holder.add(inner);
    // Measure after the scale and rotation reach the world matrices.
    holder.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(holder),c=box.getCenter(new T.Vector3()),f=footprint||{front:9,rear:9,half:9};
    const size=box.getSize(new T.Vector3()),chassis=partBoxes(m)?.chassis,fit=chassis||{x:c.x,y:c.y,length:size.x,width:size.y};
    const sx=2*f.rear/Math.max(fit.length,.001),sy=2*f.half/Math.max(fit.width,.001);
    inner.scale.set(sx,sy,1);inner.position.set(-fit.x*sx,-fit.y*sy,-box.min.z);holder.updateMatrixWorld(true);
    holder.userData.modelScale={x:sx,y:sy,F,L,c:{x:fit.x,y:fit.y}};holder.userData.nativeSize={length:size.x,width:size.y,height:size.z};holder.userData.size={length:2*f.rear,width:2*f.half,height:size.z};return holder;
  }
  async function builtin(bytes,meta){
    const {THREE:T}=three(),scene=await parseMesh('glb',bytes),wheels=[],podParts=[];scene.traverse(o=>{if(o.userData.deckWheel)wheels.push(o);if(o.userData.deckSteerBody)podParts.push(o);if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.material.roughness=.52;o.material.metalness=.28;}});
    for(const wheel of wheels){const spec=wheel.userData.deckWheel,location=wheel.position.clone();
      if(spec.kind==='swerve'){const steer=new T.Group();steer.name='DeckSteer';steer.position.copy(location);steer.userData.deckSteer={x:location.x,y:location.y};wheel.parent.add(steer);steer.add(wheel);wheel.position.set(0,0,0);scene.updateMatrixWorld(true);for(const part of podParts)if(part.userData.deckSteerBody.pod===wheel.name)steer.attach(part);}
      wheel.userData.deckWheel={...spec,x:location.x,y:location.y,angle:0,driven:meta?.id!=='swechanum'||spec.kind==='swerve'};
    }
    scene.userData.builtin=meta?.id;return scene;
  }
  // Only the two curated CAD assets carry deckWheel metadata. User imports have none. Wheel
  // speeds come from actual chassis velocity at each wheel, including the yaw contribution.
  function animate(holder,frame){
    if(!frame?.truth)return;const {THREE:T}=three(),t=frame.truth,h=t.heading*Math.PI/180,f=t.vx*Math.cos(h)+t.vy*Math.sin(h),left=-t.vx*Math.sin(h)+t.vy*Math.cos(h),omega=t.omega*Math.PI/180;
    const previous=holder.userData.animationTime,dt=previous===undefined?0:Math.max(0,Math.min(.1,frame.time-previous));holder.userData.animationTime=frame.time;
    let scale=holder.userData.modelScale;holder.traverse(o=>{if(o.userData.modelScale)scale=o.userData.modelScale;});scale=scale||{x:1,y:1};
    const F=scale.F||[1,0,0],L=scale.L||[0,1,0],centre=scale.c||{x:0,y:0},velocity=w=>{const x=(F[0]*w.x+F[1]*w.y-centre.x)*scale.x,y=(L[0]*w.x+L[1]*w.y-centre.y)*scale.y,vx=(f-omega*y)/scale.x,vy=(left+omega*x)/scale.y;return {vx:vx*F[0]+vy*L[0],vy:vx*F[1]+vy*L[1]};};
    holder.traverse(o=>{const s=o.userData.deckSteer;if(s){const {vx,vy}=velocity(s);if(Math.hypot(vx,vy)>.1)o.rotation.z=Math.atan2(vy,vx)-Math.PI/2;}
      const w=o.userData.deckWheel;if(!w||w.driven===false)return;const {vx,vy}=velocity(w),power=w.kind==='swerve'?Math.hypot(vx,vy):vx-Math.sign(w.x*w.y)*vy;
      w.angle=(w.angle+power*dt/w.radius)%(Math.PI*2);o.quaternion.setFromAxisAngle(new T.Vector3(...w.axis),w.angle);
    });
  }
  // Top-down picture of the placed body for the 2D field, with its extent in robot inches.
  function silhouette(holder){
    // A top-down render of the model (the 2D field shows it in place of the plain robot shape).
    const {THREE:T}=three(),box=new T.Box3().setFromObject(holder),ppi=16,w=Math.max(8,Math.min(2048,Math.round((box.max.x-box.min.x)*ppi))),h=Math.max(8,Math.min(2048,Math.round((box.max.y-box.min.y)*ppi)));
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(w,h,false);renderer.setClearColor(0,0);
    const scene=new T.Scene(),camera=new T.OrthographicCamera(box.min.x,box.max.x,box.max.y,box.min.y,.1,1000);camera.up.set(0,1,0);camera.position.set(0,0,box.max.z+50);camera.lookAt(0,0,0);
    scene.add(new T.HemisphereLight(0xffffff,0x555555,2.4),holder.clone());const sun=new T.DirectionalLight(0xffffff,1.2);sun.position.set(30,-30,100);scene.add(sun);
    renderer.render(scene,camera);const url=renderer.domElement.toDataURL('image/png');renderer.dispose();renderer.forceContextLoss?.();
    return {url,x0:box.min.x,x1:box.max.x,y0:box.min.y,y1:box.max.y};
  }
  // ---- preview with a view cube ---------------------------------------------------------
  // One closed beveled solid: six faces, twelve edges and eight corners, all clickable.
  // Projection from the camera keeps the widget aligned without overlapping CSS planes.
  function cubeGeometry(){
    const a=27,b=21,out=[];
    for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1]){
      const direction=[x,y,z],axes=[0,1,2].filter(i=>direction[i]),count=axes.length;if(!count)continue;
      const length=Math.hypot(...direction),normal=direction.map(v=>v/length),side=Object.keys(SIDES).find(k=>SIDES[k].every((v,i)=>v===direction[i])),name=side||direction.map((v,i)=>v?Object.keys(SIDES).find(k=>SIDES[k][i]===v):'').filter(Boolean).join(' ');
      let vertices,right,up;
      if(count===1){up=Math.abs(z)===1?[1,0,0]:[0,0,1];right=cross(up,normal);up=cross(normal,right);vertices=[[-b,-b],[b,-b],[b,b],[-b,b]].map(([u,v])=>normal.map((n,i)=>n*a+right[i]*u+up[i]*v));}
      else if(count===2){const [i,j]=axes,k=[0,1,2].find(n=>!axes.includes(n));vertices=[[a,b,-b],[a,b,b],[b,a,b],[b,a,-b]].map(([u,v,w])=>{const p=[0,0,0];p[i]=direction[i]*u;p[j]=direction[j]*v;p[k]=w;return p;});}
      else vertices=axes.map(i=>direction.map((v,j)=>v*(i===j?a:b)));
      const edge=(p,q)=>q.map((v,i)=>v-p[i]);if(dot(cross(edge(vertices[0],vertices[1]),edge(vertices[0],vertices[2])),normal)<0)vertices.reverse();
      const centre=[0,1,2].map(i=>vertices.reduce((sum,p)=>sum+p[i],0)/vertices.length);out.push({direction,normal,side:side||null,name,kind:count===1?'face':count===2?'edge':'corner',vertices,centre,right,up});
    }
    return out;
  }
  function orbitCamera(camera,controls,dx,dy){
    if(!Number.isFinite(dx)||!Number.isFinite(dy))return;const {THREE:T}=three(),q=new T.Quaternion().setFromUnitVectors(camera.up,new T.Vector3(0,1,0)),offset=camera.position.clone().sub(controls.target).applyQuaternion(q),s=new T.Spherical().setFromVector3(offset);
    s.theta=Math.max(controls.minAzimuthAngle??-Infinity,Math.min(controls.maxAzimuthAngle??Infinity,s.theta-dx*.008));s.phi=Math.max(Math.max(.001,controls.minPolarAngle??0),Math.min(Math.min(Math.PI-.001,controls.maxPolarAngle??Math.PI),s.phi-dy*.008));
    camera.position.copy(new T.Vector3().setFromSpherical(s).applyQuaternion(q.invert())).add(controls.target);camera.lookAt(controls.target);controls.update();
  }
  function viewCube(host,onView,{orbit,controls}={}){
    const ns='http://www.w3.org/2000/svg',node=(tag,attrs={})=>{const el=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);return el;};
    host.classList.add('view-cube');host.innerHTML='<svg class="view-cube-svg" viewBox="-48 -48 96 96" aria-label="View orientation"><g class="cube"></g></svg><button type="button" class="cube-home" aria-label="Isometric home view" title="Isometric home view"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg></button>';
    const cube=host.querySelector('.cube'),surface=host.querySelector('.view-cube-svg'),home=host.querySelector('.cube-home'),parts=cubeGeometry(),listeners=[];
    const listen=(target,type,handler,options)=>{target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options));};
    let drag=null,disposed=false,suppressClick=false;
    const select=part=>{for(const p of parts){const selected=p===part;p.element.classList.toggle('selected',selected);p.element.setAttribute('aria-pressed',String(selected));}};
    const choose=part=>{select(part);onView(part.direction.slice(),part.side);};
    for(const part of parts){const g=node('g',{class:'cube-part '+part.kind,role:'button',tabindex:'0','aria-label':part.name+' view','aria-pressed':'false'});if(part.side)g.dataset.side=part.side;
      const title=node('title');title.textContent=part.name+' view';g.append(title);g.append(node('polygon'));if(part.side){const text=node('text',{'text-anchor':'middle',y:'2.5'});text.textContent=part.side.toUpperCase();g.append(text);part.label=text;}
      part.element=g;cube.append(g);listen(g,'click',event=>{if(event.detail>0||suppressClick)return;choose(part);});listen(g,'keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(part);}});
    }
    listen(home,'click',()=>{select(null);onView([1,-1,.8],null);});
    surface.setAttribute('aria-description','Click a face, edge or corner to choose a view. Hold and drag to orbit. Escape releases the cursor.');
    function finish(cancel=false){if(!drag)return;const previous=drag;drag=null;host.classList.remove('orbiting');host.dataset.orbiting='false';if(controls)controls.enabled=previous.enabled;
      try{if(host.hasPointerCapture(previous.pointerId))host.releasePointerCapture(previous.pointerId);}catch{}
      if(document.pointerLockElement===host)document.exitPointerLock();
      suppressClick=true;setTimeout(()=>{suppressClick=false;},0);if(!cancel&&!previous.moved&&previous.part)choose(previous.part);
    }
    function move(dx,dy){if(!drag||!Number.isFinite(dx)||!Number.isFinite(dy))return;drag.travel+=Math.hypot(dx,dy);drag.dx+=dx;drag.dy+=dy;
      if(!drag.moved&&drag.travel<3)return;drag.moved=true;select(null);orbit?.(drag.dx,drag.dy);drag.dx=drag.dy=0;
    }
    listen(surface,'pointerdown',event=>{if(event.button!==0||drag||document.pointerLockElement&&document.pointerLockElement!==host)return;event.preventDefault();
      const el=event.target.closest?.('.cube-part'),part=parts.find(p=>p.element===el);drag={pointerId:event.pointerId,part,travel:0,dx:0,dy:0,x:event.clientX,y:event.clientY,moved:false,enabled:controls?.enabled,locked:false};const attempt=drag;
      if(controls)controls.enabled=false;host.classList.add('orbiting');host.dataset.orbiting='true';surface.focus?.({preventScroll:true});try{host.setPointerCapture(event.pointerId);}catch{}
      if(event.pointerType==='mouse'&&host.requestPointerLock){try{const request=host.requestPointerLock();request?.then?.(()=>{if(disposed||drag!==attempt){if(document.pointerLockElement===host)document.exitPointerLock();}}).catch(()=>{});}catch{}}
    });
    listen(host,'pointermove',event=>{if(!drag||document.pointerLockElement===host)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;move(dx,dy);});
    listen(document,'mousemove',event=>{if(drag&&document.pointerLockElement===host)move(event.movementX,event.movementY);});
    listen(document,'pointerup',event=>{if(drag&&event.pointerId===drag.pointerId&&event.button===0)finish();});
    listen(document,'mouseup',event=>{if(drag&&event.button===0)finish();});
    listen(document,'pointercancel',()=>finish(true));listen(window,'blur',()=>finish(true));
    listen(document,'pointerlockchange',()=>{if(!drag)return;if(document.pointerLockElement===host)drag.locked=true;else if(drag.locked)finish(true);});
    listen(host,'keydown',event=>{if(event.key==='Escape')return finish(true);if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();select(null);const delta=(event.shiftKey?90:event.ctrlKey?5:15)*Math.PI/180/.008;orbit?.(event.key==='ArrowLeft'?-delta:event.key==='ArrowRight'?delta:0,event.key==='ArrowUp'?-delta:event.key==='ArrowDown'?delta:0);});
    return {update(camera){const {THREE:T}=three();camera.updateMatrixWorld();const rotation=new T.Matrix4().extractRotation(camera.matrixWorldInverse),project=p=>new T.Vector3(...p).applyMatrix4(rotation);
      for(const part of parts){const n=project(part.normal),visible=n.z>1e-5;part.element.style.display=visible?'':'none';part.element.setAttribute('aria-hidden',String(!visible));part.element.setAttribute('tabindex',visible?'0':'-1');if(!visible)continue;
        const c=project(part.centre);part.depth=c.z;part.element.querySelector('polygon').setAttribute('points',part.vertices.map(v=>{const p=project(v);return `${p.x},${-p.y}`;}).join(' '));
        if(part.label){const r=project(part.right),u=project(part.up);part.label.setAttribute('transform',`matrix(${r.x} ${-r.y} ${-u.x} ${u.y} ${c.x} ${-c.y})`);}
      }
      for(const part of parts.filter(p=>p.element.style.display!=='none').sort((a,b)=>a.depth-b.depth))cube.append(part.element);
    },dispose(){disposed=true;finish(true);for(const remove of listeners)remove();}};
  }
  function preview(host,{onSide}={}){
    const L=three(),T=L.THREE;
    host.innerHTML='<div class="model-view"><div class="model-canvas"></div><div class="view-cube" aria-label="Robot view cube"></div></div>';
    const box=host.querySelector('.model-canvas'),cubeHost=host.querySelector('.view-cube');let renderer;
    try{renderer=new T.WebGLRenderer({antialias:true,alpha:true});}catch{box.textContent='3D preview needs WebGL.';return {update(){},look(){},dispose(){}};}
    renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));box.append(renderer.domElement);
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,.5,2000);camera.up.set(0,0,1);
    const controls=new L.OrbitControls(camera,renderer.domElement);controls.enablePan=false;
    const navigator=viewCube(cubeHost,(direction,side)=>{look(direction);onSide?.(side);},{controls,orbit:(dx,dy)=>{orbitCamera(camera,controls,dx,dy);onSide?.(null);draw();}});
    scene.add(new T.HemisphereLight(0xffffff,0x4b525c,2.3));const sun=new T.DirectionalLight(0xffffff,1.4);sun.position.set(40,-30,60);scene.add(sun);
    const grid=new T.GridHelper(36,12,0x888888,0x888888);grid.rotation.x=Math.PI/2;grid.material.transparent=true;grid.material.opacity=.25;scene.add(grid);
    const floorMaterials=[new T.MeshStandardMaterial({color:0xabb3bc,transparent:true,opacity:.12,side:T.DoubleSide}),new T.MeshStandardMaterial({color:0x707b89,transparent:true,opacity:.12,side:T.DoubleSide})];for(let x=-18,i=0;x<18;x+=6,i++)for(let y=-18,j=0;y<18;y+=6,j++){const tile=new T.Mesh(new T.PlaneGeometry(6,6),floorMaterials[(i+j)%2]);tile.position.set(x+3,y+3,-.04);scene.add(tile);}
    let body=null,bodyKey=null,outline=null,raf=0,radius=18;
    function frame(){raf=0;const w=Math.max(1,box.clientWidth),h=Math.max(1,box.clientHeight),size=renderer.getSize(new T.Vector2());if(size.x!==w||size.y!==h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
      controls.update();renderer.render(scene,camera);
      // The cube shows the robot frame the way the camera sees it (CSS y points down).
      navigator.update(camera);}
    const draw=()=>{if(!raf)raf=requestAnimationFrame(frame);};controls.addEventListener('change',draw);
    // Straight up/down is degenerate for orbit controls, so top/bottom views tilt a hair.
    function look(side){const d=Array.isArray(side)?[...side]:side==='top'?[-.02,0,1]:side==='bottom'?[-.02,0,-1]:SIDES[side]||[1,-1,.8];if(!d[0]&&!d[1])d[0]=-.0001;const dir=new T.Vector3(...d).normalize();
      const aspect=Math.max(.1,box.clientWidth/Math.max(1,box.clientHeight)),halfAngle=Math.atan(Math.tan(camera.fov*Math.PI/360)*Math.min(1,aspect));
      camera.position.copy(dir.multiplyScalar(radius*1.12/Math.sin(halfAngle))).add(controls.target);controls.update();draw();}
    function update(holder,footprint){
      if(body){scene.remove(body);}body=holder?holder.clone():null;if(body)scene.add(body);
      if(outline){scene.remove(outline);outline.geometry.dispose();}const f=footprint||{front:9,rear:9,half:9};
      const pts=[[f.front,f.half],[-f.rear,f.half],[-f.rear,-f.half],[f.front,-f.half],[f.front,f.half]].map(([x,y])=>new T.Vector3(x,y,.05));
      outline=new T.Line(new T.BufferGeometry().setFromPoints([...pts,new T.Vector3(f.front,0,.05),new T.Vector3(f.front+4,0,.05)]),new T.LineBasicMaterial({color:0xe5484d}));scene.add(outline);
      const size=holder?.userData.size||{length:18,width:18,height:12},oldRadius=radius;radius=Math.max(10,Math.hypot(size.length,size.width,size.height)/2);controls.target.set(0,0,size.height/3);camera.far=Math.max(2000,radius*10);camera.updateProjectionMatrix();
      controls.minDistance=radius*1.2;controls.maxDistance=radius*7;
      if(bodyKey!==holder?.uuid||!update.looked||Math.abs(radius-oldRadius)>radius*.2){bodyKey=holder?.uuid;update.looked=true;for(const face of cubeHost.querySelectorAll('.cube-part'))face.classList.remove('selected');look(null);}draw();
    }
    // Picking a point on the model (a click that did not orbit), in the robot frame (inches; x forward,
    // y left, z up), and coloured markers for placed parts.
    let picker=null,down=null;const ray=new T.Raycaster(),markerGroup=new T.Group();scene.add(markerGroup);
    renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
    renderer.domElement.addEventListener('pointerup',e=>{
      if(!picker||!down||!body||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;const r=renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObject(body,true)[0],ids=hit?.object.geometry?.attributes._part;
      picker(hit?{x:hit.point.x,y:hit.point.y,z:hit.point.z,part:ids&&hit.face?ids.getX(hit.face.a):null}:null);});
    function pick(fn){picker=fn||null;box.classList.toggle('picking',!!picker);}
    let glow=null,glowKey=null;
    function highlight(meshes,color=0xffb224){
      const mesh=[];body?.traverse(o=>{if(o.isMesh&&o.geometry.attributes._part)mesh.push(o);});const target=mesh[0],key=target&&meshes?.size?target.uuid+':'+[...meshes].join(','):null;
      if(key===glowKey)return;glowKey=key;if(glow){glow.parent?.remove(glow);glow.geometry.dispose();glow.material.dispose();glow=null;}
      if(!key){draw();return;}
      const g=target.geometry,ids=g.attributes._part,src=g.index,out=[];for(let t=0;t<src.count;t+=3)if(meshes.has(ids.getX(src.getX(t))))out.push(src.getX(t),src.getX(t+1),src.getX(t+2));
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',g.attributes.position);geometry.setIndex(out);
      glow=new T.Mesh(geometry,new T.MeshBasicMaterial({color,transparent:true,opacity:.55,depthTest:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));glow.renderOrder=5;target.add(glow);draw();
    }
    function markers(list=[]){
      for(const child of [...markerGroup.children]){markerGroup.remove(child);child.geometry.dispose();child.material.dispose();}
      // A marker is a dot, or a see-through box when it has a size (an intake's hitbox).
      for(const m of list){const shape=m.size?new T.BoxGeometry(...m.size):new T.SphereGeometry(m.radius||1.1,20,14),mark=new T.Mesh(shape,new T.MeshBasicMaterial({color:m.color||0xffffff,depthTest:!m.size?false:true,transparent:true,opacity:m.size?.35:.9}));
        mark.position.set(m.x,m.y,m.z);mark.renderOrder=10;markerGroup.add(mark);
        if(m.size){const edges=new T.LineSegments(new T.EdgesGeometry(shape),new T.LineBasicMaterial({color:m.color||0xffffff}));edges.position.copy(mark.position);edges.renderOrder=11;markerGroup.add(edges);}}
      draw();
    }
    return {update(...a){glowKey=null;glow=null;return update(...a);},look,pick,highlight,markers,resize:draw,select(side){for(const f of cubeHost.querySelectorAll('.face'))f.classList.toggle('selected',f.dataset.side===side);},dispose(){cancelAnimationFrame(raf);navigator.dispose();controls.dispose();renderer.dispose();renderer.forceContextLoss();host.replaceChildren();}};
  }
  return {partTree,meshesBox,partBoxes,AXES,UNITS,SIDES,orientation,rows,modelAxisAt,setFront,setTop,assignSide,turnBetween,meta,bodyFromImport,toGlb,fromGlb,place,silhouette,preview,viewCube,cubeGeometry,orbitCamera,builtin,animate};
});
