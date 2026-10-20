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
  function meta(raw){
    if(!raw||typeof raw.id!=='string'||!/^[0-9a-f]{32}\.glb$/.test(raw.id))return null;
    return {id:raw.id,name:String(raw.name||'Robot model').slice(0,120),units:Object.hasOwn(UNITS,raw.units)?raw.units:'in',...orientation(raw),source:raw.source==='step'?'step':'mesh'};
  }
  let THREE=null;
  function three(){if(!THREE){THREE=globalThis.DeckThree;if(!THREE)throw Error('3D library not loaded.');}return THREE;}
  // ---- one body -------------------------------------------------------------------------
  function geometryFromArrays(m){
    const {THREE:T}=three(),g=new T.BufferGeometry(),colors=new Float32Array(m.colors.length);for(let i=0;i<colors.length;i++)colors[i]=m.colors[i]/255;
    g.setAttribute('position',new T.BufferAttribute(m.positions,3));g.setAttribute('color',new T.BufferAttribute(colors,3));g.setIndex(new T.BufferAttribute(m.index,1));
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
    const L=three(),T=L.THREE,parts=[];object.updateMatrixWorld(true);
    object.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes.position)return;
      let g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);if(g.index)g=g.toNonIndexed();
      const count=g.attributes.position.count,color=new Float32Array(count*3),src=g.attributes.color,mat=[].concat(o.material)[0],base=mat?.color||new T.Color(.62,.65,.7);
      for(let i=0;i<count;i++){color[i*3]=src?src.getX(i):base.r;color[i*3+1]=src?src.getY(i):base.g;color[i*3+2]=src?src.getZ(i):base.b;}
      const clean=new T.BufferGeometry();clean.setAttribute('position',g.attributes.position);clean.setAttribute('color',new T.BufferAttribute(color,3));parts.push(clean);});
    if(!parts.length)throw Error('That file has no 3D geometry.');
    const merged=L.mergeGeometries(parts,false);merged.computeVertexNormals();return merged;
  }
  async function bodyFromImport(result){
    if(result.kind==='step')return {geometry:geometryFromArrays(result),parts:result.parts,units:'in',source:'step'};
    const object=await parseMesh(result.format,result.bytes);let parts=0;object.traverse(o=>{if(o.isMesh)parts++;});
    return {geometry:mergeObject(object),parts,units:result.format==='stl'?'mm':result.format==='obj'?'mm':'m',source:'mesh'};
  }
  function material(){const {THREE:T}=three();return new T.MeshStandardMaterial({vertexColors:true,roughness:.65,metalness:.05});}
  async function toGlb(geometry){
    const L=three(),mesh=new L.THREE.Mesh(geometry,material());
    return new Promise((resolve,reject)=>new L.GLTFExporter().parse(mesh,buffer=>resolve(new Uint8Array(buffer)),e=>reject(Error('Could not store the model: '+(e?.message||e))),{binary:true}));
  }
  async function fromGlb(bytes){const scene=await parseMesh('glb',bytes);let geometry=null;scene.traverse(o=>{if(o.isMesh&&!geometry)geometry=o.geometry;});if(!geometry)throw Error('Stored model is empty.');return geometry;}
  // The body in the robot frame: scaled to inches, oriented, bottom on the floor, centred on the footprint.
  function place(geometry,m,footprint){
    const {THREE:T}=three(),[F,L,Up]=rows(m),s=UNITS[m.units]||1,rot=new T.Matrix4().set(F[0],F[1],F[2],0,L[0],L[1],L[2],0,Up[0],Up[1],Up[2],0,0,0,0,1);
    const mesh=geometry.isObject3D?geometry.clone(true):new T.Mesh(geometry,material()),inner=new T.Group(),holder=new T.Group();
    const transform=new T.Group();transform.matrixAutoUpdate=false;transform.matrix.copy(new T.Matrix4().makeScale(s,s,s).premultiply(rot));transform.add(mesh);inner.add(transform);holder.add(inner);
    // Measure after the scale and rotation reach the world matrices.
    holder.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(holder),c=box.getCenter(new T.Vector3()),f=footprint||{front:9,rear:9,half:9};
    const size=box.getSize(new T.Vector3()),sx=2*f.rear/Math.max(size.x,.001),sy=2*f.half/Math.max(size.y,.001);
    inner.scale.set(sx,sy,1);inner.position.set(-c.x*sx,-c.y*sy,-box.min.z);holder.updateMatrixWorld(true);
    holder.userData.modelScale={x:sx,y:sy,F,L,c:{x:c.x,y:c.y}};holder.userData.nativeSize={length:size.x,width:size.y,height:size.z};holder.userData.size={length:2*f.rear,width:2*f.half,height:size.z};return holder;
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
    const {THREE:T}=three(),box=new T.Box3().setFromObject(holder),ppi=10,w=Math.max(8,Math.min(2048,Math.round((box.max.x-box.min.x)*ppi))),h=Math.max(8,Math.min(2048,Math.round((box.max.y-box.min.y)*ppi)));
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(w,h,false);renderer.setClearColor(0,0);
    const scene=new T.Scene(),camera=new T.OrthographicCamera(box.min.x,box.max.x,box.max.y,box.min.y,.1,1000);camera.up.set(0,1,0);camera.position.set(0,0,box.max.z+50);camera.lookAt(0,0,0);
    scene.add(new T.HemisphereLight(0xffffff,0x555555,2.4),holder.clone());const sun=new T.DirectionalLight(0xffffff,1.2);sun.position.set(30,-30,100);scene.add(sun);
    renderer.render(scene,camera);const url=renderer.domElement.toDataURL('image/png');renderer.dispose();renderer.forceContextLoss?.();
    return {url,x0:box.min.x,x1:box.max.x,y0:box.min.y,y1:box.max.y};
  }
  // ---- preview with a view cube ---------------------------------------------------------
  function viewCube(host,onView){
    host.classList.add('view-cube');host.innerHTML='<div class="cube"></div><button type="button" class="cube-home" aria-label="Isometric home view">⌂</button>';const cube=host.querySelector('.cube');
    for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1]){const d=[x,y,z],count=d.filter(Boolean).length;if(!count)continue;const magnitude=Math.hypot(...d),n=d.map(v=>v/magnitude),side=Object.keys(SIDES).find(k=>SIDES[k].every((v,i)=>v===d[i])),name=side||d.map((v,i)=>v?Object.keys(SIDES).find(k=>SIDES[k][i]===v):'').filter(Boolean).join(' '),button=document.createElement('button');button.type='button';button.className='cube-part '+(side?'face':count===2?'edge':'corner');button.setAttribute('aria-label',name+' view');if(side){button.dataset.side=side;button.textContent=side[0].toUpperCase()+side.slice(1);}
      let up=count===2?d.map(v=>v===0?1:0):Math.abs(n[2])>.99?[1,0,0]:[0,0,1];const right=cross(up,n),length=Math.hypot(...right),r=right.map(v=>v/length);up=cross(n,r);const pos=d.map(v=>v*30);button.style.transform=`matrix3d(${[...r,0,...up.map(v=>-v),0,...n,0,...pos,1].join(',')})`;button.onclick=()=>{for(const p of cube.children)p.classList.toggle('selected',p===button);onView(d,side||null);};cube.append(button);
    }
    host.querySelector('.cube-home').onclick=()=>{for(const p of cube.children)p.classList.remove('selected');onView([1,-1,.8],null);};
    return {update(camera){const {THREE:T}=three(),m=new T.Matrix4().extractRotation(camera.matrixWorldInverse).premultiply(new T.Matrix4().makeScale(1,-1,1));cube.style.transform=`translateZ(-40px) matrix3d(${m.elements.map(v=>+v.toFixed(6)).join(',')})`;}};
  }
  function preview(host,{onSide}={}){
    const L=three(),T=L.THREE;
    host.innerHTML='<div class="model-view"><div class="model-canvas"></div><div class="view-cube" aria-label="Robot view cube"></div></div>';
    const box=host.querySelector('.model-canvas'),cubeHost=host.querySelector('.view-cube');let renderer;
    try{renderer=new T.WebGLRenderer({antialias:true,alpha:true});}catch{box.textContent='3D preview needs WebGL.';return {update(){},look(){},dispose(){}};}
    renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));box.append(renderer.domElement);
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,.5,2000);camera.up.set(0,0,1);
    const controls=new L.OrbitControls(camera,renderer.domElement);controls.enablePan=false;
    const navigator=viewCube(cubeHost,(direction,side)=>{look(direction);onSide?.(side);});
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
    return {update,look,resize:draw,select(side){for(const f of cubeHost.querySelectorAll('.face'))f.classList.toggle('selected',f.dataset.side===side);},dispose(){cancelAnimationFrame(raf);controls.dispose();renderer.dispose();renderer.forceContextLoss();host.replaceChildren();}};
  }
  return {AXES,UNITS,SIDES,orientation,rows,modelAxisAt,setFront,setTop,assignSide,meta,bodyFromImport,toGlb,fromGlb,place,silhouette,preview,viewCube,builtin,animate};
});
