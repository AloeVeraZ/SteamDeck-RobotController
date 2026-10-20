/* Offline simulator. DSIM physics and Pedro Pathing run in the app's simulation process; this view
   edits the project, plans routes in a worker and draws frames. Real robot configuration and
   localization stay on the robot: nothing here is sent to one. */
window.DeckSimulation={create(root){
  'use strict';
  const field=window.DeckField,planner=window.DeckPlanner,api=window.deck||{},native=typeof api.sim==='function';
  const $=selector=>root.querySelector(selector),$$=selector=>[...root.querySelectorAll(selector)],ns='http://www.w3.org/2000/svg';
  const PROJECT_KEY='deck-simulation-project-v1',DEG=Math.PI/180,finite=n=>typeof n==='number'&&Number.isFinite(n);
  const FIELDS={empty:'Empty field',decode:'DECODE (DSIM)',biobuzz:'BIOBUZZ (DSIM)'};
  const EXAMPLE=`import com.pedropathing.api.Paths;
import com.pedropathing.follower.Follower;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.Path;
import deck.sim.DeckAutonomous;
import deck.sim.SimRobot;

// Genuine Pedro paths. Follows the planned route if you planned one; otherwise drives 24 in
// forward and back. Edit freely: loop() runs every 1/60 s of simulation time.
public class OutAndBack implements DeckAutonomous {
    private Follower follower;
    private Path out, back;
    private int stage = 0;

    @Override
    public void init(SimRobot robot) {
        follower = robot.follower();
        Pose start = robot.startPose();
        follower.setPose(start);
        double h = start.heading();
        Pose far = new Pose(start.x() + 24 * Math.cos(h), start.y() + 24 * Math.sin(h), h);
        if (robot.plannedRoute() != null) {
            out = robot.plannedRoute();
            stage = 1; // the route already ends at the last pin
        } else {
            out = Paths.line(start, far).constant(h);
            back = Paths.line(far, start).constant(h);
        }
        follower.follow(out);
    }

    @Override
    public void loop(SimRobot robot) {
        follower.update();
        robot.telemetry("stage", stage == 0 ? "out" : "back");
        if (!follower.isBusy()) {
            if (stage++ == 0) follower.follow(back);
            else robot.finish();
        }
    }
}
`;
  // ------------------------------------------------------------------ project
  const ROBOT={drivetrain:'mecanum',intake:'sloped',length:15,width:18,massLb:23.5,driveRpm:500};
  const defaults=()=>({version:1,field:'empty',physics:'3d',start:null,zones:[],pins:[],clearance:2,smooth:true,robot:{...ROBOT},sensors:{localization:'odometry',gyroDrift:.5,noise:.02},tuning:{maxPathSpeed:.6},program:{kind:'route',name:'',source:EXAMPLE},mesh:null,view:'2d',route:null});
  function sanitize(raw){
    const p=defaults();if(!raw||typeof raw!=='object')return p;
    if(Object.hasOwn(FIELDS,raw.field))p.field=raw.field;if(raw.physics==='2d')p.physics='2d';if(raw.view==='3d')p.view='3d';
    if(raw.start&&[raw.start.x,raw.start.y,raw.start.heading].every(finite))p.start={x:raw.start.x,y:raw.start.y,heading:field.heading(raw.start.heading)};
    if(Array.isArray(raw.zones))p.zones=raw.zones.slice(0,24).map((z,i)=>{try{return planner.validateZone({...z,id:z.id||'zone-'+i});}catch{return null;}}).filter(Boolean);
    if(Array.isArray(raw.pins))p.pins=raw.pins.slice(0,32).filter(q=>q&&finite(q.x)&&finite(q.y)).map(q=>({x:q.x,y:q.y}));
    if(finite(raw.clearance))p.clearance=Math.min(6,Math.max(planner.MIN_CLEARANCE,raw.clearance));if(raw.smooth===false)p.smooth=false;
    const r=raw.robot||{};p.robot={drivetrain:r.drivetrain==='swerve'?'swerve':'mecanum',intake:['sloped','vector','triangle'].includes(r.intake)?r.intake:'sloped'};
    for(const [k,min,max] of [['length',8,18],['width',8,18],['massLb',10,42],['driveRpm',200,1200]])p.robot[k]=finite(r[k])?Math.min(max,Math.max(min,r[k])):ROBOT[k];
    const s=raw.sensors||{};if(['ideal','odometry','encoders','gyro'].includes(s.localization))p.sensors.localization=s.localization;if(finite(s.gyroDrift))p.sensors.gyroDrift=Math.min(10,Math.max(0,s.gyroDrift));if(finite(s.noise))p.sensors.noise=Math.min(.5,Math.max(0,s.noise));
    const t=raw.tuning||{};for(const k of ['maxPathSpeed','translationalP','headingP'])if(finite(t[k]))p.tuning[k]=t[k];
    const g=raw.program||{};p.program={kind:g.kind==='source'?'source':'route',name:typeof g.name==='string'?g.name.slice(0,120):'',source:typeof g.source==='string'&&g.source.length<=200000?g.source:EXAMPLE};
    const m=raw.mesh;if(m&&typeof m.id==='string'&&/^[0-9a-f]{32}\.(glb|gltf|stl|obj)$/.test(m.id))p.mesh={id:m.id,name:String(m.name||m.id).slice(0,120),format:m.format,scale:finite(m.scale)&&m.scale>0?m.scale:1,rx:finite(m.rx)?m.rx:0,ry:finite(m.ry)?m.ry:0,rz:finite(m.rz)?m.rz:0,dz:finite(m.dz)?m.dz:0};
    if(raw.route&&Array.isArray(raw.route.segments)&&Array.isArray(raw.route.samples))p.route=raw.route;
    return p;
  }
  let project;try{project=sanitize(JSON.parse(localStorage.getItem(PROJECT_KEY)));}catch{project=defaults();}
  if(!project.start){try{project.start=field.restore(localStorage.getItem(field.KEY));}catch{}}
  let info=null,frame=null,selected=null,tool=project.start?'select':'start',active=false,pointer=null,drag=null,planSeq=0,keys=new Set(),dirty=true,trail=[],loading=null,meshData=null,view3d=null,runState='idle',logLines=[];
  const geometry=()=>({footprint:info?.footprint||fallbackFootprint(),bounds:info?.bounds||{x0:0,y0:0,x1:144,y1:144}});
  function fallbackFootprint(){const reach={sloped:3,vector:3.5,triangle:3}[project.robot.intake];return {front:project.robot.length/2+reach,rear:project.robot.length/2,half:project.robot.width/2};}
  let start=project.start||field.edgePose(0,geometry()),preview={...start};
  function save(){try{localStorage.setItem(PROJECT_KEY,JSON.stringify({...project,start}));return true;}catch{return false;}}

  // ------------------------------------------------------------------ markup
  const options=(list,value)=>Object.entries(list).map(([k,v])=>`<option value="${k}"${k===value?' selected':''}>${v}</option>`).join('');
  root.innerHTML=`<div class="simulation-heading"><div><h1>Simulation</h1><p id="sim-subtitle"></p></div>
    <div class="sim-heading-controls"><label class="sr-only" for="sim-field">Field</label><select id="sim-field">${options(FIELDS,project.field)}</select>
    <div class="segmented sim-views" role="group" aria-label="View"><button type="button" data-view="2d">2D</button><button type="button" data-view="3d">3D</button></div>
    <span class="simulation-mode" id="sim-mode">Offline</span></div></div>
    <div class="simulation-layout"><section class="field-area" aria-label="Simulation field">
      <div class="sim-toolbar" role="toolbar" aria-label="Field tools">
        <div class="sim-tools">${[['select','Select'],['start','Start'],['drive','Drive'],['rect','Rect'],['circle','Circle'],['triangle','Triangle'],['pin','Pin']].map(([k,v])=>`<button type="button" data-tool="${k}" aria-pressed="false">${v}</button>`).join('')}</div>
        <div class="sim-transport"><button type="button" id="sim-play" class="secondary">Play</button><button type="button" id="sim-stop" class="secondary">Stop</button><button type="button" id="sim-reset" class="secondary">Reset</button>
        <label class="sr-only" for="sim-speed">Speed</label><select id="sim-speed">${options({'0.25':'0.25×','0.5':'0.5×','1':'1×','2':'2×','4':'4×'},'1')}</select></div>
      </div>
      <div class="sim-stage" id="sim-stage"><canvas id="sim-canvas" aria-hidden="true"></canvas>
      <svg id="simulation-field" viewBox="-16 -9 168 172" role="group" tabindex="0" aria-label="Simulation field, inches from the bottom-left corner" aria-describedby="field-help field-coordinates">
        <rect class="field-floor" x="0" y="0" width="144" height="144"/><g class="field-grid"></g><g class="field-labels"></g>
        <g id="sim-overlay" transform="matrix(1 0 0 -1 0 144)"><g id="sim-field-zones"></g><g id="sim-zones"></g><g id="sim-route"></g><g id="sim-trail"></g><g id="sim-pins"></g><polygon id="sim-estimate" class="sim-estimate" points=""/><circle id="sim-target" class="sim-target" r="1.2" cx="-99" cy="-99"/><rect id="sim-draft" class="sim-zone draft" x="-99" y="-99" width="0" height="0"/></g>
        <g id="field-robot"><rect x="-9" y="-9" width="18" height="18" rx="1"/><path d="M-3 0H5M2-3L5 0 2 3"/><circle r="1"/></g>
      </svg><div id="sim-3d" class="sim-3d" hidden></div></div>
      <output id="field-coordinates"></output><p id="field-help" class="hint"></p>
      <dl id="sim-telemetry" class="sim-telemetry" aria-live="off"></dl>
    </section>
    <section class="start-controls sim-panel" aria-label="Simulation settings">
      <div class="segmented sim-tabs" role="tablist">${['Setup','Plan','Run','Robot'].map(t=>`<button type="button" role="tab" data-tab="${t.toLowerCase()}">${t}</button>`).join('')}</div>
      <div data-panel="setup"><h2 id="start-title">Starting pose</h2><p>Place the robot along a wall or anywhere clear on the field.</p>
        <form id="start-form"><div class="start-xy"><div><label for="start-x">X · inches</label><input id="start-x" type="number" step="any" required inputmode="decimal"></div><div><label for="start-y">Y · inches</label><input id="start-y" type="number" step="any" required inputmode="decimal"></div></div>
        <label for="start-heading">Heading · degrees</label><input id="start-heading" type="number" step="any" required inputmode="decimal">
        <p class="hint">Origin: bottom-left. X goes right; Y goes up. Heading 0° faces right; 90° faces up.</p>
        <button class="primary" type="submit">Set starting pose</button></form>
        <div class="button-row"><button id="start-place" class="secondary" type="button">Place on field</button><button id="start-edge" class="secondary" type="button">Start at edge</button></div>
        <p id="start-status" role="status"></p>
        <div class="button-row"><button id="sim-open" class="secondary" type="button">Open project…</button><button id="sim-save" class="secondary" type="button">Save project…</button></div>
        <p class="hint">Projects are saved on this device. Robot configuration and localization stay on the robot.</p></div>
      <div data-panel="plan" hidden><h2>No-go zones and pins</h2><p class="hint">Draw red zones with Rect, Circle or Triangle. Select one to edit it; Delete removes it. Pins are visited in order.</p>
        <div id="sim-zone-editor" class="sim-editor" hidden></div><ol id="sim-pin-list" class="sim-list"></ol>
        <div class="start-xy"><div><label for="sim-clearance">Clearance · in</label><input id="sim-clearance" type="number" min="0.05" max="6" step="0.25"></div><div><label class="check"><input id="sim-smooth" type="checkbox"> Round corners</label></div></div>
        <button id="sim-plan" class="primary" type="button">Plan route</button><p id="sim-plan-status" role="status"></p>
        <div class="button-row"><button id="sim-clear-pins" class="secondary" type="button">Clear pins</button><button id="sim-clear-zones" class="secondary" type="button">Clear zones</button></div></div>
      <div data-panel="run" hidden><h2>Autonomous</h2>
        <div class="segmented sim-program" role="group" aria-label="Program"><button type="button" data-program="route">Planned route</button><button type="button" data-program="source">Java program</button></div>
        <div id="sim-source-box" hidden><div class="button-row"><button id="sim-java-open" class="secondary" type="button">Open .java…</button><button id="sim-java-example" class="secondary" type="button">Example</button></div>
          <label for="sim-source" id="sim-source-name">Program source</label><textarea id="sim-source" spellcheck="false" wrap="off"></textarea></div>
        <button id="sim-run" class="primary" type="button">Run with Pedro Pathing</button><p id="sim-run-status" role="status"></p><div id="sim-error" class="sim-error" role="alert" hidden></div>
        <details class="sim-log"><summary>Program output</summary><pre id="sim-log"></pre></details>
        <details class="sim-adapters"><summary>Execution adapters</summary><p class="hint"><b>Implemented:</b> Pedro Pathing 3.0.2 core (genuine Follower, Foresight, Paths) compiled from the pinned source, with its clock reads redirected to simulation time. It drives DSIM's physics through a simulated drivetrain and a localizer fed by simulated sensors.</p><p class="hint"><b>Not implemented:</b> Road Runner, the FTC SDK (OpMode, hardwareMap), and MotionModule's Python runtime. Code that uses <code>deck.sim</code> needs a robot-side OpMode adapter before it can run on a robot.</p></details></div>
      <div data-panel="robot" hidden><h2>Simulated robot</h2><p class="hint">These parameters describe the simulation only. Hardware ports, sensors and localizers stay on the robot.</p>
        <div class="start-xy"><div><label for="sim-drivetrain">Drivetrain</label><select id="sim-drivetrain">${options({mecanum:'Mecanum',swerve:'Swerve'},project.robot.drivetrain)}</select></div><div><label for="sim-intake">Intake (DSIM)</label><select id="sim-intake">${options({sloped:'Sloped · 3 in reach',vector:'Vector · 3.5 in reach',triangle:'Triangle'},project.robot.intake)}</select></div></div>
        <div class="start-xy"><div><label for="sim-length">Length · in</label><input id="sim-length" type="number" min="8" max="18" step="0.25"></div><div><label for="sim-width">Width · in</label><input id="sim-width" type="number" min="8" max="18" step="0.25"></div></div>
        <div class="start-xy"><div><label for="sim-mass">Mass · lb</label><input id="sim-mass" type="number" min="10" max="42" step="0.5"></div><div><label for="sim-rpm">Wheel RPM</label><input id="sim-rpm" type="number" min="200" max="1200" step="10"></div></div>
        <p id="sim-footprint" class="hint"></p>
        <h3>Simulated sensors</h3><label for="sim-localization">Localization source</label><select id="sim-localization">${options({ideal:'Ideal (ground truth)',odometry:'Odometry pods + IMU',encoders:'Drive encoders + IMU',gyro:'Gyro only (no X/Y)'},project.sensors.localization)}</select>
        <div class="start-xy"><div><label for="sim-noise">Odometry noise · %</label><input id="sim-noise" type="number" min="0" max="50" step="0.5"></div><div><label for="sim-drift">Gyro drift · °/min</label><input id="sim-drift" type="number" min="0" max="10" step="0.1"></div></div>
        <h3>Follower profile</h3><div class="start-xy"><div><label for="sim-maxspeed">Path speed · 0–1</label><input id="sim-maxspeed" type="number" min="0.1" max="1" step="0.05"></div><div><label for="sim-transp">Translational P</label><input id="sim-transp" type="number" min="0" max="5" step="0.05"></div></div>
        <h3>Robot model</h3><p class="hint">Visual only. Collisions and planning always use the footprint above, not the mesh.</p>
        <div class="button-row"><button id="sim-mesh-open" class="secondary" type="button">Import .glb / .stl / .obj…</button><button id="sim-mesh-remove" class="secondary" type="button">Remove</button></div>
        <div id="sim-mesh-editor" hidden><p id="sim-mesh-name" class="hint"></p><div class="start-xy"><div><label for="sim-mesh-scale">Inches per model unit</label><input id="sim-mesh-scale" type="number" min="0.0001" step="any"></div><div><label for="sim-mesh-dz">Lift · in</label><input id="sim-mesh-dz" type="number" step="0.25"></div></div>
        <div class="start-xy sim-three"><div><label for="sim-mesh-rx">Rot X°</label><input id="sim-mesh-rx" type="number" step="90"></div><div><label for="sim-mesh-ry">Rot Y°</label><input id="sim-mesh-ry" type="number" step="90"></div><div><label for="sim-mesh-rz">Rot Z°</label><input id="sim-mesh-rz" type="number" step="90"></div></div><p id="sim-mesh-size" class="hint"></p></div></div>
    </section></div>`;
  const graph=$('#simulation-field'),robot=$('#field-robot'),canvas=$('#sim-canvas'),overlay=$('#sim-overlay');
  function svg(tag,attributes,text){const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;}
  for(let value=0;value<=144;value+=24){
    if(value>0&&value<144)$('.field-grid').append(svg('path',{d:`M${value} 0V144M0 ${value}H144`}));
    $('.field-labels').append(svg('text',{x:value,y:151,'text-anchor':'middle'},value),svg('text',{x:-4,y:144-value+1.5,'text-anchor':'end'},value));
  }
  $('.field-labels').append(svg('text',{x:72,y:160,'text-anchor':'middle'},'X · inches'),svg('text',{x:-13,y:72,transform:'rotate(-90 -13 72)','text-anchor':'middle'},'Y · inches'));
  const pts=list=>list.map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
  const status=(id,text)=>{$(id).textContent=text;};

  // ------------------------------------------------------------------ engine
  function engineConfig(){return {field:project.field,physics:project.physics,start,robot:project.robot,zones:project.zones,sensors:{...project.sensors,noise:project.sensors.noise},tuning:project.tuning};}
  async function load(){
    if(!native){info=null;draw();return;}
    const seq=(load.seq=(load.seq||0)+1);loading=api.sim('load',engineConfig());
    try{const next=await loading;if(seq!==load.seq)return;info=next;
      const g=geometry();try{field.validate(start,g);}catch{start=field.constrain(start,g);preview={...start};}
      if(!planner.safePose(start,info.fieldZones,info.footprint,info.bounds))status('#start-status','The starting footprint overlaps a field element. Place the robot somewhere clear.');
      await api.sim('start',start);inputs();robotPanel();draw();view3d?.setField(info,project);
    }catch(e){if(seq===load.seq)status('#sim-run-status',e.message);}finally{if(seq===load.seq)loading=null;}
  }
  const reload=(()=>{let t;return ()=>{clearTimeout(t);t=setTimeout(()=>void load(),150);};})();
  function call(method,...args){if(!native)return Promise.reject(Error('Physics runs in the installed driver station app.'));return (loading||Promise.resolve()).then(()=>info?null:load()).then(()=>api.sim(method,...args));}
  if(native)api.onSim(message=>{
    if(!active)return;
    if(message.type==='frame'){frame=message;if(message.world)trailPoint(message);dirty=true;schedule();telemetry();return;}
    if(message.type==='run')runEvent(message);
    else if(message.type==='log'){logLines.push(...message.lines);logLines=logLines.slice(-200);$('#sim-log').textContent=logLines.join('\n');}
    else if(message.type==='host-exit'){info=null;frame=null;runState='idle';if(message.error)status('#sim-run-status',message.error);transport();}
  });
  function trailPoint(f){let last=trail.at(-1);const t=f.truth;if(last&&Math.hypot(last.x-t.x,last.y-t.y)>12){trail=[];last=null;}if(!last||Math.hypot(last.x-t.x,last.y-t.y)>.4||(f.estimate&&!last.e))trail.push({x:t.x,y:t.y,e:f.estimate?{x:f.estimate.x,y:f.estimate.y}:null});if(trail.length>3000)trail.splice(0,1000);}
  function runEvent(m){
    const err=$('#sim-error');
    if(m.state==='starting'){runState='starting';trail=[];logLines=[];$('#sim-log').textContent='';err.hidden=true;status('#sim-run-status',m.kind==='source'?'Compiling and starting the Java program…':'Starting Pedro Pathing…');}
    else if(m.state==='running'){runState='running';status('#sim-run-status',`Running ${m.program.replace(/^deck\.sim\./,'')} with Pedro Pathing.`);}
    else if(m.state==='finished'){runState='idle';const r=m.result,last=project.pins.at(-1);let text=`Finished in ${r.time.toFixed(2)} s simulation time.`;
      if(last&&m.result.kind==='route')text+=` Final position error ${Math.hypot(r.truth.x-last.x,r.truth.y-last.y).toFixed(2)} in (ground truth).`;
      if(r.estimate)text+=` Estimate was off by ${Math.hypot(r.truth.x-r.estimate.x,r.truth.y-r.estimate.y).toFixed(2)} in.`;
      text+=r.violations.length?` The robot touched ${r.violations.length} no-go zone${r.violations.length>1?'s':''}.`:' No no-go zone was touched.';status('#sim-run-status',text);}
    else if(m.state==='error'){runState='idle';status('#sim-run-status','The program stopped.');err.hidden=false;err.replaceChildren(Object.assign(document.createElement('p'),{textContent:m.error}),...(m.trace?.length?[Object.assign(document.createElement('pre'),{textContent:m.trace.join('\n')})]:[]));selectTab('run');}
    else if(m.state==='stopped'){runState='idle';status('#sim-run-status','Stopped. The robot was commanded to stop.');}
    else if(m.state==='reset'){runState='idle';trail=[];status('#sim-run-status','Reset to the starting pose.');}
    transport();
  }

  // ------------------------------------------------------------------ drawing
  function schedule(){if(active&&!schedule.pending){schedule.pending=true;requestAnimationFrame(()=>{schedule.pending=false;if(dirty)paint();});}}
  function paint(){dirty=false;if(project.view==='3d'&&view3d){view3d.update(frame,state3d());return;}paintCanvas();}
  function paintCanvas(){
    const rect=graph.getBoundingClientRect(),dpr=devicePixelRatio||1,w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const ctx=canvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
    const view=window.DeckDsimView;if(!frame?.world||!view)return;
    const m=graph.getScreenCTM();if(!m)return;const e=m.e-rect.left,f=m.f-rect.top;
    // The empty field's floor is painted here, under DSIM's robot sprite.
    if(project.field==='empty'){ctx.setTransform(m.a*dpr,m.b*dpr,m.c*dpr,m.d*dpr,e*dpr,f*dpr);ctx.fillStyle=getComputedStyle(graph).getPropertyValue('--surface')||'#fff';ctx.fillRect(0,0,144,144);}
    // DSIM is centred (+y up); the graph is bottom-left with y down: graph = (x+72, 72-y).
    ctx.setTransform(m.a*dpr,m.b*dpr,-m.c*dpr,-m.d*dpr,(72*m.a+72*m.c+e)*dpr,(72*m.b+72*m.d+f)*dpr);
    try{view.draw2d(ctx,frame.world,project.field!=='empty');}catch(err){console.warn('DSIM 2D draw failed',err);}
  }
  function draw(){
    const g=geometry(),fp=g.footprint,dsim=native&&info;
    graph.dataset.field=project.field;graph.dataset.native=String(!!dsim);graph.dataset.placing=String(tool==='start'&&active);graph.dataset.tool=tool;
    robot.querySelector('rect').setAttribute('x',-fp.rear);robot.querySelector('rect').setAttribute('y',-fp.half);robot.querySelector('rect').setAttribute('width',fp.front+fp.rear);robot.querySelector('rect').setAttribute('height',2*fp.half);
    robot.setAttribute('transform',`translate(${preview.x} ${144-preview.y}) rotate(${-preview.heading})`);
    robot.classList.toggle('ghost',!!(dsim&&frame&&tool!=='start'));
    $('#field-coordinates').textContent=`X ${field.round(preview.x)} in · Y ${field.round(preview.y)} in · ${field.round(preview.heading)}°`;
    $('#field-help').textContent={start:'Move the pointer, then click to place. On touch, drag or tap. Arrow keys move 1 inch; Enter places; Escape cancels.',select:'Click a zone or pin to select it. Drag to move. Delete removes it; [ and ] rotate a zone.',drive:native?'Drive with W A S D (or arrow keys), Q / E to turn, Shift for precision, F for field-centric. Controller 1 also drives while this tool is on.':'Driving needs the installed app.',rect:'Drag to draw a rectangle no-go zone.',circle:'Drag from the centre to draw a circular no-go zone.',triangle:'Drag to draw a triangular no-go zone.',pin:'Click to add the next waypoint pin.'}[tool];
    $('#start-place').disabled=tool==='start';
    for(const b of $$('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));
    // Field elements from DSIM's own collider set (what the robot physically hits).
    $('#sim-field-zones').replaceChildren(...(info?.fieldZones||[]).map(z=>svg('polygon',{class:'sim-field-zone',points:pts(planner.polygon(z))})));
    $('#sim-zones').replaceChildren(...project.zones.map(z=>{const p=svg('polygon',{class:'sim-zone'+(selected?.kind==='zone'&&selected.id===z.id?' selected':'')+(frame?.hit?.includes(z.id)?' hit':''),points:pts(planner.polygon(z)),'data-zone':z.id});return p;}));
    const route=project.route;$('#sim-route').replaceChildren(...(route?[svg('polyline',{class:'sim-path',points:pts(route.samples)})]:[]));
    $('#sim-pins').replaceChildren(...project.pins.map((p,i)=>{const g=svg('g',{class:'sim-pin'+(selected?.kind==='pin'&&selected.index===i?' selected':''),transform:`translate(${p.x} ${p.y})`,'data-pin':i});g.append(svg('circle',{r:2.6}),svg('text',{y:1.1,transform:'scale(1 -1)','text-anchor':'middle'},i+1));return g;}));
    const truth=trail.map(t=>t),est=trail.filter(t=>t.e).map(t=>t.e);
    $('#sim-trail').replaceChildren(...(truth.length>1?[svg('polyline',{class:'sim-trail',points:pts(truth)})]:[]),...(est.length>1?[svg('polyline',{class:'sim-trail estimate',points:pts(est)})]:[]));
    const estimate=frame?.estimate;$('#sim-estimate').setAttribute('points',estimate?pts(planner.body(estimate,fp)):'');
    const c=frame?.follower?.closest,target=$('#sim-target');target.setAttribute('cx',c?c.x:-99);target.setAttribute('cy',c?c.y:-99);
    $('#sim-subtitle').textContent=`${FIELDS[project.field]} · ${info?`${(info.bounds.x1-info.bounds.x0).toFixed(1)} in inside the walls`:'144 × 144 inches'}${info?.physics==='3d'?' · Rapier 3D physics':native?' · planar physics':''}`;
    dirty=true;schedule();
  }
  function inputs(){for(const key of ['x','y','heading'])$('#start-'+key).value=String(field.round(start[key]));}
  function telemetry(){
    const now=performance.now();if(now-(telemetry.at||0)<100)return;telemetry.at=now;
    const f=frame,rows=[];if(!f){$('#sim-telemetry').replaceChildren();return;}
    const t=f.truth,e=f.estimate,fl=f.follower,r=v=>v.toFixed(1),add=(k,v,cls)=>rows.push([k,v,cls]);
    add('Sim time',`${f.time.toFixed(2)} s${f.playing?'':' · paused'}${f.speed!==1?` · ${f.speed}×`:''}`);
    add('Truth',`${r(t.x)}, ${r(t.y)} in · ${r(((t.heading%360)+360)%360)}° · ${r(Math.hypot(t.vx,t.vy))} in/s`);
    if(e)add('Estimate',`${r(e.x)}, ${r(e.y)} in · error ${Math.hypot(e.x-t.x,e.y-t.y).toFixed(2)} in, ${Math.abs(((e.heading-t.heading+540)%360)-180).toFixed(1)}°`);
    add('Mode',{idle:'Idle',manual:'Manual drive',program:'Pedro Pathing'}[f.mode]+(fl?` · ${fl.mode.toLowerCase()}${fl.pathIndex>=0?` · path ${fl.pathIndex+1}`:''}${finite(fl.remaining)?` · ${r(fl.remaining)} in left`:''}`:''));
    add('Command',`fwd ${f.command.forward.toFixed(2)} · strafe ${f.command.strafe.toFixed(2)} · turn ${f.command.turn.toFixed(2)}`);
    if(info?.physics==='3d')add('Height',`${t.z.toFixed(2)} in`);
    add('No-go zones',f.hit.length?`Touching ${f.hit.length}`:f.violations.length?`Touched ${f.violations.length} this run`:'Clear',f.hit.length||f.violations.length?'warn':'');
    for(const [k,v] of Object.entries(f.telemetry||{}).slice(0,8))add(k,v);
    $('#sim-telemetry').replaceChildren(...rows.flatMap(([k,v,cls])=>[Object.assign(document.createElement('dt'),{textContent:k}),Object.assign(document.createElement('dd'),{textContent:v,className:cls||''})]));
    $('#sim-mode').textContent=!native?'Preview only':runState==='running'?'Autonomous':f.mode==='manual'?'Driving':f.playing?'Running':'Paused';
    if(project.view!=='3d')draw();transport();
  }
  function transport(){
    const playing=!!frame?.playing;$('#sim-play').textContent=playing?'Pause':'Play';
    for(const id of ['#sim-play','#sim-stop','#sim-reset','#sim-speed','#sim-run'])$(id).disabled=!native;
    $('#sim-run').disabled=!native||runState==='starting';
  }

  // ------------------------------------------------------------------ editing
  function changed(what){
    if(['zones','pins','start','robot','field'].includes(what)){project.route=null;planSeq++;status('#sim-plan-status',project.pins.length?'Plan the route again after changes.':'');}
    save();draw();if(what==='zones'&&native&&info)void api.sim('zones',project.zones).catch(()=>{});zonePanel();pinPanel();
  }
  function commit(pose){
    const g=geometry();start=field.validate(pose,g);
    if(info&&!planner.safePose(start,info.fieldZones,info.footprint,info.bounds)){start=project.start||start;throw Error('That footprint overlaps a field element. Choose a clear position.');}
    preview={...start};tool='select';pointer=null;inputs();project.start=start;
    let saved=save();try{localStorage.setItem(field.KEY,field.serialize(start,g));}catch{saved=false;}
    status('#start-status',saved?'Starting pose saved.':'Starting pose set for this session. Device storage is unavailable.');
    changed('start');if(native&&info)void api.sim('start',start).catch(e=>status('#start-status',e.message));
  }
  function toField(event){const m=graph.getScreenCTM();if(!m)return null;const p=graph.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const l=p.matrixTransform(m.inverse());return {x:l.x,y:144-l.y};}
  function hit(p){
    for(let i=project.pins.length-1;i>=0;i--)if(Math.hypot(project.pins[i].x-p.x,project.pins[i].y-p.y)<=3)return {kind:'pin',index:i};
    for(let i=project.zones.length-1;i>=0;i--){const z=project.zones[i];if(planner.contains(p,planner.polygon(z)))return {kind:'zone',id:z.id};}
    return null;
  }
  const zoneById=id=>project.zones.find(z=>z.id===id);
  function draftZone(a,b){
    if(tool==='circle')return {id:'zone-'+Date.now().toString(36),type:'circle',x:a.x,y:a.y,radius:Math.max(.25,Math.hypot(b.x-a.x,b.y-a.y))};
    return {id:'zone-'+Date.now().toString(36),type:tool,x:(a.x+b.x)/2,y:(a.y+b.y)/2,width:Math.max(.5,Math.abs(b.x-a.x)),height:Math.max(.5,Math.abs(b.y-a.y)),angle:0};
  }
  function showDraft(z){
    const d=$('#sim-draft');$('#sim-draft-poly')?.remove();if(!z){d.setAttribute('x',-99);d.setAttribute('width',0);return;}
    const poly=planner.polygon(z),xs=poly.map(p=>p.x),ys=poly.map(p=>p.y);
    if(z.type==='rect'){d.setAttribute('x',Math.min(...xs));d.setAttribute('y',Math.min(...ys));d.setAttribute('width',Math.max(...xs)-Math.min(...xs));d.setAttribute('height',Math.max(...ys)-Math.min(...ys));}
    else{d.setAttribute('width',0);overlay.append(svg('polygon',{id:'sim-draft-poly',class:'sim-zone draft',points:pts(poly)}));}
  }
  graph.addEventListener('pointermove',event=>{
    if(!active)return;const p=toField(event);if(!p)return;
    if(tool==='start'&&(event.pointerType!=='touch'||pointer===event.pointerId)){preview=field.fromGraph(p.x,144-p.y,preview.heading,geometry());draw();return;}
    if(drag?.kind==='draw'){drag.zone=draftZone(drag.from,p);showDraft(drag.zone);return;}
    if(drag?.kind==='zone'){const z=zoneById(drag.id);if(z){z.x=drag.x+p.x-drag.from.x;z.y=drag.y+p.y-drag.from.y;drag.moved=true;draw();}return;}
    if(drag?.kind==='pin'){const q=project.pins[drag.index];q.x=p.x;q.y=p.y;drag.moved=true;draw();return;}
    $('#field-coordinates').textContent=`X ${field.round(p.x)} in · Y ${field.round(p.y)} in`;
  });
  graph.addEventListener('pointerdown',event=>{
    if(!active||event.button!==0)return;const p=toField(event);if(!p)return;event.preventDefault();graph.focus();pointer=event.pointerId;graph.setPointerCapture(event.pointerId);
    if(tool==='start'){preview=field.fromGraph(p.x,144-p.y,preview.heading,geometry());draw();return;}
    if(['rect','circle','triangle'].includes(tool)){drag={kind:'draw',from:p,zone:null};return;}
    if(tool==='pin'){if(project.pins.length>=32)return status('#sim-plan-status','Use at most 32 pins.');project.pins.push({x:field.round(p.x),y:field.round(p.y)});selected={kind:'pin',index:project.pins.length-1};changed('pins');return;}
    if(tool==='select'){selected=hit(p);if(selected?.kind==='zone'){const z=zoneById(selected.id);drag={kind:'zone',id:z.id,from:p,x:z.x,y:z.y};selectTab('plan');}else if(selected?.kind==='pin'){drag={kind:'pin',index:selected.index};selectTab('plan');}draw();zonePanel();pinPanel();}
  });
  graph.addEventListener('pointerup',event=>{
    if(!active||pointer!==event.pointerId)return;pointer=null;
    if(tool==='start'){const p=toField(event);if(p)preview=field.fromGraph(p.x,144-p.y,preview.heading,geometry());try{commit(preview);}catch(e){status('#start-status',e.message);preview={...start};tool='start';draw();}return;}
    if(drag?.kind==='draw'){const z=drag.zone;drag=null;showDraft(null);if(z&&(z.type==='circle'?z.radius>=.75:z.width>=1&&z.height>=1)){if(project.zones.length>=24){status('#sim-plan-status','Use at most 24 zones.');}else{project.zones.push(planner.validateZone(z));selected={kind:'zone',id:z.id};selectTab('plan');changed('zones');}}return;}
    if(drag){const moved=drag.moved,kind=drag.kind;drag=null;if(moved)changed(kind==='zone'?'zones':'pins');}
  });
  graph.addEventListener('pointercancel',()=>{pointer=null;drag=null;showDraft(null);preview={...start};draw();});
  function driveKeys(){
    const k=c=>keys.has(c)?1:0,x=k('KeyD')+k('ArrowRight')-k('KeyA')-k('ArrowLeft'),y=k('KeyW')+k('ArrowUp')-k('KeyS')-k('ArrowDown'),turn=k('KeyE')-k('KeyQ');
    if(native)api.simDrive({enabled:active&&tool==='drive',keyboard:{x,y,turn},fieldCentric:!!driveKeys.fieldCentric,precision:keys.has('ShiftLeft')||keys.has('ShiftRight')});
  }
  graph.addEventListener('keydown',event=>{
    if(!active||event.ctrlKey||event.metaKey||event.altKey)return;
    if(tool==='drive'){if(event.code==='KeyF'&&!event.repeat){driveKeys.fieldCentric=!driveKeys.fieldCentric;status('#sim-run-status',driveKeys.fieldCentric?'Field-centric driving.':'Robot-centric driving.');}
      if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyF'].includes(event.code)){event.preventDefault();keys.add(event.code);driveKeys();}return;}
    if(tool==='start'){
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
      if(delta){event.preventDefault();preview=field.constrain({...preview,x:preview.x+delta[0],y:preview.y+delta[1]},geometry());draw();}
      else if(event.key==='Enter'){event.preventDefault();try{commit(preview);}catch(e){status('#start-status',e.message);}}
      else if(event.key==='Escape'){event.preventDefault();tool='select';preview={...start};draw();}
      return;
    }
    if(event.key==='Escape'){tool='select';drag=null;showDraft(null);draw();return;}
    if(!selected)return;
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();removeSelected();return;}
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
    const target=selected.kind==='zone'?zoneById(selected.id):project.pins[selected.index];if(!target)return;
    if(delta){event.preventDefault();const s=event.shiftKey?.1:1;target.x+=delta[0]*s;target.y+=delta[1]*s;changed(selected.kind==='zone'?'zones':'pins');}
    else if(selected.kind==='zone'&&(event.key==='['||event.key===']')){event.preventDefault();target.angle=((target.angle||0)+(event.key===']'?15:-15)+360)%360;changed('zones');}
  });
  graph.addEventListener('keyup',event=>{if(keys.delete(event.code))driveKeys();});
  graph.addEventListener('blur',()=>{if(keys.size){keys.clear();driveKeys();}});
  function removeSelected(){
    if(selected?.kind==='zone')project.zones=project.zones.filter(z=>z.id!==selected.id);else if(selected?.kind==='pin')project.pins.splice(selected.index,1);else return;
    const kind=selected.kind;selected=null;changed(kind==='zone'?'zones':'pins');
  }
  function setTool(next){if(!native&&next==='drive')return status('#sim-run-status','Driving needs the installed app.');tool=next;keys.clear();driveKeys();if(next==='start')preview={...start};if(next==='drive'&&native)void call('play').catch(e=>status('#sim-run-status',e.message));draw();graph.focus();}
  for(const b of $$('[data-tool]'))b.onclick=()=>setTool(b.dataset.tool);
  function zonePanel(){
    const box=$('#sim-zone-editor'),z=selected?.kind==='zone'&&zoneById(selected.id);box.hidden=!z;if(!z)return;
    const fields=z.type==='circle'?[['x','X'],['y','Y'],['radius','Radius']]:[['x','X'],['y','Y'],['width','Width'],['height','Height'],['angle','Angle °']];
    box.innerHTML=`<h3>${{rect:'Rectangle',circle:'Circle',triangle:'Triangle'}[z.type]} zone</h3><div class="sim-grid">${fields.map(([k,l])=>`<div><label for="zone-${k}">${l}</label><input id="zone-${k}" data-key="${k}" type="number" step="any" value="${field.round(z[k]||0)}"></div>`).join('')}</div><button type="button" class="secondary" id="zone-delete">Delete zone</button>`;
    for(const input of box.querySelectorAll('input'))input.onchange=()=>{const next={...z,[input.dataset.key]:input.valueAsNumber};try{Object.assign(z,planner.validateZone(next));changed('zones');}catch(e){status('#sim-plan-status',e.message);zonePanel();}};
    $('#zone-delete').onclick=removeSelected;
  }
  function pinPanel(){
    const list=$('#sim-pin-list');list.replaceChildren(...project.pins.map((p,i)=>{const li=document.createElement('li');li.className=selected?.kind==='pin'&&selected.index===i?'selected':'';
      li.innerHTML=`<span>Pin ${i+1} · ${field.round(p.x)}, ${field.round(p.y)}</span><button type="button" class="icon-button" data-move="-1" aria-label="Move pin ${i+1} earlier">↑</button><button type="button" class="icon-button" data-move="1" aria-label="Move pin ${i+1} later">↓</button><button type="button" class="icon-button" data-remove aria-label="Remove pin ${i+1}">×</button>`;
      li.querySelector('[data-remove]').onclick=()=>{project.pins.splice(i,1);selected=null;changed('pins');};
      for(const b of li.querySelectorAll('[data-move]'))b.onclick=()=>{const j=i+Number(b.dataset.move);if(j<0||j>=project.pins.length)return;[project.pins[i],project.pins[j]]=[project.pins[j],project.pins[i]];selected={kind:'pin',index:j};changed('pins');};
      return li;}));
    if(!project.pins.length){const li=document.createElement('li');li.className='hint';li.textContent='No pins yet. Choose Pin, then click the field.';list.append(li);}
  }

  // ------------------------------------------------------------------ planning
  let worker=null;
  function planWith(request){
    if(!worker){try{worker=new Worker('simulation-worker.js');}catch{worker=false;}}
    if(worker)return new Promise((resolve,reject)=>{const id=++planWith.id;const done=event=>{if(event.data?.id!==id)return;worker.removeEventListener('message',done);event.data.error?reject(Error(event.data.error)):resolve(event.data.result);};worker.addEventListener('message',done);worker.postMessage({id,...request});});
    // Fallback: plan on this thread if workers are unavailable.
    return script('vendor/planning.js').then(()=>planner.plan(request.project,request.footprint,request.fieldZones,request.field));
  }
  planWith.id=0;
  async function plan(){
    const seq=++planSeq,g=geometry();status('#sim-plan-status','Planning…');
    try{const route=await planWith({project:{start,zones:project.zones,pins:project.pins,clearance:project.clearance,smooth:project.smooth},footprint:g.footprint,fieldZones:info?.fieldZones||[],field:g.bounds});
      if(seq!==planSeq)return;project.route=route;save();draw();status('#sim-plan-status',`Route: ${route.length.toFixed(1)} in through ${route.pins} pin${route.pins>1?'s':''}, ${route.segments.length} segment${route.segments.length>1?'s':''}. Every point keeps the footprint clear by at least ${(route.clearance/2).toFixed(2)} in.`);return route;
    }catch(e){if(seq===planSeq){project.route=null;draw();status('#sim-plan-status',e.message);}return null;}
  }
  $('#sim-plan').onclick=()=>void plan();
  $('#sim-clearance').onchange=e=>{project.clearance=Math.min(6,Math.max(planner.MIN_CLEARANCE,e.target.valueAsNumber||2));e.target.value=project.clearance;changed('zones');};
  $('#sim-smooth').onchange=e=>{project.smooth=e.target.checked;changed('zones');};
  $('#sim-clear-pins').onclick=()=>{project.pins=[];selected=null;changed('pins');};
  $('#sim-clear-zones').onclick=()=>{project.zones=[];selected=null;changed('zones');};

  // ------------------------------------------------------------------ run
  function programPanel(){for(const b of $$('[data-program]'))b.setAttribute('aria-pressed',String(b.dataset.program===project.program.kind));$('#sim-source-box').hidden=project.program.kind!=='source';$('#sim-source').value=project.program.source;$('#sim-source-name').textContent=project.program.name?`Program source · ${project.program.name}`:'Program source';}
  for(const b of $$('[data-program]'))b.onclick=()=>{project.program.kind=b.dataset.program;save();programPanel();};
  $('#sim-source').oninput=e=>{project.program.source=e.target.value;save();};
  $('#sim-java-example').onclick=()=>{project.program={kind:'source',name:'OutAndBack.java',source:EXAMPLE};save();programPanel();};
  $('#sim-java-open').onclick=async()=>{try{const file=await api.simFile('java-open');if(file){project.program={kind:'source',name:file.name,source:file.source};save();programPanel();}}catch(e){status('#sim-run-status',e.message);}};
  $('#sim-run').onclick=async()=>{
    $('#sim-error').hidden=true;status('#sim-run-status','Starting…');runState='starting';transport();
    try{
      let route=project.route;if(project.program.kind==='route'&&!route){route=await plan();if(!route)return;}
      const payload={kind:project.program.kind,source:project.program.kind==='source'?project.program.source:undefined,route:route?{heading:route.heading,segments:route.segments,pins:project.pins}:undefined};
      trail=[];setTool('select');const r=await call('run',payload);if(!r.ok&&r.error!=='Stopped.')status('#sim-run-status',r.error);
    }catch(e){status('#sim-run-status',e.message);}
  };
  $('#sim-play').onclick=()=>void call(frame?.playing?'pause':'play').catch(e=>status('#sim-run-status',e.message));
  $('#sim-stop').onclick=()=>{keys.clear();driveKeys();void call('stop').catch(e=>status('#sim-run-status',e.message));};
  $('#sim-reset').onclick=()=>{keys.clear();driveKeys();trail=[];void call('reset').catch(e=>status('#sim-run-status',e.message));};
  $('#sim-speed').onchange=e=>void call('speed',Number(e.target.value)).catch(()=>{});

  // ------------------------------------------------------------------ robot, sensors, model
  function robotPanel(){
    const r=project.robot;$('#sim-drivetrain').value=r.drivetrain;$('#sim-intake').value=r.intake;$('#sim-length').value=r.length;$('#sim-width').value=r.width;$('#sim-mass').value=r.massLb;$('#sim-rpm').value=r.driveRpm;
    $('#sim-localization').value=project.sensors.localization;$('#sim-noise').value=+(project.sensors.noise*100).toFixed(2);$('#sim-drift').value=project.sensors.gyroDrift;
    $('#sim-maxspeed').value=project.tuning.maxPathSpeed??.6;$('#sim-transp').value=project.tuning.translationalP??(info?.tuning.translationalP||.5);
    const f=geometry().footprint;let text=`Collision footprint: ${f.front.toFixed(2)} in front, ${f.rear.toFixed(2)} in rear, ${f.half.toFixed(2)} in each side of centre.`;
    if(info){const e=info.robot,d=info.drive;text+=` DSIM applied ${e.length} × ${e.width} in, ${e.massLb} lb, ${e.driveRpm} RPM: ${d.maxSpeed.toFixed(0)} in/s forward, ${d.maxStrafe.toFixed(0)} in/s strafe. Measured braking: ${info.tuning.forwardDeceleration.toFixed(0)} in/s².`;}
    $('#sim-footprint').textContent=text;$('#sim-clearance').value=project.clearance;$('#sim-smooth').checked=project.smooth;
  }
  const num=(id,set)=>{$(id).onchange=e=>{const v=e.target.valueAsNumber;if(!finite(v))return robotPanel();set(v);project=sanitize({...project,start});save();changed('robot');reload();};};
  $('#sim-drivetrain').onchange=e=>{project.robot.drivetrain=e.target.value;save();changed('robot');reload();};
  $('#sim-intake').onchange=e=>{project.robot.intake=e.target.value;save();changed('robot');reload();};
  num('#sim-length',v=>project.robot.length=v);num('#sim-width',v=>project.robot.width=v);num('#sim-mass',v=>project.robot.massLb=v);num('#sim-rpm',v=>project.robot.driveRpm=v);
  num('#sim-noise',v=>project.sensors.noise=v/100);num('#sim-drift',v=>project.sensors.gyroDrift=v);
  num('#sim-maxspeed',v=>project.tuning.maxPathSpeed=Math.min(1,Math.max(.1,v)));num('#sim-transp',v=>project.tuning.translationalP=Math.min(5,Math.max(0,v)));
  $('#sim-localization').onchange=e=>{project.sensors.localization=e.target.value;save();reload();};
  function meshPanel(){
    const m=project.mesh;$('#sim-mesh-editor').hidden=!m;$('#sim-mesh-remove').disabled=!m;if(!m)return;
    $('#sim-mesh-name').textContent=`${m.name} (${m.format.toUpperCase()}) · shown in the 3D view only.`;
    for(const [id,k] of [['#sim-mesh-scale','scale'],['#sim-mesh-dz','dz'],['#sim-mesh-rx','rx'],['#sim-mesh-ry','ry'],['#sim-mesh-rz','rz']]){$(id).value=m[k];$(id).onchange=e=>{const v=e.target.valueAsNumber;if(finite(v)&&(k!=='scale'||v>0)){m[k]=v;save();view3d?.setMesh(meshData,m);}};}
  }
  async function loadMesh(){if(!project.mesh||!native){meshData=null;return;}if(meshData?.id===project.mesh.id)return;try{meshData=await api.simFile('mesh-read',project.mesh.id);}catch{meshData=null;}}
  $('#sim-mesh-open').onclick=async()=>{try{const m=await api.simFile('mesh-open');if(!m)return;meshData=m;project.mesh={id:m.id,name:m.name,format:m.format,scale:m.format==='stl'?.03937:1,rx:m.format==='glb'||m.format==='gltf'?90:0,ry:0,rz:0,dz:0};save();meshPanel();setView('3d');view3d?.setMesh(meshData,project.mesh);}catch(e){status('#sim-run-status',e.message);selectTab('run');}};
  $('#sim-mesh-remove').onclick=()=>{project.mesh=null;meshData=null;save();meshPanel();view3d?.setMesh(null,null);};

  // ------------------------------------------------------------------ project files
  $('#sim-save').onclick=async()=>{
    try{const data={...project,start};if(project.mesh&&meshData?.bytes){let s='';const b=meshData.bytes;for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));data.meshData=btoa(s);}
      const r=await api.simFile('project-save',JSON.stringify({deckSimulation:1,...data}));if(r)status('#start-status',`Saved ${r.name}.`);}catch(e){status('#start-status',e.message);}
  };
  $('#sim-open').onclick=async()=>{
    try{const file=await api.simFile('project-open');if(!file)return;const raw=JSON.parse(file.text);if(raw?.deckSimulation!==1)throw Error('That file is not a Deck simulation project.');
      const next=sanitize(raw);if(raw.meshData&&typeof raw.meshData==='string'&&raw.mesh?.name){const bin=atob(raw.meshData),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const m=await api.simFile('mesh-store',{name:raw.mesh.name,bytes});next.mesh={...(next.mesh||{}),...raw.mesh,id:m.id,format:m.format,name:m.name};meshData=m;}
      project=next;start=project.start||field.edgePose(0,geometry());preview={...start};selected=null;trail=[];save();
      $('#sim-field').value=project.field;refreshAll();await load();status('#start-status',`Opened ${file.name}.`);}catch(e){status('#start-status',e.message);}
  };

  // ------------------------------------------------------------------ views
  function script(src){return script.cache[src]||(script.cache[src]=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error(`Could not load ${src}.`));document.head.append(s);}));}
  script.cache={};
  function state3d(){return {project,start,info,trail,selected};}
  async function setView(next){
    project.view=next;save();for(const b of $$('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===next));
    const three=next==='3d';$('#sim-3d').hidden=!three;graph.style.display=three?'none':'';canvas.hidden=three;$('.sim-tools').classList.toggle('three',three);
    if(three){if(!['select','drive'].includes(tool))tool='select';try{await script('vendor/dsim-view.js');await script('sim-3d.js');await loadMesh();if(!view3d){view3d=window.DeckSim3D.create($('#sim-3d'),{native});$('#sim-3d').addEventListener('meshsize',e=>{const d=e.detail;$('#sim-mesh-size').textContent=`Model size after scale: ${d.x.toFixed(1)} × ${d.y.toFixed(1)} × ${d.z.toFixed(1)} in. Collision footprint is unchanged.`;});}view3d.setField(info,project);view3d.setMesh(meshData,project.mesh);view3d.resize();}catch(e){status('#sim-run-status',e.message);}}
    draw();
  }
  for(const b of $$('[data-view]'))b.onclick=()=>void setView(b.dataset.view);
  function selectTab(name){for(const b of $$('[data-tab]'))b.setAttribute('aria-selected',String(b.dataset.tab===name));for(const p of $$('[data-panel]'))p.hidden=p.dataset.panel!==name;}
  for(const b of $$('[data-tab]'))b.onclick=()=>selectTab(b.dataset.tab);
  $('#sim-field').onchange=e=>{project.field=e.target.value;trail=[];frame=null;save();changed('field');view3d?.setField(null,project);void load();};
  $('#start-form').addEventListener('submit',event=>{event.preventDefault();try{commit(Object.fromEntries(['x','y','heading'].map(key=>[key,$('#start-'+key).valueAsNumber])));}catch(error){status('#start-status',error.message);}});
  $('#start-place').onclick=()=>{preview={...start};tool='start';status('#start-status','Choose a starting position.');draw();graph.focus();};
  $('#start-edge').onclick=()=>{preview=field.edgePose(start.heading,geometry());tool='start';pointer=null;status('#start-status','Preview starts against the left wall. Move and click to place, or press Enter to use the edge.');draw();graph.focus();};
  addEventListener('resize',()=>{dirty=true;schedule();view3d?.resize();});
  function refreshAll(){inputs();robotPanel();programPanel();meshPanel();zonePanel();pinPanel();for(const b of $$('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===project.view));draw();transport();}
  selectTab('setup');refreshAll();
  if(native)void script('vendor/dsim-view.js').then(()=>{dirty=true;schedule();}).catch(()=>{});
  return {activate(value){
    if(active&&!value){pointer=null;drag=null;keys.clear();status('#sim-run-status',runState==='running'?'Simulation closed. The running program was stopped.':'');if(native)api.simDrive({enabled:false});if(tool==='start')preview={...start};frame=null;info=null;runState='idle';trail=[];draw();}
    const was=active;active=value;
    if(value&&!was){if(!project.start)tool='start';draw();void load().then(()=>{if(project.view==='3d')void setView('3d');});}
  }};
}};
