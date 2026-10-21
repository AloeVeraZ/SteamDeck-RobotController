/* Offline path-planning simulator. The physics engine and path follower run in the app's
   simulation process; this view edits the setup, plans routes in a worker and draws everything
   itself. Real robot configuration and localization stay on the robot: nothing here is sent to one. */
window.DeckSimulation={create(root){
  'use strict';
  const field=window.DeckField,planner=window.DeckPlanner,exporter=window.DeckSimExport,api=window.deck||{},native=typeof api.sim==='function';
  // Bundled chassis CAD present in this build (personal local builds only); see appearanceOptions().
  let builtins=new Set(['strafer','swechanum']);
  const $=selector=>root.querySelector(selector),$$=selector=>[...root.querySelectorAll(selector)],ns='http://www.w3.org/2000/svg';
  const KEY='deck-simulation-project-v2',OLD_KEY='deck-simulation-project-v1',finite=n=>typeof n==='number'&&Number.isFinite(n);
  const C=window.DeckSimConfig,GAMES={empty:'Empty field',decode:'DECODE',biobuzz:'BIOBUZZ'},STYLES={spline:'Smooth curves',rounded:'Rounded corners',sharp:'Straight lines'};
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
  const ROBOT=C.robot();
  const TIMED_FIELDS=[['#sim-timed-power','power'],['#sim-timed-forward','forwardSpeed'],['#sim-timed-strafe','strafeSpeed'],['#sim-timed-startup','startup'],['#sim-timed-stopping','stopping'],['#sim-timed-strafe-stopping','strafeStopping'],['#sim-timed-heading','headingP']];
  const newId=()=>'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const layout=(game,name)=>({id:newId(),name,field:game,width:144,height:144,elements:true,start:null,zones:[],pins:[],clearance:2,style:'spline',rotate:true,route:null,tested:null});
  function defaults(){const layouts=[layout('empty','Empty field 1'),layout('decode','DECODE'),layout('biobuzz','BIOBUZZ')];
    return {version:2,setupId:newId(),setupName:'Setup 1',setups:[],controller:'ftc',imuSource:'hub',ftcSensors:null,motionSensors:null,timing:window.DeckTimed.settings(),orientations:{},hitboxes:false,robot:{...ROBOT},sensors:{localization:'encoders',gyroDrift:.5,noise:.05},tuning:{},practice:{mode:'autonomous',autoSeconds:30,transitionSeconds:8,teleopSeconds:120},program:{kind:'route',name:'',source:EXAMPLE},model:null,view:'2d',layouts,active:layouts[0].id,export:{packageName:'org.firstinspires.ftc.teamcode',className:'PlannedRoute',keep:false}};}
  function cleanLayout(raw){
    const l=layout(Object.hasOwn(GAMES,raw?.field)?raw.field:'empty',String(raw?.name||'Field').slice(0,40));if(typeof raw?.id==='string'&&/^[\w-]{1,40}$/.test(raw.id))l.id=raw.id;
    const b=C.bounds({...raw,field:l.field});l.width=b.x1;l.height=b.y1;l.elements=raw?.elements!==false;
    if(raw?.start&&[raw.start.x,raw.start.y,raw.start.heading].every(finite))l.start={x:raw.start.x,y:raw.start.y,heading:field.heading(raw.start.heading)};
    if(Array.isArray(raw?.zones))l.zones=raw.zones.slice(0,24).map((z,i)=>{try{return planner.validateZone({...z,id:z.id||'zone-'+i});}catch{return null;}}).filter(Boolean);
    if(Array.isArray(raw?.pins))l.pins=raw.pins.slice(0,32).filter(q=>q&&finite(q.x)&&finite(q.y)).map(q=>({x:q.x,y:q.y,...planner.pinEffects(q)}));
    if(finite(raw?.clearance))l.clearance=Math.min(6,Math.max(planner.MIN_CLEARANCE,raw.clearance));if(Object.hasOwn(STYLES,raw?.style))l.style=raw.style;l.rotate=raw?.rotate!==false;
    if(raw?.route&&Array.isArray(raw.route.segments)&&Array.isArray(raw.route.samples)&&Array.isArray(raw.route.stops))l.route=raw.route;if(Array.isArray(raw?.tested))l.tested=raw.tested.slice(0,6);
    return l;
  }
  function sanitize(raw){
    const p=defaults();if(!raw||typeof raw!=='object')return p;
    if(raw.version!==2&&raw.field){const old=cleanLayout({...raw,name:raw.field==='empty'?'Empty field 1':GAMES[raw.field],style:raw.smooth===false?'sharp':'spline'});p.layouts=p.layouts.map(l=>l.field===old.field?{...old,id:l.id}:l);}
    else if(Array.isArray(raw.layouts)&&raw.layouts.length)p.layouts=raw.layouts.slice(0,20).map(cleanLayout);
    p.active=p.layouts.some(l=>l.id===raw.active)?raw.active:p.layouts[0].id;if(raw.view==='3d')p.view='3d';
    p.robot=C.robot(raw.robot);if(raw.model)p.robot.appearance='custom';else if(p.robot.appearance==='swechanum'&&p.robot.drivetrain==='mecanum')p.robot.drivetrain='swerve';
    const s=raw.sensors||{},legacy={none:'gyro',encodersOnly:'encoders',ideal:'odometry',vision:'odometry'};if(Object.hasOwn(C.sensors,s.localization))p.sensors.localization=legacy[s.localization]||s.localization;if(finite(s.gyroDrift))p.sensors.gyroDrift=Math.min(10,Math.max(0,s.gyroDrift));if(finite(s.noise))p.sensors.noise=Math.min(.5,Math.max(0,s.noise));
    p.controller=raw.controller==='motionmodule'?'motionmodule':'ftc';p.imuSource=['hub','external','module','device'].includes(raw.imuSource)?raw.imuSource:p.controller==='motionmodule'?'module':'hub';p.timing=window.DeckTimed.settings(raw.timing);p.ftcSensors=raw.ftcSensors&&typeof raw.ftcSensors==='object'?raw.ftcSensors:null;p.motionSensors=raw.motionSensors&&typeof raw.motionSensors==='object'?raw.motionSensors:null;p.sensors.localization=C.localization(p.controller,p.sensors.localization);
    const t=raw.tuning||{};for(const k of ['maxPathSpeed','translationalP','headingP'])if(finite(t[k]))p.tuning[k]=t[k];
    // 0.6 was the stored default path speed before the simulator chose one per robot; let it choose again.
    if(p.tuning.maxPathSpeed===.6)delete p.tuning.maxPathSpeed;
    const g=raw.program||{};p.program={kind:g.kind==='source'?'source':'route',name:typeof g.name==='string'?g.name.slice(0,120):'',source:typeof g.source==='string'&&g.source.length<=200000?g.source:EXAMPLE};
    p.model=modelMeta(raw.model);
    const e=raw.export||{};p.export={packageName:typeof e.packageName==='string'?e.packageName.slice(0,120):p.export.packageName,className:typeof e.className==='string'?e.className.slice(0,64):p.export.className,keep:!!e.keep};
    p.setupId=typeof raw.setupId==='string'?raw.setupId:p.setupId;p.setupName=String(raw.setupName||'Setup 1').slice(0,40);
    p.setups=Array.isArray(raw.setups)?raw.setups.slice(0,20).filter(s=>s&&typeof s.id==='string'&&typeof s.name==='string'&&s.data&&typeof s.data==='object').map(s=>({id:s.id,name:s.name.slice(0,40),data:s.data})):[];
    p.hitboxes=!!raw.hitboxes;p.orientations={};for(const id of ['strafer','swechanum']){const o=raw.orientations?.[id];if(o&&['+x','-x','+y','-y','+z','-z'].includes(o.front)&&['+x','-x','+y','-y','+z','-z'].includes(o.top)&&o.front[1]!==o.top[1])p.orientations[id]={front:o.front,top:o.top};}
    const practice=raw.practice||{};if(['autonomous','teleop','match'].includes(practice.mode))p.practice.mode=practice.mode;for(const k of ['autoSeconds','transitionSeconds','teleopSeconds'])if(finite(practice[k]))p.practice[k]=Math.min(3600,Math.max(k==='transitionSeconds'?0:.1,practice[k]));
    return p;
  }
  // Model metadata is checked here too, before the 3D module has loaded.
  function modelMeta(raw){
    if(!raw||typeof raw.id!=='string'||!/^[0-9a-f]{32}\.glb$/.test(raw.id))return null;
    const axes=['+x','-x','+y','-y','+z','-z'],front=axes.includes(raw.front)?raw.front:'+x',top=axes.includes(raw.top)?raw.top:'+z';
    return {id:raw.id,name:String(raw.name||'Robot model').slice(0,120),units:['in','mm','cm','m'].includes(raw.units)?raw.units:'in',front,top:front[1]===top[1]?(front[1]==='z'?'+x':'+z'):top,source:raw.source==='step'?'step':'mesh'};
  }
  let project;try{project=sanitize(JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(OLD_KEY)));}catch{project=defaults();}
  let tab='setup',planningStep='start',runAttempt=0,loadError='';
  const L=()=>project.layouts.find(l=>l.id===project.active)||project.layouts[0];
  if(!L().start){try{const legacy=field.restore(localStorage.getItem(field.KEY));if(legacy&&L().field==='empty')L().start=legacy;}catch{}}
  let planError='',blockedPin=-1,sketch=null,cursor=null,info=null,frame=null,selected=null,tool='start',active=false,pointer=null,startGrab={dx:0,dy:0},stroke=null,drag=null,planSeq=0,keys=new Set(),trail=[],loading=null,view3d=null,runState='idle',logLines=[],model=null,modelPreview=null,selectedSide=null,optimizing=false;
  const fallbackFootprint=()=>C.footprint(project.robot);
  const geometry=()=>({footprint:info?.footprint||fallbackFootprint(),bounds:info?.bounds||C.bounds(L())});
  const fieldHeight=()=>L().field==='empty'?L().height:144;
  let start=L().start||field.edgePose(0,geometry()),preview={...start};
  function snapshot(){const {setups,...data}=project;return JSON.parse(JSON.stringify(data));}
  function save(){try{const entry={id:project.setupId,name:project.setupName,data:snapshot()},i=project.setups.findIndex(s=>s.id===entry.id);if(i<0)project.setups.push(entry);else project.setups[i]=entry;localStorage.setItem(KEY,JSON.stringify(project));return true;}catch{return false;}}

  // ------------------------------------------------------------------ markup
  const options=(list,value)=>Object.entries(list).map(([k,v])=>`<option value="${k}"${k===value?' selected':''}>${v}</option>`).join('');
  const segmented=(attr,list,label)=>`<div class="segmented sim-seg" role="group" aria-label="${label}">${Object.entries(list).map(([k,v])=>`<button type="button" data-${attr}="${k}" aria-pressed="false">${v}</button>`).join('')}</div>`;
  root.innerHTML=`<div class="simulation-heading"><div><h1>Simulation</h1><p id="sim-subtitle"></p></div><span class="simulation-mode" id="sim-mode">Offline</span></div>
    <nav class="sim-navigation" aria-label="Autonomous setup"><div class="sim-tabs" role="tablist">${Object.entries({setup:'Setup',plan:'Path planning',run:'Run & review'}).map(([k,t],i)=>`<button type="button" role="tab" data-tab="${k}" id="sim-tab-${k}" aria-controls="sim-panel-${k}"><span>${i+1}</span>${t}</button>`).join('')}</div></nav>
    <div class="sim-setup-bar"><label for="sim-setup">Saved setup</label><select id="sim-setup"></select><button id="sim-setup-new" type="button" class="secondary">New setup</button><button id="sim-setup-rename" type="button" class="icon-button" aria-label="Rename setup">✎</button><button id="sim-setup-delete" type="button" class="icon-button" aria-label="Delete setup">×</button><span class="hint">Saved on this computer</span></div>
    <div class="simulation-layout"><section class="field-area" aria-label="Simulation field">
      <div class="sim-toolbar">
        ${segmented('tool',{select:'Select',rect:'Box',circle:'Circle',triangle:'Triangle',shape:'Shape',pin:'Pin',draw:'Draw path'},'Field tool')}
        <div class="sim-transport"><button type="button" id="sim-play" class="secondary">Play</button><button type="button" id="sim-stop" class="secondary">Stop</button><button type="button" id="sim-reset" class="secondary">Reset</button><button type="button" id="sim-hitboxes" class="secondary" aria-pressed="false" hidden>Hitboxes</button>${segmented('view',{'2d':'2D','3d':'3D'},'View')}</div>
      </div>
      <div class="sim-stage" id="sim-stage">
      <svg id="simulation-field" viewBox="-16 -9 168 172" role="group" tabindex="0" aria-label="Simulation field, inches from the bottom-left corner" aria-describedby="field-help field-coordinates">
        <rect class="field-floor" x="0" y="0" width="144" height="144"/><g class="field-grid"></g><g class="field-labels"></g>
        <g id="sim-overlay" transform="matrix(1 0 0 -1 0 144)"><rect id="sim-walls" class="sim-walls" x="0" y="0" width="144" height="144"/><g id="sim-obstacles"></g><g id="sim-elements"></g><g id="sim-zones"></g><g id="sim-route"></g><g id="sim-trail"></g><g id="sim-pins"></g><polygon id="sim-start" class="sim-start" points=""/><polygon id="sim-estimate" class="sim-estimate" points=""/><circle id="sim-target" class="sim-target" r="1.2" cx="-99" cy="-99"/><g id="sim-draft"></g></g>
        <g id="field-robot"><image id="sim-robot-image" href="" x="0" y="0" width="0" height="0" preserveAspectRatio="none"/><rect x="-9" y="-9" width="18" height="18" rx="1.5"/><path d="M-3 0H5M2-3L5 0 2 3"/></g>
      </svg><div id="sim-3d" class="sim-3d" hidden></div><div id="sim-effects" class="sim-popover" role="dialog" aria-label="Pin and path settings" hidden></div></div>
      <output id="field-coordinates"></output><p id="field-help" class="hint"></p>
      <dl id="sim-telemetry" class="sim-telemetry"></dl>
    </section>
    <section class="start-controls sim-panel" aria-label="Simulation settings">
      <div data-panel="setup" id="sim-panel-setup" role="tabpanel" aria-labelledby="sim-tab-setup"><section class="sim-controller-setup"><h2>Robot controller</h2>${segmented('controller',{ftc:'FTC Control Hub',motionmodule:'MotionModule'},'Robot controller')}<p id="sim-controller-note" class="hint"></p></section><div class="sim-setup-grid"><section class="sim-card sim-field-card">
        <h2>Field</h2><div class="sim-row"><label class="sr-only" for="sim-field">Field</label><select id="sim-field"></select><button type="button" id="sim-layout-rename" class="icon-button" aria-label="Rename this field" title="Rename">✎</button><button type="button" id="sim-layout-delete" class="icon-button" aria-label="Delete this field" title="Delete">×</button></div>
        <p id="sim-field-note" class="hint"></p>
        <div class="start-xy"><div><label for="sim-field-width">Field width · in</label><input id="sim-field-width" type="number" min="1" step="any" data-slider-min="24" data-slider-max="288" data-slider-step="1"></div><div><label for="sim-field-height">Field depth · in</label><input id="sim-field-height" type="number" min="1" step="any" data-slider-min="24" data-slider-max="288" data-slider-step="1"></div></div><p class="hint" id="sim-field-size-note"></p>
        <label class="check"><input id="sim-game-elements" type="checkbox"> Physical game elements</label><p class="hint">Balls and field pieces use the game engine's physics. This is driving practice; robot mechanisms and scoring controls are not included.</p>
        <section id="sim-start-controls"><h2 id="start-title">Starting pose</h2>
        <form id="start-form"><div class="sim-grid3"><div><label for="start-x">X · in</label><input id="start-x" type="number" step="any" required inputmode="decimal" data-slider-min="0" data-slider-max="144" data-slider-step="0.5" data-slider-submit></div><div><label for="start-y">Y · in</label><input id="start-y" type="number" step="any" required inputmode="decimal" data-slider-min="0" data-slider-max="144" data-slider-step="0.5" data-slider-submit></div><div><label for="start-heading">Heading °</label><input id="start-heading" type="number" step="any" required inputmode="decimal" data-slider-min="-180" data-slider-max="180" data-slider-step="1" data-slider-submit></div></div>
        <button class="primary" type="submit">Set starting pose</button></form>
        <div class="button-row"><button id="start-edge" class="secondary" type="button">Start at edge</button></div><p class="hint">Or drag the robot on the field in Path planning → Starting pose.</p>
        <p id="start-status" role="status"></p></section>
        </section><section class="sim-card sim-robot-card"><h2>Robot</h2>
        <div class="start-xy"><div><label for="sim-drivetrain">Drivetrain</label><select id="sim-drivetrain">${options(Object.fromEntries(Object.entries(C.drives).map(([k,v])=>[k,v.name])),project.robot.drivetrain)}</select></div><div><label for="sim-intake">Front intake reach · in</label><input id="sim-intake" type="number" min="0" step="any" data-slider-max="12" data-slider-step="0.25"></div></div><p id="sim-drive-note" class="hint"></p>
        <div class="start-xy"><div><label for="sim-length">Chassis length · in</label><input id="sim-length" type="number" min="0.25" step="any" data-slider-min="4" data-slider-max="48" data-slider-step="0.25"></div><div><label for="sim-width">Chassis width · in</label><input id="sim-width" type="number" min="0.25" step="any" data-slider-min="4" data-slider-max="48" data-slider-step="0.25"></div></div>
        <div class="start-xy"><div><label for="sim-height">Chassis height · in</label><input id="sim-height" type="number" min="0.25" step="any" data-slider-min="1" data-slider-max="36" data-slider-step="0.25"></div><div><label for="sim-mass">Mass · lb</label><input id="sim-mass" type="number" min="0.25" step="any" data-slider-min="1" data-slider-max="60" data-slider-step="0.1"></div></div>
        <div class="start-xy"><div><label for="sim-rpm">Wheel RPM</label><input id="sim-rpm" type="number" min="50" max="6000" step="any" data-slider-step="1"></div><div><label for="sim-amps">Drive current budget · A</label><input id="sim-amps" type="number" min="1" max="40" step="any" data-slider-step="0.5"></div></div><p class="hint">Current budget scales available drive torque around a 20 A reference. This is an approximate drive model, not an electrical circuit simulation.</p>
        <label for="sim-drive-style">Teleop driving style</label><select id="sim-drive-style"><option value="robot">Robot-centric</option><option value="field">Field-centric</option></select><p class="hint">Field-centric: stick up is field +Y. Tank drivetrains turn toward that direction before driving.</p>
        <p id="sim-footprint" class="hint"></p>
        <h3>Your robot</h3>
        <label for="sim-appearance">Robot model</label><select id="sim-appearance">${options({strafer:'goBILDA Strafer · mecanum',swechanum:'NYC FIRST A301 Swechanum · swerve',plain:'Simple footprint',custom:'Your imported model'},project.robot.appearance)}</select><p id="sim-model-credit" class="hint"></p>
        <div id="sim-model-drop" class="sim-drop"><p>Drop your robot's STEP file here (or GLB, STL, OBJ).</p><button id="sim-model-open" class="secondary" type="button">Choose file…</button></div>
        <div id="sim-model-box" hidden><div id="sim-model-preview" class="sim-model-preview"></div>
          <p id="sim-model-help" class="hint">Click a side of the cube, then say what it is.</p>
          <div class="sim-side-assignments">${['front','back','left','right','top','bottom'].map(side=>`<button id="sim-model-${side}" data-assign-side="${side}" class="secondary" type="button" disabled>Make ${side}</button>`).join('')}</div>
          <div id="sim-units-box"><label for="sim-model-units">File units</label><select id="sim-model-units">${options({mm:'Millimetres',cm:'Centimetres',m:'Metres',in:'Inches'},'mm')}</select></div><p id="sim-orientation-summary" class="hint"></p>
          <p id="sim-mesh-size" class="hint"></p><p id="sim-model-status" role="status"></p><button id="sim-model-remove" class="text-button" type="button">Remove model</button></div>
        </section><section class="sim-card sim-advanced-card"><h2>Sensing & physics</h2><label for="sim-imu-source">IMU source</label><select id="sim-imu-source"></select><p id="sim-imu-note" class="hint"></p><label for="sim-localization">Odometry</label><select id="sim-localization">${options(Object.fromEntries(Object.entries(C.sensors).filter(([,v])=>!v.hidden).map(([k,v])=>[k,v.name])),project.sensors.localization)}</select><p id="sim-sensor-note" class="hint"></p><section id="sim-timed-settings"><h3>Timed driving · no position feedback</h3><p class="hint">Translation uses power and elapsed time. The IMU corrects heading only; wheel slip, collisions and speed changes can make the robot miss a pin.</p><div class="sim-grid3"><div><label for="sim-timed-power">Drive power · 0–1</label><input id="sim-timed-power" type="number" min="0.05" max="1" step="0.05"></div><div><label for="sim-timed-forward">Forward at full power · in/s</label><input id="sim-timed-forward" type="number" min="1" max="500" step="any" data-slider-step="1"></div><div><label for="sim-timed-strafe">Strafe at full power · in/s</label><input id="sim-timed-strafe" type="number" min="1" max="500" step="any" data-slider-step="1"></div></div><div class="start-xy"><div><label for="sim-timed-startup">Start compensation · s</label><input id="sim-timed-startup" type="number" min="0" max="3" step="0.01"></div><div><label for="sim-timed-heading">IMU heading correction</label><input id="sim-timed-heading" type="number" min="0" max="10" step="0.1"></div></div><div class="start-xy"><div><label for="sim-timed-stopping">Stop compensation · s</label><input id="sim-timed-stopping" type="number" min="0" max="2" step="0.01"></div><div><label for="sim-timed-strafe-stopping">Strafe stop compensation · s</label><input id="sim-timed-strafe-stopping" type="number" min="0" max="2" step="0.01"></div></div><p class="hint">Stop compensation ends a drive step early by the time the robot keeps rolling after power is cut. Measure on your robot, or start from the simulated robot's values.</p><button id="sim-timed-calibrate" class="secondary" type="button">Use simulated robot's values</button><p id="sim-timed-status" class="hint" role="status"></p></section><section class="sim-advanced"><h3>Advanced settings</h3>

          <div class="start-xy"><div><label for="sim-noise">Odometry noise · %</label><input id="sim-noise" type="number" min="0" max="50" step="0.5"></div><div><label for="sim-drift">Gyro drift · °/min</label><input id="sim-drift" type="number" min="0" max="10" step="0.1"></div></div>
          <div class="start-xy"><div><label for="sim-maxspeed">Path speed · 0–1</label><input id="sim-maxspeed" type="number" min="0.1" max="1" step="0.05"></div><div><label for="sim-transp">Correction strength</label><input id="sim-transp" type="number" min="0" max="5" step="0.05"></div></div>
          <p class="hint">These describe the simulated robot only. Hardware ports, sensors and localizers stay on your robot.</p></section>
        </section></div><div class="button-row sim-project"><button id="sim-open" class="text-button" type="button">Open setup file…</button><button id="sim-save" class="text-button" type="button">Save setup file…</button><button id="sim-setup-next" class="primary" type="button">Next: set up the field →</button></div></div>
      <div data-panel="plan" id="sim-panel-plan" role="tabpanel" aria-labelledby="sim-tab-plan" hidden>
        <div class="sim-planning-steps" role="tablist" aria-label="Planning step"><button id="sim-step-start" role="tab" type="button" class="secondary">1 · Starting pose</button><button id="sim-step-zones" role="tab" type="button" class="secondary">2 · Field obstacles</button><button id="sim-step-pins" role="tab" type="button" class="secondary">3 · Route pins</button></div>
        <div id="sim-start-step"><p class="hint">Drag the robot to where it starts. If you let go over an obstacle it moves to the nearest clear spot. The red rectangle is its collision footprint.</p><button id="start-edge-plan" class="secondary" type="button">Start at edge</button><button id="sim-start-next" class="primary" type="button">Next: field obstacles →</button></div>
        <div id="sim-obstacle-step"><h2>Set up the field</h2><p class="hint">Mark the places your robot must avoid. Game structures are fixed. Your zones are saved with this layout.</p><div id="sim-shape-bar" class="sim-shape-bar" hidden><p id="sim-shape-status" class="hint" role="status"></p><div class="sim-row"><button id="sim-shape-finish" class="primary" type="button">Finish shape</button><button id="sim-shape-undo" class="secondary" type="button">Undo corner</button><button id="sim-shape-cancel" class="text-button" type="button">Cancel</button></div></div><button id="sim-zones-next" class="primary" type="button">Next: place route pins →</button></div>
        <div id="sim-route-step" hidden><h2>Plan your route</h2><p class="hint">Drop pins in order, or choose Draw path and drag the robot's route on the field. Pins tapped in a red area move to the nearest clear spot.</p>
        <p class="hint sim-legend"><span class="sim-key"></span>Regular path <span class="sim-key action"></span>Action path <span aria-hidden="true">↻</span> spins · <span aria-hidden="true">↷</span> turns while driving</p>
        <p class="hint">Right-click a pin or a path, or press and hold it, to set pauses, turns, spins and actions. Mark a path as an action path to run an action while driving, such as intaking or shooting while moving. The simulator plans and drives the movement; each action you name gets its own labeled slot in the exported code for your mechanism code.</p><button id="sim-route-start" class="secondary" type="button">Place starting pose</button>
        <div id="sim-zone-editor" class="sim-editor" hidden></div>
        <ol id="sim-pin-list" class="sim-list"></ol>
        <label>Route shape</label>${segmented('style',STYLES,'Route shape')}
        <label>Turning</label>${segmented('rotate',{auto:'Turn to fit',off:'Keep heading'},'Turning')}<p id="sim-rotate-note" class="hint"></p>
        <div class="start-xy"><div><label for="sim-clearance">Space around zones · in</label><input id="sim-clearance" type="number" min="0.05" max="6" step="0.25" data-slider-step="0.05"></div><div><label>&nbsp;</label><button id="sim-optimize" class="secondary" type="button">Find fastest route</button></div></div>
        <p id="sim-plan-status" role="status"></p><div id="sim-tested" class="sim-tested"></div>
        <div class="button-row"><button id="sim-clear-pins" class="text-button" type="button">Clear pins</button><button id="sim-clear-zones" class="text-button" type="button">Clear zones</button></div>
        <h3>Export the route</h3><div class="button-row"><button id="sim-export-java" class="secondary" type="button">Pedro Java…</button><button id="sim-export-timed" class="secondary" type="button">Timed commands (.json)…</button><button id="sim-export-pp" class="secondary" type="button">Path file (.pp)…</button><button id="sim-export-teamcode" class="secondary" type="button">Control Hub TeamCode…</button><button id="sim-export-motionmodule" class="secondary" type="button">MotionModule autonomous.py…</button></div><p id="sim-execution-note" class="hint"></p>
        <label class="check"><input id="sim-export-keep" type="checkbox"> Keep the exported file updated</label>
        <details class="sim-more"><summary>Java names</summary><div class="start-xy"><div><label for="sim-export-package">Package</label><input id="sim-export-package" type="text" spellcheck="false"></div><div><label for="sim-export-class">Class</label><input id="sim-export-class" type="text" spellcheck="false"></div></div></details>
        <p id="sim-export-status" class="hint"></p><button id="sim-plan-next" class="primary" type="button">Next: run & review →</button></div></div>
      <div data-panel="run" id="sim-panel-run" role="tabpanel" aria-labelledby="sim-tab-run" hidden><h2>Practice mode</h2>${segmented('practice',{autonomous:'Autonomous',teleop:'Teleop',match:'Full match'},'Practice mode')}
        <div class="sim-grid3"><div><label for="sim-auto-seconds">Auto · seconds</label><input id="sim-auto-seconds" type="number" min="0.1" max="3600" step="any" data-slider-min="1" data-slider-max="120" data-slider-step="1"></div><div><label for="sim-transition-seconds">Transition · seconds</label><input id="sim-transition-seconds" type="number" min="0" max="3600" step="any" data-slider-max="60" data-slider-step="1"></div><div><label for="sim-teleop-seconds">Teleop · seconds</label><input id="sim-teleop-seconds" type="number" min="0.1" max="3600" step="any" data-slider-min="1" data-slider-max="300" data-slider-step="1"></div></div><div id="sim-practice-clock" class="sim-practice-clock" role="timer" aria-live="off"><span id="sim-practice-phase">Ready</span><strong id="sim-practice-time">0:30</strong></div>
        <p class="hint" id="sim-run-readiness"></p><button id="sim-run-sensors" type="button" class="secondary" hidden>Choose position sensing</button><p class="hint" id="sim-practice-help"></p>
        ${segmented('program',{route:'Planned route',opmode:'Control Hub export',source:'Java program'},'Program')}<p id="sim-program-note" class="hint"></p>
        <div class="sim-run-row"><button id="sim-run" class="primary" type="button">Run</button><label class="sr-only" for="sim-speed">Speed</label><select id="sim-speed">${options({'0.25':'0.25×','0.5':'0.5×','1':'1×','2':'2×','4':'4×'},'1')}</select></div>
        <p id="sim-run-status" role="status"></p><div id="sim-error" class="sim-error" role="alert" hidden></div>
        <div id="sim-source-box" hidden><div class="button-row"><button id="sim-java-open" class="secondary" type="button">Open .java…</button><button id="sim-java-example" class="secondary" type="button">Example</button></div>
          <label for="sim-source" id="sim-source-name">Program</label><textarea id="sim-source" spellcheck="false" wrap="off"></textarea></div>
        <details class="sim-log"><summary>Program output</summary><pre id="sim-log"></pre></details>
        <p class="hint sim-credit">Path following uses Pedro Pathing 3.0.2 (BSD-3-Clause). Physics uses DSIM (PolyForm Noncommercial). Licences are in the app's licenses folder.</p></div>
    </section></div>`;
  const graph=$('#simulation-field'),robotGlyph=$('#field-robot');
  function svg(tag,attributes,text){const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;}
  let fieldArtKey='';
  function fieldDrawing(){const b=geometry().bounds,w=L().field==='empty'?L().width:144,h=fieldHeight(),key=JSON.stringify([b,L().field,!!window.DeckThree?.drawDsimField,info?.fieldZones]);if(key===fieldArtKey)return;fieldArtKey=key;
    const margin=Math.max(w,h)*.075;graph.setAttribute('viewBox',`${-margin*1.5} ${-margin*.5} ${w+margin*2} ${h+margin*2}`);$('#sim-overlay').setAttribute('transform',`matrix(1 0 0 -1 0 ${h})`);
    const floor=$('.field-floor');floor.setAttribute('width',w);floor.setAttribute('height',h);$('.field-grid').replaceChildren();$('.field-labels').replaceChildren();
    const step=Math.max(12,Math.ceil(Math.max(w,h)/288)*24),font=Math.max(w,h)/48;
    for(let v=0;v<=w;v+=step){if(v>0&&v<w)$('.field-grid').append(svg('path',{d:`M${v} 0V${h}`}));$('.field-labels').append(svg('text',{x:v,y:h+font*2,'text-anchor':'middle','font-size':font},v));}
    for(let v=0;v<=h;v+=step){if(v>0&&v<h)$('.field-grid').append(svg('path',{d:`M0 ${h-v}H${w}`}));$('.field-labels').append(svg('text',{x:-font*1.5,y:h-v+font/2,'text-anchor':'end','font-size':font},v));}
    $('.field-labels').append(svg('text',{x:w/2,y:h+font*4,'text-anchor':'middle','font-size':font},'X · inches'));
    window.DeckFieldArt?.draw2d($('#sim-obstacles'),L().field,info,svg);
  }
  const pts=list=>list.map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
  const status=(id,text)=>{$(id).textContent=text;if(id==='#start-status'&&tab==='setup')$('#sim-model-status').textContent=text;};
  const inputValue=(id,value,committed=false)=>{const element=$(id);if(committed||document.activeElement!==element)element.value=value;window.DeckNumberSliders?.sync(element);};
  const pressed=(attr,value)=>{for(const b of $$(`[data-${attr}]`))b.setAttribute('aria-pressed',String(b.dataset[attr]===value));};

  // ------------------------------------------------------------------ engine
  // Nearest clear pose to the left-wall default, scanning inward and along the wall.
  function clearStart(g,heading=start.heading){
    const edge=field.edgePose(heading,g);let best=null,bestD=Infinity;
    for(let dx=0;dx<=48;dx+=2)for(let dy=-60;dy<=60;dy+=3){const p=field.constrain({x:edge.x+dx,y:edge.y+dy,heading},g),d=Math.hypot(p.x-edge.x,p.y-edge.y);
      if(d<bestD&&planner.safePose(p,info.fieldZones,info.footprint,info.bounds)){best=p;bestD=d;}}
    return best;
  }
  const engineConfig=()=>({field:L().field,width:L().width,height:L().height,elements:L().elements,start,controller:project.controller,timing:project.timing,robot:project.robot,zones:L().zones,sensors:project.sensors,tuning:project.tuning});
  function load(){
    if(!native){info=null;draw();return Promise.resolve();}
    const seq=(load.seq=(load.seq||0)+1);loadError='';
    const operation=(async()=>{try{const next=await api.sim('load',engineConfig());if(seq!==load.seq)return;if(next.field!=='empty'){await three();if(seq!==load.seq)return;}info=next;
      const g=geometry();try{field.validate(start,g);}catch{start=field.constrain(start,g);preview={...start};}
      if(!L().start&&!planner.safePose(start,info.fieldZones,info.footprint,info.bounds)){const clear=clearStart(g);if(clear){start=clear;preview={...start};}}
      if(!planner.safePose(start,info.fieldZones,info.footprint,info.bounds))status('#start-status','The robot overlaps a field part here. Place it somewhere clear.');
      // The robot starts at the clear default spot automatically; dragging it moves it from there.
      if(!L().start){L().start={...start};save();}
      await api.sim('start',start);if(seq!==load.seq)return;fieldArtKey='';inputs();robotPanel();layoutPanel();draw();view3d?.setField(info,L());schedulePlan();
    }catch(e){if(seq===load.seq){loadError=e.message;status('#sim-run-status',e.message);}}})();loading=operation;return operation.finally(()=>{if(loading===operation)loading=null;});
  }
  let reloadTimer=null,reloadWaiters=[];
  async function reloadNow(){clearTimeout(reloadTimer);reloadTimer=null;const waiters=reloadWaiters.splice(0);try{await load();await placeModel();}finally{for(const resolve of waiters)resolve();}}
  function reload(){runAttempt++;clearTimeout(reloadTimer);load.seq=(load.seq||0)+1;info=null;loading=new Promise(resolve=>reloadWaiters.push(resolve));reloadTimer=setTimeout(()=>void reloadNow(),150);}
  async function ready(){if(!native)throw Error('Physics runs in the installed driver station app.');let pending;do{pending=loading;if(pending)await pending;}while(loading&&loading!==pending);if(!info)await load();if(!info)throw Error(loadError||'The simulation could not load.');}
  async function call(method,...args){await ready();return api.sim(method,...args);}
  if(native)api.onSim(message=>{
    if(!active)return;
    if(message.type==='frame'){frame=message;trailPoint(message);paint();telemetry();return;}
    if(message.type==='run')runEvent(message);
    else if(message.type==='practice')practicePanel(message);
    else if(message.type==='optimize'&&optimizing&&optimize.layoutId===L().id)status('#sim-plan-status',`Test-driving route ${message.index+1} of ${message.total}…`);
    else if(message.type==='log'){logLines.push(...message.lines);logLines=logLines.slice(-200);$('#sim-log').textContent=logLines.join('\n');}
    else if(message.type==='host-exit'){info=null;frame=null;runState='idle';if(message.error)status('#sim-run-status',message.error);transport();}
  });
  function trailPoint(f){let last=trail.at(-1);const t=f.truth;if(last&&Math.hypot(last.x-t.x,last.y-t.y)>12){trail=[];last=null;}if(!last||Math.hypot(last.x-t.x,last.y-t.y)>.4||(f.estimate&&!last.e))trail.push({x:t.x,y:t.y,e:f.estimate?{x:f.estimate.x,y:f.estimate.y}:null});if(trail.length>3000)trail.splice(0,1000);}
  function runEvent(m){
    const err=$('#sim-error');
    if(m.state==='starting'){runState='starting';trail=[];logLines=[];$('#sim-log').textContent='';err.hidden=true;status('#sim-run-status',m.kind==='source'?'Compiling and starting your program…':'Starting…');}
    else if(m.state==='running'){runState='running';status('#sim-run-status','Running.');}
    else if(m.state==='finished'){runState=frame?.practice?'running':'idle';const r=m.result,last=L().pins.at(-1);let text=`Finished in ${r.time.toFixed(2)} s.`;
      if(last&&['route','timed'].includes(r.kind))text+=` Ended ${Math.hypot(r.truth.x-last.x,r.truth.y-last.y).toFixed(2)} in from the last pin.${r.kind==='timed'?' Timed drive has no position feedback.':''}`;
      text+=r.violations.length?` Touched ${r.violations.length} no-go zone${r.violations.length>1?'s':''}.`:' No zones touched.';status('#sim-run-status',text);}
    else if(m.state==='error'){runState='idle';status('#sim-run-status','The program stopped.');err.hidden=false;err.replaceChildren(Object.assign(document.createElement('p'),{textContent:m.error}),...(m.trace?.length?[Object.assign(document.createElement('pre'),{textContent:m.trace.join('\n')})]:[]));selectTab('run');}
    else if(m.state==='stopped'){runState='idle';status('#sim-run-status','Stopped.');}
    else if(m.state==='reset'){runState='idle';trail=[];status('#sim-run-status','Back at the starting pose.');}
    else if(m.state==='practice-finished'){runState='idle';status('#sim-run-status','Practice complete. Drive input is disabled.');}
    else if(m.state==='auto-time-limit'){status('#sim-run-status',`Autonomous reached its ${m.result.time.toFixed(1)} s limit before the program finished.`);}
    transport();
  }

  // ------------------------------------------------------------------ drawing
  function robotPose(){return tool==='start'||!frame?preview:{x:frame.truth.x,y:frame.truth.y,heading:frame.truth.heading};}
  function paint(){
    if(project.view==='3d'&&view3d){view3d.update(frame,state3d());return;}
    $('#sim-elements').replaceChildren(...(frame?.fieldState?.balls||[]).filter(b=>!['held','stock','scored'].includes(b.state?.kind)).map(b=>svg('circle',{cx:b.pos.x+72,cy:b.pos.y+72,r:L().field==='biobuzz'?(b.color==='yellow'?1.4:1.8):2.5,fill:{yellow:'#f2d14b',red:'#e2564d',blue:'#007be1',purple:'#a568ce',green:'#69bd74'}[b.color]||'#dadada',stroke:'#17191c','stroke-width':'.25','data-element':b.id})));
    const p=robotPose();robotGlyph.setAttribute('transform',`translate(${p.x} ${fieldHeight()-p.y}) rotate(${-p.heading})`);
    const e=frame?.estimate;$('#sim-estimate').setAttribute('points',e?pts(planner.body(e,geometry().footprint)):'');
    const c=frame?.follower?.closest,target=$('#sim-target');target.setAttribute('cx',c?c.x:-99);target.setAttribute('cy',c?c.y:-99);
    for(const z of $$('#sim-zones [data-zone]'))z.classList.toggle('hit',!!frame?.hit?.includes(z.dataset.zone));
  }
  function draw(){
    const g=geometry(),fp=g.footprint,l=L(),b=g.bounds;
    fieldDrawing();
    graph.dataset.field=l.field;graph.dataset.placing=String(tool==='start'&&active);graph.dataset.mode=tool;
    const rect=robotGlyph.querySelector('rect'),image=$('#sim-robot-image'),pic=model?.picture;
    rect.setAttribute('x',-fp.rear);rect.setAttribute('y',-fp.half);rect.setAttribute('width',fp.front+fp.rear);rect.setAttribute('height',2*fp.half);
    robotGlyph.classList.toggle('has-model',!!pic);
    if(pic){image.setAttribute('href',pic.url);image.setAttribute('x',pic.x0);image.setAttribute('y',-pic.y1);image.setAttribute('width',pic.x1-pic.x0);image.setAttribute('height',pic.y1-pic.y0);}else image.setAttribute('width',0);
    for(const [k,v] of Object.entries({x:b.x0,y:b.y0,width:b.x1-b.x0,height:b.y1-b.y0}))$('#sim-walls').setAttribute(k,v);
    const sel=selected?.kind==='zone'&&zoneById(selected.id);
    $('#sim-zones').replaceChildren(...l.zones.map(z=>zoneShape(z,sel===z?' selected':'')),...(sel&&tool==='select'?handles(sel).map(h=>svg('circle',{class:'sim-handle',cx:h.x,cy:h.y,r:1.4})):[]));
    $('#sim-route').replaceChildren(...(l.route?routeShapes(l.route):[]));
    $('#sim-pins').replaceChildren(...l.pins.map((p,i)=>{const n=svg('g',{class:'sim-pin'+(selected?.kind==='pin'&&selected.index===i?' selected':'')+(p.wait>0||p.action?' stop':'')+(blockedPin===i?' blocked':''),transform:`translate(${p.x} ${p.y})`,'data-pin':i});
      // A pin that turns the robot shows the heading it turns to.
      if(finite(p.turn))n.append(svg('path',{class:'sim-pin-turn',d:`M0 0L${(5.2*Math.cos(p.turn*Math.PI/180)).toFixed(2)} ${(5.2*Math.sin(p.turn*Math.PI/180)).toFixed(2)}`}));
      n.append(svg('circle',{r:2.8}),svg('text',{y:1.1,transform:'scale(1 -1)','text-anchor':'middle'},i+1));return n;}));
    const est=trail.filter(t=>t.e).map(t=>t.e);
    $('#sim-trail').replaceChildren(...(trail.length>1?[svg('polyline',{class:'sim-trail',points:pts(trail)})]:[]),...(est.length>1?[svg('polyline',{class:'sim-trail estimate',points:pts(est)})]:[]));
    $('#sim-start').setAttribute('points',frame&&tool!=='start'?pts(planner.body(start,fp)):'');
    $('#field-coordinates').textContent=`X ${field.round(preview.x)} in · Y ${field.round(preview.y)} in · ${field.round(preview.heading)}°`;
    $('#field-help').textContent={start:'Press and drag the robot to move its starting pose. Arrow keys move 1 inch; Enter places; Escape cancels.',select:planningStep==='start'?'Set the starting pose with the controls, or choose Place on field.':planningStep==='zones'?'Select a zone to move it or resize its handles. Delete removes it.':'Select a pin to move it. Pins stay inside the field.',rect:'Drag on the field to draw a box the robot must avoid.',circle:'Press at the centre, then drag outwards to set the circle radius.',triangle:'Press where the base goes and drag: the tip follows your cursor.',draw:'Drag along the field to draw the route. It becomes pins kept out of red areas. Starting near the end of the route extends it; starting elsewhere replaces it.',shape:'Tap to add corners; the outline closes back to the first corner as you go. Two corners make a wall. Press Enter or Finish shape to confirm.',pin:'Click where the robot should go next. The whole footprint must fit inside the field.'}[tool]||'';
    pressed('tool',tool);
    $('#sim-subtitle').textContent=`${l.name}${l.field==='empty'?' · empty field':''}${info?.physics==='3d'?' · 3D physics':''}`;
    paint();
  }
  function inputs(){const b=geometry().bounds;$('#start-x').dataset.sliderMax=b.x1;$('#start-y').dataset.sliderMax=b.y1;for(const key of ['x','y','heading'])inputValue('#start-'+key,String(field.round(start[key])));}
  function telemetry(){
    // At most ~8 updates a second, but never drop the last frame (a paused simulation sends no more).
    const now=performance.now(),wait=120-(now-(telemetry.at||0));clearTimeout(telemetry.timer);
    if(wait>0){telemetry.timer=setTimeout(telemetry,wait);return;}telemetry.at=now;
    const f=frame,rows=[];if(!f){$('#sim-telemetry').replaceChildren();return;}
    const t=f.truth,e=f.estimate,r=v=>v.toFixed(1),add=(k,v,cls)=>rows.push([k,v,cls]);
    practicePanel(f.practice);
    add('Time',`${f.time.toFixed(2)} s${f.playing?'':' · paused'}`);
    add('Robot',`${r(t.x)}, ${r(t.y)} in · ${r(((t.heading%360)+360)%360)}° · ${r(Math.hypot(t.vx,t.vy))} in/s`);
    if(e)add('Sensor estimate',`off by ${Math.hypot(e.x-t.x,e.y-t.y).toFixed(2)} in`);if(f.execution==='timed')add('Autonomous','Timed power + IMU · no X/Y feedback');
    if(f.acting)add('Action path',f.acting);
    if(f.wait)add('Paused at pin',`${f.wait.action||'Pause'} · ${f.wait.remaining.toFixed(1)} s left`);
    else if(f.mode==='program'&&f.follower)add('Route',`leg ${Math.max(1,f.follower.pathIndex+1)}${finite(f.follower.remaining)?` · ${r(f.follower.remaining)} in to go`:''}`);
    add('Zones',f.hit.length?'Touching a no-go zone':f.violations.length?`Touched ${f.violations.length} this run`:'Clear',f.hit.length||f.violations.length?'warn':'');
    // The running program's own telemetry, as a Driver Station would show it.
    if(f.mode==='program'&&f.telemetry)for(const [k,v] of Object.entries(f.telemetry).slice(0,10))add(k,String(v).slice(0,60));
    $('#sim-telemetry').replaceChildren(...rows.flatMap(([k,v,cls])=>[Object.assign(document.createElement('dt'),{textContent:k}),Object.assign(document.createElement('dd'),{textContent:v,className:cls||''})]));
    $('#sim-mode').textContent=!native?'Preview only':f.playing?({auto:'Running autonomous',transition:'Transition · controls locked',teleop:'Teleop practice'}[f.practice?.phase]||'Running'):'Offline · simulation';
    if(project.view!=='3d')draw();transport();
  }
  function transport(){
    $('#sim-play').textContent=frame?.playing?'Pause':'Play';
    for(const id of ['#sim-play','#sim-stop','#sim-reset','#sim-speed'])$(id).disabled=!native;
    $('#sim-play').disabled=!native||(!frame?.practice&&runState!=='running')||frame?.practice?.phase==='finished';
    $('#sim-run').disabled=!native||runState==='starting'||optimizing;$('#sim-optimize').disabled=!native||optimizing;
    const canFollow=C.sensors[project.sensors.localization].translation,teleop=project.practice.mode==='teleop';$('#sim-run-readiness').textContent=teleop?'Controller practice uses this setup’s robot, field and physical game elements.':canFollow?'Pedro follows the route using the selected odometry + IMU.':'Timed power + IMU heading hold. There is no X/Y feedback; compare the actual endpoint against your planned pins.';$('#sim-run-sensors').hidden=canFollow||teleop||project.program.kind==='route';
  }

  // ------------------------------------------------------------------ editing
  function changed(what){
    if(['zones','pins','start','robot','field','plan'].includes(what)){L().route=null;L().tested=null;planSeq++;}
    save();draw();if(what==='zones'&&native&&info)void api.sim('zones',L().zones).catch(()=>{});zonePanel();pinPanel();tested();schedulePlan();
  }
  function commit(pose){
    const g=geometry(),next=field.validate(pose,g);
    if(info&&!planner.safePose(next,[...info.fieldZones,...L().zones],info.footprint,info.bounds))throw Error('That spot overlaps an obstacle. Choose a clear position outside the red boundary.');
    start=next;preview={...start};tool=planningStep==='start'?'start':'select';pointer=null;inputs();L().start=start;
    let saved=save();try{localStorage.setItem(field.KEY,field.serialize(start,g));}catch{saved=false;}
    status('#start-status',saved?'Starting pose saved.':'Starting pose set for this session. Device storage is unavailable.');
    changed('start');if(native&&info)void api.sim('start',start).catch(e=>status('#start-status',e.message));
  }
  function toField(event){const m=graph.getScreenCTM();if(!m)return null;const p=graph.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const l=p.matrixTransform(m.inverse());return {x:l.x,y:fieldHeight()-l.y};}
  function validPin(p,heading=start.heading){const g=geometry();return planner.safePose({...p,heading},[...(info?.fieldZones||[]),...L().zones],g.footprint,g.bounds);}
  function pinPosition(p,fallback){const q=field.constrain({...p,heading:start.heading},geometry()),r=field.constrain({x:field.round(q.x),y:field.round(q.y),heading:start.heading},geometry());return validPin(r)?{x:r.x,y:r.y}:fallback||{x:p.x,y:p.y};}
  // Pins tapped or dragged into a red area move to the nearest spot where the whole robot fits,
  // searched in growing half-inch rings so the first ring with a clear spot holds the closest one.
  function nearestPin(p,limit=36,heading=start.heading){
    const g=geometry(),snap=q=>{const c=field.constrain({...q,heading},g);return {x:field.round(c.x),y:field.round(c.y)};},first=snap(p);if(validPin(first,heading))return first;
    for(let r=.5;r<=limit;r+=.5){let best=null;const n=Math.max(8,Math.ceil(4*Math.PI*r));
      for(let i=0;i<n;i++){const a=2*Math.PI*i/n,q=snap({x:p.x+r*Math.cos(a),y:p.y+r*Math.sin(a)}),d=Math.hypot(q.x-p.x,q.y-p.y);if((!best||d<best.d)&&validPin(q,heading))best={...q,d};}
      if(best)return {x:best.x,y:best.y};}
    return null;
  }
  const dist2=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  // Ramer-Douglas-Peucker: keep the points that carry the drawing's shape within `tolerance` inches.
  function simplify(points,tolerance){if(points.length<3)return points.slice();const a=points[0],b=points.at(-1);let worst=0,index=0;
    for(let i=1;i<points.length-1;i++){const d=Math.abs((b.x-a.x)*(a.y-points[i].y)-(a.x-points[i].x)*(b.y-a.y))/(dist2(a,b)||1);if(d>worst){worst=d;index=i;}}
    return worst>tolerance?[...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)]:[a,b];}
  // A drawn stroke becomes route pins: simplified, each moved clear of red areas. Starting near the
  // end of the current route extends it; starting anywhere else replaces the pins.
  function drawnPath(points){
    const l=L(),end=l.pins.at(-1)||start;if(points.length<2||dist2(points[0],points.at(-1))<2)return status('#sim-plan-status','Drag a longer path to draw the route.');
    const extend=l.pins.length&&dist2(points[0],end)<=12;let keep=[];for(let tolerance=2;tolerance<64;tolerance*=1.5){keep=simplify(points,tolerance);if(keep.length-1+(extend?l.pins.length:0)<=32)break;}
    const pins=[];for(const q of keep.slice(1)){const c=nearestPin(q);if(c&&!pins.some(p=>dist2(p,c)<1))pins.push({x:c.x,y:c.y,wait:0,action:''});}
    if(!pins.length)return status('#sim-plan-status','No clear spot along that path: the whole robot must fit inside the field and outside red areas.');
    l.pins=extend?l.pins.concat(pins).slice(0,32):pins.slice(0,32);selected=null;changed('pins');
    status('#sim-plan-status',`${extend?'Added':'Drew'} ${pins.length} pin${pins.length>1?'s':''} from your path. Planning…`);
  }
  function hit(p){
    const l=L();if(planningStep==='pins'){for(let i=l.pins.length-1;i>=0;i--)if(Math.hypot(l.pins[i].x-p.x,l.pins[i].y-p.y)<=3.2)return {kind:'pin',index:i};return null;}
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
  // Dashed outlines of the robot at its new heading wherever a turning route turns in place.
  function turnGhosts(route){if(!route.turns||!route.footprint)return [];const out=[];let heading=route.heading;
    for(const s of route.segments){if(Number.isFinite(s.heading)&&Math.abs(((s.heading-heading)%360+540)%360-180)>.5){out.push(svg('polygon',{class:'sim-turn-ghost',points:pts(planner.body({...s.points[0],heading:s.heading},route.footprint))}));heading=s.heading;}}
    return out;}
  // The route path by path: action paths dashed in the action colour, and a mark halfway along each
  // path the robot turns or spins along. data-path is the pin each path leads to.
  const bez=(points,t)=>{let p=points;while(p.length>1)p=p.slice(1).map((q,i)=>({x:p[i].x+(q.x-p[i].x)*t,y:p[i].y+(q.y-p[i].y)*t}));return p[0];};
  const segmentPoints=s=>s.type==='line'?s.points:Array.from({length:25},(_,j)=>bez(s.points,j/24));
  const pathOf=(l,k)=>l.pins[k]?.path||{kind:'regular',rotate:'keep'};
  function routeShapes(route){
    const l=L(),to=exporter.pathIndex(route),out=[],marks=new Map();
    route.segments.forEach((s,i)=>{const k=to[i],path=pathOf(l,k),points=segmentPoints(s);
      out.push(svg('polyline',{class:'sim-path'+(path.kind==='action'?' action':'')+(selected?.kind==='path'&&selected.index===k?' selected':''),points:pts(points),'data-path':k}));
      if(!marks.has(k))marks.set(k,[]);marks.get(k).push(...points);});
    if(!route.nonholonomic)for(const [k,points] of marks){const path=pathOf(l,k);if(path.rotate==='keep')continue;const mid=points[Math.floor(points.length/2)];
      out.push(svg('text',{class:'sim-path-mark',x:mid.x.toFixed(2),y:(-mid.y-2).toFixed(2),transform:'scale(1 -1)','text-anchor':'middle'},path.rotate==='spin'?`${path.spins>0?'↺':'↻'}${Math.abs(path.spins)}`:`↷${Math.round(path.heading)}°`));}
    out.push(...turnGhosts(route));return out;
  }
  // The path (by the pin it leads to) under a field point, if the route passes within reach.
  function pathHit(p,reach=1.8){const route=L().route;if(!route)return null;const to=exporter.pathIndex(route);let best=null;
    route.segments.forEach((s,i)=>{const q=segmentPoints(s);for(let j=1;j<q.length;j++){const a=q[j-1],b=q[j],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);if(d<=reach&&(!best||d<best.d))best={d,index:to[i]};}});
    return best&&{kind:'path',index:best.index};}
  // ------------------------------------------------------------ pin and path settings
  // Right-click (or press and hold) a pin or a path to open its settings. The simulator only plans and
  // drives the movement; each named action becomes a slot in the exported code for the team's own
  // mechanism code (RobotActions.java on a Control Hub, robot_actions.py on MotionModule).
  const effects={index:-1};
  function openEffects(target,at){
    const l=L(),k=target.index,p=l.pins[k];if(!p)return;p.path={...planner.pathEffects(p.path)};
    const box=$('#sim-effects'),holonomic=C.drives[project.robot.drivetrain].holonomic,from=k?`pin ${k}`:'the start';effects.index=k;selected={kind:target.kind,index:k};
    box.innerHTML=`<div class="sim-pop-head"><h3>Pin ${k+1}</h3><button type="button" class="icon-button" data-close aria-label="Close">×</button></div>
      <section class="sim-pop-sec" data-sec="path"><h4>Path to pin ${k+1} <span class="hint">from ${from}</span></h4>
        ${segmented('ptype',{regular:'Regular path',action:'Action path'},'Path type')}
        <p class="hint">A regular path only drives. On an action path the robot runs an action while it drives, such as intaking on the way or shooting while moving.</p>
        <div data-when="action"><label for="eff-path-action">Action while driving</label><input id="eff-path-action" maxlength="40" placeholder="e.g. Intake" autocomplete="off"></div>
        <label>While driving</label>${segmented('prot',{keep:'Keep heading',turn:'Turn to…',spin:'Spin'},'Rotation while driving')}
        <div data-when="turn"><label for="eff-path-heading">Face this heading by the end · °</label><input id="eff-path-heading" type="number" min="-180" max="180" step="5"></div>
        <div data-when="spin" class="sim-grid2"><div><label for="eff-path-spins">Full spins</label><input id="eff-path-spins" type="number" min="1" max="10" step="1"></div><div><label>Direction</label>${segmented('pdir',{left:'Left ↺',right:'Right ↻'},'Spin direction')}</div></div>
        <p class="hint" data-tank>${holonomic?'The robot needs room to turn its whole footprint along this path.':'Tank drivetrains cannot turn while driving. Turn at a pin instead.'}</p>
        <label for="eff-path-note">What this path does</label><textarea id="eff-path-note" rows="2" maxlength="160" placeholder="e.g. Sweep the first spike mark"></textarea>
      </section>
      <section class="sim-pop-sec" data-sec="pin"><h4>At pin ${k+1}</h4>
        <div class="sim-grid2"><div><label for="eff-wait">Pause · s</label><input id="eff-wait" type="number" min="0" max="30" step="0.25"></div><div><label for="eff-action">Action here</label><input id="eff-action" maxlength="40" placeholder="e.g. Shoot" autocomplete="off"></div></div>
        <label>Turn in place</label>${segmented('pturn',{keep:'No turn',turn:'Turn to…'},'Turn at pin')}
        <div data-when="pturn"><label for="eff-turn">Heading · °</label><input id="eff-turn" type="number" min="-180" max="180" step="5"></div>
        <label for="eff-note">What happens here</label><textarea id="eff-note" rows="2" maxlength="160" placeholder="e.g. Score the preload"></textarea>
        <p class="hint">The robot stops here when it has a pause, an action or a turn. It turns first, then runs the action; it leaves once the action is done and the pause is over.</p>
      </section>
      <div class="button-row"><button type="button" class="text-button" data-remove>Remove pin</button><button type="button" class="primary" data-close>Done</button></div>`;
    const q=sel=>box.querySelector(sel),path=p.path,commit=()=>{p.path={...planner.pathEffects(path)};show();changed('plan');};
    const show=()=>{const rot=holonomic?path.rotate:'keep';pressedIn(box,'ptype',path.kind);pressedIn(box,'prot',rot);pressedIn(box,'pdir',path.spins<0?'right':'left');pressedIn(box,'pturn',finite(p.turn)?'turn':'keep');
      q('[data-when=action]').hidden=path.kind!=='action';q('[data-when=turn]').hidden=rot!=='turn';q('[data-when=spin]').hidden=rot!=='spin';q('[data-when=pturn]').hidden=!finite(p.turn);
      for(const b of box.querySelectorAll('[data-prot]'))b.disabled=!holonomic&&b.dataset.prot!=='keep';};
    q('#eff-path-action').value=path.action;q('#eff-path-heading').value=Math.round(path.heading);q('#eff-path-spins').value=Math.abs(path.spins);q('#eff-path-note').value=path.note;
    q('#eff-wait').value=p.wait||0;q('#eff-action').value=p.action||'';q('#eff-turn').value=Math.round(finite(p.turn)?p.turn:start.heading);q('#eff-note').value=p.note||'';
    for(const b of box.querySelectorAll('[data-ptype]'))b.onclick=()=>{path.kind=b.dataset.ptype;commit();};
    for(const b of box.querySelectorAll('[data-prot]'))b.onclick=()=>{path.rotate=b.dataset.prot;if(path.rotate==='turn')path.heading=q('#eff-path-heading').valueAsNumber||0;commit();};
    for(const b of box.querySelectorAll('[data-pdir]'))b.onclick=()=>{path.spins=Math.abs(path.spins)*(b.dataset.pdir==='right'?-1:1);commit();};
    for(const b of box.querySelectorAll('[data-pturn]'))b.onclick=()=>{p.turn=b.dataset.pturn==='turn'?(q('#eff-turn').valueAsNumber||0):null;show();changed('plan');};
    q('#eff-path-action').onchange=e=>{path.action=e.target.value.trim().slice(0,40);commit();};
    q('#eff-path-heading').onchange=e=>{const v=e.target.valueAsNumber;path.heading=finite(v)?field.heading(v):0;commit();};
    q('#eff-path-spins').onchange=e=>{const v=Math.round(e.target.valueAsNumber);path.spins=Math.max(1,Math.min(10,finite(v)?v:1))*(path.spins<0?-1:1);e.target.value=Math.abs(path.spins);commit();};
    q('#eff-path-note').onchange=e=>{path.note=e.target.value.slice(0,160);commit();};
    q('#eff-wait').onchange=e=>{const v=e.target.valueAsNumber;p.wait=finite(v)?Math.min(30,Math.max(0,v)):0;e.target.value=p.wait;changed('plan');};
    q('#eff-action').onchange=e=>{p.action=e.target.value.trim().slice(0,40);changed('plan');};
    q('#eff-turn').onchange=e=>{const v=e.target.valueAsNumber;p.turn=finite(v)?field.heading(v):null;show();changed('plan');};
    q('#eff-note').onchange=e=>{p.note=e.target.value.slice(0,160);changed('plan');};
    for(const b of box.querySelectorAll('[data-close]'))b.onclick=closeEffects;
    q('[data-remove]').onclick=()=>{closeEffects();l.pins.splice(k,1);selected=null;changed('pins');};
    show();box.hidden=false;
    // Beside the point that was pressed, on the side with more room so the pin and path stay visible;
    // kept inside the field area. Narrow screens show it as a bottom sheet (CSS).
    const stage=$('#sim-stage').getBoundingClientRect(),w=box.offsetWidth,h=box.offsetHeight,x=(at?.clientX??stage.left+stage.width/2)-stage.left,y=(at?.clientY??stage.top+40)-stage.top;
    box.style.left=`${Math.max(4,Math.min(stage.width-w-4,x>stage.width/2?x-w-24:x+24))}px`;box.style.top=`${Math.max(4,Math.min(Math.max(4,stage.height-h-4),y-h/3))}px`;
    draw();q(`[data-sec=${target.kind==='path'?'path':'pin'}] button,[data-sec=${target.kind==='path'?'path':'pin'}] input`)?.focus({preventScroll:true});
  }
  function closeEffects(){const box=$('#sim-effects');if(box.hidden)return;box.hidden=true;box.replaceChildren();effects.index=-1;graph.focus({preventScroll:true});}
  const pressedIn=(box,attr,value)=>{for(const b of box.querySelectorAll(`[data-${attr}]`))b.setAttribute('aria-pressed',String(b.dataset[attr]===value));};
  document.addEventListener('pointerdown',e=>{const box=$('#sim-effects');if(box&&!box.hidden&&!box.contains(e.target)&&!e.target.closest?.('.sim-pin-row'))closeEffects();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sim-effects')?.hidden){e.preventDefault();closeEffects();}});
  // Press and hold on a touchscreen or with a pen opens the same settings as a right-click (a mouse
  // has the right button, and a slow mouse drag must never turn into a hold).
  let hold=null;
  function holdStart(target,event){clearTimeout(hold?.timer);hold=null;if(event.pointerType==='mouse')return;hold={x:event.clientX,y:event.clientY,fired:false,timer:setTimeout(()=>{hold.fired=true;drag=null;pendingPin=null;openEffects(target,{clientX:hold.x,clientY:hold.y});},550)};}
  function holdMove(event){if(hold&&!hold.fired&&Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>8){clearTimeout(hold.timer);hold=null;}}
  let pendingPin=null;
  function zoneShape(z,extra=''){const p=planner.polygon(z);return p.length===2?svg('polyline',{class:'sim-zone wall'+extra,points:pts(p),'data-zone':z.id}):svg('polygon',{class:'sim-zone'+extra,points:pts(p),'data-zone':z.id});}
  function showDraft(z){
    const nodes=[];if(z)nodes.push(zoneShape(z,' draft'));
    // The outline is always shown closed back to the first corner, so the shape is mapped out as corners are placed.
    if(sketch){const path=cursor?[...sketch,cursor]:sketch;if(path.length>2)nodes.push(svg('polygon',{class:'sim-zone draft',points:pts(path)}));else if(path.length>1)nodes.push(svg('polyline',{class:'sim-zone wall draft',points:pts(path)}));for(const [i,q] of sketch.entries())nodes.push(svg('circle',{class:'sim-corner'+(i===0&&sketch.length>2?' close':''),cx:q.x,cy:q.y,r:1.1}));}
    $('#sim-draft').replaceChildren(...nodes);shapeBar();
  }
  function shapeBar(){const n=sketch?.length||0;$('#sim-shape-bar').hidden=!n;if(!n)return;$('#sim-shape-status').textContent=n===1?'1 corner. Tap the next corner.':n===2?'2 corners: a wall line. Add a third to make a closed shape.':`${n} corners, closed back to the first. Press Enter or Finish shape to confirm.`;$('#sim-shape-finish').disabled=n<2;}
  function finishShape(){const points=sketch;sketch=null;cursor=null;showDraft(null);if(!points||points.length<2)return;
    if(L().zones.length>=24)return status('#sim-plan-status','Use at most 24 zones.');
    try{const z=planner.validateZone({id:'zone-'+Date.now().toString(36),type:'polygon',points});L().zones.push(z);selected={kind:'zone',id:z.id};selectTab('plan');changed('zones');}catch(e){status('#sim-plan-status',e.message);}}
  graph.addEventListener('contextmenu',event=>{if(!active||tab!=='plan')return;const p=toField(event);const h=p&&(hit(p)||(planningStep==='pins'?pathHit(p):null));if(!h)return;event.preventDefault();
    if(hold?.fired)return;clearTimeout(hold?.timer);hold=null;
    if(h.kind==='pin'||h.kind==='path'){drag=null;pendingPin=null;openEffects(h,event);return;}selected=h;removeSelected();});
  graph.addEventListener('pointermove',event=>{
    if(!active)return;holdMove(event);const p=toField(event);if(!p)return;
    // While dragging, the robot moves freely (even over obstacles); release snaps it clear.
    if(tool==='start'&&pointer===event.pointerId){preview=field.constrain({x:field.round(p.x+startGrab.dx),y:field.round(p.y+startGrab.dy),heading:preview.heading},geometry());draw();return;}
    if(drag?.kind==='draw'){drag.zone=draftZone(drag.from,p);showDraft(drag.zone);return;}
    if(drag?.kind==='zone'){const z=zoneById(drag.id);if(z){const dx=p.x-drag.from.x,dy=p.y-drag.from.y;z.x=drag.zone.x+dx;z.y=drag.zone.y+dy;if(z.type==='polygon')z.points=drag.zone.points.map(q=>({x:q.x+dx,y:q.y+dy}));drag.moved=true;draw();}return;}
    if(drag?.kind==='handle'){const z=zoneById(drag.id);if(z){try{Object.assign(z,planner.validateZone({...drag.zone,...handles(drag.zone)[drag.index].set(p)}));drag.moved=true;draw();zonePanel();}catch{}}return;}
    if(tool==='shape'&&sketch){cursor=p;showDraft(null);}
    if(tool==='draw'&&stroke&&pointer===event.pointerId){if(dist2(stroke.at(-1),p)>=1)stroke.push({x:p.x,y:p.y});$('#sim-draft').replaceChildren(svg('polyline',{class:'sim-draw-stroke',points:pts(stroke)}));return;}
    if(drag?.kind==='pin'){const q=L().pins[drag.index];if(Math.hypot(p.x-q.x,p.y-q.y)<.25&&!drag.moved)return;clearTimeout(hold?.timer);hold=null;Object.assign(q,nearestPin(p,12)||q);drag.moved=true;draw();return;}
    $('#field-coordinates').textContent=`X ${field.round(p.x)} in · Y ${field.round(p.y)} in`;
  });
  graph.addEventListener('pointerdown',event=>{
    if(!active||tab!=='plan'||event.button!==0||project.view==='3d')return;const p=toField(event);if(!p)return;event.preventDefault();graph.focus();pointer=event.pointerId;graph.setPointerCapture(event.pointerId);
    if(tool==='start'){const onRobot=planner.contains(p,planner.body(preview,geometry().footprint));startGrab=onRobot?{dx:preview.x-p.x,dy:preview.y-p.y}:{dx:0,dy:0};preview=field.constrain({x:field.round(p.x+startGrab.dx),y:field.round(p.y+startGrab.dy),heading:preview.heading},geometry());draw();return;}
    if(['rect','circle','triangle'].includes(tool)){drag={kind:'draw',from:p,zone:null};return;}
    if(tool==='draw'){stroke=[{x:p.x,y:p.y}];return;}
    if(tool==='pin'){const h=hit(p);if(h?.kind==='pin'){selected=h;drag={kind:'pin',index:h.index};holdStart(h,event);draw();pinPanel();return;}
      // On the route line: a press and hold opens the path's settings; a tap still adds a pin (on release).
      const onPath=pathHit(p);if(onPath){pendingPin=p;holdStart(onPath,event);return;}
      addPin(p);return;}
    if(tool==='shape'){if(sketch&&sketch.length>2&&Math.hypot(sketch[0].x-p.x,sketch[0].y-p.y)<=2.5)return finishShape();const last=sketch?.at(-1);if(last&&Math.hypot(last.x-p.x,last.y-p.y)<.3)return;
      sketch=[...(sketch||[]),{x:field.round(p.x),y:field.round(p.y)}];if(sketch.length>=40)return finishShape();showDraft(null);return;}
    if(tool==='select'){const h=hit(p)||(planningStep==='pins'?pathHit(p):null);if(h?.kind==='handle'){drag={kind:'handle',id:h.id,index:h.index,zone:JSON.parse(JSON.stringify(zoneById(h.id)))};return;}
      if(h?.kind==='pin')holdStart(h,event);if(h?.kind==='path'){selected=h;draw();openEffects(h,event);return;}
      selected=h;if(selected?.kind==='zone'){const z=zoneById(selected.id);drag={kind:'zone',id:z.id,from:p,zone:JSON.parse(JSON.stringify(z))};selectTab('plan');}else if(selected?.kind==='pin'){drag={kind:'pin',index:selected.index};selectTab('plan');}draw();zonePanel();pinPanel();}
  });
  graph.addEventListener('pointerup',event=>{
    if(!active||pointer!==event.pointerId)return;pointer=null;
    const held=hold?.fired;clearTimeout(hold?.timer);hold=null;
    if(pendingPin){const p=pendingPin;pendingPin=null;if(!held)addPin(p);return;}
    if(held){drag=null;return;}
    if(tool==='start'){const clear=nearestPin(preview,72,preview.heading);if(clear&&Math.hypot(clear.x-preview.x,clear.y-preview.y)>.75)status('#start-status','Moved to the nearest clear spot outside the red area.');if(clear)preview={...preview,...clear};try{commit(preview);}catch(e){status('#start-status',e.message);preview={...start};tool='start';draw();}return;}
    if(tool==='draw'&&stroke){const drawn=stroke;stroke=null;$('#sim-draft').replaceChildren();drawnPath(drawn);return;}
    if(drag?.kind==='draw'){const z=drag.zone;drag=null;showDraft(null);if(z&&(z.type==='circle'?z.radius>=.75:z.width>=1&&z.height>=1)){if(L().zones.length>=24)status('#sim-plan-status','Use at most 24 zones.');else{L().zones.push(planner.validateZone(z));selected={kind:'zone',id:z.id};selectTab('plan');changed('zones');}}return;}
    if(drag){const moved=drag.moved,kind=drag.kind;drag=null;if(moved)changed(kind==='pin'?'pins':'zones');}
  });
  graph.addEventListener('dblclick',event=>{if(active&&tool==='shape'&&sketch){event.preventDefault();finishShape();}});
  graph.addEventListener('pointercancel',()=>{clearTimeout(hold?.timer);hold=null;pendingPin=null;pointer=null;drag=null;stroke=null;showDraft(null);preview={...start};draw();});
  graph.addEventListener('keydown',event=>{
    if(!active||tab!=='plan'||event.ctrlKey||event.metaKey||event.altKey)return;
    if(tool==='start'){
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
      if(delta){event.preventDefault();preview=field.constrain({...preview,x:preview.x+delta[0],y:preview.y+delta[1]},geometry());draw();}
      else if(event.key==='Enter'){event.preventDefault();try{commit(preview);}catch(e){status('#start-status',e.message);}}
      else if(event.key==='Escape'){event.preventDefault();if(planningStep!=='start')tool='select';preview={...start};draw();}
      return;
    }
    if(tool==='shape'&&sketch){if(event.key==='Enter'){event.preventDefault();finishShape();return;}if(event.key==='Escape'){event.preventDefault();sketch=null;cursor=null;showDraft(null);return;}if(event.key==='Backspace'){event.preventDefault();sketch.pop();if(!sketch.length)sketch=null;showDraft(null);return;}}
    if(event.key==='Escape'){tool='select';drag=null;showDraft(null);draw();return;}
    if(!selected)return;
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();removeSelected();return;}
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
    const target=selected.kind==='zone'?zoneById(selected.id):L().pins[selected.index];if(!target)return;
    if(delta){event.preventDefault();const s=event.shiftKey?.1:1,next={x:target.x+delta[0]*s,y:target.y+delta[1]*s};if(selected.kind==='pin')Object.assign(target,pinPosition(next,target));else{target.x=next.x;target.y=next.y;if(target.type==='polygon')for(const q of target.points){q.x+=delta[0]*s;q.y+=delta[1]*s;}}changed(selected.kind==='zone'?'zones':'pins');}
    else if(selected.kind==='zone'&&(event.key==='['||event.key===']')){event.preventDefault();target.angle=((target.angle||0)+(event.key===']'?15:-15)+360)%360;changed('zones');}
  });
  function addPin(p){
    if(L().pins.length>=32)return status('#sim-plan-status','Use at most 32 pins.');const q=nearestPin(p);if(!q)return status('#sim-plan-status','No clear spot nearby: the whole robot must fit inside the field and outside red areas.');
    L().pins.push({x:q.x,y:q.y,wait:0,action:''});selected={kind:'pin',index:L().pins.length-1};selectTab('plan');changed('pins');if(Math.hypot(q.x-p.x,q.y-p.y)>.75)status('#sim-plan-status',`Pin ${L().pins.length} moved to the nearest clear spot outside the red area.`);
  }
  function removeSelected(){
    const l=L();if(selected?.kind==='zone')l.zones=l.zones.filter(z=>z.id!==selected.id);else if(selected?.kind==='pin')l.pins.splice(selected.index,1);else return;
    const kind=selected.kind;selected=null;changed(kind==='zone'?'zones':'pins');
  }
  function setTool(next){if(!['select','rect','circle','triangle','shape','pin','draw','start'].includes(next))return;if(sketch&&next!=='shape')finishShape();tool=next;if(next==='start')preview={...start};draw();graph.focus();}
  for(const b of $$('[data-tool]'))b.onclick=()=>setTool(b.dataset.tool);
  $('#sim-shape-finish').onclick=()=>finishShape();
  $('#sim-shape-undo').onclick=()=>{if(!sketch)return;sketch.pop();if(!sketch.length)sketch=null;showDraft(null);};
  $('#sim-shape-cancel').onclick=()=>{sketch=null;cursor=null;showDraft(null);};
  document.addEventListener('keydown',event=>{if(active&&tab==='plan'&&tool==='shape'&&sketch&&event.key==='Enter'&&!event.target.closest?.('input,textarea,select,#simulation-field')){event.preventDefault();finishShape();}});
  function zonePanel(){
    const box=$('#sim-zone-editor'),z=selected?.kind==='zone'&&zoneById(selected.id);box.hidden=!z;if(!z)return;
    const b=geometry().bounds,span=Math.max(b.x1,b.y1),zoneSlider=k=>({x:`data-slider-min="0" data-slider-max="${b.x1}" data-slider-step="0.5"`,y:`data-slider-min="0" data-slider-max="${b.y1}" data-slider-step="0.5"`,width:`data-slider-min="1" data-slider-max="${span}" data-slider-step="0.5"`,height:`data-slider-min="1" data-slider-max="${span}" data-slider-step="0.5"`,radius:`data-slider-min="0.5" data-slider-max="${span/2}" data-slider-step="0.5"`,angle:'data-slider-min="0" data-slider-max="360" data-slider-step="1"'})[k]||'';
    const fields=z.type==='polygon'?[]:z.type==='circle'?[['x','X'],['y','Y'],['radius','Radius']]:[['x','X'],['y','Y'],['width','Width'],['height','Height'],['angle','Turn °']];
    const name=z.type==='polygon'?(z.points.length===2?'Wall':`Shape · ${z.points.length} corners`):{rect:'Box',circle:'Circle',triangle:'Triangle'}[z.type];
    box.innerHTML=`<div class="sim-editor-head"><h3>${name}</h3><button type="button" class="text-button" id="zone-delete">Remove</button></div>${fields.length?`<div class="sim-grid3">${fields.map(([k,l])=>`<div><label for="zone-${k}">${l}</label><input id="zone-${k}" data-key="${k}" type="number" step="any" value="${field.round(z[k]||0)}" ${zoneSlider(k)}></div>`).join('')}</div>`:''}<p class="hint">Drag the ${z.type==='circle'?'edge dot to resize':z.type==='triangle'?'tip dot to turn and stretch':z.type==='rect'?'corner dot to resize':'corner dots to reshape'}. Drag inside to move.</p>`;
    for(const input of box.querySelectorAll('input'))input.onchange=()=>{const next={...z,[input.dataset.key]:input.valueAsNumber};try{Object.assign(z,planner.validateZone(next));changed('zones');}catch(e){status('#sim-plan-status',e.message);zonePanel();}};
    $('#zone-delete').onclick=removeSelected;
  }
  function effectSummary(p){const path=p.path||{},bits=[];
    if(path.kind==='action')bits.push(`Action path${path.action?`: ${path.action}`:''}`);
    if(path.rotate==='spin')bits.push(`spins ${Math.abs(path.spins)} ${path.spins<0?'right':'left'}`);else if(path.rotate==='turn')bits.push(`turns to ${Math.round(path.heading)}° while driving`);
    if(finite(p.turn))bits.push(`turns to ${Math.round(p.turn)}° at the pin`);if(p.note||path.note)bits.push(p.note||path.note);
    return bits.join(' · ');}
  function pinPanel(){
    const list=$('#sim-pin-list'),l=L();
    list.replaceChildren(...l.pins.map((p,i)=>{const li=document.createElement('li');li.className='sim-pin-row'+(selected?.kind==='pin'&&selected.index===i?' selected':'');
      li.innerHTML=`<span class="sim-badge">${i+1}</span><label class="sr-only" for="pin-wait-${i}">Pause at pin ${i+1}, seconds</label><input id="pin-wait-${i}" class="pin-wait" type="number" min="0" max="30" step="0.25" title="Pause here (seconds)"><span class="hint">s</span><label class="sr-only" for="pin-action-${i}">Action at pin ${i+1}</label><input id="pin-action-${i}" class="pin-action" type="text" maxlength="40"><button type="button" class="icon-button" data-effects aria-label="Pin ${i+1} and path settings" title="Pauses, turns, spins and actions">⋯</button><button type="button" class="icon-button" data-move="-1" aria-label="Move pin ${i+1} earlier">↑</button><button type="button" class="icon-button" data-remove aria-label="Remove pin ${i+1}">×</button><span class="sim-pin-summary hint"></span>`;
      li.querySelector('.sim-pin-summary').textContent=effectSummary(p);
      li.querySelector('[data-effects]').onclick=e=>{const pin=graph.querySelector(`[data-pin="${i}"]`)?.getBoundingClientRect();openEffects({kind:'pin',index:i},pin?{clientX:pin.left+pin.width/2,clientY:pin.top+pin.height/2}:e);};
      const wait=li.querySelector('.pin-wait'),action=li.querySelector('.pin-action');wait.value=p.wait||0;action.value=p.action||'';action.placeholder=p.wait>0?'What happens here?':'Add a pause for an action';
      wait.onchange=e=>{const v=e.target.valueAsNumber;p.wait=finite(v)?Math.min(30,Math.max(0,v)):0;e.target.value=p.wait;changed('plan');};
      action.onchange=e=>{p.action=e.target.value.slice(0,40);changed('plan');};
      li.querySelector('[data-remove]').onclick=()=>{l.pins.splice(i,1);selected=null;changed('pins');};
      li.querySelector('[data-move]').onclick=()=>{if(i===0)return;[l.pins[i-1],l.pins[i]]=[l.pins[i],l.pins[i-1]];selected={kind:'pin',index:i-1};changed('pins');};
      return li;}));
    if(!l.pins.length){const li=document.createElement('li');li.className='hint';li.textContent='No pins yet.';list.append(li);}
    else{const head=document.createElement('li');head.className='sim-pin-head hint';head.textContent='Pin · pause · action at the pin · ⋯ for turns, spins and action paths';list.prepend(head);}
  }

  // ------------------------------------------------------------------ planning
  let worker=null;
  function planWith(request){
    if(worker===null){try{worker=new Worker('simulation-worker.js');}catch{worker=false;}}
    if(worker)return new Promise((resolve,reject)=>{const id=++planWith.id,w=worker,cleanup=()=>{clearTimeout(timer);w.removeEventListener('message',done);w.removeEventListener('error',failed);},done=event=>{if(event.data?.id!==id)return;cleanup();event.data.error?reject(Error(event.data.error)):resolve(event.data.result);},failed=event=>{cleanup();reject(Error(event.message||'The planner stopped. Adjust the route and try again.'));},timer=setTimeout(()=>{cleanup();reject(Error('Planning took too long. Simplify the zones or add intermediate pins.'));},30000);w.addEventListener('message',done);w.addEventListener('error',failed);w.postMessage({id,...request});});
    return script('vendor/planning.js').then(()=>planner.plan(request.project,request.footprint,request.fieldZones,request.field));
  }
  planWith.id=0;
  const planRequest=(style,tension)=>{const l=L(),g=geometry();return {project:{start,zones:l.zones,pins:l.pins,clearance:l.clearance,style,tension,rotate:l.rotate!==false,nonholonomic:!C.drives[project.robot.drivetrain].holonomic},footprint:g.footprint,fieldZones:info?.fieldZones||[],field:g.bounds};};
  const schedulePlan=(()=>{let t;const schedule=()=>{clearTimeout(t);t=setTimeout(()=>void plan(),220);};schedule.cancel=()=>clearTimeout(t);return schedule;})();
  async function plan(){
    if(native){try{await ready();}catch(e){planError=e.message;status('#sim-plan-status',e.message);return null;}}
    const l=L(),seq=++planSeq;if(!l.pins.length){l.route=null;draw();status('#sim-plan-status','Add pins to make a route.');return null;}
    if(native&&!info)return null;
    try{const route=await planWith(planRequest(l.style));if(seq!==planSeq||l!==L())return null;l.route=route;blockedPin=-1;planError='';save();draw();
      const stops=route.stops.filter(s=>s.wait>0).length,avoid=info?.obstacleName?` and ${info.fieldName}'s ${info.obstacleName}`:'';
      status('#sim-plan-status',`Route ready: ${route.length.toFixed(0)} in${stops?`, ${stops} pause${stops>1?'s':''}`:''}. It stays ${(route.clearance/2).toFixed(1)}+ in from your zones${avoid}.`);
      tested();void autoExport();return route;
    }catch(e){if(seq===planSeq){l.route=null;planError=e.message;const m=/pin (\d+)/i.exec(e.message);blockedPin=m?Number(m[1])-1:-1;draw();status('#sim-plan-status',e.message+(m?' It is shown in red.':''));}return null;}
  }
  // Plan each route shape, test-drive them all with the real follower and physics, keep the fastest
  // one that touched no zone and ended on target.
  async function optimize(){
    try{await ready();}catch(e){return status('#sim-plan-status',e.message);}schedulePlan.cancel();const l=L();if(!l.pins.length)return status('#sim-plan-status','Add pins first.');optimizing=true;optimize.layoutId=l.id;transport();const seq=++planSeq,generation=load.seq;
    try{
      const shapes=C.drives[project.robot.drivetrain].holonomic?[['sharp'],['rounded'],['spline',.6],['spline',1]]:[['sharp']],routes=[];
      let reason=null;for(const [style,tension] of shapes){try{routes.push({style,tension,route:await planWith(planRequest(style,tension))});}catch(e){reason=reason||e;}}
      if(!routes.length){const m=/pin (\d+)/i.exec(reason?.message||'');blockedPin=m?Number(m[1])-1:-1;planError=reason?.message||'';draw();throw Error((reason?.message||'No safe route.')+(m?' It is shown in red.':''));}status('#sim-plan-status','Test-driving routes…');
      const results=await call('evaluate',routes.map(r=>({heading:r.route.heading,segments:r.route.segments,stops:r.route.stops,turns:!!r.route.turns,nonholonomic:!!r.route.nonholonomic,preview:true})));
      if(seq!==planSeq||generation!==load.seq||l!==L())throw Error('The setup or route changed while testing. Run Find fastest route again.');
      const last=l.pins.at(-1),rows=routes.map((r,i)=>{const x=results[i];const ok=!!(x?.ok&&x.violations===0&&Math.hypot(x.truth.x-last.x,x.truth.y-last.y)<1.5);return {style:r.style,tension:r.tension,time:x?.time,ok,note:!x?.ok?x?.error:x.violations?'touched a zone':ok?'':'missed the last pin'};});
      const best=rows.filter(r=>r.ok).sort((a,b)=>a.time-b.time)[0];if(!best)throw Error('None of the route shapes finished cleanly. Try more space around zones.');
      const chosen=routes[rows.indexOf(best)];l.style=best.style;l.route=chosen.route;l.tested=rows.map(r=>({...r,best:r===best}));save();pressed('style',l.style);draw();tested();
      status('#sim-plan-status',`Fastest: ${STYLES[best.style]} in ${best.time.toFixed(2)} s. It is now the planned route.`);void autoExport();
    }catch(e){status('#sim-plan-status',e.message);}finally{optimizing=false;transport();}
  }
  function tested(){const rows=L().tested||[];$('#sim-tested').replaceChildren(...rows.map(r=>{const d=document.createElement('div');d.className='sim-tested-row'+(r.best?' best':'');d.textContent=`${STYLES[r.style]}${r.style==='spline'?(r.tension===1?' (wide)':' (tight)'):''}: ${finite(r.time)&&r.ok?r.time.toFixed(2)+' s':r.note}${r.best?' · fastest':''}`;return d;}));}
  $('#sim-optimize').onclick=()=>void optimize();
  for(const b of $$('[data-style]'))b.onclick=()=>{L().style=b.dataset.style;pressed('style',L().style);changed('plan');};
  for(const b of $$('[data-rotate]'))b.onclick=()=>{L().rotate=b.dataset.rotate==='auto';rotatePanel();changed('plan');};
  function rotatePanel(){const holonomic=C.drives[project.robot.drivetrain].holonomic;pressed('rotate',holonomic?(L().rotate===false?'off':'auto'):'auto');for(const b of $$('[data-rotate]'))b.disabled=!holonomic;
    $('#sim-rotate-note').textContent=!holonomic?'Tank drivetrains always turn the whole chassis between straight legs, backing out to line up when there is no room to turn.':L().rotate===false?'The robot keeps its starting heading for the whole route.':'The planner turns the robot in place when that fits it past an obstacle more quickly than driving around. Dashed outlines show where it turns.';}
  $('#sim-clearance').onchange=e=>{L().clearance=Math.min(6,Math.max(planner.MIN_CLEARANCE,finite(e.target.valueAsNumber)?e.target.valueAsNumber:L().clearance));e.target.value=L().clearance;changed('plan');};
  $('#sim-clear-pins').onclick=()=>{L().pins=[];selected=null;changed('pins');};
  $('#sim-clear-zones').onclick=()=>{L().zones=[];selected=null;changed('zones');};

  // ------------------------------------------------------------------ export
  function exportText(format){
    const l=L(),route=l.route;if(!route)throw Error('Plan a route first.');
    if(format==='motionmodule')return window.DeckSimMotionModule.autonomous(route,project.timing,{name:l.name});
    if(format==='timed')return JSON.stringify({format:'deck-timed-drive-v1',controller:project.controller,units:'inches',feedback:'IMU heading only; no X/Y feedback',notice:'Simulation schedule; not a MotionModule firmware integration.',start,field:l.field,...window.DeckTimed.compile(route,project.timing)},null,2);
    const lay={name:l.name,field:l.field,fieldName:GAMES[l.field],width:l.width,height:l.height,start,zones:l.zones};
    return format==='java'?exporter.java(route,lay,{className:project.export.className,packageName:project.export.packageName,polygon:planner.polygon}):exporter.pp(route,lay,{polygon:planner.polygon});
  }
  // MotionModule actions run the team's code in robot_actions.py, created beside autonomous.py once.
  const companion=format=>format==='motionmodule'&&L().route?{name:'robot_actions.py',text:window.DeckSimMotionModule.actionsFile(L().route,{name:L().name})}:undefined;
  async function exportRoute(format){
    try{const text=exportText(format),name=format==='java'?project.export.className+'.java':format==='motionmodule'?'autonomous.py':(L().name.replace(/[^\w -]/g,'')||'route')+(format==='timed'?'.json':'.pp');
      const r=await api.simFile('export-save',{key:L().id,format,text,name,keep:project.export.keep,companion:companion(format)});
      if(r)status('#sim-export-status',(project.export.keep?`Exported ${r.name}. It updates whenever this route changes.`:`Exported ${r.name}.`)+(r.created?` Created ${r.created} for your action code.`:''));}
    catch(e){status('#sim-export-status',e.message);}
  }
  async function autoExport(){
    if(!native||!project.export.keep||!L().route)return;
    for(const format of ['java','pp','timed','motionmodule']){try{const r=await api.simFile('export-update',{key:L().id,format,text:exportText(format),companion:companion(format)});if(r)status('#sim-export-status',`Updated ${r.name}.`);}catch(e){status('#sim-export-status',e.message);}}
  }
  async function exportPanel(){
    $('#sim-export-keep').checked=project.export.keep;$('#sim-export-package').value=project.export.packageName;$('#sim-export-class').value=project.export.className;status('#sim-export-status','');
    if(native&&project.export.keep){try{const t=await api.simFile('export-status',{key:L().id});status('#sim-export-status',t?`Keeping ${t.name} updated.`:'');}catch{}}
  }
  // Everything a Control Hub needs for this route: OpMode, Pedro Constants, route (and a drive-encoder
  // localizer when used), written under a TeamCode java folder the team picks.
  function teamCode(route){const l=L(),lay={name:l.name,field:l.field,fieldName:GAMES[l.field],width:l.width,height:l.height,start,zones:l.zones};
    if(!info)throw Error('Wait for the simulation to load.');
    return window.DeckSimFtc.files({route,layout:lay,tuning:info.tuning,robot:info.robot,localization:project.sensors.localization,setupName:project.setupName,packageName:project.export.packageName,className:project.export.className,
      routeJava:exporter.java(route,lay,{className:project.export.className,packageName:project.export.packageName,polygon:planner.polygon})});}
  $('#sim-export-teamcode').onclick=async()=>{try{if(!L().route)throw Error('Plan a route first.');const out=teamCode(L().route),r=await api.simFile('teamcode-save',{files:out.files,keep:out.keep});if(r)status('#sim-export-status',`Wrote ${r.count} TeamCode files under ${r.name}${r.kept?.length?` (kept your ${r.kept.join(', ')})`:''}. OpMode: ${out.opMode.split('.').pop()}. Mechanism code goes in RobotActions.java.`);}catch(e){status('#sim-export-status',e.message);}};
  $('#sim-export-motionmodule').onclick=()=>void exportRoute('motionmodule');
  $('#sim-export-java').onclick=()=>void exportRoute('java');$('#sim-export-pp').onclick=()=>void exportRoute('pp');$('#sim-export-timed').onclick=()=>void exportRoute('timed');
  $('#sim-export-keep').onchange=e=>{project.export.keep=e.target.checked;save();if(!project.export.keep&&native)void api.simFile('export-forget',{key:L().id}).catch(()=>{});status('#sim-export-status',project.export.keep?'Export once; the file then follows every route change.':'');};
  $('#sim-export-package').onchange=e=>{try{exporter.validName(project.export.className,e.target.value.trim());project.export.packageName=e.target.value.trim();save();status('#sim-export-status','');}catch(err){status('#sim-export-status',err.message);}};
  $('#sim-export-class').onchange=e=>{try{exporter.validName(e.target.value.trim(),project.export.packageName);project.export.className=e.target.value.trim();save();status('#sim-export-status','');}catch(err){status('#sim-export-status',err.message);}};

  // ------------------------------------------------------------------ run
  function programPanel(){pressed('program',project.program.kind);$('#sim-program-note').textContent=project.program.kind==='opmode'?'Runs the exported autonomous OpMode, Pedro Constants and route on a virtual Control Hub: Pedro\'s real FTC drivetrain and localizer code with simulated motors, encoders and IMU.':'';$('#sim-source-box').hidden=project.program.kind!=='source';$('#sim-source').value=project.program.source;$('#sim-source-name').textContent=project.program.name?`Program · ${project.program.name}`:'Program';}
  for(const b of $$('[data-program]'))b.onclick=()=>{project.program.kind=b.dataset.program;save();programPanel();};
  $('#sim-source').oninput=e=>{project.program.source=e.target.value;save();};
  $('#sim-java-example').onclick=()=>{project.program={kind:'source',name:'MyAuto.java',source:EXAMPLE};save();programPanel();};
  $('#sim-java-open').onclick=async()=>{try{const file=await api.simFile('java-open');if(file){project.program={kind:'source',name:file.name,source:file.source};save();programPanel();}}catch(e){status('#sim-run-status',e.message);}};
  $('#sim-run').onclick=async()=>{
    const attempt=++runAttempt;$('#sim-error').hidden=true;status('#sim-run-status','Starting…');runState='starting';transport();
    try{
      await ready();if(attempt!==runAttempt)return;schedulePlan.cancel();const teleop=project.practice.mode==='teleop',needsRoute=['route','opmode'].includes(project.program.kind)&&!teleop;let route=L().route;if(needsRoute)route=await plan();
      if(attempt!==runAttempt)return;
      if(!route&&needsRoute){runState='idle';transport();return status('#sim-run-status',L().pins.length?`The route can't be planned yet: ${planError||'check the Path planning tab.'}`:'Set a starting pose and add route pins first.');}
      const exported=project.program.kind==='opmode'&&!teleop?teamCode(route):null;
      const payload={kind:project.program.kind,preview:needsRoute,source:project.program.kind==='source'?project.program.source:undefined,files:exported?.files,opMode:exported?.opMode,route:route?{heading:route.heading,segments:route.segments,stops:route.stops,turns:!!route.turns}:null};
      trail=[];setTool('select');const r=await api.sim('practice',{mode:project.practice.mode,timing:project.practice,program:payload});if(attempt!==runAttempt)return;if(!r.ok){runState='idle';if(r.error!=='Stopped.')status('#sim-run-status',r.error);}else{runState='running';if(teleop)status('#sim-run-status','Teleop practice started. Centre the controller sticks to enable driving.');}
    }catch(e){runState='idle';status('#sim-run-status',e.message);}transport();
  };
  $('#sim-play').onclick=()=>void call(frame?.playing?'pause':'play').catch(e=>status('#sim-run-status',e.message));
  $('#sim-stop').onclick=()=>{runAttempt++;runState='idle';status('#sim-run-status','Stopped.');transport();void call('stop').catch(e=>status('#sim-run-status',e.message));};
  $('#sim-reset').onclick=()=>{runAttempt++;runState='idle';trail=[];void call('reset').catch(e=>status('#sim-run-status',e.message));};
  $('#sim-speed').onchange=e=>void call('speed',Number(e.target.value)).catch(()=>{});
  const clockText=seconds=>`${Math.floor(Math.ceil(seconds)/60)}:${String(Math.ceil(seconds)%60).padStart(2,'0')}`;
  function practicePanel(current=frame?.practice){pressed('practice',project.practice.mode);for(const [id,k] of [['#sim-auto-seconds','autoSeconds'],['#sim-transition-seconds','transitionSeconds'],['#sim-teleop-seconds','teleopSeconds']])if(document.activeElement!==$(id))$(id).value=project.practice[k];
    $('#sim-practice-phase').textContent=current?{auto:'Autonomous',transition:'Transition · controls locked',teleop:current.neutralRequired?'Teleop · centre sticks':'Teleop · Controller 1',finished:'Complete'}[current.phase]:'Ready';$('#sim-practice-time').textContent=clockText(current?.remaining??(project.practice.mode==='teleop'?project.practice.teleopSeconds:project.practice.autoSeconds));
    $('#sim-practice-help').textContent=project.practice.mode==='autonomous'?'Autonomous only. Controller driving stays disabled.':project.practice.mode==='match'?'Auto → transition → teleop. Early autonomous completion holds still until its timer ends. Controller 1 is enabled only in teleop.':'Controller 1: left stick moves, right stick turns, left bumper slows down. Release both sticks after starting or reconnecting.';
    $('[data-program]').parentElement.hidden=project.practice.mode==='teleop'||project.controller==='motionmodule';$('#sim-source-box').hidden=project.practice.mode==='teleop'||project.controller==='motionmodule'||project.program.kind!=='source';
  }
  for(const b of $$('[data-practice]'))b.onclick=()=>{if(native&&(frame?.playing||frame?.practice))void call('stop');project.practice.mode=b.dataset.practice;save();practicePanel(null);transport();};
  for(const [id,key] of [['#sim-auto-seconds','autoSeconds'],['#sim-transition-seconds','transitionSeconds'],['#sim-teleop-seconds','teleopSeconds']])$(id).onchange=e=>{const n=e.target.valueAsNumber;if(finite(n)){project.practice[key]=Math.min(3600,Math.max(key==='transitionSeconds'?0:.1,n));save();}e.target.value=project.practice[key];window.DeckNumberSliders?.sync(e.target);practicePanel();};

  // ------------------------------------------------------------------ robot and model
  function robotPanel(committed=false){
    const r=project.robot;for(const [id,value] of Object.entries({'#sim-drivetrain':r.drivetrain,'#sim-intake':r.intakeIn,'#sim-length':r.length,'#sim-width':r.width,'#sim-height':r.heightIn,'#sim-mass':r.massLb,'#sim-rpm':r.driveRpm,'#sim-amps':r.driveAmps,'#sim-drive-style':r.driveStyle,'#sim-appearance':r.appearance,'#sim-localization':project.sensors.localization,'#sim-noise':+(project.sensors.noise*100).toFixed(2),'#sim-drift':project.sensors.gyroDrift,'#sim-maxspeed':project.tuning.maxPathSpeed??(info?.tuning.maxPathSpeed||.6),'#sim-transp':project.tuning.translationalP??(info?.tuning.translationalP||.5)}))inputValue(id,value,committed);
    const f=geometry().footprint;let text=`Collision footprint: ${f.front.toFixed(2)} in front, ${f.rear.toFixed(2)} in rear, ${f.half.toFixed(2)} in each side. Routes keep this whole area clear.`;
    const ext=field.extents(start.heading,C.footprint(r)),bounds=geometry().bounds;if(ext[1]-ext[0]>bounds.x1-bounds.x0||ext[3]-ext[2]>bounds.y1-bounds.y0)text+=' This robot does not fit in this field at the selected heading. Increase the field size or reduce the robot size.';
    if(info){const e=info.robot;if(e.length!==r.length||e.width!==r.width)text+=` (Applied ${e.length} × ${e.width} in: the closest size the physics supports.)`;}
    $('#sim-footprint').textContent=text;inputValue('#sim-clearance',L().clearance);pressed('style',C.drives[r.drivetrain].holonomic?L().style:'sharp');rotatePanel();for(const button of $$('[data-style]'))button.disabled=!C.drives[r.drivetrain].holonomic&&button.dataset.style!=='sharp';
    const d=C.drives[r.drivetrain];$('#sim-drive-note').textContent=d.approximation?d.approximation+'. This is a family approximation, not a motor-by-motor model.':!d.holonomic?'Tank routes stop, turn the chassis, then drive each straight leg. Turns use physical time and need clearance around the whole robot.':'Holonomic drivetrain: routes may move sideways while keeping their starting heading.';
    const s=C.sensors[project.sensors.localization],motion=project.controller==='motionmodule';pressed('controller',project.controller);$('#sim-controller-note').textContent=motion?'MotionModule: onboard IMU, with optional 2-pod, 3-pod or OTOS odometry. No drive motor encoders or Pinpoint. Odometry is simulated here; firmware integration remains separate.':'FTC Control Hub: drive motor encoders and built-in IMU by default. Select tracking pods, Pinpoint or OTOS to match your robot.';
    const select=$('#sim-localization');if(select.dataset.forController!==project.controller){select.innerHTML=options(Object.fromEntries(C.sensorChoices(project.controller).map(k=>[k,C.sensors[k].name])),project.sensors.localization);select.dataset.forController=project.controller;}inputValue('#sim-localization',project.sensors.localization);select.disabled=false;
    const device=['fused','optical'].includes(project.sensors.localization),sources=device?{device:project.sensors.localization==='fused'?'Pinpoint integrated IMU':'OTOS integrated IMU'}:motion?{module:'MotionModule IMU',external:'Separate IMU over I²C'}:{hub:'Control Hub built-in IMU',external:'Separate IMU over I²C'};
    if(!Object.hasOwn(sources,project.imuSource))project.imuSource=Object.keys(sources)[0];const sourceKey=JSON.stringify(sources);if($('#sim-imu-source').dataset.options!==sourceKey){$('#sim-imu-source').innerHTML=options(sources,project.imuSource);$('#sim-imu-source').dataset.options=sourceKey;}inputValue('#sim-imu-source',project.imuSource);
    $('#sim-imu-note').textContent=device?'This odometry device supplies its own fused heading. Simulated error settings model the result; no vendor driver runs here.':motion?'The IMU measures heading and angular motion, not field X/Y.':'The Control Hub already includes an IMU. External I²C is an alternative heading source, not a position sensor.';
    $('#sim-sensor-note').textContent={gyro:'0 tracking pods. IMU heading only; translation is timed and cannot correct a missed position.',odometry:'2 unpowered tracking pods: one parallel and one perpendicular, plus the selected IMU.',odometry3:'3 unpowered tracking pods: two parallel and one perpendicular, plus the selected IMU.',encoders:'Drive motor encoders plus IMU. No separate tracking pods; wheel slip affects the position estimate.',fused:'2 dead-wheel pods connected to the Pinpoint odometry computer, with its integrated IMU.',optical:'SparkFun OTOS measures optical X/Y motion and heading. No odometry pods; mounting height and surface affect real performance.'}[project.sensors.localization];
    $('#sim-timed-settings').hidden=s.translation;for(const [id,key]of TIMED_FIELDS)inputValue(id,project.timing[key],committed);$('#sim-noise').disabled=!s.translation;
    const hub=!motion&&s.translation&&['mecanum','tank'].includes(C.drives[project.robot.drivetrain].engine);$('#sim-export-java').hidden=motion||!s.translation;$('#sim-export-timed').hidden=s.translation;$('#sim-export-teamcode').hidden=!hub;$('#sim-export-motionmodule').hidden=!motion;for(const b of $$('[data-program=opmode]'))b.hidden=!hub;if(!hub&&project.program.kind==='opmode')project.program.kind='route';$('#sim-execution-note').textContent=s.translation?'Pedro Java and path geometry exports require your real robot’s configured and tuned localizer.':'Timed-command JSON records powers, seconds, pauses and an IMU heading target. It does not configure or deploy to a robot.';
    transport();
  }
  const settle=()=>{project=sanitize(project);save();changed('robot');reload();};
  const num=(id,set)=>{$(id).onchange=e=>{let v=e.target.valueAsNumber;if(finite(v)){const min=parseFloat(e.target.min),max=parseFloat(e.target.max);if(finite(min))v=Math.max(min,v);if(finite(max))v=Math.min(max,v);set(v);settle();}robotPanel(true);};};
  // Bundled chassis CAD is only in personal local builds; public releases show the plain footprint.

  const chassisFor=drive=>{const id=C.drives[drive].engine==='swerve'?'swechanum':drive==='mecanum'?'strafer':'plain';return builtins.has(id)?id:'plain';};
  function appearanceOptions(){for(const o of $('#sim-appearance').options)if(['strafer','swechanum'].includes(o.value)){o.disabled=!builtins.has(o.value);o.textContent=o.textContent.replace(/ \(not included in this build\)$/,'')+(o.disabled?' (not included in this build)':'');}}
  if(native&&typeof api.simFile==='function')void api.simFile('assets').then(a=>{builtins=new Set(a.robots);Object.assign(window.DeckFieldArt.available,a.fields);appearanceOptions();void placeModel();}).catch(()=>{});
  $('#sim-drivetrain').onchange=e=>{project.robot.drivetrain=e.target.value;if(!project.model)project.robot.appearance=chassisFor(e.target.value);settle();robotPanel();void placeModel();};
  num('#sim-intake',v=>project.robot.intakeIn=Math.max(0,v));
  num('#sim-length',v=>project.robot.length=v);num('#sim-width',v=>project.robot.width=v);num('#sim-mass',v=>project.robot.massLb=v);num('#sim-rpm',v=>project.robot.driveRpm=v);
  num('#sim-height',v=>project.robot.heightIn=v);num('#sim-amps',v=>project.robot.driveAmps=v);$('#sim-drive-style').onchange=e=>{project.robot.driveStyle=e.target.value;settle();};
  num('#sim-noise',v=>project.sensors.noise=v/100);num('#sim-drift',v=>project.sensors.gyroDrift=v);
  num('#sim-maxspeed',v=>project.tuning.maxPathSpeed=Math.min(1,Math.max(.1,v)));num('#sim-transp',v=>project.tuning.translationalP=Math.min(5,Math.max(0,v)));
  $('#sim-localization').onchange=e=>{project.sensors.localization=e.target.value;const error=C.sensors[e.target.value].error;project.sensors.noise=error[1];project.sensors.gyroDrift=error[2];save();robotPanel();reload();};
  $('#sim-imu-source').onchange=e=>{project.imuSource=e.target.value;save();robotPanel();reload();};
  for(const b of $$('[data-controller]'))b.onclick=()=>{if(project.controller===b.dataset.controller)return;const oldKey=project.controller==='motionmodule'?'motionSensors':'ftcSensors';project[oldKey]={...project.sensors,imuSource:project.imuSource};project.controller=b.dataset.controller;const saved=project[project.controller==='motionmodule'?'motionSensors':'ftcSensors'];project.sensors=saved?{...saved}:{localization:C.localization(project.controller),gyroDrift:.5,noise:project.controller==='motionmodule'?0:.05};project.imuSource=saved?.imuSource||(project.controller==='motionmodule'?'module':'hub');if(project.controller==='motionmodule')project.program.kind='route';save();robotPanel();programPanel();practicePanel(null);reload();};
  for(const [id,key]of TIMED_FIELDS)num(id,v=>project.timing[key]=v);
  // Floor calibration on the simulated robot: drive 1 s and 2 s at the drive power, fit speed and roll-on.
  $('#sim-timed-calibrate').onclick=async()=>{try{await ready();const r=await call('calibrateTimed',[project.timing.power]);Object.assign(project.timing,window.DeckTimed.settings({...project.timing,...r}));save();robotPanel();reload();status('#sim-timed-status',`Measured ${r.forwardSpeed} in/s forward and ${r.strafeSpeed} in/s strafe at full power; stop compensation ${r.stopping} s / ${r.strafeStopping} s.`);}catch(e){status('#sim-timed-status',e.message);}};
  $('#sim-appearance').onchange=e=>{project.robot.appearance=e.target.value;if(e.target.value!=='custom')project.model=null;if(e.target.value==='swechanum')project.robot.drivetrain='swerve';if(e.target.value==='strafer')project.robot.drivetrain='mecanum';settle();robotPanel();void placeModel();};
  const M=()=>window.DeckRobotModel,modelCache=new Map();
  async function three(){await script('vendor/three-view.js');await script('sim-robot-model.js');}
  // The stored one-body model, placed in the robot frame for 2D and 3D.
  async function placeModel(){
    const seq=placeModel.seq=(placeModel.seq||0)+1;
    const imported=project.model,builtin=!imported&&builtins.has(project.robot.appearance)?project.robot.appearance:null,identity=imported?.id||builtin,meta=imported||(builtin?{units:'in',...(project.orientations?.[builtin]||{front:builtin==='strafer'?'-x':'+x',top:'+z'})}:null);
    if(!identity||!native){model=null;modelUi();draw();view3d?.setModel(null);return;}
    try{await three();if(model?.id!==identity){model=modelCache.get(identity)||null;if(!model){const data=await api.simFile(builtin?'builtin-model':'model-read',identity);if(!data)throw Error('The saved robot model is missing. Import it again.');const object=builtin?await M().builtin(data.bytes,data.meta):await M().fromGlb(data.bytes);if(seq!==placeModel.seq)return;model={id:identity,geometry:object,builtin,meta:data.meta};modelCache.set(identity,model);}}
      if(seq!==placeModel.seq)return;const key=JSON.stringify([meta,geometry().footprint]);if(key!==model.placeKey){model.holder=M().place(model.geometry,meta||{front:'+x',top:'+z',units:'in'},geometry().footprint);model.picture=M().silhouette(model.holder);model.placeKey=key;}
    }catch(e){model=null;status('#start-status',e.message);}
    modelUi();draw();view3d?.setModel(model?.holder||null);
  }
  function modelUi(){
    const meta=project.model,builtin=model?.builtin;$('#sim-model-box').hidden=!meta&&!builtin;$('#sim-model-drop').classList.toggle('compact',!!meta||!!builtin);
    $('#sim-model-credit').textContent=builtin?model.meta?.credit||'':meta?'Your CAD is shown as one rigid body.':'Choose a bundled chassis or import your own.';
    if(!meta&&!builtin){modelPreview?.dispose();modelPreview=null;return;}
    $('#sim-model-remove').hidden=!!builtin;$('#sim-model-help').hidden=false;
    $('#sim-units-box').hidden=!!builtin||meta?.source==='step';$('#sim-model-units').value=meta?.units||'in';
    const s=model?.holder?.userData.size,name=meta?.name||model?.meta?.name||'Chassis',orientation=project.model||project.orientations?.[builtin]||{front:builtin==='strafer'?'-x':'+x',top:'+z'};$('#sim-mesh-size').textContent=s?`${name}: fitted to ${s.length.toFixed(1)} × ${s.width.toFixed(1)} in, ${s.height.toFixed(1)} in tall. Your chassis dimensions define the red hitbox; CAD stays visual.`:name;
    if(M())$('#sim-orientation-summary').textContent=['front','back','left','right','top','bottom'].map(side=>`${side}: ${M().modelAxisAt(orientation,side)}`).join(' · ')+'. The checkered floor is the bottom reference.';
    if(model?.holder){if(!modelPreview)modelPreview=M().preview($('#sim-model-preview'),{onSide:side=>{selectedSide=side;for(const b of $$('[data-assign-side]'))b.disabled=!side;status('#sim-model-help',side?`Selected ${side} face. Assign the robot side this face represents.`:'Select a flat cube face to assign a side. Edges and corners change only the view.');}});modelPreview.update(model.holder,geometry().footprint);}
  }
  async function importModel(get){
    status('#start-status','Reading your robot…');
    try{await three();const result=await get();if(!result){status('#start-status','');return;}
      if(result.kind==='step')status('#start-status',`Merging ${result.parts} parts into one body…`);
      const body=await M().bodyFromImport(result),glb=await M().toGlb(body.geometry),stored=await api.simFile('model-save',{name:result.name||'robot.glb',bytes:glb});
      project.model=M().meta({id:stored.id,name:result.name||stored.name,units:body.units,front:'+x',top:'+z',source:body.source});project.robot.appearance='custom';$('#sim-appearance').value='custom';model={id:stored.id,geometry:body.geometry};save();
      selectTab('setup');await placeModel();status('#start-status',`Imported ${body.parts} part${body.parts===1?'':'s'} as one body. Check the front and top with the cube below.`);
    }catch(e){status('#start-status',e.message);}
  }
  $('#sim-model-open').onclick=()=>void importModel(()=>api.simFile('model-open'));
  const drop=$('#sim-model-drop');
  for(const type of ['dragenter','dragover'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('over');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('over');const file=e.dataTransfer?.files?.[0];if(!file||!native)return;const filePath=api.simDropPath?.(file);if(!filePath)return status('#start-status','That file could not be opened.');void importModel(()=>api.simFile('model-drop',filePath));});
  const reorient=side=>{if(!selectedSide||!model)return;const builtin=model.builtin,current=project.model||project.orientations?.[builtin]||{front:builtin==='strafer'?'-x':'+x',top:'+z'},next=M().assignSide(current,selectedSide,side);if(project.model)Object.assign(project.model,next);else project.orientations[builtin]=next;save();selectedSide=null;for(const b of $$('[data-assign-side]'))b.disabled=true;status('#sim-model-help','Orientation saved. The floor marks the bottom.');void placeModel().then(()=>modelPreview?.look(null));};
  for(const b of $$('[data-assign-side]'))b.onclick=()=>reorient(b.dataset.assignSide);
  $('#sim-model-units').onchange=e=>{if(!project.model)return;project.model.units=e.target.value;save();void placeModel();};
  $('#sim-model-remove').onclick=()=>{project.model=null;project.robot.appearance='plain';model=null;save();robotPanel();modelUi();draw();view3d?.setModel(null);};

  // ------------------------------------------------------------------ layouts and files
  function layoutPanel(){
    $('#sim-game-elements').checked=L().elements;$('#sim-game-elements').disabled=L().field==='empty';
    const sel=$('#sim-field');sel.replaceChildren(...project.layouts.map(l=>new Option(`${l.name}${l.field!=='empty'&&!l.name.startsWith(GAMES[l.field])?` (${GAMES[l.field]})`:''}`,l.id,false,l.id===project.active)));
    const add=document.createElement('optgroup');add.label='Add a field';for(const [k,v] of Object.entries({empty:'New empty field',decode:'New DECODE layout',biobuzz:'New BIOBUZZ layout'}))add.append(new Option(v,'new:'+k));sel.append(add);
    const l=L();$('#sim-field-note').textContent=l.field==='empty'?'Only your own no-go zones on this field.':`Routes avoid ${GAMES[l.field]}'s ${info?.field===l.field?info.obstacleName:'field parts'} automatically (red dotted collision outlines).`;
    $('#sim-layout-delete').disabled=project.layouts.length<2;
    const b=info?.field===l.field?geometry().bounds:C.bounds(l);inputValue('#sim-field-width',b.x1-b.x0);inputValue('#sim-field-height',b.y1-b.y0);
    for(const id of ['#sim-field-width','#sim-field-height'])$(id).disabled=l.field!=='empty';
    $('#sim-field-size-note').textContent=l.field==='empty'?'Custom field. Dimensions are saved with this layout.':'Official field geometry is fixed. Add another layout to save a separate autonomous plan.';
  }
  async function switchLayout(id){
    if(native&&info)await api.sim('stop');project.active=id;info=null;const l=L();selected=null;trail=[];frame=null;start=l.start||field.edgePose(0,geometry());preview={...start};tool=l.start?'select':'start';save();fieldArtKey='';
    layoutPanel();inputs();pinPanel();zonePanel();tested();robotPanel();draw();view3d?.setField(null,l);await reloadNow();void exportPanel();
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
  for(const [id,key] of [['#sim-field-width','width'],['#sim-field-height','height']])$(id).onchange=e=>{const n=e.target.valueAsNumber;if(L().field!=='empty'||!finite(n)||n<1){e.target.value=L()[key];return layoutPanel();}L()[key]=n;info=null;fieldArtKey='';L().start=null;start=field.constrain(start,geometry());preview={...start};changed('field');layoutPanel();reload();};
  $('#sim-save').onclick=async()=>{
    try{save();const data=snapshot();if(project.model&&model){const glb=await M().toGlb(model.geometry);let s='';for(let i=0;i<glb.length;i+=32768)s+=String.fromCharCode(...glb.subarray(i,i+32768));data.modelData=btoa(s);}
      const r=await api.simFile('project-save',JSON.stringify({deckSimulation:2,...data}));if(r)status('#start-status',`Saved ${r.name}.`);}catch(e){status('#start-status',e.message);}
  };
  $('#sim-open').onclick=async()=>{
    try{const file=await api.simFile('project-open');if(!file)return;const raw=JSON.parse(file.text);if(raw?.deckSimulation!==2&&raw?.deckSimulation!==1)throw Error('That file is not a Deck simulation project.');
      const next=sanitize(raw);if(raw.modelData&&typeof raw.modelData==='string'&&raw.model){const bin=atob(raw.modelData),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const stored=await api.simFile('model-save',{name:raw.model.name||'robot.glb',bytes});next.model=modelMeta({...raw.model,id:stored.id});}
      save();const bank=project.setups,active=next.active;for(const l of next.layouts){const old=l.id;l.id=newId();if(old===active)next.active=l.id;}next.export.keep=false;next.setupId=newId();next.setupName=file.name.replace(/\.json$/i,'').slice(0,40);next.setups=bank;project=next;model=null;save();refreshAll();await switchLayout(project.active);await placeModel();status('#start-status',`Opened ${file.name}.`);}catch(e){status('#start-status',e.message);}
  };
  function setupPanel(){const sel=$('#sim-setup');sel.replaceChildren(...project.setups.map(s=>new Option(s.name,s.id,false,s.id===project.setupId)));$('#sim-setup-delete').disabled=project.setups.length<2;}
  async function switchSetup(id){save();const bank=project.setups,entry=bank.find(s=>s.id===id);if(!entry)return;project=sanitize({...entry.data,setups:bank,setupId:entry.id,setupName:entry.name});model=null;modelPreview?.dispose();modelPreview=null;save();setupPanel();selectTab('setup');await switchLayout(project.active);refreshAll();}
  $('#sim-setup').onchange=e=>void switchSetup(e.target.value);
  $('#sim-setup-new').onclick=()=>{save();if(project.setups.length>=20)return status('#start-status','Use at most 20 saved setups.');const next=defaults(),bank=project.setups;next.setupName=`Setup ${bank.length+1}`;next.setups=bank;project=next;save();setupPanel();model=null;selectTab('setup');void switchLayout(project.active).then(refreshAll);};
  function renameSetup(){const input=document.createElement('input'),sel=$('#sim-setup');input.value=project.setupName;input.maxLength=40;input.setAttribute('aria-label','Setup name');sel.hidden=true;sel.after(input);input.focus();input.select();let done=false;const finish=keep=>{if(done)return;done=true;if(keep&&input.value.trim())project.setupName=input.value.trim();input.remove();sel.hidden=false;save();setupPanel();};input.onblur=()=>finish(true);input.onkeydown=e=>{if(e.key==='Enter')finish(true);if(e.key==='Escape')finish(false);};}
  $('#sim-setup-rename').onclick=renameSetup;
  $('#sim-setup-delete').onclick=()=>{if(project.setups.length<2)return;const bank=project.setups.filter(s=>s.id!==project.setupId),entry=bank[0];project=sanitize({...entry.data,setups:bank,setupId:entry.id,setupName:entry.name});model=null;save();setupPanel();selectTab('setup');void switchLayout(project.active).then(refreshAll);};

  // ------------------------------------------------------------------ views
  function script(src){return script.cache[src]||(script.cache[src]=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>{delete script.cache[src];reject(Error(`Could not load ${src}.`));};document.head.append(s);}));}
  script.cache={};
  function state3d(){return {layout:L(),start,info,trail,frame,hitboxes:project.hitboxes};}
  async function setView(next){
    project.view=next;save();pressed('view',next);const three3=next==='3d';$('#sim-3d').hidden=!three3;graph.style.display=three3?'none':'';
    $('[data-tool]').parentElement.classList.toggle('three',three3);$('#sim-hitboxes').hidden=!three3;$('#sim-hitboxes').setAttribute('aria-pressed',String(project.hitboxes));
    if(three3){tool='select';try{await three();await script('sim-3d.js');view3d=view3d||window.DeckSim3D.create($('#sim-3d'));view3d.setField(info,L());view3d.setModel(model?.holder||null);view3d.update(frame,state3d());}catch(e){status('#sim-run-status',e.message);}}
    draw();
  }
  for(const b of $$('[data-view]'))b.onclick=()=>void setView(b.dataset.view);
  $('#sim-hitboxes').onclick=()=>{project.hitboxes=!project.hitboxes;save();$('#sim-hitboxes').setAttribute('aria-pressed',String(project.hitboxes));view3d?.update(frame,state3d());};
  $('#sim-game-elements').onchange=e=>{L().elements=e.target.checked;save();reload();};
  function selectTab(name){if(tab!==name){pointer=null;drag=null;}tab=name;root.dataset.tab=name;if(name==='plan'&&planningStep==='start')tool='start';for(const b of $$('[data-tab]')){b.setAttribute('aria-selected',String(b.dataset.tab===name));b.tabIndex=b.dataset.tab===name?0:-1;}for(const p of $$('[data-panel]'))p.hidden=p.dataset.panel!==name;$('.field-area').hidden=name==='setup';$('.sim-toolbar [data-tool]').parentElement.hidden=name==='run'||planningStep==='start';$('#sim-telemetry').hidden=name!=='run';$('.sim-planning-steps').hidden=name!=='plan';
    if(name==='plan')planningPanel();if(name!=='run'&&frame?.playing)void call('pause');view3d?.resize();modelPreview?.resize?.();}
  function planningPanel(){root.dataset.step=planningStep;$('#sim-start-step').hidden=planningStep!=='start';$('#sim-obstacle-step').hidden=planningStep!=='zones';$('#sim-route-step').hidden=planningStep!=='pins';for(const step of ['start','zones','pins']){const button=$('#sim-step-'+step);button.setAttribute('aria-pressed',String(planningStep===step));button.setAttribute('aria-selected',String(planningStep===step));}$('.sim-toolbar [data-tool]').parentElement.hidden=tab==='run'||planningStep==='start';for(const b of $$('[data-tool]'))b.hidden=['pin','draw'].includes(b.dataset.tool)?planningStep!=='pins':b.dataset.tool==='select'?false:planningStep!=='zones';}
  function setStep(next){if(sketch)finishShape();planningStep=next;selected=null;tool=next==='pins'?'pin':next==='start'?'start':'shape';preview={...start};planningPanel();draw();}
  const steps=$('.sim-planning-steps');root.insertBefore(steps,$('.simulation-layout'));steps.hidden=true;
  $('#sim-start-step').prepend($('#sim-start-controls'));
  $('#sim-setup-next').onclick=()=>{selectTab('plan');setStep('start');void setView('2d');};$('#sim-step-start').onclick=()=>setStep('start');$('#sim-step-zones').onclick=()=>setStep('zones');$('#sim-step-pins').onclick=()=>setStep('pins');$('#sim-zones-next').onclick=()=>setStep('pins');$('#sim-plan-next').onclick=()=>selectTab('run');
  $('#sim-start-next').onclick=()=>{try{commit(tool==='start'?preview:start);setStep('zones');}catch(e){status('#start-status',e.message);}};
  $('#sim-run-sensors').onclick=()=>{selectTab('setup');$('#sim-localization').focus();};
  $('#sim-route-start').onclick=()=>{void setView('2d');selectTab('plan');setStep('start');};
  $('#sim-obstacle-step').append($('#sim-zone-editor'),$('#sim-clear-zones'));
  for(const b of $$('[data-tab]'))b.onclick=()=>selectTab(b.dataset.tab);
  $('#start-form').addEventListener('submit',event=>{event.preventDefault();try{commit(Object.fromEntries(['x','y','heading'].map(key=>[key,$('#start-'+key).valueAsNumber])));}catch(error){status('#start-status',error.message);}});
  // Start at edge places the robot at a clear spot by the left wall immediately; drag it from there.
  const startAtEdge=()=>{const next={...(clearStart(geometry())||field.edgePose(start.heading,geometry())),heading:start.heading};try{commit(next);status('#start-status','At a clear spot by the left wall. Drag the robot to move it.');}catch(e){status('#start-status',e.message);}};
  $('#start-edge').onclick=startAtEdge;$('#start-edge-plan').onclick=startAtEdge;
  addEventListener('resize',()=>paint());
  function refreshAll(){setupPanel();layoutPanel();inputs();robotPanel();programPanel();practicePanel(null);modelUi();zonePanel();pinPanel();tested();void exportPanel();pressed('view',project.view);draw();transport();}
  save();selectTab('setup');refreshAll();
  return {activate(value){
    if(active&&!value){pointer=null;drag=null;status('#sim-run-status',runState==='running'?'Simulation closed. The running program was stopped.':'');if(tool==='start')preview={...start};frame=null;info=null;runState='idle';trail=[];draw();}
    const was=active;active=value;
    if(value&&!was){if(!L().start)tool='start';draw();void load().then(()=>{if(project.view==='3d')void setView('3d');void placeModel();});}
  }};
}};
