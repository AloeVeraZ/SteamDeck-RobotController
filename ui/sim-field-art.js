/* App-owned field drawing. Measurements come from the physics adapter; no upstream renderer,
   texture, UI or scene model is used. Overhead projections are distinct from floor obstacles. */
window.DeckFieldArt={
  draw2d(host,game,info,svg){
    const P=window.DeckPlanner,group=svg('g',{class:'sim-field-detail'}),outline=points=>points.map(p=>`${p.x},${p.y}`).join(' '),red='#dc6571',blue='#5d93dc';
    host.replaceChildren(group);
    for(const z of info?.fieldZones||[])group.append(svg('polygon',{class:'sim-obstacle',points:outline(P.polygon(z))}));
    if(game==='decode'){
      for(const goal of info?.goals||[]){const color=goal.alliance==='red'?red:blue;group.append(svg('polygon',{points:outline(goal.triangle),fill:color,'fill-opacity':'.16',stroke:color,'stroke-width':'.65'}));}
      for(const [mirror,color] of [[false,blue],[true,red]]){const g=svg('g',{transform:mirror?'translate(144 0) scale(-1 1)':''});
        g.append(svg('path',{d:'M8 8H32V32H8Z',class:'sim-field-tape',stroke:color,opacity:'.7'}));
        for(let y=76;y<140;y+=6)g.append(svg('path',{d:`M.8 ${y}H5.2`,stroke:'var(--muted)','stroke-width':'.5'}));
        group.append(g);
      }
      group.append(svg('path',{d:'M48 0L72 24 96 0M48 144L72 120 96 144',fill:'none',stroke:'var(--muted)','stroke-width':'.6','stroke-dasharray':'2 1'}));
    }
    if(game==='biobuzz'){
      // Project each overhead tray, retaining a dashed outline so it is not mistaken for a
      // floor no-go zone. The physical hive legs underneath remain solid.
      for(const part of info?.structureParts||[]){if(!part.alliance)continue;const xy=[];for(let i=0;i<part.points.length;i+=3)xy.push({x:part.points[i],y:part.points[i+1]});const p=P.hull(xy);group.append(svg('polygon',{points:outline(p),fill:part.alliance==='red'?red:blue,'fill-opacity':'.06',stroke:part.alliance==='red'?red:blue,'stroke-width':'.3','stroke-dasharray':'1 .8'}));}
      for(const f of info?.flowers||[]){const r=f.rings.at(-1);if(r)group.append(svg('circle',{cx:r.x,cy:r.y,r:3.1,fill:'var(--surface)',stroke:'#9eaa50','stroke-width':'.7'}),svg('circle',{cx:r.x,cy:r.y,r:r.hole,fill:'var(--well)',stroke:'#9eaa50','stroke-width':'.35'}));}
      for(const [x,y,c] of [[14,4,blue],[106,136,red]])group.append(svg('path',{d:`M${x} ${y}h24v4h-24Z`,fill:c,'fill-opacity':'.18',stroke:c,'stroke-width':'.6'}));
    }
  },
  build3d(group,info,T,L,palette){
    const b=info?.bounds||{x0:0,y0:0,x1:144,y1:144},w=b.x1-b.x0,h=b.y1-b.y0,metal=new T.MeshStandardMaterial({color:0xa4adb6,metalness:.35,roughness:.4});
    const material=(color,options={})=>new T.MeshStandardMaterial({color,roughness:.7,...options});
    function box(x,y,z,sx,sy,sz,mat){const m=new T.Mesh(new T.BoxGeometry(sx,sy,sz),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;}
    const floorMat=material(palette.surface),alternate=material(new T.Color(palette.surface).multiplyScalar(.94));
    const pitch=Math.max(24,Math.ceil(Math.max(w,h)/1536)*24);for(let x=b.x0,i=0;x<b.x1;x+=pitch,i++)for(let y=b.y0,j=0;y<b.y1;y+=pitch,j++){const sx=Math.min(pitch,b.x1-x),sy=Math.min(pitch,b.y1-y);box(x+sx/2,y+sy/2,-.4,Math.max(.1,sx-.08),Math.max(.1,sy-.08),.8,(i+j)%2?floorMat:alternate);}
    const glass=material(palette.line,{transparent:true,opacity:.12,metalness:.1,depthWrite:false}),rail=material(0x616b76,{metalness:.65,roughness:.4});
    for(const [x,y,sx,sy] of [[b.x0-.5,(b.y0+b.y1)/2,1,h+2],[b.x1+.5,(b.y0+b.y1)/2,1,h+2],[(b.x0+b.x1)/2,b.y0-.5,w+2,1],[(b.x0+b.x1)/2,b.y1+.5,w+2,1]]){box(x,y,6,sx,sy,12,glass);box(x,y,.4,sx+.1,sy+.1,.8,rail);box(x,y,11.5,sx+.1,sy+.1,.7,rail);}
    for(const x of [b.x0,b.x1])for(const y of [b.y0,b.y1])box(x,y,6,1,1,12,metal);
    function hull(part,mat){const pts=[];for(let i=0;i<part.points.length;i+=3)pts.push(new T.Vector3(...part.points.slice(i,i+3)));try{const geometry=new L.ConvexGeometry(pts),mesh=new T.Mesh(geometry,mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);const edges=new T.LineSegments(new T.EdgesGeometry(geometry,35),new T.LineBasicMaterial({color:palette.line,transparent:true,opacity:.35}));group.add(edges);}catch{}}
    if(info?.field==='biobuzz'){
      const red=material(0xc95260,{metalness:.25}),blue=material(0x4f86c6,{metalness:.25}),mesh=material(0xa8b5bd,{transparent:true,opacity:.34,depthWrite:false});
      for(const part of info.structureParts||[])hull(part,part.alliance?(part.kind==='tray_roof'?mesh:part.alliance==='red'?red:blue):part.kind==='flower_support'?material(0x91a645):metal);
      for(const f of info.flowers||[])for(const r of f.rings){const shape=new T.Shape(),outer=r.hole+.85;shape.absarc(0,0,outer,0,Math.PI*2,false);const hole=new T.Path();hole.absarc(0,0,r.hole,0,Math.PI*2,true);shape.holes.push(hole);const ring=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:r.z[1]-r.z[0],bevelEnabled:false,curveSegments:24}),material(0xa8b65e));ring.position.set(r.x,r.y,r.z[0]);ring.castShadow=true;group.add(ring);}
    }else if(info?.field==='decode'){
      // Original schematic baskets, frames and classifier channels. Their plan dimensions
      // and opening height come from engine measurements; the physics remains planar.
      const beam=(a,b,r,mat)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),d=end.clone().sub(start),m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),8),mat);m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());m.castShadow=true;group.add(m);};
      for(const goal of info.goals||[]){const p=goal.triangle,z=goal.openingZ,cx=p.reduce((s,q)=>s+q.x,0)/3,cy=p.reduce((s,q)=>s+q.y,0)/3,inner=p.map(q=>({x:cx+(q.x-cx)*.55,y:cy+(q.y-cy)*.55})),mat=material(goal.alliance==='red'?0xc95260:0x4f86c6,{side:T.DoubleSide,metalness:.2});
        for(let i=0;i<3;i++){const j=(i+1)%3,a=p[i],b=p[j],u=inner[i],v=inner[j],g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([a.x,a.y,z,b.x,b.y,z,v.x,v.y,z-10,a.x,a.y,z,v.x,v.y,z-10,u.x,u.y,z-10],3));g.computeVertexNormals();const panel=new T.Mesh(g,mat);panel.castShadow=true;panel.receiveShadow=true;group.add(panel);beam([a.x,a.y,z],[b.x,b.y,z],.4,metal);beam([u.x,u.y,0],[u.x,u.y,z-10],.55,metal);}
        const basin=new T.Mesh(new T.ShapeGeometry(new T.Shape(inner.map(q=>new T.Vector2(q.x,q.y)))),material(0x404953,{side:T.DoubleSide}));basin.position.z=z-10;group.add(basin);
        const c=goal.classifier,x=(c.x0+c.x1)/2,width=c.x1-c.x0,near=c.y0,far=c.y1-8,low=4,high=c.height;
        for(const edge of [c.x0+.4,c.x1-.4]){beam([edge,near,low],[edge,far,high],.35,metal);for(let y=near+8;y<far;y+=16)beam([edge,y,0],[edge,y,low+(high-low)*(y-near)/(far-near)],.3,metal);}
        for(let y=near;y<far;y+=4){const h0=low+(high-low)*(y-near)/(far-near);box(x,y,h0,width-.6,3.7,.45,mat);}
        beam([p[0].x,p[0].y,z+5],[p[2].x,p[2].y,z+5],.45,metal);for(const q of [p[0],p[2]])beam([q.x,q.y,z],[q.x,q.y,z+5],.35,metal);
      }
    }
    // Flat alliance markers, drawn by this app (not a texture or copied field artwork).
    if(info?.field!=='empty')for(const [x,y,color] of [[18,3,0x4f86c6],[126,141,0xc95260]])box(x,y,.04,22,.7,.08,material(color));
  }
};
