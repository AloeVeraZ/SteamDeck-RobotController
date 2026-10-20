/* 3D view for the offline simulator. Two renderers:
   - Deck scene: three.js in DSIM's centred, z-up inch frame with the field, no-go zones, pins,
     planned path, trails and the robot (DSIM's BIOBUZZ robot or an imported visual mesh). On
     BIOBUZZ the field, elements and robot come from DSIM's own scene builders and CAD models.
   - DSIM scene (BIOBUZZ only): DSIM's complete renderer with its own cameras.
   DECODE and the empty field step planar physics; drawing them in perspective does not make
   their physics 3D, and the view says so. */
window.DeckSim3D={create(host){
  'use strict';
  const V=window.DeckDsimView,THREE=V.THREE,OFF=72,DEG=Math.PI/180;
  host.innerHTML=`<div class="sim-3d-bar"><label class="sr-only" for="sim-camera">3D renderer</label><select id="sim-camera"><option value="scene">Deck scene · orbit</option><option value="dsim-orbit">DSIM scene · orbit</option><option value="dsim-overhead">DSIM scene · overhead</option><option value="dsim-chase">DSIM scene · chase</option></select><span class="hint" id="sim-3d-note"></span></div><div class="sim-3d-canvas"></div>`;
  const box=host.querySelector('.sim-3d-canvas'),note=host.querySelector('#sim-3d-note'),select=host.querySelector('#sim-camera');
  let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true});}catch(e){note.textContent='3D needs WebGL, which this device did not provide.';return {setField(){},setMesh(){},update(){},resize(){},dispose(){}};}
  renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));box.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,1,3000);camera.up.set(0,0,1);camera.position.set(0,-175,150);
  const controls=new V.OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.maxPolarAngle=Math.PI*.49;controls.update();
  const hemi=new THREE.HemisphereLight(0xffffff,0x4b525c,2.2);hemi.position.set(0,0,1);const sun=new THREE.DirectionalLight(0xffffff,1.8);sun.position.set(60,-80,200);scene.add(hemi,sun);
  const fieldGroup=new THREE.Group(),overlay=new THREE.Group(),robotGroup=new THREE.Group(),ghost=new THREE.Group(),balls=new THREE.Group();scene.add(fieldGroup,overlay,robotGroup,ghost,balls);
  let info=null,project=null,frame=null,state=null,dsim=null,dsimScene=null,dsimLoading=null,mode='scene',elements=null,robots=null,mesh=null,meshKey='',raf=0,lastOverlay='',fieldToken=0;
  const css=name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim()||'#888';
  const color=name=>new THREE.Color(css(name));
  function dispose(object){object.traverse(o=>{o.geometry?.dispose?.();for(const m of [].concat(o.material||[]))m.dispose?.();});}
  function clear(group){for(const c of [...group.children]){group.remove(c);dispose(c);}}
  const poly=(points,z=0)=>points.map(p=>new THREE.Vector3(p.x-OFF,p.y-OFF,z));
  function prism(points,height,material){const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p.x-OFF,p.y-OFF)));return new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}),material);}
  function line(points,material){const g=new THREE.BufferGeometry().setFromPoints(points);const l=new THREE.Line(g,material);if(material.isLineDashedMaterial)l.computeLineDistances();return l;}
  async function setField(nextInfo,nextProject){
    info=nextInfo;project=nextProject;const token=++fieldToken;clear(fieldGroup);elements=null;if(robots){robotGroup.remove(robots.group);robots.dispose();robots=null;}
    scene.background=color('--bg');const b=info?.bounds||{x0:0,y0:0,x1:144,y1:144},w=b.x1-b.x0,h=b.y1-b.y0,game=project?.field||'empty';
    note.textContent=game==='biobuzz'?(info?.physics==='3d'?'Rapier 3D physics (DSIM BIOBUZZ)':'BIOBUZZ with planar physics'):'Planar (2D) physics shown in perspective';
    select.querySelectorAll('option[value^="dsim"]').forEach(o=>{o.disabled=game!=='biobuzz';});if(game!=='biobuzz'&&mode!=='scene'){select.value='scene';setMode('scene');}
    if(game==='biobuzz'){
      try{const handles=await V.buildBiobuzzField('low');if(token!==fieldToken){dispose(handles.group);return;}fieldGroup.add(handles.group);fieldGroup.userData.handles=handles;}catch(e){note.textContent='DSIM field could not load: '+e.message;}
      elements=V.buildBiobuzzElements('sphere');fieldGroup.add(elements.group);
    }else{
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({color:color('--surface'),roughness:.95}));floor.position.set((b.x0+b.x1)/2-OFF,(b.y0+b.y1)/2-OFF,0);fieldGroup.add(floor);
      const grid=[];for(let v=24;v<144;v+=24){grid.push(new THREE.Vector3(v-OFF,-OFF,.05),new THREE.Vector3(v-OFF,OFF,.05),new THREE.Vector3(-OFF,v-OFF,.05),new THREE.Vector3(OFF,v-OFF,.05));}
      fieldGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid),new THREE.LineBasicMaterial({color:color('--line-strong')})));
      const wall=new THREE.MeshStandardMaterial({color:color('--line-strong'),transparent:true,opacity:.35});
      for(const [x,y,sx,sy] of [[-OFF-.5,0,1,145],[OFF+.5,0,1,145],[0,-OFF-.5,145,1],[0,OFF+.5,145,1]]){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,12),wall);m.position.set(x,y,6);fieldGroup.add(m);}
      const solid=new THREE.MeshStandardMaterial({color:0x6b7280,roughness:.8});for(const z of info?.fieldZones||[])fieldGroup.add(prism(window.DeckPlanner.polygon(z),12,solid));
    }
    lastOverlay='';robotModel();schedule();
  }
  function robotModel(){
    clear(robotGroup);if(robots){robots.dispose();robots=null;}
    if(mesh){robotGroup.add(mesh.clone());return;}
    if(project?.field==='biobuzz'){robots=V.buildBiobuzzRobots();robotGroup.add(robots.group);return;}
    const f=info?.footprint||{front:10.5,rear:7.5,half:9},len=f.front+f.rear;
    const body=new THREE.Mesh(new THREE.BoxGeometry(len,2*f.half,5),new THREE.MeshStandardMaterial({color:color('--text'),roughness:.6}));body.position.set((f.front-f.rear)/2,0,3);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(2.4,5,3),new THREE.MeshStandardMaterial({color:color('--accent')}));nose.rotation.z=-Math.PI/2;nose.position.set(f.front-3,0,6.2);
    const holder=new THREE.Group();holder.add(body,nose);robotGroup.add(holder);
  }
  // Imported models are visual: scaled and rotated as entered, bottom placed on the floor.
  function setMesh(data,transform){
    const key=data&&transform?JSON.stringify([data.id,transform.scale,transform.rx,transform.ry,transform.rz,transform.dz]):'';if(key===meshKey)return;meshKey=key;
    if(mesh){dispose(mesh);mesh=null;}if(!data||!transform){robotModel();schedule();return;}
    const finish=object=>{
      const holder=new THREE.Group(),inner=new THREE.Group();inner.add(object);inner.rotation.set(transform.rx*DEG,transform.ry*DEG,transform.rz*DEG,'XYZ');inner.scale.setScalar(transform.scale);holder.add(inner);
      const bounds=new THREE.Box3().setFromObject(holder),c=bounds.getCenter(new THREE.Vector3());inner.position.set(-c.x,-c.y,-bounds.min.z+transform.dz);
      const size=bounds.getSize(new THREE.Vector3());host.dispatchEvent(new CustomEvent('meshsize',{detail:{x:size.x,y:size.y,z:size.z}}));
      mesh=holder;robotModel();schedule();
    };
    const buffer=data.bytes.buffer.slice(data.bytes.byteOffset,data.bytes.byteOffset+data.bytes.byteLength);
    try{
      if(data.format==='stl'){const g=new V.STLLoader().parse(buffer);finish(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x9aa4b2,roughness:.6})));}
      else if(data.format==='obj')finish(new V.OBJLoader().parse(new TextDecoder().decode(buffer)));
      else{const loader=new V.GLTFLoader();loader.setMeshoptDecoder(V.MeshoptDecoder);loader.parse(data.format==='gltf'?new TextDecoder().decode(buffer):buffer,'',gltf=>finish(gltf.scene),e=>{note.textContent='Model could not load: '+(e?.message||e);});}
    }catch(e){note.textContent='Model could not load: '+e.message;}
  }
  function overlays(){
    const s=state;if(!s)return;const p=s.project,signature=JSON.stringify([p.zones,p.pins,p.route?.length,p.route?.samples?.length,s.trail.length,s.selected,info?.footprint]);if(signature===lastOverlay)return;lastOverlay=signature;clear(overlay);
    const red=new THREE.MeshStandardMaterial({color:color('--danger'),transparent:true,opacity:.45});
    for(const z of p.zones)overlay.add(prism(window.DeckPlanner.polygon(z),3,red));
    if(p.route?.samples?.length>1)overlay.add(line(poly(p.route.samples,.6),new THREE.LineBasicMaterial({color:color('--accent')})));
    const pin=new THREE.MeshStandardMaterial({color:color('--accent')});for(const q of p.pins){const m=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,4,16),pin);m.rotation.x=Math.PI/2;m.position.set(q.x-OFF,q.y-OFF,2);overlay.add(m);}
    if(s.trail.length>1)overlay.add(line(poly(s.trail,.4),new THREE.LineBasicMaterial({color:color('--text')})));
    const est=s.trail.filter(t=>t.e).map(t=>t.e);if(est.length>1)overlay.add(line(poly(est,.5),new THREE.LineDashedMaterial({color:color('--warning'),dashSize:2,gapSize:1.5})));
    const st=s.start,f=info?.footprint;if(st&&f){const c=window.DeckPlanner.body(st,f);overlay.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly(c,.3)),new THREE.LineBasicMaterial({color:color('--muted')})));}
  }
  function updateBalls(world){
    if(project?.field!=='decode'){if(balls.children.length)clear(balls);return;}
    const list=world.balls.filter(b=>b.state.kind!=='held');while(balls.children.length<list.length)balls.add(new THREE.Mesh(new THREE.SphereGeometry(2.5,16,12),new THREE.MeshStandardMaterial({color:0x8e44ad})));
    balls.children.forEach((m,i)=>{const b=list[i];m.visible=!!b;if(!b)return;m.position.set(b.pos.x,b.pos.y,2.5+(b.z||0));m.material.color.set(b.color==='green'?0x2ecc71:0x8e44ad);});
  }
  function update(nextFrame,nextState){frame=nextFrame||frame;state=nextState||state;schedule();}
  function schedule(){if(!raf)raf=requestAnimationFrame(render);}
  function render(){
    raf=0;if(!host.isConnected||host.hidden)return;resize();
    const world=frame?.world;
    if(mode!=='scene'&&dsimScene&&world){try{dsimScene.render(world,{alpha:1,viewAngle:0,camera:mode.slice(5),localRobotId:0,width:box.clientWidth,height:box.clientHeight,dpr:Math.min(2,devicePixelRatio||1)});}catch(e){note.textContent='DSIM scene error: '+e.message;}return;}
    overlays();
    if(world){
      const r=world.robots[0];robotGroup.position.set(r.pos.x,r.pos.y,r.z||0);robotGroup.rotation.set(0,0,mesh||!robots?r.heading:0);
      if(robots&&!mesh){robotGroup.position.set(0,0,0);V.updateBiobuzzRobots(robots,world);}
      if(elements)V.updateBiobuzzElements(elements,world);if(fieldGroup.userData.handles)V.updateBiobuzzField(fieldGroup.userData.handles,world);updateBalls(world);
    }else if(state?.start){const st=state.start;robotGroup.position.set(st.x-OFF,st.y-OFF,0);robotGroup.rotation.set(0,0,st.heading*DEG);}
    clear(ghost);const e=frame?.estimate;if(e&&info){const c=window.DeckPlanner.body(e,info.footprint);ghost.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly(c,7)),new THREE.LineDashedMaterial({color:color('--warning'),dashSize:1.5,gapSize:1})).computeLineDistances());}
    controls.update();renderer.render(scene,camera);
  }
  async function setMode(next){
    mode=next;renderer.domElement.hidden=mode!=='scene';
    if(mode!=='scene'&&!dsimScene&&!dsimLoading){
      const div=document.createElement('div');div.className='sim-dsim-scene';box.append(div);
      dsimLoading=V.createBiobuzzScene(div,{quality:'medium',interactive:true}).then(s=>{dsimScene=s;dsim=div;s.resize(Math.max(1,box.clientWidth),Math.max(1,box.clientHeight),Math.min(2,devicePixelRatio||1));}).catch(e=>{div.remove();note.textContent=`DSIM scene unavailable here (${e.message}). Using the Deck scene.`;select.value='scene';mode='scene';renderer.domElement.hidden=false;}).finally(()=>{dsimLoading=null;schedule();});
    }
    if(dsim)dsim.hidden=mode==='scene';schedule();
  }
  select.onchange=()=>void setMode(select.value);
  function resize(){const w=Math.max(1,box.clientWidth),h=Math.max(1,box.clientHeight),size=renderer.getSize(new THREE.Vector2());if(size.x!==w||size.y!==h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();dsimScene?.resize(w,h,Math.min(2,devicePixelRatio||1));}}
  controls.addEventListener('change',schedule);
  return {setField:(i,p)=>void setField(i,p),setMesh,update,resize:()=>{resize();schedule();},dispose(){cancelAnimationFrame(raf);dsimScene?.dispose();clear(scene);renderer.dispose();host.replaceChildren();}};
}};
