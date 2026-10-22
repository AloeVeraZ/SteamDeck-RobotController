/* Local DSIM/CAD field view with the app's own controls. Field frame: inches, bottom-left
   origin, +X right, +Y up (z up). Empty and DECODE fields use planar physics even in 3D. */
window.DeckSim3D={create(host){
  'use strict';
  const L=window.DeckThree,THREE=L.THREE,DEG=Math.PI/180;
  host.innerHTML='<div class="sim-3d-canvas"></div><div class="sim-field-cube view-cube" aria-label="Field view cube"></div><p class="sim-3d-note hint" id="sim-3d-note"></p>';
  const box=host.querySelector('.sim-3d-canvas'),note=host.querySelector('#sim-3d-note');
  let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{note.textContent='3D needs WebGL, which this device did not provide.';return {setField(){},setModel(){},update(){},resize(){},dispose(){}};}
  renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));box.append(renderer.domElement);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,1,3000);camera.up.set(0,0,1);camera.position.set(72,-95,150);
  const controls=new L.OrbitControls(camera,renderer.domElement);controls.target.set(72,72,0);controls.minPolarAngle=.001;controls.maxPolarAngle=Math.PI-.001;controls.enablePan=false;controls.update();
  const navigator=window.DeckRobotModel.viewCube(host.querySelector('.sim-field-cube'),direction=>{const d=[...direction];if(!d[0]&&!d[1])d[0]=-.0001;const distance=Math.min(controls.maxDistance,Math.max(controls.minDistance,camera.position.distanceTo(controls.target)));camera.position.copy(new THREE.Vector3(...d).normalize().multiplyScalar(distance)).add(controls.target);controls.update();schedule();},{controls,orbit:(dx,dy)=>{window.DeckRobotModel.orbitCamera(camera,controls,dx,dy);schedule();}});
  scene.add(new THREE.HemisphereLight(0xffffff,0x8b96a5,2.8),new THREE.AmbientLight(0xffffff,.5));const sun=new THREE.DirectionalLight(0xffffff,1.8);sun.position.set(130,-40,220);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-180;sun.shadow.camera.right=180;sun.shadow.camera.top=180;sun.shadow.camera.bottom=-180;sun.shadow.bias=-.0005;
  const fieldGroup=new THREE.Group(),overlay=new THREE.Group(),robotGroup=new THREE.Group(),ghost=new THREE.Group();scene.add(fieldGroup,overlay,robotGroup,ghost);
  let info=null,frame=null,state=null,body=null,raf=0,lastOverlay='',fieldKey='',fieldSequence=0,visual=null,markers=null,disposed=false;
  const markersHost=new THREE.Group(),ballsHost=new THREE.Group(),elementMarkers=new THREE.Group();scene.add(markersHost,ballsHost,elementMarkers);const ballMeshes=new Map(),ballWires=new Map();
  const css=name=>getComputedStyle(host).getPropertyValue(name).trim()||'#888',color=name=>new THREE.Color(css(name));
  function dispose(object){object.traverse(o=>{o.geometry?.dispose?.();for(const m of [].concat(o.material||[]))m.dispose?.();});}
  // The robot model's geometry belongs to the model module; only drop our own objects.
  function clear(group){for(const c of [...group.children]){group.remove(c);if(c.userData.keep!==true)dispose(c);}}
  const v3=(p,z=0)=>new THREE.Vector3(p.x,p.y,z);
  function prism(points,height,material,z=0){const m=new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(points.map(p=>new THREE.Vector2(p.x,p.y))),{depth:height,bevelEnabled:false}),material);m.position.z=z;return m;}
  function line(points,material,z){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>v3(p,z))),material);if(material.isLineDashedMaterial)l.computeLineDistances();return l;}
  async function setField(nextInfo){
    info=nextInfo;scene.background=color('--bg');if(!info)return;const key=JSON.stringify([info.field,info.bounds]);
    const b=info?.bounds||{x0:0,y0:0,x1:144,y1:144},w=b.x1-b.x0,h=b.y1-b.y0;
    const cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2,span=Math.max(w,h);controls.minDistance=span*.25;controls.maxDistance=span*2.15;camera.near=Math.max(.25,span/200);camera.far=Math.max(3000,span*5);camera.updateProjectionMatrix();
    clear(markersHost);markers=window.DeckFieldArt.hitboxes(info,THREE,L);markersHost.add(markers.group);
    if(key!==fieldKey){fieldKey=key;const sequence=++fieldSequence,temporary=new THREE.Group();clear(fieldGroup);visual=null;clear(ballsHost);ballMeshes.clear();clear(elementMarkers);ballWires.clear();host.dataset.fieldReady='';host.setAttribute('aria-busy','true');
      controls.target.set(cx,cy,4);camera.position.set(cx,cy-span*1.1,span*1.05);sun.target.position.set(cx,cy,0);scene.add(sun.target);controls.update();
      try{const next=await window.DeckFieldArt.build3d(temporary,info,THREE,L,{surface:color('--surface').lerp(color('--muted'),.18),line:color('--line-strong')});if(disposed||sequence!==fieldSequence)return;fieldGroup.add(...temporary.children);visual=next;host.dataset.fieldReady=info.field;host.setAttribute('aria-busy','false');}
      catch(e){if(sequence===fieldSequence){fieldKey='';note.textContent='Field model could not load: '+e.message;host.setAttribute('aria-busy','false');}return;}}
    note.textContent=!info?'':info.physics==='3d'?'3D physics':'Flat (2D) physics, shown in 3D';
    lastOverlay='';robotModel();schedule();
  }
  function robotModel(){
    clear(robotGroup);
    if(body){const c=body.clone();c.userData.keep=true;robotGroup.add(c);return;}
    const f=info?.footprint||{front:10.5,rear:7.5,half:9},len=f.front+f.rear;
    const chassis=new THREE.Mesh(new THREE.BoxGeometry(len,2*f.half,5),new THREE.MeshStandardMaterial({color:color('--text'),roughness:.6}));chassis.position.set((f.front-f.rear)/2,0,3);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(2.4,5,3),new THREE.MeshStandardMaterial({color:color('--accent')}));nose.rotation.z=-Math.PI/2;nose.position.set(f.front-3,0,6.2);
    robotGroup.add(chassis,nose);
  }
  function setModel(holder){body=holder||null;robotModel();schedule();}
  function overlays(){
    const s=state;if(!s)return;const l=s.layout,signature=JSON.stringify([l.zones,l.pins,l.route?.samples?.length,l.route?.length,s.trail.length,s.start,info?.footprint]);if(signature===lastOverlay)return;lastOverlay=signature;clear(overlay);
    const red=new THREE.MeshStandardMaterial({color:color('--danger'),transparent:true,opacity:.45});
    for(const z of l.zones){const p=window.DeckPlanner.polygon(z);
      if(p.length===2){const [a,b]=p,m=new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(b.x-a.x,b.y-a.y),1,3),red);m.position.set((a.x+b.x)/2,(a.y+b.y)/2,1.5);m.rotation.z=Math.atan2(b.y-a.y,b.x-a.x);overlay.add(m);}
      else overlay.add(prism(p,12,red));}
    if(l.route?.samples?.length>1)overlay.add(line(l.route.samples,new THREE.LineBasicMaterial({color:color('--accent')}),.6));
    const pin=new THREE.MeshStandardMaterial({color:color('--accent')}),stop=new THREE.MeshStandardMaterial({color:color('--warning')});
    for(const q of l.pins){const m=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,4,16),q.wait>0?stop:pin);m.rotation.x=Math.PI/2;m.position.set(q.x,q.y,2);overlay.add(m);}
    if(s.trail.length>1)overlay.add(line(s.trail,new THREE.LineBasicMaterial({color:color('--text')}),.4));
    const est=s.trail.filter(t=>t.e).map(t=>t.e);if(est.length>1)overlay.add(line(est,new THREE.LineDashedMaterial({color:color('--warning'),dashSize:2,gapSize:1.5}),.5));
    if(s.start&&info){const c=window.DeckPlanner.body(s.start,info.footprint);overlay.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c.map(p=>v3(p,.3))),new THREE.LineBasicMaterial({color:color('--muted')})));}
  }
  function update(nextFrame,nextState){frame=nextFrame;state=nextState||state;schedule();}
  function schedule(){if(!raf)raf=requestAnimationFrame(render);}
  function render(){
    raf=0;if(!host.isConnected||host.hidden)return;resize();overlays();
    const t=frame?.truth,p=t||state?.start;if(!robotGroup.children.length)robotModel();
    if(p){robotGroup.position.set(p.x,p.y,t?.z||0);robotGroup.rotation.set(0,0,p.heading*DEG);window.DeckRobotModel?.animate(robotGroup,frame);if(markers){markers.robot.position.copy(robotGroup.position);markers.robot.rotation.copy(robotGroup.rotation);}}
    markersHost.visible=!!state?.hitboxes;
    const world=frame?.fieldState;
    elementMarkers.visible=markersHost.visible;if(world&&markersHost.visible){const seen=new Set();for(const ball of world.balls){if(['held','stock','scored'].includes(ball.state?.kind))continue;seen.add(ball.id);let line=ballWires.get(ball.id);const radius=Number.isFinite(ball.r)?ball.r:info?.field==='biobuzz'?(ball.color==='yellow'?1.4:1.8):2.5;if(!line){line=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2*radius,2*radius,2*radius)),new THREE.LineBasicMaterial({color:0xff6373,depthTest:false}));line.renderOrder=12;ballWires.set(ball.id,line);elementMarkers.add(line);}line.position.set(ball.pos.x+72,ball.pos.y+72,(ball.z||0)+radius);}for(const [id,line]of ballWires)if(!seen.has(id)){elementMarkers.remove(line);dispose(line);ballWires.delete(id);}}
    if(world&&visual?.handles){L.updateBiobuzzField(visual.handles,world);L.updateBiobuzzElements(visual.elements,world);for(const a of ['red','blue'])if(markers?.trays[a])markers.trays[a].rotation.x=L.hiveTiltAngle(world,a)-info.trays[a].reference;}
    if(world&&info?.field==='decode'){const seen=new Set();for(const ball of world.balls){if(['held','stock','scored'].includes(ball.state?.kind))continue;seen.add(ball.id);let mesh=ballMeshes.get(ball.id);if(!mesh){mesh=new THREE.Mesh(new THREE.SphereGeometry(2.5,16,12),new THREE.MeshStandardMaterial({color:ball.color==='purple'?0x9d68cb:0x64bc70,roughness:.7}));mesh.castShadow=true;mesh.receiveShadow=true;ballMeshes.set(ball.id,mesh);ballsHost.add(mesh);}mesh.position.set(ball.pos.x+72,ball.pos.y+72,Math.max(0,ball.z||0)+2.5);}for(const [id,mesh]of ballMeshes)if(!seen.has(id)){ballsHost.remove(mesh);dispose(mesh);ballMeshes.delete(id);}}
    clear(ghost);const e=frame?.estimate;if(e&&info){const c=window.DeckPlanner.body(e,info.footprint);ghost.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c.map(q=>v3(q,7))),new THREE.LineDashedMaterial({color:color('--warning'),dashSize:1.5,gapSize:1})).computeLineDistances());}
    controls.update();navigator.update(camera);renderer.render(scene,camera);
  }
  function resize(){const w=Math.max(1,box.clientWidth),h=Math.max(1,box.clientHeight),size=renderer.getSize(new THREE.Vector2());if(size.x!==w||size.y!==h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
  controls.addEventListener('change',schedule);
  const themeObserver=new MutationObserver(()=>{if(info)setField(info);});themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});const scheme=matchMedia('(prefers-color-scheme: dark)'),themeChanged=()=>{if(info)setField(info);};scheme.addEventListener('change',themeChanged);
  return {setField,setModel,update,resize:()=>{resize();schedule();},dispose(){disposed=true;fieldSequence++;cancelAnimationFrame(raf);themeObserver.disconnect();scheme.removeEventListener('change',themeChanged);navigator.dispose();controls.dispose();clear(scene);renderer.dispose();renderer.forceContextLoss();host.replaceChildren();}};
}};
