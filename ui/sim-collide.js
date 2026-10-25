(function(root,factory){const value=factory(root);if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckCollide=value;})(typeof globalThis==='object'?globalThis:this,root=>{
  'use strict';
  // Does a moving part hit anything as it moves? Each part (leaf) of the CAD is wrapped in a box along its own principal
  // axes (an oriented box); posing the robot moves the boxes of each link, and two boxes overlap when no axis separates
  // them (the separating axis test). Only contacts that are new are reported: parts that touch or overlap in the CAD's
  // own pose (bolted together, an axle in its bearing) are assembled that way and not counted. Boxes are bigger than the
  // parts they wrap, so a reported contact means the parts come within a box's slack of each other: worth a look, not
  // a guaranteed collision. Kinematic only: nothing is pushed or stopped.
  const K=()=>root.DeckKinematics||(typeof require==='function'?require('./sim-kinematics.js'):null),D=()=>root.DeckDiscovery||(typeof require==='function'?require('./sim-discovery.js'):null);
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  // A part's boxes: one along the CAD's axes and one along the part's principal axes (centre, three unit axes, half sizes,
  // and the radius of a ball holding it). The part lies inside both, so two parts can touch only where every box of one
  // meets every box of the other: a plate with a slanted outline has diagonal principal axes whose box overhangs its
  // corners, and the other box trims that.
  function boxOf(ctx,k){
    const key='obb:'+k;if(ctx.cache.has(key))return ctx.cache.get(key);const f=D().feature(ctx,k);if(!f){ctx.cache.set(key,null);return null;}
    const v=ctx.vertsOf(k),fit=A=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<v.length;i++){const p=ctx.P(v[i]);for(let a=0;a<3;a++){const d=dot(p,A[a]);if(d<lo[a])lo[a]=d;if(d>hi[a])hi[a]=d;}}
      const h=[0,1,2].map(a=>(hi[a]-lo[a])/2),mid=[0,1,2].map(a=>(hi[a]+lo[a])/2),c=[0,1,2].map(i=>A[0][i]*mid[0]+A[1][i]*mid[1]+A[2][i]*mid[2]);return {c,A,h,r:Math.hypot(...h),volume:h[0]*h[1]*h[2]};};
    const box=[fit([[1,0,0],[0,1,0],[0,0,1]]),fit(f.axes)];ctx.cache.set(key,box);return box;
  }
  // A part's boxes moved by a rigid motion W (4×4, column-major).
  function moved(boxes,W){const M=K().math;return boxes.map(b=>({c:M.apply(W,b.c),A:b.A.map(a=>M.applyDir(W,a)),h:b.h,r:b.r}));}
  // Two parts may touch only when every box of one overlaps every box of the other.
  const touch=(a,b,tol)=>a.every(x=>b.every(y=>overlap(x,y,tol)));
  // Separating axis test for two oriented boxes, with a little slack (tol) so touching faces do not count.
  function overlap(a,b,tol=0){
    const d=[b.c[0]-a.c[0],b.c[1]-a.c[1],b.c[2]-a.c[2]];if(Math.hypot(...d)>a.r+b.r-tol)return false;
    const axes=[...a.A,...b.A];for(const u of a.A)for(const w of b.A){const x=cross(u,w),l=Math.hypot(...x);if(l>1e-6)axes.push(x.map(v=>v/l));}
    for(const n of axes){const ra=a.h[0]*Math.abs(dot(a.A[0],n))+a.h[1]*Math.abs(dot(a.A[1],n))+a.h[2]*Math.abs(dot(a.A[2],n)),rb=b.h[0]*Math.abs(dot(b.A[0],n))+b.h[1]*Math.abs(dot(b.A[1],n))+b.h[2]*Math.abs(dot(b.A[2],n));
      if(Math.abs(dot(d,n))>ra+rb-tol)return false;}
    return true;
  }
  // Which link each part belongs to (the deepest joint naming it), or null for the robot's frame.
  function owners(ctx,model){const own=new Map(),list=K().order(model);for(const j of list)for(const k of ctx.parts.expand(j.parts))own.set(k,j.id);return own;}
  // Prepares a check of one joint: its link's parts (and its children's) against everything else.
  function checker(ctx,model,jointId,{tol=.01}={}){
    const own=owners(ctx,model),byId=new Map(model.joints.map(j=>[j.id,j]));
    // The moving set: the joint and the joints riding on it.
    const riding=new Set([jointId]);let grew=true;while(grew){grew=false;for(const j of model.joints)if(j.parent&&riding.has(j.parent)&&!riding.has(j.id)){riding.add(j.id);grew=true;}}
    // A part round about its own joint's axis (a turntable gear, a ring, a wheel on its axle) fills the same space as it
    // turns, so it cannot meet anything new; its box would, sweeping its corners round.
    const spins=k=>{const j=byId.get(own.get(k)),r=D().feature(ctx,k)?.revolve;return j&&(j.type==='revolute'||j.type==='continuous')&&r&&D().coaxial({axis:K().math.unit(j.axis),center:j.origin},r,Math.max(.02,r.radius*.05));};
    const mine=[],others=[];for(let k=0;k<ctx.leaves;k++){const b=boxOf(ctx,k);if(!b)continue;if(riding.has(own.get(k))){if(!spins(k))mine.push(k);}else others.push(k);}
    // Parts touching at rest are assembled that way.
    const restPairs=new Set(),rest=new Map([...mine,...others].map(k=>[k,boxOf(ctx,k)]));
    for(const a of mine)for(const b of others)if(touch(rest.get(a),rest.get(b),-tol))restPairs.add(a+':'+b);
    // Only parts near the moving set's reach can be hit.
    const M=K().math,link=byId.get(jointId),o=link.origin,reach=Math.max(...mine.map(k=>{const b=rest.get(k)[0];return M.len(M.sub(b.c,o))+b.r;}),0);
    const near=others.filter(k=>{const b=rest.get(k)[0];return M.len(M.sub(b.c,o))<=reach+b.r;});
    return {mine,near,
      // The new contacts in a pose ({jointId: value}): pairs of parts as [moving part, other part].
      at(values){const p=K().pose(model,values),hits=[],W=k=>{const id=own.get(k);return id?p.W.get(id):null;};
        const boxes=new Map();const box=k=>{if(!boxes.has(k)){const w=W(k);boxes.set(k,w?moved(rest.get(k),w):rest.get(k));}return boxes.get(k);};
        for(const a of mine)for(const b of near){if(restPairs.has(a+':'+b))continue;if(touch(box(a),box(b),tol))hits.push([a,b]);}
        return hits;}};
  }
  // Sweeps a one-value joint from its current value toward each end (or through its named positions) in steps, and
  // reports the first contact each way: {free:[low, high] reached without contact, hits:[{at, parts}]}.
  function sweep(ctx,model,jointId,{from=0,lower=-180,upper=180,step=2,values={}}={}){
    const c=checker(ctx,model,jointId),out={free:[from,from],hits:[]};
    for(const dir of [-1,1]){const end=dir<0?lower:upper;for(let q=from;dir<0?q>=end:q<=end;q+=dir*step){const hits=c.at({...values,[jointId]:q});
      if(hits.length){out.hits.push({at:+q.toFixed(2),parts:hits});break;}out.free[dir<0?0:1]=+q.toFixed(2);}}
    return out;
  }
  return {boxOf,moved,overlap,touch,checker,sweep};
});
