(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(()=>require('./vendor/planning.cjs'));else root.DeckPlanner=factory(()=>root.DeckPlanningLibs);})(typeof globalThis==='object'?globalThis:this,libs=>{
  'use strict';
  // Field frame: inches, bottom-left origin, +X right, +Y up, heading CCW in degrees.
  // The robot keeps its starting heading along the route, so obstacles are grown by the
  // exact footprint at that heading (a Minkowski sum) plus the requested clearance.
  const SIZE=144,EPS=1e-9,SCALE=1e4,TOL=1e-3,MIN_CLEARANCE=.05,rad=d=>d*Math.PI/180,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  // Clipper stores integers at 1e-4 inch, so a union vertex can sit up to ~7e-5 inch inside a
  // neighbouring grown polygon. TOL (10x that) classifies such points as ON the boundary.
  const finite=n=>typeof n==='number'&&Number.isFinite(n),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const FIELD={x0:0,y0:0,x1:SIZE,y1:SIZE};
  function polygon(zone){
    if(zone.type==='polygon')return zone.points.map(q=>({x:q.x,y:q.y}));
    let p;if(zone.type==='circle'){const count=24,r=zone.radius/Math.cos(Math.PI/count);p=Array.from({length:count},(_,i)=>({x:r*Math.cos(i*2*Math.PI/count),y:r*Math.sin(i*2*Math.PI/count)}));}
    else if(zone.type==='triangle')p=[{x:-zone.width/2,y:-zone.height/2},{x:zone.width/2,y:-zone.height/2},{x:0,y:zone.height/2}];
    else p=[{x:-zone.width/2,y:-zone.height/2},{x:zone.width/2,y:-zone.height/2},{x:zone.width/2,y:zone.height/2},{x:-zone.width/2,y:zone.height/2}];
    const c=Math.cos(rad(zone.angle||0)),s=Math.sin(rad(zone.angle||0));return p.map(v=>({x:zone.x+v.x*c-v.y*s,y:zone.y+v.x*s+v.y*c}));
  }
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const area=p=>p.reduce((s,q,i)=>{const r=p[(i+1)%p.length];return s+q.x*r.y-r.x*q.y;},0)/2;
  function convex(p){let sign=0;for(let i=0;i<p.length;i++){const c=cross(p[i],p[(i+1)%p.length],p[(i+2)%p.length]);if(Math.abs(c)<1e-9)continue;if(sign&&Math.sign(c)!==sign)return false;sign=Math.sign(c);}return true;}
  // Ear clipping for a simple polygon; null when the outline crosses itself.
  function triangulate(points){
    let p=points.slice();if(area(p)<0)p.reverse();const out=[];let guard=0;
    while(p.length>3&&guard++<500){
      let clipped=false;
      for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];if(cross(a,b,c)<=1e-9)continue;
        if(p.some(q=>q!==a&&q!==b&&q!==c&&cross(a,b,q)>=-1e-9&&cross(b,c,q)>=-1e-9&&cross(c,a,q)>=-1e-9))continue;
        out.push([a,b,c]);p.splice(i,1);clipped=true;break;}
      if(!clipped)return null;
    }
    if(p.length===3)out.push(p);return out;
  }
  // Two non-adjacent edges that touch or cross mean the outline is not a simple polygon.
  function selfCrossing(p){
    const n=p.length,hits=(a,b,c,d)=>{const d1=cross(c,d,a),d2=cross(c,d,b),d3=cross(a,b,c),d4=cross(a,b,d);return ((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0));};
    for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;if(hits(p[i],p[(i+1)%n],p[j],p[(j+1)%n]))return true;}
    return false;
  }
  // Convex pieces of a zone. A self-crossing outline is treated as its whole hull (safe side).
  function parts(zone){
    const p=polygon(zone);if(zone.type!=='polygon'||p.length<=3||convex(p))return [p];
    if(selfCrossing(p))return [hull(p)];
    return triangulate(p)||[hull(p)];
  }
  const zoneHits=(shape,zone)=>parts(zone).some(q=>overlap(shape,q));
  function hull(points){const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),lower=[],upper=[];for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=EPS)lower.pop();lower.push(p);}for(const p of sorted.slice().reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=EPS)upper.pop();upper.push(p);}return lower.slice(0,-1).concat(upper.slice(0,-1));}
  function footprintOf(raw){const f=raw||{front:9,rear:9,half:9};if(![f.front,f.rear,f.half].every(n=>finite(n)&&n>0))throw Error('Robot footprint dimensions must be positive finite inches.');return {front:f.front,rear:f.rear,half:f.half};}
  function body(pose,footprint={front:9,rear:9,half:9}){const c=Math.cos(rad(pose.heading)),s=Math.sin(rad(pose.heading));return [{x:footprint.front,y:footprint.half},{x:-footprint.rear,y:footprint.half},{x:-footprint.rear,y:-footprint.half},{x:footprint.front,y:-footprint.half}].map(p=>({x:pose.x+p.x*c-p.y*s,y:pose.y+p.x*s+p.y*c}));}
  function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/l,0,1):0;return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);}
  function boundaryDistance(p,poly){let d=Infinity;for(let i=0;i<poly.length;i++)d=Math.min(d,segmentDistance(p,poly[i],poly[(i+1)%poly.length]));return d;}
  function rayInside(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
  // Strictly inside by more than `tol`: boundary points (within tol) are free space.
  const inside=(p,poly,tol=TOL)=>rayInside(p,poly)&&boundaryDistance(p,poly)>tol;
  // Kept for callers that used the old name: strict=true means "inside, not on the boundary".
  function contains(p,poly,strict=false){return strict?inside(p,poly,1e-7):rayInside(p,poly)||boundaryDistance(p,poly)<=1e-7;}
  function overlap(a,b,eps=1e-7){for(const shape of [a,b])for(let i=0;i<shape.length;i++){
    const p=shape[i],q=shape[(i+1)%shape.length],axis={x:p.y-q.y,y:q.x-p.x},len=Math.hypot(axis.x,axis.y)||1,dot=v=>(v.x*axis.x+v.y*axis.y)/len,A=a.map(dot),B=b.map(dot);
    if(Math.max(...A)<=Math.min(...B)+eps||Math.max(...B)<=Math.min(...A)+eps)return false;
  }return true;}
  const inField=(points,field)=>points.every(p=>p.x>=field.x0-1e-7&&p.y>=field.y0-1e-7&&p.x<=field.x1+1e-7&&p.y<=field.y1+1e-7);
  function safePose(pose,zones,footprint,field=FIELD){if(!pose||![pose.x,pose.y,pose.heading].every(finite))return false;const corners=body(pose,footprint);return inField(corners,field)&&!zones.some(z=>zoneHits(corners,z));}
  // Exact swept check for a straight move at constant heading: the swept region of a convex
  // footprint is the convex hull of its start and end placements.
  function sweepClear(a,b,heading,zones,footprint,field=FIELD){const swept=hull([...body({...a,heading},footprint),...body({...b,heading},footprint)]);return inField(swept,field)&&!zones.some(z=>zoneHits(swept,z));}
  // Sampled sweep for moves that also turn (rotation makes the swept region non-convex).
  function safeSweep(a,b,zones,footprint,field=FIELD){const angle=((b.heading-a.heading+540)%360)-180;if(Math.abs(angle)<1e-9)return sweepClear(a,b,a.heading,zones,footprint,field);const n=Math.max(1,Math.ceil(dist(a,b)/.1),Math.ceil(Math.abs(angle)));for(let i=0;i<=n;i++){const t=i/n;if(!safePose({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,heading:a.heading+angle*t},zones,footprint,field))return false;}return true;}
  function inflated(zones,footprint,heading,clearance){const offsets=body({x:0,y:0,heading},footprint).map(p=>({x:-p.x,y:-p.y}));const ring=clearance>0?Array.from({length:16},(_,i)=>({x:clearance/Math.cos(Math.PI/16)*Math.cos(i*Math.PI/8),y:clearance/Math.cos(Math.PI/16)*Math.sin(i*Math.PI/8)})):[{x:0,y:0}];return zones.flatMap(zone=>parts(zone).map(part=>hull(part.flatMap(p=>offsets.flatMap(q=>ring.map(r=>({x:p.x+q.x+r.x,y:p.y+q.y+r.y})))))));}
  function boxOf(poly){const xs=poly.map(p=>p.x),ys=poly.map(p=>p.y);return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};}
  function segmentClear(a,b,polys,tol=TOL){
    for(const poly of polys){const box=poly.box||boxOf(poly);if(Math.max(a.x,b.x)<box.x0-tol||Math.min(a.x,b.x)>box.x1+tol||Math.max(a.y,b.y)<box.y0-tol||Math.min(a.y,b.y)>box.y1+tol)continue;
      if(inside(a,poly,tol)||inside(b,poly,tol))return false;
      const ts=[0,1],dx=b.x-a.x,dy=b.y-a.y;
      for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],ex=q.x-p.x,ey=q.y-p.y,den=dx*ey-dy*ex;if(Math.abs(den)<1e-12)continue;const t=((p.x-a.x)*ey-(p.y-a.y)*ex)/den,u=((p.x-a.x)*dy-(p.y-a.y)*dx)/den;if(t>0&&t<1&&u>=-1e-9&&u<=1+1e-9)ts.push(t);}
      ts.sort((x,y)=>x-y);for(let i=1;i<ts.length;i++){if(ts[i]-ts[i-1]<1e-12)continue;const t=(ts[i-1]+ts[i])/2;if(inside({x:a.x+dx*t,y:a.y+dy*t},poly,tol))return false;}
    }return true;
  }
  function validateZone(raw){
    if(raw?.type==='polygon'){
      if(!Array.isArray(raw.points)||raw.points.length<2||raw.points.length>40||!raw.points.every(q=>q&&finite(q.x)&&finite(q.y)))throw Error('A shape needs 2 to 40 points.');
      const points=raw.points.map(q=>({x:q.x,y:q.y}));
      if(points.length===2&&dist(points[0],points[1])<.25)throw Error('Make the wall at least 0.25 inches long.');
      return {id:String(raw.id||'zone').slice(0,80),type:'polygon',points,x:points.reduce((s,q)=>s+q.x,0)/points.length,y:points.reduce((s,q)=>s+q.y,0)/points.length,angle:0};
    }
    if(!raw||!['rect','circle','triangle'].includes(raw.type)||![raw.x,raw.y].every(finite))throw Error('Invalid barrier.');
    const z={id:String(raw.id||'zone').slice(0,80),type:raw.type,x:raw.x,y:raw.y,angle:finite(raw.angle)?raw.angle%360:0};
    if(z.type==='circle'){if(!finite(raw.radius)||raw.radius<.25)throw Error('Barrier radius must be at least 0.25 inches.');z.radius=raw.radius;}
    else{if(![raw.width,raw.height].every(n=>finite(n)&&n>=.25))throw Error('Barrier size must be at least 0.25 inches.');z.width=raw.width;z.height=raw.height;}
    return z;
  }
  function fieldOf(raw){const f=raw||FIELD;if(![f.x0,f.y0,f.x1,f.y1].every(finite)||f.x1-f.x0<1||f.y1-f.y0<1)throw Error('Invalid field bounds.');return {x0:f.x0,y0:f.y0,x1:f.x1,y1:f.y1};}
  // A point on a Bezier curve of any degree (de Casteljau). Pedro's BezierCurve uses the same control points.
  function bezier(points,t){let p=points.map(q=>({x:q.x,y:q.y}));while(p.length>1)p=p.slice(1).map((q,i)=>({x:p[i].x+(q.x-p[i].x)*t,y:p[i].y+(q.y-p[i].y)*t}));return p[0];}
  function plan(project,rawFootprint,fieldZones=[],rawField){
    if(!project||!Array.isArray(project.pins)||project.pins.length>32||!Array.isArray(project.zones)||project.zones.length>24)throw Error('Use at most 32 pins and 24 barriers.');
    const footprint=footprintOf(rawFootprint),field=fieldOf(rawField);
    const start=project.start;if(!start||![start.x,start.y,start.heading].every(finite))throw Error('Choose a finite starting pose.');
    const zones=project.zones.map(validateZone),all=zones.concat(fieldZones.map(validateZone));
    if(!safePose(start,all,footprint,field))throw Error('The starting footprint overlaps a barrier, a field element or the wall. Move it to a clear position.');
    const pins=project.pins.map((p,i)=>{if(!p||![p.x,p.y].every(finite)||p.x<field.x0||p.y<field.y0||p.x>field.x1||p.y>field.y1)throw Error(`Pin ${i+1} must be inside the field.`);return {x:p.x,y:p.y,pin:true,wait:finite(p.wait)?clamp(p.wait,0,30):0,action:typeof p.action==='string'?p.action.slice(0,40):''};});
    if(!pins.length)throw Error('Add a destination pin on the field first.');
    const clearance=clamp(finite(project.clearance)?project.clearance:1,MIN_CLEARANCE,6),heading=start.heading;
    const polys=inflated(all,footprint,heading,clearance),smoothPolys=inflated(all,footprint,heading,clearance/2),offsets=body({x:0,y:0,heading},footprint);
    for(const p of [...polys,...smoothPolys])p.box=boxOf(p);
    // Robot-centre box that keeps every corner inside the field at this heading.
    const bounds={x0:field.x0-Math.min(...offsets.map(p=>p.x)),x1:field.x1-Math.max(...offsets.map(p=>p.x)),y0:field.y0-Math.min(...offsets.map(p=>p.y)),y1:field.y1-Math.max(...offsets.map(p=>p.y))};
    const within=p=>p.x>=bounds.x0-1e-7&&p.x<=bounds.x1+1e-7&&p.y>=bounds.y0-1e-7&&p.y<=bounds.y1+1e-7;
    const {ClipperLib,dijkstra}=libs();if(!ClipperLib||!dijkstra)throw Error('Planning libraries are unavailable.');
    const union=[];
    if(polys.length){const clip=new ClipperLib.Clipper();clip.AddPaths(polys.map(p=>p.map(v=>({X:Math.round(v.x*SCALE),Y:Math.round(v.y*SCALE)}))),ClipperLib.PolyType.ptSubject,true);clip.Execute(ClipperLib.ClipType.ctUnion,union,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);}
    const candidates=union.flatMap(p=>p.map(v=>({x:v.X/SCALE,y:v.Y/SCALE}))).filter(within);
    // Where a grown obstacle meets the reachable box (an obstacle against a wall).
    for(const poly of polys)for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];
      for(const x of [bounds.x0,bounds.x1])if(Math.abs(b.x-a.x)>1e-12){const t=(x-a.x)/(b.x-a.x);if(t>=0&&t<=1){const p={x,y:a.y+t*(b.y-a.y)};if(within(p))candidates.push(p);}}
      for(const y of [bounds.y0,bounds.y1])if(Math.abs(b.y-a.y)>1e-12){const t=(y-a.y)/(b.y-a.y);if(t>=0&&t<=1){const p={x:a.x+t*(b.x-a.x),y};if(within(p))candidates.push(p);}}}
    candidates.push({x:bounds.x0,y:bounds.y0},{x:bounds.x1,y:bounds.y0},{x:bounds.x1,y:bounds.y1},{x:bounds.x0,y:bounds.y1});
    const vertices=candidates.filter(p=>!polys.some(poly=>inside(p,poly))).filter((p,i,a)=>a.findIndex(q=>dist(p,q)<.002)===i);
    // One visibility graph between obstacle vertices; each leg only adds its two endpoints.
    const graph={};for(let i=0;i<vertices.length;i++)graph['v'+i]={};
    for(let i=0;i<vertices.length;i++)for(let j=i+1;j<vertices.length;j++){const length=dist(vertices[i],vertices[j]);if(length>1e-9&&segmentClear(vertices[i],vertices[j],polys)){graph['v'+i]['v'+j]=length;graph['v'+j]['v'+i]=length;}}
    const route=[{x:start.x,y:start.y,pin:true}];let cursor=start;
    for(let leg=0;leg<pins.length;leg++){
      const goal=pins[leg];if(!within(goal)||polys.some(poly=>inside(goal,poly)))throw Error(`Pin ${leg+1} leaves insufficient robot clearance. Move it away from the barrier, field element or wall.`);
      if(dist(cursor,goal)<.01){cursor=goal;continue;}
      const local={...graph,s:{},g:{}};const link=(key,p)=>{for(let i=0;i<vertices.length;i++){const length=dist(p,vertices[i]);if(segmentClear(p,vertices[i],polys)){local[key]['v'+i]=length;local['v'+i]={...local['v'+i],[key]:length};}}};
      for(let i=0;i<vertices.length;i++)local['v'+i]=graph['v'+i];link('s',cursor);link('g',goal);
      if(segmentClear(cursor,goal,polys)){local.s.g=dist(cursor,goal);local.g.s=local.s.g;}
      let keys;try{keys=dijkstra.find_path(local,'s','g');}catch{throw Error(`No safe route to pin ${leg+1}. The barriers block the robot's footprint.`);}
      route.push(...keys.slice(1).map(k=>k==='g'?{...goal}:{...vertices[Number(k.slice(1))],pin:false}));cursor=goal;
    }
    if(route.length<2)throw Error('Place a pin away from the starting position.');
    const style=['sharp','rounded','spline'].includes(project.style)?project.style:project.smooth===false?'sharp':'rounded';
    const pt=p=>({x:p.x,y:p.y}),curveClear=points=>{const c=Array.from({length:41},(_,j)=>bezier(points,j/40));return c.every(within)&&c.every((v,j)=>!j||segmentClear(c[j-1],v,smoothPolys));};
    let segments=[];
    if(style==='spline'){
      // Cubic curves through every waypoint and obstacle corner, tangent-continuous where the robot
      // passes through. The start, the end and pins with a pause are full stops. Where a curve would
      // come closer than half the clearance, the tension at its two corners halves (to a straight line).
      const tension=finite(project.tension)?clamp(project.tension,0,1.5):1,n=route.length;
      // Full stops: the ends, pins with a pause, and places where the route doubles back (a
      // reversal cannot be taken at speed, and its tangent would be zero).
      const turn=i=>{const a=route[i-1],p=route[i],b=route[i+1],ux=p.x-a.x,uy=p.y-a.y,vx=b.x-p.x,vy=b.y-p.y,lu=Math.hypot(ux,uy),lv=Math.hypot(vx,vy);return lu<1e-6||lv<1e-6?Math.PI:Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/(lu*lv))));};
      const k=route.map((p,i)=>i===0||i===n-1||(p.pin&&p.wait>0)||turn(i)>150*Math.PI/180?0:tension);
      for(let attempt=0;attempt<12;attempt++){
        const tangent=route.map((p,i)=>{if(!k[i])return null;const a=route[i-1],b=route[i+1],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy),m=k[i]*Math.min(dist(a,p),dist(p,b))/3;return l<1e-6||m<.05?null:{x:dx/l*m,y:dy/l*m};});
        segments=[];let failed=false;
        for(let i=0;i<n-1;i++){
          const a=route[i],b=route[i+1];if(dist(a,b)<1e-6)continue;
          if(!tangent[i]&&!tangent[i+1]){segments.push({type:'line',points:[pt(a),pt(b)]});continue;}
          const c1=tangent[i]?{x:a.x+tangent[i].x,y:a.y+tangent[i].y}:{x:a.x+(b.x-a.x)/3,y:a.y+(b.y-a.y)/3},c2=tangent[i+1]?{x:b.x-tangent[i+1].x,y:b.y-tangent[i+1].y}:{x:b.x-(b.x-a.x)/3,y:b.y-(b.y-a.y)/3};
          const points=[pt(a),c1,c2,pt(b)];
          if(curveClear(points))segments.push({type:'curve',points});else{failed=true;for(const j of [i,i+1])k[j]=k[j]*.5<.05?0:k[j]*.5;}
        }
        if(!failed)break;
      }
    }else{
      // Round interior corners with a tangent quadratic Bezier (G1 continuous). A rounded
      // corner may use at most half of the clearance buffer; otherwise it stays sharp.
      let at=route[0];
      for(let i=1;i<route.length;i++){
        const p=route[i],next=route[i+1];let rounded=false;
        if(style==='rounded'&&!p.pin&&next&&dist(at,p)>1e-6&&dist(p,next)>1e-6){
          for(const limit of [6,3,1.5]){const trim=Math.min(limit,dist(at,p)/2.5,dist(p,next)/2.5),a={x:p.x+(at.x-p.x)*trim/dist(at,p),y:p.y+(at.y-p.y)*trim/dist(at,p)},b={x:p.x+(next.x-p.x)*trim/dist(p,next),y:p.y+(next.y-p.y)*trim/dist(p,next)};
            if(curveClear([a,p,b])){segments.push({type:'line',points:[pt(at),a]},{type:'curve',points:[a,pt(p),b]});at=b;rounded=true;break;}}
        }
        if(!rounded){segments.push({type:'line',points:[pt(at),pt(p)]});at=p;}
      }
    }
    const usable=segments.filter(s=>dist(s.points[0],s.points.at(-1))>1e-6);
    const samples=[];let length=0;for(const s of usable){const n=Math.max(s.type==='line'?2:24,Math.ceil(s.points.slice(1).reduce((d,q,i)=>d+dist(s.points[i],q),0)*2));for(let i=0;i<=n;i++){if(samples.length&&i===0)continue;const t=i/n;const p=s.type==='line'?{x:s.points[0].x+(s.points[1].x-s.points[0].x)*t,y:s.points[0].y+(s.points[1].y-s.points[0].y)*t}:bezier(s.points,t);if(samples.length)length+=dist(samples.at(-1),p);samples.push(p);}}
    let cursorSeg=-1;const stops=pins.map(p=>{for(let i=Math.max(cursorSeg,0);i<usable.length;i++)if(dist(usable[i].points.at(-1),p)<1e-6){cursorSeg=i;break;}return {x:p.x,y:p.y,wait:p.wait,action:p.action,segment:cursorSeg};});
    // Independent final check against the REAL (ungrown) zones, field elements and walls:
    // every chord of the sampled path, swept by the full footprint at the route heading.
    for(let i=1;i<samples.length;i++)if(!sweepClear(samples[i-1],samples[i],heading,all,footprint,field))throw Error('The smoothed route failed the footprint sweep check. Increase clearance or move the pins.');
    return {style,segments:usable,samples,length,heading,clearance,footprint,field,vertices:route,pins:pins.length,stops};
  }
  return {SIZE,FIELD,TOL,MIN_CLEARANCE,polygon,parts,zoneHits,triangulate,hull,body,overlap,contains,inside,safePose,safeSweep,sweepClear,segmentClear,validateZone,inflated,plan,dist};
});
