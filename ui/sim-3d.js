/* Local DSIM/CAD field view with the app's own controls. Field frame: inches, bottom-left
   origin, +X right, +Y up (z up). Empty and DECODE fields use planar physics even in 3D. */
window.DeckSim3D={create(host,options){
  'use strict';
  const L=window.DeckThree,THREE=L.THREE,DEG=Math.PI/180;
  // `video: true` makes a run-video camera: a fixed-size picture with its own copy of the field, drawn only when
  // shoot() asks, either straight down at the whole field (2D, 'top') or following the robot (3D, 'chase').
  options=options||{};const video=!!options.video,W=options.width||1280,H=options.height||720;
  host.innerHTML='<div class="sim-3d-canvas"></div><div class="sim-field-cube view-cube" aria-label="Field view cube"></div><p class="sim-3d-note hint" id="sim-3d-note"></p>';
  const box=host.querySelector('.sim-3d-canvas'),note=host.querySelector('#sim-3d-note');
  let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:!!video});}catch{if(video)throw Error('Run videos need WebGL, which this device did not provide.');note.textContent='3D needs WebGL, which this device did not provide.';return {setField(){},setModel(){},update(){},resize(){},dispose(){}};}
  renderer.setPixelRatio(video?1:Math.min(2,devicePixelRatio||1));box.append(renderer.domElement);if(video)renderer.setSize(W,H,false);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,1,3000);camera.up.set(0,0,1);camera.position.set(72,-95,150);
  const top=new THREE.OrthographicCamera(-1,1,1,-1,1,3000);top.up.set(0,1,0);if(video){camera.fov=50;camera.aspect=W/H;camera.updateProjectionMatrix();}
  const controls=video?null:new L.OrbitControls(camera,renderer.domElement);if(controls){controls.target.set(72,72,0);controls.minPolarAngle=.001;controls.maxPolarAngle=Math.PI-.001;controls.enablePan=false;controls.update();}
  const navigator=video?null:window.DeckRobotModel.viewCube(host.querySelector('.sim-field-cube'),direction=>{const d=[...direction];if(!d[0]&&!d[1])d[0]=-.0001;const distance=Math.min(controls.maxDistance,Math.max(controls.minDistance,camera.position.distanceTo(controls.target)));camera.position.copy(new THREE.Vector3(...d).normalize().multiplyScalar(distance)).add(controls.target);controls.update();schedule();},{controls,orbit:(dx,dy)=>{window.DeckRobotModel.orbitCamera(camera,controls,dx,dy);schedule();}});
  scene.add(new THREE.HemisphereLight(0xffffff,0x8b96a5,2.8),new THREE.AmbientLight(0xffffff,.5));const sun=new THREE.DirectionalLight(0xffffff,1.8);sun.position.set(130,-40,220);scene.add(sun);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-180;sun.shadow.camera.right=180;sun.shadow.camera.top=180;sun.shadow.camera.bottom=-180;sun.shadow.bias=-.0005;
  const fieldGroup=new THREE.Group(),overlay=new THREE.Group(),robotGroup=new THREE.Group(),ghost=new THREE.Group();scene.add(fieldGroup,overlay,robotGroup,ghost);
  let info=null,frame=null,state=null,body=null,raf=0,lastOverlay='',fieldKey='',fieldSequence=0,visual=null,markers=null,disposed=false;
  const markersHost=new THREE.Group(),ballsHost=new THREE.Group(),elementMarkers=new THREE.Group();scene.add(markersHost,ballsHost,elementMarkers);const ballMeshes=new Map(),ballWires=new Map();
  const css=name=>getComputedStyle(options.style||host).getPropertyValue(name).trim()||'#888',color=name=>new THREE.Color(css(name));
  function dispose(object){object.traverse(o=>{o.geometry?.dispose?.();for(const m of [].concat(o.material||[]))m.dispose?.();});}
  // The robot model's geometry belongs to the model module; only drop our own objects.
  function clear(group){for(const c of [...group.children]){group.remove(c);if(c.userData.keep!==true)dispose(c);}}
  const v3=(p,z=0)=>new THREE.Vector3(p.x,p.y,z);
  function prism(points,height,material,z=0){const m=new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(points.map(p=>new THREE.Vector2(p.x,p.y))),{depth:height,bevelEnabled:false}),material);m.position.z=z;return m;}
  function line(points,material,z){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>v3(p,z))),material);if(material.isLineDashedMaterial)l.computeLineDistances();return l;}
  async function setField(nextInfo){
    info=nextInfo;scene.background=video?new THREE.Color(0x15181c):color('--bg');if(!info)return;const key=JSON.stringify([info.field,info.bounds]);
    const b=info?.bounds||{x0:0,y0:0,x1:144,y1:144},w=b.x1-b.x0,h=b.y1-b.y0;
    const cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2,span=Math.max(w,h);if(controls){controls.minDistance=span*.25;controls.maxDistance=span*2.15;}camera.near=Math.max(.25,span/200);camera.far=Math.max(3000,span*5);camera.updateProjectionMatrix();
    clear(markersHost);markers=window.DeckFieldArt.hitboxes(info,THREE,L);markersHost.add(markers.group);
    if(key!==fieldKey){fieldKey=key;const sequence=++fieldSequence,temporary=new THREE.Group();clear(fieldGroup);visual=null;clear(ballsHost);ballMeshes.clear();clear(elementMarkers);ballWires.clear();host.dataset.fieldReady='';host.setAttribute('aria-busy','true');
      controls?.target.set(cx,cy,4);camera.position.set(cx,cy-span*1.1,span*1.05);sun.target.position.set(cx,cy,0);scene.add(sun.target);controls?.update();
      try{const next=await window.DeckFieldArt.build3d(temporary,info,THREE,L,{surface:color('--surface').lerp(color('--muted'),.18),line:color('--line-strong')},{own:!!video});if(disposed||sequence!==fieldSequence)return;fieldGroup.add(...temporary.children);visual=next;host.dataset.fieldReady=info.field;host.setAttribute('aria-busy','false');}
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
    if(l.route?.segments?.length){const indices=window.DeckSimExport.pathIndex(l.route);for(const [i,seg]of l.route.segments.entries()){
      const path=l.pins[indices[i]]?.path,appearance=window.DeckPlanner.pathAppearance(path),points=Array.from({length:41},(_,j)=>{let ps=seg.points;const t=j/40;while(ps.length>1)ps=ps.slice(1).map((p,k)=>({x:ps[k].x+(p.x-ps[k].x)*t,y:ps[k].y+(p.y-ps[k].y)*t}));return ps[0];}),material=appearance.action?new THREE.LineDashedMaterial({color:appearance.color,dashSize:2.2,gapSize:1.2}):new THREE.LineBasicMaterial({color:appearance.color});
      overlay.add(line(points,material,.6));}}
    const pin=new THREE.MeshStandardMaterial({color:color('--accent')}),stop=new THREE.MeshStandardMaterial({color:color('--warning')});
    for(const q of l.pins){const m=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,4,16),q.wait>0?stop:pin);m.rotation.x=Math.PI/2;m.position.set(q.x,q.y,2);overlay.add(m);}
    if(s.trail.length>1)overlay.add(line(s.trail,new THREE.LineBasicMaterial({color:color('--text')}),.4));
    const est=s.trail.filter(t=>t.e).map(t=>t.e);if(est.length>1)overlay.add(line(est,new THREE.LineDashedMaterial({color:color('--warning'),dashSize:2,gapSize:1.5}),.5));
    if(s.start&&info){const c=window.DeckPlanner.body(s.start,info.footprint);overlay.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c.map(p=>v3(p,.3))),new THREE.LineBasicMaterial({color:color('--muted')})));}
  }
  function update(nextFrame,nextState){frame=nextFrame;state=nextState||state;schedule();}
  function schedule(){if(!raf&&!video)raf=requestAnimationFrame(render);}
  function render(){
    raf=0;if(video||!host.isConnected||host.hidden)return;resize();prepare();
    controls.update();navigator.update(camera);renderer.render(scene,camera);
  }
  // Puts the robot, pieces and overlays where the frame shown now has them.
  function prepare(){
    overlays();
    const t=frame?.truth,p=t||state?.start;if(!robotGroup.children.length)robotModel();
    if(p){robotGroup.position.set(p.x,p.y,t?.z||0);robotGroup.rotation.set(0,0,p.heading*DEG);window.DeckRobotModel?.animate(robotGroup,frame);if(markers){markers.robot.position.copy(robotGroup.position);markers.robot.rotation.copy(robotGroup.rotation);}}
    markersHost.visible=!!state?.hitboxes;
    const world=frame?.fieldState;
    elementMarkers.visible=markersHost.visible;if(world&&markersHost.visible){const seen=new Set();for(const ball of world.balls){if(['held','stock','scored'].includes(ball.state?.kind))continue;seen.add(ball.id);let line=ballWires.get(ball.id);const radius=Number.isFinite(ball.r)?ball.r:info?.field==='biobuzz'?(ball.color==='yellow'?1.4:1.8):2.5;if(!line){line=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2*radius,2*radius,2*radius)),new THREE.LineBasicMaterial({color:0xff6373,depthTest:false}));line.renderOrder=12;ballWires.set(ball.id,line);elementMarkers.add(line);}line.position.set(ball.pos.x+72,ball.pos.y+72,(ball.z||0)+radius);}for(const [id,line]of ballWires)if(!seen.has(id)){elementMarkers.remove(line);dispose(line);ballWires.delete(id);}}
    if(world&&visual?.handles){L.updateBiobuzzField(visual.handles,world);L.updateBiobuzzElements(visual.elements,world);for(const a of ['red','blue'])if(markers?.trays[a])markers.trays[a].rotation.x=L.hiveTiltAngle(world,a)-info.trays[a].reference;}
    if(world&&info?.field==='decode'){const seen=new Set();for(const ball of world.balls){if(['held','stock','scored'].includes(ball.state?.kind))continue;seen.add(ball.id);let mesh=ballMeshes.get(ball.id);if(!mesh){mesh=new THREE.Mesh(new THREE.SphereGeometry(2.5,16,12),new THREE.MeshStandardMaterial({color:ball.color==='purple'?0x9d68cb:0x64bc70,roughness:.7}));mesh.castShadow=true;mesh.receiveShadow=true;ballMeshes.set(ball.id,mesh);ballsHost.add(mesh);}mesh.position.set(ball.pos.x+72,ball.pos.y+72,Math.max(0,ball.z||0)+2.5);}for(const [id,mesh]of ballMeshes)if(!seen.has(id)){ballsHost.remove(mesh);dispose(mesh);ballMeshes.delete(id);}}
    clear(ghost);const e=frame?.estimate;if(e&&info){const c=window.DeckPlanner.body(e,info.footprint);ghost.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c.map(q=>v3(q,7))),new THREE.LineDashedMaterial({color:color('--warning'),dashSize:1.5,gapSize:1})).computeLineDistances());}
    beams();previewGhost();
  }
  // ---------------------------------------------------------------- route preview ghost
  // Plan → Paths preview: a see-through, low-poly robot drives the planned route without physics. With an imported
  // model it is that model in coarse blocks; without one, a pushbot chassis. At pins it acts out the action with
  // see-through pieces: shots arc to the goal, the intake side glows and pulls pieces in, a pause rings the floor.
  // One hologram blue in both themes: the theme accent is near black in light mode, which reads as solid, not see-through.
  const GHOST=0x5cc8ff,previewGroup=new THREE.Group(),previewFx=new THREE.Group();scene.add(previewGroup,previewFx);
  let previewKey='',fx=null;
  function ghostLook(){const accent=new THREE.Color(GHOST);return {fill:new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:.4,transparent:true,opacity:.26,depthWrite:false,roughness:.85}),
    edge:new THREE.LineBasicMaterial({color:accent,transparent:true,opacity:.55,depthWrite:false})};}
  // The model's surface sampled into cubes about 1/14 of its largest size: a low-poly copy that stays cheap to draw.
  function blocks(holder,look){
    holder.updateMatrixWorld(true);const inv=holder.matrixWorld.clone().invert(),size=new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3()),cell=Math.max(.75,Math.max(size.x,size.y,size.z)/14);
    const cells=new Map(),m=new THREE.Matrix4(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),mark=(x,y,z)=>{const k=[Math.floor(x/cell),Math.floor(y/cell),Math.floor(z/cell)];cells.set(k.join(),k);};
    let triangles=0;holder.traverse(o=>{if(o.isMesh&&o.geometry?.attributes?.position)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
    const stride=3*Math.max(1,Math.ceil(triangles/300000));
    holder.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes?.position)return;m.multiplyMatrices(inv,o.matrixWorld);const pos=o.geometry.attributes.position,idx=o.geometry.index,count=idx?idx.count:pos.count,at=i=>idx?idx.getX(i):i;
      for(let i=0;i+2<count;i+=stride){a.fromBufferAttribute(pos,at(i)).applyMatrix4(m);b.fromBufferAttribute(pos,at(i+1)).applyMatrix4(m);c.fromBufferAttribute(pos,at(i+2)).applyMatrix4(m);
        const n=Math.min(24,Math.ceil(Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))/(cell*.5)));
        for(let u=0;u<=n;u++)for(let v=0;v<=n-u;v++){const p=n?u/n:0,q=n?v/n:0;mark(a.x+(b.x-a.x)*p+(c.x-a.x)*q,a.y+(b.y-a.y)*p+(c.y-a.y)*q,a.z+(b.z-a.z)*p+(c.z-a.z)*q);}}});
    const group=new THREE.Group(),list=[...cells.values()];if(!list.length)return group;
    const cube=Object.assign(new THREE.InstancedMesh(new THREE.BoxGeometry(cell*.94,cell*.94,cell*.94),look.fill,list.length),{frustumCulled:false}),place=new THREE.Matrix4(),corners=new THREE.EdgesGeometry(new THREE.BoxGeometry(cell,cell,cell)).attributes.position.array,lines=new Float32Array(list.length*corners.length);
    list.forEach(([i,j,k],n)=>{const x=(i+.5)*cell,y=(j+.5)*cell,z=(k+.5)*cell;cube.setMatrixAt(n,place.makeTranslation(x,y,z));for(let r=0;r<corners.length;r+=3){lines[n*corners.length+r]=corners[r]+x;lines[n*corners.length+r+1]=corners[r+1]+y;lines[n*corners.length+r+2]=corners[r+2]+z;}});
    const outline=new THREE.BufferGeometry();outline.setAttribute('position',new THREE.BufferAttribute(lines,3));
    group.add(cube,new THREE.LineSegments(outline,look.edge));return group;
  }
  // A pushbot: two rails and cross members, four wheels, a deck and an arm, sized to the footprint.
  function pushbot(f,look){
    const group=new THREE.Group(),len=f.front+f.rear,w=2*f.half,mid=(f.front-f.rear)/2;
    const part=(geometry,x,y,z,turn)=>{const mesh=new THREE.Mesh(geometry,look.fill),edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,30),look.edge);for(const o of [mesh,edges]){o.position.set(x,y,z);if(turn)o.rotation.set(...turn);}group.add(mesh,edges);};
    for(const s of [-1,1])part(new THREE.BoxGeometry(len,1.5,2),mid,s*(f.half-1.5),3);
    for(const s of [-1,1])part(new THREE.BoxGeometry(1.5,w-4.5,2),mid+s*(len/2-.75),0,3);
    part(new THREE.BoxGeometry(len-3,w-4.5,.3),mid,0,2.2);
    for(const sx of [-1,1])for(const sy of [-1,1])part(new THREE.CylinderGeometry(2,2,1.2,10),mid+sx*(len/2-3.2),sy*(f.half-.6),2);
    part(new THREE.BoxGeometry(1.5,1.5,10),mid-len*.2,0,7.2);part(new THREE.BoxGeometry(len*.55,1.2,1.2),mid-len*.2+len*.27,0,12.2);part(new THREE.BoxGeometry(1.2,4,3),mid-len*.2+len*.55,0,11.2);
    part(new THREE.ConeGeometry(1.8,3.6,3),f.front-2.5,0,5.2,[0,0,-Math.PI/2]);return group;
  }
  function ghostBody(){const f=info?.footprint||{front:9,rear:9,half:9},key=JSON.stringify([body?.uuid||'',f]);if(key===previewKey)return;previewKey=key;
    clear(previewGroup);const look=ghostLook();previewGroup.add(body?blocks(body,look):pushbot(f,look));previewGroup.traverse(o=>{o.renderOrder=9;});
    for(const v of Object.values(fx||{}))v.dispose();const accent=new THREE.Color(GHOST),see=o=>new THREE.MeshBasicMaterial({color:accent,transparent:true,depthWrite:false,...o});
    fx={piece:new THREE.SphereGeometry(1.8,10,8),ring:new THREE.RingGeometry(.92,1,48),torus:new THREE.TorusGeometry(2.6,.35,6,20),slab:new THREE.BoxGeometry(1,1,1),
      solid:see({opacity:.45}),glow:see({opacity:.2,side:THREE.DoubleSide}),pulse:see({side:THREE.DoubleSide}),
      line:new THREE.LineDashedMaterial({color:accent,transparent:true,opacity:.7,dashSize:2,gapSize:1.4,depthWrite:false})};}
  function previewGhost(){
    // The effects share fx's geometry and materials; only each frame's aim arcs are their own.
    for(const o of [...previewFx.children]){previewFx.remove(o);if(o.isLine)o.geometry.dispose();}
    const q=state?.preview;previewGroup.visible=!!q;if(!q)return;ghostBody();
    previewGroup.position.set(q.x,q.y,0);previewGroup.rotation.set(0,0,q.heading*DEG);
    const a=q.act;if(!a)return;const h=q.heading*DEG,c=Math.cos(h),s=Math.sin(h),f=q.fp||info?.footprint||{front:9,rear:9,half:9},at=(ox,oy)=>({x:q.x+ox*c-oy*s,y:q.y+ox*s+oy*c});
    const k=a.progress??(performance.now()/900)%1,keep=o=>{o.renderOrder=10;previewFx.add(o);return o;},mesh=(g,m)=>keep(new THREE.Mesh(g,m));
    if(a.kind==='wait'||a.kind==='custom'){const ring=mesh(fx.ring,fx.pulse);fx.pulse.opacity=.5*(1-k);ring.scale.setScalar(Math.max(f.front,f.rear,f.half)+2+4*k);ring.position.set(q.x,q.y,.4);}
    if(a.kind==='intake')for(const side of a.intakes){const along=side==='front'||side==='back',sign=side==='front'||side==='left'?1:-1,edge=along?(sign>0?f.front:f.rear):f.half,span=along?2*f.half:f.front+f.rear;
      const o=along?at(sign*(edge+1.5),0):at((f.front-f.rear)/2,sign*(edge+1.5)),slab=mesh(fx.slab,fx.glow);slab.scale.set(along?3:span,along?span:3,4);slab.position.set(o.x,o.y,2.5);slab.rotation.set(0,0,h);
      for(let n=0;n<2;n++){const t=(k*2+n/2)%1,out=edge+12*(1-t),p=along?at(sign*out,(n?-1:1)*f.half*.4*(1-t)):at((n?-1:1)*f.half*.4*(1-t),sign*out),ball=mesh(fx.piece,fx.solid);ball.position.set(p.x,p.y,1.8);}}
    if(a.kind==='shoot'||a.kind==='aim'||a.kind==='spin')for(const sh of a.shooters){const [ox,oy]=window.DeckMechanisms.mountOffset(sh.mount,a.dims),o=at(ox,oy),dir=h+(sh.facing??0)*DEG;
      const goal=sh.facing===null&&a.target?{...a.target,z:22}:{x:o.x+Math.cos(dir)*48,y:o.y+Math.sin(dir)*48,z:2},from=new THREE.Vector3(o.x,o.y,12),to=new THREE.Vector3(goal.x,goal.y,goal.z),rise=Math.max(8,from.distanceTo(to)*.3);
      const arc=t=>from.clone().lerp(to,t).setZ(from.z+(to.z-from.z)*t+4*rise*t*(1-t));
      if(a.kind==='spin'){const spin=mesh(fx.torus,fx.solid);spin.position.copy(from);spin.rotation.set(Math.PI/2,0,dir+performance.now()/120);continue;}
      keep(new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({length:25},(_,j)=>arc(j/24))),fx.line)).computeLineDistances();
      if(a.kind==='shoot')for(let n=0;n<3;n++){const ball=mesh(fx.piece,fx.solid);ball.position.copy(arc((k*3+n/3)%1));}}
  }
  // ---------------------------------------------------------------- run video cameras
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),follow={ready:false,yaw:0,shot:0,hold:0,goal:null,still:0,wide:0,pos:new THREE.Vector3(),look:new THREE.Vector3()};
  // Where each shooter points while the robot spins up, aims or shoots: from its spot on the robot along its
  // turret (or fixed facing) to the goal it points at, if one is within 25° of that line.
  function aims(){
    const a=state?.aim,m=frame?.mechanisms,t=frame?.truth,c=m?.command||{};if(!a||!m||!t||!(c.feed||c.spin||c.aim||m.flywheel>.05))return [];
    const M=window.DeckMechanisms,h=t.heading*DEG;
    return a.shooters.map((s,n)=>{const [ox,oy]=M.mountOffset(s.mount,a.dims),x=t.x+ox*Math.cos(h)-oy*Math.sin(h),y=t.y+ox*Math.sin(h)+oy*Math.cos(h);
      const dir=h+(s.type==='turret'?(m.turrets?.[n]??m.turret??0):M.FACING[s.facing]||0)*DEG;let len=48,goal=null;
      for(const g of a.targets){const d=Math.hypot(g.x-x,g.y-y);if(Math.abs(wrap(Math.atan2(g.y-y,g.x-x)-dir))<25*DEG&&(!goal||d<len)){len=d;goal=g;}}
      return {x,y,dir,len,goal,on:!!(m.ready&&m.aligned)};});
  }
  // A beam along each shooter's aim: amber while it spins up or turns, green once it is ready and on target.
  const beamGroup=new THREE.Group(),beamParts=[];scene.add(beamGroup);
  function beams(){
    const list=aims();beamGroup.visible=list.length>0;
    list.forEach((b,n)=>{let p=beamParts[n];if(!p){const bar=new THREE.BoxGeometry(1,.7,.7);bar.translate(.5,0,0);p={bar:new THREE.Mesh(bar,new THREE.MeshBasicMaterial({transparent:true,opacity:.75,depthWrite:false})),end:new THREE.Mesh(new THREE.SphereGeometry(1.6,16,10),new THREE.MeshBasicMaterial({transparent:true,opacity:.85,depthWrite:false}))};p.bar.renderOrder=p.end.renderOrder=11;beamGroup.add(p.bar,p.end);beamParts[n]=p;}
      const hex=b.on?0x49cbb3:0xf2bc62;p.bar.material.color.setHex(hex);p.end.material.color.setHex(hex);p.bar.visible=p.end.visible=true;
      p.bar.position.set(b.x,b.y,13);p.bar.rotation.set(0,0,b.dir);p.bar.scale.set(b.len,1,1);p.end.position.set(b.x+Math.cos(b.dir)*b.len,b.y+Math.sin(b.dir)*b.len,13);});
    for(const p of beamParts.slice(list.length)){p.bar.visible=p.end.visible=false;}
  }
  // The orthographic camera straight above the field, fitted to a picture of the given shape.
  function fitTop(aspect,margin){const b=info?.bounds||{x0:0,y0:0,x1:144,y1:144},cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2,hh=Math.max((b.y1-b.y0)/2,(b.x1-b.x0)/2/aspect)*margin;
    Object.assign(top,{left:-hh*aspect,right:hh*aspect,top:hh,bottom:-hh});top.position.set(cx,cy,1000);top.lookAt(cx,cy,0);top.updateProjectionMatrix();}
  // The follow camera: behind the robot and above it, turning with it (smoothly, so turning on the spot does not
  // whip the picture round). While the robot spins up, aims or shoots, and for 2 s after, the camera swings
  // behind the robot towards the goal and pulls up, so the robot, its aim and where the pieces land are all in view.
  // A robot that has stood still for 1.5 s (parked, or waiting) is seen from further back and higher up.
  function chase(dt){
    const t=frame?.truth||state?.start;if(!t)return;if(!dt)follow.ready=false;
    const k=tau=>follow.ready?1-Math.exp(-Math.max(0,dt)/tau):1,f=info?.footprint||{front:9,rear:9},size=Math.max(14,f.front+f.rear),h=t.heading*DEG;
    follow.yaw+=wrap(h-follow.yaw)*k(.7);
    const goal=aims().find(b=>b.goal)?.goal;if(goal){follow.goal=goal;follow.hold=2;}else follow.hold=Math.max(0,follow.hold-dt);
    follow.shot+=((follow.hold>0&&follow.goal?1:0)-follow.shot)*k(.6);
    follow.still=Math.hypot(t.vx||0,t.vy||0)>2||Math.abs(t.omega||0)>10?0:follow.still+Math.max(0,dt);follow.wide+=((follow.still>1.5?1:0)-follow.wide)*k(1.2);
    const r=new THREE.Vector3(t.x,t.y,0),dir=new THREE.Vector3(Math.cos(follow.yaw),Math.sin(follow.yaw),0);
    const far=1+.7*follow.wide,pos=r.clone().addScaledVector(dir,-size*2.4*far).setZ(size*2.3*(1+.9*follow.wide)),look=r.clone().addScaledVector(dir,size*1.8).setZ(0);
    if(follow.shot>.001&&follow.goal){const g=new THREE.Vector3(follow.goal.x,follow.goal.y,0),to=g.clone().sub(r),d=to.length()>1?to.clone().normalize():dir;
      pos.lerp(r.clone().addScaledVector(d,-size*2.4).setZ(size*2.6),follow.shot);look.lerp(r.clone().addScaledVector(to,.4).setZ(16),follow.shot);}
    // Not far outside the field, where the camera would look through the perimeter.
    const b=info?.bounds;if(b){pos.x=Math.max(b.x0-18,Math.min(b.x1+18,pos.x));pos.y=Math.max(b.y0-18,Math.min(b.y1+18,pos.y));}
    follow.pos.lerp(pos,k(.3));follow.look.lerp(look,k(.3));if(!follow.ready){follow.pos.copy(pos);follow.look.copy(look);}follow.ready=true;
    camera.position.copy(follow.pos);camera.lookAt(follow.look);
  }
  // Draws the next picture of a run video `dt` seconds after the last, from above ('top') or following the robot
  // ('chase'). The follow camera has the whole field from above in its corner; `inset` says where, to frame it.
  function shoot(nextFrame,nextState,dt,view='chase'){
    frame=nextFrame;state=nextState||state;prepare();renderer.setScissorTest(false);renderer.setViewport(0,0,W,H);
    if(view==='top'){fitTop(W/H,1.06);renderer.render(scene,top);return {canvas:renderer.domElement,inset:null};}
    chase(dt);renderer.render(scene,camera);
    const s=Math.round(H*.3),pad=Math.round(H*.03);fitTop(1,1.04);renderer.setScissorTest(true);renderer.setScissor(W-s-pad,pad,s,s);renderer.setViewport(W-s-pad,pad,s,s);renderer.render(scene,top);renderer.setScissorTest(false);renderer.setViewport(0,0,W,H);
    return {canvas:renderer.domElement,inset:{x:W-s-pad,y:H-s-pad,size:s}};
  }
  function resize(){const w=Math.max(1,box.clientWidth),h=Math.max(1,box.clientHeight),size=renderer.getSize(new THREE.Vector2());if(size.x!==w||size.y!==h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
  controls?.addEventListener('change',schedule);
  const themeObserver=new MutationObserver(()=>{if(info)setField(info);});themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});const scheme=matchMedia('(prefers-color-scheme: dark)'),themeChanged=()=>{if(info)setField(info);};scheme.addEventListener('change',themeChanged);
  return {setField,setModel,update,shoot,resize:()=>{resize();schedule();},dispose(){disposed=true;fieldSequence++;cancelAnimationFrame(raf);themeObserver.disconnect();scheme.removeEventListener('change',themeChanged);navigator?.dispose();controls?.dispose();clear(scene);renderer.dispose();renderer.forceContextLoss();host.replaceChildren();}};
}};
