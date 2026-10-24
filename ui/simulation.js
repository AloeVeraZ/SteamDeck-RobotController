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
  const C=window.DeckSimConfig,MECH=window.DeckMechanisms,GAMES={empty:'Empty field',biobuzz:'BIOBUZZ'},STYLES={spline:'Smooth curves',sharp:'Straight lines'};
  const EXAMPLE=`import deck.pathing.DeckFollower;
import deck.sim.DeckAutonomous;
import deck.sim.SimRobot;

// Follows the planned route leg by leg, pausing at pins that have a pause.
// loop() runs every 1/60 s of simulation time.
public class MyAuto implements DeckAutonomous {
    private DeckFollower follower;
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
  const LEGACY_EXAMPLE=`import com.pedropathing.follower.Follower;
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
  const ROBOT=C.robot({},'ftc');
  const TIMED_FIELDS=[['#sim-timed-forward','forwardSpeed'],['#sim-timed-strafe','strafeSpeed'],['#sim-timed-startup','startup'],['#sim-timed-stopping','stopping'],['#sim-timed-strafe-stopping','strafeStopping'],['#sim-timed-heading','headingP']];
  const newId=()=>'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const layout=(game,name)=>({id:newId(),name,field:game,alliance:'red',width:144,height:144,elements:true,start:null,zones:[],pins:[],clearance:2,style:'spline',rotate:true,route:null,tested:null});
  function defaults(){const layouts=[layout('biobuzz','BIOBUZZ'),layout('empty','Empty field 1')];
    return {version:2,setupId:newId(),setupName:'Setup 1',setups:[],controller:'ftc',imuSource:'hub',ftcSensors:null,motionSensors:null,timing:window.DeckTimed.settings(),orientations:{},hitboxes:false,robot:{...ROBOT},sensors:{localization:'encoders'},tuning:{maxPathSpeed:.8},practice:{mode:'autonomous',autoSeconds:30,transitionSeconds:8,teleopSeconds:120},program:{kind:'route',name:'',source:EXAMPLE},model:null,view:'2d',mechanisms:window.DeckMechanisms.sanitize({}),layouts,active:layouts[0].id,export:{packageName:'org.firstinspires.ftc.teamcode',className:'PlannedRoute',keep:false}};}
  function cleanLayout(raw){
    // Last season's DECODE layouts are no longer offered; their zones and pins stay, on an empty field.
    const l=layout(Object.hasOwn(GAMES,raw?.field)?raw.field:'empty',(String(raw?.name||'Field')+(raw?.field==='decode'?' (was DECODE)':'')).slice(0,40));if(typeof raw?.id==='string'&&/^[\w-]{1,40}$/.test(raw.id))l.id=raw.id;
    const b=C.bounds({...raw,field:l.field});l.width=b.x1;l.height=b.y1;l.elements=raw?.elements!==false;
    if(raw?.start&&[raw.start.x,raw.start.y,raw.start.heading].every(finite))l.start={x:raw.start.x,y:raw.start.y,heading:field.heading(raw.start.heading)};
    // Game fields bring their own structures; your own obstacles are only for the empty field.
    if(Array.isArray(raw?.zones)&&l.field==='empty')l.zones=raw.zones.slice(0,24).map((z,i)=>{try{return planner.validateZone({...z,id:z.id||'zone-'+i});}catch{return null;}}).filter(Boolean);
    if(Array.isArray(raw?.pins))l.pins=raw.pins.slice(0,32).filter(q=>q&&finite(q.x)&&finite(q.y)).map(q=>({x:q.x,y:q.y,...planner.pinEffects(q)}));
    if(finite(raw?.clearance))l.clearance=Math.max(planner.MIN_CLEARANCE,raw.clearance);if(Object.hasOwn(STYLES,raw?.style))l.style=raw.style;else if(raw?.style==='rounded')l.style='sharp';l.rotate=raw?.rotate!==false;l.alliance=raw?.alliance==='blue'?'blue':'red';
    if(raw?.route&&Array.isArray(raw.route.segments)&&Array.isArray(raw.route.samples)&&Array.isArray(raw.route.stops))l.route=raw.route;if(Array.isArray(raw?.tested))l.tested=raw.tested.slice(0,6);
    return l;
  }
  function sanitize(raw){
    const p=defaults();if(!raw||typeof raw!=='object')return p;
    if(raw.version!==2&&raw.field){const old=cleanLayout({...raw,name:raw.field==='empty'?'Empty field 1':GAMES[raw.field],style:raw.smooth===false?'sharp':'spline'});p.layouts=p.layouts.map(l=>l.field===old.field?{...old,id:l.id}:l);}
    else if(Array.isArray(raw.layouts)&&raw.layouts.length)p.layouts=raw.layouts.slice(0,20).map(cleanLayout);
    p.active=p.layouts.some(l=>l.id===raw.active)?raw.active:p.layouts[0].id;if(raw.view==='3d')p.view='3d';
    p.robot=C.robot(raw.robot,raw.controller==='motionmodule'?'motionmodule':'ftc');if(raw.model)p.robot.appearance='custom';else if(p.robot.appearance==='swechanum'&&p.robot.drivetrain==='mecanum')p.robot.drivetrain='swerve';
    const s=raw.sensors||{},legacy={none:'gyro',encodersOnly:'encoders',ideal:'odometry',vision:'odometry'};if(Object.hasOwn(C.sensors,s.localization))p.sensors.localization=legacy[s.localization]||s.localization;
    p.controller=raw.controller==='motionmodule'?'motionmodule':'ftc';p.imuSource=['hub','external','module','device'].includes(raw.imuSource)?raw.imuSource:p.controller==='motionmodule'?'module':'hub';p.timing=window.DeckTimed.settings(raw.timing);p.ftcSensors=raw.ftcSensors&&typeof raw.ftcSensors==='object'?raw.ftcSensors:null;p.motionSensors=raw.motionSensors&&typeof raw.motionSensors==='object'?raw.motionSensors:null;p.sensors.localization=C.localization(p.controller,p.sensors.localization);
    const t=raw.tuning||{};for(const k of ['maxPathSpeed','translationalP','headingP'])if(finite(t[k]))p.tuning[k]=t[k];
    // 0.6 was the stored default path speed before the simulator chose one per robot; let it choose again.
    p.tuning.maxPathSpeed=finite(t.maxPathSpeed)&&(t.maxPathSpeed!==.6||t.powerSet)?Math.max(0,Math.min(1,t.maxPathSpeed)):.8;if(t.powerSet)p.tuning.powerSet=true;
    // Path correction is automatic: retire the old 0–2 strength and raw gain overrides.
    delete p.tuning.correctionScale;delete p.tuning.translationalP;delete p.tuning.headingP;
    const g=raw.program||{};p.program={kind:g.kind==='opmode'?'opmode':g.kind==='source'?'source':'route',name:typeof g.name==='string'?g.name.slice(0,120):'',source:typeof g.source==='string'&&g.source.length<=200000?(g.source===LEGACY_EXAMPLE?EXAMPLE:g.source):EXAMPLE};
    p.model=modelMeta(raw.model);p.mechanisms=window.DeckMechanisms.sanitize(raw.mechanisms);p.sensors.driveEncoders=raw.sensors?.driveEncoders===true;p.robotPreset=Object.hasOwn(window.DeckMechanisms.PRESETS,raw.robotPreset)?raw.robotPreset:null;
    const e=raw.export||{};p.export={packageName:typeof e.packageName==='string'?e.packageName.slice(0,120):p.export.packageName,className:typeof e.className==='string'?e.className.slice(0,64):p.export.className,keep:!!e.keep};
    p.setupId=typeof raw.setupId==='string'?raw.setupId:p.setupId;p.setupName=String(raw.setupName||'Setup 1').slice(0,40);
    p.setups=Array.isArray(raw.setups)?raw.setups.slice(0,20).filter(s=>s&&typeof s.id==='string'&&typeof s.name==='string'&&s.data&&typeof s.data==='object').map(s=>({id:s.id,name:s.name.slice(0,40),data:s.data})):[];
    p.hitboxes=!!raw.hitboxes;p.orientations={};for(const id of ['strafer','swechanum']){const o=raw.orientations?.[id];if(o&&['+x','-x','+y','-y','+z','-z'].includes(o.front)&&['+x','-x','+y','-y','+z','-z'].includes(o.top)&&o.front[1]!==o.top[1])p.orientations[id]={front:o.front,top:o.top};}
    const practice=raw.practice||{};if(['autonomous','teleop','match'].includes(practice.mode))p.practice.mode=practice.mode;for(const k of ['autoSeconds','transitionSeconds','teleopSeconds'])if(finite(practice[k]))p.practice[k]=Math.max(k==='transitionSeconds'?0:.000001,practice[k]);
    return p;
  }
  // Model metadata is checked here too, before the 3D module has loaded.
  function modelMeta(raw){
    if(!raw||typeof raw.id!=='string'||!/^[0-9a-f]{32}\.glb$/.test(raw.id))return null;
    const axes=['+x','-x','+y','-y','+z','-z'],front=axes.includes(raw.front)?raw.front:'+x',top=axes.includes(raw.top)?raw.top:'+z';
    // Named CAD parts (chassis, intake, shooter...) with their boxes, as the import classified them.
    const pick=(v,list)=>list.includes(v)?v:undefined,parts=Array.isArray(raw.parts)?raw.parts.slice(0,64).filter(p=>p&&Array.isArray(p.box)&&p.box.length===6&&p.box.every(finite))
      .map(p=>JSON.parse(JSON.stringify({name:String(p.name||'').slice(0,80),role:pick(p.role,['chassis','intake','shooter','indexer'])||'other',pieces:pick(p.pieces,['pollen','nectar','both']),type:pick(p.type,['turret','fixed']),kind:pick(p.kind,['sweeper','siderollers','ramp']),key:typeof p.key==='string'?p.key.slice(0,400):undefined,chosen:p.chosen===true||undefined,box:p.box.slice()}))):[];
    return {id:raw.id,name:String(raw.name||'Robot model').slice(0,120),units:['in','mm','cm','m'].includes(raw.units)?raw.units:'in',front,top:front[1]===top[1]?(front[1]==='z'?'+x':'+z'):top,source:raw.source==='step'?'step':'mesh',...(parts.length?{parts}:{}),...(raw.autoSize===true?{autoSize:true}:{}),...(raw.bodyChassis===true?{bodyChassis:true}:{}),...(Array.isArray(raw.entered)?{entered:raw.entered.filter(k=>['mass','wheel','rpm'].includes(k))}:{})};
  }
  let project;try{project=sanitize(JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(OLD_KEY)));}catch{project=defaults();}
  let runData=null,liveFrame=null,reportKey='',lastReport=null,estimateTimer=0,estimateSeq=0;const estimates=new Map();
  let tab='setup',planningStep='start',setupStep='field',runAttempt=0,loadError='';
  const L=()=>project.layouts.find(l=>l.id===project.active)||project.layouts[0];
  if(!L().start){try{const legacy=field.restore(localStorage.getItem(field.KEY));if(legacy&&L().field==='empty')L().start=legacy;}catch{}}
  let diagnostics=[],analysisPending=false;
  let planError='',blockedPin=-1,sketch=null,cursor=null,info=null,frame=null,selected=null,tool='start',active=false,pointer=null,startGrab={dx:0,dy:0},stroke=null,drag=null,planSeq=0,keys=new Set(),trail=[],loading=null,view3d=null,runState='idle',logLines=[],model=null,modelPreview=null,selectedSide=null,optimizing=false;
  const fallbackFootprint=()=>C.footprint(project.robot);
  // The chassis alone (size settings, no intakes): the red outline in the model preview and what the model is fitted to.
  const chassisFootprint=()=>({front:project.robot.length/2,rear:project.robot.length/2,half:project.robot.width/2});
  const geometry=()=>({footprint:info?.footprint||fallbackFootprint(),bounds:info?.bounds||C.bounds(L())});
  const fieldHeight=()=>L().field==='empty'?L().height:144;
  let start=L().start||field.edgePose(0,geometry()),preview={...start};
  function snapshot(){const {setups,...data}=project;return JSON.parse(JSON.stringify(data));}
  // Everything in a setup (fields with their plans, robot, mechanisms, controller, program and run settings) is saved together.
  function save(){const note=root.querySelector('#sim-saved');recordPlan();
    try{const entry={id:project.setupId,name:project.setupName,data:snapshot()},i=project.setups.findIndex(s=>s.id===entry.id);if(i<0)project.setups.push(entry);else project.setups[i]=entry;localStorage.setItem(KEY,JSON.stringify(project));
      if(note){note.textContent=`Saved automatically · ${new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`;note.classList.remove('failed');}return true;}
    catch{if(note){note.textContent='Could not save: this computer’s storage for setups is full.';note.classList.add('failed');}return false;}}

  // ------------------------------------------------------------------ markup
  const options=(list,value)=>Object.entries(list).map(([k,v])=>`<option value="${k}"${k===value?' selected':''}>${v}</option>`).join('');
  const segmented=(attr,list,label)=>`<div class="segmented sim-seg" role="group" aria-label="${label}">${Object.entries(list).map(([k,v])=>`<button type="button" data-${attr}="${k}" aria-pressed="false">${v}</button>`).join('')}</div>`;
  const ICON=Object.fromEntries(Object.entries({add:'M12 5v14M5 12h14',rename:'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',trash:'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    open:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',save:'M12 4v11M7 10l5 5 5-5M5 20h14'}).map(([k,d])=>[k,`<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`]));
  root.innerHTML=`<div class="simulation-heading"><div><h1>Simulation</h1><p id="sim-subtitle"></p></div><span class="simulation-mode" id="sim-mode">Offline</span></div>
    <dialog id="sim-start-confirm" aria-labelledby="sim-start-confirm-title"><form method="dialog"><h2 id="sim-start-confirm-title">Is this your robot’s starting position?</h2><p id="sim-start-confirm-file" class="hint"></p><p>The simulation starts your robot exactly as this CAD is posed: slides down, arms and intakes stowed, everything inside the starting size the way it sits on the field before a match. Import it only if this is that starting configuration.</p><div class="button-row"><button type="submit" value="yes" class="primary" id="sim-start-yes">Yes, this is the starting position</button><button type="submit" value="no" class="secondary" id="sim-start-no">No, cancel</button></div></form></dialog>
    <dialog id="sim-setup-delete-confirm" aria-labelledby="sim-setup-delete-title"><form method="dialog"><h2 id="sim-setup-delete-title"></h2><p>This removes the setup with its fields, planned routes, robot, mechanisms and program. It cannot be undone, so save it to a file first if you might want it back.</p><div class="button-row"><button type="submit" value="yes" class="primary danger" id="sim-setup-delete-yes">Yes, delete this setup</button><button type="submit" value="no" class="secondary" id="sim-setup-delete-no">No, keep it</button></div></form></dialog>
    <nav class="sim-navigation" aria-label="Autonomous setup"><div class="sim-tabs" role="tablist">${Object.entries({setup:'Setup',plan:'Path planning',run:'Run & review'}).map(([k,t],i)=>`<button type="button" role="tab" data-tab="${k}" id="sim-tab-${k}" aria-controls="sim-panel-${k}"><span>${i+1}</span>${t}</button>`).join('')}</div></nav>
    <div class="sim-setup-bar"><span class="sim-setup-label" id="sim-setup-label">Saved setup</span><div class="sim-setup-picker"><button id="sim-setup" type="button" class="sim-setup-current" aria-haspopup="listbox" aria-expanded="false" aria-controls="sim-setup-list" aria-labelledby="sim-setup-label sim-setup"><span class="sim-setup-text"><strong></strong><small></small></span><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
      <div id="sim-setup-list" class="sim-setup-list" role="listbox" aria-labelledby="sim-setup-label" hidden></div></div>
      <div class="sim-setup-actions" role="group" aria-label="Manage setups"><button id="sim-setup-new" type="button" title="Start a new setup with default settings">${ICON.add}New</button><button id="sim-setup-rename" type="button" title="Rename this setup">${ICON.rename}Rename</button><button id="sim-setup-delete" type="button" class="danger" title="Delete this setup">${ICON.trash}Delete</button></div>
      <div class="sim-setup-actions" role="group" aria-label="Setup file"><button id="sim-open" type="button" title="Open a setup saved as a file">${ICON.open}Open file…</button><button id="sim-save" type="button" title="Save this setup to a file">${ICON.save}Save file…</button></div><span class="hint" id="sim-saved" role="status">Saves automatically on this computer</span>
      <div id="sim-setup-menu" class="sim-setup-menu" role="menu" aria-label="Setup actions" hidden><button type="button" role="menuitem" data-setup-act="open">Open</button><button type="button" role="menuitem" data-setup-act="clone">Clone</button><button type="button" role="menuitem" data-setup-act="rename">Rename</button><button type="button" role="menuitem" data-setup-act="delete" class="danger">Delete</button></div></div>
    <div class="simulation-layout"><section class="field-area" aria-label="Simulation field">
      <div class="sim-toolbar">
        ${segmented('tool',{select:'Select',rect:'Box',circle:'Circle',triangle:'Triangle',shape:'Shape',pin:'Click to add',draw:'Draw path'},'Field tool')}
        <div class="sim-transport"><button type="button" id="sim-play" class="secondary">Play</button><button type="button" id="sim-stop" class="secondary">Stop</button><button type="button" id="sim-reset" class="secondary">Reset</button><button type="button" id="sim-hitboxes" class="secondary" aria-pressed="false" hidden>Hitboxes</button><div class="segmented sim-seg sim-zoom" role="group" aria-label="Field zoom"><button type="button" data-zoom="out" aria-label="Zoom out" title="Zoom out (-)">−</button><button type="button" data-zoom="fit" aria-label="Fit the whole field" title="Fit the whole field (0)">Fit</button><button type="button" data-zoom="in" aria-label="Zoom in" title="Zoom in (+). Scroll to zoom where you point; middle-drag or Space+drag to pan.">+</button></div>${segmented('view',{'2d':'2D','3d':'3D'},'View')}</div>
      </div>
      <div class="sim-stage" id="sim-stage">
      <svg id="simulation-field" viewBox="-16 -9 168 172" role="group" tabindex="0" aria-label="Simulation field, inches from the bottom-left corner" aria-describedby="field-help field-coordinates">
        <rect class="field-floor" x="0" y="0" width="144" height="144"/><g class="field-grid"></g><g class="field-labels"></g>
        <g id="sim-overlay" transform="matrix(1 0 0 -1 0 144)"><rect id="sim-walls" class="sim-walls" x="0" y="0" width="144" height="144"/><g id="sim-obstacles"></g><g id="sim-elements"></g><g id="sim-zones"></g><g id="sim-route"></g><g id="sim-trail"></g><g id="sim-log-path"></g><g id="sim-pins"></g><polygon id="sim-start" class="sim-start" points=""/><polygon id="sim-estimate" class="sim-estimate" points=""/><circle id="sim-target" class="sim-target" r="1.2" cx="-99" cy="-99"/><g id="sim-draft"></g></g>
        <g id="field-robot"><image id="sim-robot-image" href="" x="0" y="0" width="0" height="0" preserveAspectRatio="none"/><rect x="-9" y="-9" width="18" height="18" rx="1.5"/><path d="M-3 0H5M2-3L5 0 2 3"/></g>
      </svg><div id="sim-3d" class="sim-3d" hidden></div><div id="sim-effects" class="sim-popover" role="dialog" aria-label="Pin and path settings" hidden></div><datalist id="sim-action-list"></datalist></div>
      <output id="field-coordinates"></output><p id="field-help" class="hint"></p>
      <dl id="sim-telemetry" class="sim-telemetry"></dl>
    </section>
    <section class="start-controls sim-panel" aria-label="Simulation settings">
      <div data-panel="setup" id="sim-panel-setup" role="tabpanel" aria-labelledby="sim-tab-setup">
        <div class="sim-setup-steps" role="tablist" aria-label="Setup step"><button id="sim-setup-step-field" data-setup-step="field" role="tab" type="button" class="secondary">1 · Field</button><button id="sim-setup-step-robot" data-setup-step="robot" role="tab" type="button" class="secondary">2 · Robot</button><button id="sim-setup-step-mechanisms" data-setup-step="mechanisms" role="tab" type="button" class="secondary">3 · Mechanisms</button><button id="sim-setup-step-controller" data-setup-step="controller" role="tab" type="button" class="secondary">4 · Robot controller</button></div>
        <section class="sim-setup-page" data-setup-page="field" aria-labelledby="sim-setup-step-field">
        <h2>Field</h2><p class="hint">Pick the field you will practise on. BIOBUZZ, this season's FTC game, uses the official playing area inside the perimeter wall; an empty field can be any size.</p><div class="sim-setup-cols"><div class="sim-setup-col"><div class="sim-row"><label class="sr-only" for="sim-field">Field</label><select id="sim-field"></select><button type="button" id="sim-layout-rename" class="icon-button" aria-label="Rename this field" title="Rename">✎</button><button type="button" id="sim-layout-delete" class="icon-button" aria-label="Delete this field" title="Delete">×</button></div>
        <p id="sim-field-note" class="hint"></p>
        <div id="sim-alliance-box"><label>Alliance</label>${segmented('alliance',{red:'Red',blue:'Blue'},'Alliance')}<p class="hint" id="sim-alliance-note">Which hive your shots aim at and score for. Switching moves the starting pose, paths and obstacles to that alliance’s side (turned 180° about the field centre, as the field is).</p></div></div><div class="sim-setup-col"><p id="sim-field-official" class="sim-field-official" hidden></p><div id="sim-field-size"><div class="start-xy"><div><label for="sim-field-width">Field width · in</label><input id="sim-field-width" type="number" min="1" step="any" data-slider-min="24" data-slider-max="288" data-slider-step="1"></div><div><label for="sim-field-height">Field depth · in</label><input id="sim-field-height" type="number" min="1" step="any" data-slider-min="24" data-slider-max="288" data-slider-step="1"></div></div><p class="hint" id="sim-field-size-note"></p></div>
        <label class="check"><input id="sim-game-elements" type="checkbox"> Physical game elements</label><p class="hint">Balls and field pieces use the game engine's physics, so your robot can push them and, with the mechanisms from step 3, pick them up and score. Turn off to drive on a clear field.</p></div></div>
        <section id="sim-start-controls"><h2 id="start-title">Starting pose</h2>
        <form id="start-form"><div class="sim-grid3"><div><label for="start-x">X · in</label><input id="start-x" type="number" step="any" required inputmode="decimal" data-slider-min="0" data-slider-max="144" data-slider-step="0.5" data-slider-submit></div><div><label for="start-y">Y · in</label><input id="start-y" type="number" step="any" required inputmode="decimal" data-slider-min="0" data-slider-max="144" data-slider-step="0.5" data-slider-submit></div><div><label for="start-heading">Heading °</label><input id="start-heading" type="number" step="any" required inputmode="decimal" data-slider-min="-180" data-slider-max="180" data-slider-step="1" data-slider-submit></div></div>
        <button class="primary" type="submit">Set starting pose</button></form>
        <div class="button-row"><button id="start-edge" class="secondary" type="button">Start at edge</button></div><p class="hint">Drag the robot, an existing obstacle or a pin from any planning tab.</p>
        <p id="start-status" role="status"></p></section>
        <div class="sim-setup-nav"><button type="button" class="primary" data-setup-go="robot">Next: robot →</button></div></section>
        <section class="sim-setup-page" data-setup-page="controller" aria-labelledby="sim-setup-step-controller" hidden><h2>Robot controller</h2><p class="hint">Choose what runs your robot. It decides which sensors and code exports are available.</p><div class="sim-setup-cols"><div class="sim-setup-col">${segmented('controller',{ftc:'FTC Control Hub',motionmodule:'MotionModule'},'Robot controller')}<p id="sim-controller-note" class="hint"></p>
        <h3 class="sim-setup-sub">Sensors</h3><p class="hint">Add the sensors on your robot. It always has an IMU for turning; add one position sensor (pods, Pinpoint or OTOS) and drive encoders if you use them.</p><ul id="sim-sensor-list" class="sim-sensor-list"></ul><label for="sim-sensor-add" class="sr-only">Add a sensor</label><select id="sim-sensor-add"></select><select id="sim-localization" hidden aria-hidden="true">${options(Object.fromEntries(Object.entries(C.sensors).filter(([,v])=>!v.hidden).map(([k,v])=>[k,v.name])),project.sensors.localization)}</select><p id="sim-sensor-note" class="hint"></p><label for="sim-imu-source">The IMU (measures turning)</label><select id="sim-imu-source"></select><p id="sim-imu-note" class="hint"></p></div><div class="sim-setup-col"><section id="sim-timed-settings"><h3>Timed driving</h3><p class="hint">With no position sensing, the robot drives each path for a set time, then stops. The times come from your robot settings in step 2 (drivetrain, motors, wheels and weight), so there is nothing to measure.</p>
          <dl id="sim-timed-summary" class="sim-timed-summary"></dl>
          <label class="check" for="sim-timed-measured"><input id="sim-timed-measured" type="checkbox"> Use numbers measured on my real robot instead</label>
          <div id="sim-timed-manual" hidden><p class="hint">Drive the robot at the default autonomous power for 1 s and for 2 s, and measure how far it went each time once it stopped. The difference is the distance per second.</p><h4 class="sim-setup-group">Speed</h4><div class="start-xy"><div><label for="sim-timed-forward">Forward speed at full power · in/s</label><input id="sim-timed-forward" type="number" min="0.000001" data-slider-max="500" step="any" data-slider-step="1" data-slider-min="1"></div><div><label for="sim-timed-strafe">Sideways speed at full power · in/s</label><input id="sim-timed-strafe" type="number" min="0.000001" data-slider-max="500" step="any" data-slider-step="1" data-slider-min="1"></div></div><h4 class="sim-setup-group">Starting and stopping</h4><div class="start-xy"><div><label for="sim-timed-startup">Speed-up time · s</label><input id="sim-timed-startup" type="number" min="0" data-slider-max="3" step="any"></div><div><label for="sim-timed-stopping">Coasting time · s</label><input id="sim-timed-stopping" type="number" min="0" data-slider-max="2" step="any"></div></div><div class="start-xy"><div><label for="sim-timed-strafe-stopping">Sideways coasting time · s</label><input id="sim-timed-strafe-stopping" type="number" min="0" data-slider-max="2" step="any"></div><div><label for="sim-timed-heading">Heading correction strength</label><input id="sim-timed-heading" type="number" min="0" data-slider-max="10" step="any"></div></div><p class="hint">Speed-up time is added to each drive while the robot gets going. Coasting time cuts power that much early, because the robot keeps rolling after the motors stop. Heading correction is how hard the robot steers to keep facing the right way; too high makes it wobble.</p></div><p id="sim-timed-status" class="hint" role="status"></p></section><section class="sim-advanced"><h3>Path correction</h3>

          <p class="hint">Always on, with nothing to set. The robot steers back in proportion to how far it drifts, eases off on large errors so it can brake in time instead of overshooting, and slows down along the path rather than give up correction when its motors run out of power. How strongly it corrects comes from this robot's speed, acceleration, weight and size, and the same controller goes into the exported robot code. The simulated sensors use the typical error of the sensors you picked.</p></section></div></div>
        <div class="sim-setup-nav"><button type="button" class="secondary" data-setup-go="mechanisms">← Back</button><button type="button" class="primary" id="sim-setup-next">Next: path planning →</button></div></section>
        <section class="sim-setup-page" data-setup-page="robot" aria-labelledby="sim-setup-step-robot" hidden><h2>Robot</h2><p class="hint">Import your robot’s CAD, load a robot you saved, or start from a ready-made robot below.</p>
        <div class="sim-robot-import"><h3 class="sim-setup-sub">Your robot’s CAD</h3>
        <div id="sim-model-drop" class="sim-drop"><p>Drop your robot's STEP file here (or GLB, STL, OBJ). Size, drivetrain, intakes and shooters fill in from it.</p><button id="sim-model-open" class="secondary" type="button">Import CAD…</button><p id="sim-model-import-status" class="sim-import-status" role="status"></p></div>
        <div class="sim-robot-file"><button type="button" class="secondary" id="sim-robot-load">Load robot from file…</button><p class="hint">A robot file you saved here before (size, motors, CAD, sensors and mechanisms). It is not a CAD file.</p></div></div>
        <h3 class="sim-setup-sub">Or start from</h3>${segmented('robot-source',{preset:'Preset robot',custom:'Custom robot'},'Start from')}
        <div id="sim-presets" class="sim-choice-cards sim-presets">${Object.entries(MECH.PRESETS).map(([id,p])=>`<button type="button" class="sim-choice" data-preset="${id}" aria-pressed="false"><strong>${p.name}</strong><span>${p.blurb}<br>${C.drives[p.robot.drivetrain].name} · ${p.robot.length} × ${p.robot.width} in · ${p.robot.driveRpm} RPM<br>${MECH.summary(MECH.presetMechanisms(id)).replace(/, starts with \d+$/,'')}</span></button>`).join('')}</div>
        <p id="sim-preset-note" class="hint"></p>
        <div id="sim-robot-custom">
        <div class="sim-robot-layout"><div class="sim-robot-cad"><h3>Your robot’s model</h3>
        <div hidden><label for="sim-appearance">Robot model</label><select id="sim-appearance">${options({strafer:'goBILDA Strafer · mecanum',swechanum:'NYC FIRST A301 Swechanum · swerve',plain:'Simple footprint',custom:'Your imported model'},project.robot.appearance)}</select><p id="sim-model-credit" class="hint"></p></div>
        <div id="sim-model-box" hidden><div id="sim-model-preview" class="sim-model-preview"></div>
          <p id="sim-model-help" class="hint">Click a side of the cube, then say what it is.</p>
          <div class="sim-side-assignments">${['front','back','left','right','top','bottom'].map(side=>`<button id="sim-model-${side}" data-assign-side="${side}" class="secondary" type="button" disabled>Make ${side}</button>`).join('')}</div>
          <div id="sim-units-box"><label for="sim-model-units">File units</label><select id="sim-model-units">${options({mm:'Millimetres',cm:'Centimetres',m:'Metres',in:'Inches'},'mm')}</select></div><p id="sim-orientation-summary" class="hint"></p>
          <div id="sim-part-pick" class="sim-part-pick" hidden><p><b id="sim-part-name"></b> <span id="sim-part-path" class="hint"></span></p><div id="sim-part-roles" class="chips" role="group" aria-label="What this part is"></div><div class="sim-part-nav"><button type="button" class="text-button" id="sim-part-up">↑ Whole assembly</button><button type="button" class="text-button" id="sim-part-clear">Done</button></div></div>
          <p id="sim-model-status" role="status"></p><button id="sim-model-remove" class="text-button" type="button">Remove model</button></div></div>
        <aside class="sim-robot-specs" aria-label="Robot settings"><p id="sim-needs-you" class="sim-needs-you" hidden></p><p class="hint sim-robot-example"><b>Measure your robot.</b> Numbers your CAD did not fill in start as an example robot. Simulated speed, timing and collisions all come from them, so replace them with your robot’s size, mass, wheel RPM and wheel diameter.</p>
        <div id="sim-parts" class="sim-parts" hidden><h3>Your robot’s parts</h3><p class="hint">Click a part on the model (again to go inside) or pick one here, then say what it is.</p><ul id="sim-part-list" class="sim-part-list"></ul></div>
        <h3>Chassis &amp; hitbox</h3><p id="sim-mesh-size" class="hint"></p><div class="start-xy"><div><label for="sim-length">Chassis length · in</label><input id="sim-length" type="number" min="0.000001" step="any" data-slider-min="4" data-slider-max="48" data-slider-step="0.25"></div><div><label for="sim-width">Chassis width · in</label><input id="sim-width" type="number" min="0.000001" step="any" data-slider-min="4" data-slider-max="48" data-slider-step="0.25"></div></div>
        <div class="start-xy"><div><label for="sim-height">Chassis height · in</label><input id="sim-height" type="number" min="0.000001" step="any" data-slider-min="1" data-slider-max="36" data-slider-step="0.25"></div><div><label for="sim-mass">Mass · lb</label><input id="sim-mass" type="number" min="0.000001" step="any" data-slider-min="0.5" data-slider-max="100" data-slider-step="0.1"></div></div><p id="sim-footprint" class="hint"></p>
        <h3>Drivetrain</h3><div class="start-xy"><div><label for="sim-drivetrain">Drivetrain</label><select id="sim-drivetrain">${options(Object.fromEntries(Object.entries(C.drives).map(([k,v])=>[k,v.name])),project.robot.drivetrain)}</select></div></div><p id="sim-drive-note" class="hint"></p>
        <h3>Motors &amp; power</h3><div class="start-xy"><div><label for="sim-rpm">Wheel RPM</label><input id="sim-rpm" type="number" min="0.000001" data-slider-max="6000" step="any" data-slider-step="1" data-slider-min="50"></div><div><label for="sim-wheel">Wheel diameter · mm</label><input id="sim-wheel" type="number" min="0.000001" step="any" data-slider-min="24" data-slider-max="200"></div></div>
        <label for="sim-maxspeed">Default autonomous motor power · 0–1</label><input id="sim-maxspeed" type="number" min="0" max="1" data-slider-max="1" data-slider-step="0.05" step="any"><p class="hint">0 stops the motors; 0.8 allows up to 80% power. Each path can override this default. Actual speed depends on gearing, load and traction.</p><label for="sim-drive-style">Teleop driving style</label><select id="sim-drive-style"><option value="robot">Robot-centric</option><option value="field">Field-centric</option></select><p class="hint">Field-centric: stick up is field +Y. Tank drivetrains turn toward that direction before driving.</p></aside></div>
        <div class="sim-robot-file sim-robot-save"><button type="button" class="secondary" id="sim-robot-save">Save robot to file…</button><p class="hint">Keeps this robot (size, motors, CAD, sensors and mechanisms) to load into any setup with “Load robot from file” at the top.</p></div>
</div>
        <div class="sim-setup-nav"><button type="button" class="secondary" data-setup-go="field">← Back</button><button type="button" class="primary" data-setup-go="mechanisms">Next: mechanisms →</button></div></section>
        <section class="sim-setup-page" data-setup-page="mechanisms" aria-labelledby="sim-setup-step-mechanisms" hidden><h2>Mechanisms</h2><p class="hint">What your robot does with game pieces. Routes run them with Intake, Spin up, Aim and Shoot.</p>
        <p id="mech-field-note" class="hint"></p>
        <div class="sim-mech-layout"><div class="sim-mech-main">
        <div id="mech-preset" class="sim-mech-preset" hidden><p id="mech-preset-text"></p></div>
        <h3>Intakes</h3><p class="hint">Grabs pieces off the floor. Add one per intake motor.</p>
        <div id="mech-intakes"></div><button type="button" class="secondary sim-mech-add" data-mech-add="intake">+ Add intake</button>
        <h3>Shooters</h3><p class="hint">Flywheels that launch pieces at your hive. Up to two; they spin up, aim and fire together.</p>
        <div id="mech-shooters"></div><button type="button" class="secondary sim-mech-add" data-mech-add="shooter">+ Add shooter</button>
        <section id="mech-timing"><h3>Shooter timing</h3>
        <label for="mech-spinup">Spin-up time · s</label><input id="mech-spinup" type="number" min="0" max="10" step="any" data-slider-max="3" data-slider-step="0.05">        <div class="start-xy"><div><label for="mech-transfer">Transfer time · s</label><input id="mech-transfer" type="number" min="0" max="10" step="any" data-slider-max="4" data-slider-step="0.05"></div><div><label for="mech-index">Indexing time · s</label><input id="mech-index" type="number" min="0" max="5" step="any" data-slider-max="2" data-slider-step="0.05"></div></div>
        <details class="sim-more"><summary>What these times mean</summary><p class="hint"><b>Spin-up time</b>: how long the flywheels take to reach shooting speed.</p><p class="hint"><b>Transfer time</b>: from a piece touching the intake to sitting in the shooter, ready, when the robot is empty. Pieces behind it stop sooner (with 4 slots and 2 s: 2, 1.5, 1, then 0.5 s).</p><p class="hint"><b>Indexing time</b>: after a shot, how long the next piece takes to move up into the shooter. A piece in the shooter fires as soon as the flywheel is at speed and the shooter points at the hive.</p></details>
        <div id="mech-turret-timing" class="start-xy"><div><label for="mech-turret-speed">Turret turn speed · °/s</label><input id="mech-turret-speed" type="number" min="5" max="2000" step="any" data-slider-max="720" data-slider-step="5"></div><div><label for="mech-turret-range">Turret turns up to · ± °</label><input id="mech-turret-range" type="number" min="5" max="180" step="1"></div></div>
        <details class="sim-mech-code"><summary>Robot configuration values</summary><div class="start-xy"><div><label for="mech-rpm">Flywheel speed · RPM</label><input id="mech-rpm" type="number" min="100" max="6000" step="any" data-slider-step="50"></div><div><label for="mech-tpr">Flywheel encoder ticks per revolution</label><input id="mech-tpr" type="number" min="1" max="10000" step="any" data-slider-max="2000"></div></div><div id="mech-turret-code"><label for="mech-turret-tpd">Encoder ticks per turret degree</label><input id="mech-turret-tpd" type="number" min="0.01" max="10000" step="any" data-slider-max="50"></div><p class="hint">Used in the exported robot code. Start the robot with each turret facing forward.</p></details></section>
        <section id="mech-preloads"><h3>Preloads</h3><p class="hint">BIOBUZZ robots hold up to 4 pieces in total and start with up to 4 pollen.</p>
        <div class="start-xy"><div><label for="mech-cap-pollen">Pollen capacity</label><input id="mech-cap-pollen" type="number" min="0" max="4" step="1"></div><div><label for="mech-cap-nectar">Nectar capacity</label><input id="mech-cap-nectar" type="number" min="0" max="4" step="1"></div></div>
        <p id="mech-nectar-note" class="hint"></p>
        <label for="mech-preload">Pollen it starts with</label><input id="mech-preload" type="number" min="0" max="4" step="1"></section>
        </div><aside class="sim-mech-aside">
          <div id="mech-model-box" class="sim-mech-model" hidden><div id="mech-model-preview" class="sim-model-preview"></div><ul id="mech-model-key" class="sim-mech-key"></ul><div id="mech-cad" class="sim-mech-cad" hidden><button type="button" class="secondary" id="mech-from-cad">Set up from your CAD</button><p class="hint" id="mech-cad-note"></p></div><p id="mech-model-help" class="hint">Each part is marked. Choose “Place on model” on a part, then click it here. Set the front in step 2.</p></div>
        </aside></div>
        <div class="sim-setup-nav"><button type="button" class="secondary" data-setup-go="robot">← Back</button><button type="button" class="primary" data-setup-go="controller">Next: robot controller →</button></div></section></div>
      <div data-panel="plan" id="sim-panel-plan" role="tabpanel" aria-labelledby="sim-tab-plan" hidden>
        <div class="sim-planning-steps" role="tablist" aria-label="Planning step"><button id="sim-step-start" role="tab" type="button" class="secondary">1 · Starting pose</button><button id="sim-step-zones" role="tab" type="button" class="secondary">2 · Field obstacles</button><button id="sim-step-pins" role="tab" type="button" class="secondary">3 · Paths</button></div>
        <div id="sim-start-step"><p class="hint">Grab the robot to move it. It stops at walls and obstacles; the grab cursor stays with it until release. The red rectangle is its collision footprint.</p><button id="start-edge-plan" class="secondary" type="button">Start at edge</button><button id="sim-start-next" class="primary" type="button">Next: field obstacles →</button></div>
        <div id="sim-obstacle-step"><h2>Set up the field</h2><p class="hint">Mark the places your robot must avoid. Game structures are fixed. Your zones are saved with this layout.</p><div id="sim-shape-bar" class="sim-shape-bar" hidden><p id="sim-shape-status" class="hint" role="status"></p><div class="sim-row"><button id="sim-shape-finish" class="primary" type="button">Finish shape</button><button id="sim-shape-undo" class="secondary" type="button">Undo corner</button><button id="sim-shape-cancel" class="text-button" type="button">Cancel</button></div></div><button id="sim-zones-next" class="primary" type="button">Next: paths →</button></div>
        <div id="sim-route-step" hidden><h2>Paths</h2>
        <p class="hint sim-legend"><span class="key-hold">● Hold</span><span class="key-power">● Power</span><span class="key-rotation">● Rotation</span><span class="key-track">● Target</span><span class="key-action">● Action</span><span>Dashed = action · Hover for all modifiers</span></p>
        <p class="hint">Each path drives from the previous point to its end point. Click the field (or + Add path) to add one, drag a point to move it, and click a path or its line to edit it in the list. Points in a red area move to the nearest clear spot. Draw path turns a dragged stroke into paths. Give a path an action to run it while driving, such as intaking or shooting while moving; each action you name gets its own labeled slot in the exported code. Ctrl+Z undoes a change and Ctrl+Shift+Z redoes it.</p>
        <div id="sim-zone-editor" class="sim-editor" hidden></div>
        <div class="sim-path-bar"><button id="sim-add-path" class="primary" type="button" title="Add a path from the last point">+ Add path</button></div>
        <ol id="sim-pin-list" class="sim-list sim-path-list"></ol>
        <label>Route shape</label>${segmented('style',STYLES,'Route shape')}
        <label>Turning</label>${segmented('rotate',{auto:'Turn to fit',off:'Keep heading'},'Turning')}<p id="sim-rotate-note" class="hint"></p>
        <div class="start-xy"><div><label for="sim-clearance">Space around obstacles · in</label><input id="sim-clearance" type="number" min="0.05" data-slider-max="6" step="any" data-slider-step="0.05"></div><div><label>&nbsp;</label><button id="sim-optimize" class="secondary" type="button">Optimize</button></div></div>
        <p class="hint">Optimize test-drives straight and smooth shapes for your paths in the simulator and keeps the fastest one that stays clear and ends on target. Shapes you chose yourself are kept.</p><p id="sim-plan-status" role="status"></p><div id="sim-tested" class="sim-tested"></div>
        <div class="button-row"><button id="sim-clear-pins" class="text-button" type="button">Clear all paths</button><button id="sim-clear-zones" class="text-button" type="button">Clear zones</button></div>
        <h3 id="sim-export-title">Export the route</h3><div class="button-row sim-export-buttons"><button id="sim-export-onbot" class="primary" type="button">OnBot Java (.java)…</button><button id="sim-export-java" class="secondary" type="button">Route Java…</button><button id="sim-export-timed" class="secondary" type="button">Timed commands (.json)…</button><button id="sim-export-pp" class="secondary" type="button">Path file (.pp)…</button><button id="sim-export-teamcode" class="secondary" type="button">TeamCode folder…</button><button id="sim-export-pedro" class="secondary" type="button">Pedro Pathing 3…</button><button id="sim-export-motionmodule" class="secondary" type="button">MotionModule autonomous.py…</button></div><p id="sim-execution-note" class="hint"></p><details id="sim-export-ready" class="sim-more"><summary>Before you run it on the robot</summary><ul id="sim-export-checklist" class="sim-checklist"></ul></details>
        <label class="check"><input id="sim-export-keep" type="checkbox"> Keep the exported file updated</label>
        <details class="sim-more"><summary>Java names</summary><div class="start-xy"><div><label for="sim-export-package">Package</label><input id="sim-export-package" type="text" spellcheck="false"></div><div><label for="sim-export-class">Class</label><input id="sim-export-class" type="text" spellcheck="false"></div></div></details>
        <p id="sim-export-status" class="hint"></p><button id="sim-plan-next" class="primary" type="button">Next: run & review →</button></div></div>
      <div data-panel="run" id="sim-panel-run" role="tabpanel" aria-labelledby="sim-tab-run" hidden>${segmented('practice',{autonomous:'Autonomous',teleop:'Teleop',match:'Full match'},'Practice mode')}
        <div class="sim-grid3"><div><label for="sim-auto-seconds">Auto</label><input id="sim-auto-seconds" type="number" min="0.1" step="any" data-slider-min="1" data-slider-max="120" data-slider-step="1"></div><div><label for="sim-transition-seconds">Transition</label><input id="sim-transition-seconds" type="number" min="0" step="any" data-slider-max="60" data-slider-step="1"></div><div><label for="sim-teleop-seconds">Teleop</label><input id="sim-teleop-seconds" type="number" min="0.1" step="any" data-slider-min="1" data-slider-max="300" data-slider-step="1"></div></div><div id="sim-practice-clock" class="sim-practice-clock" role="timer" aria-live="off"><span id="sim-practice-phase">Ready</span><strong id="sim-practice-time">0:30</strong></div>
        <p class="hint" id="sim-run-readiness"></p><button id="sim-run-sensors" type="button" class="secondary" hidden>Choose position sensing</button><button id="sim-run-plan" type="button" class="secondary" hidden>Go to Path planning</button><p class="hint" id="sim-practice-help"></p>
        ${segmented('program',{route:'Planned route',opmode:'OnBot Java export',source:'Java program'},'Program')}<p id="sim-program-note" class="hint"></p><pre id="sim-program-preview" class="sim-program-preview"></pre>
        <div class="sim-run-row"><button id="sim-run" class="primary" type="button">Run</button><label class="sr-only" for="sim-speed">Speed</label><select id="sim-speed">${options({'0.25':'0.25×','0.5':'0.5×','1':'1×','2':'2×','4':'4×'},'1')}</select></div>
        <p id="sim-run-status" role="status"></p><section id="sim-run-analysis" class="sim-run-analysis" hidden><h3>Run report</h3><div id="sim-run-report" class="sim-run-report"></div></section><div id="sim-error" class="sim-error" role="alert" hidden></div>
        <div id="sim-source-box" hidden><div class="button-row"><button id="sim-java-open" class="secondary" type="button">Open .java…</button><button id="sim-java-example" class="secondary" type="button">Example</button></div>
          <label for="sim-source" id="sim-source-name">Program</label><textarea id="sim-source" spellcheck="false" wrap="off"></textarea></div>
        <section class="sim-log"><h3>Run output</h3><pre id="sim-log" role="log">No run yet. Start a route to see progress, completion, errors and program messages here.</pre></section>
        <p class="hint sim-credit">Route planning and following use the Deck controller. Third-party physics and component licences are in the app’s licenses folder.</p></div>
    </section></div>`;
  const graph=$('#simulation-field'),robotGlyph=$('#field-robot');
  function svg(tag,attributes,text){const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;}
  let fieldArtKey='';
  // ---------------------------------------------------------------- zoom and pan
  // The viewBox is in SVG units (y down); pointer maths elsewhere goes through getScreenCTM, so editing
  // works the same at any zoom.
  let fitBox={x:-16,y:-9,w:168,h:172},zoom={z:1,cx:68,cy:77},panning=null,spaceHeld=false,zoomDraw=false;
  // Pins and handles shrink as the field zooms in (by the square root), so they stay easy to grab without hiding what is near them.
  const marker=()=>1/Math.sqrt(zoom.z);
  function applyZoom(){const w=fitBox.w/zoom.z,h=fitBox.h/zoom.z;zoom.cx=Math.max(fitBox.x+w/2,Math.min(fitBox.x+fitBox.w-w/2,zoom.cx));zoom.cy=Math.max(fitBox.y+h/2,Math.min(fitBox.y+fitBox.h-h/2,zoom.cy));
    graph.setAttribute('viewBox',`${zoom.cx-w/2} ${zoom.cy-h/2} ${w} ${h}`);graph.dataset.zoomed=String(zoom.z>1.001);
    for(const t of $$('.field-labels text')){t.dataset.size??=t.getAttribute('font-size');t.setAttribute('font-size',t.dataset.size/zoom.z);}if(!zoomDraw){zoomDraw=true;requestAnimationFrame(()=>{zoomDraw=false;draw();});}for(const b of $$('[data-zoom]'))b.disabled=b.dataset.zoom==='in'?zoom.z>=8:zoom.z<=1.001;}
  // Zoom by a factor, keeping the SVG point under (clientX, clientY) where it is.
  function zoomBy(factor,clientX,clientY){const m=graph.getScreenCTM(),z=Math.max(1,Math.min(8,zoom.z*factor));if(!m||z===zoom.z)return;const r=graph.getBoundingClientRect(),x=clientX??r.left+r.width/2,y=clientY??r.top+r.height/2,p=new DOMPoint(x,y).matrixTransform(m.inverse());
    zoom.cx=p.x+(zoom.cx-p.x)*zoom.z/z;zoom.cy=p.y+(zoom.cy-p.y)*zoom.z/z;zoom.z=z;applyZoom();}
  function fieldDrawing(){const b=geometry().bounds,w=L().field==='empty'?L().width:144,h=fieldHeight(),key=JSON.stringify([b,L().field,!!window.DeckThree?.drawDsimField,info?.fieldZones]);if(key===fieldArtKey)return;fieldArtKey=key;
    const margin=Math.max(w,h)*.075;fitBox={x:-margin*1.5,y:-margin*.5,w:w+margin*2,h:h+margin*2};zoom={z:1,cx:fitBox.x+fitBox.w/2,cy:fitBox.y+fitBox.h/2};applyZoom();$('#sim-overlay').setAttribute('transform',`matrix(1 0 0 -1 0 ${h})`);
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
  const engineConfig=()=>({mechanisms:L().field==='biobuzz'?project.mechanisms:{...project.mechanisms,enabled:false},alliance:L().alliance,field:L().field,width:L().width,height:L().height,elements:L().elements,start,controller:project.controller,timing:{...project.timing,power:project.tuning.maxPathSpeed??.8},robot:project.robot,zones:L().zones,sensors:{localization:project.sensors.localization},tuning:project.tuning});
  function load(){
    if(!native){info=null;draw();return Promise.resolve();}
    const seq=(load.seq=(load.seq||0)+1);loadError='';
    const operation=(async()=>{try{const next=await api.sim('load',engineConfig());if(seq!==load.seq)return;if(next.field!=='empty'){await three();if(seq!==load.seq)return;}info=next;timedPanel();
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
    if(message.type==='frame'){liveFrame=message;runData?.record(message);if(runData&&!runData.live())return;frame=message;trailPoint(message);paint();telemetry();return;}
    if(message.type==='run')runEvent(message);
    else if(message.type==='practice')practicePanel(message);
    else if(message.type==='optimize'&&optimizing&&optimize.layoutId===L().id)status('#sim-plan-status',`Test-driving route ${message.index+1} of ${message.total}…`);
    else if(message.type==='log'){logLines.push(...message.lines);logLines=logLines.slice(-200);$('#sim-log').textContent=logLines.join('\n');}
    else if(message.type==='cad-progress')importProgress=message;
    else if(message.type==='host-exit'){info=null;frame=null;runState='idle';if(message.error)status('#sim-run-status',message.error);transport();}
  });
  function trailPoint(f){let last=trail.at(-1);const t=f.truth;if(last&&Math.hypot(last.x-t.x,last.y-t.y)>12){trail=[];last=null;}if(!last||Math.hypot(last.x-t.x,last.y-t.y)>.4||(f.estimate&&!last.e))trail.push({x:t.x,y:t.y,e:f.estimate?{x:f.estimate.x,y:f.estimate.y}:null});if(trail.length>3000)trail.splice(0,1000);}
  function appendRunLog(line){logLines.push(line);logLines=logLines.slice(-200);$('#sim-log').textContent=logLines.join('\n');}
  function runEvent(m){
    if(m.state==='starting'){runData?.reset();logLines=[];appendRunLog('Starting '+(m.kind||'autonomous')+'…');}
    else if(m.state==='running')appendRunLog('Running. Escape stops the autonomous and practice timer.');
    else if(m.state==='finished')appendRunLog(`Route finished in ${m.result?.time?.toFixed(2)||'?'} s · ${m.result?.violations?.length||0} zone contact(s).`);
    else if(m.state==='stopped')appendRunLog('Stopped by user.');
    else if(m.state==='error')appendRunLog(m.error||'Program error.');
    else if(m.state==='practice-finished')appendRunLog('Practice timer complete.');
    const err=$('#sim-error');
    if(m.state==='starting'){runState='starting';trail=[];lastReport=null;reportKey='';err.hidden=true;status('#sim-run-status',m.kind==='source'?'Compiling and starting your program…':'Starting…');}
    else if(m.state==='running'){runState='running';status('#sim-run-status','Running.');}
    else if(m.state==='finished'){runState=frame?.practice?'running':'idle';const r=m.result,last=L().pins.at(-1);let text=`Finished in ${r.time.toFixed(2)} s.`;
      if(last&&['route','timed'].includes(r.kind))text+=` Ended ${Math.hypot(r.truth.x-last.x,r.truth.y-last.y).toFixed(2)} in from the last path’s end point.${r.kind==='timed'?' Timed drive has no position feedback.':''}`;
      text+=r.violations.length?` Touched ${r.violations.length} no-go zone${r.violations.length>1?'s':''}.`:' No zones touched.';status('#sim-run-status',text);}
    else if(m.state==='error'){runState='idle';status('#sim-run-status','The program stopped.');err.hidden=false;err.replaceChildren(Object.assign(document.createElement('p'),{textContent:m.error}),...(m.trace?.length?[Object.assign(document.createElement('pre'),{textContent:m.trace.join('\n')})]:[]));selectTab('run');}
    else if(m.state==='stopped'){runState='idle';status('#sim-run-status','Stopped.');}
    else if(m.state==='reset'){runState='idle';trail=[];status('#sim-run-status','Back at the starting pose.');}
    else if(m.state==='practice-finished'){runState='idle';status('#sim-run-status','Practice complete. Drive input is disabled.');}
    else if(m.state==='auto-time-limit'){status('#sim-run-status',`Autonomous reached its ${m.result.time.toFixed(1)} s limit before the program finished.`);}
    transport();
  }

  // ------------------------------------------------------------------ drawing
  function robotPose(){return tab==='plan'||!frame?preview:{x:frame.truth.x,y:frame.truth.y,heading:frame.truth.heading};}
  function paint(){
    if(project.view==='3d'&&view3d){view3d.update(frame,state3d());return;}
    $('#sim-elements').replaceChildren(...(frame?.fieldState?.balls||[]).filter(b=>!['held','stock','scored'].includes(b.state?.kind)).map(b=>svg('circle',{cx:b.pos.x+72,cy:b.pos.y+72,r:L().field==='biobuzz'?(b.color==='yellow'?1.4:1.8):2.5,fill:{yellow:'#f2d14b',red:'#e2564d',blue:'#007be1',purple:'#a568ce',green:'#69bd74'}[b.color]||'#dadada',stroke:'#17191c','stroke-width':'.25','data-element':b.id})));
    const p=robotPose();robotGlyph.setAttribute('transform',`translate(${p.x} ${fieldHeight()-p.y}) rotate(${-p.heading})`);
    const e=frame?.estimate;$('#sim-estimate').setAttribute('points',e?pts(planner.body(e,geometry().footprint)):'');
    const c=frame?.follower?.closest,target=$('#sim-target');target.setAttribute('cx',c?c.x:-99);target.setAttribute('cy',c?c.y:-99);
    for(const z of $$('#sim-zones [data-zone]'))z.classList.toggle('hit',!!frame?.hit?.includes(z.dataset.zone));
  }
  function draw(){
    $('#sim-grab-cursor')?.remove();if(graph.dataset.dragging){const x=preview.x-startGrab.dx,y=preview.y-startGrab.dy;$('#sim-overlay').append(svg('path',{id:'sim-grab-cursor',d:`M${x-1.8} ${y}h3.6M${x} ${y-1.8}v3.6`,class:'sim-grab-cursor'}));}
    const g=geometry(),fp=g.footprint,l=L(),b=g.bounds;
    fieldDrawing();
    graph.dataset.field=l.field;graph.dataset.placing=String(tool==='start'&&active);graph.dataset.mode=tool;
    const rect=robotGlyph.querySelector('rect'),image=$('#sim-robot-image'),pic=model?.picture;
    rect.setAttribute('x',-fp.rear);rect.setAttribute('y',-fp.half);rect.setAttribute('width',fp.front+fp.rear);rect.setAttribute('height',2*fp.half);
    robotGlyph.classList.toggle('has-model',!!pic);
    // With mechanisms: the red outline is the chassis, each intake's box is outlined in the intake colour and
    // each shooter is a dotted circle in its piece colour. (This drawing's y points to the robot's right.)
    for(const n of robotGlyph.querySelectorAll('.sim-glyph-part'))n.remove();
    const mech=project.mechanisms,robot=project.robot;
    if(mech.enabled){const hl=robot.length/2,hw=robot.width/2;rect.setAttribute('x',-hl);rect.setAttribute('y',-hw);rect.setAttribute('width',2*hl);rect.setAttribute('height',2*hw);
      for(const i of mech.intakes)for(const e of i.sides){const along=e==='front'||e==='back',span=Math.min(i.width??(along?robot.width:robot.length),along?robot.width:robot.length),depth=Math.max(i.reach,1),out=(along?hl:hw)+i.reach;
        const box=e==='front'?{x:out-depth,y:-span/2,width:depth,height:span}:e==='back'?{x:-out,y:-span/2,width:depth,height:span}:e==='left'?{x:-span/2,y:-out,width:span,height:depth}:{x:-span/2,y:out-depth,width:span,height:depth};
        robotGlyph.append(svg('rect',{...box,class:'sim-glyph-part sim-glyph-intake'}));}
      for(const s of mech.shooters){const [fx,fy]=MECH.MOUNT_AT[s.mount];robotGlyph.append(svg('circle',{cx:fx*(hl-3),cy:-fy*(hw-3),r:2.6,class:`sim-glyph-part sim-glyph-shooter ${s.pieces}`}));}}
    if(pic){image.setAttribute('href',pic.url);image.setAttribute('x',pic.x0);image.setAttribute('y',-pic.y1);image.setAttribute('width',pic.x1-pic.x0);image.setAttribute('height',pic.y1-pic.y0);}else image.setAttribute('width',0);
    for(const [k,v] of Object.entries({x:b.x0,y:b.y0,width:b.x1-b.x0,height:b.y1-b.y0}))$('#sim-walls').setAttribute(k,v);
    const sel=selected?.kind==='zone'&&zoneById(selected.id);
    $('#sim-zones').replaceChildren(...l.zones.map(z=>zoneShape(z,sel===z?' selected':'')),...(sel?handles(sel).map(h=>svg('circle',{class:'sim-handle',cx:h.x,cy:h.y,r:1.4*marker()})):[]));
    $('#sim-route').replaceChildren(...onionShapes(),...(l.route?routeShapes(l.route):[]),...controlShapes());
    $('#sim-pins').replaceChildren(...l.pins.map((p,i)=>{const n=svg('g',{class:'sim-pin'+(selected?.kind==='pin'&&selected.index===i?' selected':'')+(p.wait>0||p.action?' stop':'')+(diagnostics.some(q=>q.pin===i)?' blocked':''),transform:`translate(${p.x} ${p.y}) scale(${marker()})`,'data-pin':i});
      // A pin that turns the robot shows the heading it turns to.
    if(finite(p.turn)){const h=l.route?.stops[i]?.turn??p.turn;n.append(svg('path',{class:'sim-pin-turn',d:`M0 0L${(5.2*Math.cos(h*Math.PI/180)).toFixed(2)} ${(5.2*Math.sin(h*Math.PI/180)).toFixed(2)}`}));}
      n.append(svg('circle',{r:2.8}),svg('text',{y:1.1,transform:'scale(1 -1)','text-anchor':'middle'},i+1));return n;}));
    const est=trail.filter(t=>t.e).map(t=>t.e);
    $('#sim-trail').replaceChildren(...(trail.length>1?[svg('polyline',{class:'sim-trail',points:pts(trail)})]:[]),...(est.length>1?[svg('polyline',{class:'sim-trail estimate',points:pts(est)})]:[]));
    $('#sim-start').setAttribute('points',frame&&tool!=='start'?pts(planner.body(start,fp)):'');
    $('#field-coordinates').textContent=`X ${field.round(preview.x)} in · Y ${field.round(preview.y)} in · ${field.round(preview.heading)}°`;
    $('#field-help').textContent={start:'Press and drag the robot to move its starting pose. Arrow keys move 1 inch; Enter places; Escape cancels.',select:'Drag any robot, pin or obstacle to edit this field. New objects are added only with the tools in their own tab.',rect:'Drag on the field to draw a box the robot must avoid.',circle:'Press at the centre, then drag outwards to set the circle radius.',triangle:'Press where the base goes and drag: the tip follows your cursor.',draw:'Drag along the field to draw the route. It becomes pins kept out of red areas. Starting near the end of the route extends it; starting elsewhere replaces it.',shape:'Tap to add corners; the outline closes back to the first corner as you go. Two corners make a wall. Press Enter or Finish shape to confirm.',pin:'Click where the robot should go next. The whole footprint must fit inside the field.'}[tool]||'';
    if(targetPick)$('#field-help').textContent='Click the field target to aim at. Escape cancels target selection.';
    pressed('tool',tool);
    $('#sim-subtitle').textContent=`${l.name}${l.field==='empty'?' · empty field':''}${info?.physics==='3d'?' · 3D physics':''}`;
    paint();
  }
  function inputs(){const b=geometry().bounds;$('#start-x').dataset.sliderMax=b.x1;$('#start-y').dataset.sliderMax=b.y1;for(const key of ['x','y','heading'])inputValue('#start-'+key,String(Math.round(start[key]*100)/100));}
  function telemetry(){
    // At most ~8 updates a second, but never drop the last frame (a paused simulation sends no more).
    const now=performance.now(),wait=120-(now-(telemetry.at||0));clearTimeout(telemetry.timer);
    if(wait>0){telemetry.timer=setTimeout(telemetry,wait);return;}telemetry.at=now;
    const f=frame,rows=[];if(!f){$('#sim-telemetry').replaceChildren();return;}
    const t=f.truth,e=f.estimate,r=v=>v.toFixed(1),add=(k,v,cls)=>rows.push([k,v,cls]);
    practicePanel(f.practice);refreshDiagnostics();
    add('Time',`${f.time.toFixed(2)} s${f.playing?'':' · paused'}`);
    add('Robot',`${r(t.x)}, ${r(t.y)} in · ${Math.round(((t.heading%360)+360)%360)}°`);add('Speed',`${r(Math.hypot(t.vx,t.vy))} in/s`);
    if(e)add('Sensor estimate',`off by ${Math.hypot(e.x-t.x,e.y-t.y).toFixed(2)} in`);if(f.execution==='timed')add('Autonomous','Timed power + IMU · no X/Y feedback');
    if(f.acting)add('Action path',f.acting);
    if(f.wait)add('Paused at end of path',`${f.wait.action||'Pause'} · ${f.wait.remaining.toFixed(1)} s left`);
    else if(f.mode==='program'&&f.follower)add('Route',`leg ${f.telemetry?.leg||f.telemetry?.Leg||Math.max(1,f.follower.pathIndex+1)}${finite(f.follower.remaining)?` · ${r(f.follower.remaining)} in to go`:''}`);
    const done=!!(f.result||f.practice?.phase==='finished'),box=$('#sim-run-analysis');box.hidden=!done||!runData?.frames().length;if(done&&runData)runReport();
    if(f.mechanisms){const m=f.mechanisms;add('Pieces',`${m.held} held · ${m.shots} shot`);if(project.mechanisms.shooter.type!=='none')add('Flywheel',`${Math.round(m.flywheel*100)}%${m.ready?' · ready':''}`);const turrets=project.mechanisms.shooters.flatMap((s,n)=>s.type==='turret'&&!s.sharesTurret?[n]:[]);turrets.forEach(n=>add(turrets.length>1?`Turret ${n+1}`:'Turret',`${Math.round(m.turrets?.[n]??m.turret)}°${m.aligned?' · on target':''}`));if(finite(m.score))add('Score',`${m.score} pts · ${m.tips} tip${m.tips===1?'':'s'}`);}
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
    const canFollow=C.sensors[project.sensors.localization].translation,teleop=project.practice.mode==='teleop';$('#sim-run-readiness').textContent=teleop?'Controller practice uses this setup’s robot, field and physical game elements.':canFollow?'The Deck controller follows this route using your selected odometry and IMU. Press Escape to stop.':'Timed power + IMU heading hold. There is no X/Y feedback; compare the actual endpoint against your planned pins.';$('#sim-run-sensors').hidden=canFollow||teleop||project.program.kind==='route';
    // A route program with nothing to drive yet points back to Path planning instead of failing on Run.
    const noRoute=!teleop&&['route','opmode'].includes(project.program.kind)&&!L().pins.length;$('#sim-run-plan').hidden=!noRoute;if(noRoute)$('#sim-run-readiness').textContent='No route yet. Add at least one path in Path planning, then press Run here.';
  }

  // Open one path in Path planning's list, from a run report or diagnostic.
  function editPath(i){selectTab('plan');setStep('pins');[...$('#sim-route-step').querySelectorAll('[role=tab]')].find(b=>b.textContent==='Paths')?.click();choosePath(i);}
  // The run report: rebuilt when a run ends and while its last pieces land, not on every frame.
    function runReport(){
    const frames=runData.frames(),end=[...frames].reverse().find(f=>f.result)?.result,m=frames.at(-1)?.mechanisms,key=JSON.stringify([runAttempt,frames[0]?.time,end?.time,end?.reason,m?.score,m?.landed,m?.shots]);if(key===reportKey)return;reportKey=key;
    const report=lastReport=window.DeckSimReport.build(frames,{pins:L().pins,defaultPower:project.tuning.maxPathSpeed,autoSeconds:project.practice.mode==='teleop'?null:project.practice.autoSeconds,optimized:!!L().tested?.length});
    window.DeckSimReport.render($('#sim-run-report'),report,{onEdit:editPath,onSeek:t=>runData.seek(t)});
  }
  function diagnosticBox(id){const box=document.createElement('section');box.id=id;box.className='sim-diagnostics';return box;}
  const diagnosticPages={};
  function refreshDiagnostics(){
    if(analysisPending){try{diagnostics=planner.analyze({...planRequest(L().style).project,start:graph.dataset.dragging?preview:start},geometry().footprint,info?.fieldZones||[],geometry().bounds);}catch(e){diagnostics=[{pin:null,code:'setup',message:e.message}];}}
    const banner=$('#sim-live-status');if(banner){banner.hidden=tab!=='plan';banner.classList.toggle('has-issues',diagnostics.length>0);const est=!diagnostics.length&&!analysisPending&&L().route?routeEstimate():null,auto=project.practice.autoSeconds,late=est?.time>auto,missed=est&&(est.violations>0||est.miss>1.5);if(est&&!diagnostics.length)banner.classList.toggle('has-issues',!!(late||missed||est.error));
    const timing=!est?'':est.pending?' · test-driving for a time estimate…':est.error?` · test drive did not finish: ${est.error}`:`${missed?' · test drive touched something or missed the end point':''} · about ${est.time.toFixed(1)} s in simulation${late?`, longer than the ${auto} s autonomous`:''}`;
    banner.textContent=diagnostics.length?`${diagnostics.length} route issue${diagnostics.length>1?"s":""} · ${diagnostics.filter(d=>d.pin!==null).map(d=>'Path '+(d.pin+1)).filter((p,i,a)=>a.indexOf(p)===i).join(', ')||'Starting pose'} · View diagnostics`:analysisPending?'Analyzing route…':L().pins.length?`Route checks passed${timing} · View diagnostics`:'Add paths to check your route';}
    const warnings=[];if(!C.sensors[project.sensors.localization].translation&&L().pins.some(p=>['spin','turn','relative','start','track'].includes(p.path?.rotate)))warnings.push('Turning while driving with IMU-only sensing can accumulate large X/Y errors. Add odometry for accurate curves or stop and turn at pins.');
    for(const [i,p] of L().pins.entries())if((p.path?.power??project.tuning.maxPathSpeed)===0)warnings.push(`Path to pin ${i+1} has zero motor power. It will stop the autonomous until you change power and restart.`);
    // Contact: a no-go zone the robot sits in, a wall or part it is pushing while running, or contacts the last
    // run made after leaving its start pose (the run report's count; starting against the wall is normal).
    const touching=frame?.hit?.length||runState==='running'&&frame?.contacts?.length,events=lastReport?lastReport.contacts.length+(frame?.violations?.length&&!lastReport.contacts.some(c=>c.kind==='zone')?frame.violations.length:0):(frame?.violations?.length||0)+(frame?.contactEvents||0);
    if(touching||events)warnings.push(`Chassis contact: ${touching?'currently touching a wall or no-go area':`${events} contact event(s) during this run`}. Increase clearance or reduce path power.`);
    for(const id of ['#sim-plan-diagnostics','#sim-run-diagnostics']){const box=$(id);if(!box)continue;const key=JSON.stringify([diagnostics,warnings,analysisPending,L().pins.length,!!L().route,diagnosticPages[id]||0]);if(box.dataset.content===key)continue;box.dataset.content=key;const head=document.createElement('h3');head.textContent=analysisPending?'Analyzing route…':diagnostics.length?`${diagnostics.length} route issue${diagnostics.length>1?"s":""}`:'Route checks';const legend=document.createElement('p');legend.className='hint';legend.textContent='Numbered markers on the field are path end points: red has a clearance or path issue, amber pauses or runs an action, plain only drives. Power is a limit, not a guaranteed speed.';
      const list=document.createElement('ul'),size=innerHeight<650?1:2,entries=[...diagnostics,...warnings.map(message=>({pin:null,code:'warning',message}))],pages=Math.ceil(entries.length/size),page=Math.max(0,Math.min(pages-1,diagnosticPages[id]||0));for(const issue of entries.slice(page*size,(page+1)*size)){const item=document.createElement('li');item.className=issue.code==='warning'?'hint warn':'sim-issue';item.textContent=issue.message;if(issue.pin!==null){const jump=document.createElement('button');jump.type='button';jump.className='text-button';jump.textContent=`Edit path ${issue.pin+1}`;jump.onclick=()=>editPath(issue.pin);item.append(jump);}list.append(item);}
      if(!diagnostics.length&&!analysisPending){const item=document.createElement('li');item.textContent=L().pins.length?L().route?'Every end point and planned movement keeps the robot clear.':'Pin footprints checked. Planning route movements…':'Add paths to check their movements.';list.append(item);}box.replaceChildren(head,legend,list);if(pages>1){const nav=document.createElement('div');nav.className='sim-pin-pages';const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');prev.textContent='← Previous';next.textContent='Next →';prev.disabled=page===0;next.disabled=page===pages-1;prev.type=next.type='button';prev.className=next.className='secondary';label.textContent=`${page*size+1}–${Math.min(entries.length,(page+1)*size)} of ${entries.length}`;prev.onclick=()=>{diagnosticPages[id]=page-1;refreshDiagnostics();};next.onclick=()=>{diagnosticPages[id]=page+1;refreshDiagnostics();};nav.append(prev,label,next);box.append(nav);}
    }
  }
  function liveEdit(robot=false){L().route=null;planError='';blockedPin=-1;planSeq++;analysisPending=true;refreshDiagnostics();draw();if(!robot)schedulePlan();}
  // ------------------------------------------------------------------ editing
  function changed(what){
    if(['zones','pins','start','robot','field','plan'].includes(what)){L().route=null;L().tested=null;planSeq++;planError='';blockedPin=-1;analysisPending=true;refreshDiagnostics();}
    save();draw();if(what==='zones'&&native&&info)void api.sim('zones',L().zones).catch(()=>{});zonePanel();pinPanel();tested();schedulePlan();
  }
  // ------------------------------------------------------------------ undo
  // Ctrl+Z undoes and Ctrl+Shift+Z (or Ctrl+Y) redoes Path planning edits: the starting pose, pins and their
  // paths, obstacles and route settings. Every save compares them with the last save, so each committed
  // edit is one step. Each field of each setup keeps its own history while the app is open.
  const PLAN_KEYS=['start','zones','pins','clearance','style','rotate'],planHistories=new Map();let lastPlan=null;
  const planKey=()=>{const l=L();return [project.setupId,l.id,l.field,l.width,l.height].join('|');},planState=()=>JSON.stringify(PLAN_KEYS.map(k=>L()[k]??null));
  function planHistory(key=planKey()){if(!planHistories.has(key))planHistories.set(key,{undo:[],redo:[]});return planHistories.get(key);}
  function recordPlan(){if(drag?.moved||graph?.dataset.dragging)return;const key=planKey(),state=planState();
    if(lastPlan?.key===key&&lastPlan.state!==state){const h=planHistory(key);h.undo.push(lastPlan.state);if(h.undo.length>100)h.undo.shift();h.redo=[];}lastPlan={key,state};}
  function stepPlan(back){
    if(effects.session||optimizing)return;recordPlan();const h=planHistory(),from=back?h.undo:h.redo;
    if(!from.length)return status('#sim-plan-status',back?'Nothing to undo.':'Nothing to redo.');
    (back?h.redo:h.undo).push(planState());const state=JSON.parse(from.pop());PLAN_KEYS.forEach((k,i)=>{L()[k]=state[i];});lastPlan={key:planKey(),state:planState()};
    // Keep the open path or selected obstacle when it still exists, so its handles stay on screen.
    const kept=selected?.kind==='zone'?L().zones.some(z=>z.id===selected.id):['pin','path'].includes(selected?.kind)&&!!L().pins[selected.index];
    if(L().start)start=L().start;preview={...start};if(!kept)selected=null;drag=null;pointer=null;stroke=null;targetPick=null;inputs();robotPanel();
    changed('zones');if(native&&info)void api.sim('start',start).catch(()=>{});status('#sim-plan-status',back?'Undid the last change.':'Redid the change.');
  }
  document.addEventListener('keydown',event=>{
    const key=event.key.toLowerCase();if(!active||tab!=='plan'||!(event.ctrlKey||event.metaKey)||event.altKey||!['z','y'].includes(key))return;
    if(document.querySelector('dialog[open]')||event.target.closest?.('input,textarea,select,[contenteditable]'))return;
    event.preventDefault();
    // While a custom shape is being drawn, undo takes back its last corner first.
    if(key==='z'&&!event.shiftKey&&tool==='shape'&&sketch){sketch.pop();if(!sketch.length)sketch=null;showDraft(null);return;}
    stepPlan(key==='z'&&!event.shiftKey);
  });
  function commit(pose){
    const g=geometry(),next=field.validate(pose,g);
    if(info&&!planner.safePose(next,[...info.fieldZones,...L().zones],info.footprint,info.bounds))throw Error('That spot overlaps an obstacle. Choose a clear position outside the red boundary.');
    start=next;preview={...start};tool=planningStep==='start'?'start':'select';pointer=null;for(const key of ['x','y'])delete $('#start-'+key).dataset.typed;inputs();L().start=start;
    let saved=save();try{localStorage.setItem(field.KEY,field.serialize(start,g));}catch{saved=false;}
    status('#start-status',saved?'Starting pose saved.':'Starting pose set for this session. Device storage is unavailable.');
    changed('start');if(native&&info)void api.sim('start',start).catch(e=>status('#start-status',e.message));
  }
  // A new heading pivots the starting pose along any wall it sits against, then steps clear of obstacles.
  function turnStart(angle){
    const p=field.turn(start,angle,geometry());if(!info||validPin(p,p.heading))return p;
    const clear=nearestPin(p,24,p.heading);return clear?{...p,...clear}:p;
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
    const c=controlHit(p);if(c)return c;
    const l=L();for(let i=l.pins.length-1;i>=0;i--)if(Math.hypot(l.pins[i].x-p.x,l.pins[i].y-p.y)<=3.2*marker())return {kind:'pin',index:i};
    const z0=selected?.kind==='zone'&&zoneById(selected.id);if(z0){const i=handles(z0).findIndex(h=>Math.hypot(h.x-p.x,h.y-p.y)<=2.2*marker());if(i>=0)return {kind:'handle',id:z0.id,index:i};}
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
    for(const s of route.segments){if(Number.isFinite(s.heading)&&Math.abs(((s.heading-heading)%360+540)%360-180)>.5)out.push(svg('polygon',{class:'sim-turn-ghost',points:pts(planner.body({...s.points[0],heading:s.heading},route.footprint))}));heading=s.endHeading??s.heading??heading;}
    return out;}
  // The route path by path: action paths dashed in the action colour, and a mark halfway along each
  // path the robot turns or spins along. data-path is the pin each path leads to.
  const bez=(points,t)=>{let p=points;while(p.length>1)p=p.slice(1).map((q,i)=>({x:p[i].x+(q.x-p[i].x)*t,y:p[i].y+(q.y-p[i].y)*t}));return p[0];};
  const segmentPoints=s=>Array.from({length:25},(_,j)=>bez(s.points,j/24));
  const pathOf=(l,k)=>l.pins[k]?.path||{kind:'regular',rotate:'keep'};
  function routeShapes(route){
    const l=L(),to=exporter.pathIndex(route),out=[],marks=new Map();
    route.segments.forEach((s,i)=>{const k=to[i],path=pathOf(l,k),points=segmentPoints(s);
      const appearance=planner.pathAppearance(path,project.tuning.maxPathSpeed),line=svg('polyline',{class:'sim-path'+(path.kind==='action'?' action':'')+(['path','pin'].includes(selected?.kind)&&selected.index===k?' selected':''),points:pts(points),'data-path':k,role:'button','aria-label':`Path ${k+1}:${planner.pathDescription(path,project.tuning.maxPathSpeed).join('; ')}`});
      line.style.stroke=appearance.color;out.push(line);
      if(path.rotate!=='keep'&&!route.nonholonomic){for(const t of [.25,.75]){const p=bez(s.points,t),h=planner.headingAt(s,t)*Math.PI/180,dx=Math.cos(h),dy=Math.sin(h),end={x:p.x+4*dx,y:p.y+4*dy};out.push(svg('path',{class:'sim-heading-arrow',stroke:appearance.color,d:`M${p.x} ${p.y}L${end.x} ${end.y}m${-1.5*dx+dy} ${-1.5*dy-dx}L${end.x} ${end.y}l${-1.5*dx-dy} ${-1.5*dy+dx}`}));}}
      if(!marks.has(k))marks.set(k,[]);marks.get(k).push(...points);});
    if(!route.nonholonomic)for(const [k,points] of marks){const path=pathOf(l,k);if(path.rotate==='keep')continue;const mid=points[Math.floor(points.length/2)];
      const label=path.rotate==='tangent'?'Along path':path.rotate==='reverse'?'Backwards':path.rotate==='spin'?`${path.spins>0?'↺':'↻'}${Math.abs(path.spins)}`:path.rotate==='relative'?`${path.angle>=0?'+':''}${path.angle}°`:path.rotate==='track'?'Track':path.rotate==='start'?'Start heading':`${Math.round(path.heading)}°`;
      out.push(svg('text',{class:'sim-path-mark',x:mid.x.toFixed(2),y:(-mid.y-2).toFixed(2),transform:'scale(1 -1)','text-anchor':'middle'},label));
      if(path.rotate==='track'&&path.target){const t=path.target;out.push(svg('circle',{class:'sim-aim-target',cx:t.x,cy:t.y,r:2}),svg('path',{class:'sim-aim-target',d:`M${t.x-3} ${t.y}h6M${t.x} ${t.y-3}v6`}));}}
    out.push(...turnGhosts(route));return out;
  }
  // Custom curves (Pedro Pathing style): the open path's Bezier control points are drawn as handles with
  // guide lines from the path's ends, and can be dragged. The planner drives the curve exactly as drawn.
  const pathStart=i=>i>0?L().pins[i-1]:start;
  // The robot's outline every few inches along the open path, at the heading it has there.
  function onionShapes(){const i=openPath(),route=L().route,fp=route?.footprint;if(tab!=='plan'||i<0||!route||!fp)return [];const to=exporter.pathIndex(route),parts=route.segments.filter((_,k)=>to[k]===i),out=[];let since=Infinity,prev=null;
    for(const s of parts)for(let j=0;j<=40;j++){const t=j/40,p=bez(s.points,t);if(prev)since+=Math.hypot(p.x-prev.x,p.y-prev.y);prev=p;if(since<8&&!(s===parts.at(-1)&&j===40))continue;since=0;
      const h=planner.headingAt(s,t);out.push(svg('polygon',{class:'sim-onion',points:pts(planner.body({...p,heading:finite(h)?h:finite(route.heading)?route.heading:start.heading},fp))}));}
    return out.slice(0,60);}
  function controlShapes(){const i=openPath(),q=L().pins[i],c=q?.path?.controls;if(tab!=='plan'||!c?.length)return [];const a=pathStart(i),out=[];
    out.push(svg('polyline',{class:'sim-control-guide',points:pts([a,c[0]])}),svg('polyline',{class:'sim-control-guide',points:pts([c.at(-1),q])}));if(c.length>2)out.push(svg('polyline',{class:'sim-control-guide',points:pts(c)}));
    if(!L().route||planError)out.push(svg('polyline',{class:'sim-path draft'+(diagnostics.some(d=>d.pin===i)?' blocked':''),points:pts(Array.from({length:33},(_,j)=>bez([a,...c,q],j/32)))}));
    c.forEach((h,j)=>out.push(svg('circle',{class:'sim-control'+(drag?.kind==='control'&&drag.control===j?' active':''),cx:h.x,cy:h.y,r:1.8*marker(),'data-control':j,role:'button','aria-label':`Path ${i+1} curve handle ${j+1}: drag to shape the curve`})));return out;}
  function controlHit(p){const i=openPath(),c=L().pins[i]?.path?.controls;if(tab!=='plan'||!c)return null;const m=graph.getScreenCTM(),reach=Math.max(2.4,9/(m?Math.hypot(m.a,m.b):1));
    for(let j=c.length-1;j>=0;j--)if(Math.hypot(c[j].x-p.x,c[j].y-p.y)<=reach)return {kind:'control',index:i,control:j};return null;}
  // Handles for a new custom curve keep the shape the robot drives now: the planned curve's own control
  // points when the path is one cubic, otherwise points a third and two thirds along the straight line.
  function startControls(i){const l=L(),a=pathStart(i),b=l.pins[i],route=l.route;
    if(route){const to=exporter.pathIndex(route),parts=route.segments.filter((_,k)=>to[k]===i);if(parts.length===1&&parts[0].points.length===4)return parts[0].points.slice(1,3).map(p=>({x:field.round(p.x),y:field.round(p.y)}));}
    return [1/3,2/3].map(t=>({x:field.round(a.x+(b.x-a.x)*t),y:field.round(a.y+(b.y-a.y)*t)}));}
  // The path (by the pin it leads to) under a field point, if the route passes within reach.
  function pathHit(p,reach=1.8){const route=L().route;if(!route)return null;const matrix=graph.getScreenCTM();reach=Math.max(reach,7/(matrix?Math.hypot(matrix.a,matrix.b):1));const to=exporter.pathIndex(route);let best=null;
    route.segments.forEach((s,i)=>{const q=segmentPoints(s);for(let j=1;j<q.length;j++){const a=q[j-1],b=q[j],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);if(d<=reach&&(!best||d<best.d))best={d,index:to[i]};}});
    return best&&{kind:'path',index:best.index};}
  // ------------------------------------------------------------ pin and path settings
  // Right-click (or press and hold) a pin or a path to open its settings. The simulator only plans and
  // drives the movement; each named action becomes a slot in the exported code for the team's own
  // mechanism code (RobotActions.java on a Control Hub, robot_actions.py on MotionModule).
  const effects={index:-1,session:null},tooltip=document.createElement('div');
  tooltip.id='sim-path-tooltip';tooltip.className='sim-path-tooltip';tooltip.role='tooltip';tooltip.hidden=true;root.append(tooltip);
  root.append($('#sim-effects'));
  let targetPick=null;
  function clampEditor(box,x,y){box.style.left=`${Math.max(4,Math.min(innerWidth-box.offsetWidth-4,x))}px`;box.style.top=`${Math.max(4,Math.min(innerHeight-box.offsetHeight-4,y))}px`;}
  window.addEventListener('resize',()=>{const b=$('#sim-effects');if(!b.hidden)clampEditor(b,parseFloat(b.style.left)||4,parseFloat(b.style.top)||4);});
  function openEffects(target,at,reuse=false){
    if(optimizing||effects.session&&!reuse)return;
    const l=L(),k=target.index;if(!l.pins[k])return;
    if(!reuse)effects.session=window.DeckSimEditor.begin(l,target);
    const p=effects.session.draft;targetPick=null;tooltip.hidden=true;p.path=planner.pathEffects(p.path);
    const box=$('#sim-effects'),isPath=target.kind==='path',path=p.path,holonomic=C.drives[project.robot.drivetrain].holonomic;
    effects.index=k;selected={kind:target.kind,index:k};box.setAttribute('aria-label',isPath?'Path settings':'Pin settings');
    const title=isPath?`Path ${k+1}`:`End of path ${k+1}`;
    box.innerHTML=`<div class="sim-pop-head" title="Drag to move this editor"><h3>${title}</h3><span class="sim-editor-grip" aria-label="Drag editor" title="Drag editor">⠿</span></div>
      <div class="sim-settings-tabs" role="tablist" aria-label="${isPath?'Path':'Pin'} settings"></div>
      <section class="sim-pop-sec" data-sec="main">${isPath?`
        <label class="check"><input id="eff-power-inherit" type="checkbox"> Use setup motor power</label>
        <label for="eff-path-power">Motor power · 0–1</label><input id="eff-path-power" type="number" min="0" max="1" step="any">
        <p class="hint">Applies to this entire path. 0 stops here; 0.5 caps motor power at 50%.</p>
        <label for="eff-path-shape">Path shape</label><select id="eff-path-shape"><option value="">Use route default</option><option value="sharp">Straight segments</option><option value="spline">Smooth spline</option><option value="custom">Custom curve (drag handles)</option></select>
        <h4 class="sim-pop-label">While driving this path</h4>${actionPicker('path')}`:`
        <ol class="sim-pop-steps"><li>Arrive (and turn, if set)</li><li>Pause</li><li>Do the action</li><li>Drive on</li></ol>
        <label for="eff-wait">Pause first · s</label><input id="eff-wait" type="number" min="0" step="any">
        <h4 class="sim-pop-label">Then do</h4>${actionPicker('pin')}
        <p class="hint">Power, shape, heading and the action while driving are in Path options.</p>`}</section>
      <section class="sim-pop-sec" data-sec="heading" hidden>
        <label for="eff-heading-mode">${isPath?'While driving this path':'Turn in place at this pin'}</label>
        <select id="eff-heading-mode"><option value="keep">${isPath?'Hold inherited heading':'No turn'}</option><option value="relative">Turn by… (relative)</option><option value="${isPath?'turn':'absolute'}">Face field heading…</option><option value="start">Return to starting heading</option><option value="track">${isPath?'Track a field target':'Aim at a field target'}</option>${isPath?'<option value="spin">Full spins</option><option value="tangent">Face along the path (tangent)</option><option value="reverse">Face backwards along the path</option>':''}</select>
        <div data-angle><label for="eff-angle">Turn by · ° (+ left, − right)</label><input id="eff-angle" type="number" step="any"></div>
        <div data-absolute><label for="eff-absolute">Field heading · °</label><input id="eff-absolute" type="number" step="any"></div>
        <div data-spins><label for="eff-spins">Full spins (+ left, − right)</label><input id="eff-spins" type="number" step="1"></div>
        <div data-target><div class="sim-grid2"><div><label for="eff-target-x">Target X · in</label><input id="eff-target-x" type="number" step="any"></div><div><label for="eff-target-y">Target Y · in</label><input id="eff-target-y" type="number" step="any"></div></div><button type="button" class="secondary" id="eff-pick-target">Pick target on field</button></div>
        <p class="hint">${isPath?'The final heading carries into later paths until another turn changes it. Tracking faces the target throughout the actual curve.':'Relative turns use the heading on arrival. The resulting heading carries into later paths.'}</p>
      </section>
      <section class="sim-pop-sec" data-sec="notes" hidden><label for="eff-note">${isPath?'What this path does':'What happens at this pin'}</label><textarea id="eff-note" rows="3" maxlength="160"></textarea></section>
      <p class="sim-editor-save-note" role="status">Draft · press Done to save</p><div class="button-row"><button type="button" class="text-button" data-reset>${isPath?'Reset path modifiers':'Reset pin modifiers'}</button><button type="button" class="primary" data-close>Done</button></div>`;
    const q=sel=>box.querySelector(sel),subject=isPath?path:p,mode=q('#eff-heading-mode');
    mode.value=isPath?path.rotate:finite(p.turn)?p.turnMode||'absolute':'keep';
    q('#eff-angle').value=isPath?path.angle:p.turnMode==='relative'?p.turn:90;q('#eff-absolute').value=isPath?path.heading:p.turn??start.heading;q('#eff-spins').value=path.spins;
    const t=subject.target||{x:geometry().bounds.x1/2,y:geometry().bounds.y1-8};q('#eff-target-x').value=t.x;q('#eff-target-y').value=t.y;
    q('#eff-note').value=subject.note||'';
    const show=()=>{for(const [sel,key] of [['[data-angle]','relative'],['[data-absolute]',isPath?'turn':'absolute'],['[data-spins]','spin'],['[data-target]','track']])q(sel).hidden=mode.value!==key;
      if(isPath){q('#eff-power-inherit').checked=!finite(path.power);q('#eff-path-power').disabled=!finite(path.power);q('#eff-path-power').value=path.power??project.tuning.maxPathSpeed??.8;}};
    const commit=()=>{if(isPath)p.path=planner.pathEffects(path);show();if(!box.hidden)clampEditor(box,parseFloat(box.style.left)||4,parseFloat(box.style.top)||4);};
    const readNumber=(id,assign,min=-Infinity,max=Infinity)=>{q(id).onchange=e=>{const v=e.target.valueAsNumber;if(!finite(v)||v<min||v>max){e.target.setCustomValidity(`Enter a finite value${finite(min)?' from '+min:''}${finite(max)?' to '+max:''}.`);e.target.reportValidity();return;}e.target.setCustomValidity('');assign(v);commit();};};
    mode.onchange=()=>{const m=mode.value;if(m!=='track')targetPick=null;if(isPath)path.rotate=m;else{p.turnMode=m==='keep'?'absolute':m;p.turn=m==='keep'?null:m==='relative'?Number(q('#eff-angle').value)||0:m==='absolute'?Number(q('#eff-absolute').value)||0:0;}
      if(m==='track')subject.target={x:Number(q('#eff-target-x').value),y:Number(q('#eff-target-y').value)};commit();};
    if(isPath&&!holonomic)for(const option of mode.options)option.disabled=option.value!=='keep';
    readNumber('#eff-angle',v=>{if(isPath)path.angle=v;else p.turn=v;});readNumber('#eff-absolute',v=>{if(isPath)path.heading=field.heading(v);else p.turn=field.heading(v);});
    readNumber('#eff-spins',v=>{path.spins=Math.round(v)||1;q('#eff-spins').value=path.spins;});
    for(const axis of ['x','y'])readNumber('#eff-target-'+axis,v=>{subject.target={x:Number(q('#eff-target-x').value),y:Number(q('#eff-target-y').value),[axis]:v};});
    q('#eff-note').onchange=e=>{subject.note=e.target.value.slice(0,160);commit();};
    if(isPath){q('#eff-path-shape').value=path.controls?'custom':path.style||'';q('#eff-path-shape').onchange=e=>{const v=e.target.value;if(v==='custom'){path.controls=path.controls||startControls(k);path.style=null;}else{path.controls=null;path.style=v||null;}path.shapeAuto=false;commit();};
      wireActionPicker(q,'path',path,commit);
      q('#eff-power-inherit').onchange=e=>{path.power=e.target.checked?null:project.tuning.maxPathSpeed??.8;commit();};readNumber('#eff-path-power',v=>path.power=v,0,1);
    }else{q('#eff-wait').value=p.wait||0;readNumber('#eff-wait',v=>p.wait=v,0);wireActionPicker(q,'pin',p,commit);}
    q('#eff-pick-target').onclick=()=>{targetPick={...target};q('#eff-pick-target').textContent='Click target on field…';draw();};
    effects.pickPoint=point=>{subject.target={x:field.round(point.x),y:field.round(point.y)};q('#eff-target-x').value=subject.target.x;q('#eff-target-y').value=subject.target.y;q('#eff-pick-target').textContent='Pick target on field';targetPick=null;commit();draw();};
    q('[data-reset]').onclick=()=>{if(isPath)p.path=planner.pathEffects({});else Object.assign(p,{wait:0,action:'',actionSeconds:null,note:'',turn:null,turnMode:'absolute',target:null});openEffects(target,{clientX:parseFloat(box.style.left)-24,clientY:parseFloat(box.style.top)+30},true);};
    q('[data-close]').onclick=finishEditor;
    const tabs=q('.sim-settings-tabs');for(const [key,label]of [['main',isPath?'Power & action':'Pause & action'],['heading','Heading'],['notes','Notes']]){const b=document.createElement('button');b.type='button';b.role='tab';b.className='secondary';b.textContent=label;b.onclick=()=>{for(const sec of box.querySelectorAll('[data-sec]'))sec.hidden=sec.dataset.sec!==key;for(const other of tabs.children)other.setAttribute('aria-selected',String(other===b));clampEditor(box,parseFloat(box.style.left)||4,parseFloat(box.style.top)||4);};tabs.append(b);}tabs.firstElementChild.click();
    const header=q('.sim-pop-head');let grab=null;
    header.onpointerdown=e=>{if(e.button!==0||e.target.closest('button'))return;e.preventDefault();const r=box.getBoundingClientRect();grab={x:e.clientX-r.left,y:e.clientY-r.top};header.setPointerCapture(e.pointerId);};
    header.onpointermove=e=>{if(grab)clampEditor(box,e.clientX-grab.x,e.clientY-grab.y);};header.onpointerup=header.onpointercancel=()=>grab=null;
    show();box.hidden=false;clampEditor(box,(at?.clientX??innerWidth/2)+24,(at?.clientY??150)-30);draw();
    q(isPath?'#eff-path-power':'#eff-wait').focus({preventScroll:true});
  }
  // Actions offered for this field (the game's own, run by the Mechanisms settings), plus your own by name.
  const ACTION_INFO={Intake:'Runs the intake. At a pin it runs for the time set; while driving, for the whole path or the time set.',
    Shoot:'Spins the flywheel up, aims and shoots. At a pin it shoots until the robot is empty unless a time is set; while driving, for the whole path or the time set.',
    'Spin up':'Starts the flywheel early, so a later Shoot fires right away. It keeps spinning until that Shoot.',
    Aim:'Turns the turret to point at the hive, so a later Shoot does not wait for it.'};
  const gameActions=()=>{if(L().field!=='biobuzz')return [];const m=project.mechanisms;return ['Intake','Shoot','Spin up',...(!m.enabled||MECH.hasTurret(m)?['Aim']:[])];};
  function actionPicker(where){
    return `<div class="sim-chips sim-action-chips" role="group" aria-label="Action">${['None',...gameActions(),'Other…'].map(a=>`<button type="button" class="sim-chip" data-pick-action="${a}" aria-pressed="false">${a}</button>`).join('')}</div>
      <div data-custom hidden><label for="eff-${where}-action">Action name</label><input id="eff-${where}-action" maxlength="40" placeholder="e.g. Raise lift" autocomplete="off"></div>
      <div data-for hidden><span class="sim-pop-label">How long</span><div class="sim-chips"><button type="button" class="sim-chip" data-for-mode="all" aria-pressed="false">${where==='path'?'Whole path':'Until done'}</button><button type="button" class="sim-chip" data-for-mode="time" aria-pressed="false">For a set time</button></div>
        <div data-for-time hidden><label for="eff-${where}-for">Seconds${where==='path'?' from the start of the path':''}</label><input id="eff-${where}-for" type="number" min="0.05" max="30" step="any" data-slider-max="5" data-slider-step="0.05"></div></div>
      <div data-cell hidden><span class="sim-pop-label">Aim at</span><div class="sim-chips"><button type="button" class="sim-chip" data-cell-pick="start" aria-pressed="false">Cell up at the start</button><button type="button" class="sim-chip" data-cell-pick="other" aria-pressed="false">Other cell</button></div>
        <p class="hint">The hive tips once enough pieces land in its up cell, and the other cell then faces up. Your alliance’s start cell already holds 3 nectar, so 3 pollen tip it; the other cell takes 8. Each tip scores 20.</p></div>
      <p class="hint" data-action-hint></p>`;
  }
  // Wires a picker to the pin (or path) draft: subject.action and subject.actionSeconds.
  function wireActionPicker(q,where,subject,commit){
    const name=q(`#eff-${where}-action`),secs=q(`#eff-${where}-for`),known=a=>gameActions().some(g=>g.toLowerCase()===String(a).trim().toLowerCase());
    let custom=!!subject.action&&!known(subject.action);
    const render=()=>{const a=subject.action||'',k=gameActions().find(g=>g.toLowerCase()===a.toLowerCase());
      for(const b of q('.sim-action-chips').children)b.setAttribute('aria-pressed',String(b.dataset.pickAction==='None'?!a&&!custom:b.dataset.pickAction==='Other…'?custom:b.dataset.pickAction===k&&!custom));
      q('[data-custom]').hidden=!custom;if(document.activeElement!==name)name.value=custom?a:'';
      // Intake needs a time at a pin; Spin up and Aim are quick. Anything else may run for a time.
      const timed=!!a&&!(k==='Spin up'||k==='Aim'),needsTime=where==='pin'&&k==='Intake';q('[data-for]').hidden=!timed;
      q('[data-cell]').hidden=!(L().field==='biobuzz'&&(k==='Shoot'||k==='Aim'));for(const b of q('[data-cell]').querySelectorAll('[data-cell-pick]'))b.setAttribute('aria-pressed',String((subject.cell||'start')===b.dataset.cellPick));
      const hasTime=finite(subject.actionSeconds);q('[data-for-mode=all]').hidden=needsTime;
      q('[data-for-mode=all]').setAttribute('aria-pressed',String(!hasTime));q('[data-for-mode=time]').setAttribute('aria-pressed',String(hasTime));q('[data-for-time]').hidden=!hasTime;
      if(hasTime&&document.activeElement!==secs){secs.value=subject.actionSeconds;window.DeckNumberSliders?.sync(secs);}
      const mech=project.mechanisms.enabled?'':' Set up mechanisms (Setup → 3) to run it in the simulator and the exported code.';
      q('[data-action-hint]').textContent=!a?(where==='path'?'The robot just drives.':'The robot drives on after the pause.'):k?ACTION_INFO[k]+(k==='Intake'||k==='Shoot'?mech:''):'Your own action: the export adds an empty method with this name for your mechanism code.';};
    q('.sim-action-chips').onclick=e=>{const b=e.target.closest('[data-pick-action]');if(!b)return;const pick=b.dataset.pickAction;
      custom=pick==='Other…';subject.action=pick==='None'?'':custom?(known(subject.action)?'':subject.action):pick;
      if(where==='path')subject.kind=subject.action||custom?'action':'regular';
      if(where==='pin'&&pick==='Intake'&&!finite(subject.actionSeconds))subject.actionSeconds=1;
      if(pick==='Spin up'||pick==='Aim'||pick==='None')subject.actionSeconds=null;
      commit();render();if(custom)name.focus();};
    name.onchange=e=>{subject.action=e.target.value.trim().slice(0,40);if(where==='path')subject.kind='action';commit();render();};
    q('[data-cell]').onclick=e=>{const b=e.target.closest('[data-cell-pick]');if(!b)return;subject.cell=b.dataset.cellPick;commit();render();};
    q('[data-for-mode=all]').onclick=()=>{subject.actionSeconds=null;commit();render();};
    q('[data-for-mode=time]').onclick=()=>{if(!finite(subject.actionSeconds))subject.actionSeconds=1;commit();render();secs.focus();};
    secs.onchange=e=>{const v=e.target.valueAsNumber;if(finite(v)&&v>=.05&&v<=30){subject.actionSeconds=v;commit();}render();};
    render();
  }
  function finishEditor(){const box=$('#sim-effects');if(!effects.session)return;const invalid=[...box.querySelectorAll('input,textarea,select')].find(e=>!e.disabled&&!e.checkValidity());if(invalid){const section=invalid.closest('[data-sec]');if(section){const sections=[...box.querySelectorAll('[data-sec]')];box.querySelectorAll('[role=tab]')[sections.indexOf(section)]?.click();}invalid.reportValidity();return;}
    try{const kind=effects.session.target.kind;effects.session.commit();effects.session=null;effects.pickPoint=null;targetPick=null;box.hidden=true;box.replaceChildren();effects.index=-1;changed(kind==='zone'?'zones':'plan');programPanel();graph.focus({preventScroll:true});}catch(e){box.querySelector('.sim-editor-save-note').textContent=e.message;}}
  const pressedIn=(box,attr,value)=>{for(const b of box.querySelectorAll(`[data-${attr}]`))b.setAttribute('aria-pressed',String(b.dataset[attr]===value));};
  document.addEventListener('pointerdown',e=>{const box=$('#sim-effects');if(!effects.session||box.contains(e.target))return;if(targetPick&&graph.contains(e.target))return;if(e.target.closest?.('#sim-stop'))return;e.preventDefault();e.stopImmediatePropagation();box.querySelector('.sim-editor-save-note').textContent='Press Done to save before editing another object.';},true);
  document.addEventListener('click',e=>{if(effects.session&&!$('#sim-effects').contains(e.target)&&!e.target.closest?.('#sim-stop')){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]'))return;if(e.key==='Escape'&&active&&(runState==='starting'||runState==='running'||frame?.playing)){e.preventDefault();stopRun();return;}if(!effects.session)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(targetPick){targetPick=null;$('#eff-pick-target').textContent='Pick target on field';draw();}return;}if(e.key==='Tab'){const nodes=[...$('#sim-effects').querySelectorAll('input,select,textarea,button')].filter(n=>!n.disabled&&n.getClientRects().length),i=nodes.indexOf(document.activeElement);if(i<0||e.shiftKey&&i===0||!e.shiftKey&&i===nodes.length-1){e.preventDefault();nodes[e.shiftKey?nodes.length-1:0]?.focus();}}},true);
  graph.addEventListener('pointerleave',()=>tooltip.hidden=true);
  graph.addEventListener('pointermove',event=>{if(!active||drag||pointer!==null||targetPick||!$('#sim-effects').hidden){tooltip.hidden=true;return;}const p=toField(event),h=p&&!hit(p)&&pathHit(p);if(!h){tooltip.hidden=true;return;}
    const title=document.createElement('strong');title.textContent=`Path ${h.index?h.index:'Start'} → ${h.index+1}`;
    const route=L().route,indices=exporter.pathIndex(route),parts=route.segments.filter((_,i)=>indices[i]===h.index),first=parts[0],last=parts.at(-1),descriptions=planner.pathDescription(pathOf(L(),h.index),project.tuning.maxPathSpeed);
    if(first&&last)descriptions.push(`Heading: ${field.round(first.heading??route.heading)}° → ${field.round(field.heading(last.endHeading??last.heading??route.heading))}°`);
    const lines=descriptions.map(text=>Object.assign(document.createElement('div'),{textContent:text}));tooltip.replaceChildren(title,...lines);tooltip.hidden=false;
    tooltip.style.left=`${Math.max(4,Math.min(innerWidth-tooltip.offsetWidth-4,event.clientX+16))}px`;tooltip.style.top=`${Math.max(4,Math.min(innerHeight-tooltip.offsetHeight-4,event.clientY-tooltip.offsetHeight-14))}px`;
  });
  // Press and hold on a touchscreen or with a pen opens the same settings as a right-click (a mouse
  // has the right button, and a slow mouse drag must never turn into a hold).
  let hold=null;
  function holdStart(target,event){clearTimeout(hold?.timer);hold=null;if(event.pointerType==='mouse')return;hold={x:event.clientX,y:event.clientY,fired:false,timer:setTimeout(()=>{hold.fired=true;drag=null;pendingPin=null;openEffects(target,{clientX:hold.x,clientY:hold.y});},550)};}
  function holdMove(event){if(hold&&!hold.fired&&Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>8){clearTimeout(hold.timer);hold=null;}}
  let pendingPin=null,lastPinTap=null;
  function zoneShape(z,extra=''){const p=planner.polygon(z);return p.length===2?svg('polyline',{class:'sim-zone wall'+extra,points:pts(p),'data-zone':z.id}):svg('polygon',{class:'sim-zone'+extra,points:pts(p),'data-zone':z.id});}
  function showDraft(z){
    const nodes=[];if(z)nodes.push(zoneShape(z,' draft'));
    // The outline is always shown closed back to the first corner, so the shape is mapped out as corners are placed.
    if(sketch){const path=cursor?[...sketch,cursor]:sketch;if(path.length>2){let outline=path;try{outline=planner.validateZone({type:'polygon',points:path}).points;}catch{}nodes.push(svg('polygon',{class:'sim-zone draft',points:pts(outline)}));}else if(path.length>1)nodes.push(svg('polyline',{class:'sim-zone wall draft',points:pts(path)}));for(const [i,q] of sketch.entries())nodes.push(svg('circle',{class:'sim-corner'+(i===0&&sketch.length>2?' close':''),cx:q.x,cy:q.y,r:1.1}));}
    $('#sim-draft').replaceChildren(...nodes);shapeBar();
  }
  function shapeBar(){const n=sketch?.length||0;$('#sim-shape-bar').hidden=!n;if(!n)return;$('#sim-shape-status').textContent=n===1?'1 corner. Tap the next corner.':n===2?'2 corners: a wall line. Add a third to make a closed shape.':`${n} corners, closed back to the first. Press Enter or Finish shape to confirm.`;$('#sim-shape-finish').disabled=n<2;}
  function finishShape(){const points=sketch;sketch=null;cursor=null;showDraft(null);if(!points||points.length<2)return;
    if(L().zones.length>=24)return status('#sim-plan-status','Use at most 24 zones.');
    try{const z=planner.validateZone({id:'zone-'+Date.now().toString(36),type:'polygon',points});L().zones.push(z);selected={kind:'zone',id:z.id};selectTab('plan');changed('zones');}catch(e){status('#sim-plan-status',e.message);}}
  graph.addEventListener('contextmenu',event=>{if(!active||tab!=='plan'||effects.session)return;const p=toField(event);const h=p&&(hit(p)||pathHit(p));if(!h)return;event.preventDefault();if(h.kind==='control')return;
    if(hold?.fired)return;clearTimeout(hold?.timer);hold=null;
    if(h.kind==='pin'||h.kind==='path'){drag=null;pendingPin=null;openEffects(h,event);return;}selected=h;removeSelected();});
  graph.addEventListener('pointermove',event=>{
    if(!active||effects.session)return;holdMove(event);const p=toField(event);if(!p)return;
    // A locked mouse moves the robot by its own motion, so pushing into a wall never builds up
    // distance that has to be won back; touch follows the finger. Either way the robot slides.
    if(graph.dataset.dragging&&pointer===event.pointerId){const g=geometry(),m=graph.getScreenCTM(),locked=document.pointerLockElement===graph&&m;
      const target=field.constrain(locked?{x:preview.x+event.movementX/m.a,y:preview.y-event.movementY/m.d,heading:preview.heading}:{x:p.x+startGrab.dx,y:p.y+startGrab.dy,heading:preview.heading},g);
      preview=planner.slidePose(preview,target,[...(info?.fieldZones||[]),...L().zones],g.footprint,g.bounds);liveEdit(true);return;}
    if(drag?.kind==='draw'){drag.zone=draftZone(drag.from,p);showDraft(drag.zone);return;}
    if(drag?.kind==='zone'){const z=zoneById(drag.id);if(z){const dx=p.x-drag.from.x,dy=p.y-drag.from.y;if(!drag.moved&&Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)<4)return;z.x=drag.zone.x+dx;z.y=drag.zone.y+dy;if(z.type==='polygon')z.points=drag.zone.points.map(q=>({x:q.x+dx,y:q.y+dy}));drag.moved=true;liveEdit();}return;}
    if(drag?.kind==='handle'){const z=zoneById(drag.id);if(z){try{Object.assign(z,planner.validateZone({...drag.zone,...handles(drag.zone)[drag.index].set(p)}));drag.moved=true;liveEdit();zonePanel();}catch{}}return;}
    if(tool==='shape'&&sketch){cursor=p;showDraft(null);}
    if(tool==='draw'&&stroke&&pointer===event.pointerId){if(dist2(stroke.at(-1),p)>=1)stroke.push({x:p.x,y:p.y});$('#sim-draft').replaceChildren(svg('polyline',{class:'sim-draw-stroke',points:pts(stroke)}));return;}
    if(drag?.kind==='control'){const q=L().pins[drag.index],b=geometry().bounds;if(!q?.path?.controls?.[drag.control])return;if(!drag.moved&&Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)<3)return;
      q.path.controls[drag.control]={x:field.round(Math.max(b.x0,Math.min(b.x1,p.x))),y:field.round(Math.max(b.y0,Math.min(b.y1,p.y)))};drag.moved=true;liveEdit();syncPaths();return;}
    if(drag?.kind==='pin'){const q=L().pins[drag.index];if(!drag.moved&&Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)<4)return;clearTimeout(hold?.timer);hold=null;const at=drag.from?{x:drag.pin.x+p.x-drag.from.x,y:drag.pin.y+p.y-drag.from.y}:p;Object.assign(q,nearestPin(at,12)||q);drag.moved=true;liveEdit();return;}
    $('#field-coordinates').textContent=`X ${field.round(p.x)} in · Y ${field.round(p.y)} in`;
  });
  graph.addEventListener('pointerdown',event=>{
    if(!active||tab!=='plan'||event.button!==0||project.view==='3d')return;const p=toField(event);if(!p)return;event.preventDefault();tooltip.hidden=true;
    if(targetPick){effects.pickPoint?.(p);return;}
    if(effects.session)return;
    graph.focus({preventScroll:true});pointer=event.pointerId;graph.setPointerCapture(event.pointerId);
    const existing=hit(p);
    if(existing?.kind==='control'&&!sketch){drag={...existing,clientX:event.clientX,clientY:event.clientY};return;}
    if(existing&&(!sketch||tool!=='shape')){selected=existing;if(existing.kind==='handle')drag={...existing,zone:JSON.parse(JSON.stringify(zoneById(existing.id)))};else if(existing.kind==='zone')drag={...existing,downTime:performance.now(),clientX:event.clientX,clientY:event.clientY,from:p,zone:JSON.parse(JSON.stringify(zoneById(existing.id)))};else{drag={...existing,downTime:performance.now(),clientX:event.clientX,clientY:event.clientY,from:p,pin:{...L().pins[existing.index]}};holdStart(existing,event);}draw();zonePanel();pinPanel();return;}
    if(!sketch&&planner.contains(p,planner.body(preview,geometry().footprint))){startGrab={dx:preview.x-p.x,dy:preview.y-p.y};graph.dataset.dragging='true';
      // A mouse grabs the robot by its centre: the pointer is locked and drawn there until release.
      if(event.pointerType==='mouse'&&graph.requestPointerLock){startGrab={dx:0,dy:0};void api.cursor?.('prepare').catch(()=>{});try{graph.requestPointerLock()?.catch?.(()=>{});}catch{}}
      draw();return;}
    if(!sketch){const onPath=pathHit(p);if(onPath){drag=null;pendingPin=null;if(planningStep!=='pins')setStep('pins');choosePath(onPath.index);return;}}
    if(planningStep==='zones'&&['rect','circle','triangle'].includes(tool)){drag={kind:'draw',from:p,zone:null};return;}
    if(tool==='draw'&&planningStep==='pins'){stroke=[{x:p.x,y:p.y}];return;}
    if(tool==='pin'&&planningStep==='pins'){const h=hit(p);if(h?.kind==='pin'){selected=h;drag={kind:'pin',index:h.index};holdStart(h,event);draw();pinPanel();return;}
      addPin(p);return;}
    if(tool==='shape'&&planningStep==='zones'){if(sketch&&sketch.length>2&&Math.hypot(sketch[0].x-p.x,sketch[0].y-p.y)<=2.5)return finishShape();const last=sketch?.at(-1);if(last&&Math.hypot(last.x-p.x,last.y-p.y)<.3)return;
      sketch=[...(sketch||[]),{x:field.round(p.x),y:field.round(p.y)}];if(sketch.length>=40)return finishShape();showDraft(null);return;}
    if(tool==='select'){const h=hit(p)||pathHit(p);if(h?.kind==='handle'){drag={kind:'handle',id:h.id,index:h.index,zone:JSON.parse(JSON.stringify(zoneById(h.id)))};return;}
      if(h?.kind==='pin')holdStart(h,event);if(h?.kind==='path'){choosePath(h.index);return;}
      selected=h;if(selected?.kind==='zone'){const z=zoneById(selected.id);drag={kind:'zone',id:z.id,from:p,zone:JSON.parse(JSON.stringify(z))};selectTab('plan');}else if(selected?.kind==='pin'){drag={kind:'pin',index:selected.index};selectTab('plan');}draw();zonePanel();pinPanel();}
  });
  graph.addEventListener('pointerup',event=>{
    if(!active||pointer!==event.pointerId)return;const grabbed=!!graph.dataset.dragging;pointer=null;delete graph.dataset.dragging;$('#sim-grab-cursor')?.remove();
    const held=hold?.fired;clearTimeout(hold?.timer);hold=null;
    if(pendingPin){const p=pendingPin;pendingPin=null;if(!held)addPin(p);return;}
    if(held){drag=null;return;}
    if(grabbed){const clear=nearestPin(preview,72,preview.heading);if(clear&&Math.hypot(clear.x-preview.x,clear.y-preview.y)>.75)status('#start-status','Moved to the nearest clear spot outside the red area.');if(clear)preview={...preview,...clear};try{commit(preview);}catch(e){status('#start-status',e.message);preview={...start};tool='start';draw();}releaseCursor();return;}
    if(tool==='draw'&&stroke){const drawn=stroke;stroke=null;$('#sim-draft').replaceChildren();drawnPath(drawn);return;}
    if(drag?.kind==='draw'){const z=drag.zone;drag=null;showDraft(null);if(z&&(z.type==='circle'?z.radius>=.75:z.width>=1&&z.height>=1)){if(L().zones.length>=24)status('#sim-plan-status','Use at most 24 zones.');else{L().zones.push(planner.validateZone(z));selected={kind:'zone',id:z.id};selectTab('plan');changed('zones');}}return;}
    if(drag){const moved=drag.moved,kind=drag.kind,index=drag.index,downTime=drag.downTime;drag=null;if(moved){lastPinTap=null;changed(kind==='pin'||kind==='control'?'pins':'zones');}else if(['pin','zone'].includes(kind)&&performance.now()-downTime<500){const now=performance.now(),previous=lastPinTap;lastPinTap={kind,index,id:selected?.id,layout:L().id,time:now,x:event.clientX,y:event.clientY};if(previous&&previous.layout===L().id&&previous.kind===kind&&previous.index===index&&(kind!=='zone'||previous.id===selected?.id)&&now-previous.time<500&&Math.hypot(previous.x-event.clientX,previous.y-event.clientY)<10){lastPinTap=null;if(kind==='zone')openZoneEffects({kind:'zone',id:selected.id},event);else openEffects({kind:'pin',index},event);}}}
  });
  graph.addEventListener('dblclick',event=>{if(!active||tab!=='plan'||effects.session)return;if(tool==='shape'&&sketch){event.preventDefault();finishShape();return;}const p=toField(event),h=p&&(hit(p)||pathHit(p));if(h?.kind==='zone'){event.preventDefault();drag=null;openZoneEffects(h,event);return;}if(h&&['pin','path'].includes(h.kind)){event.preventDefault();drag=null;pendingPin=null;if(planningStep!=='pins')setStep('pins');choosePath(h.index);$('#path-x')?.focus({preventScroll:true});}});
  // Leave pointer lock with the system cursor on the robot's centre (where the drawn cursor was).
  function releaseCursor(){if(document.pointerLockElement!==graph)return;const m=graph.getScreenCTM(),x=m?m.a*preview.x+m.e:0,y=m?m.d*(fieldHeight()-preview.y)+m.f:0;
    if(m)document.addEventListener('pointerlockchange',()=>void api.cursor?.(x,y).catch(()=>{}),{once:true});document.exitPointerLock();}
  graph.addEventListener('wheel',e=>{if(!active||project.view==='3d')return;e.preventDefault();zoomBy(Math.exp(-e.deltaY*(e.deltaMode===1?.05:.0015)),e.clientX,e.clientY);},{passive:false});
  // Middle-drag, or Space+drag, pans a zoomed field; it runs before (and instead of) the editing handlers.
  graph.addEventListener('pointerdown',e=>{if(!active||project.view==='3d'||!(e.button===1||spaceHeld&&e.button===0)||zoom.z<=1.001)return;e.preventDefault();e.stopImmediatePropagation();panning={x:e.clientX,y:e.clientY,cx:zoom.cx,cy:zoom.cy,id:e.pointerId};graph.setPointerCapture(e.pointerId);graph.dataset.panning='true';},true);
  graph.addEventListener('pointermove',e=>{if(!panning||e.pointerId!==panning.id)return;e.stopImmediatePropagation();const m=graph.getScreenCTM();if(!m)return;zoom.cx=panning.cx-(e.clientX-panning.x)/m.a;zoom.cy=panning.cy-(e.clientY-panning.y)/m.d;applyZoom();},true);
  for(const type of ['pointerup','pointercancel'])graph.addEventListener(type,e=>{if(!panning||e.pointerId!==panning.id)return;e.stopImmediatePropagation();panning=null;delete graph.dataset.panning;},true);
  graph.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
  graph.addEventListener('keydown',e=>{if(!active||effects.session||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key===' '){spaceHeld=true;if(zoom.z>1.001)e.preventDefault();return;}const k={'+':'in','=':'in','-':'out','_':'out','0':'fit'}[e.key];if(!k||project.view==='3d')return;e.preventDefault();k==='fit'?(zoom.z=1,applyZoom()):zoomBy(k==='in'?1.4:1/1.4);});
  graph.addEventListener('keyup',e=>{if(e.key===' ')spaceHeld=false;});addEventListener('blur',()=>{spaceHeld=false;});
  for(const b of $$('[data-zoom]'))b.onclick=()=>{if(b.dataset.zoom==='fit'){zoom.z=1;applyZoom();}else zoomBy(b.dataset.zoom==='in'?1.4:1/1.4);};
  graph.addEventListener('pointercancel',()=>{releaseCursor();delete graph.dataset.dragging;$('#sim-grab-cursor')?.remove();clearTimeout(hold?.timer);hold=null;pendingPin=null;pointer=null;drag=null;stroke=null;showDraft(null);preview={...start};draw();});
  graph.addEventListener('keydown',event=>{
    if(effects.session||!active||tab!=='plan'||event.ctrlKey||event.metaKey||event.altKey)return;
    if(tool==='start'){
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
      if(delta){event.preventDefault();preview=field.constrain({...preview,x:preview.x+delta[0],y:preview.y+delta[1]},geometry());draw();}
      else if(event.key==='Enter'){event.preventDefault();try{commit(preview);}catch(e){status('#start-status',e.message);}}
      else if(event.key==='Escape'){event.preventDefault();if(planningStep!=='start')tool='select';preview={...start};draw();}
      return;
    }
    if(tool==='shape'&&sketch){if(event.key==='Enter'){event.preventDefault();finishShape();return;}if(event.key==='Escape'){event.preventDefault();sketch=null;cursor=null;showDraft(null);return;}if(event.key==='Backspace'){event.preventDefault();sketch.pop();if(!sketch.length)sketch=null;showDraft(null);return;}}
    if(event.key==='Escape'){targetPick=null;tool='select';drag=null;showDraft(null);draw();return;}
    if(!selected)return;
    if(event.key==='Enter'&&['pin','path'].includes(selected.kind)){event.preventDefault();choosePath(selected.index);$('#path-x')?.focus({preventScroll:true});return;}
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
  function setTool(next){if(!['select','rect','circle','triangle','shape','pin','draw','start'].includes(next))return;if(sketch&&next!=='shape')finishShape();tool=next;if(next==='start')preview={...start};draw();graph.focus({preventScroll:true});}
  for(const b of $$('[data-tool]'))b.onclick=()=>setTool(b.dataset.tool);
  $('#sim-shape-finish').onclick=()=>finishShape();
  $('#sim-shape-undo').onclick=()=>{if(!sketch)return;sketch.pop();if(!sketch.length)sketch=null;showDraft(null);};
  $('#sim-shape-cancel').onclick=()=>{sketch=null;cursor=null;showDraft(null);};
  document.addEventListener('keydown',event=>{if(active&&tab==='plan'&&tool==='shape'&&sketch&&event.key==='Enter'&&!event.target.closest?.('input,textarea,select,#simulation-field')){event.preventDefault();finishShape();}});
  function zonePanel(){const box=$('#sim-zone-editor');box.hidden=true;}
  function openZoneEffects(target,at){
    if(optimizing||effects.session)return;effects.session=window.DeckSimEditor.begin(L(),target);selected={...target};const z=effects.session.draft,box=$('#sim-effects');tooltip.hidden=true;effects.index=-1;
    const name=z.type==='polygon'?(z.points.length===2?'Wall':'Custom shape'):{rect:'Box',circle:'Circle',triangle:'Triangle'}[z.type],fields=z.type==='circle'?[['x','X · in'],['y','Y · in'],['radius','Radius · in']]:z.type==='polygon'?[['x','Centre X · in'],['y','Centre Y · in']]:[['x','X · in'],['y','Y · in'],['width','Width · in'],['height','Height · in'],['angle','Rotation · °']];
    box.setAttribute('aria-label','Obstacle settings');box.innerHTML=`<div class="sim-pop-head"><h3>${name}</h3><span class="sim-editor-grip" aria-label="Drag editor">⠿</span></div><div class="sim-grid2">${fields.map(([key,label])=>`<div><label for="zone-edit-${key}">${label}</label><input id="zone-edit-${key}" data-zone-key="${key}" type="number" step="any" value="${field.round(z[key]||0)}" ${['width','height','radius'].includes(key)?'min="0.25"':''}></div>`).join('')}</div>${z.type==='polygon'?'<label for="zone-corner">Corner</label><select id="zone-corner">'+z.points.map((_,i)=>`<option value="${i}">Corner ${i+1}</option>`).join('')+'</select><div class="sim-grid2"><div><label for="zone-corner-x">Corner X · in</label><input id="zone-corner-x" type="number" step="any"></div><div><label for="zone-corner-y">Corner Y · in</label><input id="zone-corner-y" type="number" step="any"></div></div>':''}<p class="sim-editor-save-note" role="status">Draft · press Done to save</p><div class="button-row"><button type="button" class="primary" id="zone-edit-done">Done</button></div>`;
    for(const input of box.querySelectorAll('[data-zone-key]'))input.onchange=()=>{const key=input.dataset.zoneKey,v=input.valueAsNumber;if(!finite(v)){input.setCustomValidity('Enter a finite number.');input.reportValidity();return;}input.setCustomValidity('');if(z.type==='polygon'){const delta=v-z[key];for(const p of z.points)p[key]+=delta;}z[key]=v;};
    if(z.type==='polygon'){const corner=box.querySelector('#zone-corner'),show=()=>{for(const axis of ['x','y'])box.querySelector('#zone-corner-'+axis).value=field.round(z.points[+corner.value][axis]);};corner.onchange=show;for(const axis of ['x','y'])box.querySelector('#zone-corner-'+axis).onchange=e=>{const v=e.target.valueAsNumber;if(finite(v)){z.points[+corner.value][axis]=v;e.target.setCustomValidity('');}else e.target.setCustomValidity('Enter a finite number.');};show();}
    box.querySelector('#zone-edit-done').onclick=finishEditor;const header=box.querySelector('.sim-pop-head');let grab=null;header.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const r=box.getBoundingClientRect();grab={x:e.clientX-r.left,y:e.clientY-r.top};header.setPointerCapture(e.pointerId);};header.onpointermove=e=>{if(grab)clampEditor(box,e.clientX-grab.x,e.clientY-grab.y);};header.onpointerup=header.onpointercancel=()=>grab=null;
    box.hidden=false;clampEditor(box,(at?.clientX??innerWidth/2)+24,(at?.clientY??150)-30);draw();box.querySelector('input')?.focus({preventScroll:true});
  }
  // What happens at a pin, in order: e.g. "pause 0.5 s → Shoot for 1 s → drive on".
  const pinSteps=p=>{const steps=[];if(finite(p.turn))steps.push(p.turnMode==='relative'?`turn by ${p.turn>=0?'+':''}${p.turn}°`:p.turnMode==='start'?'turn to the start heading':p.turnMode==='track'?'turn to the target':`turn to ${Math.round(p.turn)}°`);
    if(p.wait>0)steps.push(`pause ${p.wait} s`);if(p.action)steps.push(`${p.action}${p.cell==='other'&&/^(shoot|aim)$/i.test(p.action)?' (other cell)':''} ${finite(p.actionSeconds)?`for ${p.actionSeconds} s`:/^shoot$/i.test(p.action)?'until empty':'until done'}`);return steps.length?[...steps,'drive on'].join(' → '):'';};
  function effectSummary(p){const path=p.path||{},bits=[];
    if(finite(path.power))bits.push(`${Math.round(path.power*100)}% motor power`);
    bits.push(...planner.pathDescription(path,project.tuning.maxPathSpeed).slice(1).filter(v=>v!=='Hold inherited heading'));
    const at=pinSteps(p);if(at)bits.push(`At the end: ${at}`);if(p.note)bits.push(p.note);
    return bits.join(' · ');}
  // The route as a Pedro Pathing-style path list: the start, then one row per path (each pin is the
  // end point of the path that drives to it). The open path is edited in place: end point, heading,
  // shape, power, wait and actions. The pin and path editors stay one click away for the rest.
  const HEADINGS={keep:'Constant (hold heading)',turn:'Linear to a field heading',tangent:'Face along the path (tangent)',reverse:'Face backwards along the path',relative:'Turn by an angle',track:'Face a target',start:'Back to start heading',spin:'Spin'};
  const HEADING_VALUE={turn:['heading','End heading · °'],relative:['angle','Turn by · ° (+ left, − right)'],spin:['spins','Full spins (+ left, − right)']};
  const openPath=()=>['pin','path'].includes(selected?.kind)&&L().pins[selected.index]?selected.index:-1;
  function choosePath(i){selected=i<0?null:{kind:'pin',index:i};pinPanel();draw();if(i>=0)$(`#sim-pin-list [data-path="${i}"]`)?.scrollIntoView({block:'nearest'});}
  const xy=p=>`(${field.round(p.x)}, ${field.round(p.y)})`;
  const actionOptions=(select,current,none)=>{select.replaceChildren(...[...new Set(['',...gameActions(),...(current?[current]:[])])].map(a=>new Option(a||none,a)),new Option('Other…','__other'));select.value=current||'';};
  function pinPanel(){
    const list=$('#sim-pin-list'),l=L(),open=openPath(),holonomic=C.drives[project.robot.drivetrain].holonomic,p=l.pins[open];
    $('#sim-add-path').disabled=l.pins.length>=32;
    // Rebuild only when the rows or the open card's fields change, so typing and Tab keep their place.
    const shape=JSON.stringify([l.id,l.pins.length,open,holonomic,project.tuning.maxPathSpeed,gameActions(),p&&[p.path?.rotate,p.action,p.path?.action,p.path?.controls?.length||0]]);
    if(list.dataset.shape===shape)return syncPaths();
    const focus=list.contains(document.activeElement)?document.activeElement.id:'';list.dataset.shape=shape;
    const first=document.createElement('li');first.className='sim-path-start';
    first.innerHTML='<span class="sim-badge">S</span><span class="sim-path-title">Start</span><span class="sim-path-at" data-at></span><button type="button" class="text-button" data-edit-start>Edit</button>';
    first.querySelector('[data-edit-start]').onclick=()=>{void setView('2d');setStep('start');};
    list.replaceChildren(first,...l.pins.map((q,i)=>pathRow(q,i,i===open,holonomic)));
    if(!l.pins.length){const li=document.createElement('li');li.className='hint sim-path-empty';li.textContent='No paths yet. Click the field or press + Add path.';list.append(li);}
    syncPaths();if(focus)document.getElementById(focus)?.focus({preventScroll:true});
  }
  function pathRow(p,i,isOpen,holonomic){
    const l=L(),li=document.createElement('li'),name=`Path ${i+1}`;li.className='sim-path-row'+(isOpen?' selected':'');li.dataset.path=i;
    li.innerHTML=`<div class="sim-path-head"><button type="button" class="sim-path-pick" aria-expanded="${isOpen}"><span class="sim-path-swatch"></span><span class="sim-path-title">${name}</span><span class="sim-path-at" data-at></span></button><button type="button" class="icon-button" data-move="-1" aria-label="Move ${name} earlier" title="Move earlier"${i===0?' disabled':''}>↑</button><button type="button" class="icon-button" data-move="1" aria-label="Move ${name} later" title="Move later"${i===l.pins.length-1?' disabled':''}>↓</button><button type="button" class="icon-button" data-remove aria-label="Delete ${name}" title="Delete path">×</button></div><p class="sim-pin-summary hint"></p>`;
    li.querySelector('.sim-path-pick').onclick=()=>choosePath(isOpen?-1:i);
    for(const b of li.querySelectorAll('[data-move]'))b.onclick=()=>{const j=i+Number(b.dataset.move);if(!l.pins[j])return;[l.pins[i],l.pins[j]]=[l.pins[j],l.pins[i]];selected={kind:'pin',index:j};changed('pins');};
    li.querySelector('[data-remove]').onclick=()=>{l.pins.splice(i,1);selected=null;changed('pins');};
    if(!isOpen)return li;
    const path=p.path=planner.pathEffects(p.path),body=document.createElement('div');body.className='sim-path-body';
    body.innerHTML=`<div class="sim-grid2"><div><label for="path-x">End X · in</label><input id="path-x" type="number" step="any"></div><div><label for="path-y">End Y · in</label><input id="path-y" type="number" step="any"></div></div>
      <label for="path-heading">Heading</label><select id="path-heading">${Object.entries(HEADINGS).map(([k,v])=>`<option value="${k}"${!holonomic&&k!=='keep'?' disabled':''}>${v}</option>`).join('')}</select>
      ${HEADING_VALUE[path.rotate]?`<label for="path-heading-value">${HEADING_VALUE[path.rotate][1]}</label><input id="path-heading-value" type="number" step="${path.rotate==='spin'?1:'any'}">`:''}
      ${path.rotate==='track'?'<div class="sim-grid2"><div><label for="path-target-x">Target X · in</label><input id="path-target-x" type="number" step="any"></div><div><label for="path-target-y">Target Y · in</label><input id="path-target-y" type="number" step="any"></div></div>':''}
      ${holonomic?'':'<p class="hint">Tank drivetrains turn in place between straight paths.</p>'}
      <div class="sim-grid2"><div><label for="path-shape">Shape</label><select id="path-shape"><option value="">Route default</option><option value="sharp">Straight</option><option value="spline"${holonomic?'':' disabled'}>Curve</option><option value="custom"${holonomic?'':' disabled'}>Custom curve (drag handles)</option></select></div><div><label for="path-power">Motor power · 0–1</label><input id="path-power" type="number" min="0" max="1" step="any" placeholder="Setup ${project.tuning.maxPathSpeed??.8}"></div></div>
      ${path.controls?path.controls.map((_,j)=>`<div class="sim-grid2"><div><label for="path-c${j}x">Handle ${j+1} X · in</label><input id="path-c${j}x" type="number" step="any"></div><div><label for="path-c${j}y">Handle ${j+1} Y · in</label><input id="path-c${j}y" type="number" step="any"></div></div>`).join(''):''}
      <label for="path-drive-action">While driving</label><select id="path-drive-action"></select>
      <div class="sim-grid2"><div><label for="path-wait">Wait at end · s</label><input id="path-wait" type="number" min="0" step="any"></div><div><label for="path-end-action">Then do</label><select id="path-end-action"></select></div></div>
      <div class="sim-path-more"><button type="button" class="text-button" data-more="path">Path options…</button><button type="button" class="text-button" data-more="pin">End point options…</button></div>`;
    li.append(body);const q=s=>body.querySelector(s),at=e=>{const r=e.target.getBoundingClientRect();return {clientX:r.left,clientY:r.top};};
    const number=(input,assign,min=-Infinity,max=Infinity,optional=false)=>{input.onchange=e=>{const raw=e.target.value.trim(),v=e.target.valueAsNumber;
      if(optional&&raw===''){e.target.setCustomValidity('');assign(null);return changed('plan');}
      if(!finite(v)||v<min||v>max){e.target.setCustomValidity(`Enter a number${finite(min)?' from '+min:''}${finite(max)?' to '+max:''}.`);e.target.reportValidity();return;}
      e.target.setCustomValidity('');assign(v);p.path=planner.pathEffects(path);changed('plan');};};
    const move=()=>{const want={x:q('#path-x').valueAsNumber,y:q('#path-y').valueAsNumber};if(!finite(want.x)||!finite(want.y))return syncPaths();
      const c=nearestPin(want);if(!c){status('#sim-plan-status','No clear spot near there: the whole robot must fit inside the field and outside red areas.');return syncPaths();}
      p.x=c.x;p.y=c.y;if(Math.hypot(c.x-want.x,c.y-want.y)>.75)status('#sim-plan-status',`${name} ends at the nearest clear spot outside the red area.`);changed('pins');};
    q('#path-x').onchange=q('#path-y').onchange=move;
    q('#path-heading').onchange=e=>{path.rotate=e.target.value;if(path.rotate==='track'&&!path.target){const b=geometry().bounds;path.target={x:field.round((b.x0+b.x1)/2),y:field.round(b.y1-8)};}p.path=planner.pathEffects(path);changed('plan');};
    if(q('#path-heading-value')){const [key]=HEADING_VALUE[path.rotate];number(q('#path-heading-value'),v=>path[key]=key==='heading'?field.heading(v):key==='spins'?Math.round(v)||1:v);}
    if(q('#path-target-x'))for(const axis of ['x','y'])number(q('#path-target-'+axis),v=>path.target={...path.target,[axis]:v});
    q('#path-shape').onchange=e=>{const v=e.target.value;if(v==='custom'){path.controls=startControls(i);path.style=null;}else{path.controls=null;path.style=v||null;}path.shapeAuto=false;p.path=planner.pathEffects(path);changed('plan');if(v==='custom')status('#sim-plan-status',`${name} is a custom curve: drag its two handles on the field to shape it.`);};
    if(path.controls){const b=geometry().bounds;path.controls.forEach((_,j)=>{number(q(`#path-c${j}x`),v=>path.controls[j]={...path.controls[j],x:v},b.x0,b.x1);number(q(`#path-c${j}y`),v=>path.controls[j]={...path.controls[j],y:v},b.y0,b.y1);});}
    number(q('#path-power'),v=>path.power=v,0,1,true);number(q('#path-wait'),v=>p.wait=v,0);
    actionOptions(q('#path-drive-action'),path.action,'Just drive');actionOptions(q('#path-end-action'),p.action,'Nothing');
    q('#path-drive-action').onchange=e=>{if(e.target.value==='__other'){e.target.value=path.action||'';return openEffects({kind:'path',index:i},at(e));}
      path.action=e.target.value;path.kind=path.action?'action':'regular';if(!path.action)path.actionSeconds=null;p.path=planner.pathEffects(path);changed('plan');};
    q('#path-end-action').onchange=e=>{if(e.target.value==='__other'){e.target.value=p.action||'';return openEffects({kind:'pin',index:i},at(e));}
      p.action=e.target.value;if(/^intake$/i.test(p.action)&&!finite(p.actionSeconds))p.actionSeconds=1;if(!p.action||/^(spin up|aim)$/i.test(p.action))p.actionSeconds=null;changed('plan');};
    for(const b of body.querySelectorAll('[data-more]'))b.onclick=e=>openEffects({kind:b.dataset.more,index:i},at(e));
    return li;
  }
  // Fills the list from the layout without rebuilding it; the field being typed in keeps its text.
  function syncPaths(){
    const list=$('#sim-pin-list'),l=L(),power=project.tuning.maxPathSpeed??.8,set=(input,v)=>{if(input&&input!==document.activeElement)input.value=v;};
    const first=list.querySelector('.sim-path-start [data-at]');if(first)first.textContent=`${xy(start)} · ${Math.round(start.heading)}°`;
    for(const row of list.querySelectorAll('.sim-path-row')){const i=Number(row.dataset.path),p=l.pins[i];if(!p)continue;
      row.querySelector('[data-at]').textContent=`→ ${xy(p)}`;row.querySelector('.sim-path-swatch').style.background=planner.pathAppearance(p.path,power).color;row.querySelector('.sim-pin-summary').textContent=effectSummary(p);
      if(!row.classList.contains('selected'))continue;const path=planner.pathEffects(p.path),q=s=>row.querySelector(s);
      set(q('#path-x'),field.round(p.x));set(q('#path-y'),field.round(p.y));set(q('#path-heading'),path.rotate);set(q('#path-shape'),path.controls?'custom':path.style||'');set(q('#path-power'),path.power??'');set(q('#path-wait'),p.wait||0);
      (path.controls||[]).forEach((c,j)=>{set(q(`#path-c${j}x`),field.round(c.x));set(q(`#path-c${j}y`),field.round(c.y));});
      if(HEADING_VALUE[path.rotate])set(q('#path-heading-value'),path[HEADING_VALUE[path.rotate][0]]);if(path.target){set(q('#path-target-x'),path.target.x);set(q('#path-target-y'),path.target.y);}}
  }

  // ------------------------------------------------------------------ planning
  let worker=null;
  function planWith(request){
    if(worker===null){try{worker=new Worker('simulation-worker.js');}catch{worker=false;}}
    if(worker)return new Promise((resolve,reject)=>{const id=++planWith.id,w=worker,cleanup=()=>{clearTimeout(timer);w.removeEventListener('message',done);w.removeEventListener('error',failed);},done=event=>{if(event.data?.id!==id)return;cleanup();event.data.error?reject(Object.assign(Error(event.data.error),{issues:event.data.issues||[]})):resolve(event.data.result);},failed=event=>{cleanup();reject(Error(event.message||'The planner stopped. Adjust the route and try again.'));},timer=setTimeout(()=>{cleanup();reject(Error('Planning took too long. Simplify the zones or add intermediate pins.'));},30000);w.addEventListener('message',done);w.addEventListener('error',failed);w.postMessage({id,...request});});
    return script('vendor/planning.js').then(()=>planner.plan(request.project,request.footprint,request.fieldZones,request.field));
  }
  planWith.id=0;
  const planRequest=(style,tension)=>{const l=L(),g=geometry();return {project:{start,zones:l.zones,pins:MECH.prepare(l.pins,project.mechanisms,info?.target),clearance:l.clearance,style,tension,rotate:l.rotate!==false,nonholonomic:!C.drives[project.robot.drivetrain].holonomic,defaultPower:project.tuning.maxPathSpeed??.8},footprint:g.footprint,fieldZones:info?.fieldZones||[],field:g.bounds};};
  const schedulePlan=(()=>{let t;const schedule=()=>{clearTimeout(t);t=setTimeout(()=>void plan(),220);};schedule.cancel=()=>clearTimeout(t);return schedule;})();
  async function plan(){
    if(native){try{await ready();}catch(e){planError=e.message;status('#sim-plan-status',e.message);return null;}}
    const l=L(),seq=++planSeq;refreshDiagnostics();if(!l.pins.length){l.route=null;analysisPending=false;planError='';refreshDiagnostics();draw();status('#sim-plan-status','Add pins to make a route.');return null;}
    if(native&&!info)return null;
    try{const route=await planWith(planRequest(l.style));if(seq!==planSeq||l!==L())return null;route.defaultPower=project.tuning.maxPathSpeed??.8;l.route=route;blockedPin=-1;planError='';diagnostics=[];analysisPending=false;refreshDiagnostics();save();draw();
      const stops=route.stops.filter(s=>s.wait>0).length,avoid=info?.obstacleName?` and ${info.fieldName}'s ${info.obstacleName}`:'';
      status('#sim-plan-status',`Route ready: ${route.length.toFixed(0)} in${stops?`, ${stops} pause${stops>1?'s':''}`:''}. It stays ${(route.clearance/2).toFixed(1)}+ in from your zones${avoid}.`);
      tested();programPanel();void autoExport();scheduleEstimate();return route;
    }catch(e){if(seq===planSeq){l.route=null;planError=e.message;analysisPending=false;diagnostics=e.issues?.length?e.issues:planner.analyze(planRequest(l.style).project,geometry().footprint,info?.fieldZones||[],geometry().bounds);const m=/pin (\d+)/i.exec(e.message);blockedPin=m?Number(m[1])-1:-1;if(!diagnostics.length)diagnostics=[{pin:blockedPin>=0?blockedPin:null,code:'path',message:e.message}];refreshDiagnostics();draw();status('#sim-plan-status',`${diagnostics.length} issue${diagnostics.length===1?'':'s'} found. Open Diagnostics for every affected path.`);}return null;}
  }
  // Simulated time for the planned route: once edits settle, the route is test-driven in the background
  // with the same physics and follower as Run (about a second). It is the simulator's estimate, shown as one.
  function routeEstimate(){const e=estimates.get(L().id);return e&&e.route===L().route?e:null;}
  function scheduleEstimate(delay=700){clearTimeout(estimateTimer);if(native&&L().route&&!routeEstimate()?.time)estimateTimer=setTimeout(()=>void estimate(),delay);}
  async function estimate(){
    const l=L(),route=l.route;if(!route||routeEstimate())return;// Wait while a route is being driven; once it has finished (the practice clock may still run) test-drive away.
    if(optimizing||runState==='starting'||runState==='running'&&!frame?.result)return scheduleEstimate(3000);
    const seq=++estimateSeq;estimates.set(l.id,{route,pending:true});refreshDiagnostics();
    try{const [r]=await call('evaluate',[route]),last=l.pins.at(-1);if(seq!==estimateSeq)return;estimates.set(l.id,r?.ok?{route,time:r.time,violations:r.violations,miss:last?Math.hypot(r.truth.x-last.x,r.truth.y-last.y):0}:{route,error:r?.error||'The test drive stopped early.'});}
    catch(e){if(seq===estimateSeq)estimates.set(l.id,{route,error:e.message});}
    if(seq===estimateSeq)refreshDiagnostics();
  }
  // Plan each route shape, test-drive them all with the real follower and physics, keep the fastest
  // one that touched no zone and ended on target.
  async function optimize(){
    if(effects.session)return;try{await ready();}catch(e){return status('#sim-plan-status',e.message);}schedulePlan.cancel();const l=L();if(!l.pins.length)return status('#sim-plan-status','Add pins first.');optimizing=true;optimize.layoutId=l.id;transport();const seq=++planSeq,generation=load.seq,request=planRequest(l.style),rows=[],seen=new Set();let chosen=null,reason='';
    const check=()=>{if(seq!==planSeq||generation!==load.seq||l!==L())throw Error('The field changed during optimization. Run Optimize again.');};
    const compare=async candidates=>{const planned=[];for(const candidate of candidates){check();const signature=candidate.styles.join(',');if(seen.has(signature))continue;seen.add(signature);try{planned.push({...candidate,route:await planWith({...request,project:candidate.project})});}catch(e){reason=reason||e.message;}}
      for(let from=0;from<planned.length;from+=6){check();status('#sim-plan-status',`Test-driving shape combinations ${rows.length+1}–${rows.length+Math.min(6,planned.length-from)}…`);const batch=planned.slice(from,from+6),results=await call('evaluate',batch.map(c=>c.route));check();for(const [i,candidate]of batch.entries()){const result=results[i],last=l.pins.at(-1),ok=!!(result?.ok&&result.violations===0&&Math.hypot(result.truth.x-last.x,result.truth.y-last.y)<1.5),row={label:candidate.label,time:result?.time,ok,note:result?.error||(!ok?'touched a zone or missed the final pin':'')};rows.push(row);if(ok&&(!chosen||result.time<chosen.time))chosen={...candidate,time:result.time,row};}}};
    try{const candidates=C.drives[project.robot.drivetrain].holonomic?planner.shapeCandidates(request.project):[{project:request.project,styles:l.pins.map(()=> 'sharp'),label:'Tank route'}];await compare(candidates);if(chosen&&l.pins.length>4)await compare(planner.shapeCandidates(request.project,chosen.styles));
      if(!chosen)throw Error(reason||'No tested route finished clear of obstacles and on target. Increase clearance or move the pins.');check();
      l.pins=chosen.project.pins;l.route=chosen.route;l.tested=rows.map(r=>({...r,best:r===chosen.row}));estimates.set(l.id,{route:chosen.route,time:chosen.time,violations:0,miss:0});refreshDiagnostics();save();draw();pinPanel();tested();programPanel();status('#sim-plan-status',`Fastest tested safe route: ${chosen.label.toLowerCase()} in ${chosen.time.toFixed(2)} s. Explicit path shapes were kept.`);void autoExport();
    }catch(e){status('#sim-plan-status',e.message);}finally{optimizing=false;transport();}
  }
  function tested(){const rows=L().tested||[];$('#sim-tested').replaceChildren(...(rows.length?[Object.assign(document.createElement('div'),{className:'hint',textContent:'Last Optimize test drives:'})]:[]),...[...rows.filter(r=>r.best),...rows.filter(r=>!r.best)].slice(0,6).map(r=>{const d=document.createElement('div');d.className='sim-tested-row'+(r.best?' best':'');d.textContent=`${r.label||STYLES[r.style]||r.style}: ${finite(r.time)&&r.ok?r.time.toFixed(2)+' s':r.note}${r.best?' · fastest tested':''}`;return d;}));}
  $('#sim-optimize').onclick=()=>void optimize();
  for(const b of $$('[data-style]'))b.onclick=()=>{L().style=b.dataset.style;for(const p of L().pins)if(p.path?.shapeAuto)p.path={...p.path,style:null,shapeAuto:false};pressed('style',L().style);changed('plan');};
  for(const b of $$('[data-rotate]'))b.onclick=()=>{L().rotate=b.dataset.rotate==='auto';rotatePanel();changed('plan');};
  function rotatePanel(){const holonomic=C.drives[project.robot.drivetrain].holonomic;pressed('rotate',holonomic?(L().rotate===false?'off':'auto'):'auto');for(const b of $$('[data-rotate]'))b.disabled=!holonomic;
    $('#sim-rotate-note').textContent=!holonomic?'Tank drivetrains always turn the whole chassis between straight legs, backing out to line up when there is no room to turn.':L().rotate===false?'Unmodified paths hold the starting heading. Explicit path and pin turns override this and carry their heading forward.':'Unmodified routes may turn to clear obstacles. Explicit heading modifiers take precedence; later paths inherit their final heading. Dashed chassis outlines show turns in place.';}
  $('#sim-clearance').onchange=e=>{L().clearance=Math.max(planner.MIN_CLEARANCE,finite(e.target.valueAsNumber)?e.target.valueAsNumber:L().clearance);e.target.value=L().clearance;changed('plan');};
  $('#sim-clear-pins').onclick=()=>{L().pins=[];selected=null;changed('pins');};
  $('#sim-clear-zones').onclick=()=>{L().zones=[];selected=null;changed('zones');};

  // ------------------------------------------------------------------ export
  // Why there is nothing to export: no paths yet, still planning, or a route issue to fix first.
  const noRoute=()=>!L().pins.length?'Add a path first: click the field in Path planning.':diagnostics.length?`Fix the route issue first (${diagnostics[0].message}) — see Path planning → Diagnostics.`:planError?`Fix the route first: ${planError}`:'The route is still being planned. Try again in a moment.';
  function exportText(format){
    const l=L(),route=l.route;if(!route)throw Error(noRoute());
    if(format==='onbot')return teamCode(route,true).source;
    if(format==='motionmodule')return window.DeckSimMotionModule.autonomous(route,{...project.timing,...(project.timing.source==='robot'?info?.timing:{}),power:project.tuning.maxPathSpeed??.8},{name:l.name,mechanisms:info?.mechanisms,target:info?.target,robot:project.robot});
    if(format==='timed')return JSON.stringify({format:'deck-timed-drive-v1',controller:project.controller,units:'inches',feedback:'IMU heading only; no X/Y feedback',notice:'Simulation schedule; not a MotionModule firmware integration.',start,field:l.field,...window.DeckTimed.compile(route,{...project.timing,...(project.timing.source==='robot'?info?.timing:{}),power:project.tuning.maxPathSpeed??.8})},null,2);
    const lay={name:l.name,field:l.field,fieldName:GAMES[l.field],width:l.width,height:l.height,start,zones:l.zones};
    return format==='java'?exporter.java(route,lay,{className:project.export.className,packageName:project.export.packageName,polygon:planner.polygon}):exporter.pp(route,lay,{polygon:planner.polygon});
  }
  // MotionModule actions run the team's code in robot_actions.py, created beside autonomous.py once.
  const companion=format=>format==='motionmodule'&&L().route?{name:'robot_actions.py',text:window.DeckSimMotionModule.actionsFile(L().route,{name:L().name,mechanisms:info?.mechanisms})}:undefined;
  async function exportRoute(format){
    try{const text=exportText(format),name=format==='onbot'?project.export.className+'Auto.java':format==='java'?project.export.className+'.java':format==='motionmodule'?'autonomous.py':(L().name.replace(/[^\w -]/g,'')||'route')+(format==='timed'?'.json':'.pp');
      const r=await api.simFile('export-save',{key:L().id,format,text,name,keep:project.export.keep,companion:companion(format)});
      if(r)status('#sim-export-status',(project.export.keep?`Exported ${r.name}. It updates whenever this route changes.`:`Exported ${r.name}.`)+(r.created?` Created ${r.created} for your action code.`:''));}
    catch(e){status('#sim-export-status',e.message);}
  }
  async function autoExport(){
    if(!native||!project.export.keep||!L().route)return;
    for(const format of ['onbot','java','pp','timed','motionmodule']){try{const r=await api.simFile('export-update',{key:L().id,format,text:exportText(format),companion:companion(format)});if(r)status('#sim-export-status',`Updated ${r.name}.`);}catch(e){status('#sim-export-status',e.message);}}
  }
  async function exportPanel(){
    exportChecklist();
    delete $('#sim-export-ready').dataset.pedro;
    $('#sim-export-keep').checked=project.export.keep;$('#sim-export-package').value=project.export.packageName;$('#sim-export-class').value=project.export.className;status('#sim-export-status','');
    if(native&&project.export.keep){try{const t=await api.simFile('export-status',{key:L().id});status('#sim-export-status',t?`Keeping ${t.name} updated.`:'');}catch{}}
  }
  // Everything a Control Hub needs for this route: OpMode, Deck controller configuration, route (and a drive-encoder
  // localizer when used), written under a TeamCode java folder the team picks.
  function teamCode(route,onbot=false){const l=L(),lay={name:l.name,field:l.field,fieldName:GAMES[l.field],width:l.width,height:l.height,start,zones:l.zones};
    if(!info)throw Error('Wait for the simulation to load.');
    return window.DeckSimFtc[onbot?'onBotJava':'files']({route,layout:lay,mechanisms:info.mechanisms,target:info.target,tuning:info.tuning,robot:info.robot,localization:project.sensors.localization,setupName:project.setupName,packageName:project.export.packageName,className:project.export.className,
      routeJava:exporter.java(route,lay,{className:project.export.className,packageName:project.export.packageName,polygon:planner.polygon})});}
  $('#sim-export-onbot').onclick=()=>void exportRoute('onbot');
  $('#sim-export-teamcode').onclick=async()=>{try{if(!L().route)throw Error(noRoute());const out=teamCode(L().route),r=await api.simFile('teamcode-save',{files:out.files,keep:out.keep});if(r)status('#sim-export-status',`Wrote ${r.count} TeamCode files under ${r.name}${r.kept?.length?` (kept your ${r.kept.join(', ')})`:''}. OpMode: ${out.opMode.split('.').pop()}. Mechanism code goes in RobotActions.java.`);}catch(e){status('#sim-export-status',e.message);}};
  // Pedro Pathing 3: the route, its OpMode and action slots for a TeamCode built from the Pedro Quickstart.
  function pedroCode(route){const l=L(),lay={name:l.name,field:l.field,fieldName:GAMES[l.field],width:l.width,height:l.height,start,zones:l.zones};if(!info)throw Error('Wait for the simulation to load.');
    return window.DeckSimPedro.files({route,layout:lay,mechanisms:info.mechanisms,target:info.target,robot:info.robot,setupName:project.setupName,packageName:project.export.packageName,className:project.export.className,defaultPower:project.tuning.maxPathSpeed??.8,hardware:window.DeckSimFtc.hardware(info.robot,project.sensors.localization),tuning:info.tuning});}
  $('#sim-export-pedro').onclick=async()=>{try{if(!L().route)throw Error(noRoute());const out=pedroCode(L().route),r=await api.simFile('teamcode-save',{files:out.files,keep:out.keep});if(r){status('#sim-export-status',`Wrote ${r.count} Pedro Pathing ${window.DeckSimPedro.PEDRO_VERSION} files under ${r.name}${r.kept?.length?` (kept your ${r.kept.join(', ')})`:''}. OpMode: ${out.opMode.split('.').pop()}. It uses the Follower from your Quickstart's pedro/Constants.java.`);$('#sim-export-ready').dataset.pedro='1';checklist(out.checklist);}}catch(e){status('#sim-export-status',e.message);}};
  // What an export proves and what the team still has to do, shown under the export buttons.
  // The Control Hub checklist for the current route; re-read when opened, since the route may have been re-planned.
  function exportChecklist(){try{const route=L().route;checklist(project.controller==='motionmodule'?[]:window.DeckSimFtc.checklist({mechanisms:info?.mechanisms?.enabled?info.mechanisms:null,actions:route?exporter.actions(route):[]}));}catch{checklist([]);}}
  $('#sim-export-ready').ontoggle=e=>{if(e.target.open&&!e.target.dataset.pedro)exportChecklist();};
  function checklist(items){const list=$('#sim-export-checklist');list.replaceChildren(...items.map(c=>{const li=document.createElement('li');li.dataset.status=c.status;const b=document.createElement('strong');b.textContent=c.label+(c.status==='verified'?' · checked by Deck':c.status==='physical'?' · needs your robot':c.status==='calibration'?' · tune on your robot':' · your setup');li.append(b,document.createTextNode(' '+c.detail));return li;}));$('#sim-export-ready').hidden=!items.length;}
  $('#sim-export-motionmodule').onclick=()=>void exportRoute('motionmodule');
  $('#sim-export-java').onclick=()=>void exportRoute('java');$('#sim-export-pp').onclick=()=>void exportRoute('pp');$('#sim-export-timed').onclick=()=>void exportRoute('timed');
  $('#sim-export-keep').onchange=e=>{project.export.keep=e.target.checked;save();if(!project.export.keep&&native)void api.simFile('export-forget',{key:L().id}).catch(()=>{});status('#sim-export-status',project.export.keep?'Export once; the file then follows every route change.':'');};
  $('#sim-export-package').onchange=e=>{try{exporter.validName(project.export.className,e.target.value.trim());project.export.packageName=e.target.value.trim();save();status('#sim-export-status','');}catch(err){status('#sim-export-status',err.message);}};
  $('#sim-export-class').onchange=e=>{try{exporter.validName(e.target.value.trim(),project.export.packageName);project.export.className=e.target.value.trim();save();status('#sim-export-status','');}catch(err){status('#sim-export-status',err.message);}};

  // ------------------------------------------------------------------ run
  function programPanel(){pressed('program',project.program.kind);$('#sim-program-note').textContent=project.program.kind==='opmode'?'Runs the exact single-file OnBot Java export on a virtual Control Hub, with simulated motors, encoders and IMU.':project.program.kind==='source'?'Runs your own Java autonomous using the Deck controller API. Compiler errors and println messages appear in Run output.':'Runs your planned route with the Deck controller. Each step below comes from the saved path and pin settings.';$('#sim-source-box').hidden=project.program.kind!=='source';$('#sim-source').value=project.program.source;$('#sim-source-name').textContent=project.program.name?`Program · ${project.program.name}`:'Program';
    const box=$('#sim-program-preview');box.hidden=project.program.kind==='source';const route=L().route;box.textContent=route?exporter.legs(route).map((leg,i)=>`${i+1}. Path ${leg.path}: ${leg.power??route.defaultPower??project.tuning.maxPathSpeed} motor power${leg.rotate?' · '+leg.rotate:''}${leg.moving?.action?' · '+leg.moving.action+' while driving':''}${leg.turn!==null?' · then face '+field.round(leg.turn)+'°':''}${leg.wait?' · pause '+leg.wait+' s':''}${leg.action?' · '+leg.action:''}`).join('\n'):'Add route pins in Path planning to generate the autonomous steps.';
  }
  for(const b of $$('[data-program]'))b.onclick=()=>{project.program.kind=b.dataset.program;save();programPanel();};
  $('#sim-source').oninput=e=>{project.program.source=e.target.value;save();};
  $('#sim-java-example').onclick=()=>{project.program={kind:'source',name:'MyAuto.java',source:EXAMPLE};save();programPanel();};
  $('#sim-java-open').onclick=async()=>{try{const file=await api.simFile('java-open');if(file){project.program={kind:'source',name:file.name,source:file.source};save();programPanel();}}catch(e){status('#sim-run-status',e.message);}};
  $('#sim-run').onclick=async()=>{
    const attempt=++runAttempt;$('#sim-error').hidden=true;status('#sim-run-status','Starting…');runState='starting';transport();
    try{
      await ready();if(attempt!==runAttempt)return;schedulePlan.cancel();const teleop=project.practice.mode==='teleop',needsRoute=['route','opmode'].includes(project.program.kind)&&!teleop;let route=L().route;if(needsRoute)route=await plan();
      if(attempt!==runAttempt)return;
      if(!route&&needsRoute){runState='idle';transport();return status('#sim-run-status',L().pins.length?`The route can't be planned yet: ${planError||'check the Path planning tab.'}`:'No route yet. Add at least one path in Path planning first.');}
      const exported=project.program.kind==='opmode'&&!teleop?teamCode(route,true):null;
      const payload={kind:project.program.kind,preview:needsRoute,source:project.program.kind==='source'?project.program.source:undefined,files:exported?.files,opMode:exported?.opMode,route:route?{heading:route.heading,segments:route.segments,stops:route.stops,turns:!!route.turns}:null};
      trail=[];setTool('select');const r=await api.sim('practice',{mode:project.practice.mode,timing:project.practice,program:payload});if(attempt!==runAttempt)return;if(!r.ok){runState='idle';if(r.error!=='Stopped.')status('#sim-run-status',r.error);}else{runState='running';if(teleop)status('#sim-run-status','Teleop practice started. Centre the controller sticks to enable driving.');}
    }catch(e){runState='idle';status('#sim-run-status',e.message);}transport();
  };
  $('#sim-play').onclick=()=>void call(frame?.playing?'pause':'play').catch(e=>status('#sim-run-status',e.message));
  function stopRun(){runAttempt++;runState='idle';status('#sim-run-status','Stopped. Press Run to start again.');transport();void call('stop').catch(e=>status('#sim-run-status',e.message));}
  $('#sim-stop').onclick=stopRun;
  $('#sim-reset').onclick=()=>{runAttempt++;runState='idle';trail=[];void call('reset').catch(e=>status('#sim-run-status',e.message));};
  $('#sim-speed').onchange=e=>void call('speed',Number(e.target.value)).catch(()=>{});
  const clockText=seconds=>`${Math.floor(Math.ceil(seconds)/60)}:${String(Math.ceil(seconds)%60).padStart(2,'0')}`;
  function practicePanel(current=frame?.practice){pressed('practice',project.practice.mode);for(const [id,k] of [['#sim-auto-seconds','autoSeconds'],['#sim-transition-seconds','transitionSeconds'],['#sim-teleop-seconds','teleopSeconds']])if(document.activeElement!==$(id))$(id).value=project.practice[k];
    $('#sim-practice-phase').textContent=current?{auto:'Autonomous',transition:'Transition · controls locked',teleop:current.neutralRequired?'Teleop · centre sticks':'Teleop · Controller 1',finished:'Complete'}[current.phase]:'Ready';$('#sim-practice-time').textContent=clockText(current?.remaining??(project.practice.mode==='teleop'?project.practice.teleopSeconds:project.practice.autoSeconds));
    $('#sim-practice-help').textContent=project.practice.mode==='autonomous'?'Autonomous only. Controller driving stays disabled.':project.practice.mode==='match'?'Auto → transition → teleop. Early autonomous completion holds still until its timer ends. Controller 1 is enabled only in teleop.':'Controller 1: left stick moves, right stick turns, left bumper slows down. Release both sticks after starting or reconnecting.';
    if(project.mechanisms.enabled&&project.practice.mode!=='autonomous')$('#sim-practice-help').textContent+=' Mechanisms in teleop: right bumper intakes, left trigger spins up, right trigger shoots (keyboard: E, Shift, G).';
    $('[data-program]').parentElement.hidden=project.practice.mode==='teleop'||project.controller==='motionmodule';$('#sim-source-box').hidden=project.practice.mode==='teleop'||project.controller==='motionmodule'||project.program.kind!=='source';
  }
  for(const b of $$('[data-practice]'))b.onclick=()=>{if(native&&(frame?.playing||frame?.practice))void call('stop');project.practice.mode=b.dataset.practice;save();practicePanel(null);transport();};
  for(const [id,key] of [['#sim-auto-seconds','autoSeconds'],['#sim-transition-seconds','transitionSeconds'],['#sim-teleop-seconds','teleopSeconds']])$(id).onchange=e=>{const n=e.target.valueAsNumber;if(finite(n)){project.practice[key]=Math.max(key==='transitionSeconds'?0:.000001,n);save();}e.target.value=project.practice[key];window.DeckNumberSliders?.sync(e.target);practicePanel();};

  // ------------------------------------------------------------------ robot and model
  // Preset robots (DSIM's BIOBUZZ presets) set the drivetrain, size, motors and mechanisms in one click; Custom
  // shows every setting. Changing anything a preset set is done by switching to Custom.
  function presetPanel(){
    const id=project.robotPreset,preset=id&&MECH.PRESETS[id];
    for(const b of $$('[data-robot-source]'))b.setAttribute('aria-pressed',String(b.dataset.robotSource===(id?'preset':'custom')));
    $('#sim-presets').hidden=!id;$('#sim-robot-custom').hidden=!!id;
    for(const b of $$('[data-preset]'))b.setAttribute('aria-pressed',String(b.dataset.preset===id));
    const r=project.robot;$('#sim-preset-note').textContent=preset?`${preset.name}: ${C.drives[r.drivetrain].name}, ${r.length} × ${r.width} in, ${r.massLb} lb, ${r.driveRpm} RPM wheels; ${MECH.summary(project.mechanisms)}. A preset stays as it is; choose Custom robot to build your own.`:'';
    $('#mech-preset').hidden=!preset;if(preset)$('#mech-preset-text').textContent=`These are the ${preset.name} preset’s mechanisms and are not changed. To change them, choose Custom robot in step 2.`;
    document.querySelector('[data-setup-page=mechanisms]').toggleAttribute('data-locked',!!preset);
  }
  function usePreset(id){const p=MECH.PRESETS[id];if(!p)return;project.robotPreset=id;project.model=null;
    project.robot=C.robot({...project.robot,...p.robot,appearance:chassisFor(p.robot.drivetrain)},project.controller);project.mechanisms=MECH.presetMechanisms(id);
    save();robotPanel();mechanismsPanel();presetPanel();changed('robot');void placeModel();reload();}
  for(const b of $$('[data-preset]'))b.onclick=()=>usePreset(b.dataset.preset);
  // A custom robot is your own: your CAD (or a plain outline until you add it), never a bundled reference model.
  for(const b of $$('[data-robot-source]'))b.onclick=()=>{if(b.dataset.robotSource==='preset'){usePreset(project.robotPreset||'sprinter');return;}project.robotPreset=null;project.robot.appearance=project.model?'custom':'plain';$('#sim-appearance').value=project.robot.appearance;save();presetPanel();mechanismsPanel();robotPanel();void placeModel();reload();};
  // Robot files: the robot (settings, CAD, sensors, mechanisms) saved apart from setups and loaded into any of them.
  $('#sim-robot-save').onclick=async()=>{
    try{save();const data={deckRobot:1,controller:project.controller,robot:project.robot,sensors:project.sensors,imuSource:project.imuSource,timing:project.timing,mechanisms:project.mechanisms,model:project.model};
      if(project.model&&model){const glb=await M().toGlb(model.geometry);let s='';for(let i=0;i<glb.length;i+=32768)s+=String.fromCharCode(...glb.subarray(i,i+32768));data.modelData=btoa(s);}
      const r=await api.simFile('robot-save',JSON.stringify(data));if(r)status('#start-status',`Saved the robot to ${r.name}.`);}catch(e){status('#start-status',e.message);}};
  $('#sim-robot-load').onclick=async()=>{
    try{const file=await api.simFile('robot-open');if(!file)return;const raw=JSON.parse(file.text);if(raw?.deckRobot!==1)throw Error('That file is not a Deck robot.');
      const next=sanitize({...snapshot(),controller:raw.controller,robot:raw.robot,sensors:raw.sensors,imuSource:raw.imuSource,timing:raw.timing,mechanisms:raw.mechanisms,model:raw.model,robotPreset:null});
      for(const k of ['controller','robot','sensors','imuSource','timing','mechanisms'])project[k]=next[k];project.robotPreset=null;project.model=null;model=null;
      if(raw.modelData&&raw.model){const bin=atob(raw.modelData),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const stored=await api.simFile('model-save',{name:raw.model.name||'robot.glb',bytes});project.model=modelMeta({...raw.model,id:stored.id});}
      save();refreshAll();await placeModel();reload();status('#start-status',`Loaded the robot from ${file.name}.`);}catch(e){status('#start-status',e.message);}};
  function robotPanel(committed=false){
    const r=project.robot;for(const [id,value] of Object.entries({'#sim-drivetrain':r.drivetrain,'#sim-length':r.length,'#sim-width':r.width,'#sim-height':r.heightIn,'#sim-mass':r.massLb,'#sim-rpm':r.driveRpm,'#sim-wheel':r.wheelDiameterMm,'#sim-drive-style':r.driveStyle,'#sim-appearance':r.appearance,'#sim-localization':project.sensors.localization,'#sim-maxspeed':project.tuning.maxPathSpeed??.8}))inputValue(id,value,committed);
    const f=geometry().footprint;let text=C.chassisHitbox(r)?`Hitbox: the chassis, ${(f.front+f.rear).toFixed(2)} × ${(f.half*2).toFixed(2)} in, set from your CAD (edit it here). Intakes take pieces past its edge but do not make it bigger. Routes keep this area clear.`:`Collision footprint: ${f.front.toFixed(2)} in front, ${f.rear.toFixed(2)} in rear, ${f.half.toFixed(2)} in each side. Routes keep this whole area clear.`;
    const ext=field.extents(start.heading,C.footprint(r)),bounds=geometry().bounds;if(ext[1]-ext[0]>bounds.x1-bounds.x0||ext[3]-ext[2]>bounds.y1-bounds.y0)text+=' This robot does not fit in this field at the selected heading. Increase the field size or reduce the robot size.';
    if(info){const e=info.robot;if(e.length!==r.length||e.width!==r.width)text+=` (Applied ${e.length} × ${e.width} in: the closest size the physics supports.)`;}
    $('#sim-footprint').textContent=text;inputValue('#sim-clearance',L().clearance);pressed('style',C.drives[r.drivetrain].holonomic?L().style:'sharp');rotatePanel();for(const button of $$('[data-style]'))button.disabled=!C.drives[r.drivetrain].holonomic&&button.dataset.style!=='sharp';
    const d=C.drives[r.drivetrain];$('#sim-drive-note').textContent=d.approximation?d.approximation+'. This is a family approximation, not a motor-by-motor model.':!d.holonomic?'Tank routes stop, turn the chassis, then drive each straight leg. Turns use physical time and need clearance around the whole robot.':'Holonomic drivetrain: routes may move sideways while keeping their starting heading.';
    const s=C.sensors[project.sensors.localization],motion=project.controller==='motionmodule';pressed('controller',project.controller);$('#sim-controller-note').textContent=motion?'MotionModule: its built-in IMU measures turning. Add 2 or 3 odometry pods or an OTOS sensor to know position; without them the robot drives by time.':'FTC Control Hub: by default it tracks position with the drive motor encoders and turning with its built-in IMU. Pick odometry pods, Pinpoint or OTOS if your robot has them.';
    const select=$('#sim-localization');if(select.dataset.forController!==project.controller){select.innerHTML=options(Object.fromEntries(C.sensorChoices(project.controller).map(k=>[k,C.sensors[k].name])),project.sensors.localization);select.dataset.forController=project.controller;}inputValue('#sim-localization',project.sensors.localization);select.disabled=false;
    const device=['fused','optical'].includes(project.sensors.localization),sources=device?{device:project.sensors.localization==='fused'?'Pinpoint integrated IMU':'OTOS integrated IMU'}:motion?{module:'MotionModule IMU',external:'Separate IMU over I²C'}:{hub:'Control Hub built-in IMU',external:'Separate IMU over I²C'};
    if(!Object.hasOwn(sources,project.imuSource))project.imuSource=Object.keys(sources)[0];const sourceKey=JSON.stringify(sources);if($('#sim-imu-source').dataset.options!==sourceKey){$('#sim-imu-source').innerHTML=options(sources,project.imuSource);$('#sim-imu-source').dataset.options=sourceKey;}inputValue('#sim-imu-source',project.imuSource);
    $('#sim-imu-note').textContent=device?'This odometry device supplies its own fused heading. Simulated error settings model the result; no vendor driver runs here.':motion?'The IMU measures heading and angular motion, not field X/Y.':'The Control Hub already includes an IMU. External I²C is an alternative heading source, not a position sensor.';
    $('#sim-sensor-note').textContent={gyro:'No position sensing: the robot drives for set times and the IMU keeps it facing the right way. It cannot correct a missed spot, so expect a few inches of error.',odometry:'2 unpowered tracking pods: one parallel and one perpendicular, plus the selected IMU.',odometry3:'3 unpowered tracking pods: two parallel and one perpendicular, plus the selected IMU.',encoders:'Drive motor encoders plus IMU. No separate tracking pods; wheel slip affects the position estimate.',fused:'2 dead-wheel pods connected to the Pinpoint odometry computer, with its integrated IMU.',optical:'SparkFun OTOS measures optical X/Y motion and heading. No odometry pods; mounting height and surface affect real performance.'}[project.sensors.localization];
    $('#sim-timed-settings').hidden=s.translation;timedPanel(committed);sensorList();document.querySelector('.sim-advanced').hidden=!s.translation;
    const hub=!motion&&s.translation&&['mecanum','tank'].includes(C.drives[project.robot.drivetrain].engine);$('#sim-export-onbot').hidden=!hub;$('#sim-export-java').hidden=motion||!s.translation;$('#sim-export-timed').hidden=s.translation;$('#sim-export-teamcode').hidden=!hub;$('#sim-export-pedro').hidden=!hub||C.drives[project.robot.drivetrain].holonomic===false;$('#sim-export-motionmodule').hidden=!motion;$('#sim-export-title').textContent=motion?'Export for MotionModule':'Export for the Control Hub';for(const b of $$('[data-program=opmode]'))b.hidden=!hub;if(!hub&&project.program.kind==='opmode')project.program.kind='route';$('#sim-execution-note').textContent=s.translation?'OnBot Java exports one SDK-only autonomous file. Connect to your Control Hub, open Program & Manage → OnBot Java, upload the file and Build Everything. Match hardware names, sensor offsets and calibration before running. Intake/shoot actions need your own mechanism code.':'Timed-command JSON records powers, seconds, pauses and an IMU heading target. It does not configure or deploy to a robot.';
    transport();
  }
  const settle=()=>{project=sanitize(project);save();changed('robot');reload();};
  const num=(id,set)=>{$(id).onchange=e=>{const v=e.target.valueAsNumber,min=parseFloat(e.target.min),max=parseFloat(e.target.max);e.target.setCustomValidity('');if(!finite(v)||finite(min)&&v<min||finite(max)&&v>max){e.target.setCustomValidity(`Enter a finite value${finite(min)?` at least ${min}`:''}${finite(max)?` and no more than ${max}`:''}.`);e.target.reportValidity();return;}set(v);settle();robotPanel(true);};$(id).oninput=e=>e.target.setCustomValidity('');};
  // Bundled chassis CAD is only in personal local builds; public releases show the plain footprint.

  const chassisFor=drive=>{const id=C.drives[drive].engine==='swerve'?'swechanum':drive==='mecanum'?'strafer':'plain';return builtins.has(id)?id:'plain';};
  function appearanceOptions(){for(const o of $('#sim-appearance').options)if(['strafer','swechanum'].includes(o.value)){o.disabled=!builtins.has(o.value);o.textContent=o.textContent.replace(/ \(not included in this build\)$/,'')+(o.disabled?' (not included in this build)':'');}}
  if(native&&typeof api.simFile==='function')void api.simFile('assets').then(a=>{builtins=new Set(a.robots);Object.assign(window.DeckFieldArt.available,a.fields);appearanceOptions();void placeModel();}).catch(()=>{});
  $('#sim-drivetrain').onchange=e=>{project.robot.drivetrain=e.target.value;if(!project.model)project.robot.appearance=chassisFor(e.target.value);settle();robotPanel();void placeModel();};
  // Typing a size takes over from the CAD's own size.
  const manual=()=>{if(project.model)project.model.autoSize=false;};
  num('#sim-length',v=>{project.robot.length=v;manual();});num('#sim-width',v=>{project.robot.width=v;manual();});num('#sim-mass',v=>{project.robot.massLb=v;entered('mass');});num('#sim-rpm',v=>{project.robot.driveRpm=v;entered('rpm');});
  num('#sim-height',v=>project.robot.heightIn=v);num('#sim-wheel',v=>{project.robot.wheelDiameterMm=v;entered('wheel');});$('#sim-drive-style').onchange=e=>{project.robot.driveStyle=e.target.value;settle();};
  num('#sim-maxspeed',v=>{project.tuning.maxPathSpeed=v;project.tuning.powerSet=true;project.timing.power=v;});
  $('#sim-localization').onchange=e=>{project.sensors.localization=e.target.value;save();robotPanel();reload();};
  $('#sim-imu-source').onchange=e=>{project.imuSource=e.target.value;save();robotPanel();reload();};
  for(const b of $$('[data-controller]'))b.onclick=()=>{if(project.controller===b.dataset.controller)return;const oldKey=project.controller==='motionmodule'?'motionSensors':'ftcSensors';project[oldKey]={...project.sensors,imuSource:project.imuSource,driveAmps:project.robot.driveAmps};const oldAmps=project.robot.driveAmps;project.controller=b.dataset.controller;project.robot.driveAmps=project.controller==='ftc'?C.current(oldAmps,'ftc'):C.electrical.motionmodule.defaultAmps;const saved=project[project.controller==='motionmodule'?'motionSensors':'ftcSensors'];if(saved?.driveAmps)project.robot.driveAmps=C.current(saved.driveAmps,project.controller);project.sensors=saved?{...saved}:{localization:C.localization(project.controller)};project.imuSource=saved?.imuSource||(project.controller==='motionmodule'?'module':'hub');if(project.controller==='motionmodule')project.program.kind='route';save();robotPanel();programPanel();practicePanel(null);reload();};
  for(const [id,key]of TIMED_FIELDS)num(id,v=>project.timing[key]=v);
  // Sensors as a list: the IMU, at most one position sensor and drive encoders. The list decides the sensing the
  // simulator runs and the exports set up (2 pods → odometry, Pinpoint → its 2 pods and IMU, encoders alone → drive
  // encoder odometry, nothing → IMU-only timed driving).
  const POSITION={odometry:'2 odometry pods',odometry3:'3 odometry pods',fused:'goBILDA Pinpoint computer + 2 pods',optical:'SparkFun OTOS optical sensor'};
  function sensorList(){
    const loc=project.sensors.localization,choices=C.sensorChoices(project.controller),hasEnc=loc==='encoders'||!!project.sensors.driveEncoders&&choices.includes('encoders'),pos=POSITION[loc]?loc:null;
    const row=(name,detail,remove)=>{const li=document.createElement('li'),b=document.createElement('b'),span=document.createElement('span');b.textContent=name;span.textContent=detail;li.append(b,span);
      if(remove){const x=document.createElement('button');x.type='button';x.className='icon-button';x.textContent='×';x.title='Remove';x.setAttribute('aria-label','Remove '+name);x.onclick=remove;li.append(x);}return li;};
    const imu={hub:'Built-in IMU (Control Hub)',external:'External IMU over I²C',module:'MotionModule IMU',device:pos==='fused'?'The Pinpoint’s IMU':'The OTOS’s IMU'}[project.imuSource]||'IMU';
    const detail={odometry:'Position: one forward and one sideways pod.',odometry3:'Position: two forward pods and one sideways pod (incremental or absolute encoders).',fused:'Position: the Pinpoint reads its 2 pods and its own IMU.',optical:'Position: tracks the floor optically, with its own IMU.'};
    $('#sim-sensor-list').replaceChildren(row(imu,'Turning. Choose which IMU below.'),
      ...(pos?[row(POSITION[pos],detail[pos],()=>setLocalization(hasEnc?'encoders':'gyro'))]:[]),
      ...(hasEnc?[row('Drive motor encoders',pos?'On the drive motors; the '+(pos==='optical'?'OTOS':'pods')+' track position.':'Position from the wheel motors (they slip more than pods).',()=>{project.sensors.driveEncoders=false;if(loc==='encoders')setLocalization('gyro');else{save();robotPanel();}})]:[]));
    const add=$('#sim-sensor-add'),opts=[new Option(pos?'Add or switch a sensor…':'Add a sensor…','')];
    for(const k of Object.keys(POSITION))if(choices.includes(k)&&k!==pos)opts.push(new Option(pos?'Switch to '+POSITION[k]+' (replaces '+POSITION[pos]+')':POSITION[k],k));
    if(choices.includes('encoders')&&!hasEnc)opts.push(new Option('Drive motor encoders','encoders'));
    add.replaceChildren(...opts);add.value='';add.hidden=opts.length===1;
  }
  function setLocalization(v){const sel=$('#sim-localization');if(![...sel.options].some(o=>o.value===v))return;sel.value=v;sel.dispatchEvent(new Event('change'));}
  $('#sim-sensor-add').onchange=e=>{const k=e.target.value;if(!k)return;if(k==='encoders'){project.sensors.driveEncoders=true;if(!POSITION[project.sensors.localization])setLocalization('encoders');else{save();robotPanel();}}else setLocalization(k);};
  // Timed driving: the engine works the numbers out from the robot settings unless the team measured them.
  function timedPanel(committed=false){
    const measured=project.timing.source==='measured',t=measured?project.timing:info?.timing,fmt=(v,unit)=>finite(v)?`${+v.toFixed(unit==='s'?2:1)} ${unit}`:'…';
    $('#sim-timed-measured').checked=measured;$('#sim-timed-manual').hidden=!measured;
    $('#sim-timed-summary').replaceChildren(...[['Forward at full power',fmt(t?.forwardSpeed,'in/s')],['Sideways at full power',fmt(t?.strafeSpeed,'in/s')],['Speed-up',fmt(t?.startup,'s')],['Coasting',fmt(t?.stopping,'s')]].flatMap(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;return [dt,dd];}));
    for(const [id,key]of TIMED_FIELDS)inputValue(id,project.timing[key],committed);
  }
  // Switching to measured numbers starts from the worked-out ones.
  $('#sim-timed-measured').onchange=e=>{if(e.target.checked){Object.assign(project.timing,info?.timing?{forwardSpeed:info.timing.forwardSpeed,strafeSpeed:info.timing.strafeSpeed,startup:info.timing.startup,stopping:info.timing.stopping,strafeStopping:info.timing.strafeStopping}:{});project.timing.source='measured';}else project.timing.source='robot';save();robotPanel();reload();};
  $('#sim-appearance').onchange=e=>{project.robot.appearance=e.target.value;if(e.target.value!=='custom')project.model=null;if(e.target.value==='swechanum')project.robot.drivetrain='swerve';if(e.target.value==='strafer')project.robot.drivetrain='mecanum';settle();robotPanel();void placeModel();};
  const M=()=>window.DeckRobotModel,modelCache=new Map();
  async function three(){await script('vendor/three-view.js');await script('sim-robot-model.js');}
  // The stored one-body model, placed in the robot frame for 2D and 3D.
  async function placeModel(){
    const seq=placeModel.seq=(placeModel.seq||0)+1;
    const imported=project.model,builtin=!imported&&builtins.has(project.robot.appearance)?project.robot.appearance:null,identity=imported?.id||builtin,meta=imported||(builtin?{units:'in',...(project.orientations?.[builtin]||{front:builtin==='strafer'?'-x':'+x',top:'+z'})}:null);
    if(!identity||!native){model=null;modelUi();draw();view3d?.setModel(null);return;}
    try{await three();if(model?.id!==identity){model=modelCache.get(identity)||null;if(!model){const data=await api.simFile(builtin?'builtin-model':'model-read',identity);if(!data)throw Error('The saved robot model is missing. Import it again.');const object=builtin?await M().builtin(data.bytes,data.meta):await M().fromGlb(data.bytes);if(seq!==placeModel.seq)return;model={id:identity,geometry:object,builtin,meta:data.meta};modelCache.set(identity,model);}}
      if(seq!==placeModel.seq)return;const chassis=chassisFootprint(),key=JSON.stringify([meta,chassis]);if(key!==model.placeKey){model.holder=M().place(model.geometry,meta||{front:'+x',top:'+z',units:'in'},chassis);model.picture=M().silhouette(model.holder);model.placeKey=key;}
    }catch(e){model=null;status('#start-status',e.message);}
    modelUi();draw();view3d?.setModel(model?.holder||null);
  }
  function modelUi(){
    const meta=project.model,builtin=model?.builtin;$('#sim-model-box').hidden=!meta&&!builtin;$('#sim-model-drop').classList.toggle('compact',!!meta||!!builtin);
    $('#sim-model-credit').textContent=builtin?model.meta?.credit||'':meta?'Your CAD is shown as one rigid body.':'Choose a bundled chassis or import your own.';
    // The Mechanisms page shows the same model with its parts marked.
    queueMicrotask(()=>mechModel());
    if(!meta&&!builtin){modelPreview?.dispose();modelPreview=null;return;}
    $('#sim-model-remove').hidden=!!builtin;$('#sim-model-help').hidden=false;
    $('#sim-units-box').hidden=!!builtin||meta?.source==='step';$('#sim-model-units').value=meta?.units||'in';
    const s=model?.holder?.userData.size,name=meta?.name||model?.meta?.name||'Chassis',orientation=project.model||project.orientations?.[builtin]||{front:builtin==='strafer'?'-x':'+x',top:'+z'};$('#sim-mesh-size').textContent=s?`${name}: fitted to ${s.length.toFixed(1)} × ${s.width.toFixed(1)} in, ${s.height.toFixed(1)} in tall. The chassis length × width below is the robot’s hitbox.`:name;
    if(M())$('#sim-orientation-summary').textContent=['front','back','left','right','top','bottom'].map(side=>`${side}: ${M().modelAxisAt(orientation,side)}`).join(' · ')+'. The checkered floor is the bottom reference.';
    if(model?.holder){if(!modelPreview){modelPreview=M().preview($('#sim-model-preview'),{onSide:side=>{selectedSide=side;for(const b of $$('[data-assign-side]'))b.disabled=!side;status('#sim-model-help',side?`Selected ${side} face. Assign the robot side this face represents.`:'Select a flat cube face to assign a side. Edges and corners change only the view.');}});modelPreview.pick(pickPart);}modelPreview.update(model.holder,chassisFootprint());}
    partsPanel();needsYou();
  }
  // ---- the CAD's parts: click one, say what it is (like a slicer's object list) ----------------------------
  // The team's choice is stored as a part with its box; the robot (size, intakes, shooters) is set up from them.
  const NEEDS={mass:['#sim-mass','mass'],wheel:['#sim-wheel','wheel diameter'],rpm:['#sim-rpm','wheel RPM']};
  function entered(key){if(project.model?.entered&&!project.model.entered.includes(key)){project.model.entered.push(key);save();}needsYou();}
  function needsYou(){const left=project.model?.entered?Object.keys(NEEDS).filter(k=>!project.model.entered.includes(k)):[];
    for(const [k,[id]] of Object.entries(NEEDS))$(id).closest('div')?.classList.toggle('sim-needs-input',left.includes(k));
    $('#sim-needs-you').hidden=!left.length;$('#sim-needs-you').textContent=left.length?`Your CAD set the rest. Enter the robot’s ${left.map(k=>NEEDS[k][1]).join(', ').replace(/, ([^,]*)$/,' and $1')} below (highlighted).`:'';}
  const ROLES=[['chassis','Drivetrain / chassis'],['intake','Intake'],['kicker','Kicker'],['shooter:pollen','Pollen shooter'],['shooter:nectar','Nectar shooter'],['shooter:both','Pollen + nectar shooter'],['turret','Turret'],['indexer','Indexer'],['other','Not a mechanism']];
  let partSel=null,importProgress=null;
  const partsOf=()=>{if(!model?.geometry||model.geometry.isObject3D||!M())return null;if(model.tree===undefined)model.tree=M().partTree(model.geometry);return model.tree;};
  const choiceOf=p=>!p?null:p.role==='intake'&&p.kind==='kicker'?'kicker':p.role==='shooter'?(p.type==='turret'&&!p.pieces?'turret':'shooter:'+(p.pieces||'pollen')):p.role;
  const bare=name=>String(name).replace(/\s*<\d+>$/,'');
  const roleLabel=key=>{const p=project.model?.parts?.find(x=>x.key===key);return p&&(p.role!=='other'||p.chosen)?ROLES.find(r=>r[0]===choiceOf(p))?.[1]||'':'';};
  function partsPanel(){
    const tree=partsOf(),box=$('#sim-parts');box.hidden=!tree||!project.model;if(box.hidden){partSel=null;return;}
    if(partSel&&!tree.byKey.has(partSel.key))partSel=null;
    const item=n=>{const li=document.createElement('li'),b=document.createElement('button'),name=document.createElement('span'),role=document.createElement('em');b.type='button';b.className='sim-part-item'+(partSel===n?' selected':'');
      name.textContent=bare(n.name);role.textContent=roleLabel(n.key)||'—';b.append(name,role);b.onclick=()=>selectPart(n);li.append(b);return li;};
    $('#sim-part-list').replaceChildren(...tree.top.slice(0,80).map(item));
    $('#sim-part-pick').hidden=!partSel;
    if(partSel){$('#sim-part-name').textContent=bare(partSel.name);$('#sim-part-path').textContent=partSel.key.split('/').slice(0,-1).map(bare).join(' › ');
      const current=choiceOf(project.model.parts?.find(p=>p.key===partSel.key));
      $('#sim-part-roles').replaceChildren(...ROLES.map(([k,label])=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=label;b.setAttribute('aria-pressed',String(current===k));b.onclick=()=>assignPart(partSel,k);return b;}));
      $('#sim-part-up').hidden=!(partSel.parent>=0&&!tree.top.includes(partSel));}
    modelPreview?.highlight(partSel?tree.under(partSel):null);
  }
  function selectPart(n){partSel=n||null;partsPanel();}
  function assignPart(n,choice){
    const tree=partsOf(),boxOf=M().meshesBox(model.geometry,tree.under(n));if(!boxOf)return;
    const named=MECH.partRole(n.name,n.children.map(c=>c.name)),[role,pieces]=choice.split(':');
    const part={name:bare(n.name),key:n.key,chosen:true,box:boxOf,
      ...(role==='turret'?{role:'shooter',type:'turret',pieces:named.pieces||'pollen'}:role==='shooter'?{role:'shooter',pieces,type:/turret/i.test(n.name)?'turret':'fixed'}:role==='kicker'?{role:'intake',kind:'kicker'}:role==='intake'?{role:'intake',kind:named.kind&&named.kind!=='kicker'?named.kind:'sweeper'}:{role})};
    project.model.parts=[...(project.model.parts||[]).filter(p=>p.key!==n.key),part];
    if(role==='chassis')project.model.autoSize=false;
    const cad=setUpFromCad({replace:true});save();robotPanel();mechanismsPanel();void placeModel();
    // The answer is saved with the part, so the picker closes; click the part again to change it.
    status('#sim-model-help',`${part.name}: ${ROLES.find(r=>r[0]===choice)[1]}.${cad?.found?.length?' Robot set up: '+cad.found.join('; ')+'.':''}`);partSel=null;partsPanel();
  }
  $('#sim-part-up').onclick=()=>{const tree=partsOf();if(partSel?.parent>=0)selectPart(tree.nodes[partSel.parent]);};
  $('#sim-part-clear').onclick=()=>selectPart(null);
  // The picker also closes on a click outside it (the list and the model still pick parts) or on Enter / Escape.
  document.addEventListener('pointerdown',e=>{if(partSel&&!e.target.closest?.('#sim-part-pick,#sim-part-list,#sim-model-preview'))selectPart(null);});
  document.addEventListener('keydown',e=>{if(!partSel||$('#sim-part-pick').hidden||!['Enter','Escape'].includes(e.key)||e.target.closest?.('input,textarea,select'))return;
    if(e.key==='Enter'&&e.target.closest?.('#sim-part-pick button'))return;e.preventDefault();selectPart(null);});
  function pickPart(point){const tree=partsOf();if(!tree||!point||!Number.isFinite(point.part))return;
    selectPart(tree.at(point.part,partSel&&tree.under(partSel).has(point.part)?partSel:null));}
  // The robot set up from the CAD's named parts: chassis size, intakes (side, how far out, mouth, height) and
  // shooters (where, turret or fixed, which pieces). Returns what was found, or null without named parts.
  // Without a named chassis, the robot's size is the model's own size (in its units, after the front and top are
  // set); a size outside 4–48 in usually means the file's units are wrong, so it is left for the team to set.
  function sizeFromModel(){
    if(!project.model?.autoSize)return null;const n=model?.holder?.userData.nativeSize,q=v=>Math.round(v*4)/4;if(!n)return null;
    if(![n.length,n.width].every(v=>v>=4&&v<=48))return null;
    Object.assign(project.robot,{length:q(n.length),width:q(n.width),...(n.height>=1&&n.height<=48?{heightIn:q(n.height)}:{})});save();robotPanel();void placeModel();
    return `${project.robot.length} × ${project.robot.width} × ${project.robot.heightIn} in`;
  }
  function setUpFromCad({replace=false}={}){
    const boxes=project.model&&M()?.partBoxes(project.model);if(!boxes)return null;
    const out=MECH.fromCad(boxes.parts,{length:boxes.extent.length,width:boxes.extent.width,chassis:boxes.chassis?.derived?boxes.chassis:null});if(!out.found.length)return out;
    if(out.robot)Object.assign(project.robot,out.robot);
    // A choice made by clicking (replace) sets the intakes and shooters to exactly what the parts say.
    if(out.intakes.length||out.shooters.length||replace){const m=structuredClone(project.mechanisms);if(!m.enabled||replace){m.intakes=[];m.shooters=[];}
      if(out.intakes.length)m.intakes=out.intakes;if(out.shooters.length)m.shooters=out.shooters;if(out.capacity&&!m.capacity?.nectar)m.capacity=out.capacity;m.enabled=m.intakes.length+m.shooters.length>0||m.enabled&&!replace;project.mechanisms=MECH.sanitize(m);}
    return out;
  }
  const importStatus=(text,busy=false)=>{status('#start-status',text);status('#sim-model-import-status',text);$('#sim-model-drop').classList.toggle('busy',busy);};
  async function importModel(get,{front='+x',top='+z',stay=false}={}){
    const began=Date.now();let ticking=null;
    importProgress=null;const reading=()=>{const t=Math.round((Date.now()-began)/1000),p=importProgress;importStatus(`Reading your robot… ${p?.stage==='read'?`${p.done} of ${p.total} pieces · `:p?.stage==='split'?'splitting the assembly · ':''}${t} s`,true);};
    try{await three();ticking=setInterval(reading,1000);reading();const result=await get();clearInterval(ticking);if(!result){importStatus('');return;}
      if(result.kind==='step')importStatus(`Merging ${result.parts} parts into one body…`,true);
      const body=await M().bodyFromImport(result),glb=await M().toGlb(body.geometry),stored=await api.simFile('model-save',{name:result.name||'robot.glb',bytes:glb});
      // Each named assembly (chassis, intake, shooter...) is kept as a part with its box, classified by its name.
      const parts=(body.groups||[]).map(g=>({name:g.name,...(g.key?{key:g.key}:{}),...MECH.partRole(g.name,g.inner),box:g.box}));
      project.model=M().meta({id:stored.id,name:result.name||stored.name,units:body.units,front:front||'+x',top:top||'+z',source:body.source,parts,bodyChassis:true});project.robot.appearance='custom';$('#sim-appearance').value='custom';model={id:stored.id,geometry:body.geometry};
      project.robotPreset=null;const cad=setUpFromCad();project.model.autoSize=!cad?.robot;project.model.entered=[];
      // The drivetrain from part names ("104mm Mecanum Wheel", "Swerve module"...).
      const drive=MECH.drivetrainFromNames(result.names||[]);if(drive&&C.drives[drive]){project.robot.drivetrain=drive;cad?.found.unshift(`Drivetrain: ${C.drives[drive].name}`);}
      save();robotPanel();mechanismsPanel();presetPanel();
      if(!stay){selectTab('setup');showSetupStep('robot');}await placeModel();const sized=sizeFromModel();reload();
      importStatus(`Imported ${body.parts} part${body.parts===1?'':'s'} in ${Math.round((Date.now()-began)/1000)} s${result.cached?' (from the last import of this file)':''}.${sized?` Size from the CAD: ${sized}.`:''}${cad?.found.length?` From the assembly names: ${cad.found.join('; ')}.`:' Name the assemblies Chassis, Intake, Shooter (or Turret, Pollen shooter, Nectar shooter) and Indexer in your CAD to set the robot up from them.'} Check the front and top with the cube below.`);
    }catch(e){importStatus(`Could not import the robot: ${e.message}`);}finally{clearInterval(ticking);$('#sim-model-drop').classList.remove('busy');}
  }
  // The robot is simulated as its CAD is posed, so nothing is read until the user confirms it is the starting configuration.
  const confirmStart=name=>new Promise(resolve=>{const d=$('#sim-start-confirm');$('#sim-start-confirm-file').textContent=name;d.returnValue='';
    d.addEventListener('close',()=>resolve(d.returnValue==='yes'),{once:true});d.showModal();$('#sim-start-no').focus();});
  const importConfirmed=async(file,options)=>{if(!await confirmStart(file.split(/[\\/]/).pop()))return importStatus('Import canceled. Export your CAD in the robot’s starting position, then import it again.');return importModel(()=>api.simFile('model-drop',{file}),options);};
  $('#sim-model-open').onclick=async()=>{try{const picked=await api.simFile('model-pick');if(picked)await importConfirmed(picked.file);}catch(e){importStatus(`Could not import the robot: ${e.message}`);}};
  const drop=$('#sim-model-drop');
  for(const type of ['dragenter','dragover'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('over');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('over');const file=e.dataTransfer?.files?.[0];if(!file||!native)return;const filePath=api.simDropPath?.(file);if(!filePath)return importStatus('That file could not be opened.');void importConfirmed(filePath);});
  const reorient=side=>{if(!selectedSide||!model)return;const builtin=model.builtin,current=project.model||project.orientations?.[builtin]||{front:builtin==='strafer'?'-x':'+x',top:'+z'},next=M().assignSide(current,selectedSide,side);const followed=project.model?followOrientation(current,next):false;if(project.model)Object.assign(project.model,next);else project.orientations[builtin]=next;save();selectedSide=null;for(const b of $$('[data-assign-side]'))b.disabled=true;
    if(project.model){robotPanel();mechanismsPanel();reload();}if(followed)status('#mech-model-help','');
    const said=followed?'Orientation saved. The intakes and shooters from your CAD moved with it. If one looks wrong, press “Set up from your CAD” in Mechanisms.':'Orientation saved. The floor marks the bottom.';
    void placeModel().then(()=>{const sized=sizeFromModel();if(sized)status('#sim-model-help',said+' Size from the CAD: '+sized+'.');});status('#sim-model-help',said);void placeModel().then(()=>modelPreview?.look(null));};
  // A new front or top for the CAD carries its intakes, shooters and chassis size with it, so the hitboxes stay on
  // the parts they came from. Returns whether the mechanisms changed.
  function followOrientation(from,to){
    const turn=M().turnBetween(from,to),cad=o=>{const b=M().partBoxes({...project.model,...o});return b&&MECH.fromCad(b.parts,{length:b.extent.length,width:b.extent.width,chassis:b.chassis?.derived?b.chassis:null});};
    const before=cad(from),after=cad(to);
    if(turn%2===1)Object.assign(project.robot,{length:project.robot.width,width:project.robot.length});else if(turn===null&&after?.robot)Object.assign(project.robot,after.robot);
    if(!project.mechanisms?.enabled)return false;const was=JSON.stringify(project.mechanisms);project.mechanisms=MECH.reoriented(project.mechanisms,{turn,before,after});return JSON.stringify(project.mechanisms)!==was;
  }
  for(const b of $$('[data-assign-side]'))b.onclick=()=>reorient(b.dataset.assignSide);
  $('#sim-model-units').onchange=e=>{if(!project.model)return;project.model.units=e.target.value;save();void placeModel();};
  $('#sim-model-remove').onclick=()=>{project.model=null;project.robot.appearance='plain';model=null;save();robotPanel();modelUi();draw();view3d?.setModel(null);};

  // ------------------------------------------------------------------ layouts and files
  function layoutPanel(){
    $('#sim-game-elements').checked=L().elements;$('#sim-game-elements').disabled=L().field==='empty';
    const sel=$('#sim-field');sel.replaceChildren(...project.layouts.map(l=>new Option(`${l.name}${l.field!=='empty'&&!l.name.startsWith(GAMES[l.field])?` (${GAMES[l.field]})`:''}`,l.id,false,l.id===project.active)));
    const add=document.createElement('optgroup');add.label='Add a field';for(const [k,v] of Object.entries({biobuzz:'New BIOBUZZ layout',empty:'New empty field'}))add.append(new Option(v,'new:'+k));sel.append(add);
    const l=L();$('#sim-field-note').textContent=l.field==='empty'?'Only your own no-go zones on this field.':`Routes avoid ${GAMES[l.field]}'s ${info?.field===l.field?info.obstacleName:'field parts'} automatically (red dotted collision outlines).`;
    $('#sim-layout-delete').disabled=project.layouts.length<2;
    const b=info?.field===l.field?geometry().bounds:C.bounds(l);inputValue('#sim-field-width',b.x1-b.x0);inputValue('#sim-field-height',b.y1-b.y0);
    for(const id of ['#sim-field-width','#sim-field-height'])$(id).disabled=l.field!=='empty';
    $('#sim-field-size-note').textContent='Custom field. Dimensions are saved with this layout.';
    // Game fields keep FTC's playing area (inside the perimeter wall, from the official field CAD); only empty fields resize.
    $('#sim-alliance-box').hidden=l.field!=='biobuzz';pressed('alliance',l.alliance||'red');mechanismsPanel();if(typeof setupStepPanel==='function'&&setupStep)setupStepPanel();
    $('#sim-field-size').hidden=l.field!=='empty';$('#sim-field-official').hidden=l.field==='empty';
    $('#sim-field-official').textContent=l.field==='empty'?'':`Official ${GAMES[l.field]} field · ${(b.x1-b.x0).toFixed(1)} × ${(b.y1-b.y0).toFixed(1)} in inside the perimeter wall. FTC sets this size, so it cannot be changed. Add another layout to keep a separate plan.`;
  }
  async function switchLayout(id){
    if(native&&info)await api.sim('stop');project.active=id;info=null;const l=L();selected=null;trail=[];frame=null;start=l.start||field.edgePose(0,geometry());preview={...start};tool=l.start?'select':'start';save();fieldArtKey='';
    layoutPanel();inputs();planningPanel();pinPanel();zonePanel();tested();robotPanel();draw();view3d?.setField(null,l);await reloadNow();void exportPanel();
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
  $('#sim-open').onclick=async()=>{try{const file=await api.simFile('project-open');if(file)await openProject(file);}catch(e){status('#start-status',e.message);}};
  // A setup sent from the terminal (tools/deck-sim.cjs show): open it as a new saved setup, attach
  // the robot CAD it names, plan it and show the requested tab, optionally starting the run.
  if(native&&api.onSimOpen){
    api.onSimOpen(request=>void (async()=>{
      try{await openProject(request);if(request.model)await importConfirmed(typeof request.model==='string'?request.model:request.model.file,{front:request.front,top:request.top,stay:true});
        selectTab(request.tab);if(request.tab!=='setup'&&L().pins.length)await plan();if(request.run&&L().route&&!$('#sim-run').disabled)$('#sim-run').click();}
      catch(e){selectTab('setup');status('#start-status',`${request.name}: ${e.message}`);}
    })());
    void api.simOpenReady().catch(()=>{});
  }
  async function openProject(file){
    const raw=JSON.parse(file.text);if(raw?.deckSimulation!==2&&raw?.deckSimulation!==1)throw Error('That file is not a Deck simulation project.');
      const next=sanitize(raw);if(raw.modelData&&typeof raw.modelData==='string'&&raw.model){const bin=atob(raw.modelData),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const stored=await api.simFile('model-save',{name:raw.model.name||'robot.glb',bytes});next.model=modelMeta({...raw.model,id:stored.id});}
      save();const bank=project.setups,active=next.active;for(const l of next.layouts){const old=l.id;l.id=newId();if(old===active)next.active=l.id;}next.export.keep=false;next.setupId=newId();next.setupName=file.name.replace(/\.json$/i,'').slice(0,40);next.setups=bank;project=next;model=null;save();refreshAll();await switchLayout(project.active);await placeModel();status('#start-status',`Opened ${file.name}.`);
  }
  // Saved setups. Each one holds its fields (with their planned routes), robot, mechanisms, controller,
  // program and run settings. The picker lists what every setup holds; the bar beside it creates, renames
  // and deletes setups and opens or saves them as files, and right-clicking one (or the menu key) opens,
  // clones, renames or deletes it.
  const CONTROLLERS={ftc:'FTC Control Hub',motionmodule:'MotionModule'};
  function setupFacts(d){
    const layouts=Array.isArray(d?.layouts)?d.layouts:[],l=layouts.find(x=>x.id===d.active)||layouts[0]||{},r=d?.robot||{},m=d?.mechanisms||{},preset=MECH.PRESETS[d?.robotPreset];
    const game=l.field==='biobuzz',drive=(C.drives[r.drivetrain]?.name||'').split(' · ')[0],count=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
    const fieldText=(l.name||GAMES[l.field]||'Field')+(game?` · ${l.alliance==='blue'?'blue':'red'} alliance`:finite(l.width)&&finite(l.height)?` · ${l.width} × ${l.height} in`:'')+(layouts.length>1?` (+${layouts.length-1} more)`:'');
    const robotText=`${preset?preset.name:d?.model?.name||'Custom robot'} · ${drive}${finite(r.length)&&finite(r.width)?` · ${r.length} × ${r.width} in`:''}`;
    const intakes=Array.isArray(m.intakes)?m.intakes.length:0,shooters=Array.isArray(m.shooters)?m.shooters:[];
    const mechText=!game?'None (empty field)':!m.enabled?'None':`${intakes?count(intakes,'intake'):'No intake'} · ${[[shooters.filter(s=>s.type==='turret').length,'turret'],[shooters.filter(s=>s.type!=='turret').length,'fixed shooter']].filter(([n])=>n).map(([n,w])=>count(n,w)).join(' + ')||'no shooter'}`;
    const pins=Array.isArray(l.pins)?l.pins.length:0;
    return [['Field',fieldText],['Robot',robotText],['Mechanisms',mechText],['Controller',CONTROLLERS[d?.controller]||CONTROLLERS.ftc],['Route',pins?`${count(pins,'pin')}${l.route?' · planned':''}`:'No route yet']];
  }
  function setupPanel(){
    const current=$('#sim-setup'),facts=setupFacts(project);current.querySelector('strong').textContent=project.setupName;current.querySelector('small').textContent=facts.slice(0,4).map(f=>f[1]).join(' · ');current.title=facts.map(f=>f.join(': ')).join('\n');
    $('#sim-setup-delete').disabled=project.setups.length<2;if(!$('#sim-setup-list').hidden)setupList();activeSetupPanel();
  }
  function setupList(){
    const list=$('#sim-setup-list'),tip=document.createElement('p');
    list.replaceChildren(...project.setups.map(s=>{const on=s.id===project.setupId,b=document.createElement('button'),name=document.createElement('strong'),facts=document.createElement('span');
      b.type='button';b.className='sim-setup-option';b.dataset.setupId=s.id;b.setAttribute('role','option');b.setAttribute('aria-selected',String(on));name.textContent=on?project.setupName:s.name;facts.className='sim-setup-facts';
      for(const [k,v] of setupFacts(on?project:s.data)){const key=document.createElement('b'),value=document.createElement('span');key.textContent=k;value.textContent=v;facts.append(key,value);}
      b.append(name,facts);return b;}));
    tip.className='hint';tip.textContent='Right-click a setup to clone, rename or delete it.';list.append(tip);
  }
  function showSetupList(open){const list=$('#sim-setup-list');if(open)setupList();list.hidden=!open;$('#sim-setup').setAttribute('aria-expanded',String(open));if(open)(list.querySelector('[aria-selected=true]')||list.querySelector('button'))?.focus();}
  const cycle=(items,e)=>{if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return false;e.preventDefault();const i=items.indexOf(document.activeElement);items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();return true;};
  $('#sim-setup').onclick=()=>showSetupList($('#sim-setup-list').hidden);
  $('#sim-setup-list').onclick=e=>{const b=e.target.closest('[data-setup-id]');if(!b)return;showSetupList(false);$('#sim-setup').focus();if(b.dataset.setupId!==project.setupId)void switchSetup(b.dataset.setupId);};
  $('#sim-setup-list').onkeydown=e=>{if(cycle($$('#sim-setup-list [data-setup-id]'),e))return;if(e.key==='Escape'){showSetupList(false);$('#sim-setup').focus();}};
  let menuSetup=null;
  function hideSetupMenu(){$('#sim-setup-menu').hidden=true;menuSetup=null;}
  function setupMenu(id,x,y){
    const menu=$('#sim-setup-menu'),entry=project.setups.find(s=>s.id===id);if(!entry)return;hideSetupMenu();menuSetup=id;
    menu.querySelector('[data-setup-act=open]').hidden=id===project.setupId;menu.querySelector('[data-setup-act=clone]').disabled=project.setups.length>=20;menu.querySelector('[data-setup-act=delete]').disabled=project.setups.length<2;
    menu.setAttribute('aria-label',`${id===project.setupId?project.setupName:entry.name}: setup actions`);menu.hidden=false;
    menu.style.left=Math.max(4,Math.min(x,innerWidth-menu.offsetWidth-4))+'px';menu.style.top=Math.max(4,Math.min(y,innerHeight-menu.offsetHeight-4))+'px';
    menu.querySelector('button:not([hidden]):not(:disabled)')?.focus();
  }
  root.addEventListener('contextmenu',e=>{const b=e.target.closest('[data-setup-id],#sim-setup');if(!b)return;e.preventDefault();const r=b.getBoundingClientRect();setupMenu(b.dataset.setupId||project.setupId,e.clientX||r.left+16,e.clientY||r.bottom);});
  $('#sim-setup-menu').onclick=e=>{
    const button=e.target.closest('[data-setup-act]'),id=menuSetup;if(!button||!id)return;const act=button.dataset.setupAct;
    hideSetupMenu();showSetupList(false);
    if(act==='open')void switchSetup(id);else if(act==='clone')void cloneSetup(id);else if(act==='delete')void confirmDeleteSetup(id);
    else if(act==='rename')void (id===project.setupId?Promise.resolve():switchSetup(id)).then(renameSetup);
  };
  $('#sim-setup-menu').onkeydown=e=>{if(cycle($$('#sim-setup-menu button').filter(b=>!b.hidden&&!b.disabled),e))return;if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();hideSetupMenu();$('#sim-setup').focus();}};
  document.addEventListener('pointerdown',e=>{if(!$('#sim-setup-menu').hidden&&!e.target.closest?.('#sim-setup-menu'))hideSetupMenu();if(!$('#sim-setup-list').hidden&&!e.target.closest?.('.sim-setup-picker,#sim-setup-menu'))showSetupList(false);},true);
  async function switchSetup(id){save();const bank=project.setups,entry=bank.find(s=>s.id===id);if(!entry)return;project=sanitize({...entry.data,setups:bank,setupId:entry.id,setupName:entry.name});model=null;modelPreview?.dispose();modelPreview=null;save();setupPanel();selectTab('setup');await switchLayout(project.active);refreshAll();}
  // A clone is "<name> copy", placed after the original and opened for editing (its name first).
  async function cloneSetup(id){
    save();if(project.setups.length>=20)return status('#start-status','Use at most 20 saved setups.');const source=project.setups.find(s=>s.id===id);if(!source)return;
    const names=new Set(project.setups.map(s=>s.name)),base=source.name.slice(0,32);let name=`${base} copy`;for(let n=2;names.has(name);n++)name=`${base} copy ${n}`;
    // The copy gets its own field ids, so it never updates the original's kept export file.
    const data=JSON.parse(JSON.stringify(source.data));for(const l of data.layouts||[]){const old=l.id;l.id=newId();if(data.active===old)data.active=l.id;}if(data.export)data.export.keep=false;
    const entry={id:newId(),name,data};project.setups.splice(project.setups.indexOf(source)+1,0,entry);
    await switchSetup(entry.id);status('#start-status',`Cloned “${source.name}”. You are editing the copy; the original is unchanged.`);renameSetup();
  }
  function deleteSetup(id){
    if(project.setups.length<2)return;if(id!==project.setupId){project.setups=project.setups.filter(s=>s.id!==id);save();setupPanel();return;}
    const bank=project.setups.filter(s=>s.id!==id),entry=bank[0];project=sanitize({...entry.data,setups:bank,setupId:entry.id,setupName:entry.name});model=null;save();setupPanel();selectTab('setup');void switchLayout(project.active).then(refreshAll);
  }
  $('#sim-setup-new').onclick=()=>{save();if(project.setups.length>=20)return status('#start-status','Use at most 20 saved setups.');const next=defaults(),bank=project.setups;next.setupName=`Setup ${bank.length+1}`;next.setups=bank;project=next;save();setupPanel();model=null;selectTab('setup');void switchLayout(project.active).then(refreshAll);};
  function renameSetup(){const input=document.createElement('input'),sel=$('#sim-setup');input.value=project.setupName;input.maxLength=40;input.setAttribute('aria-label','Setup name');sel.hidden=true;sel.after(input);input.focus();input.select();let done=false;const finish=keep=>{if(done)return;done=true;if(keep&&input.value.trim())project.setupName=input.value.trim();input.remove();sel.hidden=false;save();setupPanel();};input.onblur=()=>finish(true);input.onkeydown=e=>{if(e.key==='Enter')finish(true);if(e.key==='Escape')finish(false);};}
  $('#sim-setup-rename').onclick=renameSetup;
  // Deleting cannot be undone, so it always asks first, naming the setup; "No" is focused so Enter keeps it.
  const confirmDeleteSetup=id=>new Promise(resolve=>{
    const entry=project.setups.find(s=>s.id===id);if(!entry||project.setups.length<2)return resolve(false);const d=$('#sim-setup-delete-confirm');
    $('#sim-setup-delete-title').textContent=`Delete “${id===project.setupId?project.setupName:entry.name}”?`;d.returnValue='';
    d.addEventListener('close',()=>{const yes=d.returnValue==='yes';if(yes)deleteSetup(id);resolve(yes);},{once:true});d.showModal();$('#sim-setup-delete-no').focus();});
  $('#sim-setup-delete').onclick=()=>void confirmDeleteSetup(project.setupId);
  // Path planning and Run & review hide the setup bar, so the panel names the setup being edited; click it to go back to Setup.
  function activeSetupPanel(){const b=$('#sim-active-setup');if(!b)return;b.querySelector('strong').textContent=project.setupName;b.title=`${setupFacts(project).map(f=>f.join(': ')).join('\n')}\n\nClick to open Setup.`;b.hidden=tab==='setup';}
  // Autosave: handlers save as they change things, and any edit, click or drag in the simulator saves again
  // a moment later, so no change in Setup, Path planning or Run & review waits for a Save button.
  let autosaveTimer=0;const autosave=()=>{clearTimeout(autosaveTimer);autosaveTimer=setTimeout(save,300);};
  for(const type of ['input','change','click','pointerup','keyup','drop'])root.addEventListener(type,autosave,true);
  // Typed values commit when their box loses focus, so closing or suspending the app commits the box being edited first.
  const saveNow=()=>{if(root.contains(document.activeElement))document.activeElement.blur?.();clearTimeout(autosaveTimer);save();};
  addEventListener('pagehide',saveNow);document.addEventListener('visibilitychange',()=>{if(document.hidden)saveNow();});

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
  function selectTab(name){if(tab!==name){pointer=null;drag=null;}tab=name;root.dataset.tab=name;if(name==='plan'&&planningStep==='start')tool='start';for(const b of $$('[data-tab]')){b.setAttribute('aria-selected',String(b.dataset.tab===name));b.tabIndex=b.dataset.tab===name?0:-1;}for(const p of $$('[data-panel]'))p.hidden=p.dataset.panel!==name;$('.field-area').hidden=name==='setup';$('.sim-toolbar [data-tool]').parentElement.hidden=name==='run';$('#sim-telemetry').hidden=name!=='run';$('#sim-run-timing').hidden=name!=='run';$('.sim-planning-steps').hidden=name!=='plan';
    document.body.classList.toggle('sim-workspace',active&&name!=='setup');if($('#sim-live-status'))$('#sim-live-status').hidden=name!=='plan'||!$('#sim-live-status').textContent;activeSetupPanel();window.scrollTo(0,0);if(name==='plan')planningPanel();if(name!=='run'&&frame?.playing)void call('pause');view3d?.resize();modelPreview?.resize?.();}
  // Field obstacles are a step only on the empty field; game fields go from the start straight to paths.
  const hasObstacleStep=()=>L().field==='empty';
  function planningPanel(){if(planningStep==='zones'&&!hasObstacleStep())planningStep='pins';const zones=hasObstacleStep();$('#sim-step-zones').hidden=!zones;
    $('#sim-step-pins').textContent=`${zones?3:2} · Paths`;$('#sim-start-next').textContent=zones?'Next: field obstacles →':'Next: paths →';$('.sim-planning-steps').style.setProperty('--steps',zones?3:2);
    root.dataset.step=planningStep;$('#sim-start-step').hidden=planningStep!=='start';$('#sim-obstacle-step').hidden=planningStep!=='zones';$('#sim-route-step').hidden=planningStep!=='pins';for(const step of ['start','zones','pins']){const button=$('#sim-step-'+step);button.setAttribute('aria-pressed',String(planningStep===step));button.setAttribute('aria-selected',String(planningStep===step));}$('.sim-toolbar [data-tool]').parentElement.hidden=tab==='run';for(const b of $$('[data-tool]'))b.hidden=['pin','draw'].includes(b.dataset.tool)?planningStep!=='pins':b.dataset.tool==='select'?false:planningStep!=='zones';}
  function setStep(next){if(sketch)finishShape();planningStep=next;selected=null;tool=next==='pins'?'pin':next==='start'?'start':'select';preview={...start};planningPanel();draw();}
  const steps=$('.sim-planning-steps');$('.sim-panel').prepend(steps);steps.hidden=true;
  const activeSetup=document.createElement('button');activeSetup.id='sim-active-setup';activeSetup.type='button';activeSetup.className='sim-active-setup';activeSetup.hidden=true;activeSetup.innerHTML='<span>Setup</span><strong></strong>';activeSetup.onclick=()=>selectTab('setup');steps.after(activeSetup);
  const liveStatus=document.createElement('button');liveStatus.id='sim-live-status';liveStatus.type='button';liveStatus.className='sim-live-status';liveStatus.hidden=true;activeSetup.after(liveStatus);
  liveStatus.onclick=()=>{setStep('pins');const button=[...$('#sim-route-step').querySelectorAll('[role=tab]')].find(b=>b.textContent==='Diagnostics');button?.click();};
  $('#sim-start-step').prepend($('#sim-start-controls'));
  // ------------------------------------------------------------------ mechanisms
  // The robot's parts, edited like DSIM's robot builder: option cards, side chips and a 3×3 position
  // grid, with the robot model (when there is one) updating as you choose.
  // Every change goes through the shared sanitizer, so this page, the engine and the exports agree.
  let mechPreview=null,mechPlacing=null;
  const GRID=Object.keys(MECH.MOUNT_AT),title=s=>s[0].toUpperCase()+s.slice(1);
  const chip=(field,value,label,on,disabled=false)=>`<button type="button" class="sim-chip" data-field="${field}" data-value="${value}" aria-pressed="${on}"${disabled?' disabled':''}>${label}</button>`;
  const choiceCards=(field,list,notes,value)=>`<div class="sim-choice-cards">${Object.entries(list).map(([k,v])=>`<button type="button" class="sim-choice" data-field="${field}" data-value="${k}" aria-pressed="${k===value}"><strong>${v}</strong><span>${notes[k]}</span></button>`).join('')}</div>`;
  const mountGrid=(value,blocked)=>`<div class="sim-mount-grid" role="group" aria-label="Position on the robot"><span class="sim-mount-front">▲ Front</span>${GRID.map(k=>`<button type="button" data-field="mount" data-value="${k}" aria-pressed="${k===value}"${blocked.has(k)?' disabled title="Too close to the other shooter"':''}>${MECH.MOUNTS[k]}</button>`).join('')}</div>`;
  const placeButton=part=>model?.holder?`<button type="button" class="secondary sim-place" data-place="${part}" aria-pressed="${mechPlacing===part}">${mechPlacing===part?'Click the part on the model…':'Place on model'}</button>`:'';
  const configNote='<p class="hint">Must match your Control Hub configuration (or hardware.py on MotionModule).</p>';
  function intakeCard(intake,n,used){
    const swing=SWINGS[intake.kind];
    return `<section class="sim-mech-part" data-part="intake:${n}"><div class="sim-mech-head"><h4>Intake ${n+1}</h4><button type="button" class="icon-button" data-mech-remove="intake:${n}" aria-label="Remove intake ${n+1}" title="Remove">×</button></div>
      ${choiceCards('kind',MECH.INTAKES,INTAKE_SHORT,intake.kind)}
      <span class="sim-mech-label">Size</span><div class="sim-grid3"><div><label for="mech-intake-reach-${n}">Sticks out past the frame · in</label><input id="mech-intake-reach-${n}" data-field="reach" type="number" min="0" max="18" step="any" data-slider-max="8" data-slider-step="0.25" value="${intake.reach}"></div><div><label for="mech-intake-width-${n}">Mouth width · in</label><input id="mech-intake-width-${n}" data-field="width" type="number" min="1" max="48" step="any" data-slider-max="${Math.max(project.robot.width,project.robot.length)}" data-slider-step="0.25" value="${+(intake.width??(intake.sides.some(e=>e==='front'||e==='back')?project.robot.width:project.robot.length)).toFixed(2)}"></div><div><label for="mech-intake-height-${n}">Opening height · in</label><input id="mech-intake-height-${n}" data-field="height" type="number" min="1" max="24" step="any" data-slider-max="12" data-slider-step="0.25" value="${intake.height}"></div></div>
      <span class="sim-mech-label">Picks up from</span><div class="sim-chips">${MECH.EDGES.map(e=>chip('side',e,title(e),intake.sides.includes(e),used.has(e)&&!intake.sides.includes(e))).join('')}</div>${placeButton('intake:'+n)}
      ${swing?`<span class="sim-mech-label">${swing.label}</span><div class="start-xy"><div><label for="mech-deploy-down-${n}">${swing.down}</label><input id="mech-deploy-down-${n}" data-field="down" type="number" min="0" max="3" step="any" data-slider-max="1.5" data-slider-step="0.05" value="${intake.down}"></div><div><label for="mech-deploy-up-${n}">${swing.up}</label><input id="mech-deploy-up-${n}" data-field="up" type="number" min="0" max="3" step="any" data-slider-max="1.5" data-slider-step="0.05" value="${intake.up}"></div></div>`:''}
      <details class="sim-more"><summary>How this intake works</summary><p class="hint">${MECH.INTAKE_NOTES[intake.kind]}</p>${swing?`<p class="hint">${swing.hint}</p>`:''}<p class="hint">It runs while an Intake action runs (or the right bumper in teleop). A piece it takes moves up into storage over the transfer time.</p><p class="hint">A piece is taken when it touches the outer face of the green box and fits under the opening (pollen is 2.8 in tall, nectar 3.6 in). Pieces near the ends of the mouth take a moment longer to funnel in. The box is solid, so a longer intake reaches pieces sooner but needs more room to drive.</p></details>
      <details class="sim-mech-code"><summary>Robot configuration names</summary>${intake.kind!=='kicker'?`<div class="start-xy"><div><label for="mech-intake-motor-${n}">${swing?'Roller motor name':'Intake motor name'}</label><input id="mech-intake-motor-${n}" data-field="motor" maxlength="40" autocomplete="off" value="${intake.motor}"></div><div><label for="mech-intake-power-${n}">${swing?'Roller power':'Intake power'} · 0–1</label><input id="mech-intake-power-${n}" data-field="power" type="number" min="0.05" max="1" step="any" value="${intake.power}"></div></div>`:''}${swing?`<div class="start-xy"><div><label for="mech-deploy-servo-${n}">${swing.servo}</label><input id="mech-deploy-servo-${n}" data-field="servo" maxlength="40" autocomplete="off" value="${intake.servo}"></div></div><div class="start-xy"><div><label for="mech-deploy-downpos-${n}">Servo position down · 0–1</label><input id="mech-deploy-downpos-${n}" data-field="downPos" type="number" min="0" max="1" step="any" value="${intake.downPos}"></div><div><label for="mech-deploy-uppos-${n}">Servo position up · 0–1</label><input id="mech-deploy-uppos-${n}" data-field="upPos" type="number" min="0" max="1" step="any" value="${intake.upPos}"></div></div>`:''}${configNote}</details></section>`;
  }
  // One line on each option card; the full notes are under "How this … works".
  const INTAKE_SHORT={sweeper:'Edge roller that sweeps pieces off the floor.',siderollers:'Grips from the sides; reaches into flowers.',ramp:'Fold-down ramp with rollers; reaches into flowers.',kicker:'Servo arm that scoops pieces in.'},
    SHOOTER_SHORT={turret:'Turns to aim; the robot can face any way.',fixed:'Fires one way; the robot turns to aim.'};
  // A kicker or a ramp moves on a servo: how long it takes down and back up, and its servo.
  const SWINGS={kicker:{label:'Kicker swing',down:'Swings down in · s',up:'Swings back up in · s',servo:'Kicker servo name',hint:'It swings down when an Intake action starts and picks up only once it is all the way down. When the action ends it swings back up, and what it scooped moves on into storage.'},
    ramp:{label:'Ramp servo',down:'Folds down in · s',up:'Folds back up in · s',servo:'Ramp servo name',hint:'The servo pushes the ramp down when an Intake action starts. Once it is all the way down it picks up, off the floor or a flower’s bottom pollen, and its rollers pull pieces straight into storage. When the action ends it folds back up. Drive the ramp into a flower to take its pollen; a sweeper roller cannot.'}};
  function shooterCard(s,n,m){
    // Two shooters on one turret sit together; on their own turrets they must stay apart.
    const shared=!!m.shooters[1]?.sharesTurret,other=m.shooters.length===2&&!shared?m.shooters[1-n]:null,blocked=new Set(other?['center',...GRID.filter(k=>MECH.adjacent(k,other.mount))]:[]);
    const pieces=`<span class="sim-mech-label">Shoots</span><div class="sim-chips">${Object.entries(MECH.PIECES).map(([k,v])=>chip('pieces',k,v,s.pieces===k)).join('')}</div>`;
    const turretChoice=n===1&&s.type==='turret'&&m.shooters[0].type==='turret'?`<span class="sim-mech-label">Turret</span><div class="sim-chips">${chip('sharesTurret','false','Its own turret',!shared)}${chip('sharesTurret','true','On shooter 1’s turret',shared)}</div>
      <p class="hint">${shared?`Both flywheels ride one turntable at the ${MECH.MOUNTS[m.shooters[0].mount].toLowerCase()}: one turret motor aims them together. Move it from shooter 1.`:'Each turret turns on its own motor and aims from its own spot. Two turrets cannot sit next to each other.'}</p>`:'';
    const riding=n===1&&shared;
    return `<section class="sim-mech-part" data-part="shooter:${n}"><div class="sim-mech-head"><h4>Shooter ${n+1} · ${MECH.PIECES[s.pieces].toLowerCase()}</h4><button type="button" class="icon-button" data-mech-remove="shooter:${n}" aria-label="Remove shooter ${n+1}" title="Remove">×</button></div>${s.parts?.length?`<p class="hint">From your CAD: ${s.parts.join(', ').replace(/[&<>"]/g,c=>`&#${c.charCodeAt(0)};`)}</p>`:''}
      ${choiceCards('type',{turret:'Turret',fixed:'Fixed shooter'},SHOOTER_SHORT,s.type)}${pieces}${turretChoice}
      ${riding?'':`<span class="sim-mech-label">Position on the robot</span>${mountGrid(s.mount,blocked)}${placeButton('shooter:'+n)}`}
      ${s.type==='fixed'?`<span class="sim-mech-label">Fires toward</span><div class="sim-chips">${Object.keys(MECH.FACING).map(f=>chip('facing',f,title(f),s.facing===f)).join('')}</div>`:''}
      <details class="sim-more"><summary>How this shooter works</summary><p class="hint">${MECH.SHOOTER_NOTES[s.type]}</p></details>
      <details class="sim-mech-code"><summary>Robot configuration names</summary><div class="start-xy"><div><label for="mech-shooter-motor-${n}">Flywheel motor name</label><input id="mech-shooter-motor-${n}" data-field="motor" maxlength="40" autocomplete="off" value="${s.motor}"></div><div><label for="mech-indexer-name-${n}">Indexer name</label><input id="mech-indexer-name-${n}" data-field="indexer" maxlength="40" autocomplete="off" value="${s.indexer}"></div></div>
      <div class="start-xy"><div><label for="mech-indexer-kind-${n}">Indexer is a</label><select id="mech-indexer-kind-${n}" data-field="indexerKind">${options(MECH.INDEXERS,s.indexerKind)}</select></div>${s.type==='turret'&&!riding?`<div><label for="mech-turret-motor-${n}">${shared?'Turret motor name (both shooters)':'Turret motor name'}</label><input id="mech-turret-motor-${n}" data-field="turretMotor" maxlength="40" autocomplete="off" value="${s.turretMotor}"></div>`:''}</div>${configNote}</details></section>`;
  }
  function mechanismsPanel(){
    const m=project.mechanisms,l=L(),on=m.enabled,intakes=on?m.intakes:[],shooters=on?m.shooters:[],used=new Set(intakes.flatMap(i=>i.sides));
    $('#mech-field-note').textContent=l.field!=='biobuzz'?'Mechanisms act on BIOBUZZ pieces. On an empty field the robot drives the route but has nothing to pick up or shoot.':shooters.length?`Shots aim at the ${l.alliance||'red'} hive's up-facing cell (set the alliance in step 1).`:'';
    // Rebuilt from settings; keep focus on a text field the user is typing in.
    const typing=document.activeElement?.closest?.('#mech-intakes,#mech-shooters')&&document.activeElement.matches('input:not([type=number])');
    if(!typing){const parts='#mech-intakes details,#mech-shooters details',key=d=>d.closest('[data-part]').dataset.part+' '+d.className,open=new Set([...$$(parts)].filter(d=>d.open).map(key));
      $('#mech-intakes').innerHTML=intakes.map((i,n)=>intakeCard(i,n,used)).join('');$('#mech-shooters').innerHTML=shooters.map((s,n)=>shooterCard(s,n,m)).join('');
      for(const d of $$(parts))d.open=open.has(key(d));}
    $('[data-mech-add=intake]').hidden=intakes.length>=4||used.size>=4;$('[data-mech-add=shooter]').hidden=shooters.length>=MECH.MAX_SHOOTERS;
    $('[data-mech-add=shooter]').textContent=shooters.length?'+ Add a second shooter':'+ Add shooter';
    $('#mech-timing').hidden=!shooters.length;$('#mech-turret-timing').hidden=$('#mech-turret-code').hidden=!MECH.hasTurret(m);$('#mech-preloads').hidden=!on;
    const nectarOk=shooters.some(s=>s.pieces!=='pollen');$('#mech-cap-nectar').disabled=!nectarOk;$('#mech-preload').max=String(m.capacity.pollen);
    $('#mech-nectar-note').textContent=nectarOk?`Holds ${m.storage} pieces in any mix: up to ${m.capacity.pollen} pollen and up to ${m.capacity.nectar} nectar, ${MECH.STORAGE_MAX} at most together.`:'To carry nectar, set a shooter to shoot nectar (or pollen and nectar).';
    for(const [id,v] of [['#mech-cap-pollen',m.capacity.pollen],['#mech-cap-nectar',m.capacity.nectar],['#mech-preload',m.preload.pollen],['#mech-spinup',m.shooter.spinUp],['#mech-transfer',m.transfer.seconds],['#mech-index',m.indexer.seconds],['#mech-turret-speed',m.turret.speed],['#mech-turret-range',Math.max(-m.turret.min,m.turret.max)],['#mech-rpm',m.shooter.rpm],['#mech-tpr',m.shooter.ticksPerRev],['#mech-turret-tpd',m.turret.ticksPerDegree]])inputValue(id,v);
    $('#sim-action-list').replaceChildren(...MECH.actions(m).map(v=>new Option(v,v)));
    mechModel();
  }
  // The robot model with each part marked; "Place on model" picks a part's position by clicking it.
  function mechModel(){
    const show=!!model?.holder&&setupStep==='mechanisms'&&project.mechanisms.enabled;$('#mech-model-box').hidden=!show;
    if(!show){mechPreview?.pick(null);return;}
    if(!mechPreview)mechPreview=M().preview($('#mech-model-preview'));
    // The model is fitted to the chassis (not the intakes), so parts are placed from the chassis edges.
    const f=chassisFootprint(),m=project.mechanisms,r=project.robot,cx=(f.front-f.rear)/2,hl=r.length/2,hw=r.width/2,h=(model.holder.userData.size?.height||12)*.7;
    mechPreview.update(model.holder,chassisFootprint());
    // Intakes: see-through green boxes at their real size. Shooters: dots (yellow pollen, red nectar, orange both).
    const normal={front:[1,0],back:[-1,0],left:[0,1],right:[0,-1]},marks=[],colors={pollen:0xf2d14b,nectar:0xe5484d,both:0xf2994a};
    for(const i of m.intakes)for(const e of i.sides){const [nx,ny]=normal[e],dist=nx?hl:hw,edgeLen=nx?r.width:r.length,depth=Math.max(i.reach,1),span=Math.min(i.width??edgeLen,edgeLen),c=dist+i.reach-depth/2;
      marks.push({x:cx+nx*c,y:ny*c,z:i.height/2,size:nx?[depth,span,i.height]:[span,depth,i.height],color:0x49cbb3});}
    for(const s of m.shooters){const [fx,fy]=MECH.MOUNT_AT[s.mount],p=s.at||{x:cx+fx*(hl-3),y:fy*(hw-3),z:h};marks.push({...p,z:p.z??h,color:colors[s.pieces],radius:1.4});}
    $('#mech-model-key').replaceChildren(...[...m.intakes.map((i,n)=>[0x49cbb3,`Intake ${n+1}`,`${MECH.INTAKES[i.kind]} on the ${i.sides.join(' + ')}: the box is where it picks up`]),
      ...m.shooters.map((s,n)=>[colors[s.pieces],`Shooter ${n+1}`,`${s.type==='turret'?'turret':'fixed shooter'} at the ${MECH.MOUNTS[s.mount].toLowerCase()}, shoots ${MECH.PIECES[s.pieces].toLowerCase()}`])]
      .map(([color,name,text])=>{const li=document.createElement('li'),dot=document.createElement('i'),b=document.createElement('b');dot.style.background='#'+color.toString(16).padStart(6,'0');b.textContent=name;li.append(dot,b,' · '+text);return li;}));
    mechPreview.markers(marks);
    // Parts named in the CAD (Chassis, Intake, Shooter, Turret, Indexer...) can set these up again, after a new front for example.
    const named=(project.model?.parts||[]).filter(p=>p.role!=='other');$('#mech-cad').hidden=!named.length;
    $('#mech-cad-note').textContent=named.length?`Your CAD names ${named.map(p=>`“${p.name}” (${p.role}${p.pieces?', '+p.pieces:''}${p.type==='turret'?', turret':''})`).join(', ')}. This replaces the intakes, shooters and chassis size with them.`:'';
    mechPreview.pick(mechPlacing?point=>{if(!point)return;const [kind,n]=mechPlacing.split(':'),loc=MECH.locate({x:point.x-cx,y:point.y},2*hl,2*hw);mechPlacing=null;
      setMech(m=>{const part=m[kind==='intake'?'intakes':'shooters'][+n];if(!part)return;
        if(kind==='intake'){if(m.intakes.some((o,k)=>k!==+n&&o.sides.includes(loc.edge)))return status('#mech-model-help',`Another intake already covers the ${loc.edge}.`);part.sides=[loc.edge];part.at=point;status('#mech-model-help',`Intake ${+n+1}: ${loc.edge} of the robot.`);}
        else{part.mount=loc.mount;part.at=point;status('#mech-model-help',`Shooter ${+n+1}: ${MECH.MOUNTS[loc.mount].toLowerCase()} of the robot.`);}});}:null);
  }
  $('#mech-from-cad').onclick=()=>{const out=setUpFromCad();save();robotPanel();mechanismsPanel();void placeModel();reload();status('#mech-model-help',out?.found.length?'Set up from your CAD: '+out.found.join('; ')+'.':'No intake, shooter or chassis parts were named in this CAD.');};
  // Mechanisms are on while the robot has any part; adding the first part starts from that part alone.
  function setMech(change){const m=structuredClone(project.mechanisms);if(!m.enabled){m.intakes=[];m.shooters=[];}change(m);m.enabled=m.intakes.length>0||m.shooters.length>0;project.mechanisms=MECH.sanitize(m);save();mechanismsPanel();reload();}
  $('[data-mech-add=intake]').onclick=()=>setMech(m=>{const free=MECH.EDGES.find(e=>!m.intakes.some(i=>i.sides.includes(e)));if(free)m.intakes.push({kind:m.intakes[0]?.kind||'sweeper',sides:[free]});});
  $('[data-mech-add=shooter]').onclick=()=>setMech(m=>{const first=m.shooters[0];m.shooters.push(first?{type:'fixed',pieces:'nectar',mount:MECH.PARTNER[first.mount==='center'?'front':first.mount]}:{type:'turret',pieces:'pollen',mount:'center'});});
  for(const host of ['#mech-intakes','#mech-shooters']){
    const box=$(host),partOf=el=>{const [kind,n]=el.closest('[data-part]').dataset.part.split(':');return {kind,n:+n};};
    box.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
      if(b.dataset.mechRemove){const [kind,n]=b.dataset.mechRemove.split(':');if(mechPlacing?.startsWith(kind))mechPlacing=null;return setMech(m=>m[kind==='intake'?'intakes':'shooters'].splice(+n,1));}
      if(b.dataset.place){mechPlacing=mechPlacing===b.dataset.place?null:b.dataset.place;status('#mech-model-help',mechPlacing?'Click where that part is on the model. Drag to turn the view.':'');mechanismsPanel();return;}
      const field=b.dataset.field,value=b.dataset.value;if(!field||value===undefined)return;const {kind,n}=partOf(b);
      setMech(m=>{const part=m[kind==='intake'?'intakes':'shooters'][n];if(!part)return;
        if(field==='side'){const has=part.sides.includes(value);if(has&&part.sides.length===1)return;part.sides=has?part.sides.filter(s=>s!==value):[...part.sides,value];delete part.at;}
        else if(field==='sharesTurret'){part.sharesTurret=value==='true';delete part.at;
          // Back on its own turret: it moves to the first shooter's partner spot.
          if(!part.sharesTurret){const first=m.shooters[0];part.mount=MECH.PARTNER[first.mount==='center'?'front':first.mount];}}
        else{part[field]=value;if(field==='mount')delete part.at;}});});
    box.addEventListener('change',e=>{const el=e.target;if(!el.dataset?.field)return;const {kind,n}=partOf(el);
      setMech(m=>{const part=m[kind==='intake'?'intakes':'shooters'][n];if(!part)return;part[el.dataset.field]=el.type==='number'?(finite(el.valueAsNumber)?el.valueAsNumber:part[el.dataset.field]):el.value;});});
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mechPlacing){mechPlacing=null;status('#mech-model-help','');mechanismsPanel();}});
  const mechNumber=(id,apply)=>$(id).addEventListener('change',e=>{if(finite(e.target.valueAsNumber))setMech(m=>apply(m,e.target.valueAsNumber));});
  mechNumber('#mech-cap-pollen',(m,v)=>m.capacity.pollen=v);mechNumber('#mech-cap-nectar',(m,v)=>m.capacity.nectar=v);mechNumber('#mech-preload',(m,v)=>m.preload.pollen=v);
  mechNumber('#mech-spinup',(m,v)=>m.shooter.spinUp=v);mechNumber('#mech-transfer',(m,v)=>m.transfer.seconds=v);mechNumber('#mech-index',(m,v)=>m.indexer.seconds=v);
  mechNumber('#mech-turret-speed',(m,v)=>m.turret.speed=v);mechNumber('#mech-turret-range',(m,v)=>{m.turret.min=-Math.abs(v);m.turret.max=Math.abs(v);});
  mechNumber('#mech-rpm',(m,v)=>m.shooter.rpm=v);mechNumber('#mech-tpr',(m,v)=>m.shooter.ticksPerRev=v);mechNumber('#mech-turret-tpd',(m,v)=>m.turret.ticksPerDegree=v);
  for(const b of $$('[data-alliance]'))b.onclick=()=>{const l=L(),next=b.dataset.alliance;if((l.alliance||'red')===next)return;
    // BIOBUZZ is point-symmetric: the other alliance runs the same route turned 180° about the centre.
    const route=l.field==='biobuzz'&&(l.start||l.pins.length||l.zones.length);if(route){Object.assign(l,planner.allianceRoute(l,{mode:'rotate',width:l.width,height:l.height}));if(l.start){start=l.start;preview={...start};if(native&&info)void api.sim('start',start).catch(()=>{});}}
    l.alliance=next;$('#sim-alliance-note').textContent=route?`Moved the starting pose${l.pins.length?`, ${l.pins.length} path${l.pins.length>1?'s':''}`:''}${l.zones.length?' and obstacles':''} to the ${next} side. Press ${next==='red'?'Blue':'Red'} to move them back.`:`Shots aim at the ${next} hive.`;
    changed('zones');layoutPanel();mechanismsPanel();reload();};
  mechanismsPanel();presetPanel();
  // Setup runs in order like Path planning: 1 Field, 2 Robot controller (and its sensing), 3 Robot.
  // Mechanisms are part of the BIOBUZZ game; on an empty field the robot is a chassis that drives the route, so Setup skips them.
  function setupSteps(){const game=L().field==='biobuzz';if(!game&&setupStep==='mechanisms')setupStep='controller';$('#sim-setup-step-mechanisms').hidden=!game;$('#sim-setup-step-controller').textContent=(game?'4':'3')+' · Robot controller';
    const next=document.querySelector('[data-setup-page=robot] .sim-setup-nav .primary'),back=document.querySelector('[data-setup-page=controller] .sim-setup-nav [data-setup-go]');
    if(next){next.dataset.setupGo=game?'mechanisms':'controller';next.textContent=`Next: ${game?'mechanisms':'robot controller'} →`;}if(back)back.dataset.setupGo=game?'mechanisms':'robot';}
  function setupStepPanel(){setupSteps();for(const p of $$('[data-setup-page]'))p.hidden=p.dataset.setupPage!==setupStep;queueMicrotask(()=>{presetPanel();setupStep==='mechanisms'?mechanismsPanel():mechModel();});for(const b of $$('[data-setup-step]')){const on=b.dataset.setupStep===setupStep;b.setAttribute('aria-selected',String(on));b.setAttribute('aria-pressed',String(on));b.tabIndex=on?0:-1;}}
  function showSetupStep(step){setupStep=step;setupStepPanel();window.scrollTo(0,0);}
  for(const b of $$('[data-setup-step]'))b.onclick=()=>showSetupStep(b.dataset.setupStep);
  for(const b of $$('[data-setup-go]'))b.onclick=()=>showSetupStep(b.dataset.setupGo);
  setupStepPanel();
  $('#sim-setup-next').onclick=()=>{selectTab('plan');setStep('start');void setView('2d');};$('#sim-step-start').onclick=()=>setStep('start');$('#sim-step-zones').onclick=()=>setStep('zones');$('#sim-step-pins').onclick=()=>setStep('pins');$('#sim-zones-next').onclick=()=>setStep('pins');$('#sim-plan-next').onclick=()=>selectTab('run');
  $('#sim-start-next').onclick=()=>{try{commit(tool==='start'?preview:start);setStep(hasObstacleStep()?'zones':'pins');}catch(e){status('#start-status',e.message);}};
  $('#sim-run-sensors').onclick=()=>{selectTab('setup');$('#sim-localization').focus();};$('#sim-run-plan').onclick=()=>{selectTab('plan');setStep(L().start?'pins':'start');};
  // + Add path ends a new path one tile from the last point, toward the middle of the field
  // (or across it, from the middle).
  $('#sim-add-path').onclick=()=>{const from=L().pins.at(-1)||start,b=geometry().bounds,c={x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2},d=Math.hypot(c.x-from.x,c.y-from.y),reach=24;
    addPin(d>reach?{x:from.x+(c.x-from.x)/d*reach,y:from.y+(c.y-from.y)/d*reach}:{x:from.x,y:from.y+(from.y<c.y?reach:-reach)});$('#sim-pin-list .selected')?.scrollIntoView({block:'nearest'});};
  $('#sim-obstacle-step').append($('#sim-zone-editor'),$('#sim-clear-zones'));
  function settingsViews(parent,groups){
    const nav=document.createElement('div');nav.className='sim-settings-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Settings view');
    const panes=[];for(const [label,nodes] of groups){const pane=document.createElement('section');pane.className='sim-settings-page';pane.id='sim-settings-'+Math.random().toString(36).slice(2);pane.setAttribute('role','tabpanel');
      for(const node of nodes)if(node)pane.append(node);const button=document.createElement('button');button.type='button';button.textContent=label;button.className='secondary';button.setAttribute('role','tab');button.setAttribute('aria-controls',pane.id);button.onclick=()=>choose(panes.findIndex(p=>p.pane===pane));nav.append(button);parent.append(pane);panes.push({pane,button});}
    function choose(index){panes.forEach(({pane,button},i)=>{pane.hidden=i!==index;button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});}
    nav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const i=panes.findIndex(p=>p.button===document.activeElement),next=(i+(event.key==='ArrowRight'?1:-1)+panes.length)%panes.length;choose(next);panes[next].button.focus();});parent.prepend(nav);choose(0);
  }
  for(const [id,tools] of [['#sim-obstacle-step',['rect','circle','triangle','shape']],['#sim-route-step',['pin','draw']]]){const group=document.createElement('div');group.className='segmented sim-seg sim-edit-tools';group.setAttribute('role','group');group.setAttribute('aria-label',id.includes('obstacle')?'Add obstacle':'Add paths');for(const tool of tools)group.append($(`[data-tool=${tool}]`));if(id==='#sim-route-step')$('.sim-path-bar').prepend(group);else $(id).insertBefore(group,$(id).children[1]);}
  const routeStep=$('#sim-route-step'),routeChildren=[...routeStep.children],routeSettings=routeChildren.indexOf($('[data-style]').parentElement.previousElementSibling),routeExport=routeChildren.findIndex(n=>n.tagName==='H3');
  const nextRun=$('#sim-plan-next'),exportNodes=routeChildren.slice(routeExport).filter(n=>n!==nextRun);nextRun.remove();
  const routeHelp=n=>n.matches('.sim-legend')||n.tagName==='P'&&n.textContent.startsWith('Each path');
  settingsViews(routeStep,[['Paths',routeChildren.slice(0,routeSettings).filter(n=>!routeHelp(n))],['Route',routeChildren.slice(routeSettings,routeExport)],['Diagnostics',[diagnosticBox('sim-plan-diagnostics')]],['Help',routeChildren.slice(0,routeSettings).filter(routeHelp)]]);routeStep.append(nextRun);
  const runPanel=$('#sim-panel-run'),runChildren=[...runPanel.children],timers=runPanel.querySelector('.sim-grid3'),clock=$('#sim-practice-clock'),programButtons=$('[data-program]').parentElement;
  const programNodes=[programButtons,$('#sim-program-note'),$('#sim-program-preview'),$('#sim-source-box')],outputNodes=runChildren.filter(n=>n.matches('.sim-log,.sim-credit'));
  const timing=document.createElement('section');timing.id='sim-run-timing';timing.className='sim-run-timing';timing.hidden=true;timing.setAttribute('aria-label','Practice timing');
  // Run & review runs the practice from a column beside the field: clock, mode and Run stay in
  // view, and the period lengths and live readout scroll under them on short screens. Both
  // workspace tabs share one field row and fixed-height footer, so the field is the same size.
  const runControls=document.createElement('div'),runDetails=document.createElement('div');runControls.className='sim-run-controls';runDetails.className='sim-run-details';
  runControls.append(clock,$('[data-practice]').parentElement,$('#sim-run').parentElement,$('#sim-run-status'),$('#sim-error'));
  runDetails.append(Object.assign(document.createElement('h3'),{textContent:'Period lengths · seconds'}),timers,$('#sim-telemetry'),$('#sim-run-readiness'),$('#sim-run-sensors'),$('#sim-practice-help'));
  timing.append(runControls,runDetails);
  const fieldRow=document.createElement('div'),fieldFooter=document.createElement('div');fieldRow.className='sim-field-row';fieldFooter.className='sim-field-footer';
  $('#sim-stage').before(fieldRow);fieldRow.append(timing,$('#sim-stage'));fieldRow.after(fieldFooter);fieldFooter.append($('#field-coordinates'),$('#field-help'));
  const dataBox=document.createElement('div');dataBox.className='sim-data';
  runData=window.DeckSimData.create({panelHost:dataBox,settings:()=>({mechanisms:project.mechanisms,robot:project.robot}),onScrub:f=>{frame=f||liveFrame;paint();telemetry();}});
  // The recorded run as a WPILOG file, for sharing or comparing with logs from the real robot.
  const logButton=document.createElement('button'),logStatus=document.createElement('p');logButton.type='button';logButton.className='secondary';logButton.textContent='Save run log (.wpilog)…';logStatus.className='hint';logStatus.setAttribute('role','status');
  logButton.onclick=async()=>{const frames=runData.frames();if(!frames.length){logStatus.textContent='Run the route first; the run is recorded while it plays.';return;}if(!native){logStatus.textContent='Saving run logs needs the installed app.';return;}
    try{const bytes=window.DeckWpilog.fromFrames(frames,{alliance:L().alliance,mechanisms:project.mechanisms,robot:project.robot,name:L().name});logStatus.textContent=(await api.simFile('log-save',{name:L().name,bytes}))?.message||'';}catch(e){logStatus.textContent=e.message;}};
  // A real robot's log on the field beside the plan: where it actually drove and how far it strayed.
  const robotLog={data:null,name:''},compareBox=document.createElement('div');compareBox.className='sim-log-compare';
  compareBox.innerHTML=`<h3>Compare with a robot log</h3><p class="hint">Open a log from your real robot to draw where it drove (orange) next to the plan and see how far it strayed. WPILOG: a Pose2d entry such as /RealOutputs/Odometry/Robot (FTC field frame, like Deck’s own run logs). CSV: x, y and heading columns.</p>
    <label for="sim-log-origin">CSV coordinates</label><select id="sim-log-origin"><option value="corner">Inches from the bottom-left corner (Deck, Pedro Pathing)</option><option value="center">Inches from the field centre (FTC SDK)</option></select>
    <div class="button-row"><button type="button" class="secondary" id="sim-log-open">Open robot log…</button><button type="button" class="text-button" id="sim-log-clear" hidden>Hide</button></div><dl id="sim-log-result" class="sim-telemetry"></dl><p id="sim-log-status" class="hint" role="status"></p>`;
  const drawRobotLog=()=>{const g=$('#sim-log-path');if(!robotLog.data){g.replaceChildren();return;}g.replaceChildren(svg('polyline',{class:'sim-log-path',points:pts(robotLog.data.poses)}));
    const r=L().route?(()=>{try{return window.DeckRobotLog.compare(robotLog.data,L().route);}catch{return null;}})():null,box=$('#sim-log-result'),row=(k,v)=>box.append(Object.assign(document.createElement('dt'),{textContent:k}),Object.assign(document.createElement('dd'),{textContent:v}));box.replaceChildren();
    row('Log',`${robotLog.name} · ${robotLog.data.key}`);row('Poses',`${robotLog.data.poses.length} over ${(robotLog.data.poses.at(-1).t-robotLog.data.poses[0].t).toFixed(2)} s`);
    if(r){row('From the plan',`average ${r.meanError.toFixed(2)} in · worst ${r.maxError.toFixed(2)} in at (${field.round(r.worst.x)}, ${field.round(r.worst.y)})`);row('Stopped',`${r.endError.toFixed(2)} in from the last end point`);if(r.worst)g.append(svg('circle',{class:'sim-log-worst',cx:r.worst.x,cy:r.worst.y,r:1.6}));}
    else row('From the plan','Plan a route to compare');$('#sim-log-clear').hidden=false;};
  compareBox.querySelector('#sim-log-open').onclick=async()=>{const status=compareBox.querySelector('#sim-log-status');if(!native){status.textContent='Opening robot logs needs the installed app.';return;}
    try{const file=await api.simFile('robot-log-open');if(!file)return;robotLog.data=window.DeckRobotLog.parse(file,{origin:$('#sim-log-origin').value});robotLog.name=file.name;drawRobotLog();status.textContent=robotLog.data.others.length?`Also in this log: ${robotLog.data.others.slice(0,4).join(', ')}.`:'';}catch(e){status.textContent=e.message;}};
  compareBox.querySelector('#sim-log-clear').onclick=()=>{robotLog.data=null;drawRobotLog();$('#sim-log-result').replaceChildren();$('#sim-log-clear').hidden=true;};
  compareBox.querySelector('#sim-log-origin').onchange=()=>{if(robotLog.data?.format==='csv')compareBox.querySelector('#sim-log-status').textContent='Open the CSV again to use these coordinates.';};
  const logNodes=[Object.assign(document.createElement('h3'),{textContent:'Run log'}),Object.assign(document.createElement('p'),{className:'hint',textContent:'The last run with every value, in the WPILOG format FTC and FRC log viewers read.'}),logButton,logStatus];
  // The run's data first; the output, code and checks are for after the run.
  settingsViews(runPanel,[['Data',[$('#sim-run-analysis'),dataBox,compareBox]],['Output',outputNodes],['Program',programNodes],['Export',[...exportNodes,...logNodes]],['Diagnostics',[diagnosticBox('sim-run-diagnostics')]]]);
  const obstacleStep=$('#sim-obstacle-step');$('#sim-zone-editor').hidden=true;const obstacleHelp=document.createElement('p');obstacleHelp.className='hint';obstacleHelp.textContent='Drag an existing obstacle to move it. Double-click it to edit its dimensions and corners, then press Done to save.';obstacleStep.append(obstacleHelp);
  // Paginate settings blocks when a short viewport cannot fit a whole settings view.
  // No fields are discarded, and the field itself stays in the same viewport.
  const sectionPages=[];
  // Run & review views scroll instead: graphs and logs are one block each.
  for(const pane of $$('.sim-settings-page,#sim-start-controls').filter(p=>!p.closest('#sim-panel-run'))){
    const nodes=[...pane.children],units=[];for(let i=0;i<nodes.length;i++){
      const unit=document.createElement('div');unit.className='sim-settings-unit';unit.append(nodes[i]);
      if(nodes[i].tagName==='LABEL'&&nodes[i+1]&&!nodes[i+1].matches('label,h2,h3'))unit.append(nodes[++i]);
      pane.append(unit);units.push(unit);
    }
    const bar=document.createElement('div');bar.className='sim-section-pages';bar.hidden=true;const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');prev.type=next.type='button';prev.className=next.className='secondary';prev.textContent='← Back';next.textContent='More →';bar.append(prev,label,next);pane.append(bar);
    const entry={pane,units,bar,prev,next,label,page:0};prev.onclick=()=>{entry.page--;fitSettings();};next.onclick=()=>{entry.page++;fitSettings();};sectionPages.push(entry);
  }
  function fitSettings(){
    if(!active||tab==='setup')return;const bottom=Math.min(innerHeight-12,$('.sim-panel').getBoundingClientRect().bottom);
    for(const e of sectionPages){if(!e.pane.getClientRects().length)continue;for(const unit of e.units)unit.hidden=false;e.bar.hidden=true;
      const footer=e.pane.closest('#sim-route-step')?$('#sim-plan-next'):e.pane.id==='sim-start-controls'?$('#sim-start-next'):null;
      // The path list is never paged away: it scrolls in the height the rest of its view leaves.
      const list=e.pane.querySelector('#sim-pin-list');if(list){e.page=0;const at=e.units.findIndex(unit=>unit.contains(list)),after=e.units.slice(at+1).reduce((sum,unit)=>sum+unit.getBoundingClientRect().height,0);
        list.style.maxHeight=Math.max(150,bottom-list.getBoundingClientRect().top-(footer?footer.getBoundingClientRect().height+14:0)-after-12)+'px';continue;}
      const available=Math.max(90,bottom-e.pane.getBoundingClientRect().top-(footer?footer.getBoundingClientRect().height+14:0)-8),heights=e.units.map(unit=>unit.getBoundingClientRect().height);
      if(heights.reduce((a,b)=>a+b,0)<=available){e.page=0;continue;}
      const pages=[[]];let used=0;for(let i=0;i<e.units.length;i++){const h=heights[i];if(used+h>available-38&&pages.at(-1).length){pages.push([]);used=0;}pages.at(-1).push(i);used+=h;}
      e.page=Math.max(0,Math.min(pages.length-1,e.page));const focused=e.units.findIndex(unit=>unit.contains(document.activeElement));if(focused>=0)e.page=pages.findIndex(page=>page.includes(focused));
      e.units.forEach((unit,i)=>unit.hidden=!pages[e.page].includes(i));e.bar.hidden=false;e.prev.disabled=e.page===0;e.next.disabled=e.page===pages.length-1;const text=`${e.page+1} / ${pages.length}`;if(e.label.textContent!==text)e.label.textContent=text;
    }
  }
  let fitting=false;const scheduleFit=()=>{if(fitting)return;fitting=true;requestAnimationFrame(()=>{fitting=false;fitSettings();});};
  root.addEventListener('click',scheduleFit);root.addEventListener('change',scheduleFit);addEventListener('resize',scheduleFit);
  new MutationObserver(scheduleFit).observe($('.sim-panel'),{childList:true,subtree:true,characterData:true});
  for(const b of $$('[data-tab]'))b.onclick=()=>selectTab(b.dataset.tab);
  $('#start-form').addEventListener('submit',event=>{event.preventDefault();try{const pose=Object.fromEntries(['x','y','heading'].map(key=>[key,$('#start-'+key).valueAsNumber]));
    // A heading-only change (X/Y untouched or showing the live turn preview) turns along the wall.
    const same=q=>Math.abs(pose.x-q.x)<1e-6&&Math.abs(pose.y-q.y)<1e-6;
    const typed=$('#start-x').dataset.typed||$('#start-y').dataset.typed;
    commit(!typed&&finite(pose.heading)&&field.heading(pose.heading)!==start.heading&&(same(start)||same(preview))?turnStart(pose.heading):pose);}catch(error){status('#start-status',error.message);}});
  // Typing a heading previews the robot turned along the wall, unless X or Y were typed too: those win.
  for(const key of ['x','y'])$('#start-'+key).addEventListener('input',e=>{e.target.dataset.typed='1';});
  $('#start-heading').addEventListener('input',event=>{const h=event.target.valueAsNumber;if(!finite(h))return;
    if($('#start-x').dataset.typed||$('#start-y').dataset.typed){const x=$('#start-x').valueAsNumber,y=$('#start-y').valueAsNumber;if(finite(x)&&finite(y))preview={x,y,heading:field.heading(h)};draw();return;}
    preview=turnStart(h);inputValue('#start-x',String(preview.x));inputValue('#start-y',String(preview.y));draw();});
  // Start at edge places the robot at a clear spot by the left wall immediately; drag it from there.
  const startAtEdge=()=>{const next={...(clearStart(geometry())||field.edgePose(start.heading,geometry())),heading:start.heading};try{commit(next);status('#start-status','At a clear spot by the left wall. Drag the robot to move it.');}catch(e){status('#start-status',e.message);}};
  $('#start-edge').onclick=startAtEdge;$('#start-edge-plan').onclick=startAtEdge;
  addEventListener('resize',()=>{paint();pinPanel();});
  function refreshAll(){setupPanel();layoutPanel();inputs();robotPanel();mechanismsPanel();programPanel();practicePanel(null);modelUi();zonePanel();pinPanel();tested();void exportPanel();pressed('view',project.view);draw();transport();}
  save();selectTab('setup');refreshAll();
  return {activate(value){
    if(active&&!value){pointer=null;drag=null;status('#sim-run-status',runState==='running'?'Simulation closed. The running program was stopped.':'');if(tool==='start')preview={...start};frame=null;info=null;runState='idle';trail=[];draw();}
    const was=active;active=value;document.body.classList.toggle('sim-workspace',active&&tab!=='setup');
    if(value&&!was){if(!L().start)tool='start';draw();void load().then(()=>{if(project.view==='3d')void setView('3d');void placeModel();});}
  }};
}};
