/* Offline path-planning simulator. The physics engine and path follower run in the app's
   simulation process; this view edits the setup, plans routes in a worker and draws everything
   itself. Real robot configuration and localization stay on the robot: nothing here is sent to one. */
window.DeckSimulation={create(root){
  'use strict';
  const field=window.DeckField,planner=window.DeckPlanner,exporter=window.DeckSimExport,api=window.deck||{},native=typeof api.sim==='function';
  const $=selector=>root.querySelector(selector),$$=selector=>[...root.querySelectorAll(selector)],ns='http://www.w3.org/2000/svg';
  const KEY='deck-simulation-project-v2',OLD_KEY='deck-simulation-project-v1',finite=n=>typeof n==='number'&&Number.isFinite(n);
  const GAMES={empty:'Empty field',decode:'DECODE',biobuzz:'BIOBUZZ'},STYLES={spline:'Smooth curves',rounded:'Rounded corners',sharp:'Straight lines'};
  const EXAMPLE=`import com.pedropathing.follower.Follower;
import deck.sim.DeckAutonomous;
import deck.sim.SimRobot;

// Follows the planned route leg by leg, pausing at pins that have a pause.
// loop() runs every 1/60 s of simulation time.
public class MyAuto implements DeckAutonomous {
    private Follower follower;
    private int leg = 0;
    private double arrived = -1;

    @Override
    public void init(SimRobot robot) {
        follower = robot.follower();
        follower.setPose(robot.startPose());
        follower.follow(robot.routeLegs().get(0));
    }

    @Override
    public void loop(SimRobot robot) {
        follower.update();
        if (follower.isBusy()) return;
        if (arrived < 0) arrived = robot.time();
        if (robot.time() - arrived < robot.stopWait(leg)) return; // your mechanism action runs here
        if (++leg >= robot.routeLegs().size()) { robot.finish(); return; }
        arrived = -1;
        follower.follow(robot.routeLegs().get(leg));
    }
}
`;
  // ------------------------------------------------------------------ project
  const ROBOT={drivetrain:'mecanum',intake:'sloped',length:15,width:18,massLb:23.5,driveRpm:500};
  const newId=()=>'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const layout=(game,name)=>({id:newId(),name,field:game,start:null,zones:[],pins:[],clearance:2,style:'spline',route:null,tested:null});
  function defaults(){const layouts=[layout('empty','Empty field 1'),layout('decode','DECODE'),layout('biobuzz','BIOBUZZ')];
    return {version:2,robot:{...ROBOT},sensors:{localization:'odometry',gyroDrift:.5,noise:.02},tuning:{maxPathSpeed:.6},program:{kind:'route',name:'',source:EXAMPLE},model:null,view:'2d',layouts,active:layouts[0].id,export:{packageName:'org.firstinspires.ftc.teamcode',className:'PlannedRoute',keep:false}};}
  function cleanLayout(raw){
    const l=layout(Object.hasOwn(GAMES,raw?.field)?raw.field:'empty',String(raw?.name||'Field').slice(0,40));if(typeof raw?.id==='string'&&/^[\w-]{1,40}$/.test(raw.id))l.id=raw.id;
    if(raw?.start&&[raw.start.x,raw.start.y,raw.start.heading].every(finite))l.start={x:raw.start.x,y:raw.start.y,heading:field.heading(raw.start.heading)};
    if(Array.isArray(raw?.zones))l.zones=raw.zones.slice(0,24).map((z,i)=>{try{return planner.validateZone({...z,id:z.id||'zone-'+i});}catch{return null;}}).filter(Boolean);
    if(Array.isArray(raw?.pins))l.pins=raw.pins.slice(0,32).filter(q=>q&&finite(q.x)&&finite(q.y)).map(q=>({x:q.x,y:q.y,wait:finite(q.wait)?Math.min(30,Math.max(0,q.wait)):0,action:typeof q.action==='string'?q.action.slice(0,40):''}));
    if(finite(raw?.clearance))l.clearance=Math.min(6,Math.max(planner.MIN_CLEARANCE,raw.clearance));if(Object.hasOwn(STYLES,raw?.style))l.style=raw.style;
    if(raw?.route&&Array.isArray(raw.route.segments)&&Array.isArray(raw.route.samples)&&Array.isArray(raw.route.stops))l.route=raw.route;if(Array.isArray(raw?.tested))l.tested=raw.tested.slice(0,6);
    return l;
  }
  function sanitize(raw){
    const p=defaults();if(!raw||typeof raw!=='object')return p;
    if(raw.version!==2&&raw.field){const old=cleanLayout({...raw,name:raw.field==='empty'?'Empty field 1':GAMES[raw.field],style:raw.smooth===false?'sharp':'spline'});p.layouts=p.layouts.map(l=>l.field===old.field?{...old,id:l.id}:l);}
    else if(Array.isArray(raw.layouts)&&raw.layouts.length)p.layouts=raw.layouts.slice(0,20).map(cleanLayout);
    p.active=p.layouts.some(l=>l.id===raw.active)?raw.active:p.layouts[0].id;if(raw.view==='3d')p.view='3d';
    const r=raw.robot||{};p.robot={drivetrain:r.drivetrain==='swerve'?'swerve':'mecanum',intake:['sloped','vector','triangle'].includes(r.intake)?r.intake:'sloped'};
    for(const [k,min,max] of [['length',8,18],['width',8,18],['massLb',10,42],['driveRpm',200,1200]])p.robot[k]=finite(r[k])?Math.min(max,Math.max(min,r[k])):ROBOT[k];
    const s=raw.sensors||{};if(['ideal','odometry','encoders','gyro'].includes(s.localization))p.sensors.localization=s.localization;if(finite(s.gyroDrift))p.sensors.gyroDrift=Math.min(10,Math.max(0,s.gyroDrift));if(finite(s.noise))p.sensors.noise=Math.min(.5,Math.max(0,s.noise));
    const t=raw.tuning||{};for(const k of ['maxPathSpeed','translationalP','headingP'])if(finite(t[k]))p.tuning[k]=t[k];
    const g=raw.program||{};p.program={kind:g.kind==='source'?'source':'route',name:typeof g.name==='string'?g.name.slice(0,120):'',source:typeof g.source==='string'&&g.source.length<=200000?g.source:EXAMPLE};
    p.model=modelMeta(raw.model);
    const e=raw.export||{};p.export={packageName:typeof e.packageName==='string'?e.packageName.slice(0,120):p.export.packageName,className:typeof e.className==='string'?e.className.slice(0,64):p.export.className,keep:!!e.keep};
    return p;
  }
  // Model metadata is checked here too, before the 3D module has loaded.
  function modelMeta(raw){
    if(!raw||typeof raw.id!=='string'||!/^[0-9a-f]{32}\.glb$/.test(raw.id))return null;
    const axes=['+x','-x','+y','-y','+z','-z'],front=axes.includes(raw.front)?raw.front:'+x',top=axes.includes(raw.top)?raw.top:'+z';
    return {id:raw.id,name:String(raw.name||'Robot model').slice(0,120),units:['in','mm','cm','m'].includes(raw.units)?raw.units:'in',front,top:front[1]===top[1]?(front[1]==='z'?'+x':'+z'):top,source:raw.source==='step'?'step':'mesh'};
  }
  let project;try{project=sanitize(JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(OLD_KEY)));}catch{project=defaults();}
  const L=()=>project.layouts.find(l=>l.id===project.active)||project.layouts[0];
  if(!L().start){try{const legacy=field.restore(localStorage.getItem(field.KEY));if(legacy&&L().field==='empty')L().start=legacy;}catch{}}
  let planError='',blockedPin=-1,sketch=null,cursor=null,info=null,frame=null,selected=null,tool=L().start?'select':'start',active=false,pointer=null,drag=null,planSeq=0,keys=new Set(),trail=[],loading=null,view3d=null,runState='idle',logLines=[],model=null,modelPreview=null,selectedSide=null,optimizing=false;
  const fallbackFootprint=()=>{const reach={sloped:3,vector:3.5,triangle:3}[project.robot.intake]||3;return {front:project.robot.length/2+reach,rear:project.robot.length/2,half:project.robot.width/2};};
  const geometry=()=>({footprint:info?.footprint||fallbackFootprint(),bounds:info?.bounds||{x0:0,y0:0,x1:144,y1:144}});
  let start=L().start||field.edgePose(0,geometry()),preview={...start};
  function save(){try{localStorage.setItem(KEY,JSON.stringify(project));return true;}catch{return false;}}

  // ------------------------------------------------------------------ markup
  const options=(list,value)=>Object.entries(list).map(([k,v])=>`<option value="${k}"${k===value?' selected':''}>${v}</option>`).join('');
  const segmented=(attr,list,label)=>`<div class="segmented sim-seg" role="group" aria-label="${label}">${Object.entries(list).map(([k,v])=>`<button type="button" data-${attr}="${k}" aria-pressed="false">${v}</button>`).join('')}</div>`;
  root.innerHTML=`<div class="simulation-heading"><div><h1>Simulation</h1><p id="sim-subtitle"></p></div><span class="simulation-mode" id="sim-mode">Offline</span></div>
    <div class="simulation-layout"><section class="field-area" aria-label="Simulation field">
      <div class="sim-toolbar">
        ${segmented('tool',{select:'Select',rect:'Box',circle:'Circle',triangle:'Triangle',shape:'Shape',pin:'Pin',drive:'Drive'},'Field tool')}
        <div class="sim-transport"><button type="button" id="sim-play" class="secondary">Play</button><button type="button" id="sim-stop" class="secondary">Stop</button><button type="button" id="sim-reset" class="secondary">Reset</button>${segmented('view',{'2d':'2D','3d':'3D'},'View')}</div>
      </div>
      <div class="sim-stage" id="sim-stage">
      <svg id="simulation-field" viewBox="-16 -9 168 172" role="group" tabindex="0" aria-label="Simulation field, inches from the bottom-left corner" aria-describedby="field-help field-coordinates">
        <rect class="field-floor" x="0" y="0" width="144" height="144"/><g class="field-grid"></g><g class="field-labels"></g>
        <g id="sim-overlay" transform="matrix(1 0 0 -1 0 144)"><rect id="sim-walls" class="sim-walls" x="0" y="0" width="144" height="144"/><g id="sim-obstacles"></g><g id="sim-zones"></g><g id="sim-route"></g><g id="sim-trail"></g><g id="sim-pins"></g><polygon id="sim-start" class="sim-start" points=""/><polygon id="sim-estimate" class="sim-estimate" points=""/><circle id="sim-target" class="sim-target" r="1.2" cx="-99" cy="-99"/><g id="sim-draft"></g></g>
        <g id="field-robot"><image id="sim-robot-image" href="" x="0" y="0" width="0" height="0" preserveAspectRatio="none"/><rect x="-9" y="-9" width="18" height="18" rx="1.5"/><path d="M-3 0H5M2-3L5 0 2 3"/></g>
      </svg><div id="sim-3d" class="sim-3d" hidden></div></div>
      <output id="field-coordinates"></output><p id="field-help" class="hint"></p>
      <dl id="sim-telemetry" class="sim-telemetry"></dl>
    </section>
    <section class="start-controls sim-panel" aria-label="Simulation settings">
      <div class="segmented sim-tabs" role="tablist">${['Setup','Plan','Run'].map(t=>`<button type="button" role="tab" data-tab="${t.toLowerCase()}">${t}</button>`).join('')}</div>
      <div data-panel="setup">
        <h2>Field</h2><div class="sim-row"><label class="sr-only" for="sim-field">Field</label><select id="sim-field"></select><button type="button" id="sim-layout-rename" class="icon-button" aria-label="Rename this field" title="Rename">✎</button><button type="button" id="sim-layout-delete" class="icon-button" aria-label="Delete this field" title="Delete">×</button></div>
        <p id="sim-field-note" class="hint"></p>
        <h2 id="start-title">Starting pose</h2>
        <form id="start-form"><div class="sim-grid3"><div><label for="start-x">X · in</label><input id="start-x" type="number" step="any" required inputmode="decimal"></div><div><label for="start-y">Y · in</label><input id="start-y" type="number" step="any" required inputmode="decimal"></div><div><label for="start-heading">Heading °</label><input id="start-heading" type="number" step="any" required inputmode="decimal"></div></div>
        <button class="primary" type="submit">Set starting pose</button></form>
        <div class="button-row"><button id="start-place" class="secondary" type="button">Place on field</button><button id="start-edge" class="secondary" type="button">Start at edge</button></div>
        <p id="start-status" role="status"></p>
        <h2>Robot</h2>
        <div class="start-xy"><div><label for="sim-drivetrain">Drivetrain</label><select id="sim-drivetrain">${options({mecanum:'Mecanum',swerve:'Swerve'},project.robot.drivetrain)}</select></div><div><label for="sim-intake">Front intake</label><select id="sim-intake">${options({sloped:'3 in',vector:'3.5 in',triangle:'3 in (narrow)'},project.robot.intake)}</select></div></div>
        <div class="start-xy"><div><label for="sim-length">Length · in</label><input id="sim-length" type="number" min="8" max="18" step="0.25"></div><div><label for="sim-width">Width · in</label><input id="sim-width" type="number" min="8" max="18" step="0.25"></div></div>
        <p id="sim-footprint" class="hint"></p>
        <h3>Your robot</h3>
        <div id="sim-model-drop" class="sim-drop"><p>Drop your robot's STEP file here (or GLB, STL, OBJ).</p><button id="sim-model-open" class="secondary" type="button">Choose file…</button></div>
        <div id="sim-model-box" hidden><div id="sim-model-preview" class="sim-model-preview"></div>
          <p id="sim-model-help" class="hint">Click a side of the cube, then say what it is.</p>
          <div class="button-row"><button id="sim-model-front" class="secondary" type="button" disabled>This side is the front</button><button id="sim-model-top" class="secondary" type="button" disabled>This side is the top</button></div>
          <div class="start-xy"><div id="sim-units-box"><label for="sim-model-units">File units</label><select id="sim-model-units">${options({mm:'Millimetres',cm:'Centimetres',m:'Metres',in:'Inches'},'mm')}</select></div><div><label>&nbsp;</label><button id="sim-model-size" class="secondary" type="button">Use model size</button></div></div>
          <p id="sim-mesh-size" class="hint"></p><button id="sim-model-remove" class="text-button" type="button">Remove model</button></div>
        <details class="sim-more"><summary>More settings</summary>
          <div class="start-xy"><div><label for="sim-mass">Mass · lb</label><input id="sim-mass" type="number" min="10" max="42" step="0.5"></div><div><label for="sim-rpm">Wheel RPM</label><input id="sim-rpm" type="number" min="200" max="1200" step="10"></div></div>
          <label for="sim-localization">Position sensing</label><select id="sim-localization">${options({odometry:'Odometry pods + IMU',encoders:'Drive encoders + IMU',ideal:'Perfect (no sensor error)',gyro:'Gyro only (no X/Y)'},project.sensors.localization)}</select>
          <div class="start-xy"><div><label for="sim-noise">Odometry noise · %</label><input id="sim-noise" type="number" min="0" max="50" step="0.5"></div><div><label for="sim-drift">Gyro drift · °/min</label><input id="sim-drift" type="number" min="0" max="10" step="0.1"></div></div>
          <div class="start-xy"><div><label for="sim-maxspeed">Path speed · 0–1</label><input id="sim-maxspeed" type="number" min="0.1" max="1" step="0.05"></div><div><label for="sim-transp">Correction strength</label><input id="sim-transp" type="number" min="0" max="5" step="0.05"></div></div>
          <p class="hint">These describe the simulated robot only. Hardware ports, sensors and localizers stay on your robot.</p></details>
        <div class="button-row sim-project"><button id="sim-open" class="text-button" type="button">Open project…</button><button id="sim-save" class="text-button" type="button">Save project…</button></div></div>
      <div data-panel="plan" hidden>
        <ol class="sim-steps"><li><b>Mark where not to go.</b> Pick Box, Circle or Triangle and drag, or pick Shape and click corners.</li><li><b>Drop pins in order.</b> Pick Pin and click each place the robot should reach.</li><li><b>Done.</b> The route draws itself around zones and field parts. Run it from Run.</li></ol>
        <div id="sim-zone-editor" class="sim-editor" hidden></div>
        <ol id="sim-pin-list" class="sim-list"></ol>
        <label>Route shape</label>${segmented('style',STYLES,'Route shape')}
        <div class="start-xy"><div><label for="sim-clearance">Space around zones · in</label><input id="sim-clearance" type="number" min="0.05" max="6" step="0.25"></div><div><label>&nbsp;</label><button id="sim-optimize" class="secondary" type="button">Find fastest route</button></div></div>
        <p id="sim-plan-status" role="status"></p><div id="sim-tested" class="sim-tested"></div>
        <div class="button-row"><button id="sim-clear-pins" class="text-button" type="button">Clear pins</button><button id="sim-clear-zones" class="text-button" type="button">Clear zones</button></div>
        <h3>Export the route</h3><div class="button-row"><button id="sim-export-java" class="secondary" type="button">Pedro Java…</button><button id="sim-export-pp" class="secondary" type="button">Path file (.pp)…</button></div>
        <label class="check"><input id="sim-export-keep" type="checkbox"> Keep the exported file updated</label>
        <details class="sim-more"><summary>Java names</summary><div class="start-xy"><div><label for="sim-export-package">Package</label><input id="sim-export-package" type="text" spellcheck="false"></div><div><label for="sim-export-class">Class</label><input id="sim-export-class" type="text" spellcheck="false"></div></div></details>
        <p id="sim-export-status" class="hint"></p></div>
      <div data-panel="run" hidden>
        ${segmented('program',{route:'Planned route',source:'Java program'},'Program')}
        <div class="sim-run-row"><button id="sim-run" class="primary" type="button">Run</button><label class="sr-only" for="sim-speed">Speed</label><select id="sim-speed">${options({'0.25':'0.25×','0.5':'0.5×','1':'1×','2':'2×','4':'4×'},'1')}</select></div>
        <p id="sim-run-status" role="status"></p><div id="sim-error" class="sim-error" role="alert" hidden></div>
        <div id="sim-source-box" hidden><div class="button-row"><button id="sim-java-open" class="secondary" type="button">Open .java…</button><button id="sim-java-example" class="secondary" type="button">Example</button></div>
          <label for="sim-source" id="sim-source-name">Program</label><textarea id="sim-source" spellcheck="false" wrap="off"></textarea></div>
        <details class="sim-log"><summary>Program output</summary><pre id="sim-log"></pre></details>
        <p class="hint sim-credit">Path following uses Pedro Pathing 3.0.2 (BSD-3-Clause). Physics uses DSIM (PolyForm Noncommercial). Licences are in the app's licenses folder.</p></div>
    </section></div>`;
  const graph=$('#simulation-field'),robotGlyph=$('#field-robot');
  function svg(tag,attributes,text){const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;}
  for(let value=0;value<=144;value+=24){
    if(value>0&&value<144)$('.field-grid').append(svg('path',{d:`M${value} 0V144M0 ${value}H144`}));
    $('.field-labels').append(svg('text',{x:value,y:151,'text-anchor':'middle'},value),svg('text',{x:-4,y:144-value+1.5,'text-anchor':'end'},value));
  }
  $('.field-labels').append(svg('text',{x:72,y:160,'text-anchor':'middle'},'X · inches'),svg('text',{x:-13,y:72,transform:'rotate(-90 -13 72)','text-anchor':'middle'},'Y · inches'));
  const pts=list=>list.map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
  const status=(id,text)=>{$(id).textContent=text;};
  const pressed=(attr,value)=>{for(const b of $$(`[data-${attr}]`))b.setAttribute('aria-pressed',String(b.dataset[attr]===value));};

  // ------------------------------------------------------------------ engine
  // Nearest clear pose to the left-wall default, scanning inward and along the wall.
  function clearStart(g){
    const edge=field.edgePose(0,g);let best=null,bestD=Infinity;
    for(let dx=0;dx<=48;dx+=2)for(let dy=-60;dy<=60;dy+=3){const p=field.constrain({x:edge.x+dx,y:edge.y+dy,heading:0},g),d=Math.hypot(p.x-edge.x,p.y-edge.y);
      if(d<bestD&&planner.safePose(p,info.fieldZones,info.footprint,info.bounds)){best=p;bestD=d;}}
    return best;
  }
  const engineConfig=()=>({field:L().field,start,robot:project.robot,zones:L().zones,sensors:project.sensors,tuning:project.tuning});
  async function load(){
    if(!native){info=null;draw();return;}
    const seq=(load.seq=(load.seq||0)+1);loading=api.sim('load',engineConfig());
    try{const next=await loading;if(seq!==load.seq)return;info=next;
      const g=geometry();try{field.validate(start,g);}catch{start=field.constrain(start,g);preview={...start};}
      if(!L().start&&!planner.safePose(start,info.fieldZones,info.footprint,info.bounds)){const clear=clearStart(g);if(clear){start=clear;preview={...start};}}
      if(!planner.safePose(start,info.fieldZones,info.footprint,info.bounds))status('#start-status','The robot overlaps a field part here. Place it somewhere clear.');
      await api.sim('start',start);inputs();robotPanel();layoutPanel();draw();view3d?.setField(info,L());schedulePlan();
    }catch(e){if(seq===load.seq)status('#sim-run-status',e.message);}finally{if(seq===load.seq)loading=null;}
  }
  const reload=(()=>{let t;return ()=>{clearTimeout(t);t=setTimeout(()=>void load().then(()=>placeModel()),150);};})();
  function call(method,...args){if(!native)return Promise.reject(Error('Physics runs in the installed driver station app.'));return (loading||Promise.resolve()).then(()=>info?null:load()).then(()=>api.sim(method,...args));}
  if(native)api.onSim(message=>{
    if(!active)return;
    if(message.type==='frame'){frame=message;trailPoint(message);paint();telemetry();return;}
    if(message.type==='run')runEvent(message);
    else if(message.type==='optimize')status('#sim-plan-status',`Test-driving route ${message.index+1} of ${message.total}…`);
    else if(message.type==='log'){logLines.push(...message.lines);logLines=logLines.slice(-200);$('#sim-log').textContent=logLines.join('\n');}
    else if(message.type==='host-exit'){info=null;frame=null;runState='idle';if(message.error)status('#sim-run-status',message.error);transport();}
  });
  function trailPoint(f){let last=trail.at(-1);const t=f.truth;if(last&&Math.hypot(last.x-t.x,last.y-t.y)>12){trail=[];last=null;}if(!last||Math.hypot(last.x-t.x,last.y-t.y)>.4||(f.estimate&&!last.e))trail.push({x:t.x,y:t.y,e:f.estimate?{x:f.estimate.x,y:f.estimate.y}:null});if(trail.length>3000)trail.splice(0,1000);}
  function runEvent(m){
    const err=$('#sim-error');
    if(m.state==='starting'){runState='starting';trail=[];logLines=[];$('#sim-log').textContent='';err.hidden=true;status('#sim-run-status',m.kind==='source'?'Compiling and starting your program…':'Starting…');}
    else if(m.state==='running'){runState='running';status('#sim-run-status','Running.');}
    else if(m.state==='finished'){runState='idle';const r=m.result,last=L().pins.at(-1);let text=`Finished in ${r.time.toFixed(2)} s.`;
      if(last&&r.kind==='route')text+=` Ended ${Math.hypot(r.truth.x-last.x,r.truth.y-last.y).toFixed(2)} in from the last pin.`;
      text+=r.violations.length?` Touched ${r.violations.length} no-go zone${r.violations.length>1?'s':''}.`:' No zones touched.';status('#sim-run-status',text);}
    else if(m.state==='error'){runState='idle';status('#sim-run-status','The program stopped.');err.hidden=false;err.replaceChildren(Object.assign(document.createElement('p'),{textContent:m.error}),...(m.trace?.length?[Object.assign(document.createElement('pre'),{textContent:m.trace.join('\n')})]:[]));selectTab('run');}
    else if(m.state==='stopped'){runState='idle';status('#sim-run-status','Stopped.');}
    else if(m.state==='reset'){runState='idle';trail=[];status('#sim-run-status','Back at the starting pose.');}
    transport();
  }

  // ------------------------------------------------------------------ drawing
  function robotPose(){return tool==='start'||!frame?preview:{x:frame.truth.x,y:frame.truth.y,heading:frame.truth.heading};}
  function paint(){
    if(project.view==='3d'&&view3d){view3d.update(frame,state3d());return;}
    const p=robotPose();robotGlyph.setAttribute('transform',`translate(${p.x} ${144-p.y}) rotate(${-p.heading})`);
    const e=frame?.estimate;$('#sim-estimate').setAttribute('points',e?pts(planner.body(e,geometry().footprint)):'');
    const c=frame?.follower?.closest,target=$('#sim-target');target.setAttribute('cx',c?c.x:-99);target.setAttribute('cy',c?c.y:-99);
    for(const z of $$('#sim-zones [data-zone]'))z.classList.toggle('hit',!!frame?.hit?.includes(z.dataset.zone));
  }
  function draw(){
    const g=geometry(),fp=g.footprint,l=L(),b=g.bounds;
    graph.dataset.field=l.field;graph.dataset.placing=String(tool==='start'&&active);graph.dataset.mode=tool;
    const rect=robotGlyph.querySelector('rect'),image=$('#sim-robot-image'),pic=model?.picture;
    rect.setAttribute('x',-fp.rear);rect.setAttribute('y',-fp.half);rect.setAttribute('width',fp.front+fp.rear);rect.setAttribute('height',2*fp.half);
    robotGlyph.classList.toggle('has-model',!!pic);
    if(pic){image.setAttribute('href',pic.url);image.setAttribute('x',pic.x0);image.setAttribute('y',-pic.y1);image.setAttribute('width',pic.x1-pic.x0);image.setAttribute('height',pic.y1-pic.y0);}else image.setAttribute('width',0);
    for(const [k,v] of Object.entries({x:b.x0,y:b.y0,width:b.x1-b.x0,height:b.y1-b.y0}))$('#sim-walls').setAttribute(k,v);
    $('#sim-obstacles').replaceChildren(...(info?.fieldZones||[]).map(z=>svg('polygon',{class:'sim-obstacle',points:pts(planner.polygon(z))})));
    const sel=selected?.kind==='zone'&&zoneById(selected.id);
    $('#sim-zones').replaceChildren(...l.zones.map(z=>zoneShape(z,sel===z?' selected':'')),...(sel&&tool==='select'?handles(sel).map(h=>svg('circle',{class:'sim-handle',cx:h.x,cy:h.y,r:1.4})):[]));
    $('#sim-route').replaceChildren(...(l.route?[svg('polyline',{class:'sim-path',points:pts(l.route.samples)})]:[]));
    $('#sim-pins').replaceChildren(...l.pins.map((p,i)=>{const n=svg('g',{class:'sim-pin'+(selected?.kind==='pin'&&selected.index===i?' selected':'')+(p.wait>0?' stop':'')+(blockedPin===i?' blocked':''),transform:`translate(${p.x} ${p.y})`,'data-pin':i});n.append(svg('circle',{r:2.8}),svg('text',{y:1.1,transform:'scale(1 -1)','text-anchor':'middle'},i+1));return n;}));
    const est=trail.filter(t=>t.e).map(t=>t.e);
    $('#sim-trail').replaceChildren(...(trail.length>1?[svg('polyline',{class:'sim-trail',points:pts(trail)})]:[]),...(est.length>1?[svg('polyline',{class:'sim-trail estimate',points:pts(est)})]:[]));
    $('#sim-start').setAttribute('points',frame&&tool!=='start'?pts(planner.body(start,fp)):'');
    $('#field-coordinates').textContent=`X ${field.round(preview.x)} in · Y ${field.round(preview.y)} in · ${field.round(preview.heading)}°`;
    $('#field-help').textContent={start:'Move the pointer and click to place the robot. Arrow keys move 1 inch; Enter places; Escape cancels.',select:'Click a zone or pin to change it. Drag to move it. Delete or right-click removes it.',drive:native?'Drive with W A S D or the arrow keys, Q and E to turn, Shift to go slow. Controller 1 works too.':'Driving needs the installed app.',rect:'Drag on the field to draw a box the robot must avoid.',circle:'Drag from the middle outwards to draw a circle the robot must avoid.',triangle:'Press where the base goes and drag: the tip follows your cursor.',shape:'Click to add corners. Two make a wall line, three a triangle, more any shape. Click the first corner, double-click or press Enter to finish.',pin:'Click where the robot should go next. Pins are visited in order.'}[tool];
    $('#start-place').disabled=tool==='start';pressed('tool',tool);
    $('#sim-subtitle').textContent=`${l.name}${l.field==='empty'?' · empty field':''}${info?.physics==='3d'?' · 3D physics':''}`;
    paint();
  }
  function inputs(){for(const key of ['x','y','heading'])$('#start-'+key).value=String(field.round(start[key]));}
  function telemetry(){
    // At most ~8 updates a second, but never drop the last frame (a paused simulation sends no more).
    const now=performance.now(),wait=120-(now-(telemetry.at||0));clearTimeout(telemetry.timer);
    if(wait>0){telemetry.timer=setTimeout(telemetry,wait);return;}telemetry.at=now;
    const f=frame,rows=[];if(!f){$('#sim-telemetry').replaceChildren();return;}
    const t=f.truth,e=f.estimate,r=v=>v.toFixed(1),add=(k,v,cls)=>rows.push([k,v,cls]);
    add('Time',`${f.time.toFixed(2)} s${f.playing?'':' · paused'}`);
    add('Robot',`${r(t.x)}, ${r(t.y)} in · ${r(((t.heading%360)+360)%360)}° · ${r(Math.hypot(t.vx,t.vy))} in/s`);
    if(e)add('Sensor estimate',`off by ${Math.hypot(e.x-t.x,e.y-t.y).toFixed(2)} in`);
    if(f.wait)add('Paused at pin',`${f.wait.action||'Pause'} · ${f.wait.remaining.toFixed(1)} s left`);
    else if(f.mode==='program'&&f.follower)add('Route',`leg ${Math.max(1,f.follower.pathIndex+1)}${finite(f.follower.remaining)?` · ${r(f.follower.remaining)} in to go`:''}`);
    add('Zones',f.hit.length?'Touching a no-go zone':f.violations.length?`Touched ${f.violations.length} this run`:'Clear',f.hit.length||f.violations.length?'warn':'');
    $('#sim-telemetry').replaceChildren(...rows.flatMap(([k,v,cls])=>[Object.assign(document.createElement('dt'),{textContent:k}),Object.assign(document.createElement('dd'),{textContent:v,className:cls||''})]));
    $('#sim-mode').textContent=!native?'Preview only':runState==='running'?'Running route':f.mode==='manual'?'Driving':f.playing?'Running':'Paused';
    if(project.view!=='3d')draw();transport();
  }
  function transport(){
    $('#sim-play').textContent=frame?.playing?'Pause':'Play';
    for(const id of ['#sim-play','#sim-stop','#sim-reset','#sim-speed'])$(id).disabled=!native;
    $('#sim-run').disabled=!native||runState==='starting'||optimizing;$('#sim-optimize').disabled=!native||optimizing;
  }

  // ------------------------------------------------------------------ editing
  function changed(what){
    if(['zones','pins','start','robot','field','plan'].includes(what)){L().route=null;L().tested=null;planSeq++;}
    save();draw();if(what==='zones'&&native&&info)void api.sim('zones',L().zones).catch(()=>{});zonePanel();pinPanel();tested();schedulePlan();
  }
  function commit(pose){
    const g=geometry(),next=field.validate(pose,g);
    if(info&&!planner.safePose(next,info.fieldZones,info.footprint,info.bounds))throw Error('That spot overlaps a field part. Choose a clear position.');
    start=next;preview={...start};tool='select';pointer=null;inputs();L().start=start;
    let saved=save();try{localStorage.setItem(field.KEY,field.serialize(start,g));}catch{saved=false;}
    status('#start-status',saved?'Starting pose saved.':'Starting pose set for this session. Device storage is unavailable.');
    changed('start');if(native&&info)void api.sim('start',start).catch(e=>status('#start-status',e.message));
  }
  function toField(event){const m=graph.getScreenCTM();if(!m)return null;const p=graph.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const l=p.matrixTransform(m.inverse());return {x:l.x,y:144-l.y};}
  function hit(p){
    const l=L();for(let i=l.pins.length-1;i>=0;i--)if(Math.hypot(l.pins[i].x-p.x,l.pins[i].y-p.y)<=3.2)return {kind:'pin',index:i};
    const z0=selected?.kind==='zone'&&zoneById(selected.id);if(z0&&tool==='select'){const i=handles(z0).findIndex(h=>Math.hypot(h.x-p.x,h.y-p.y)<=2.2);if(i>=0)return {kind:'handle',id:z0.id,index:i};}
    const near=(q,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(q.x-a.x-dx*t,q.y-a.y-dy*t);};
    for(let i=l.zones.length-1;i>=0;i--){const z=l.zones[i],poly=planner.polygon(z);if(poly.length===2?near(p,poly[0],poly[1])<=1.5:planner.contains(p,poly))return {kind:'zone',id:z.id};}
    return null;
  }
  const zoneById=id=>L().zones.find(z=>z.id===id);
  function draftZone(a,b){
    if(tool==='circle')return {id:'zone-'+Date.now().toString(36),type:'circle',x:a.x,y:a.y,radius:Math.max(.25,Math.hypot(b.x-a.x,b.y-a.y))};
    if(tool==='triangle')return {id:'zone-'+Date.now().toString(36),type:'triangle',...triangleFrom(a,b)};
    return {id:'zone-'+Date.now().toString(36),type:tool,x:(a.x+b.x)/2,y:(a.y+b.y)/2,width:Math.max(.5,Math.abs(b.x-a.x)),height:Math.max(.5,Math.abs(b.y-a.y)),angle:0};
  }
  // A triangle pressed at its base and pulled to its tip: it turns, flips and stretches with the cursor.
  function triangleFrom(base,tip,width){const h=Math.max(.5,Math.hypot(tip.x-base.x,tip.y-base.y)),angle=Math.atan2(tip.y-base.y,tip.x-base.x)*180/Math.PI-90;
    return {x:(base.x+tip.x)/2,y:(base.y+tip.y)/2,height:h,width:Math.max(.5,width??h),angle:((angle%360)+360)%360};}
  // Drag handles for the selected zone: box corner, circle edge, triangle tip, shape corners.
  function handles(z){
    if(z.type==='circle')return [{x:z.x+z.radius,y:z.y,set:p=>({radius:Math.max(.5,Math.hypot(p.x-z.x,p.y-z.y))})}];
    if(z.type==='polygon')return z.points.map((q,i)=>({x:q.x,y:q.y,set:p=>({points:z.points.map((r,j)=>j===i?{x:p.x,y:p.y}:r)})}));
    const a=(z.angle||0)*Math.PI/180,c=Math.cos(a),sn=Math.sin(a),world=(lx,ly)=>({x:z.x+lx*c-ly*sn,y:z.y+lx*sn+ly*c}),local=p=>({x:(p.x-z.x)*c+(p.y-z.y)*sn,y:-(p.x-z.x)*sn+(p.y-z.y)*c});
    if(z.type==='rect')return [{...world(z.width/2,z.height/2),set:p=>{const l=local(p);return {width:Math.max(1,2*Math.abs(l.x)),height:Math.max(1,2*Math.abs(l.y))};}}];
    const base=world(0,-z.height/2);return [{...world(0,z.height/2),set:p=>triangleFrom(base,p,z.width)}];
  }
  function zoneShape(z,extra=''){const p=planner.polygon(z);return p.length===2?svg('polyline',{class:'sim-zone wall'+extra,points:pts(p),'data-zone':z.id}):svg('polygon',{class:'sim-zone'+extra,points:pts(p),'data-zone':z.id});}
  function showDraft(z){
    const nodes=[];if(z)nodes.push(zoneShape(z,' draft'));
    if(sketch){const path=cursor?[...sketch,cursor]:sketch;if(path.length>1)nodes.push(svg('polyline',{class:'sim-zone wall draft',points:pts(path)}));for(const [i,q] of sketch.entries())nodes.push(svg('circle',{class:'sim-corner'+(i===0&&sketch.length>2?' close':''),cx:q.x,cy:q.y,r:1.1}));}
    $('#sim-draft').replaceChildren(...nodes);
  }
  function finishShape(){const points=sketch;sketch=null;cursor=null;showDraft(null);if(!points||points.length<2)return;
    if(L().zones.length>=24)return status('#sim-plan-status','Use at most 24 zones.');
    try{const z=planner.validateZone({id:'zone-'+Date.now().toString(36),type:'polygon',points});L().zones.push(z);selected={kind:'zone',id:z.id};selectTab('plan');changed('zones');}catch(e){status('#sim-plan-status',e.message);}}
  graph.addEventListener('contextmenu',event=>{if(!active)return;const p=toField(event);const h=p&&hit(p);if(!h)return;event.preventDefault();selected=h;removeSelected();});
  graph.addEventListener('pointermove',event=>{
    if(!active)return;const p=toField(event);if(!p)return;
    if(tool==='start'&&(event.pointerType!=='touch'||pointer===event.pointerId)){preview=field.fromGraph(p.x,144-p.y,preview.heading,geometry());draw();return;}
    if(drag?.kind==='draw'){drag.zone=draftZone(drag.from,p);showDraft(drag.zone);return;}
    if(drag?.kind==='zone'){const z=zoneById(drag.id);if(z){const dx=p.x-drag.from.x,dy=p.y-drag.from.y;z.x=drag.zone.x+dx;z.y=drag.zone.y+dy;if(z.type==='polygon')z.points=drag.zone.points.map(q=>({x:q.x+dx,y:q.y+dy}));drag.moved=true;draw();}return;}
    if(drag?.kind==='handle'){const z=zoneById(drag.id);if(z){try{Object.assign(z,planner.validateZone({...drag.zone,...handles(drag.zone)[drag.index].set(p)}));drag.moved=true;draw();zonePanel();}catch{}}return;}
    if(tool==='shape'&&sketch){cursor=p;showDraft(null);}
    if(drag?.kind==='pin'){const q=L().pins[drag.index];q.x=field.round(p.x);q.y=field.round(p.y);drag.moved=true;draw();return;}
    $('#field-coordinates').textContent=`X ${field.round(p.x)} in · Y ${field.round(p.y)} in`;
  });
  graph.addEventListener('pointerdown',event=>{
    if(!active||event.button!==0)return;const p=toField(event);if(!p)return;event.preventDefault();graph.focus();pointer=event.pointerId;graph.setPointerCapture(event.pointerId);
    if(tool==='start'){preview=field.fromGraph(p.x,144-p.y,preview.heading,geometry());draw();return;}
    if(['rect','circle','triangle'].includes(tool)){drag={kind:'draw',from:p,zone:null};return;}
    if(tool==='pin'){const h=hit(p);if(h?.kind==='pin'){selected=h;drag={kind:'pin',index:h.index};draw();pinPanel();return;}
      if(L().pins.length>=32)return status('#sim-plan-status','Use at most 32 pins.');L().pins.push({x:field.round(p.x),y:field.round(p.y),wait:0,action:''});selected={kind:'pin',index:L().pins.length-1};selectTab('plan');changed('pins');return;}
    if(tool==='shape'){if(sketch&&sketch.length>2&&Math.hypot(sketch[0].x-p.x,sketch[0].y-p.y)<=2.5)return finishShape();const last=sketch?.at(-1);if(last&&Math.hypot(last.x-p.x,last.y-p.y)<.3)return;
      sketch=[...(sketch||[]),{x:field.round(p.x),y:field.round(p.y)}];if(sketch.length>=40)return finishShape();showDraft(null);return;}
    if(tool==='select'){const h=hit(p);if(h?.kind==='handle'){drag={kind:'handle',id:h.id,index:h.index,zone:JSON.parse(JSON.stringify(zoneById(h.id)))};return;}
      selected=h;if(selected?.kind==='zone'){const z=zoneById(selected.id);drag={kind:'zone',id:z.id,from:p,zone:JSON.parse(JSON.stringify(z))};selectTab('plan');}else if(selected?.kind==='pin'){drag={kind:'pin',index:selected.index};selectTab('plan');}draw();zonePanel();pinPanel();}
  });
  graph.addEventListener('pointerup',event=>{
    if(!active||pointer!==event.pointerId)return;pointer=null;
    if(tool==='start'){const p=toField(event);if(p)preview=field.fromGraph(p.x,144-p.y,preview.heading,geometry());try{commit(preview);}catch(e){status('#start-status',e.message);preview={...start};tool='start';draw();}return;}
    if(drag?.kind==='draw'){const z=drag.zone;drag=null;showDraft(null);if(z&&(z.type==='circle'?z.radius>=.75:z.width>=1&&z.height>=1)){if(L().zones.length>=24)status('#sim-plan-status','Use at most 24 zones.');else{L().zones.push(planner.validateZone(z));selected={kind:'zone',id:z.id};selectTab('plan');changed('zones');}}return;}
    if(drag){const moved=drag.moved,kind=drag.kind;drag=null;if(moved)changed(kind==='pin'?'pins':'zones');}
  });
  graph.addEventListener('dblclick',event=>{if(active&&tool==='shape'&&sketch){event.preventDefault();finishShape();}});
  graph.addEventListener('pointercancel',()=>{pointer=null;drag=null;showDraft(null);preview={...start};draw();});
  function driveKeys(){
    const k=c=>keys.has(c)?1:0,x=k('KeyD')+k('ArrowRight')-k('KeyA')-k('ArrowLeft'),y=k('KeyW')+k('ArrowUp')-k('KeyS')-k('ArrowDown'),turn=k('KeyE')-k('KeyQ');
    if(native)api.simDrive({enabled:active&&tool==='drive',keyboard:{x,y,turn},fieldCentric:!!driveKeys.fieldCentric,precision:keys.has('ShiftLeft')||keys.has('ShiftRight')});
  }
  graph.addEventListener('keydown',event=>{
    if(!active||event.ctrlKey||event.metaKey||event.altKey)return;
    if(tool==='drive'){if(event.code==='KeyF'&&!event.repeat){driveKeys.fieldCentric=!driveKeys.fieldCentric;status('#sim-run-status',driveKeys.fieldCentric?'Driving relative to the field.':'Driving relative to the robot.');}
      if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyF'].includes(event.code)){event.preventDefault();keys.add(event.code);driveKeys();}return;}
    if(tool==='start'){
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
      if(delta){event.preventDefault();preview=field.constrain({...preview,x:preview.x+delta[0],y:preview.y+delta[1]},geometry());draw();}
      else if(event.key==='Enter'){event.preventDefault();try{commit(preview);}catch(e){status('#start-status',e.message);}}
      else if(event.key==='Escape'){event.preventDefault();tool='select';preview={...start};draw();}
      return;
    }
    if(tool==='shape'&&sketch){if(event.key==='Enter'){event.preventDefault();finishShape();return;}if(event.key==='Escape'){event.preventDefault();sketch=null;cursor=null;showDraft(null);return;}if(event.key==='Backspace'){event.preventDefault();sketch.pop();if(!sketch.length)sketch=null;showDraft(null);return;}}
    if(event.key==='Escape'){tool='select';drag=null;showDraft(null);draw();return;}
    if(!selected)return;
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();removeSelected();return;}
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
    const target=selected.kind==='zone'?zoneById(selected.id):L().pins[selected.index];if(!target)return;
    if(delta){event.preventDefault();const s=event.shiftKey?.1:1;target.x+=delta[0]*s;target.y+=delta[1]*s;changed(selected.kind==='zone'?'zones':'pins');}
    else if(selected.kind==='zone'&&(event.key==='['||event.key===']')){event.preventDefault();target.angle=((target.angle||0)+(event.key===']'?15:-15)+360)%360;changed('zones');}
  });
  graph.addEventListener('keyup',event=>{if(keys.delete(event.code))driveKeys();});
  graph.addEventListener('blur',()=>{if(keys.size){keys.clear();driveKeys();}});
  function removeSelected(){
    const l=L();if(selected?.kind==='zone')l.zones=l.zones.filter(z=>z.id!==selected.id);else if(selected?.kind==='pin')l.pins.splice(selected.index,1);else return;
    const kind=selected.kind;selected=null;changed(kind==='zone'?'zones':'pins');
  }
  function setTool(next){if(!native&&next==='drive')return status('#sim-run-status','Driving needs the installed app.');if(sketch&&next!=='shape')finishShape();tool=next;keys.clear();driveKeys();if(next==='start')preview={...start};if(next==='drive'&&native)void call('play').catch(e=>status('#sim-run-status',e.message));draw();graph.focus();}
  for(const b of $$('[data-tool]'))b.onclick=()=>setTool(b.dataset.tool);
  function zonePanel(){
    const box=$('#sim-zone-editor'),z=selected?.kind==='zone'&&zoneById(selected.id);box.hidden=!z;if(!z)return;
    const fields=z.type==='polygon'?[]:z.type==='circle'?[['x','X'],['y','Y'],['radius','Radius']]:[['x','X'],['y','Y'],['width','Width'],['height','Height'],['angle','Turn °']];
    const name=z.type==='polygon'?(z.points.length===2?'Wall':`Shape · ${z.points.length} corners`):{rect:'Box',circle:'Circle',triangle:'Triangle'}[z.type];
    box.innerHTML=`<div class="sim-editor-head"><h3>${name}</h3><button type="button" class="text-button" id="zone-delete">Remove</button></div>${fields.length?`<div class="sim-grid3">${fields.map(([k,l])=>`<div><label for="zone-${k}">${l}</label><input id="zone-${k}" data-key="${k}" type="number" step="any" value="${field.round(z[k]||0)}"></div>`).join('')}</div>`:''}<p class="hint">Drag the ${z.type==='circle'?'edge dot to resize':z.type==='triangle'?'tip dot to turn and stretch':z.type==='rect'?'corner dot to resize':'corner dots to reshape'}. Drag inside to move.</p>`;
    for(const input of box.querySelectorAll('input'))input.onchange=()=>{const next={...z,[input.dataset.key]:input.valueAsNumber};try{Object.assign(z,planner.validateZone(next));changed('zones');}catch(e){status('#sim-plan-status',e.message);zonePanel();}};
    $('#zone-delete').onclick=removeSelected;
  }
  function pinPanel(){
    const list=$('#sim-pin-list'),l=L();
    list.replaceChildren(...l.pins.map((p,i)=>{const li=document.createElement('li');li.className='sim-pin-row'+(selected?.kind==='pin'&&selected.index===i?' selected':'');
      li.innerHTML=`<span class="sim-badge">${i+1}</span><label class="sr-only" for="pin-wait-${i}">Pause at pin ${i+1}, seconds</label><input id="pin-wait-${i}" class="pin-wait" type="number" min="0" max="30" step="0.25" title="Pause here (seconds)"><span class="hint">s</span><label class="sr-only" for="pin-action-${i}">Action at pin ${i+1}</label><input id="pin-action-${i}" class="pin-action" type="text" maxlength="40"><button type="button" class="icon-button" data-move="-1" aria-label="Move pin ${i+1} earlier">↑</button><button type="button" class="icon-button" data-remove aria-label="Remove pin ${i+1}">×</button>`;
      const wait=li.querySelector('.pin-wait'),action=li.querySelector('.pin-action');wait.value=p.wait||0;action.value=p.action||'';action.placeholder=p.wait>0?'What happens here?':'Add a pause for an action';
      wait.onchange=e=>{const v=e.target.valueAsNumber;p.wait=finite(v)?Math.min(30,Math.max(0,v)):0;changed('plan');};
      action.onchange=e=>{p.action=e.target.value.slice(0,40);changed('plan');};
      li.querySelector('[data-remove]').onclick=()=>{l.pins.splice(i,1);selected=null;changed('pins');};
      li.querySelector('[data-move]').onclick=()=>{if(i===0)return;[l.pins[i-1],l.pins[i]]=[l.pins[i],l.pins[i-1]];selected={kind:'pin',index:i-1};changed('pins');};
      return li;}));
    if(!l.pins.length){const li=document.createElement('li');li.className='hint';li.textContent='No pins yet.';list.append(li);}
    else{const head=document.createElement('li');head.className='sim-pin-head hint';head.textContent='Pin · pause · what happens there';list.prepend(head);}
  }

  // ------------------------------------------------------------------ planning
  let worker=null;
  function planWith(request){
    if(worker===null){try{worker=new Worker('simulation-worker.js');}catch{worker=false;}}
    if(worker)return new Promise((resolve,reject)=>{const id=++planWith.id;const done=event=>{if(event.data?.id!==id)return;worker.removeEventListener('message',done);event.data.error?reject(Error(event.data.error)):resolve(event.data.result);};worker.addEventListener('message',done);worker.postMessage({id,...request});});
    return script('vendor/planning.js').then(()=>planner.plan(request.project,request.footprint,request.fieldZones,request.field));
  }
  planWith.id=0;
  const planRequest=(style,tension)=>{const l=L(),g=geometry();return {project:{start,zones:l.zones,pins:l.pins,clearance:l.clearance,style,tension},footprint:g.footprint,fieldZones:info?.fieldZones||[],field:g.bounds};};
  const schedulePlan=(()=>{let t;return ()=>{clearTimeout(t);t=setTimeout(()=>void plan(),220);};})();
  async function plan(){
    const l=L(),seq=++planSeq;if(!l.pins.length){l.route=null;draw();status('#sim-plan-status','Add pins to make a route.');return null;}
    if(native&&!info)return null;
    try{const route=await planWith(planRequest(l.style));if(seq!==planSeq||l!==L())return null;l.route=route;blockedPin=-1;planError='';save();draw();
      const stops=route.stops.filter(s=>s.wait>0).length,avoid=info?.obstacleName?` and ${info.fieldName}'s ${info.obstacleName}`:'';
      status('#sim-plan-status',`Route ready: ${route.length.toFixed(0)} in${stops?`, ${stops} pause${stops>1?'s':''}`:''}. It stays ${(route.clearance/2).toFixed(1)}+ in from your zones${avoid}.`);
      tested();void autoExport();return route;
    }catch(e){if(seq===planSeq){l.route=null;planError=e.message;const m=/pin (d+)/i.exec(e.message);blockedPin=m?Number(m[1])-1:-1;draw();status('#sim-plan-status',e.message+(m?' It is shown in red.':''));}return null;}
  }
  // Plan each route shape, test-drive them all with the real follower and physics, keep the fastest
  // one that touched no zone and ended on target.
  async function optimize(){
    const l=L();if(!l.pins.length)return status('#sim-plan-status','Add pins first.');optimizing=true;transport();planSeq++;
    try{
      const shapes=[['sharp'],['rounded'],['spline',.6],['spline',1]],routes=[];
      let reason=null;for(const [style,tension] of shapes){try{routes.push({style,tension,route:await planWith(planRequest(style,tension))});}catch(e){reason=reason||e;}}
      if(!routes.length){const m=/pin (d+)/i.exec(reason?.message||'');blockedPin=m?Number(m[1])-1:-1;planError=reason?.message||'';draw();throw Error((reason?.message||'No safe route.')+(m?' It is shown in red.':''));}status('#sim-plan-status','Test-driving routes…');
      const results=await call('evaluate',routes.map(r=>({heading:r.route.heading,segments:r.route.segments,stops:r.route.stops})));
      const last=l.pins.at(-1),rows=routes.map((r,i)=>{const x=results[i];const ok=!!(x?.ok&&x.violations===0&&Math.hypot(x.truth.x-last.x,x.truth.y-last.y)<1.5);return {style:r.style,tension:r.tension,time:x?.time,ok,note:!x?.ok?x?.error:x.violations?'touched a zone':ok?'':'missed the last pin'};});
      const best=rows.filter(r=>r.ok).sort((a,b)=>a.time-b.time)[0];if(!best)throw Error('None of the route shapes finished cleanly. Try more space around zones.');
      const chosen=routes[rows.indexOf(best)];l.style=best.style;l.route=chosen.route;l.tested=rows.map(r=>({...r,best:r===best}));save();pressed('style',l.style);draw();tested();
      status('#sim-plan-status',`Fastest: ${STYLES[best.style]} in ${best.time.toFixed(2)} s. It is now the planned route.`);void autoExport();
    }catch(e){status('#sim-plan-status',e.message);}finally{optimizing=false;transport();}
  }
  function tested(){const rows=L().tested||[];$('#sim-tested').replaceChildren(...rows.map(r=>{const d=document.createElement('div');d.className='sim-tested-row'+(r.best?' best':'');d.textContent=`${STYLES[r.style]}${r.style==='spline'?(r.tension===1?' (wide)':' (tight)'):''}: ${finite(r.time)&&r.ok?r.time.toFixed(2)+' s':r.note}${r.best?' · fastest':''}`;return d;}));}
  $('#sim-optimize').onclick=()=>void optimize();
  for(const b of $$('[data-style]'))b.onclick=()=>{L().style=b.dataset.style;pressed('style',L().style);changed('plan');};
  $('#sim-clearance').onchange=e=>{L().clearance=Math.min(6,Math.max(planner.MIN_CLEARANCE,e.target.valueAsNumber||2));e.target.value=L().clearance;changed('plan');};
  $('#sim-clear-pins').onclick=()=>{L().pins=[];selected=null;changed('pins');};
  $('#sim-clear-zones').onclick=()=>{L().zones=[];selected=null;changed('zones');};

  // ------------------------------------------------------------------ export
  function exportText(format){
    const l=L(),route=l.route;if(!route)throw Error('Plan a route first.');
    const lay={name:l.name,field:l.field,fieldName:GAMES[l.field],start,zones:l.zones};
    return format==='java'?exporter.java(route,lay,{className:project.export.className,packageName:project.export.packageName,polygon:planner.polygon}):exporter.pp(route,lay,{polygon:planner.polygon});
  }
  async function exportRoute(format){
    try{const text=exportText(format),name=format==='java'?project.export.className+'.java':(L().name.replace(/[^\w -]/g,'')||'route')+'.pp';
      const r=await api.simFile('export-save',{key:L().id,format,text,name,keep:project.export.keep});
      if(r)status('#sim-export-status',project.export.keep?`Exported ${r.name}. It updates whenever this route changes.`:`Exported ${r.name}.`);}
    catch(e){status('#sim-export-status',e.message);}
  }
  async function autoExport(){
    if(!native||!project.export.keep||!L().route)return;
    for(const format of ['java','pp']){try{const r=await api.simFile('export-update',{key:L().id,format,text:exportText(format)});if(r)status('#sim-export-status',`Updated ${r.name}.`);}catch(e){status('#sim-export-status',e.message);}}
  }
  async function exportPanel(){
    $('#sim-export-keep').checked=project.export.keep;$('#sim-export-package').value=project.export.packageName;$('#sim-export-class').value=project.export.className;status('#sim-export-status','');
    if(native&&project.export.keep){try{const t=await api.simFile('export-status',{key:L().id});status('#sim-export-status',t?`Keeping ${t.name} updated.`:'');}catch{}}
  }
  $('#sim-export-java').onclick=()=>void exportRoute('java');$('#sim-export-pp').onclick=()=>void exportRoute('pp');
  $('#sim-export-keep').onchange=e=>{project.export.keep=e.target.checked;save();if(!project.export.keep&&native)void api.simFile('export-forget',{key:L().id}).catch(()=>{});status('#sim-export-status',project.export.keep?'Export once; the file then follows every route change.':'');};
  $('#sim-export-package').onchange=e=>{try{exporter.validName(project.export.className,e.target.value.trim());project.export.packageName=e.target.value.trim();save();status('#sim-export-status','');}catch(err){status('#sim-export-status',err.message);}};
  $('#sim-export-class').onchange=e=>{try{exporter.validName(e.target.value.trim(),project.export.packageName);project.export.className=e.target.value.trim();save();status('#sim-export-status','');}catch(err){status('#sim-export-status',err.message);}};

  // ------------------------------------------------------------------ run
  function programPanel(){pressed('program',project.program.kind);$('#sim-source-box').hidden=project.program.kind!=='source';$('#sim-source').value=project.program.source;$('#sim-source-name').textContent=project.program.name?`Program · ${project.program.name}`:'Program';}
  for(const b of $$('[data-program]'))b.onclick=()=>{project.program.kind=b.dataset.program;save();programPanel();};
  $('#sim-source').oninput=e=>{project.program.source=e.target.value;save();};
  $('#sim-java-example').onclick=()=>{project.program={kind:'source',name:'MyAuto.java',source:EXAMPLE};save();programPanel();};
  $('#sim-java-open').onclick=async()=>{try{const file=await api.simFile('java-open');if(file){project.program={kind:'source',name:file.name,source:file.source};save();programPanel();}}catch(e){status('#sim-run-status',e.message);}};
  $('#sim-run').onclick=async()=>{
    $('#sim-error').hidden=true;status('#sim-run-status','Starting…');runState='starting';transport();
    try{
      let route=L().route;if(!route)route=await plan();
      if(!route){runState='idle';transport();return status('#sim-run-status',L().pins.length?`The route can't be planned yet: ${planError||'check the Plan tab.'}`:'Add pins to make a route first.');}
      const payload={kind:project.program.kind,source:project.program.kind==='source'?project.program.source:undefined,route:{heading:route.heading,segments:route.segments,stops:route.stops}};
      trail=[];setTool('select');const r=await call('run',payload);if(!r.ok&&r.error!=='Stopped.'){runState='idle';status('#sim-run-status',r.error);}
    }catch(e){runState='idle';status('#sim-run-status',e.message);}transport();
  };
  $('#sim-play').onclick=()=>void call(frame?.playing?'pause':'play').catch(e=>status('#sim-run-status',e.message));
  $('#sim-stop').onclick=()=>{keys.clear();driveKeys();void call('stop').catch(e=>status('#sim-run-status',e.message));};
  $('#sim-reset').onclick=()=>{keys.clear();driveKeys();trail=[];void call('reset').catch(e=>status('#sim-run-status',e.message));};
  $('#sim-speed').onchange=e=>void call('speed',Number(e.target.value)).catch(()=>{});

  // ------------------------------------------------------------------ robot and model
  function robotPanel(){
    const r=project.robot;$('#sim-drivetrain').value=r.drivetrain;$('#sim-intake').value=r.intake;$('#sim-length').value=r.length;$('#sim-width').value=r.width;$('#sim-mass').value=r.massLb;$('#sim-rpm').value=r.driveRpm;
    $('#sim-localization').value=project.sensors.localization;$('#sim-noise').value=+(project.sensors.noise*100).toFixed(2);$('#sim-drift').value=project.sensors.gyroDrift;
    $('#sim-maxspeed').value=project.tuning.maxPathSpeed??.6;$('#sim-transp').value=project.tuning.translationalP??(info?.tuning.translationalP||.5);
    const f=geometry().footprint;let text=`Collision footprint: ${f.front.toFixed(2)} in front, ${f.rear.toFixed(2)} in rear, ${f.half.toFixed(2)} in each side. Routes keep this whole area clear.`;
    if(info){const e=info.robot;if(e.length!==r.length||e.width!==r.width)text+=` (Applied ${e.length} × ${e.width} in: the closest size the physics supports.)`;}
    $('#sim-footprint').textContent=text;$('#sim-clearance').value=L().clearance;pressed('style',L().style);
  }
  const settle=()=>{project=sanitize(project);save();changed('robot');reload();};
  const num=(id,set)=>{$(id).onchange=e=>{const v=e.target.valueAsNumber;if(!finite(v))return robotPanel();set(v);settle();};};
  $('#sim-drivetrain').onchange=e=>{project.robot.drivetrain=e.target.value;settle();};
  $('#sim-intake').onchange=e=>{project.robot.intake=e.target.value;settle();};
  num('#sim-length',v=>project.robot.length=v);num('#sim-width',v=>project.robot.width=v);num('#sim-mass',v=>project.robot.massLb=v);num('#sim-rpm',v=>project.robot.driveRpm=v);
  num('#sim-noise',v=>project.sensors.noise=v/100);num('#sim-drift',v=>project.sensors.gyroDrift=v);
  num('#sim-maxspeed',v=>project.tuning.maxPathSpeed=Math.min(1,Math.max(.1,v)));num('#sim-transp',v=>project.tuning.translationalP=Math.min(5,Math.max(0,v)));
  $('#sim-localization').onchange=e=>{project.sensors.localization=e.target.value;save();reload();};
  const M=()=>window.DeckRobotModel;
  async function three(){await script('vendor/three-view.js');await script('sim-robot-model.js');}
  // The stored one-body model, placed in the robot frame for 2D and 3D.
  async function placeModel(){
    const meta=project.model;if(!meta||!native){model=null;modelUi();draw();view3d?.setModel(null);return;}
    try{await three();if(model?.id!==meta.id){const data=await api.simFile('model-read',meta.id);if(!data)throw Error('The saved robot model is missing. Import it again.');model={id:meta.id,geometry:await M().fromGlb(data.bytes)};}
      model.holder=M().place(model.geometry,meta,geometry().footprint);model.picture=M().silhouette(model.holder);
    }catch(e){model=null;status('#start-status',e.message);}
    modelUi();draw();view3d?.setModel(model?.holder||null);
  }
  function modelUi(){
    const meta=project.model;$('#sim-model-box').hidden=!meta;$('#sim-model-drop').classList.toggle('compact',!!meta);
    if(!meta){modelPreview?.dispose();modelPreview=null;return;}
    $('#sim-units-box').hidden=meta.source==='step';$('#sim-model-units').value=meta.units;
    const s=model?.holder?.userData.size;$('#sim-mesh-size').textContent=s?`${meta.name}: ${s.length.toFixed(1)} long × ${s.width.toFixed(1)} wide × ${s.height.toFixed(1)} in tall, as one solid body. It is for looks only; collisions use the footprint.`:meta.name;
    if(model?.holder){if(!modelPreview)modelPreview=M().preview($('#sim-model-preview'),{onSide:side=>{selectedSide=side;for(const b of ['#sim-model-front','#sim-model-top'])$(b).disabled=false;status('#sim-model-help',`You picked the cube's ${side}. Is that your robot's front or top?`);}});modelPreview.update(model.holder,geometry().footprint);}
  }
  async function importModel(get){
    status('#start-status','Reading your robot…');
    try{await three();const result=await get();if(!result){status('#start-status','');return;}
      if(result.kind==='step')status('#start-status',`Merging ${result.parts} parts into one body…`);
      const body=await M().bodyFromImport(result),glb=await M().toGlb(body.geometry),stored=await api.simFile('model-save',{name:result.name||'robot.glb',bytes:glb});
      project.model=M().meta({id:stored.id,name:result.name||stored.name,units:body.units,front:'+x',top:'+z',source:body.source});model={id:stored.id,geometry:body.geometry};save();
      selectTab('setup');await placeModel();status('#start-status',`Imported ${body.parts} part${body.parts===1?'':'s'} as one body. Check the front and top with the cube below.`);
    }catch(e){status('#start-status',e.message);}
  }
  $('#sim-model-open').onclick=()=>void importModel(()=>api.simFile('model-open'));
  const drop=$('#sim-model-drop');
  for(const type of ['dragenter','dragover'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('over');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('over');const file=e.dataTransfer?.files?.[0];if(!file||!native)return;const filePath=api.simDropPath?.(file);if(!filePath)return status('#start-status','That file could not be opened.');void importModel(()=>api.simFile('model-drop',filePath));});
  const reorient=fn=>{if(!project.model||!selectedSide)return;Object.assign(project.model,fn(project.model,selectedSide));save();selectedSide=null;for(const b of ['#sim-model-front','#sim-model-top'])$(b).disabled=true;status('#sim-model-help','Updated. Pick another side to adjust again.');void placeModel().then(()=>modelPreview?.look('front'));};
  $('#sim-model-front').onclick=()=>reorient(M().setFront);$('#sim-model-top').onclick=()=>reorient(M().setTop);
  $('#sim-model-units').onchange=e=>{if(!project.model)return;project.model.units=e.target.value;save();void placeModel();};
  $('#sim-model-size').onclick=()=>{const s=model?.holder?.userData.size;if(!s)return;const reach={sloped:3,vector:3.5,triangle:3}[project.robot.intake]||3;
    project.robot.length=Math.round(Math.min(18,Math.max(8,s.length-reach))*4)/4;project.robot.width=Math.round(Math.min(18,Math.max(8,s.width))*4)/4;settle();robotPanel();
    status('#start-status',`Robot set to ${project.robot.length} × ${project.robot.width} in plus the ${reach} in intake. Adjust if parts of the model stick out.`);};
  $('#sim-model-remove').onclick=()=>{project.model=null;model=null;save();modelUi();draw();view3d?.setModel(null);};

  // ------------------------------------------------------------------ layouts and files
  function layoutPanel(){
    const sel=$('#sim-field');sel.replaceChildren(...project.layouts.map(l=>new Option(`${l.name}${l.field!=='empty'&&!l.name.startsWith(GAMES[l.field])?` (${GAMES[l.field]})`:''}`,l.id,false,l.id===project.active)));
    const add=document.createElement('optgroup');add.label='Add a field';for(const [k,v] of Object.entries({empty:'New empty field',decode:'New DECODE layout',biobuzz:'New BIOBUZZ layout'}))add.append(new Option(v,'new:'+k));sel.append(add);
    const l=L();$('#sim-field-note').textContent=l.field==='empty'?'Only your own no-go zones on this field.':`Routes avoid ${GAMES[l.field]}'s ${info?.field===l.field?info.obstacleName:'field parts'} automatically (shown in grey).`;
    $('#sim-layout-delete').disabled=project.layouts.length<2;
  }
  async function switchLayout(id){
    project.active=id;const l=L();selected=null;trail=[];frame=null;start=l.start||field.edgePose(0,geometry());preview={...start};tool=l.start?'select':'start';save();
    layoutPanel();inputs();pinPanel();zonePanel();tested();robotPanel();draw();view3d?.setField(null,l);await load();void exportPanel();
  }
  $('#sim-field').onchange=e=>{
    const v=e.target.value;if(v.startsWith('new:')){const game=v.slice(4),count=project.layouts.filter(l=>l.field===game).length+1;
      if(project.layouts.length>=20){layoutPanel();return status('#start-status','Use at most 20 fields.');}
      const l=layout(game,game==='empty'?`Empty field ${count}`:`${GAMES[game]} ${count}`);project.layouts.push(l);void switchLayout(l.id);return;}
    void switchLayout(v);
  };
  $('#sim-layout-rename').onclick=()=>{const l=L(),input=document.createElement('input');input.type='text';input.maxLength=40;input.value=l.name;input.className='sim-rename';input.setAttribute('aria-label','Field name');
    const sel=$('#sim-field');sel.hidden=true;sel.after(input);input.focus();input.select();let finished=false;
    const done=keep=>{if(finished)return;finished=true;if(keep&&input.value.trim())l.name=input.value.trim().slice(0,40);input.remove();sel.hidden=false;save();layoutPanel();draw();};
    input.onkeydown=e=>{if(e.key==='Enter')done(true);else if(e.key==='Escape')done(false);};input.onblur=()=>done(true);};
  $('#sim-layout-delete').onclick=()=>{if(project.layouts.length<2)return;const gone=L();project.layouts=project.layouts.filter(l=>l!==gone);void switchLayout(project.layouts[0].id);status('#start-status',`Removed ${gone.name}.`);};
  $('#sim-save').onclick=async()=>{
    try{const data={...project};if(project.model&&model){const glb=await M().toGlb(model.geometry);let s='';for(let i=0;i<glb.length;i+=32768)s+=String.fromCharCode(...glb.subarray(i,i+32768));data.modelData=btoa(s);}
      const r=await api.simFile('project-save',JSON.stringify({deckSimulation:2,...data}));if(r)status('#start-status',`Saved ${r.name}.`);}catch(e){status('#start-status',e.message);}
  };
  $('#sim-open').onclick=async()=>{
    try{const file=await api.simFile('project-open');if(!file)return;const raw=JSON.parse(file.text);if(raw?.deckSimulation!==2&&raw?.deckSimulation!==1)throw Error('That file is not a Deck simulation project.');
      const next=sanitize(raw);if(raw.modelData&&typeof raw.modelData==='string'&&raw.model){const bin=atob(raw.modelData),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const stored=await api.simFile('model-save',{name:raw.model.name||'robot.glb',bytes});next.model=modelMeta({...raw.model,id:stored.id});}
      project=next;model=null;save();refreshAll();await switchLayout(project.active);await placeModel();status('#start-status',`Opened ${file.name}.`);}catch(e){status('#start-status',e.message);}
  };

  // ------------------------------------------------------------------ views
  function script(src){return script.cache[src]||(script.cache[src]=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>{delete script.cache[src];reject(Error(`Could not load ${src}.`));};document.head.append(s);}));}
  script.cache={};
  function state3d(){return {layout:L(),start,info,trail,frame};}
  async function setView(next){
    project.view=next;save();pressed('view',next);const three3=next==='3d';$('#sim-3d').hidden=!three3;graph.style.display=three3?'none':'';
    $('[data-tool]').parentElement.classList.toggle('three',three3);
    if(three3){if(!['select','drive'].includes(tool))tool='select';try{await three();await script('sim-3d.js');view3d=view3d||window.DeckSim3D.create($('#sim-3d'));view3d.setField(info,L());view3d.setModel(model?.holder||null);view3d.update(frame,state3d());}catch(e){status('#sim-run-status',e.message);}}
    draw();
  }
  for(const b of $$('[data-view]'))b.onclick=()=>void setView(b.dataset.view);
  function selectTab(name){for(const b of $$('[data-tab]'))b.setAttribute('aria-selected',String(b.dataset.tab===name));for(const p of $$('[data-panel]'))p.hidden=p.dataset.panel!==name;}
  for(const b of $$('[data-tab]'))b.onclick=()=>selectTab(b.dataset.tab);
  $('#start-form').addEventListener('submit',event=>{event.preventDefault();try{commit(Object.fromEntries(['x','y','heading'].map(key=>[key,$('#start-'+key).valueAsNumber])));}catch(error){status('#start-status',error.message);}});
  $('#start-place').onclick=()=>{preview={...start};tool='start';status('#start-status','Click the field where the robot starts.');draw();graph.focus();};
  $('#start-edge').onclick=()=>{preview=field.edgePose(start.heading,geometry());tool='start';pointer=null;status('#start-status','Against the left wall. Move and click to place, or press Enter to use it.');draw();graph.focus();};
  addEventListener('resize',()=>paint());
  function refreshAll(){layoutPanel();inputs();robotPanel();programPanel();modelUi();zonePanel();pinPanel();tested();void exportPanel();pressed('view',project.view);draw();transport();}
  selectTab('setup');refreshAll();
  return {activate(value){
    if(active&&!value){pointer=null;drag=null;keys.clear();status('#sim-run-status',runState==='running'?'Simulation closed. The running program was stopped.':'');if(native)api.simDrive({enabled:false});if(tool==='start')preview={...start};frame=null;info=null;runState='idle';trail=[];draw();}
    const was=active;active=value;
    if(value&&!was){if(!L().start)tool='start';draw();void load().then(()=>{if(project.view==='3d')void setView('3d');if(project.model)void placeModel();});}
  }};
}};
