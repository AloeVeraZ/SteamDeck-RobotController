(function(root){
  'use strict';
  // Calibrate → Electronics → Live debug. Deck Debug (src/onbot/DeckDebug.java) runs on the robot and streams every
  // motor encoder, servo, digital and analog input and I2C sensor in its configuration; this panel lays them out hub by
  // hub and port by port as Setup wired them (DeckWiring rows, matched by device name), reads them live, and drives the
  // outputs: motors and continuous servos hold-to-run (the slider springs back to 0 and the robot's watchdog stops them if
  // Deck goes quiet), servos to a commanded position. Values are raw hub units with what they mean beside them: a switch's
  // pressed state from its active-low wiring, an analog sensor's angle, a motor's RPM from its model's counts a turn.
  // A timeline plots any channel picked (click a value), and Pulse and watch runs one output briefly and reports which
  // inputs answered, so "the intake changes the colour sensor" or "the slide trips its magnet switch" is measured.
  // simulation.js gives it a host, the app api and the project; it touches nothing else.
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const finite=Number.isFinite,fix=(v,d=2)=>finite(v)?(+v).toFixed(d):'—',H=()=>root.DeckHardware,W=()=>root.DeckWiring;
  const SPAN=10;// seconds of history the timeline keeps
  // What an analog sensor's volts mean: degrees for angle sensors (an Axon's feedback runs backwards), else none.
  function analogMeaning(md,v,max){if(!md||!finite(v))return '';const span=md.voltage||max||3.3;
    if(md.kind==='axonFeedback')return `${fix((1-v/span)*360,1)}°`;
    if(md.kind==='potentiometer'){/* REV: V = 445.5·(θ−270)/(θ²−270θ−36450), solved for θ (non-linear) */const a=v,b=-270*v-445.5,c=-36450*v+445.5*270;const d=b*b-4*a*c;if(!a||d<0)return '';return `${fix((-b-Math.sqrt(d))/(2*a),1)}° (REV curve)`;}
    if(md.degrees)return `${fix(v/span*md.degrees,1)}°`;return '';}
  function create({host,api,native,project,link,onChange=()=>{}}){
    let manifest=null,frame=null,frames=[],running=false,starting=false,plot=new Set(),edges={},seen={},pulse=null,lastPaint=0,paintQueued=false;
    const send=line=>native&&running?api.robotLink('debug-send',{line}).catch(()=>false):Promise.resolve(false);
    const listeners=new Set();
    host.innerHTML=`<div class="cal-debug-head"><div><h2 id="cal-debug-title">Live debug</h2><p class="hint">Every motor, servo and sensor on the robot, live. Motors and continuous servos run only while you hold their slider; the robot stops them by itself if Torque goes quiet. Put the robot on blocks first.</p></div>
      <div class="cal-debug-state"><i class="dot" data-debug-dot></i><span data-debug-status role="status">Not connected</span></div></div>
      <div class="button-row cal-debug-actions"><button type="button" class="secondary" data-debug-install>Put Deck Debug on the robot</button><button type="button" class="primary" data-debug-start>Start live debug</button><button type="button" class="danger" data-debug-stopall disabled>Stop all outputs</button></div>
      <p class="hint cal-debug-stats" data-debug-stats></p><div data-debug-hubs class="cal-debug-hubs"></div>
      <div class="cal-debug-tools" data-debug-tools hidden><section><h3 class="cal-group-title">Timeline</h3><p class="hint">Click any reading to plot it; each line is scaled to its own range. Last ${SPAN} s.</p><canvas data-debug-chart height="160"></canvas><div data-debug-legend class="cal-debug-legend"></div></section>
        <section><h3 class="cal-group-title">Pulse and watch</h3><p class="hint">Runs one output briefly and lists every input that changed, with when and by how much.</p>
          <div class="cal-fields"><div class="cal-field"><label for="cal-debug-pulse-out">Output</label><select id="cal-debug-pulse-out" data-debug-pulse-out></select></div><div class="cal-field"><label for="cal-debug-pulse-power">Power or position</label><input id="cal-debug-pulse-power" type="number" step="0.05" min="-1" max="1" value="0.3"></div><div class="cal-field"><label for="cal-debug-pulse-time">For <span>s</span></label><input id="cal-debug-pulse-time" type="number" step="0.1" min="0.1" max="3" value="0.5"></div></div>
          <div class="button-row"><button type="button" class="secondary" data-debug-pulse>Pulse and watch</button></div><ul class="cal-debug-pulse" data-debug-pulse-result></ul></section></div>`;
    const q=s=>host.querySelector(s);
    const status=(text,kind='')=>{q('[data-debug-status]').textContent=text;q('[data-debug-dot]').className=`dot${kind?' '+kind:''}`;};
    // ---- layout: the wiring's ports, with the robot's devices on them
    function rows(){try{return W().state(project()).rows;}catch{return [];}}
    function layout(){
      const D=H(),list=rows(),byName=new Map(list.filter(r=>r.name).map(r=>[r.name,r])),m=manifest;if(!m){q('[data-debug-hubs]').innerHTML=native?'':'<p class="hint">Live debug needs the installed app and a robot.</p>';q('[data-debug-tools]').hidden=true;return;}
      const live={motor:m.motors||[],servo:m.servos||[],crservo:m.crservos||[],digital:[...(m.digital||[]),...(m.touch||[])],analog:(m.analog||[]).map(a=>a.n),i2c:(m.i2c||[]).map(d=>d.n)};
      const used=new Set(),hubs=['control',...(list.some(r=>r.hub==='expansion')?['expansion']:[])];
      const tile=(fam,name,row,port)=>{const label=row?`${esc(row.label)}`:'';const id=`${fam}:${name}`;used.add(id);
        if(fam==='motor')return `<div class="cal-port" data-port="${esc(id)}"><div class="cal-port-head"><b>Motor ${port}</b><code>${esc(name)}</code></div><small>${label}</small>
          <input type="range" min="-1" max="1" step="0.01" value="0" data-hold="M" data-name="${esc(name)}" aria-label="Hold to run ${esc(name)}">
          <dl><dt>Ticks</dt><dd data-live="m:${esc(name)}:pos" data-plot-key="m:${esc(name)}:pos">—</dd><dt>Ticks/s</dt><dd data-live="m:${esc(name)}:vel" data-plot-key="m:${esc(name)}:vel">—</dd><dt>RPM</dt><dd data-live="m:${esc(name)}:rpm">—</dd><dt>Amps</dt><dd data-live="m:${esc(name)}:amps" data-plot-key="m:${esc(name)}:amps">—</dd></dl>
          <button type="button" class="text-button" data-reset="${esc(name)}">Zero encoder</button><span class="cal-port-flag" data-live="m:${esc(name)}:cut"></span></div>`;
        if(fam==='servo')return `<div class="cal-port" data-port="${esc(id)}"><div class="cal-port-head"><b>Servo ${port}</b><code>${esc(name)}</code></div><small>${label}</small>
          <input type="range" min="0" max="1" step="0.005" value="0.5" data-servo="${esc(name)}" aria-label="Commanded position of ${esc(name)}">
          <dl><dt>Commanded</dt><dd data-live="s:${esc(name)}" data-plot-key="s:${esc(name)}">—</dd></dl><label class="check"><input type="checkbox" data-enable="${esc(name)}"> Pulses on</label><label class="check"><input type="checkbox" data-latch="${esc(name)}"> Hold if Torque goes quiet</label></div>`;
        if(fam==='crservo')return `<div class="cal-port" data-port="${esc(id)}"><div class="cal-port-head"><b>Servo ${port}</b><code>${esc(name)}</code></div><small>${label||'Continuous servo'}</small>
          <input type="range" min="-1" max="1" step="0.01" value="0" data-hold="C" data-name="${esc(name)}" aria-label="Hold to run ${esc(name)}"><dl><dt>Power</dt><dd data-live="c:${esc(name)}" data-plot-key="c:${esc(name)}">—</dd></dl></div>`;
        if(fam==='digital'){const md=row&&D.SENSOR_MODELS[row.model];return `<div class="cal-port" data-port="${esc(id)}"><div class="cal-port-head"><b>Digital ${port}</b><code>${esc(name)}</code></div><small>${label}</small>
          <div class="cal-lamp" data-live="d:${esc(name)}" data-plot-key="d:${esc(name)}" data-active-low="${md?.activeLow?1:0}">—</div><small data-live="d:${esc(name)}:edges"></small></div>`;}
        if(fam==='analog')return `<div class="cal-port" data-port="${esc(id)}"><div class="cal-port-head"><b>Analog ${port}</b><code>${esc(name)}</code></div><small>${label}</small>
          <meter min="0" max="${esc(m.analog.find(a=>a.n===name)?.max||3.3)}" data-live="a:${esc(name)}:bar"></meter><dl><dt>Volts</dt><dd data-live="a:${esc(name)}" data-plot-key="a:${esc(name)}">—</dd><dt>Means</dt><dd data-live="a:${esc(name)}:means">—</dd><dt>Seen</dt><dd data-live="a:${esc(name)}:seen">—</dd></dl></div>`;
        const dev=m.i2c.find(d=>d.n===name);return `<div class="cal-port cal-port-i2c" data-port="${esc(id)}"><div class="cal-port-head"><b>I2C ${port}</b><code>${esc(name)}</code></div><small>${label||esc(dev?.k||'')}</small><dl data-live="i:${esc(name)}"><dt>Waiting</dt><dd>—</dd></dl></div>`;};
      const famOfRow=r=>r.family==='servo'&&r.kind==='crservo'?'crservo':r.family;
      const cards=hubs.map(hub=>{const groups=[['motor','Motors',D.HUBS[hub].motor],['servo','Servos',D.HUBS[hub].servo],['digital','Digital',D.HUBS[hub].digital],['analog','Analog',D.HUBS[hub].analog],['i2c','I2C buses',D.HUBS[hub].i2c]];
        const html=groups.map(([fam,title,n])=>{const cells=[];for(let p=0;p<n;p++){const at=list.filter(r=>r.hub===hub&&(fam==='i2c'?r.bus===p:r.port===p)&&(fam==='servo'?r.family==='servo':r.family===fam||fam==='digital'&&r.family==='digital'));
            for(const r of at){const f=fam==='servo'?famOfRow(r):fam,name=r.name;if(live[f]?.includes(name))cells.push(tile(f,name,r,p));else if(f!=='i2c'||r.role!=='imu')cells.push(`<div class="cal-port missing"><div class="cal-port-head"><b>${title.replace(/s$/,'')} ${p}</b><code>${esc(name)}</code></div><small>Not in the robot's configuration</small></div>`);}}
          return cells.length?`<div class="cal-port-group"><h4>${title}</h4><div class="cal-ports">${cells.join('')}</div></div>`:'';}).join('');
        return `<section class="cal-hub"><h3>${esc(D.hubName(hub,W().state(project()).wiring))}</h3>${html||'<p class="hint">Nothing wired to this hub in Setup.</p>'}</section>`;});
      // Devices the robot has that Setup did not wire (or wired under another name), by kind.
      const other=[...live.motor.map(n=>['motor',n]),...live.servo.map(n=>['servo',n]),...live.crservo.map(n=>['crservo',n]),...live.digital.map(n=>['digital',n]),...live.analog.map(n=>['analog',n]),...live.i2c.map(n=>['i2c',n])].filter(([f,n])=>!used.has(`${f}:${n}`));
      if(other.length)cards.push(`<section class="cal-hub"><h3>On the robot, not in this setup</h3><div class="cal-ports">${other.map(([f,n])=>tile(f,n,byName.get(n)||null,'')).join('')}</div></section>`);
      q('[data-debug-hubs]').innerHTML=cards.join('');
      const outs=[...live.motor.map(n=>['M',n,'Motor']),...live.crservo.map(n=>['C',n,'Continuous servo']),...live.servo.map(n=>['S',n,'Servo'])];
      q('[data-debug-pulse-out]').innerHTML=outs.map(([k,n,t])=>`<option value="${k}\t${esc(n)}">${esc(t)} · ${esc(n)}</option>`).join('');
      q('[data-debug-tools]').hidden=!outs.length&&!other.length&&!list.length;
      for(const k of plot)host.querySelector(`[data-plot-key="${CSS.escape(k)}"]`)?.classList.add('plotted');
      paint(true);}
    // ---- readings
    function values(f=frame){const m=manifest,out={};if(!m||!f)return out;
      (m.motors||[]).forEach((n,i)=>{const r=f.m?.[i];if(!r)return;out[`m:${n}:pos`]=r[0];out[`m:${n}:vel`]=r[1];out[`m:${n}:power`]=r[2];out[`m:${n}:amps`]=r[3];out[`m:${n}:cut`]=r[4];});
      (m.servos||[]).forEach((n,i)=>{const r=f.s?.[i];if(r){out[`s:${n}`]=r[0];out[`s:${n}:on`]=r[1];}});
      (m.crservos||[]).forEach((n,i)=>{out[`c:${n}`]=f.c?.[i];});
      (m.digital||[]).forEach((n,i)=>{out[`d:${n}`]=f.d?.[i];});(m.touch||[]).forEach((n,i)=>{out[`d:${n}`]=f.touch?.[i]?0:1;});// a pressed touch sensor reads like an active-low switch
      (m.analog||[]).forEach((a,i)=>{out[`a:${a.n}`]=f.a?.[i];});
      (m.i2c||[]).forEach((d,i)=>{const r=f.i?.[i];if(r?.v)for(const [k,v] of Object.entries(r.v))if(typeof v==='number')out[`i:${d.n}:${k}`]=v;});
      return out;}
    function paint(force){
      const now=performance.now();if(!force&&now-lastPaint<66){if(!paintQueued){paintQueued=true;requestAnimationFrame(()=>{paintQueued=false;paint(true);});}return;}lastPaint=now;
      const f=frame,m=manifest;if(!f||!m)return;const D=H(),byName=new Map(rows().map(r=>[r.name,r])),v=values(f);
      q('[data-debug-stats]').textContent=`Loop ${fix(f.loop,1)} ms · battery ${fix(f.v,2)} V · robot clock ${fix(f.t/1000,1)} s${f.q?` · step test on ${f.q.actuator}: target ${fix(f.q.target,1)}, error ${fix(f.q.error,1)}, power ${fix(f.q.out,2)}`:''}`;
      for(const el of host.querySelectorAll('[data-live]')){const key=el.dataset.live,[kind,name,field]=key.split(':');
        if(kind==='m'){const row=byName.get(name),cpr=D.MODELS[row?.model]?.cpr;
          if(field==='rpm')el.textContent=cpr&&finite(v[`m:${name}:vel`])?fix(v[`m:${name}:vel`]/cpr*60,0):'—';else if(field==='cut')el.textContent=v[`m:${name}:cut`]?'Cut: drew too much current. Move its slider to run it again.':'';
          else el.textContent=field==='pos'?(v[key]??'—'):fix(v[key],field==='amps'?2:0);}
        else if(kind==='s'||kind==='c')el.textContent=fix(v[key],3);
        else if(kind==='d'){if(field==='edges'){el.textContent=edges[name]?`${edges[name]} changes`:'';continue;}const raw=v[`d:${name}`],low=el.dataset.activeLow==='1';el.textContent=raw===undefined?'—':`${raw?'HIGH':'LOW'}${low?` · ${raw?'released':'pressed'}`:''}`;el.dataset.on=raw===undefined?'':String(low?!raw:!!raw);}
        else if(kind==='a'){const val=v[`a:${name}`],row=byName.get(name),md=row&&D.SENSOR_MODELS[row.model];
          if(field==='bar')el.value=finite(val)?val:0;else if(field==='means')el.textContent=analogMeaning(md,val,m.analog.find(a=>a.n===name)?.max)||'—';else if(field==='seen')el.textContent=seen[name]?`${fix(seen[name][0])}–${fix(seen[name][1])} V`:'—';else el.textContent=fix(val,3);}
        else if(kind==='i'){const i=m.i2c.findIndex(d=>d.n===name),r=f.i?.[i];if(!r?.v){el.innerHTML='<dt>Waiting</dt><dd>—</dd>';continue;}
          el.innerHTML=Object.entries(r.v).map(([k,x])=>`<dt>${esc(k)}</dt><dd data-plot-key="i:${esc(name)}:${esc(k)}"${plot.has(`i:${name}:${k}`)?' class="plotted"':''}>${typeof x==='number'?fix(x,k==='ex'||k==='ey'?0:2):esc(x)}</dd>`).join('')+`<dt>Age</dt><dd>${r.age} ms</dd>`;}}
      chart();}
    function chart(){
      const canvas=q('[data-debug-chart]');if(!canvas||!plot.size||canvas.closest('[hidden]'))return;const w=canvas.clientWidth||600;if(canvas.width!==w)canvas.width=w;const h=canvas.height,g=canvas.getContext('2d');g.clearRect(0,0,w,h);
      const css=getComputedStyle(host),colors=['--accent','--warning','--danger','--success','--text'].map(c=>css.getPropertyValue(c).trim()||'#4ea1ff');
      const end=frames.at(-1)?.t??0,keys=[...plot],legend=[];
      keys.forEach((key,k)=>{const pts=frames.filter(f=>f.t>=end-SPAN*1000).map(f=>[f.t,values(f)[key]]).filter(([,x])=>finite(x));if(!pts.length)return;
        let lo=Math.min(...pts.map(p=>p[1])),hi=Math.max(...pts.map(p=>p[1]));if(hi-lo<1e-9){hi+=.5;lo-=.5;}
        g.strokeStyle=colors[k%colors.length];g.lineWidth=1.5;g.beginPath();pts.forEach(([t,x],i)=>{const px=(t-(end-SPAN*1000))/(SPAN*1000)*w,py=h-4-(x-lo)/(hi-lo)*(h-8);i?g.lineTo(px,py):g.moveTo(px,py);});g.stroke();
        legend.push(`<span style="--c:${colors[k%colors.length]}"><i></i>${esc(key.replace(/^[a-z]:/,''))} ${fix(lo)}–${fix(hi)}</span>`);});
      q('[data-debug-legend]').innerHTML=legend.join('');}
    // ---- events from the robot link
    function event(e){
      if(e.manifest){manifest=e.manifest;frames=[];edges={};seen={};status('Live: reading the robot','live');layout();onChange();return;}
      if(e.frame){const prev=values(frame);frame=e.frame;frames.push(frame);const cut=frame.t-(SPAN+2)*1000;while(frames.length&&frames[0].t<cut)frames.shift();
        const v=values(frame);for(const [k,x] of Object.entries(v)){if(k.startsWith('d:')&&prev[k]!==undefined&&prev[k]!==x)edges[k.slice(2)]=(edges[k.slice(2)]||0)+1;if(k.startsWith('a:')&&finite(x)){const n=k.slice(2),s=seen[n]||[x,x];seen[n]=[Math.min(s[0],x),Math.max(s[1],x)];}}
        if(pulse)pulse.frames.push(frame);for(const fn of listeners)fn(frame,v);paint(false);return;}
      if(e.ended||e.error){running=false;starting=false;status(e.error?e.error:{stopped:'Stopped',ended:'Deck Debug stopped on the robot',lost:'Lost the robot connection',time:'Stopped after an hour'}[e.ended]||'Stopped',e.error?'error':'');buttons();onChange();}}
    if(native&&api.onRobotDebug)api.onRobotDebug(event);
    function buttons(){q('[data-debug-start]').textContent=running||starting?'Stop live debug':'Start live debug';q('[data-debug-stopall]').disabled=!running;q('[data-debug-install]').disabled=running||starting;}
    async function start(){
      if(!native)return status('Live debug needs the installed app.','error');if(running||starting)return stop();
      const {host:to,label}=link();starting=true;buttons();status(`Starting Deck Debug on ${label}…`);
      try{await api.robotLink('debug-start',{host:to});running=true;}catch(e){status(e.message,'error');}finally{starting=false;buttons();onChange();}}
    async function stop(){for(const s of host.querySelectorAll('[data-hold]'))s.value=0;await api.robotLink('debug-stop').catch(()=>{});running=false;buttons();onChange();}
    q('[data-debug-start]').onclick=()=>void start();
    q('[data-debug-stopall]').onclick=()=>{for(const s of host.querySelectorAll('[data-hold]'))s.value=0;for(const c of host.querySelectorAll('[data-enable]'))c.checked=false;void send('X');};
    q('[data-debug-install]').onclick=async()=>{const {host:to,label}=link(),b=q('[data-debug-install]');b.disabled=true;status(`Putting Deck Debug on ${label} and building…`);
      try{const r=await api.robotLink('debug-install',{host:to});status(r?.built===false?`The robot could not build Deck Debug: ${r.errors?.[0]||'see its OnBot Java page'}`:'Deck Debug is on the robot. Start live debug.',r?.built===false?'error':'');}catch(e){status(e.message,'error');}finally{b.disabled=false;buttons();}};
    // Hold-to-run: the slider sends while held and springs back to 0 when let go (pointer up, key up, focus lost).
    let held=null,sentAt=0;
    const holdSend=(el,force)=>{const now=performance.now();if(!force&&now-sentAt<40)return;sentAt=now;void send(`${el.dataset.hold}\t${el.dataset.name}\t${(+el.value).toFixed(3)}`);};
    const release=el=>{if(!el)return;el.value=0;void send(`${el.dataset.hold}\t${el.dataset.name}\t0`);if(held===el)held=null;};
    host.addEventListener('pointerdown',e=>{const el=e.target.closest?.('[data-hold]');if(el)held=el;});
    host.addEventListener('input',e=>{const el=e.target;if(el.dataset.hold){held=el;holdSend(el);}else if(el.dataset.servo){void send(`S\t${el.dataset.servo}\t${(+el.value).toFixed(3)}`);const c=host.querySelector(`[data-enable="${CSS.escape(el.dataset.servo)}"]`);if(c)c.checked=true;}});
    for(const type of ['pointerup','pointercancel'])document.addEventListener(type,()=>{if(held)release(held);});
    host.addEventListener('keyup',e=>{if(e.target.dataset?.hold)release(e.target);});
    host.addEventListener('focusout',e=>{if(e.target.dataset?.hold)release(e.target);});
    host.addEventListener('change',e=>{const el=e.target;if(el.dataset.enable)void send(`E\t${el.dataset.enable}\t${el.checked?1:0}`);else if(el.dataset.latch)void send(`L\t${el.dataset.latch}\t${el.checked?1:0}`);});
    // Holding a slider keeps sending, so a held slider never times out on the robot.
    setInterval(()=>{if(held&&running)holdSend(held,true);},150);
    host.addEventListener('click',e=>{const r=e.target.closest('[data-reset]');if(r){void send(`R\t${r.dataset.reset}`);return;}
      const p=e.target.closest('[data-plot-key]');if(p){const k=p.dataset.plotKey;if(plot.has(k))plot.delete(k);else if(plot.size<5)plot.add(k);p.classList.toggle('plotted',plot.has(k));chart();if(!plot.size)q('[data-debug-legend]').innerHTML='';}});
    // Pulse and watch: half a second of quiet, the pulse, then half a second after; inputs that moved beyond their noise.
    q('[data-debug-pulse]').onclick=async()=>{if(!running)return;const [kind,name]=q('[data-debug-pulse-out]').value.split('\t'),out=q('[data-debug-pulse-result]');
      out.innerHTML='<li class="hint">Watching…</li>';const r=await pulseWatch(kind,name,+q('#cal-debug-pulse-power').value||0,+q('#cal-debug-pulse-time').value||.5);
      out.innerHTML=r.error?`<li class="hint">${esc(r.error)}</li>`:r.changes.map(c=>`<li>${esc(c.text)}</li>`).join('')||'<li class="hint">No input changed.</li>';};
    // Half a second of quiet, the pulse (M, C: power; S: position), then 0.6 s after: every input that moved beyond three
    // times its noise, with when it first did and by how much. {changes:[{key, delta, at, text}], error}
    let pulsing=false;
    async function pulseWatch(kind,name,power,secs=.5){
      if(!running)return {changes:[],error:'Start live debug first.'};if(pulsing)return {changes:[],error:'A pulse is already running.'};pulsing=true;
      try{secs=Math.min(3,Math.max(.1,secs));pulse={frames:[]};const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(500);const began=frame?.t??0;
        const cmd=kind==='S'?`S\t${name}\t${Math.min(1,Math.max(0,power))}`:`${kind}\t${name}\t${Math.min(1,Math.max(-1,power))}`;const keep=setInterval(()=>void send(cmd),100);void send(cmd);await wait(secs*1000);clearInterval(keep);if(kind!=='S')void send(`${kind}\t${name}\t0`);await wait(600);
        const got=pulse.frames;pulse=null;return summary(got,began,`${kind}:${name}`);}
      finally{pulse=null;pulsing=false;}}
    function summary(list,began,self){
      const before=list.filter(f=>f.t<began),during=list.filter(f=>f.t>=began);if(!before.length||!during.length)return {changes:[],error:'Not enough readings: check the link.'};
      const series=k=>list.map(f=>[f.t,values(f)[k]]).filter(([,x])=>x!==undefined),keys=Object.keys(values(during[0])).filter(k=>!/:(power|cut|on)$/.test(k)&&!(self.startsWith('M:')&&k===`m:${self.slice(2)}:amps`)&&k!==`s:${self.slice(2)}`&&k!==`c:${self.slice(2)}`),changes=[];
      for(const k of keys){const s=series(k),pre=s.filter(([t])=>t<began).map(p=>p[1]),post=s.filter(([t])=>t>=began);if(!pre.length||!post.length)continue;
        const base=pre.reduce((a,b)=>a+b,0)/pre.length,noise=Math.max(...pre.map(x=>Math.abs(x-base)),k.startsWith('m:')&&k.endsWith(':pos')?2:k.startsWith('a:')?.02:k.startsWith('d:')?0:1e-3);
        const hit=post.find(([,x])=>Math.abs(x-base)>noise*3+1e-9);if(!hit)continue;const peak=post.reduce((a,[,x])=>Math.abs(x-base)>Math.abs(a-base)?x:a,base),at=(hit[0]-began)/1000;
        changes.push({key:k,delta:peak-base,at,noise,text:k.startsWith('d:')?`${k.slice(2)} switched ${base?'HIGH → LOW':'LOW → HIGH'} after ${fix(at,2)} s`:`${k.slice(2)} changed by ${fix(peak-base,k.endsWith(':pos')?0:3)} (first after ${fix(at,2)} s)`});}
      return {changes};}
    // Readings over a while (for captures and ramps): the values of every frame in the next ms milliseconds.
    function record(ms){return new Promise(resolve=>{const got=[],off=(listeners.add(fn),()=>listeners.delete(fn));function fn(f,v){got.push({t:f.t/1000,v});}setTimeout(()=>{off();resolve(got);},ms);});}
    return {event,layout,stop,send,pulse:pulseWatch,record,running:()=>running,latest:()=>({manifest,frame}),values:()=>values(frame),listen(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
  }
  root.DeckLiveDebug={create,analogMeaning};
})(typeof globalThis==='object'?globalThis:this);
