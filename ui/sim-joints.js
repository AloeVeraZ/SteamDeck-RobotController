(function(root){
  'use strict';
  // Setup → Mechanisms → Moving parts. The joints of the team's CAD (DeckKinematics), found by DeckDiscovery and
  // checked here on the 3D preview: each one shows where it pivots (an axis and a ring through the model), which parts
  // move (they glow), how sure the finder is, and the few settings it needs (a ramp's up and down angles, a hood's
  // shooting tilt, which way a turret faces in the CAD). Pivots can be picked on the model: click a round part, a hole
  // or a round edge and its circle is measured, as a slicer measures one; or click two points along the axis.
  // simulation.js gives the panel its host and an api; the panel never touches the project directly.
  const K=()=>root.DeckKinematics,D=()=>root.DeckDiscovery,R=()=>root.DeckRobotModel;
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>`&#${c.charCodeAt(0)};`),finite=Number.isFinite,fix=(v,d=1)=>+(+v).toFixed(d);
  const COLORS={turret:0x8e4ec6,hood:0xf29d38,flywheel:0x2fa84f,roller:0x12a5c9,deploy:0xe5484d,feeder:0xd4a72c,wheel:0x7a8594,steer:0x7a8594,action:0x4ea1ff};
  const hex=c=>'#'+c.toString(16).padStart(6,'0'),colorOf=j=>COLORS[j.drive?.signal]??0x4ea1ff;
  // The finder's three levels of certainty, as the team sees them, and a mechanism it could not find in the CAD.
  function level(j){
    if(j.source==='metadata')return ['sure','From the file'];if(j.source==='user')return ['user','Set by you'];if(j.source==='standin')return ['stand','Not in your CAD yet'];
    return (j.confidence??0)>=.7?['likely','Found · likely right']:['check','Found · please check'];
  }
  // A saved finding older than this finder is looked at again (parts the team set stay): 2 links game mechanisms to
  // CAD assemblies by themselves, finds the gears that drive them and each hood's launch angle.
  const FINDER=2;
  // How far a hood tilts to shoot: to the game's launch angle when its CAD launch angle is known, else as set.
  const shootTilt=(j,launch)=>finite(j.launch)&&finite(launch)?Math.max(j.lower??-180,Math.min(j.upper??180,launch-j.launch)):j.states?.shoot??0;
  const ctxCache=new WeakMap();
  function create({host,api}){
    let open=null,mode=null,demo=0,values={},lastKey='';
    const status=t=>{const el=host.querySelector('.sim-joints-status');if(el)el.textContent=t||'';};
    // ---- the model: CAD arrays for the finder, the placement for showing CAD points in robot inches
    const model=()=>api.model(),meta=()=>api.meta(),preview=()=>api.preview(),kin=()=>api.kinematics();
    function arrays(){
      const g=model()?.geometry;if(!g||g.isObject3D||!g.attributes?._part||!g.userData?.parts)return null;
      const plain=a=>a&&!a.isInterleavedBufferAttribute?a.array:a?Float32Array.from({length:a.count*a.itemSize},(_,i)=>a.getComponent(Math.floor(i/a.itemSize),i%a.itemSize)):null;
      return {positions:plain(g.attributes.position),part:plain(g.attributes._part),index:g.index?g.index.array:null,tree:g.userData.parts};
    }
    function ctx(){const g=model()?.geometry;if(!g)return null;let c=ctxCache.get(g);if(!c){const a=arrays();if(!a)return null;c=D().prepare(a);ctxCache.set(g,c);}return c;}
    const rows=()=>R().rows(meta()||{}),unit=()=>R().UNITS[meta()?.units]||1,up=()=>rows()[2];
    const P=()=>preview()?.body?.()?.userData?.kin?.P||null,math=()=>K().math;
    const toRobot=p=>{const m=P();return m?math().apply(m,p):p;},dirToRobot=a=>{const m=P();return m?math().unit(math().applyDir(m,a)):a;};
    const fromRobot=p=>{const m=P();return m?math().apply(math().invert(m),p):p;},dirFromRobot=a=>{const m=P();return m?math().unit(math().applyDir(math().invert(m),a)):a;};
    const leavesOf=j=>{const c=ctx();return c?c.parts.expand(j.parts||[]):new Set();};
    const joints=()=>kin().joints;
    // ---- changes
    function change(id,fn,{note}={}){const next=structuredClone(kin()),j=next.joints.find(x=>x.id===id);if(!j)return;fn(j,next);if(['inferred','metadata','standin'].includes(j.source))j.source='user';api.commit(next,note);}
    // Finds the joints of this CAD. Joints the team set stay; found ones replace the old finds.
    // The finder and the clearance sweep run in a worker (sim-discovery-worker.js) so a big CAD does not stall the page;
    // the body's arrays go to it once per CAD. Without workers they run here.
    let worker=null,jobs=0,sent=null;const waiting=new Map();
    function ask(op,options){
      const a=arrays(),key=meta()?.id||'';if(worker===null){try{worker=new Worker('sim-discovery-worker.js');worker.onmessage=e=>{const w=waiting.get(e.data.id);waiting.delete(e.data.id);w?.(e.data);};worker.onerror=()=>{worker=false;sent=null;for(const w of waiting.values())w({ok:false,error:'the worker stopped'});waiting.clear();};}catch{worker=false;}}
      if(!worker)return new Promise(resolve=>setTimeout(()=>{try{const t=performance.now(),c=ctx();if(op==='sweep'){const r=root.DeckCollide.sweep(c,K().sanitize(options.model),options.joint,options);resolve({ok:true,free:r.free,hits:r.hits.map(h=>({...h,names:[...new Set(h.parts.flatMap(([x,y])=>[c.parts.name(x),c.parts.name(y)]))].slice(0,4)})),ms:performance.now()-t});}
        else resolve({ok:true,...D().discover(c,options),ms:performance.now()-t});}catch(e){resolve({ok:false,error:e.message});}},30));
      const id=++jobs,fresh=sent!==key;sent=key;return new Promise(resolve=>{waiting.set(id,resolve);worker.postMessage({id,op,key,arrays:fresh?a:undefined,options});});
    }
    const find=options=>ask('discover',options);
    // Sweeps a part through its range (the other parts as the preview has them) for contacts with anything else.
    const clearance={};
    async function check(j){
      const lin=j.type==='prismatic',range=lin?[j.lower??0,j.upper??12]:j.type==='revolute'?[j.lower??-180,j.upper??180]:[-180,180],from=K().valuesOf(j,values[j.id]??j.home??0)[0];
      status(`Turning ${j.name} through its range to see what it meets…`);clearance[j.id]={busy:true};lastKey='';render();
      const r=await ask('sweep',{model:kin(),joint:j.id,from:Math.max(range[0],Math.min(range[1],from)),lower:range[0],upper:range[1],step:lin?.25:3,values});
      clearance[j.id]=r.ok?{free:r.free,hits:r.hits,unit:lin?'in':'°'}:{error:r.error};lastKey='';status(r.ok?`Checked in ${Math.round(r.ms)} ms.`:`Could not check: ${r.error}`);render();
    }
    function clearanceBits(j){
      const c=clearance[j.id];if(K().dofOf(j).length!==1||j.type==='fixed')return '';
      const button=`<button type="button" class="secondary" data-j="clear"${c?.busy?' disabled':''}>${c?.busy?'Checking…':'Check clearance'}</button>`;
      if(!c||c.busy||c.error)return `<div class="sim-joint-buttons">${button}</div>${c?.error?`<p class="hint">${esc(c.error)}</p>`:''}`;
      const u=c.unit,hits=c.hits.map((h,i)=>`<li>At ${fix(h.at,1)}${u}: ${h.names.map(n=>`“${esc(n)}”`).join(' and ')} <button type="button" class="text-button" data-j="hit" data-v="${i}">Show it</button></li>`).join('');
      return `<div class="sim-joint-buttons">${button}${c.hits.length&&(j.type==='revolute'||j.type==='prismatic')?'<button type="button" class="secondary" data-j="limits">Use as limits</button>':''}</div>
        <p class="hint">${c.hits.length?`Moves freely from ${fix(c.free[0],1)}${u} to ${fix(c.free[1],1)}${u}.`:`Moves its whole range (${fix(c.free[0],1)}${u} to ${fix(c.free[1],1)}${u}) without meeting anything.`} Checked with boxes around each part, so a contact is worth a look on the model, not certain; parts already touching in the CAD do not count.</p>${hits?`<ul class="sim-joint-alts">${hits}</ul>`:''}`;
    }
    async function discover({quiet=false}={}){
      const m=meta();if(!arrays()||!m?.id){if(!quiet)status('Moving parts are found in an imported STEP robot with named assemblies.');return false;}
      status('Looking for pivots, axles and moving parts in your CAD…');
      const found=await find({rows:rows(),unit:unit(),meta:m,mechanisms:api.mechanisms()});
      if(!found.ok){status('Could not look through the CAD: '+found.error);return false;}if(meta()?.id!==m.id)return false;
      const now=kin(),same=now.model===m.id;
      const kept=same?now.joints.filter(j=>j.source==='user'||j.source==='metadata'):[],bound=new Set(kept.map(j=>j.drive?j.drive.signal+':'+(j.drive.of||''):'')),ids=new Set(kept.map(j=>j.id));
      const fresh=found.joints.filter(j=>!ids.has(j.id)&&!(j.drive&&j.drive.signal!=='wheel'&&bound.has(j.drive.signal+':'+(j.drive.of||''))));
      // The team's couplings stay; found ones (gears following a turret or hood) come with the joints found again.
      const all=new Set([...kept,...fresh].map(j=>j.id)),freshIds=new Set(fresh.map(j=>j.id)),couplings=[...(same?now.couplings.filter(c=>ids.has(c.to)):[]),...(found.couplings||[]).filter(c=>freshIds.has(c.to)&&all.has(c.from))];
      api.commit({...now,model:m.id,unit:unit(),discovered:true,finder:FINDER,joints:[...kept,...fresh],couplings,loops:same?now.loops:[],actuators:same?now.actuators:[],actions:same?now.actions:[]});
      const n=kept.length+fresh.length,linked=found.report.filter(r=>/linked to|looked for in the whole/i.test(r)),missing=fresh.filter(j=>j.source==='standin');
      status(n?`${n} moving part${n>1?'s':''} (${Math.round(found.ms)} ms). ${linked.join(' ')} ${missing.length?`Not in your CAD yet: ${missing.map(j=>j.name).join(', ')}; open each to choose its parts.`:''} Check each one on the model.`:'No moving parts were found. Add one with + Add.');
      return true;
    }
    // ---- drawing the panel (a number box gets a slider only when it has a lower bound: angles may be negative)
    const driveOptions=j=>{const m=api.mechanisms(),out=[['none','Nothing: it follows other joints'],['action','Route actions (named positions)']];
      (m.enabled?m.shooters:[]).forEach((s,n)=>{if(s.type==='turret'&&!s.sharesTurret)out.push([`turret:shooter:${n}`,`Turret (turning) of shooter ${n+1}`]);out.push([`hood:shooter:${n}`,`Hood (pitch) of shooter ${n+1}`],[`flywheel:shooter:${n}`,`Flywheel of shooter ${n+1}`]);});
      (m.enabled?m.intakes:[]).forEach((i,n)=>{out.push([`roller:intake:${n}`,`Rollers of intake ${n+1}`]);if(i.kind==='ramp'||i.kind==='kicker')out.push([`deploy:intake:${n}`,`${i.kind==='kicker'?'Kicker':'Ramp'} of intake ${n+1}`]);});
      out.push(['feeder:any','Feeder (while shooting)'],['wheel','Drive wheel (rolls with the robot)']);return out;};
    const driveKey=j=>j.drive?j.drive.signal+(j.drive.of?':'+j.drive.of:''):'none';
    const where=j=>{const o=toRobot(j.origin),a=dirToRobot(j.axis),names=[['forward','back'],['left','right'],['up','down']],part=(v,i)=>`${fix(Math.abs(v),1)} in ${v>=0?names[i][0]:names[i][1]}`;
      // Along an axis the position means nothing, so a level or upright axis leaves that coordinate out.
      const big=a.map(Math.abs),k=big.indexOf(Math.max(...big)),straight=big[k]>.97,along=straight?['front–back','left–right','up–down'][k]:`(${a.map(v=>fix(v,2)).join(', ')})`;
      return `Pivot ${o.map(part).filter((_,i)=>!straight||i!==k).join(', ')} of the robot’s centre · axis ${along}`;};
    const num=(f,v,{min='',max='',step='any',label,unit:u='',slider=true}={})=>`<div><label>${label}${u?' · '+u:''}<input type="number"${slider&&min!==''?'':' data-slider="off"'} data-f="${f}" value="${esc(finite(v)?fix(v,2):'')}" min="${min}" max="${max}" step="${step}"></label></div>`;
    function body(j){
      const d=j.drive?.signal,n=+String(j.drive?.of||'').split(':')[1]||0,m=api.mechanisms(),intake=d==='deploy'?m.intakes[n]:null,[lv]=level(j),parts=leavesOf(j).size;
      const others=joints().filter(x=>x.id!==j.id);let roleBits='';
      if(d==='turret')roleBits=`<div class="start-xy">${num('zero',j.zero||0,{label:'Faces in your CAD',unit:'° from the front',min:-180,max:180})}<div class="sim-joint-buttons"><button type="button" class="secondary" data-j="zero" data-v="-90">−90°</button><button type="button" class="secondary" data-j="zero" data-v="90">+90°</button><button type="button" class="secondary" data-j="zero" data-v="180">180°</button></div></div><p class="hint">The arrow shows which way it fires as your CAD has it; a turret angle of 0° faces the robot’s front. It turns ${m.turret?.min??-170}° to ${m.turret?.max??170}° at ${m.turret?.speed??240}°/s (Shooter timing).</p>`;
      else if(d==='deploy'){const a=j.states?.raised??0,b=j.states?.lowered??0;
        roleBits=`<div class="start-xy">${num('state:raised',a,{label:'Up',unit:'°'})}${num('state:lowered',b,{label:'Down',unit:'°'})}</div><div class="sim-joint-buttons"><button type="button" class="secondary" data-j="show" data-v="raised">Show up</button><button type="button" class="secondary" data-j="show" data-v="lowered">Show down</button><button type="button" class="secondary" data-j="floor">Down to the floor</button></div>
        ${intake?`<div class="start-xy">${num('intake:down',intake.down,{label:'Goes down in',unit:'s',min:0,max:3})}${num('intake:up',intake.up,{label:'Goes up in',unit:'s',min:0,max:3})}</div>`:''}<p class="hint">It goes down while an Intake action runs and back up after; it picks up only once it is all the way down.</p>
        ${intake&&parts?`<div class="sim-joint-buttons"><button type="button" class="secondary" data-j="pickup">Pickup box from the ${j.name.split(' · ')[0].toLowerCase()}</button></div><p class="hint">Sets the intake’s box (the green one: where it picks up) to what the ${j.name.split(' · ')[0].toLowerCase()}’s parts reach when down: ${fix(intake.reach,2)} in out, ${intake.width?fix(intake.width,2)+' in wide':'the whole edge wide'}, ${fix(intake.height,2)} in high now.</p>`:''}`;}
      else if(d==='hood'){const a=j.states?.rest??0,b=j.states?.shoot??0,game=m.shooter?.hood??75;
        roleBits=finite(j.launch)?`<div class="start-xy">${num('shooter:hood',game,{label:'Launch angle',unit:'° above level',min:70,max:85})}${num('launch',j.launch,{label:'Launches in your CAD at',unit:'°',min:0,max:90})}</div>
          <div class="start-xy">${num('state:rest',a,{label:'Resting',unit:'°'})}${num('speed',j.speed??120,{label:'Moves at',unit:'°/s',min:1,max:3600})}</div>
          <div class="start-xy">${num('lower',j.lower,{label:'Tilts down to',unit:'°',slider:false})}${num('upper',j.upper,{label:'Tilts up to',unit:'°',slider:false})}</div>
          <div class="sim-joint-buttons"><button type="button" class="secondary" data-j="show" data-v="rest">Show resting</button><button type="button" class="secondary" data-j="show" data-v="shoot">Show shooting</button><button type="button" class="secondary" data-j="unlaunch">Set the tilt myself</button></div>
          ${(()=>{const want=game-j.launch,tilt=shootTilt(j,game),held=Math.abs(tilt-want)>.05;
            return `<p class="hint${held?' sim-joint-needs':''}">${held?`To shoot at ${fix(game,1)}° it would tilt ${fix(want,1)}°, past its limit, so it stops at ${fix(tilt,1)}° (shots leave at ${fix(j.launch+tilt,1)}° in the picture; the game physics still uses ${fix(game,1)}°). Widen the limits if your hood really goes further, or set the tilt yourself.`:`Its gears turn it ${fix(tilt,1)}° from how your CAD has it, so shots leave at the launch angle, while the shooter spins up and aims; it rests at its resting tilt.`} Positive tilts raise the shot; empty limits mean none.</p>`;})()}`
          :`<div class="start-xy">${num('state:rest',a,{label:'Resting',unit:'°'})}${num('state:shoot',b,{label:'Shooting',unit:'°'})}</div><div class="start-xy">${num('speed',j.speed??120,{label:'Moves at',unit:'°/s',min:1,max:3600})}<div class="sim-joint-buttons"><button type="button" class="secondary" data-j="show" data-v="rest">Show resting</button><button type="button" class="secondary" data-j="show" data-v="shoot">Show shooting</button></div></div>
        ${a===b?'<p class="hint sim-joint-needs">Set how far it tilts to shoot; until then it stays still.</p>':'<p class="hint">It tilts to its shooting angle while the shooter spins up or aims. Shots leave at the launch angle the game physics uses either way.</p>'}`;}
      else if(d==='flywheel')roleBits=`<p class="hint">Spins at the flywheel speed (${m.shooter?.rpm??3000} rpm, set below under Flywheel and turret), drawn slower so it can be seen.</p>`;
      else if(d==='roller'||d==='feeder')roleBits=`<div class="start-xy">${num('rpm',j.rpm??(d==='roller'?300:200),{label:'Spins at',unit:'rpm',min:1,max:60000})}</div>`;
      else if(d==='wheel')roleBits='<p class="hint">Turns as the robot drives, rolling on the floor.</p>';
      else if(!d&&kin().couplings.some(c=>c.to===j.id)){const c=kin().couplings.find(x=>x.to===j.id),from=joints().find(x=>x.id===c.from);
        roleBits=`<p class="hint">Turns with “${esc(from?.name||c.from)}”, ${fix(Math.abs(c.ratio),2)}× as far${c.ratio<0?' the other way':''} (set under Linked to other parts).</p>`;}
      else if(d==='action'||!d){const st=Object.entries(j.states||{});
        roleBits=`<span class="sim-mech-label">Named positions</span>${st.map(([k,v])=>`<div class="sim-joint-state"><input aria-label="Position name" data-state-name="${esc(k)}" value="${esc(k)}"><input type="number" data-slider="off" aria-label="${esc(k)} value" data-state-value="${esc(k)}" value="${fix(v,2)}" step="any"><button type="button" class="secondary" data-j="show" data-v="${esc(k)}">Show</button><button type="button" class="icon-button" data-j="unstate" data-v="${esc(k)}" aria-label="Remove ${esc(k)}">×</button></div>`).join('')}
          <button type="button" class="secondary" data-j="state">+ Position</button>${j.type==='revolute'||j.type==='prismatic'?`<div class="start-xy">${num('lower',j.lower,{label:'Lowest',unit:j.type==='prismatic'?'in':'°'})}${num('upper',j.upper,{label:'Highest',unit:j.type==='prismatic'?'in':'°'})}</div>`:''}
          ${num('speed',j.speed??90,{label:'Moves at',unit:j.type==='prismatic'?'in/s':'°/s',min:.01})}<p class="hint">A route action with this joint’s name and a position (for example “${esc(j.name)} ${esc(st[0]?.[0]||'up')}”) moves it there.</p>`;}
      const range=j.type==='prismatic'?[j.lower??-6,j.upper??6]:j.type==='revolute'?[j.lower??-180,j.upper??180]:[-180,180],dof=K().dofOf(j).length;
      const alt=(j.alternatives||[]).map((a,i)=>`<li>${esc(a.note||'Another pivot')} <button type="button" class="secondary" data-j="alt" data-v="${i}">Use it</button></li>`).join('');
      return `<div class="sim-joint-body">
        ${j.note?`<p class="hint">${esc(j.note)}</p>`:''}
        ${parts?'':`<p class="hint sim-joint-needs">No CAD parts move for it yet, so nothing is drawn for it (the simulator still turns it). Click Choose parts below and click its parts on the model (Shift-click takes a whole assembly), then Pick a circle on what it turns on.</p>`}
        <div class="start-xy"><div><label>Moves by<select data-f="type">${Object.entries(K().TYPES).map(([k,t])=>`<option value="${k}"${k===j.type?' selected':''}>${esc(t.name)}</option>`).join('')}</select></label></div>
          <div><label>Driven by<select data-f="drive">${driveOptions(j).map(([k,t])=>`<option value="${k}"${k===driveKey(j)?' selected':''}>${esc(t)}</option>`).join('')}</select></label></div></div>
        <span class="sim-mech-label">Pivot</span><p class="sim-joint-where">${esc(where(j))}${j.radius?` · ${fix(2*j.radius*unit(),2)} in across`:''}</p>
        <div class="sim-joint-buttons"><button type="button" class="secondary" data-j="circle" aria-pressed="${mode?.kind==='circle'&&mode.joint===j.id}">${mode?.kind==='circle'&&mode.joint===j.id?'Click a round part, hole or edge…':'Pick a circle'}</button>
          <button type="button" class="secondary" data-j="points" aria-pressed="${mode?.kind==='points'&&mode.joint===j.id}">${mode?.kind==='points'&&mode.joint===j.id?(mode.first?'Click a second point on the axis…':'Click a point on the axis…'):'Two points'}</button>
          <button type="button" class="secondary" data-j="flip">Flip direction</button></div>
        ${alt?`<ul class="sim-joint-alts">${alt}</ul>`:''}
        ${roleBits}
        ${dof===1?`<label class="sim-joint-try">Try it<input type="range" data-try min="${range[0]}" max="${range[1]}" step="0.5" value="${fix(K().valuesOf(j,values[j.id]??j.home??0)[0],1)}"></label>`:''}
        ${clearanceBits(j)}
        <span class="sim-mech-label">Parts</span><p class="hint">Moves ${parts} part${parts===1?'':'s'}${j.parent?` and rides on ${esc(joints().find(x=>x.id===j.parent)?.name||j.parent)}`:''}.</p>
        <div class="sim-joint-buttons"><button type="button" class="secondary" data-j="parts" aria-pressed="${mode?.kind==='parts'&&mode.joint===j.id}">${mode?.kind==='parts'&&mode.joint===j.id?'Click parts to add or remove · Done':'Choose parts'}</button>
          <label class="sim-joint-parent">Rides on<select data-f="parent"><option value="">The robot</option>${others.map(x=>`<option value="${esc(x.id)}"${x.id===j.parent?' selected':''}>${esc(x.name)}</option>`).join('')}</select></label></div>
        ${links(j)}
        <details class="sim-mech-code"><summary>Exact pivot</summary><p class="hint">Robot inches: x forward, y left, z up from the robot’s centre on the floor.</p>
          <div class="sim-grid3">${toRobot(j.origin).map((v,i)=>num('origin:'+i,v,{label:'Pivot '+'xyz'[i],unit:'in',slider:false})).join('')}</div>
          <div class="sim-grid3">${dirToRobot(j.axis).map((v,i)=>num('axis:'+i,v,{label:'Axis '+'xyz'[i],step:'any',slider:false})).join('')}</div>
          <label>Name<input data-f="name" maxlength="80" value="${esc(j.name)}"></label>
          <button type="button" class="secondary sim-joint-remove" data-j="remove">Remove this moving part</button></details>
      </div>`;
    }
    // Moving with other parts: following one by a ratio (gears, belts, a mirrored finger, a cascade stage), or pinned to
    // one at a shared pin, closing a loop (a four-bar's coupler and rocker), the free joints being solved to keep it shut.
    function links(j){
      const k=kin(),one=K().dofOf(j).length===1,others=joints().filter(x=>x.id!==j.id&&K().dofOf(x).length===1),c=k.couplings.find(x=>x.to===j.id),loops=k.loops.map((l,i)=>({l,i})).filter(({l})=>l.a.joint===j.id||l.b.joint===j.id),open=c||loops.length;
      const pin=mode?.kind==='loop'&&mode.joint===j.id;
      return `<details class="sim-mech-code"${open?' open':''}><summary>Linked to other parts</summary>
        ${one?`<div class="start-xy"><div><label>Follows<select data-link="from"><option value="">Nothing</option>${others.map(x=>`<option value="${esc(x.id)}"${c?.from===x.id?' selected':''}>${esc(x.name)}</option>`).join('')}</select></label></div>${c?num('link:ratio',c.ratio,{label:'Times',slider:false})+num('link:offset',c.offset,{label:'Plus',slider:false}):''}</div>
        <p class="hint">Its ${j.type==='prismatic'?'travel':'angle'} is the other part’s times this: −1 mirrors it, a gear pair is minus the tooth ratio, a belt plus the pulley ratio, a cascade stage 1.</p>`:''}
        ${loops.map(({l,i})=>{const other=l.a.joint===j.id?l.b.joint:l.a.joint;return `<p class="hint">Pinned to ${esc(other?joints().find(x=>x.id===other)?.name||other:'the robot')} at a shared pin. <button type="button" class="text-button" data-j="unloop" data-v="${i}">Remove</button></p>`;}).join('')}
        <div class="sim-joint-buttons"><label class="sim-joint-parent">Pin it to<select data-loop-other><option value="">The robot</option>${joints().filter(x=>x.id!==j.id).map(x=>`<option value="${esc(x.id)}"${pin&&mode.other===x.id?' selected':''}>${esc(x.name)}</option>`).join('')}</select></label>
          <button type="button" class="secondary" data-j="loop" aria-pressed="${pin}">${pin?'Click the shared pin on the model…':'Pick the shared pin'}</button></div>
        ${loops.length?'<p class="hint">Set Driven by to Nothing on the parts the loop moves; they are worked out to keep it closed.</p>':''}</details>`;
    }
    // Saved actions: steps that move parts together, one after another or after a wait. A route action with the name runs it.
    function actionsSection(){
      const k=kin(),movers=[...k.joints.filter(j=>j.drive?.signal==='action'&&K().dofOf(j).length===1).map(j=>({id:j.id,name:j.name,states:Object.keys(j.states||{})})),...k.actuators.map(a=>({id:a.id,name:a.name,states:Object.keys(a.states||{})}))];
      if(!movers.length)return '';
      return `<div class="sim-joint-actions"><div class="sim-joints-head"><h4>Actions</h4><button type="button" class="secondary" data-j="action-add">+ Action</button></div>
        <p class="hint">Steps that move parts together, one after another or after a wait. A route action with the action’s name runs it; at a pin the robot waits until it is done.</p>
        ${k.actions.map((a,i)=>`<section class="sim-joint-action" data-action="${i}"><div class="sim-joint-action-head"><input aria-label="Action name" data-act="name" maxlength="40" value="${esc(a.name)}"><button type="button" class="secondary" data-j="action-play">Play</button><button type="button" class="icon-button" data-j="action-remove" aria-label="Remove ${esc(a.name)}">×</button></div>
          <ol>${a.steps.map((st,n)=>{const mv=movers.find(x=>x.id===st.actuator);return `<li data-step="${n}"><select aria-label="Part" data-step-f="actuator">${movers.map(x=>`<option value="${esc(x.id)}"${x.id===st.actuator?' selected':''}>${esc(x.name)}</option>`).join('')}</select>
            <select aria-label="Position" data-step-f="state">${(mv?.states||[]).map(x=>`<option${x===st.command.state?' selected':''}>${esc(x)}</option>`).join('')}</select>
            <select aria-label="Starts" data-step-f="after"><option value="">at the start</option>${a.steps.slice(0,n).map((_,m)=>`<option value="${m}"${st.after===m?' selected':''}>after step ${m+1}</option>`).join('')}</select>
            <label>+<input type="number" data-slider="off" aria-label="Wait first, seconds" data-step-f="delay" min="0" max="60" step="any" value="${fix(st.delay,2)}"> s</label><button type="button" class="icon-button" data-j="step-remove" aria-label="Remove step ${n+1}">×</button></li>`;}).join('')}</ol>
          <button type="button" class="secondary" data-j="step-add">+ Step</button></section>`).join('')}</div>`;
    }
    function render(){
      const k=kin(),m=meta(),cadOk=!!arrays()&&!!m?.id,list=k.model===m?.id?k.joints:[];
      const typing=host.contains(document.activeElement)&&document.activeElement.matches('input:not([type=range]),select');
      const key=JSON.stringify([k,open,mode,cadOk,api.mechanisms(),!!api.hitboxes?.()]);if(typing||key===lastKey){gizmos();return;}lastKey=key;
      host.hidden=!cadOk&&!list.length;
      host.innerHTML=`<div class="sim-joints-head"><h3>Moving parts</h3><div class="sim-joint-buttons"><button type="button" class="secondary" data-j="find">${list.length?'Find again':'Find moving parts'}</button><button type="button" class="secondary" data-j="add">+ Add</button>${list.length?`<button type="button" class="secondary" data-j="demo" aria-pressed="${!!demo}">${demo?'Stop':'Play'}</button><button type="button" class="secondary" data-j="hitboxes" aria-pressed="${!!api.hitboxes?.()}" title="A box round each moving part's CAD parts, moving with it">Hitboxes</button>`:''}</div></div>
        <p class="hint sim-joints-status" role="status"></p>
        ${list.length?`<ol class="sim-joint-list">${list.map(j=>{const [lv,text]=level(j),on=open===j.id;return `<li class="sim-joint" data-id="${esc(j.id)}"><button type="button" class="sim-joint-row" data-j="toggle" aria-expanded="${on}"><i data-color="${hex(colorOf(j))}"></i><span>${esc(j.name)}</span><small class="sim-joint-badge" data-level="${lv}">${esc(text)}${j.source==='inferred'&&finite(j.confidence)?` · ${Math.round(j.confidence*100)}%`:''}</small></button>${on?body(j):''}</li>`;}).join('')}</ol>`:`<p class="hint">${cadOk?'Find the pivots, axles and moving parts in your CAD, then check each one on the model.':'Import your robot as a STEP assembly to find its moving parts.'}</p>`}${list.length?actionsSection():''}`;
      // Colours go in through the style object (the page allows no inline style attributes).
      for(const dot of host.querySelectorAll("[data-color]"))dot.style.background=dot.dataset.color;
      highlight();gizmos();
    }
    function highlight(){const p=preview();if(!p)return;const j=joints().find(x=>x.id===open);p.highlight(j?leavesOf(j):null,j?colorOf(j):undefined);}
    // Pivot marks on the preview, posed with the joints' current preview values.
    function gizmos(){
      const p=preview(),body=p?.body?.(),kmod=body?.userData?.kin?.model;if(!p||!kmod){p?.gizmos([]);return;}
      const pose=K().pose(kmod,values),stand=new Set(body.userData.kin.standIns),M=math(),Pm=P();
      const list=kmod.joints.filter(j=>open?j.id===open:true).map(j=>{const W=j.parent?pose.W.get(j.parent):M.I4(),o=M.apply(W,j.origin),a=M.applyDir(W,j.axis),ro=stand.has(j.id)||!Pm?o:M.apply(Pm,o),ra=stand.has(j.id)||!Pm?M.unit(a):M.unit(M.applyDir(Pm,a));
        let arrow=null;if(j.drive?.signal==='turret'){const q=(K().valuesOf(j,pose.q[j.id])[0]||0)+(j.zero||0),t=q*Math.PI/180;arrow=[Math.cos(t),Math.sin(t),0];}
        return {origin:ro,axis:ra,radius:j.radius?j.radius*(stand.has(j.id)?1:unit()):1,color:colorOf(j),dim:!open,arrow,lift:arrow?2:0};});
      p.gizmos(list);
    }
    function showPose(){const p=preview();if(!p)return;p.posed(values);gizmos();}
    // ---- picking on the model
    function picker(){
      if(!mode)return null;
      return hit=>{if(!hit)return;const j=joints().find(x=>x.id===mode.joint);if(!j){mode=null;render();return;}
        if(mode.kind==='circle'){const c=ctx();if(!c||!Number.isFinite(hit.part))return status('Click a part of the model.');const fit=D().fitAt(c,{leaf:Math.round(hit.part),point:hit.local,face:hit.face});
          if(fit.error)return status(fit.error);const id=j.id;mode=null;
          change(id,x=>{x.origin=fit.origin;x.axis=orient(x,fit.axis,fit.origin);x.radius=fit.radius;x.note=`Pivot measured on “${fit.name}” (${fit.kind==='hole'?'a hole':fit.kind==='edge'?'a round edge':fit.kind==='part'?'a round part':'a curved surface'}, ${fix(2*fit.radius*unit(),2)} in across).`;delete x.alternatives;});
          status(`Pivot set on “${fit.name}”.`);}
        else if(mode.kind==='points'){const p=fromRobot([hit.x,hit.y,hit.z]);if(!mode.first){mode.first=p;status('Now click a second point along the same axis.');render();return;}
          const a=math().sub(p,mode.first);if(math().len(a)<1e-3)return status('Pick a point further from the first.');const first=mode.first,id=j.id;mode=null;
          change(id,x=>{x.origin=first;x.axis=orient(x,math().unit(a),first);x.note='Pivot set from two points on the model.';delete x.alternatives;});status('Pivot set through the two points.');}
        else if(mode.kind==='loop'){const p=fromRobot([hit.x,hit.y,hit.z]),other=mode.other||null,id=j.id;mode=null;const next=structuredClone(kin());next.loops.push({a:{joint:id,point:p},b:{joint:other,point:p}});api.commit(next);
          status(`Pinned at that point. ${joints().find(x=>x.id===other)?.name||'The robot'} and ${j.name} now stay joined there.`);}
        else if(mode.kind==='parts'){const c=ctx();if(!c||!Number.isFinite(hit.part))return;const leaf=Math.round(hit.part),set=leavesOf(j),name=c.parts.name(leaf);
          // Shift-click takes the whole assembly the part sits in.
          const group=hit.shift?[...c.parts.leavesUnder(c.parts.nodes[c.tree.leaf[leaf]])]:[leaf],adding=!set.has(leaf);for(const k of group)adding?set.add(k):set.delete(k);
          change(j.id,x=>{x.parts=c.parts.compress(set);});status(`${adding?'Added':'Removed'} “${name}”${group.length>1?` and the ${group.length-1} other parts with it`:''}.`);}
      };
    }
    // A turret's axis points up; a ramp's turns so positive angles lower it; others stay as measured.
    function orient(j,axis,origin){const M=math(),u=up();
      if(j.drive?.signal==='turret')return M.dot(axis,u)>=0?axis:M.scale(axis,-1);
      if(j.drive?.signal==='deploy'){const c=centroid(j);if(c){const t=M.apply(M.about(origin,axis,10),c);if(M.dot(t,u)>M.dot(c,u))return M.scale(axis,-1);}}
      return axis;}
    // The intake's pickup box from where a ramp's or kicker's parts reach when it is down: how far past the chassis edge,
    // how wide along it and how high (robot inches).
    function pickupBox(j){
      const c=ctx(),Pm=P(),n=+String(j.drive?.of||'').split(':')[1]||0,intake=api.mechanisms().intakes[n],f=api.footprint?.();if(!c||!Pm||!intake||!f)return;
      const W=math().mul(Pm,K().motion(j,j.states?.lowered??0,unit())),[dx,dy]={front:[1,0],back:[-1,0],left:[0,1],right:[0,-1]}[intake.sides[0]]||[1,0],edge=dx>0?f.front:dx<0?f.rear:f.half;
      let out=-Infinity,side=0,top=0;for(const k of leavesOf(j)){const v=c.vertsOf(k),step=Math.max(1,Math.floor(v.length/2000));for(let i=0;i<v.length;i+=step){const p=math().apply(W,c.P(v[i]));out=Math.max(out,dx*p[0]+dy*p[1]);side=Math.max(side,Math.abs(-dy*p[0]+dx*p[1]));top=Math.max(top,p[2]);}}
      if(!finite(out))return status('It has no parts to measure.');const box={reach:+Math.max(0,out-edge).toFixed(2),width:+Math.max(1,2*side).toFixed(2),height:+Math.max(1,Math.min(24,top)).toFixed(2)};
      api.setIntake(n,box);status(`Intake ${n+1}’s pickup box: ${box.reach} in out, ${box.width} in wide, ${box.height} in high, as the ${j.name.split(' · ')[0].toLowerCase()} reaches when down.`);
    }
    function centroid(j){const c=ctx();if(!c)return null;let A=0;const s=[0,0,0];for(const k of leavesOf(j)){const f=D().feature(c,k);if(!f)continue;A+=f.area;for(let i=0;i<3;i++)s[i]+=f.area*f.center[i];}return A?s.map(v=>v/A):null;}
    // Plays a saved action on the preview, along its timeline.
    function playAction(i){
      const k=kin(),a=k.actions[i];if(!a)return;if(demo){cancelAnimationFrame(demo);demo=0;}const tl=K().timeline(k,a),t0=performance.now();
      const step=now=>{const t=(now-t0)/1000,v=K().sampleTimeline(k,tl,Math.min(t,tl.duration)),out={...values};for(const [id,x] of Object.entries(v)){const act=k.actuators.find(y=>y.id===id);out[act?act.joint:id]=act?x/act.ratio:x;}
        values=out;showPose();if(t<tl.duration+.4)demo=requestAnimationFrame(step);else demo=0;};demo=requestAnimationFrame(step);status(`Playing “${a.name}” (${fix(tl.duration,2)} s).`);
    }
    // ---- the demo: every joint through its motion in a loop
    function play(){
      if(demo){cancelAnimationFrame(demo);demo=0;values={};showPose();render();return;}
      const t0=performance.now(),step=now=>{const t=(now-t0)/1000,ph=(Math.sin(t*1.4)+1)/2,v={};
        for(const j of joints()){const d=j.drive?.signal;
          if(d==='turret')v[j.id]=60*Math.sin(t*.9);else if(d==='deploy'){const a=j.states?.raised??0,b=j.states?.lowered??0;v[j.id]=a+(b-a)*ph;}
          // A hood with limits shows its whole pitch range; else it goes between resting and shooting.
          else if(d==='hood'){const lim=finite(j.lower)&&finite(j.upper)&&j.upper-j.lower>1,a=lim?j.lower:j.states?.rest??0,b=lim?j.upper:shootTilt(j,api.mechanisms().shooter?.hood);v[j.id]=a+(b-a)*ph;}else if(['flywheel','roller','feeder','wheel'].includes(d))v[j.id]=(t*240)%360;
          else if(j.type==='revolute'){const a=j.lower??-30,b=j.upper??30;v[j.id]=a+(b-a)*ph;}else if(j.type==='prismatic'){const a=j.lower??0,b=j.upper??4;v[j.id]=a+(b-a)*ph;}else if(j.type==='continuous')v[j.id]=(t*90)%360;}
        values=v;showPose();demo=requestAnimationFrame(step);};demo=requestAnimationFrame(step);render();
    }
    // ---- events
    host.addEventListener('click',e=>{
      const b=e.target.closest('[data-j]');if(!b)return;const what=b.dataset.j,li=b.closest('[data-id]'),id=li?.dataset.id,j=joints().find(x=>x.id===id);
      if(what==='find'){discover();return;}
      const ai=+b.closest('[data-action]')?.dataset.action;
      if(what==='action-add'){const next=structuredClone(kin()),first=next.joints.find(x=>x.drive?.signal==='action'&&Object.keys(x.states||{}).length)||next.actuators[0];if(!first)return;
        let name='Action '+(next.actions.length+1);next.actions.push({name,steps:[{actuator:first.id,command:{state:Object.keys(first.states||{})[0]||''}}]});api.commit(next);return;}
      if(what==='action-remove'){const next=structuredClone(kin());next.actions.splice(ai,1);api.commit(next);return;}
      if(what==='action-play'){playAction(ai);return;}
      if(what==='step-add'){const next=structuredClone(kin()),a=next.actions[ai],last=a.steps.at(-1);a.steps.push({...structuredClone(last),after:a.steps.length-1,delay:0});api.commit(next);return;}
      if(what==='step-remove'){const next=structuredClone(kin()),a=next.actions[ai],n=+b.closest('[data-step]').dataset.step;a.steps.splice(n,1);for(const st of a.steps)if(st.after!==null&&st.after>=n)st.after=st.after>n?st.after-1:null;if(!a.steps.length)next.actions.splice(ai,1);api.commit(next);return;}
      if(what==='demo'){play();return;}
      if(what==='hitboxes'){api.setHitboxes?.(!api.hitboxes?.());lastKey='';render();return;}
      if(what==='add'){const next=structuredClone(kin()),m=meta(),n=next.joints.length+1;let id2='joint'+n;while(next.joints.some(x=>x.id===id2))id2+='b';
        const c=ctx(),center=c?[(c.lo[0]+c.hi[0])/2,(c.lo[1]+c.hi[1])/2,(c.lo[2]+c.hi[2])/2]:[0,0,0];
        next.model=m?.id||next.model;next.unit=unit();next.joints.push({id:id2,name:`Moving part ${n}`,type:'revolute',origin:center,axis:rows()[1],parts:[],states:{up:0,down:45},speed:90,drive:{signal:'action'},source:'user',note:'Choose its parts, then pick its pivot.'});
        open=id2;mode={kind:'parts',joint:id2};api.commit(next);status('Click the parts that move together (Shift-click takes a whole assembly), then pick the pivot.');return;}
      if(what==='toggle'){open=open===id?null:id;mode=null;if(demo)play();values={};showPose();render();return;}
      if(!j)return;
      if(what==='circle'||what==='points'||what==='parts'){mode=mode?.kind===what&&mode.joint===id?null:{kind:what,joint:id};
        status(mode?{circle:'Click a round part (gear, bearing, shaft, wheel), a hole or a round edge on the model.',points:'Click a point on the pivot axis, then another along it.',parts:'Click parts to add or remove them (Shift-click: the whole assembly). Click Done when finished.'}[what]:'');api.refreshPicker();render();return;}
      if(what==='flip'){change(id,x=>{x.axis=x.axis.map(v=>-v);if(x.drive?.signal==='turret')x.zero=((x.zero||0)+360)%360-180;});return;}
      if(what==='zero'){change(id,x=>{x.zero=((((x.zero||0)+ +b.dataset.v)%360)+540)%360-180;});return;}
      if(what==='show'){const v=j.drive?.signal==='hood'&&b.dataset.v==='shoot'?shootTilt(j,api.mechanisms().shooter?.hood):j.states?.[b.dataset.v];if(finite(v)){values={...values,[id]:v};showPose();const r=li.querySelector('[data-try]');if(r)r.value=v;}return;}
      if(what==='unlaunch'){change(id,x=>{x.states={...x.states,shoot:+shootTilt(x,api.mechanisms().shooter?.hood).toFixed(2)};delete x.launch;});return;}
      if(what==='pickup'){pickupBox(j);return;}
      if(what==='floor'){const c=ctx();if(!c)return;const u=up();let floor=Infinity;for(const x of [c.lo[0],c.hi[0]])for(const y of [c.lo[1],c.hi[1]])for(const z of [c.lo[2],c.hi[2]])floor=Math.min(floor,x*u[0]+y*u[1]+z*u[2]);
        const a=D().swingToFloor(c,[...leavesOf(j)],j.origin,j.axis,{up:u,floor,clearance:.02/unit()});if(a===null)return status('It does not reach the floor within 150°; type how far it goes down.');
        change(id,x=>{x.states={...x.states,lowered:a};});values={...values,[id]:a};status(`Down set to ${a}°, where it touches the floor.`);return;}
      if(what==='alt'){const a=j.alternatives?.[+b.dataset.v];if(a)change(id,x=>{x.origin=a.origin;x.axis=a.axis;x.note=a.note;x.alternatives=(j.alternatives||[]).filter((_,i)=>i!==+b.dataset.v).concat([{origin:j.origin,axis:j.axis,note:'The pivot it had before'}]);});return;}
      if(what==='state'){change(id,x=>{const s=x.states||{};let name='position '+(Object.keys(s).length+1);s[name]=0;x.states=s;});return;}
      if(what==='unstate'){change(id,x=>{delete x.states[b.dataset.v];});return;}
      if(what==='clear'){void check(j);return;}
      if(what==='hit'){const h=clearance[id]?.hits?.[+b.dataset.v];if(!h)return;values={...values,[id]:h.at};showPose();const p=preview();p?.highlight(new Set(h.parts.flat()),0xe5484d);const r=li.querySelector('[data-try]');if(r)r.value=h.at;return;}
      if(what==='limits'){const c=clearance[id];if(!c)return;change(id,x=>{x.lower=c.free[0];x.upper=c.free[1];});return;}
      if(what==='loop'){const other=li.querySelector('[data-loop-other]')?.value||'';mode=mode?.kind==='loop'&&mode.joint===id?null:{kind:'loop',joint:id,other};status(mode?'Click the pin the two parts share on the model.':'');api.refreshPicker();render();return;}
      if(what==='unloop'){const next=structuredClone(kin());next.loops.splice(+b.dataset.v,1);api.commit(next);return;}
      if(what==='remove'){const next=structuredClone(kin());next.joints=next.joints.filter(x=>x.id!==id);for(const x of next.joints)if(x.parent===id)x.parent=null;open=null;mode=null;api.commit(next);return;}
    });
    host.addEventListener('change',e=>{
      const el=e.target,act=el.closest('[data-action]');
      if(act&&!el.closest('[data-id]')){const i=+act.dataset.action,next=structuredClone(kin()),a=next.actions[i];if(!a)return;
        if(el.dataset.act==='name'){const name=el.value.trim();if(name)a.name=name;}
        else{const st=a.steps[+el.closest('[data-step]').dataset.step],f2=el.dataset.stepF;
          if(f2==='actuator'){st.actuator=el.value;const mv=next.joints.find(x=>x.id===el.value)||next.actuators.find(x=>x.id===el.value);st.command={state:Object.keys(mv?.states||{})[0]||''};}
          else if(f2==='state')st.command={state:el.value};else if(f2==='after')st.after=el.value===''?null:+el.value;else if(f2==='delay'&&finite(el.valueAsNumber))st.delay=el.valueAsNumber;}
        api.commit(next);return;}
      const li=el.closest('[data-id]'),id=li?.dataset.id,j=joints().find(x=>x.id===id);if(!j)return;const f=el.dataset.f;
      if(el.dataset.link==='from'){const next=structuredClone(kin());next.couplings=next.couplings.filter(c=>c.to!==id);if(el.value)next.couplings.push({kind:'mimic',from:el.value,to:id,ratio:1,offset:0});api.commit(next);return;}
      if(el.matches('[data-loop-other]')){if(mode?.kind==='loop'&&mode.joint===id)mode.other=el.value;return;}
      if(el.dataset.stateName!==undefined){const old=el.dataset.stateName,name=el.value.trim().slice(0,24);if(!name||name===old)return;change(id,x=>{const v=x.states[old];delete x.states[old];x.states[name]=v;});return;}
      if(el.dataset.stateValue!==undefined){if(finite(el.valueAsNumber))change(id,x=>{x.states[el.dataset.stateValue]=el.valueAsNumber;});return;}
      if(!f)return;const v=el.type==='number'?el.valueAsNumber:el.value;
      // An empty limit box takes the limit away.
      if((f==='lower'||f==='upper')&&el.value.trim()==='')return change(id,x=>{delete x[f];});
      if(f==='type')return change(id,x=>{x.type=v;});
      if(f==='name')return change(id,x=>{x.name=String(v).trim()||x.name;});
      if(f==='parent')return change(id,x=>{x.parent=v||null;});
      if(f==='drive')return change(id,x=>{if(v==='none')delete x.drive;else{const [signal,...of]=v.split(':');x.drive={signal,...(of.length?{of:of.join(':')}:{})};}if(x.drive?.signal==='turret')x.axis=orient(x,x.axis,x.origin);});
      if(!finite(v))return;
      if(f.startsWith('state:'))return change(id,x=>{x.states={...x.states,[f.slice(6)]:v};});
      if(f.startsWith('link:')){const next=structuredClone(kin()),c=next.couplings.find(x=>x.to===id);if(c){c[f.slice(5)]=v;api.commit(next);}return;}
      if(f.startsWith('intake:')){const n=+String(j.drive?.of||'').split(':')[1]||0;api.setIntake(n,{[f.slice(7)]:v});return;}
      if(f==='shooter:hood'){api.setShooting?.({hood:v});return;}
      if(f==='launch')return change(id,x=>{x.launch=Math.max(0,Math.min(90,v));});
      if(f.startsWith('origin:')){const o=toRobot(j.origin);o[+f.slice(7)]=v;return change(id,x=>{x.origin=fromRobot(o);});}
      if(f.startsWith('axis:')){const a=dirToRobot(j.axis);a[+f.slice(5)]=v;if(math().len(a)<1e-6)return;return change(id,x=>{x.axis=dirFromRobot(math().unit(a));});}
      if(['zero','speed','rpm','lower','upper'].includes(f))return change(id,x=>{x[f]=v;});
    });
    host.addEventListener('input',e=>{const el=e.target;if(!el.matches('[data-try]'))return;const id=el.closest('[data-id]')?.dataset.id;if(!id)return;if(demo){cancelAnimationFrame(demo);demo=0;}values={...values,[id]:el.valueAsNumber};showPose();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mode){mode=null;status('');api.refreshPicker();render();}});
    return {render,picker,discover,
      // Called when the Mechanisms page opens: a CAD the finder has not looked at yet is looked at now, and a finding made
      // by an older finder is made again, keeping what the team set.
      shown(){const m=meta(),k=kin();if(m?.id&&(k.model!==m.id||k.discovered&&(k.finder||1)<FINDER)&&arrays())discover({quiet:true});else render();},
      hide(){if(demo){cancelAnimationFrame(demo);demo=0;}mode=null;}};
  }
  root.DeckJointsPanel={create};
})(typeof globalThis==='object'?globalThis:this);
