/* 3D view for the path-planning simulator, drawn in the app's own flat style with three.js.
   Field frame: inches, bottom-left origin, +X right, +Y up (z up). Obstacles are the game's field
   parts the planner avoids; BIOBUZZ's overhead structures are shown as simple solids. Empty and
   DECODE fields step planar physics; drawing them in 3D does not make their physics 3D. */
window.DeckSim3D={create(host){
  'use strict';
  const L=window.DeckThree,THREE=L.THREE,DEG=Math.PI/180;
  host.innerHTML='<div class="sim-3d-canvas"></div><p class="sim-3d-note hint" id="sim-3d-note"></p>';
  const box=host.querySelector('.sim-3d-canvas'),note=host.querySelector('#sim-3d-note');
  let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{note.textContent='3D needs WebGL, which this device did not provide.';return {setField(){},setModel(){},update(){},resize(){},dispose(){}};}
  renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));box.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,1,3000);camera.up.set(0,0,1);camera.position.set(72,-95,150);
  const controls=new L.OrbitControls(camera,renderer.domElement);controls.target.set(72,72,0);controls.maxPolarAngle=Math.PI*.49;controls.update();
  scene.add(new THREE.HemisphereLight(0xffffff,0x5a6270,2.2));const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(130,-40,220);scene.add(sun);
  const fieldGroup=new THREE.Group(),overlay=new THREE.Group(),robotGroup=new THREE.Group(),ghost=new THREE.Group();scene.add(fieldGroup,overlay,robotGroup,ghost);
  let info=null,frame=null,state=null,body=null,raf=0,lastOverlay='';
  const css=name=>getComputedStyle(document.documentElement).getPropertyValue(name).trim()||'#888',color=name=>new THREE.Color(css(name));
  function dispose(object){object.traverse(o=>{o.geometry?.dispose?.();for(const m of [].concat(o.material||[]))m.dispose?.();});}
  // The robot model's geometry belongs to the model module; only drop our own objects.
  function clear(group){for(const c of [...group.children]){group.remove(c);if(c.userData.keep!==true)dispose(c);}}
  const v3=(p,z=0)=>new THREE.Vector3(p.x,p.y,z);
  function prism(points,height,material,z=0){const m=new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(points.map(p=>new THREE.Vector2(p.x,p.y))),{depth:height,bevelEnabled:false}),material);m.position.z=z;return m;}
  function line(points,material,z){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>v3(p,z))),material);if(material.isLineDashedMaterial)l.computeLineDistances();return l;}
  function setField(nextInfo){
    info=nextInfo;clear(fieldGroup);scene.background=color('--bg');
    const b=info?.bounds||{x0:0,y0:0,x1:144,y1:144},w=b.x1-b.x0,h=b.y1-b.y0;
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({color:color('--surface'),roughness:.95}));floor.position.set((b.x0+b.x1)/2,(b.y0+b.y1)/2,0);fieldGroup.add(floor);
    const grid=[];for(let v=24;v<144;v+=24)grid.push(v3({x:v,y:b.y0},.05),v3({x:v,y:b.y1},.05),v3({x:b.x0,y:v},.05),v3({x:b.x1,y:v},.05));
    fieldGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid),new THREE.LineBasicMaterial({color:color('--line-strong')})));
    const wall=new THREE.MeshStandardMaterial({color:color('--line-strong'),transparent:true,opacity:.35});
    for(const [x,y,sx,sy] of [[b.x0-.5,(b.y0+b.y1)/2,1,h+2],[b.x1+.5,(b.y0+b.y1)/2,1,h+2],[(b.x0+b.x1)/2,b.y0-.5,w+2,1],[(b.x0+b.x1)/2,b.y1+.5,w+2,1]]){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,12),wall);m.position.set(x,y,6);fieldGroup.add(m);}
    const solid=new THREE.MeshStandardMaterial({color:0x8a919c,roughness:.8});for(const z of info?.fieldZones||[])fieldGroup.add(prism(window.DeckPlanner.polygon(z),info.field==='biobuzz'?4:12,solid));
    const frameMat=new THREE.MeshStandardMaterial({color:0x9aa1ab,roughness:.7,transparent:true,opacity:.55});
    for(const hull of info?.structures||[]){const pts=[];for(let i=0;i<hull.length;i+=3)pts.push(new THREE.Vector3(hull[i],hull[i+1],hull[i+2]));try{fieldGroup.add(new THREE.Mesh(new L.ConvexGeometry(pts),frameMat));}catch{}}
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
      else overlay.add(prism(p,3,red));}
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
    if(p){robotGroup.position.set(p.x,p.y,t?.z||0);robotGroup.rotation.set(0,0,p.heading*DEG);}
    clear(ghost);const e=frame?.estimate;if(e&&info){const c=window.DeckPlanner.body(e,info.footprint);ghost.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(c.map(q=>v3(q,7))),new THREE.LineDashedMaterial({color:color('--warning'),dashSize:1.5,gapSize:1})).computeLineDistances());}
    controls.update();renderer.render(scene,camera);
  }
  function resize(){const w=Math.max(1,box.clientWidth),h=Math.max(1,box.clientHeight),size=renderer.getSize(new THREE.Vector2());if(size.x!==w||size.y!==h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
  controls.addEventListener('change',schedule);
  return {setField,setModel,update,resize:()=>{resize();schedule();},dispose(){cancelAnimationFrame(raf);clear(scene);renderer.dispose();host.replaceChildren();}};
}};
