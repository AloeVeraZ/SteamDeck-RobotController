(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DeckWiring=api;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // The robot's wiring in Setup: what is plugged into each hub port (DeckHardware rows, planned ports and problems), the
  // editors for one device and its sensors, the hubs on the robot and a read-only summary of the whole configuration.
  // project.robot.wiring keeps only what the team set; an empty choice means Deck picks it (shown with what it picked).
  const H=()=>globalThis.DeckHardware||(typeof require==='function'?require('./sim-hardware.js'):null);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const ORDER=['motor','encoder','servo','analog','digital','i2c'];
  // Rows (with planned ports), problems and the stored wiring for one project; the same inputs give the same object.
  let memo={key:'',value:null};
  function state(project){
    const p=project||{},key=JSON.stringify([p.controller,p.robot,p.sensors,p.mechanisms,p.kinematics?.joints,p.kinematics?.actuators]);if(memo.key===key)return memo.value;
    const D=H();let value;
    try{const wiring=D.wiringOf(p.robot),raw=p.controller==='motionmodule'?[]:D.rows(p),rows=D.placed(raw,wiring),problems=D.conflicts(raw,wiring);value={wiring,rows,problems,error:null};}
    catch(e){value={wiring:D.wiringOf(p.robot),rows:[],problems:[],error:e.message};}
    value.project=p;memo={key,value};return value;}
  const problemsOf=(st,key)=>st.problems.filter(x=>x.keys.includes(key));
  const red=(st,test)=>st.problems.filter(x=>x.level==='red'&&x.keys.some(test));
  // The setup step a device belongs to: the drivetrain and its sensors on Robot, everything else on Mechanisms.
  const stepOf=key=>/^robot\./.test(key)?'robot':'mechanisms';
  // ---- choices ------------------------------------------------------------------------------------------------------
  // The types a device may be, by what it does: a roller on a DC motor or a continuous servo, a feeder that spins or a
  // servo that pushes or gates... Setting one sets the mechanism (setKind in Setup); the Model list then shows that type.
  const TYPES={roller:[['dcmotor','DC motor'],['crservo','Continuous servo']],ramp:[['servo','Servo'],['linear','Linear servo']],kicker:[['servo','Servo'],['linear','Linear servo']],
    hood:[['servo','Servo'],['linear','Linear servo']],feeder:[['dcmotor','DC motor'],['crservo','Continuous servo'],['pusher','Servo pusher'],['gate','Servo gate']],
    turret:[['dcmotor','DC motor'],['servo','Servo']],steer:[['crservo','Continuous servo'],['servo','Servo'],['dcmotor','DC motor']]};
  function typeOf(row,st){if(row.role==='feeder'){const s=st.project?.mechanisms?.shooters?.[row.setting?.index];return {motor:'dcmotor',crservo:'crservo',pusher:'pusher',gate:'gate'}[s?.indexerKind]||row.kind;}return row.kind;}
  function typeSelect(row,st){const list=TYPES[row.role];if(!list||/^kin\./.test(row.key))return '';const now=typeOf(row,st);
    return `<div><label for="wire-type-${esc(row.key)}">Type</label><select id="wire-type-${esc(row.key)}" data-wire-kind="${esc(row.key)}">${list.map(([k,l])=>`<option value="${k}"${k===now?' selected':''}>${esc(l)}</option>`).join('')}</select></div>`;}
  // Models a row may run on: its kind (a servo row may take a linear servo when its role allows one), grouped by maker.
  function modelChoices(row){
    const D=H(),role=D.ROLES[row.role];if(!role||!role.kinds.length)return [];
    const kinds=role.kinds.filter(k=>k===row.kind);
    return D.ACTUATORS.filter(m=>kinds.includes(m.kind));}
  const groupOf=m=>m.family||(m.name.split(/\s/)[0]);
  function modelSelect(row){
    const list=modelChoices(row);if(!list.length)return '';const groups=new Map();for(const m of list){const g=groupOf(m);if(!groups.has(g))groups.set(g,[]);groups.get(g).push(m);}
    const opts=[...groups].map(([g,ms])=>`<optgroup label="${esc(g)}">${ms.map(m=>`<option value="${esc(m.id)}"${m.id===row.model?' selected':''}>${esc(m.short||m.name)}${m.legal===false?' (not pre-verified)':''}</option>`).join('')}</optgroup>`).join('');
    return `<div><label for="wire-model-${esc(row.key)}">Model</label><select id="wire-model-${esc(row.key)}" data-wire-model="${esc(row.key)}"><option value="">Not set</option>${opts}</select></div>`;}
  // Ports of a family on the hubs the robot has, with who is on each now.
  function portChoices(family,st,{skip}={}){
    const D=H(),w=st.wiring,hubs=['control',...(w.hubs.expansion?['expansion']:[]),...(w.hubs.servoHub?['servoHub']:[])],out=[];
    const n=(hub)=>D.HUBS[hub][family==='encoder'?'encoder':family]||0;
    for(const hub of hubs)for(let i=0;i<n(hub);i++){if(family==='i2c'&&hub==='control'&&i===0)continue;const p=family==='i2c'?{hub,bus:i}:{hub,port:i};
      const on=st.rows.filter(r=>r.key!==skip&&r.hub===hub&&(r.family===family||family==='motor'&&r.family==='encoder'||family==='encoder'&&r.family==='motor')&&(family==='i2c'?r.bus===i:r.port===i)).map(r=>r.name);
      out.push({value:`${hub}:${i}`,label:`${D.portLabel(p,family,w)}${on.length?` · ${[...new Set(on)].join(', ')}`:''}`});}
    return out;}
  function portSelect(row,st,{id='wire-port-'+row.key,attr='data-wire-port',key=row.key,family=row.family,set=row.wired?(row.family==='i2c'?`${row.hub}:${row.bus}`:`${row.hub}:${row.port}`):''}={}){
    if(!family||row.role==='imu')return `<div><span class="sim-mech-label">Plugged into</span><p class="sim-wire-fixed">${esc(row.portLabel||'Control Hub I2C bus 0')}</p></div>`;
    const planned=row.portLabel&&!set?row.portLabel:'',mates=attr==='data-wire-port'&&(family==='motor'||family==='servo')?shareable(row,st):[],shared=sharedWith(row,st);
    const share=mates.length?`<optgroup label="Same ${family==='motor'?'motor':'servo'} as another mechanism (belted or geared together)">${mates.map(r=>`<option value="share:${esc(r.key)}"${shared?.key===r.key?' selected':''}>${esc(r.label)} · ${esc(r.name)}</option>`).join('')}</optgroup>`:'';
    return `<div><label for="${esc(id)}">Plugged into</label><select id="${esc(id)}" ${attr}="${esc(key)}"><option value=""${!shared&&!set?' selected':''}>${planned?`Deck picks · ${esc(planned)}`:'Deck picks a free port'}</option>${portChoices(family,st,{skip:row.key}).map(o=>`<option value="${o.value}"${!shared&&o.value===set?' selected':''}>${esc(o.label)}</option>`).join('')}${share}</select></div>`;}
  // Devices this one could share an actuator with (the same family, not a sensor, pod or the IMU), and the one it shares
  // with: another device of its family with the same configuration name.
  const shareable=(row,st)=>st.rows.filter(r=>r.key!==row.key&&r.family===row.family&&!['sensor','pod','imu'].includes(r.role));
  const sharedWith=(row,st)=>st.rows.find(r=>r.key!==row.key&&r.family===row.family&&r.name===row.name&&!['sensor','pod','imu'].includes(r.role))||null;
  const problemLines=list=>list.map(x=>`<p class="sim-wire-problem ${x.level}">${esc(x.text)}</p>`).join('');
  // ---- one device -----------------------------------------------------------------------------------------------------
  // A device's row: its name, model, port, a sentence on what it is and does, and its problems (red: blocks the next steps).
  function deviceHtml(row,st,{sensors=false,model=true}={}){
    const D=H(),list=problemsOf(st,row.key),level=list.some(x=>x.level==='red')?'red':list.length?'amber':'';
    const role=D.ROLES[row.role],why=role?.explain?`<p class="hint sim-wire-why">${esc(role.explain)}</p>`:'';
    const pod=row.role==='pod'?'<p class="hint">Plug the pod into the encoder input of a motor port: the code reads it through the name of the motor on that port.</p>':'';
    return `<div class="sim-wire-row${level?' '+level:''}" data-wire-row="${esc(row.key)}"><div class="sim-wire-head"><b>${esc(row.label)}</b><code title="Its name in the robot configuration">${esc(row.name)}</code></div>
      ${model&&TYPES[row.role]&&!/^kin\./.test(row.key)?`<div class="start-xy">${typeSelect(row,st)}${modelSelect(row)}</div><div class="start-xy">${portSelect(row,st)}</div>`:`<div class="start-xy">${model?modelSelect(row):''}${portSelect(row,st)}</div>`}<p class="sim-wire-explain">${esc(D.explain(row,st.wiring))}${sharedWith(row,st)?` It shares this ${row.family==='servo'?'servo':'motor'} with ${esc(sharedWith(row,st).label.toLowerCase())}: they are belted or geared together and always turn together.`:''}</p>${pod}${sensors?sensorsHtml(row,st):''}${problemLines(list)}${sensors?'':why}</div>`;}
  // Sensors on one device: each with its model, what it is used for and its port, and an Add choice of the sensors the
  // export can use on that device.
  function sensorsHtml(row,st){
    const D=H(),allowed=D.ROLES[row.role]?.sensors||{},own=st.wiring.sensors.filter(s=>s.for===row.key);
    const items=own.map(s=>{const md=D.SENSOR_MODELS[s.model],sr=st.rows.find(r=>r.key==='sensor.'+s.id)||{key:'sensor.'+s.id,family:md.family,role:'sensor'},list=problemsOf(st,'sensor.'+s.id);
      const port=md.kind==='motorEncoder'?`<div><span class="sim-mech-label">Plugged into</span><p class="sim-wire-fixed">The motor’s own cable</p></div>`:portSelect(sr,st,{id:'wire-sensor-'+s.id,attr:'data-wire-sensor-port',key:s.id,family:md.family,set:s.hub?(md.family==='i2c'?`${s.hub}:${s.bus}`:`${s.hub}:${s.port}`):''});
      const uses=md.measures.length>1?`<div><label for="wire-use-${esc(s.id)}">Tells</label><select id="wire-use-${esc(s.id)}" data-wire-sensor-use="${esc(s.id)}">${md.measures.map(u=>`<option value="${u}"${u===s.use?' selected':''}>${esc(D.USES[u])}</option>`).join('')}</select></div>`:'';
      return `<li class="sim-wire-sensor${list.some(x=>x.level==='red')?' red':list.length?' amber':''}"><div class="sim-wire-head"><b>${esc(md.short)}</b>${md.kind==='motorEncoder'?'':`<code>${esc(sr.name||s.id)}</code>`}<button type="button" class="icon-button" data-wire-sensor-remove="${esc(s.id)}" aria-label="Remove ${esc(md.short)}" title="Remove">×</button></div>
        <div class="start-xy">${uses}${port}</div>${md.kind==='motorEncoder'?'':`<p class="sim-wire-explain">${esc(D.explain(sr,st.wiring))}</p>`}${problemLines(list)}</li>`;});
    const can=D.SENSORS.filter(m=>Object.hasOwn(allowed,m.kind)&&!(m.kind==='motorEncoder'&&(row.family!=='motor'||own.some(s=>s.model===m.id))));
    const add=can.length?`<label class="sr-only" for="wire-add-${esc(row.key)}">Add a sensor to ${esc(row.label)}</label><select id="wire-add-${esc(row.key)}" data-wire-sensor-add="${esc(row.key)}"><option value="">+ Add a sensor…</option>${can.map(m=>`<option value="${m.id}">${esc(m.short)}: tells ${esc(D.USES[allowed[m.kind]])}</option>`).join('')}</select>`:'';
    return `<div class="sim-wire-sensors"><span class="sim-mech-label">Sensors</span>${items.length?`<ul>${items.join('')}</ul>`:`<p class="hint">${row.encoder?'Its own encoder is read (no extra sensor).':'None: it runs on set positions and times.'}</p>`}${add}</div>`;}
  // ---- hubs -----------------------------------------------------------------------------------------------------------
  function hubsHtml(st){
    const w=st.wiring,box=(id,name,note)=>`<div class="sim-wire-hub"><label class="check" for="wire-hub-${id}"><input id="wire-hub-${id}" type="checkbox" data-wire-hub="${id}"${w.hubs[id]?' checked':''}> ${name}</label>${w.hubs[id]?`<label for="wire-address-${id}">Address</label><select id="wire-address-${id}" data-wire-address="${id}">${Array.from({length:20},(_,i)=>i+1).filter(a=>a!==173).map(a=>`<option${a===w.hubs[id].address?' selected':''}>${a}</option>`).join('')}</select>`:''}<p class="hint">${note}</p></div>`;
    return `<div class="sim-wire-hubs"><div class="sim-wire-hub"><label class="check"><input type="checkbox" checked disabled> Control Hub</label><p class="hint">Always there: 4 motor ports (each with an encoder input), 6 servo ports, 4 analog, 8 digital, 4 I2C buses; its own IMU is on I2C bus 0.</p></div>
      ${box('expansion','Expansion Hub','4 more motor ports and 6 more servo ports, on the Control Hub’s RS485 cable.')}</div>${['control',...(w.hubs.expansion?['expansion']:[])].map(h=>portGrid(st,h)).join('')}`;}
  // Every motor port, servo port and I2C bus of one hub with what is plugged into it, as Configure Robot shows a hub:
  // pick a device for a port and it moves there (whatever the team had put on that port goes back to Deck's choice).
  function portGrid(st,hub){
    const D=H(),w=st.wiring,devices=st.rows.filter(r=>!['sensor','pod','imu'].includes(r.role));
    const fams=[['motor','Motor port',D.HUBS[hub].motor,0],['servo','Servo port',D.HUBS[hub].servo,0],['i2c','I2C bus',D.HUBS[hub].i2c,hub==='control'?1:0]];
    const cells=fams.map(([fam,name,n,from])=>Array.from({length:n-from},(_,k)=>{const i=k+from,on=devices.find(r=>r.family===fam&&r.hub===hub&&(fam==='i2c'?r.bus===i:r.port===i)),id=`wire-slot-${hub}-${fam}-${i}`;
      const opts=devices.filter(r=>r.family===fam).map(r=>`<option value="${esc(r.key)}"${on?.key===r.key?' selected':''}>${esc(r.label)} · ${esc(r.name)}${on?.key===r.key&&r.planned?' (Deck picked)':''}</option>`).join('');
      return `<div class="sim-wire-slot"><label for="${id}">${name} ${i}</label><select id="${id}" data-wire-slot="${hub}|${fam}|${i}"><option value="">Nothing</option>${opts}</select></div>`;}).join('')).join('');
    return `<div class="sim-wire-grid"><h4 class="sim-setup-group">${esc(D.hubName(hub,w))}${hub==='control'?' · I2C bus 0: its IMU':''}</h4><div class="sim-wire-slots">${cells}</div></div>`;}
  // ---- the whole configuration ----------------------------------------------------------------------------------------
  // Every port in use, hub by hub, as it goes into the robot's configuration.
  function summaryHtml(st){
    const D=H(),w=st.wiring;if(st.error)return `<p class="hint">${esc(st.error)}</p>`;
    const hubs=['control',...(w.hubs.expansion?['expansion']:[]),...(w.hubs.servoHub?['servoHub']:[])],rows=st.rows.filter(r=>r.hub&&!r.conflict);
    const sections=hubs.map(hub=>{const on=rows.filter(r=>r.hub===hub).sort((a,b)=>ORDER.indexOf(a.family)-ORDER.indexOf(b.family)||(a.port??a.bus)-(b.port??b.bus));
      const lines=on.map(r=>{const md=D.MODELS[r.model]||D.SENSOR_MODELS[r.model],place=r.family==='i2c'?`I2C ${r.bus}`:`${{motor:'Motor',encoder:'Encoder',servo:'Servo',analog:'Analog',digital:'Digital'}[r.family]||'Port'} ${r.port}`;
        return `<tr data-config-row="${esc(r.key)}"${problemsOf(st,r.key).some(x=>x.level==='red')?' class="red"':''}><td>${place}</td><td><code>${esc(r.via?r.via:r.name)}</code></td><td>${esc(r.label)}${r.via?' (read through this motor)':''}</td><td>${esc(md?.short||(r.role==='imu'?'Built-in IMU':''))}</td><td>${r.planned?'<span class="hint">Deck picked</span>':''}</td></tr>`;});
      return `<h4 class="sim-setup-group">${esc(D.hubName(hub,w))}</h4>${lines.length?`<table class="sim-wire-table"><thead><tr><th>Port</th><th>Name</th><th>What</th><th>Model</th><th></th></tr></thead><tbody>${lines.join('')}</tbody></table>`:'<p class="hint">Nothing plugged in.</p>'}`;}).join('');
    return sections+problemLines(st.problems);}
  // ---- what to light up on the model ------------------------------------------------------------------------------------
  // The CAD parts (refs for DeckKinematics.partIndex().expand) of what is being edited: a device or sensor row (the joints it
  // moves, with the parts riding on them), a game part (intake:N, shooter:N: its joints and its named assemblies) or a
  // moving part (kin:<joint id>).
  function focusRefs(project,target){
    const p=project||{},joints=p.kinematics?.joints||[],named=p.model?.parts||[],m=p.mechanisms||{},out=new Set();if(typeof target!=='string'||!target)return [];
    const joint=id=>{const ids=[id];for(let i=0;i<ids.length;i++)for(const j of joints)if(j.parent===ids[i]&&!ids.includes(j.id))ids.push(j.id);for(const x of ids)for(const r of joints.find(j=>j.id===x)?.parts||[])out.add(r);};
    const names=list=>{for(const n of list||[]){const part=named.find(q=>q.name===n);if(part?.key)out.add(part.key);}};
    const game=(kind,n)=>{const of=`${kind}:${n}`;for(const j of joints)if(j.drive?.of===of||kind==='shooter'&&j.drive?.of==='any')joint(j.id);names(m[kind+'s']?.[n]?.parts);
      if(kind==='shooter'&&n===1&&m.shooters?.[1]?.sharesTurret)for(const j of joints)if(j.drive?.of==='shooter:0'&&j.drive.signal==='turret')joint(j.id);};
    let k;if((k=/^kin:(.+)$/.exec(target)))joint(k[1]);else if((k=/^(intake|shooter):([0-9])$/.exec(target)))game(k[1],+k[2]);
    else{const row=state(p).rows.find(r=>r.key===target);if(row?.joints?.length)for(const id of row.joints)joint(id);else{const g=/^(intakes|shooters)[.]([0-9])[.]/.exec(row?.for||target);if(g)game(g[1].slice(0,-1),+g[2]);}}
    return [...out];}
  // ---- changes --------------------------------------------------------------------------------------------------------
  // Each returns the new wiring for project.robot.wiring (null when nothing is set).
  const parsePort=(v,family)=>{if(!v)return null;const [hub,n]=v.split(':');return family==='i2c'?{hub,bus:+n}:{hub,port:+n};};
  function setDevice(wiring,key,change){const D=H(),w=D.wiringOf({wiring}),e={...(w.devices[key]||{})};change(e);for(const k of Object.keys(e))if(e[k]===undefined||e[k]===null||e[k]==='')delete e[k];
    const devices={...w.devices};if(Object.keys(e).length)devices[key]=e;else delete devices[key];return D.sanitizeWiring({...w,devices});}
  const setModel=(wiring,key,model)=>setDevice(wiring,key,e=>{e.model=model||undefined;});
  const setPort=(wiring,key,value,family)=>setDevice(wiring,key,e=>{delete e.hub;delete e.port;delete e.bus;Object.assign(e,parsePort(value,family)||{});});
  function setHub(wiring,hub,on,address){const D=H(),w=D.wiringOf({wiring});return D.sanitizeWiring({...w,hubs:{...w.hubs,[hub]:on?{address:address??w.hubs[hub]?.address??D.HUBS[hub].address}:hub==='expansion'?false:null}});}
  // A device picked for one port: it moves there, and a device the team had put on that port goes back to Deck's choice.
  function setSlot(wiring,st,hub,fam,i,key){let w=wiring;const on=st.rows.find(r=>r.family===fam&&r.hub===hub&&(fam==='i2c'?r.bus===i:r.port===i)&&r.role!=='sensor'&&r.role!=='pod');
    if(on&&on.key!==key&&on.wired)w=setPort(w,on.key,'',fam);if(key)w=setPort(w,key,`${hub}:${i}`,fam);return w;}
  function setSensor(wiring,id,change){const D=H(),w=D.wiringOf({wiring});return D.sanitizeWiring({...w,sensors:w.sensors.map(s=>{if(s.id!==id)return s;const e={...s};change(e,D.SENSOR_MODELS[s.model]);return e;}).filter(Boolean)});}
  const removeSensor=(wiring,id)=>{const D=H(),w=D.wiringOf({wiring});return D.sanitizeWiring({...w,sensors:w.sensors.filter(s=>s.id!==id)});};
  const setSensorPort=(wiring,id,value)=>setSensor(wiring,id,(e,md)=>{delete e.hub;delete e.port;delete e.bus;Object.assign(e,parsePort(value,md.family)||{});});
  // Binds a host's controls: every change calls apply(newWiring).
  function bind(host,{project,apply,focus,setKind,share}){
    host.addEventListener('change',e=>{const el=e.target,d=el.dataset,w=project().robot.wiring,st=state(project());let next;
      if(d.wireModel)next=setModel(w,d.wireModel,el.value);
      else if(d.wirePort){const row=st.rows.find(r=>r.key===d.wirePort);
        // Sharing takes the other device's name and port; a port of its own again gives it a name of its own.
        if(el.value.startsWith('share:')){if(share)share(d.wirePort,el.value.slice(6));return;}
        if(row&&sharedWith(row,st)&&share)share(d.wirePort,null);next=setPort(project().robot.wiring,d.wirePort,el.value,row?.family);}
      else if(d.wireHub)next=setHub(w,d.wireHub,el.checked);
      else if(d.wireSlot){const [hub,fam,i]=d.wireSlot.split('|');next=setSlot(w,st,hub,fam,+i,el.value);}
      else if(d.wireKind){if(setKind)setKind(d.wireKind,el.value);return;}
      else if(d.wireAddress)next=setHub(w,d.wireAddress,true,+el.value);
      else if(d.wireSensorAdd){if(!el.value)return;const row=st.rows.find(r=>r.key===d.wireSensorAdd),allowed=H().ROLES[row?.role]?.sensors||{},md=H().SENSOR_MODELS[el.value];
        const D=H(),wiring=D.wiringOf({wiring:w}),base=row?.name||'sensor';let id=`${base}${md.kind[0].toUpperCase()}${md.kind.slice(1)}`.replace(/[^\w-]/g,'').slice(0,28),n=1;if(!/^[A-Za-z]/.test(id))id='s'+id;while(wiring.sensors.some(s=>s.id===id))id=`${id.slice(0,26)}${++n}`;
        next=D.sanitizeWiring({...wiring,sensors:[...wiring.sensors,{id,model:el.value,for:d.wireSensorAdd,...(allowed[md.kind]&&md.measures.includes(allowed[md.kind])?{use:allowed[md.kind]}:{})}]});}
      else if(d.wireSensorUse)next=setSensor(w,d.wireSensorUse,s=>{s.use=el.value;});
      else if(d.wireSensorPort)next=setSensorPort(w,d.wireSensorPort,el.value);
      else return;apply(next);});
    host.addEventListener('click',e=>{const b=e.target.closest('[data-wire-sensor-remove]');if(b)apply(removeSensor(project().robot.wiring,b.dataset.wireSensorRemove));});
    if(focus)host.addEventListener('focusin',e=>{const r=e.target.closest('[data-wire-row]');if(r)focus(r.dataset.wireRow);});}
  return {state,stepOf,focusRefs,sharedWith,shareable,TYPES,typeOf,setSlot,portGrid,red,problemsOf,modelChoices,portChoices,deviceHtml,sensorsHtml,hubsHtml,summaryHtml,setModel,setPort,setHub,setSensor,setSensorPort,removeSensor,bind,esc};
});
