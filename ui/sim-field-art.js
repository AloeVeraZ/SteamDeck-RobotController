/* Local DSIM field visuals, requested by the user. PolyForm Noncommercial 1.0.0.
   Required Notice: Copyright 2026 Dohun Kim (https://github.com/genius0412)
   Full engine and field-CAD notices are installed in vendor/licenses/. */
window.DeckFieldArt=(()=>{
  'use strict';
  const pictures=new Map();
  function picture(game){
    const L=window.DeckThree;if(!L?.drawDsimField||game==='empty')return null;
    if(pictures.has(game))return pictures.get(game);
    const canvas=document.createElement('canvas'),pad=9,ppi=10;canvas.width=canvas.height=(144+2*pad)*ppi;
    const ctx=canvas.getContext('2d');ctx.setTransform(ppi,0,0,-ppi,(72+pad)*ppi,(72+pad)*ppi);L.drawDsimField(ctx,game);
    const value={url:canvas.toDataURL('image/png'),pad};pictures.set(game,value);return value;
  }
  // The planner's own top-down field: plain tiles (drawn by the page), each structure as its outline from
  // above, tinted for its alliance, and the floor-level boundaries the planner keeps the robot out of.
  function draw2d(host,game,info,svg){
    const group=svg('g',{class:'sim-field-detail','data-field-art':game}),P=window.DeckPlanner,list=p=>p.map(q=>`${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ');host.replaceChildren(group);
    // An alliance's tray is many solids; from above it reads as one outline.
    const flat=part=>{const p=[];for(let i=0;i<part.points.length;i+=3)p.push({x:part.points[i],y:part.points[i+1]});return p;},trays={},parts=[];
    for(const part of info?.structureParts||[])if(part.alliance)(trays[part.alliance]||=[]).push(...flat(part));else parts.push({part,outline:flat(part)});
    for(const [alliance,points] of Object.entries(trays))parts.push({part:{alliance},outline:points});
    for(const s of parts)s.outline=s.outline.length>2?P.hull(s.outline):[];
    // Largest first, so small parts on top of a frame stay visible.
    const area=p=>Math.abs(p.reduce((s,q,i)=>{const r=p[(i+1)%p.length];return s+q.x*r.y-r.x*q.y;},0))/2;parts.sort((a,b)=>area(b.outline)-area(a.outline));
    for(const {part,outline} of parts)if(outline.length>2)group.append(svg('polygon',{class:'sim-field-structure'+(part.alliance?' '+part.alliance:''),points:list(outline)}));
    for(const goal of info?.goals||[])group.append(svg('polygon',{class:'sim-field-structure '+goal.alliance,points:list(goal.triangle)}));
    for(const flower of info?.flowers||[]){const r=flower.rings[0];if(r)group.append(svg('circle',{class:'sim-field-ring',cx:r.x,cy:r.y,r:r.hole+.85}));}
    for(const z of info?.fieldZones||[])group.append(svg('polygon',{class:'sim-physical-boundary',points:list(P.polygon(z)),'data-physical-boundary':z.id}));
  }
  const cache=new Map();
  // Which licensed field models this build includes (personal local builds only; set by the window).
  const available={decode:true,biobuzz:true};
  // Without the field CAD: DSIM's 2D field drawing on the floor, perimeter walls, and the physical
  // structures raised from the physics outlines, so the view still matches what the robot hits.
  function schematic(info,T,palette,game){
    const group=new T.Group(),art=picture(game),size=144+2*(art?.pad||0);
    const floor=new T.Mesh(new T.PlaneGeometry(size,size),new T.MeshStandardMaterial({color:art?0xffffff:palette.surface,roughness:.9}));floor.position.set(72,72,0);floor.receiveShadow=true;group.add(floor);
    if(art)new T.TextureLoader().load(art.url,texture=>{texture.colorSpace=T.SRGBColorSpace;floor.material.map=texture;floor.material.needsUpdate=true;});
    const wall=new T.MeshStandardMaterial({color:0x89939f,transparent:true,opacity:.3,depthWrite:false});
    for(const [x,y,sx,sy] of [[-.5,72,1,146],[144.5,72,1,146],[72,-.5,146,1],[72,144.5,146,1]]){const m=new T.Mesh(new T.BoxGeometry(sx,sy,12),wall);m.position.set(x,y,6);group.add(m);}
    const solid=new T.MeshStandardMaterial({color:0x7d8794,roughness:.7,transparent:true,opacity:.72});
    for(const zone of info?.fieldZones||[]){const shape=new T.Shape(window.DeckPlanner.polygon(zone).map(p=>new T.Vector2(p.x,p.y))),height=zone.type==='polygon'?18:zone.width<10?16:18;
      const mesh=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}),solid);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
    group.userData.keep=true;return {group};
  }
  // `own` builds a copy of its own (for a second camera, such as a run video): a scene object has one parent,
  // so the shared copy would leave the field view it was in.
  async function build3d(group,info,T,L,palette,{own=false}={}){
    const game=info?.field||'empty';
    if(game==='empty'){
      const b=info?.bounds||{x0:0,y0:0,x1:144,y1:144},w=b.x1-b.x0,h=b.y1-b.y0,mat=new T.MeshStandardMaterial({color:palette.surface,roughness:.9}),floor=new T.Mesh(new T.BoxGeometry(w,h,.6),mat);floor.position.set((b.x0+b.x1)/2,(b.y0+b.y1)/2,-.3);floor.receiveShadow=true;group.add(floor);
      const lines=[],pitch=Math.max(24,Math.ceil(Math.max(w,h)/1536)*24);for(let x=b.x0;x<=b.x1;x+=pitch)lines.push(x,b.y0,.02,x,b.y1,.02);for(let y=b.y0;y<=b.y1;y+=pitch)lines.push(b.x0,y,.02,b.x1,y,.02);const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(lines,3));group.add(new T.LineSegments(g,new T.LineBasicMaterial({color:palette.line,transparent:true,opacity:.45})));
      const wallMat=new T.MeshStandardMaterial({color:0x89939f,transparent:true,opacity:.18,depthWrite:false});for(const [x,y,sx,sy] of [[b.x0-.5,(b.y0+b.y1)/2,1,h+2],[b.x1+.5,(b.y0+b.y1)/2,1,h+2],[(b.x0+b.x1)/2,b.y0-.5,w+2,1],[(b.x0+b.x1)/2,b.y1+.5,w+2,1]]){const wall=new T.Mesh(new T.BoxGeometry(sx,sy,12),wallMat);wall.position.set(x,y,6);group.add(wall);}return {group};
    }
    const make=async()=>{
      // DSIM falls back to its constants-built BIOBUZZ field when the CAD file is absent.
      if(game==='biobuzz'){const handles=await L.buildBiobuzzField('high'),elements=L.buildBiobuzzElements(available.biobuzz?'cad':'sphere');handles.group.add(elements.group);handles.group.position.set(72,72,0);handles.group.userData.keep=true;return {group:handles.group,handles,elements};}
      if(!available.decode)return schematic(info,T,palette,game);
      const loader=new L.GLTFLoader();loader.setMeshoptDecoder(L.MeshoptDecoder);const model=(await loader.loadAsync(new URL('vendor/models/decode/field.glb',document.baseURI).href)).scene;
      model.scale.set(72/70.1913149,72/70.1913149,1);model.position.set(72,72,0);model.userData.keep=true;
      model.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;for(const m of [].concat(o.material||[])){if(m.name==='tile'){m.color.set(0x41464c);m.roughness=.95;o.castShadow=false;}if(m.name==='tape'){o.castShadow=false;m.polygonOffset=true;m.polygonOffsetFactor=-2;m.polygonOffsetUnits=-2;}if(m.name==='glass'){m.opacity=.08;m.transparent=true;m.depthWrite=false;}}});
      return {group:model};
    };
    if(own){const visual=await make();group.add(visual.group);return visual;}
    if(!cache.has(game))cache.set(game,make().catch(e=>{cache.delete(game);throw e;}));
    const visual=await cache.get(game);group.add(visual.group);return visual;
  }
  function hitboxes(info,T,L){
    const group=new T.Group(),red=new T.LineBasicMaterial({color:0xff6373,transparent:true,opacity:.92,depthTest:false}),cyan=new T.LineBasicMaterial({color:0x5de8ed,depthTest:false});
    const outline=(geometry,parent=group,material=red)=>{const line=new T.LineSegments(new T.EdgesGeometry(geometry,12),material);line.renderOrder=10;parent.add(line);return line;};
    const b=info?.bounds;if(b){const line=outline(new T.BoxGeometry(b.x1-b.x0,b.y1-b.y0,12));line.position.set((b.x0+b.x1)/2,(b.y0+b.y1)/2,6);}
    const trays={};for(const [a,pose]of Object.entries(info?.trays||{})){trays[a]=new T.Group();trays[a].position.set(...pose.pivot);group.add(trays[a]);}
    for(const part of info?.structureParts||[]){const points=[],pivot=part.alliance?info.trays[part.alliance].pivot:[0,0,0];for(let i=0;i<part.points.length;i+=3)points.push(new T.Vector3(...part.points.slice(i,i+3).map((v,j)=>v-pivot[j])));if(points.length>=4)try{outline(new L.ConvexGeometry(points),trays[part.alliance]||group);}catch{}}
    for(const f of info?.flowers||[])for(const r of f.rings){const radius=r.hole+.85,box=outline(new T.BoxGeometry(radius*2,radius*2,r.z[1]-r.z[0]));box.position.set(r.x,r.y,(r.z[0]+r.z[1])/2);}
    if(info?.field!=='biobuzz')for(const zone of info?.fieldZones||[]){const shape=new T.Shape(window.DeckPlanner.polygon(zone).map(p=>new T.Vector2(p.x,p.y))),height=zone.type==='polygon'?43:zone.width<10?16:43;outline(new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}));}
    const fp=info?.footprint||{front:9,rear:9,half:9},height=info?.robot?.heightIn||12,robot=new T.Group(),box=outline(new T.BoxGeometry(fp.front+fp.rear,fp.half*2,height),robot,cyan);box.position.set((fp.front-fp.rear)/2,0,height/2);group.add(robot);return {group,robot,trays};
  }
  return {picture,draw2d,build3d,hitboxes,available};
})();
