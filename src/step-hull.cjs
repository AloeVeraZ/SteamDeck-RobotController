'use strict';
// A heavy solid (a toothed belt, a gear, a connector with hundreds of faces) as its convex hull. The solid's entry
// in the STEP file becomes a small marker tetrahedron that OpenCascade reads in no time and places, names and
// colours like the part; afterwards each marker is found in the meshes and replaced by the hull, carried by the
// marker's placement. A big robot loads in seconds with every part where it belongs.
// Hull points: the solid's vertices, spline control points and points along its circular and elliptical edges.
const num=/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const coords=t=>{const open=t.lastIndexOf('('),close=t.indexOf(')',open);return (t.slice(open+1,close).match(num)||[]).map(Number);};
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
// The top-level arguments of "NAME(a,(b,c),d)" starting at the "(" at `open`.
function args(t,open){const out=[];let depth=0,q=false,from=open+1;
  for(let i=open;i<t.length;i++){const c=t[i];if(c==="'"){q=!q;continue;}if(q)continue;
    if(c==='('){depth++;continue;}if(c===')'){if(--depth===0){out.push(t.slice(from,i).trim());return out;}continue;}if(c===','&&depth===1){out.push(t.slice(from,i).trim());from=i+1;}}
  return out;}
const list=a=>a.replace(/^\(|\)$/g,'').split(',').map(v=>v.trim()).filter(Boolean);
const part=(t,name)=>{const m=new RegExp('(^|[^A-Z_])'+name+'\\s*\\(').exec(t);return m?args(t,m.index+m[0].length-1):null;};
// Points along a B-spline curve (rational or not), from its simple or complex STEP entity.
function splineCurve(t,pointOf){
  const simple=part(t,'B_SPLINE_CURVE_WITH_KNOTS'),base=simple&&simple.length>=8?simple:part(t,'B_SPLINE_CURVE'),knots=simple&&simple.length>=8?simple.slice(-3):part(t,'B_SPLINE_CURVE_WITH_KNOTS'),weights=part(t,'RATIONAL_B_SPLINE_CURVE');
  if(!base||!knots)return [];const at=base.length>=8||simple&&simple.length>=8?1:0,p=+base[at],ids=list(base[at+1]).map(v=>+v.slice(1)),cps=ids.map(pointOf);
  if(!(p>=1)||cps.some(c=>!c||c.length!==3))return [];
  const mult=list(knots[0]).map(Number),kv=list(knots[1]).map(Number),U=[];mult.forEach((m,i)=>{for(let j=0;j<m;j++)U.push(kv[i]);});
  const w=weights?list(weights[0]).map(Number):cps.map(()=>1),n=cps.length;if(U.length!==n+p+1||w.length!==n)return [];
  const lo=U[p],hi=U[n],steps=Math.min(400,Math.max(16,n*4)),out=[];
  for(let s=0;s<=steps;s++){const u=lo+(hi-lo)*s/steps;let k=p;while(k<n-1&&u>=U[k+1])k++;
    const d=[];for(let j=0;j<=p;j++){const c=cps[k-p+j],wt=w[k-p+j];d.push([c[0]*wt,c[1]*wt,c[2]*wt,wt]);}
    for(let r=1;r<=p;r++)for(let j=p;j>=r;j--){const i=k-p+j,den=U[i+p-r+1]-U[i],a=den>0?(u-U[i])/den:0;for(let c=0;c<4;c++)d[j][c]=(1-a)*d[j-1][c]+a*d[j][c];}
    const h=d[p];if(h[3]!==0)out.push([h[0]/h[3],h[1]/h[3],h[2]/h[3]]);}
  return out;
}
function solidPoints(s,root){
  const {text,refAt,refs,types,typeNames}=s,T=name=>typeNames.indexOf(name),seen=new Set([root]),order=[root];
  for(let i=0;i<order.length;i++){const k=order[i];for(let z=refAt[k];z<refAt[k+1];z++){const y=refs[z];if(y>=0&&!seen.has(y)){seen.add(y);order.push(y);}}}
  const body=k=>text.slice(s.starts[k],s.ends[k]),point=k=>coords(body(k)),ref=(k,i)=>refAt[k]+i<refAt[k+1]?refs[refAt[k]+i]:-1;
  // Points that lie on the solid: its vertices (and polyline corners), then each edge sampled along the part of its
  // curve it uses (arcs, ellipses, splines). Control points and placement origins are not used: they can lie far
  // from the part (a cylinder's axis origin, a rounded edge's control polygon, a thread helix longer than the screw).
  const POINT=T('CARTESIAN_POINT'),VERTEX=T('VERTEX_POINT'),POLYLINE=T('POLYLINE'),EDGE=T('EDGE_CURVE'),CIRCLE=T('CIRCLE'),ELLIPSE=T('ELLIPSE'),complex=T('');
  const wrappers=new Set(['SURFACE_CURVE','SEAM_CURVE','BOUNDED_SURFACE_CURVE','TRIMMED_CURVE'].map(T));
  const pts=[],add=c=>{if(c&&c.length===3&&c.every(Number.isFinite))pts.push(c);};
  for(const k of order)if(types[k]===VERTEX||types[k]===POLYLINE)for(let z=refAt[k];z<refAt[k+1];z++){const y=refs[z];if(y>=0&&types[y]===POINT)add(point(y));}
  const placement=k=>{const o=point(ref(k,0)),zAxis=ref(k,1)>=0?unit(point(ref(k,1))):[0,0,1],xRef=ref(k,2)>=0?point(ref(k,2)):Math.abs(zAxis[0])<.9?[1,0,0]:[0,1,0];
    const x=unit(sub(xRef,zAxis.map(v=>v*dot(xRef,zAxis))));return {o,x,y:cross(zAxis,x)};};
  const vertex=v=>v>=0&&types[v]===VERTEX?point(ref(v,0)):null;
  for(const k of order){if(types[k]!==EDGE)continue;let curve=ref(k,2);for(let i=0;i<3&&curve>=0&&wrappers.has(types[curve]);i++)curve=ref(curve,0);if(curve<0)continue;
    const v0=vertex(ref(k,0)),v1=vertex(ref(k,1)),loop=ref(k,0)===ref(k,1);if(!v0||!v1)continue;
    if(types[curve]===CIRCLE||types[curve]===ELLIPSE){
      const r=coords(body(curve).replace(/#\d+/g,'')),r1=r[0],r2=types[curve]===ELLIPSE?r[1]:r1,ax=ref(curve,0);if(!(r1>0&&r2>0)||ax<0)continue;
      const {o,x,y}=placement(ax),angle=v=>{const p=sub(v,o);return Math.atan2(dot(p,y)/r2,dot(p,x)/r1);};
      const sense=!/\.F\.\s*\)\s*;?\s*$/.test(body(k));let a=angle(v0),b=angle(v1);if(!sense)[a,b]=[b,a];
      let span=b-a;while(span<=1e-9)span+=Math.PI*2;if(loop)span=Math.PI*2;
      const steps=Math.max(2,Math.ceil(span/(Math.PI*2)*32));
      for(let i=0;i<=steps;i++){const t=a+span*i/steps,c=Math.cos(t)*r1,d=Math.sin(t)*r2;add([o[0]+x[0]*c+y[0]*d,o[1]+x[1]*c+y[1]*d,o[2]+x[2]*c+y[2]*d]);}
    }else if(/B_SPLINE_CURVE/.test(types[curve]===complex?body(curve):typeNames[types[curve]])){
      const byId=new Map();for(let z=refAt[curve];z<refAt[curve+1];z++)if(refs[z]>=0)byId.set(s.ids[refs[z]],refs[z]);
      const samples=splineCurve(body(curve),id=>byId.has(id)?point(byId.get(id)):null);if(!samples.length)continue;
      // The stretch between the edge's two vertices (all of it for a closed edge).
      const near=v=>{let best=0,d=Infinity;samples.forEach((p,i)=>{const e=Math.hypot(...sub(p,v));if(e<d){d=e;best=i;}});return best;};
      const i0=near(v0),i1=near(v1),[from,to]=loop?[0,samples.length-1]:[Math.min(i0,i1),Math.max(i0,i1)];
      for(let i=from;i<=to;i++)add(samples[i]);}
  }
  return pts;
}
// Convex hull: triangles with outward winding. Points are first merged on a grid (1/200 of the part) and the hull
// grown point by point; points within a millionth of the part of a face are on it (flat faces give many coplanar
// points). A hull that does not close is grown again with a looser tolerance; the part's box is the last resort.
function hull(input){
  if(input.length<4)return null;
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of input)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],p[a]);hi[a]=Math.max(hi[a],p[a]);}
  const diag=Math.hypot(...sub(hi,lo));if(!(diag>0))return null;const cell=diag/200,grid=new Map();
  for(const p of input){const key=p.map(v=>Math.round(v/cell)).join(',');if(!grid.has(key))grid.set(key,p);}
  const pts=[...grid.values()];let seed=1;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let i=pts.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[pts[i],pts[j]]=[pts[j],pts[i]];}
  for(const tol of [1e-6,1e-4,1e-3]){const h=grow(pts,diag,diag*tol);if(h&&closed(h))return h;}
  return box(lo,hi);
}
const closed=h=>{const e=new Set();for(const f of h.faces)for(let i=0;i<3;i++)e.add(f[i]+','+f[(i+1)%3]);return h.faces.length>=4&&h.faces.every(f=>[0,1,2].every(i=>e.has(f[(i+1)%3]+','+f[i])));};
function grow(pts,diag,eps){
  let a=0,b=0;for(let i=0;i<pts.length;i++){if(pts[i][0]<pts[a][0])a=i;if(pts[i][0]>pts[b][0])b=i;}
  const ab=sub(pts[b],pts[a]);let c=-1,best=0;for(let i=0;i<pts.length;i++){const d=Math.hypot(...cross(ab,sub(pts[i],pts[a])));if(d>best){best=d;c=i;}}
  if(c<0||best<eps*diag)return null;const n0=cross(ab,sub(pts[c],pts[a]));let d=-1;best=0;for(let i=0;i<pts.length;i++){const v=Math.abs(dot(n0,sub(pts[i],pts[a])));if(v>best){best=v;d=i;}}
  if(d<0||best<eps*Math.hypot(...n0))return null;
  const centre=[0,1,2].map(k=>(pts[a][k]+pts[b][k]+pts[c][k]+pts[d][k])/4);
  const face=(v,n)=>({v,n,off:dot(n,pts[v[0]]),len:Math.hypot(...n)});
  let faces=[];const add=(i,j,k)=>{let n=cross(sub(pts[j],pts[i]),sub(pts[k],pts[i]));if(dot(n,sub(pts[i],centre))<0){[j,k]=[k,j];n=n.map(v=>-v);}faces.push(face([i,j,k],n));};
  add(a,b,c);add(a,b,d);add(a,c,d);add(b,c,d);
  const used=new Set([a,b,c,d]);
  for(let p=0;p<pts.length;p++){if(used.has(p))continue;const q=pts[p];
    const visible=faces.filter(f=>dot(f.n,q)-f.off>eps*f.len);if(!visible.length)continue;
    const edges=new Set();for(const f of visible)for(let e=0;e<3;e++)edges.add(f.v[e]+','+f.v[(e+1)%3]);
    const horizon=[];for(const f of visible)for(let e=0;e<3;e++){const i=f.v[e],j=f.v[(e+1)%3];if(!edges.has(j+','+i))horizon.push([i,j]);}
    const gone=new Set(visible);faces=faces.filter(f=>!gone.has(f));
    for(const [i,j] of horizon)faces.push(face([i,j,p],cross(sub(pts[j],pts[i]),sub(q,pts[i]))));
    if(faces.length>8000)return null;
  }
  const keep=new Map(),vertices=[];const at=i=>{if(!keep.has(i)){keep.set(i,vertices.length);vertices.push(pts[i]);}return keep.get(i);};
  return {vertices,faces:faces.filter(f=>f.len>0).map(f=>f.v.map(at))};
}
// The box from lo to hi (at least a little thick), as hull triangles.
function box(lo,hi){
  const t=Math.max(1e-3,Math.hypot(...sub(hi,lo))*1e-3),a=lo.map((v,i)=>hi[i]-v<t?v-t/2:v),b=hi.map((v,i)=>v-lo[i]<t?v+t/2:v);
  const vertices=[0,1,2,3,4,5,6,7].map(i=>[i&1?b[0]:a[0],i&2?b[1]:a[1],i&4?b[2]:a[2]]);
  return {vertices,faces:[[0,2,3],[0,3,1],[4,5,7],[4,7,6],[0,1,5],[0,5,4],[2,6,7],[2,7,3],[0,4,6],[0,6,2],[1,3,7],[1,7,5]]};
}
// The marker for hull `index`: corners O, X=(1,0,0), Y=(0,2,0), Z=(0,0,3+index/100) in the solid's own frame and
// units. The edge ratios survive any placement and unit scale, so the marker names its hull and gives its transform.
const MARK=i=>3+i/100;
function markerStep(id,name,index,next){
  const corners=[[0,0,0],[1,0,0],[0,2,0],[0,0,MARK(index)]],out=[],P=[],f=v=>{const s=(+v.toPrecision(12)).toString();return /[.eE]/.test(s)?s:s+'.';},q=s=>`'${String(s).replace(/'/g,"''")}'`;
  for(const v of corners){P.push(next);out.push(`#${next++}=CARTESIAN_POINT('',(${v.map(f).join(',')}));`);}
  const faces=[];
  for(const [i,j,k] of [[0,2,1],[0,1,3],[0,3,2],[1,2,3]]){const a=corners[i],n=unit(cross(sub(corners[j],a),sub(corners[k],a))),x=unit(sub(corners[j],a));
    const loop=next++,bound=next++,dn=next++,dx=next++,ax=next++,plane=next++,face=next++;
    out.push(`#${loop}=POLY_LOOP('',(#${P[i]},#${P[j]},#${P[k]}));`,`#${bound}=FACE_OUTER_BOUND('',#${loop},.T.);`,`#${dn}=DIRECTION('',(${n.map(f).join(',')}));`,`#${dx}=DIRECTION('',(${x.map(f).join(',')}));`,
      `#${ax}=AXIS2_PLACEMENT_3D('',#${P[i]},#${dn},#${dx});`,`#${plane}=PLANE('',#${ax});`,`#${face}=FACE_SURFACE('',(#${bound}),#${plane},.T.);`);faces.push(face);}
  const shell=next++;out.push(`#${shell}=CLOSED_SHELL('',(${faces.map(v=>'#'+v).join(',')}));`,`#${id}=MANIFOLD_SOLID_BREP(${q(name)},#${shell});`);
  return {text:out.join('\n'),next};
}
// If the corners are a marker's: the hull index and its frame (origin and unit axes) where the assembly put it.
function readMarker(corners){
  if(corners.length!==4)return null;
  for(const o of corners){const rest=corners.filter(c=>c!==o).map(c=>({c,d:Math.hypot(...sub(c,o))})).sort((a,b)=>a.d-b.d),u=rest[0].d;if(!(u>0))continue;
    const ratioY=rest[1].d/u,ratioZ=rest[2].d/u;if(Math.abs(ratioY-2)>2e-3||ratioZ<2.99)continue;
    const i=Math.round((ratioZ-3)*100);if(i<0||Math.abs(MARK(i)-ratioZ)>2e-3)continue;
    const [X,Y,Z]=rest.map(r=>r.c);if(Math.abs(Math.hypot(...sub(X,Y))/u-Math.sqrt(5))>3e-3)continue;
    return {index:i,o,x:sub(X,o),y:sub(Y,o).map(v=>v/2),z:sub(Z,o).map(v=>v/MARK(i))};}
  return null;
}
// The mesh with each marker in it replaced by its hull, flat shaded and carried by the marker's frame; null when it
// has none. A marker is 4 consecutive triangles (one per planar face) on 4 corners; several solids of one part can
// share a mesh. OpenCascade places each face's corners separately, so corners match within a small tolerance.
function swapMarkers(mesh,shapes){
  const {position:P,index:I}=mesh,N=mesh.normal,at=i=>[P[i*3],P[i*3+1],P[i*3+2]];
  const corners=t=>{const cs=[];for(let c=0;c<12;c++){const p=at(I[t+c]);if(!cs.some(q=>Math.hypot(...sub(q,p))<1e-4*(1+Math.hypot(...q))))cs.push(p);if(cs.length>4)return null;}return cs;};
  const swaps=new Map();for(let t=0;t+12<=I.length;t+=3){const cs=corners(t);if(!cs||cs.length!==4)continue;const m=readMarker(cs),h=m&&shapes[m.index];if(h){swaps.set(t,{h,m});t+=9;}}
  if(!swaps.size)return null;
  const pos=[],nor=[],idx=[];let v=0;
  for(let t=0;t<I.length;t+=3){const swap=swaps.get(t);
    if(!swap){for(let c=0;c<3;c++){const i=I[t+c];pos.push(P[i*3],P[i*3+1],P[i*3+2]);nor.push(...(N?[N[i*3],N[i*3+1],N[i*3+2]]:[0,0,0]));idx.push(v++);}continue;}
    const {h,m}=swap,T=p=>[0,1,2].map(a=>m.o[a]+m.x[a]*p[0]+m.y[a]*p[1]+m.z[a]*p[2]),V=h.vertices.map(T);
    for(const [i,j,k] of h.faces){const n=unit(cross(sub(V[j],V[i]),sub(V[k],V[i])));for(const p of [V[i],V[j],V[k]]){pos.push(...p);nor.push(...n);idx.push(v++);}}
    t+=9;}
  return {position:Float32Array.from(pos),normal:Float32Array.from(nor),index:Uint32Array.from(idx),hulls:swaps.size};
}
module.exports={solidPoints,hull,markerStep,readMarker,swapMarkers};
