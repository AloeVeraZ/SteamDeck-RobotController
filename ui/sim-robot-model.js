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
    const mesh=new T.Mesh(geometry,material()),inner=new T.Group(),holder=new T.Group();
    mesh.matrixAutoUpdate=false;mesh.matrix.copy(new T.Matrix4().makeScale(s,s,s).premultiply(rot));inner.add(mesh);holder.add(inner);
    // Measure after the scale and rotation reach the world matrices.
    holder.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(holder),c=box.getCenter(new T.Vector3()),f=footprint||{front:9,rear:9,half:9};
    inner.position.set((f.front-f.rear)/2-c.x,-c.y,-box.min.z);holder.updateMatrixWorld(true);
    const size=box.getSize(new T.Vector3());holder.userData.size={length:size.x,width:size.y,height:size.z};return holder;
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
  function preview(host,{onSide}={}){
    const L=three(),T=L.THREE;
    host.innerHTML=`<div class="model-view"><div class="model-canvas"></div><div class="view-cube" aria-label="View cube"><div class="cube">${Object.keys(SIDES).map(s=>`<button type="button" class="face ${s}" data-side="${s}">${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}</div></div></div>`;
    const box=host.querySelector('.model-canvas'),cube=host.querySelector('.cube');let renderer;
    const UP={front:[0,0,1],back:[0,0,1],left:[0,0,1],right:[0,0,1],top:[1,0,0],bottom:[1,0,0]};
    for(const face of cube.querySelectorAll('.face')){const n=SIDES[face.dataset.side],u=UP[face.dataset.side],r=cross(u,n);
      face.style.transform=`matrix3d(${[...r,0,...u.map(v=>-v),0,...n,0,...n.map(v=>v*32),1].join(',')})`;}
    try{renderer=new T.WebGLRenderer({antialias:true,alpha:true});}catch{box.textContent='3D preview needs WebGL.';return {update(){},look(){},dispose(){}};}
    renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));box.append(renderer.domElement);
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,.5,2000);camera.up.set(0,0,1);
    const controls=new L.OrbitControls(camera,renderer.domElement);controls.enablePan=false;
    scene.add(new T.HemisphereLight(0xffffff,0x4b525c,2.3));const sun=new T.DirectionalLight(0xffffff,1.4);sun.position.set(40,-30,60);scene.add(sun);
    const grid=new T.GridHelper(36,12,0x888888,0x888888);grid.rotation.x=Math.PI/2;grid.material.transparent=true;grid.material.opacity=.25;scene.add(grid);
    let body=null,outline=null,raf=0,radius=18;
    function frame(){raf=0;const w=Math.max(1,box.clientWidth),h=Math.max(1,box.clientHeight),size=renderer.getSize(new T.Vector2());if(size.x!==w||size.y!==h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
      controls.update();renderer.render(scene,camera);
      // The cube shows the robot frame the way the camera sees it (CSS y points down).
      const m=new T.Matrix4().extractRotation(camera.matrixWorldInverse).premultiply(new T.Matrix4().makeScale(1,-1,1));cube.style.transform=`translateZ(-40px) matrix3d(${m.elements.map(v=>+v.toFixed(6)).join(',')})`;}
    const draw=()=>{if(!raf)raf=requestAnimationFrame(frame);};controls.addEventListener('change',draw);
    // Straight up/down is degenerate for orbit controls, so top/bottom views tilt a hair.
    function look(side){const d=side==='top'?[-.02,0,1]:side==='bottom'?[-.02,0,-1]:SIDES[side]||[1,-1,.8],dir=new T.Vector3(...d).normalize();
      camera.position.copy(dir.multiplyScalar(radius*2.6)).add(controls.target);controls.update();draw();}
    cube.addEventListener('click',e=>{const side=e.target.closest('[data-side]')?.dataset.side;if(!side)return;for(const f of cube.querySelectorAll('.face'))f.classList.toggle('selected',f.dataset.side===side);look(side);onSide?.(side);});
    function update(holder,footprint){
      if(body){scene.remove(body);}body=holder?holder.clone():null;if(body)scene.add(body);
      if(outline){scene.remove(outline);outline.geometry.dispose();}const f=footprint||{front:9,rear:9,half:9};
      const pts=[[f.front,f.half],[-f.rear,f.half],[-f.rear,-f.half],[f.front,-f.half],[f.front,f.half]].map(([x,y])=>new T.Vector3(x,y,.05));
      outline=new T.Line(new T.BufferGeometry().setFromPoints([...pts,new T.Vector3(f.front,0,.05),new T.Vector3(f.front+4,0,.05)]),new T.LineBasicMaterial({color:0xe5484d}));scene.add(outline);
      const size=holder?.userData.size||{length:18,width:18,height:12};radius=Math.max(10,Math.hypot(size.length,size.width,size.height)/2);controls.target.set(0,0,size.height/3);
      if(!update.looked){update.looked=true;look(null);}draw();
    }
    return {update,look,select(side){for(const f of cube.querySelectorAll('.face'))f.classList.toggle('selected',f.dataset.side===side);},dispose(){cancelAnimationFrame(raf);renderer.dispose();host.replaceChildren();}};
  }
  return {AXES,UNITS,SIDES,orientation,rows,modelAxisAt,setFront,setTop,meta,bodyFromImport,toGlb,fromGlb,place,silhouette,preview};
});
