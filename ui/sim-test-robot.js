(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DeckTestRobot=api;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // The "Test setup" robot: an FTC robot built from parts teams know (goBILDA U-channel frame and grid plate, 104 mm
  // mecanum wheels on Yellow Jacket motors, a REV Control Hub and battery, a goBILDA Pinpoint with two odometry pods, a
  // deployable ramp intake with two compliant-wheel rollers, and one turret carrying a 96 mm flywheel, a hood and a servo
  // kicker). It is generated here as STEP-import-style mesh records (assembly path, name, positions, normals, triangles,
  // colour), so it goes through the same import, storage, discovery and rig as a team's own CAD. No three.js; original
  // geometry modelled after the parts' published sizes (approximate), MIT like the rest of Deck.
  // Frame: inches, x forward, y left, z up, the floor at z = 0; the chassis box is exactly 17 x 17 in.
  const NAME='Deck test robot',VERSION=1,ROOT=NAME,CHASSIS='Chassis',INTAKE='Ramp intake',SHOOTER='Turret shooter (pollen + nectar)';
  const KEY={chassis:ROOT+'/'+CHASSIS,intake:ROOT+'/'+INTAKE,shooter:ROOT+'/'+SHOOTER};
  // Model metadata the app stores with it (meta() adds the id and the parts found in it).
  const MODEL={name:NAME,units:'in',front:'+x',top:'+z',source:'step',bodyChassis:true,entered:['mass','wheel','rpm']};
  // ---- sizes the joints and the setup share ----------------------------------------------------------------------
  const HALF=8.5,WHEEL_R=104/25.4/2,WHEEL_X=5.6,PIVOT=[-4.7,0],DECK_Z=2.99,PLATE_Z=3.09;
  const FLY={x:-2.9,z:9,r:96/25.4/2},HOOD_R=5.09,HINGE={x:8.05,z:3.5},BLADE={len:6.5,off:.3,t:.1,half:7.5},KICK={x:-3.4,z:4.2};
  const ROLLERS={lower:{x:7.2,z:6.3},upper:{x:5,z:7},r:1};
  // ---- colours: sRGB as people pick them, stored linear like a CAD import's ------------------------------------------
  const lin=hex=>[0,8,16].map(s=>{const c=(hex>>(16-s)&255)/255;return +(c<=.04045?c/12.92:((c+.055)/1.055)**2.4).toFixed(4);});
  const C={alu:lin(0xc5cad0),aluDark:lin(0x9aa1a9),hole:lin(0x2a2d32),holeLight:lin(0x5d636b),black:lin(0x232528),rubber:lin(0x2d2e30),yellow:lin(0xf7b500),gear:lin(0x1d1e20),
    hub:lin(0x484d55),orange:lin(0xf26a1b),green:lin(0x3db54a),greenHub:lin(0x2a7d35),poly:lin(0x6f7b88),paddle:lin(0xff8a1f),battery:lin(0x18191b),label:lin(0xe4e6e8),
    red:lin(0xc8282d),led:lin(0x35d06b),steel:lin(0x8c9198)};
  // ---- vectors and frames ---------------------------------------------------------------------------------------------
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const l=Math.hypot(...a)||1;return mul(a,1/l);};
  const RAD=Math.PI/180,X=[1,0,0],Y=[0,1,0],Z=[0,0,1];
  // A frame: origin o, axis w, and u (toward `hint` when given) and v = w × u.
  function frame(o,w,hint){w=unit(w);let h=hint||(Math.abs(w[0])<.6?X:Math.abs(w[1])<.6?Y:Z);h=sub(h,mul(w,dot(h,w)));const u=unit(h);return {o,u,v:cross(w,u),w};}
  const pt=(f,x,y,z)=>[0,1,2].map(i=>f.o[i]+f.u[i]*x+f.v[i]*y+f.w[i]*z),vec=(f,x,y,z)=>[0,1,2].map(i=>f.u[i]*x+f.v[i]*y+f.w[i]*z);
  // ---- one part's triangles ---------------------------------------------------------------------------------------------
  // Faces are wound counter-clockwise seen from their normal (three.js front faces), checked against the normal given.
  function Geo(){
    // Corners with the same place and normal are one vertex (a quad's two triangles, a smooth surface's rings).
    const P=[],N=[],I=[],seen=new Map(),r=x=>Math.round(x*1e5),v=(p,n)=>{const k=[r(p[0]),r(p[1]),r(p[2]),Math.round(n[0]*1e4),Math.round(n[1]*1e4),Math.round(n[2]*1e4)].join();
      let i=seen.get(k);if(i===undefined){i=P.length/3;seen.set(k,i);P.push(p[0],p[1],p[2]);N.push(n[0],n[1],n[2]);}return i;};
    const tri=(a,b,c,na,nb,nc)=>{const g=cross(sub(b,a),sub(c,a));if(Math.hypot(...g)<1e-10)return;const n=add(add(na,nb),nc),i=v(a,na),j=v(b,nb),k=v(c,nc);if(dot(g,n)>=0)I.push(i,j,k);else I.push(i,k,j);};
    return {P,N,I,tri,
      // A flat convex polygon facing n.
      face(pts,n){for(let i=1;i<pts.length-1;i++)tri(pts[0],pts[i],pts[i+1],n,n,n);},
      quad(a,b,c,d,na,nb,nc,nd){tri(a,b,c,na,nb,nc);tri(a,c,d,na,nc,nd);}};
  }
  // A convex polygon (points in f's u, v plane) extruded along f.w from z0 to z1.
  function prism(g,f,pts,z0,z1){
    const n=pts.length,cx=pts.reduce((s,p)=>s+p[0],0)/n,cy=pts.reduce((s,p)=>s+p[1],0)/n;
    g.face(pts.map(p=>pt(f,p[0],p[1],z0)),mul(f.w,-1));g.face(pts.map(p=>pt(f,p[0],p[1],z1)),f.w);
    for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];let nx=b[1]-a[1],ny=a[0]-b[0];if(nx*(a[0]-cx)+ny*(a[1]-cy)<0){nx=-nx;ny=-ny;}const nn=unit(vec(f,nx,ny,0));
      g.face([pt(f,a[0],a[1],z0),pt(f,b[0],b[1],z0),pt(f,b[0],b[1],z1),pt(f,a[0],a[1],z1)],nn);}
  }
  const box=(g,lo,hi)=>prism(g,frame([0,0,0],Z,X),[[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]],lo[2],hi[2]);
  // A box in frame f: half sizes along u and v about its origin, z0..z1 along w.
  const obox=(g,f,hu,hv,z0,z1)=>prism(g,f,[[-hu,-hv],[hu,-hv],[hu,hv],[-hu,hv]],z0,z1);
  // A surface of revolution about f.w: profile [[r, z]...] traversed with the outside on its right (outward normal
  // (dz, -dr)); smooth shares normals along the profile (rollers); a0..a1 a partial sweep, capped at its ends.
  function lathe(g,f,prof,{seg=24,smooth=false,a0=0,a1=360,phase=0}={}){
    const full=a1-a0>=359.999,n=prof.length,segN=[];
    for(let i=0;i<n-1;i++){const dr=prof[i+1][0]-prof[i][0],dz=prof[i+1][1]-prof[i][1],l=Math.hypot(dr,dz)||1;segN.push([dz/l,-dr/l]);}
    const pn=prof.map((_,i)=>{const a=segN[Math.max(0,i-1)],b=segN[Math.min(n-2,i)],m=[a[0]+b[0],a[1]+b[1]],l=Math.hypot(...m)||1;return [m[0]/l,m[1]/l];});
    const P=(r,z,t)=>pt(f,r*Math.cos(t),r*Math.sin(t),z),Nn=(nr,nz,t)=>vec(f,nr*Math.cos(t),nr*Math.sin(t),nz);
    for(let k=0;k<seg;k++){const t0=(a0+(a1-a0)*k/seg+phase)*RAD,t1=(a0+(a1-a0)*(k+1)/seg+phase)*RAD;
      for(let i=0;i<n-1;i++){const [r0,z0]=prof[i],[r1,z1]=prof[i+1],na=smooth?pn[i]:segN[i],nb=smooth?pn[i+1]:segN[i];
        g.quad(P(r0,z0,t0),P(r0,z0,t1),P(r1,z1,t1),P(r1,z1,t0),Nn(na[0],na[1],t0),Nn(na[0],na[1],t1),Nn(nb[0],nb[1],t1),Nn(nb[0],nb[1],t0));}}
    if(!full)for(const [a,s] of [[a0,-1],[a1,1]]){const t=(a+phase)*RAD,nn=mul(vec(f,-Math.sin(t),Math.cos(t),0),s);g.face(prof.slice(0,-1).map(([r,z])=>P(r,z,t)),nn);}
  }
  const cylinder=(g,f,r,z0,z1,seg=24,phase=0)=>lathe(g,f,[[0,z0],[r,z0],[r,z1],[0,z1]],{seg,phase});
  const tube=(g,f,ri,ro,z0,z1,seg=32)=>lathe(g,f,[[ri,z0],[ro,z0],[ro,z1],[ri,z1],[ri,z0]],{seg});
  // A curved plate: radii r0..r1 about f.w, z0..z1 along it, from a0 to a1 degrees (from f.u toward f.v).
  const band=(g,f,r0,r1,z0,z1,a0,a1,seg=20)=>lathe(g,f,[[r0,z0],[r1,z0],[r1,z1],[r0,z1],[r0,z0]],{seg,a0,a1});
  // A flat round decal (a hole seen from outside) facing f.w at f.o.
  const disc=(g,f,r,seg=12)=>g.face(Array.from({length:seg},(_,i)=>pt(f,r*Math.cos(i/seg*2*Math.PI),r*Math.sin(i/seg*2*Math.PI),0)),f.w);
  // A spur gear ring: teeth between rRoot and rTip on its outside, bore r0, z0..z1 along f.w.
  function gear(g,f,r0,rRoot,rTip,teeth,z0,z1){
    const n=teeth*4,rr=k=>[rRoot,rTip,rTip,rRoot][k%4],ang=k=>(Math.floor(k/4)+[0,.3,.55,.85][k%4])/teeth*2*Math.PI;
    for(let k=0;k<n;k++){const a=ang(k),b=k+1<n?ang(k+1):2*Math.PI+ang(0),ra=rr(k),rb=rr(k+1);
      const o=(r,t,z)=>pt(f,r*Math.cos(t),r*Math.sin(t),z),i0=o(r0,a,z0),i1=o(r0,b,z0),j0=o(r0,a,z1),j1=o(r0,b,z1),p0=o(ra,a,z0),p1=o(rb,b,z0),q0=o(ra,a,z1),q1=o(rb,b,z1);
      g.face([i0,p0,p1,i1],mul(f.w,-1));g.face([j0,q0,q1,j1],f.w);
      const out=unit(cross(sub(p1,p0),f.w));g.face([p0,p1,q1,q0],dot(out,sub(p0,f.o))>=0?out:mul(out,-1));
      const m=(a+b)/2,inn=vec(f,-Math.cos(m),-Math.sin(m),0);g.face([i0,i1,j1,j0],inn);}
  }
  // ---- parts ------------------------------------------------------------------------------------------------------------
  const out=[];let root=ROOT;
  // One part: its assembly path (from the robot's own name down), its name and colour, and what draws it.
  function part(path,name,color,draw){const g=Geo();draw(g);if(!g.I.length)return;
    out.push({path:[root,...path],name,position:new Float32Array(g.P),normal:new Float32Array(g.N),index:new Uint32Array(g.I),color:color.slice()});}
  // Another robot's parts (the preset robots, ui/sim-preset-robots.js): draw() calls part() and the builders below, its
  // paths starting from `name`.
  function build(name,draw){const keep=root;root=name;out.length=0;try{draw();return out.slice();}finally{out.length=0;root=keep;}}
  // goBILDA's hole pattern (a 14 mm hole with four 4 mm holes on a 16 mm square), every 24 mm along a line, as decals
  // on a face: f's u runs along the line, w out of the face.
  function holes(g,f,count,{small=true}={}){const p=24/25.4,s=8/25.4;for(let k=0;k<count;k++){const x=(k-(count-1)/2)*p;
    disc(g,frame(pt(f,x,0,0),f.w,f.u),7/25.4,12);if(small)for(const [dx,dy] of [[s,s],[s,-s],[-s,s],[-s,-s]])disc(g,frame(pt(f,x+dx,dy,0),f.w,f.u),2/25.4,6);}}
  const EPS=.012;
  // goBILDA 1120 U-channel (48 x 48 mm, 2.5 mm wall) along `axis` (x or y) from a to b, its web on the outer side.
  function channel(path,label,axis,a,b,at,outward){
    const W=48/25.4,T=.1,z0=1.1,z1=z0+W,len=b-a,mid=(a+b)/2,along=axis==='x',k=Math.round(len/(24/25.4));
    // In robot axes: `at` is where the web's outer face sits across the channel; outward its sign.
    const across=(c0,c1)=>along?[[a,c0,z0],[b,c1,z1]]:[[c0,a,z0],[c1,b,z1]],lohi=(p,q)=>[[Math.min(p[0],q[0]),Math.min(p[1],q[1]),p[2]],[Math.max(p[0],q[0]),Math.max(p[1],q[1]),q[2]]];
    const inner=at-outward*W,web=lohi(...across(at-outward*T,at)),top=lohi(...across(inner,at)),bot=top.map(p=>p.slice());
    part(path,label,C.alu,g=>{box(g,...web);box(g,top[0].slice(0,2).concat(z1-T),top[1].slice(0,2).concat(z1));box(g,bot[0].slice(0,2).concat(z0),bot[1].slice(0,2).concat(z0+T));});
    part(path,'Hole pattern',C.hole,g=>{const dir=along?X:Y,n=along?[0,outward,0]:[outward,0,0],c=(z0+z1)/2;
      holes(g,frame(along?[mid,at+outward*EPS,c]:[at+outward*EPS,mid,c],n,dir),k);holes(g,frame(along?[mid,at-outward*W/2,z1+EPS]:[at-outward*W/2,mid,z1+EPS],Z,dir),k);});
  }
  // goBILDA 5203 Yellow Jacket motor along `axis` from its face at `o` (yellow gearbox, black can and encoder cap), its
  // output shaft `shaft` long out of the face.
  function motor(path,o,axis,{gearbox=1.35,label='goBILDA 5203 Yellow Jacket',shaft=.6}={}){
    const f=frame(o,axis),face=.25,can=1.95,cap=.45;
    part(path,'Gearbox',C.yellow,g=>{obox(g,f,.75,.75,0,face);lathe(g,f,[[0,face],[.72,face],[.72,face+gearbox-.08],[.66,face+gearbox],[0,face+gearbox]],{seg:28});});
    part(path,label,C.black,g=>{const z=face+gearbox;lathe(g,f,[[0,z],[.71,z],[.71,z+can-.1],[.62,z+can],[0,z+can]],{seg:28});cylinder(g,f,.6,z+can,z+can+cap,24);
      obox(g,frame(pt(f,.62,0,z+can+cap/2),f.w,f.u),.18,.28,-.16,.16);});
    part(path,'Output shaft',C.steel,g=>cylinder(g,f,.157,-shaft,0,6,30));
  }
  // goBILDA 2000-series servo: body box with mounting flanges, its spline facing along `axis` at `o` (the spline end).
  function servo(path,name,o,axis,along){
    const f=frame(o,axis,along),L=1.57,Wd=.79,H=1.42;
    part(path,name,C.black,g=>{prism(g,f,[[-.3,-Wd/2],[L-.3,-Wd/2],[L-.3,Wd/2],[-.3,Wd/2]],-H,-.12);prism(g,f,[[-.38,-Wd/2],[L-.22,-Wd/2],[L-.22,Wd/2],[-.38,Wd/2]],-.62,-.5);});
    part(path,'Servo label',C.yellow,g=>prism(g,f,[[.15,-Wd/2-EPS],[L-.6,-Wd/2-EPS],[L-.6,-Wd/2],[.15,-Wd/2]],-1.1,-.6));
    part(path,'Servo horn',C.gear,g=>cylinder(g,f,.32,-.12,0,16));
  }
  // A 104 mm mecanum wheel at c (axle along y): ten 45° rollers in an X seen from above (FL and BR one hand, FR and BL the
  // other; sx, sy the corner's signs), and its spacer on the axle out from the rail face at y = sy·outY.
  const MECANUM_HALF=.76;
  function mecanumWheel(path,c,sx,sy,outY){
    const R=WHEEL_R,N=10,Lr=1.45,Rc=1.62,rr=s=>R-Math.hypot(Rc,s*Math.SQRT1_2),plate=.12,half=MECANUM_HALF,wy=Math.abs(c[1]),hand=-Math.sign(sx*sy),f=frame(c,Y,X);
    part(path,'Wheel hub',C.yellow,g=>{tube(g,f,.2,.78,-.62,.62,24);for(const z of [half-plate,-half])lathe(g,f,[[.2,z],[1.66,z],[1.66,z+plate],[.2,z+plate],[.2,z]],{seg:40});});
    part(path,'Hex bore',C.steel,g=>tube(g,f,.12,.2,-.66,.66,6));
    part(path,'Roller',C.rubber,g=>{for(let i=0;i<N;i++){const t=(-90+360*i/N)*RAD,rad=[Math.cos(t),0,Math.sin(t)],tan=[-Math.sin(t),0,Math.cos(t)];
      const a=unit(add(mul(tan,Math.SQRT1_2),mul(Y,hand*Math.SQRT1_2))),fr=frame(add(c,mul(rad,Rc)),a,rad),prof=[];
      for(let j=0;j<=6;j++){const s=-Lr/2+Lr*j/6;prof.push([rr(s),s]);}
      lathe(g,fr,[[0,-Lr/2],...prof,[0,Lr/2]],{seg:10,smooth:true});}});
    // Its spacer on the axle between the rail and the wheel.
    part(path,'Spacer',C.alu,g=>cylinder(g,frame([c[0],sy*outY,R],Y,X),.3,0,sy*(wy-half-outY),16));
  }
  // A goBILDA 4-bar odometry pod (35 mm omni wheel) at (cx, cy) rolling across `ax`, hung from a deck whose underside is at z deck.
  function odometryPod(path,cx,cy,ax,deck){
    const r=35/25.4/2,c=[cx,cy,r+.01],f=frame(c,ax),side=ax===Y?X:Y;
    // Two arms either side of the wheel up to a block under the deck.
    part(path,'Pod arms',C.black,g=>{const ext=(a,s)=>[Math.abs(ax[0])*a+Math.abs(side[0])*s,Math.abs(ax[1])*a+Math.abs(side[1])*s];
      for(const k of [-1,1]){const [ex,ey]=ext(.05,.35),[ox,oy]=[ax[0]*k*.42,ax[1]*k*.42];box(g,[cx+ox-ex,cy+oy-ey,r-.35],[cx+ox+ex,cy+oy+ey,deck-.25]);}
      const [bx,by]=ext(.5,.55);box(g,[cx-bx,cy-by,deck-.25],[cx+bx,cy+by,deck]);});
    part(path,'Omni wheel',C.yellow,g=>cylinder(g,f,.45,-.3,.3,20));
    part(path,'Omni rollers',C.rubber,g=>{for(let i=0;i<8;i++)for(const s of [-1,1]){const t=(i+(s>0?.5:0))/8*2*Math.PI,rad=add(mul(f.u,Math.cos(t)),mul(f.v,Math.sin(t))),tan=cross(f.w,rad);
      lathe(g,frame(add(add(c,mul(rad,r-.13)),mul(f.w,s*.15)),tan,rad),[[0,-.17],[.11,-.17],[.13,0],[.11,.17],[0,.17]],{seg:8,smooth:true});}});
    part(path,'Pod encoder',C.black,g=>cylinder(g,frame(add(c,mul(ax,.5)),ax),.32,0,.45,14));
  }
  // ---- Chassis ------------------------------------------------------------------------------------------------------------
  function chassis(){
    const R=WHEEL_R,railY=5.67,railW=48/25.4,inY=railY-railW/2,outY=railY+railW/2,end=HALF-.012;
    for(const s of [1,-1]){const side=s>0?'left':'right';channel([CHASSIS,`U-Channel 1120 432mm ${side}`],'U-Channel 1120 432mm','x',-end,end,s*outY,s);}
    for(const s of [1,-1]){const side=s>0?'front':'back';channel([CHASSIS,`U-Channel 1120 240mm ${side}`],'U-Channel 1120 240mm','y',-inY,inY,s*end,s);}
    // Grid plate deck (goBILDA 1203) on the frame, its 14 mm holes on a 24 mm grid.
    part([CHASSIS,'Grid plate'],'Grid plate',C.alu,g=>box(g,[-8.3,-5.4,DECK_Z],[8.3,5.4,PLATE_Z]));
    part([CHASSIS,'Grid plate'],'Hole pattern',C.hole,g=>{for(let r=-5;r<=5;r++)holes(g,frame([0,r*24/25.4,PLATE_Z+EPS],Z,X),17,{small:Math.abs(r)<5});});
    // Mecanum wheels outboard of the side rails.
    const wy=HALF-MECANUM_HALF;
    for(const [k,sx,sy] of [['FL',1,1],['FR',1,-1],['BL',-1,1],['BR',-1,-1]])mecanumWheel([CHASSIS,'Mecanum wheel '+k],[sx*WHEEL_X,sy*wy,R],sx,sy,outY);
    // Drive motors inboard of the side rails, on the wheel axles.
    for(const [k,sx,sy] of [['FL',1,1],['FR',1,-1],['BL',-1,1],['BR',-1,-1]])motor([CHASSIS,'Drive motor '+k],[sx*WHEEL_X,sy*inY,R],[0,-sy,0],{shaft:outY-inY+.3});
    // REV Control Hub standing on the left at the back (grey case, orange band, black port rows), battery on the right.
    const hub=[CHASSIS,'Control Hub'],hx0=-8.1,hx1=-2.5,hz0=PLATE_Z,hz1=PLATE_Z+4.05,hy0=5.35,hy1=6.65;
    part(hub,'REV Control Hub',C.hub,g=>box(g,[hx0,hy0,hz0],[hx1,hy1,hz1-.22]));
    part(hub,'Orange band',C.orange,g=>{box(g,[hx0,hy0,hz1-.22],[hx1,hy1,hz1]);box(g,[hx0-.01,hy0+.2,hz0+.6],[hx0+.02,hy1-.2,hz1-.4]);});
    part(hub,'Ports',C.black,g=>{for(const [z0,z1] of [[hz0+.35,hz0+.8],[hz0+1.05,hz0+1.5],[hz0+1.75,hz0+2.2]])box(g,[hx0+.35,hy1,z0],[hx1-.35,hy1+.1,z1]);box(g,[hx0+.5,hy1,hz0+2.55],[hx0+1.5,hy1+.08,hz0+3.2]);});
    part(hub,'Status LED',C.led,g=>box(g,[hx1-.9,hy1,hz0+2.8],[hx1-.6,hy1+.06,hz0+3.05]));
    const bat=[CHASSIS,'Battery'],by0=-6.65,by1=-5.25;
    part(bat,'REV Slim Battery',C.battery,g=>box(g,[hx0,by0,PLATE_Z],[hx1,by1,PLATE_Z+3.0]));
    part(bat,'Battery label',C.label,g=>box(g,[hx0+.6,by0-EPS,PLATE_Z+.7],[hx1-.6,by0,PLATE_Z+2.3]));
    part(bat,'Battery lead +',C.red,g=>cylinder(g,frame([hx1,by0+.45,PLATE_Z+2.6],X,Y),.11,0,.9,8));
    part(bat,'Battery lead -',C.black,g=>cylinder(g,frame([hx1,by0+.75,PLATE_Z+2.6],X,Y),.11,0,.9,8));
    // goBILDA Pinpoint under the deck at the centre, and its two 4-bar pods (35 mm omni wheels) where C.ODOMETRY puts them:
    // the X pod 4 in to the left, the Y pod 3 in back.
    const pin=[CHASSIS,'Pinpoint'];
    part(pin,'goBILDA Pinpoint',C.black,g=>box(g,[-.6,-.6,DECK_Z-.36],[.6,.6,DECK_Z]));
    part(pin,'Pinpoint label',C.yellow,g=>box(g,[-.35,-.35,DECK_Z-.36-EPS],[.35,.35,DECK_Z-.36]));
    for(const [k,cx,cy,ax] of [['X',0,4,Y],['Y',-3,0,X]])odometryPod([CHASSIS,'Odometry pod '+k],cx,cy,ax,DECK_Z);
    // Transfer chute: a polycarbonate floor with side guides from the intake back to the turret.
    part([CHASSIS,'Transfer chute'],'Chute floor',C.poly,g=>{const f=frame([0,0,0],Y,X);prism(g,f,[[7.9,4.0],[-.95,3.72],[-.95,3.82],[7.9,4.1]].map(([x,z])=>[x,-z]),-2.1,2.1);});
    part([CHASSIS,'Transfer chute'],'Chute guides',C.alu,g=>{for(const s of [1,-1])box(g,[-1.0,s>0?2.1:-2.2,3.72],[7.6,s>0?2.2:-2.1,5.3]);
      for(const [x,y] of [[6.8,1.4],[6.8,-1.4],[.4,1.4],[.4,-1.4]])cylinder(g,frame([x,y,PLATE_Z],Z),.12,0,3.72+(x+.95)/8.85*.28-PLATE_Z,8);});
    // The turret's motor, upright beside the turntable, its 32-tooth pinion on the 120-tooth ring gear.
    const tm=[CHASSIS,'Turret motor'],ta=60*RAD,td=4.68,tc=[PIVOT[0]+td*Math.cos(ta),PIVOT[1]+td*Math.sin(ta)];
    motor(tm,[tc[0],tc[1],3.62],Z,{shaft:.55});
    part(tm,'Turret pinion 32T',C.gear,g=>gear(g,frame([tc[0],tc[1],0],Z,X),.15,.86,1.0,32,3.12,3.42));
    part(tm,'Motor mount',C.alu,g=>{box(g,[tc[0]-.85,tc[1]-.85,3.52],[tc[0]+.85,tc[1]+.85,3.62]);for(const [dx,dy] of [[.7,.7],[-.7,.7],[.7,-.7]]){const p=[tc[0]+dx,tc[1]+dy];if(Math.hypot(p[0]-PIVOT[0],p[1]-PIVOT[1])>4.05)cylinder(g,frame([p[0],p[1],PLATE_Z],Z),.12,0,3.52-PLATE_Z,8);}});
  }
  // ---- Ramp intake ----------------------------------------------------------------------------------------------------------
  function intake(){
    const plateY=6.45,t=.1,H=HINGE,B=BLADE;
    part([INTAKE,'Side plates'],'Side plate',C.black,g=>{const f=frame([0,0,0],Y,X),pts=[[2.2,DECK_Z],[8.15,DECK_Z],[8.15,7.4],[6.8,8.5],[3.0,8.6],[2.2,8.0]].map(([x,z])=>[x,-z]);
      for(const s of [1,-1])prism(g,f,pts,s>0?plateY:-plateY-t,s>0?plateY+t:-plateY);});
    part([INTAKE,'Side plates'],'Hole pattern',C.holeLight,g=>{for(const s of [1,-1])for(const [x,z,n] of [[5.2,4.0,5],[4.3,5.2,3],[4.3,7.6,2]])holes(g,frame([x,s*(plateY+t+EPS),z],[0,s,0],X),n);});
    // The rollers: hex shafts with 2 in green compliant wheels, belt-driven from the intake motor on the left.
    for(const [key,name] of [['lower','Lower roller'],['upper','Upper roller']]){const p=ROLLERS[key],f=frame([p.x,0,p.z],Y,X);
      part([INTAKE,'Rollers',name],'Hex shaft',C.steel,g=>cylinder(g,f,.16,-plateY-.25,plateY+.4,6));
      part([INTAKE,'Rollers',name],'Compliant wheel',C.green,g=>{for(const y of [-5.35,-3.2,-1.05,1.05,3.2,5.35])lathe(g,f,[[.26,y-.3],[ROLLERS.r-.06,y-.3],[ROLLERS.r,y-.22],[ROLLERS.r,y+.22],[ROLLERS.r-.06,y+.3],[.26,y+.3],[.26,y-.3]],{seg:22});});
      part([INTAKE,'Rollers',name],'Wheel hub',C.greenHub,g=>{for(const y of [-5.35,-3.2,-1.05,1.05,3.2,5.35])tube(g,f,.16,.3,y-.32,y+.32,8);});
      part([INTAKE,'Rollers',name],'Pulley',C.alu,g=>tube(g,f,.16,.55,plateY+.12,plateY+.36,20));}
    const ml=[INTAKE,'Intake motor'],mo={x:3.25,z:7.35};
    motor(ml,[mo.x,plateY,mo.z],[0,-1,0],{gearbox:.8,shaft:.5});
    part(ml,'Motor pulley',C.alu,g=>tube(g,frame([mo.x,0,mo.z],Y,X),.16,.45,plateY+.12,plateY+.36,20));
    part(ml,'Belt',C.rubber,g=>{const pts=[[mo.x,mo.z,.5],[ROLLERS.upper.x,ROLLERS.upper.z,.6],[ROLLERS.lower.x,ROLLERS.lower.z,.6]];
      for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],d=unit([b[0]-a[0],0,b[1]-a[1]]),n=[d[2],0,-d[0]],side=dot(n,[(a[0]+b[0])/2-5.2,0,(a[1]+b[1])/2-6.9])>0?1:-1;
        const o=[a[0]+n[0]*side*a[2],0,a[1]+n[2]*side*a[2]],e=[b[0]+n[0]*side*b[2],0,b[1]+n[2]*side*b[2]],len=Math.hypot(e[0]-o[0],e[2]-o[2]);
        obox(g,frame([(o[0]+e[0])/2,plateY+.24,(o[2]+e[2])/2],Y,d),len/2,.04,-.11,.11);}});
    // The ramp: a polycarbonate blade on aluminium rails, hinged at the front; in the CAD (starting) pose it is folded up.
    const R=[INTAKE,'Ramp'],x0=H.x+B.off,x1=x0+B.t;
    part(R,'Ramp plate',C.poly,g=>box(g,[x0,-B.half,H.z+.45],[x1,B.half,H.z+B.len]));
    part(R,'Ramp rails',C.alu,g=>{for(const s of [1,-1])box(g,[x0-.42,s>0?B.half-.12:-B.half,H.z+.15],[x0,s>0?B.half:-B.half+.12,H.z+B.len-.05]);
      for(const s of [1,-1])box(g,[H.x-.2,s>0?plateY+.12:-plateY-.32,H.z-.2],[x1,s>0?plateY+.32:-plateY-.12,H.z+.75]);});
    part(R,'Grip strips',C.rubber,g=>{for(let k=0;k<5;k++){const z=H.z+1.1+k*1.1;box(g,[x1,-B.half+.5,z],[x1+.04,B.half-.5,z+.3]);}});
    part(R,'Hinge axle',C.steel,g=>cylinder(g,frame([H.x,0,H.z],Y,X),.16,-plateY-.4,plateY+.4,6));
    // Its servo (goBILDA 2000-series) inside the left plate, spline on the hinge axle.
    servo([INTAKE,'Ramp servo'],'goBILDA 2000-series servo',[H.x,plateY,H.z],[0,1,0],[-1,0,0]);
  }
  // ---- Turret shooter -------------------------------------------------------------------------------------------------------
  function shooter(){
    const T=SHOOTER,[px,py]=PIVOT,up=frame([px,py,0],Z,X),plate0=3.39,plate1=3.64,sy=2.0,st=.12;
    part([T,'Turntable bearing'],'Turntable bearing',C.alu,g=>{tube(g,frame([px,py,PLATE_Z],Z,X),2.45,3.25,0,.15,48);tube(g,frame([px,py,PLATE_Z],Z,X),2.55,3.2,.15,plate0-PLATE_Z,48);});
    part([T,'Turntable bearing'],'Bearing balls',C.aluDark,g=>tube(g,frame([px,py,PLATE_Z],Z,X),2.82,2.9,.13,.17,48));
    part([T,'Ring gear 120T'],'Ring gear 120T',C.gear,g=>gear(g,up,3.3,3.5,3.7,120,3.12,3.37));
    part([T,'Turret plate'],'Turret plate',C.alu,g=>tube(g,up,.9,3.55,plate0,plate1,56));
    part([T,'Turret plate'],'Hole pattern',C.hole,g=>{for(let k=0;k<8;k++){const a=(k+.5)/8*2*Math.PI;disc(g,frame([px+2.5*Math.cos(a),py+2.5*Math.sin(a),plate1+EPS],Z,X),.28,12);}});
    // Side plates: black aluminium, standing on the turret plate either side of the ball path.
    const outline=[[-7.85,plate1],[-1.4,plate1],[-1.4,10.3],[-2.5,11.7],[-5.3,12.5],[-7.6,11.6],[-7.85,10.6]].map(([x,z])=>[x,-z]),side=frame([0,0,0],Y,X);
    part([T,'Side plates'],'Side plate',C.black,g=>{for(const s of [1,-1])prism(g,side,outline,s>0?sy:-sy-st,s>0?sy+st:-sy);});
    part([T,'Side plates'],'Hole pattern',C.holeLight,g=>{for(const s of [1,-1])for(const [x,z,n] of [[-4.6,4.35,6],[-5.2,11.7,3]])holes(g,frame([x,s*(sy+st+EPS),z],[0,s,0],X),n);});
    part([T,'Side plates'],'Standoffs',C.alu,g=>{for(const [x,z] of [[-7.55,4.05],[-1.6,10.9]])cylinder(g,frame([x,-sy,z],Y,X),.16,0,2*sy,6);});
    // The flywheel: two 96 mm wheels (black tread, aluminium hub) on a shaft between the plates.
    const fw=frame([FLY.x,0,FLY.z],Y,X);
    part([T,'Flywheel'],'96mm flywheel tread',C.rubber,g=>{for(const [a,b] of [[-.8,-.04],[.04,.8]])lathe(g,fw,[[1.55,a],[FLY.r-.05,a],[FLY.r,a+.06],[FLY.r,b-.06],[FLY.r-.05,b],[1.55,b],[1.55,a]],{seg:40});});
    part([T,'Flywheel'],'Flywheel hub',C.alu,g=>{for(const [a,b] of [[-.74,-.1],[.1,.74]])tube(g,fw,.16,1.56,a,b,40);});
    part([T,'Flywheel'],'Hole pattern',C.hole,g=>{for(const s of [1,-1])for(let k=0;k<6;k++){const a=k/6*2*Math.PI;disc(g,frame(pt(fw,1.0*Math.cos(a),1.0*Math.sin(a),s*(.74+EPS)),mul(Y,s),X),.26,12);}});
    part([T,'Flywheel'],'Flywheel shaft',C.steel,g=>cylinder(g,fw,.16,-sy-.05,sy+st+.3,6));
    // Its motor (5203 6000 rpm, 1:1) coaxial on the right plate.
    motor([T,'Flywheel motor'],[FLY.x,-sy-st,FLY.z],[0,-1,0],{gearbox:.35,label:'goBILDA 5203 Yellow Jacket 6000 rpm',shaft:.3});
    // The hood: an aluminium arc behind the flywheel, pivoting on its shaft; the shot leaves at its top end, 60° up.
    const hood=frame([FLY.x,0,FLY.z],Y,X);
    part([T,'Hood'],'Hood plate',C.alu,g=>band(g,hood,HOOD_R,HOOD_R+.12,-1.9,1.9,-205,-150,24));
    part([T,'Hood'],'Hood arms',C.black,g=>{for(const s of [1,-1])band(g,hood,.2,HOOD_R+.12,s>0?1.9:-1.98,s>0?1.98:-1.9,-179,-172,4);});
    part([T,'Hood'],'Hood ribs',C.black,g=>{for(const s of [1,-1])band(g,hood,HOOD_R+.12,HOOD_R+.45,s>0?1.75:-1.9,s>0?1.9:-1.75,-205,-150,24);});
    servo([T,'Hood servo'],'goBILDA 2000-series servo',[-4.4,sy+st,10.4],[0,-1,0],[1,0,0]);
    // Back guide below the hood and the kicker that pushes each piece up into the flywheel.
    part([T,'Back guide'],'Back guide',C.poly,g=>band(g,hood,HOOD_R+.18,HOOD_R+.28,-1.7,1.7,-242,-212,10));
    const kf=frame([KICK.x,0,KICK.z],Y,X);
    part([T,'Kicker'],'Kicker arm',C.black,g=>{const d=unit([-2.4,0,-.2]),f=frame([KICK.x-1.2,0,KICK.z-.1],Y,d);obox(g,f,1.25,.14,-.25,.25);obox(g,f,1.25,.14,-1.4,-1.0);obox(g,f,1.25,.14,1.0,1.4);});
    // Its paddle sits under the piece at rest; feeding swings it up (states.feed) toward the flywheel.
    part([T,'Kicker'],'Kicker paddle',C.paddle,g=>{const f=frame([KICK.x-2.45,0,KICK.z-.12],Y,X);prism(g,f,[[-.35,.05],[.35,.05],[.25,.4],[-.25,.4]].map(([x,z])=>[x,-z]),-1.3,1.3);});
    part([T,'Kicker'],'Kicker shaft',C.steel,g=>cylinder(g,kf,.157,-sy,sy,6));
    // Kept within the turntable's sweep (3.9 in) so it clears the turret motor.
    servo([T,'Kicker servo'],'goBILDA 2000-series servo',[KICK.x,-sy-st,KICK.z],[0,1,0],[-1,0,0]);
  }
  // Every part, as the STEP import gives them: [{path, name, position, normal, index, color}].
  function meshes(){out.length=0;chassis();intake();shooter();const list=out.slice();out.length=0;return list;}
  // The import result the app stores (what src/sim-model.cjs gives for a STEP file), from its pure functions.
  function result(SM){const m=meshes();return {kind:'step',name:NAME,...SM.merge(m),tree:SM.tree(m),groups:SM.groups(m),names:SM.names(m)};}
  // The model's named parts (meta parts), classified by the app's CAD rules (DeckMechanisms.partRole).
  const metaParts=(groups,Mech)=>(groups||[]).map(g=>({name:g.name,key:g.key,...Mech.partRole(g.name,g.inner),box:g.box}));
  // ---- moving parts (DeckKinematics joints, CAD frame = robot frame here) ----------------------------------------------------
  function kinematics(){
    const T=KEY.shooter,I=KEY.intake,Ch=KEY.chassis,src='metadata';
    const wheels=[['FL',1,1],['FR',1,-1],['BL',-1,1],['BR',-1,-1]].map(([k,sx,sy])=>({id:'wheel'+k,name:'Mecanum wheel '+k,kind:'drive-wheel',type:'continuous',parts:[`${Ch}/Mecanum wheel ${k}`],
      origin:[sx*WHEEL_X,sy*(HALF-.76),WHEEL_R],axis:[0,1,0],radius:+WHEEL_R.toFixed(4),roll:'mecanum',drive:{signal:'wheel'},source:src}));
    return {model:null,unit:1,joints:[
      {id:'turret',name:'Turret',kind:'turret',type:'revolute',lower:-170,upper:170,zero:0,parts:[T],origin:[PIVOT[0],PIVOT[1],3.39],axis:[0,0,1],radius:3.7,drive:{signal:'turret',of:'shooter:0'},source:src},
      // The flywheel turns so its back (facing the hood) moves up, carrying the piece; the hood's axis is set so a positive
      // tilt raises the shot (as Configure from CAD sets them).
      {id:'flywheel',name:'Flywheel',kind:'flywheel',type:'continuous',parent:'turret',parts:[T+'/Flywheel'],origin:[FLY.x,0,FLY.z],axis:[0,1,0],radius:+FLY.r.toFixed(4),rpm:3400,drive:{signal:'flywheel',of:'shooter:0'},source:src},
      {id:'hood',name:'Hood',kind:'hood',type:'revolute',parent:'turret',parts:[T+'/Hood'],origin:[FLY.x,0,FLY.z],axis:[0,-1,0],lower:-5,upper:20,launch:60,states:{rest:0},speed:120,drive:{signal:'hood',of:'shooter:0'},source:src},
      {id:'kicker',name:'Kicker',kind:'kicker',type:'revolute',parent:'turret',parts:[T+'/Kicker'],origin:[KICK.x,0,KICK.z],axis:[0,1,0],lower:-5,upper:60,states:{rest:0,feed:45},speed:720,drive:{signal:'feeder',of:'shooter:0'},source:src},
      {id:'ramp',name:'Ramp',kind:'deploy-intake',type:'revolute',parts:[I+'/Ramp'],origin:[HINGE.x,0,HINGE.z],axis:[0,1,0],lower:0,upper:125,states:{raised:0,lowered:RAMP_DOWN},speed:400,drive:{signal:'deploy',of:'intake:0'},source:src},
      {id:'rollerLower',name:'Lower roller',kind:'roller-intake',type:'continuous',parts:[I+'/Rollers/Lower roller'],origin:[ROLLERS.lower.x,0,ROLLERS.lower.z],axis:[0,1,0],radius:ROLLERS.r,rpm:600,drive:{signal:'roller',of:'intake:0'},source:src},
      {id:'rollerUpper',name:'Upper roller',kind:'roller-intake',type:'continuous',parts:[I+'/Rollers/Upper roller'],origin:[ROLLERS.upper.x,0,ROLLERS.upper.z],axis:[0,1,0],radius:ROLLERS.r,rpm:600,drive:{signal:'roller',of:'intake:0'},source:src},
      ...wheels]};
  }
  // How far the ramp swings down: until the blade's lower face meets the floor at its tip (degrees about the hinge).
  const RAMP_DOWN=(()=>{const tip=d=>{const t=d*RAD;return HINGE.z-(BLADE.off+BLADE.t)*Math.sin(t)+BLADE.len*Math.cos(t);};let d=90;while(tip(d)>.04&&d<130)d+=.25;return +d.toFixed(2);})();
  // ---- the setup ------------------------------------------------------------------------------------------------------------
  // The long red autonomous (Deck inches from the audience-left corner, headings counter-clockwise from +x). Validated
  // headlessly (tools/deck-sim.cjs test): every pickup takes 4 pollen and every shot lands; it runs past the 30 s period
  // on purpose, as a long demo. Pickups alternate with shots because the robot holds 4; each tip turns the other cell up,
  // so the start (south) cell is shot from below the hive and the north cell from behind it.
  function pins(){
    const P=(x,y,action,note,path,extra={})=>({x,y,wait:extra.wait||0,action,...(extra.actionSeconds!==undefined?{actionSeconds:extra.actionSeconds}:{}),...(extra.cell?{cell:extra.cell}:{}),...(note?{note}:{}),path});
    const spin=note=>({kind:'action',action:'Spin up',style:'spline',note}),take=note=>({kind:'action',action:'Intake',style:'sharp',note}),turn=(h,note)=>({style:'spline',note,rotate:'turn',heading:h}),plain=note=>({style:'sharp',note});
    return [
      P(24,30,'Shoot','Shoot the 4 preloaded pollen into the up (south) cell: they tip the hive',spin('Off the wall, flywheel spinning up')),
      P(14,24,'','',turn(-90,'Turn the ramp toward the audience wall')),
      P(10,15.5,'Intake','Last garden pollen feeds in',take('Sweep the 4 red GARDEN pollen along the wall'),{actionSeconds:.4,wait:.2}),
      P(28,104,'Shoot','Behind the hive: the garden pollen into the north cell, up after the tip',spin('Up the left side, spinning up'),{cell:'other'}),
      P(48.5,108,'Ramp down','Lower the ramp well before flower F2 (closer, the flower stops it swinging down)',turn(90,'Line up below flower F2')),
      P(48.5,124,'Intake','Pull the 4 pollen out of flower F2',take('Ease the ramp under flower F2'),{actionSeconds:4}),
      P(48.5,116,'Ramp up','Clear of the flower, fold the ramp up',plain('Back out of flower F2')),
      P(40,112,'Shoot','The flower pollen into the north cell: it tips back',spin('Back away, spinning up'),{cell:'other'}),
      P(22,107.3,'','',turn(-180,'Turn the ramp toward the loading zone wall')),
      P(15.5,107.3,'Intake','Last loading-zone pollen feeds in',take('Drive the ramp into the 4 red LOADING ZONE pollen'),{actionSeconds:.4,wait:.2}),
      P(30,38,'Shoot','Below the hive: the loading-zone pollen into the south cell, up again',spin('Down the left side, spinning up')),
      P(32,48.6,'Ramp down','Lower the ramp 12 in from flower F1',turn(-180,'Line up beside flower F1')),
      P(19.3,48.6,'Intake','Pull the 4 pollen out of flower F1',take('Ease the ramp under flower F1'),{actionSeconds:3.5}),
      P(28,48.6,'Ramp up','Clear of the flower, fold the ramp up',plain('Back out of flower F1')),
      P(30,38,'Shoot','The flower pollen into the south cell: it tips again',spin('Back away, spinning up')),
      P(116,31.15,'','',turn(0,'Cross below the hives to the blue LOADING ZONE')),
      P(128.5,31.15,'Intake','First 4 floor pollen feed in',take('Ramp rollers sweep the first 4 floor pollen by the blue wall'),{actionSeconds:.4,wait:.2}),
      P(62,106,'Shoot','Back on the red side, behind the hive: into the north cell',spin('Cross back, spinning up'),{cell:'other'}),
      P(116,42.35,'','',turn(0,'Cross again for the other 4 floor pollen')),
      P(128.5,42.35,'Intake','Last floor pollen feed in',take('Sweep the other 4 floor pollen'),{actionSeconds:.4,wait:.2}),
      P(62,106,'Shoot','The last 4 into the north cell',spin('Cross back, spinning up'),{cell:'other'})];
  }
  // Robot wiring as on the robot: Control Hub motors 0-3 drive, I2C bus 0 its IMU and bus 1 the Pinpoint, servos 0-2
  // ramp, kicker and hood; Expansion Hub 2 motors 0-2 flywheel, turret and intake. The flywheel and turret read their
  // motors' own encoders; the ramp is an Axon MAX whose feedback wire (analog port 0) tells when it is down or up.
  const WIRING={hubs:{expansion:{address:2}},devices:{
    'robot.frontLeft':{model:'gobilda-5203-435',hub:'control',port:0},'robot.frontRight':{model:'gobilda-5203-435',hub:'control',port:1},
    'robot.backLeft':{model:'gobilda-5203-435',hub:'control',port:2},'robot.backRight':{model:'gobilda-5203-435',hub:'control',port:3},
    'robot.imu':{hub:'control',bus:0},'robot.pinpoint':{hub:'control',bus:1},
    'intakes.0.servo':{model:'axon-max',hub:'control',port:0},'shooters.0.indexer':{model:'gobilda-speed',hub:'control',port:1},'shooters.0.hood':{model:'gobilda-torque',hub:'control',port:2},
    'shooters.0.motor':{model:'gobilda-5203-6000',hub:'expansion',port:0},'shooters.0.turretMotor':{model:'gobilda-5203-435',hub:'expansion',port:1},'intakes.0.motor':{model:'gobilda-5203-1150',hub:'expansion',port:2}},
    sensors:[{id:'flywheelEncoder',model:'motor-encoder',for:'shooters.0.motor',use:'velocity'},{id:'turretEncoder',model:'motor-encoder',for:'shooters.0.turretMotor',use:'position'},
    {id:'rampPosition',model:'axon-feedback',for:'intakes.0.servo',use:'position',hub:'control',port:0,name:'rampPosition'}]};
  // The whole setup ("Test setup"): BIOBUZZ red, FTC Control Hub, Pinpoint, the robot above and its long autonomous. The
  // model (and kinematics.model) is set by the app once it has stored the generated CAD.
  function setup(){
    const layout={id:'testsetupbiobuzz',name:'BIOBUZZ red auto',field:'biobuzz',alliance:'red',width:144,height:144,elements:true,start:{x:9.83,y:27,heading:0},zones:[],pins:pins(),clearance:.25,style:'spline',rotate:false,route:null,tested:null};
    const empty={id:'testsetupempty',name:'Empty field 1',field:'empty',alliance:'red',width:144,height:144,elements:true,start:null,zones:[],pins:[],clearance:2,style:'spline',rotate:true,route:null,tested:null};
    return {deckSimulation:2,version:2,setupName:'Test setup',controller:'ftc',imuSource:'device',timing:{power:1},orientations:{},hitboxes:false,
      robot:{drivetrain:'mecanum',length:17,width:17,heightIn:14,massLb:24,driveRpm:435,wheelDiameterMm:104,driveStyle:'robot',appearance:'custom',
        odometry:{pinpoint:{pods:'4bar',xOffset:4,yOffset:-3,xReversed:false,yReversed:false}},wiring:JSON.parse(JSON.stringify(WIRING))},
      sensors:{localization:'fused'},tuning:{maxPathSpeed:1},practice:{mode:'autonomous',autoSeconds:30,transitionSeconds:8,teleopSeconds:120},
      program:{kind:'route',name:'',source:''},model:null,view:'2d',export:{packageName:'org.firstinspires.ftc.teamcode',className:'TestSetupAuto',keep:false},
      mechanisms:{enabled:true,
        intakes:[{kind:'ramp',sides:['front'],reach:5,width:15,height:5,motor:'intake',power:1,servo:'ramp',down:.3,up:.3,downPos:0,upPos:1,parts:[INTAKE]}],
        shooters:[{type:'turret',pieces:'both',mount:'back',facing:'front',motor:'shooter',indexer:'kicker',indexerKind:'pusher',feedPos:1,restPos:0,turretMotor:'turret',hood:'hood',at:{x:PIVOT[0],y:PIVOT[1],z:12.5},parts:[SHOOTER]}],
        capacity:{pollen:4,nectar:4},preload:{pollen:4},transfer:{seconds:1},indexer:{seconds:.3,pushSeconds:.15},
        shooter:{hood:75,rpm:3400,ticksPerRev:28,spinUp:.6,control:'velocity',tolerance:.05},
        // 435 rpm motor (384.5 counts a turn) on a 32-tooth pinion driving the 120-tooth ring: 384.5 x 120/32 / 360.
        turret:{speed:240,min:-170,max:170,kind:'motor',ticksPerDegree:4.005},target:null},
      kinematics:kinematics(),layouts:[layout,empty],active:layout.id};
  }
  // The builders, for the preset robots.
  const kit={C,lin,frame,pt,vec,unit,add,sub,mul,dot,cross,RAD,X,Y,Z,EPS,WHEEL_R,MECANUM_HALF,prism,box,obox,lathe,cylinder,tube,band,disc,gear,part,holes,channel,motor,servo,mecanumWheel,odometryPod};
  return {NAME,VERSION,MODEL,KEY,meshes,result,metaParts,kinematics,pins,setup,RAMP_DOWN,kit,build};
});
