'use strict';
// FTC Driver Station screen. Talks Robocol through `ftcHost`, a datagram bridge to the one robot
// chosen in Settings (Electron preload, Android WebView interface, or the browser preview).
(()=>{
const $=s=>document.querySelector(s),R=window.Robocol,STOP=R.STOP_OP_MODE,AUTO_SECONDS=30;
const host=window.ftcHost||androidHost();
let session=null,info={name:'FTC Robot',host:''},selected=null,timerOn=false,timerEnd=0,countdown=null,inputsOn=true,cameraUrl=null,renderQueued=false,lastTelemetry=-1,lastState={},rumbleToken=0;
const users={1:null,2:null},padKeys={1:'',2:''},padStamps={1:0,2:0},held=new Set();

function androidHost(){
  const native=window.DeckFtcNative;if(!native)return null;const packets=new Set(),actives=new Set();
  const toBytes=b64=>{const s=atob(b64),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;};
  const toBase64=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);};
  window.__deckFtcPacket=b64=>{const bytes=toBytes(b64);for(const fn of packets)fn(bytes);};
  window.__deckFtcActive=on=>{for(const fn of actives)fn(!!on);};
  return {info:async()=>JSON.parse(native.info()),send:bytes=>native.send(toBase64(bytes)),onPacket:fn=>{packets.add(fn);return()=>packets.delete(fn);},onActive:fn=>{actives.add(fn);return()=>actives.delete(fn);},programAndManage:async()=>native.programAndManage()};
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function toast(message,ms=3500){const t=$('#ds-toast');t.textContent=message;t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{t.hidden=true;},Math.max(1500,ms));}
function showDialog(title,text){const d=$('#ds-dialog');$('#dialog-title').textContent=title;$('#dialog-text').textContent=text;if(!d.open)d.showModal();}
function opMode(name){return session?.state.opModes.find(m=>m.name===name)||null;}
function flavorOf(m){return m?.flavor==='AUTONOMOUS'?'auto':m?.flavor==='TELEOP'?'teleop':'';}
const STATUS={UNKNOWN:'Unknown',NOT_STARTED:'Not started',INIT:'Init',RUNNING:'Running',STOPPED:'Stopped',EMERGENCY_STOP:'Emergency stop'};

// ---- Rendering ---------------------------------------------------------------------------
function queueRender(){if(renderQueued)return;renderQueued=true;setTimeout(()=>{renderQueued=false;render();},0);}
function render(){
  const s=session.state,connected=s.connection==='connected',busy=s.opModeState!=='stopped';
  if(s.activeOpMode!==STOP&&selected?.name!==s.activeOpMode){selected=opMode(s.activeOpMode)||{name:s.activeOpMode};}
  if(selected&&s.opModes.length&&!busy&&!opMode(selected.name))selected=null;
  $('#link-dot').className='ds-dot'+(connected?' live':['rejected','incompatible'].includes(s.connection)?' bad':'');
  $('#link-text').textContent=connected?`Connected · ${info.host}${s.robot?.sdk?` · SDK ${s.robot.sdk}`:''}`:s.connection==='rejected'?'Another Driver Station is connected':`Searching · ${info.host}`;
  $('#ping').textContent=connected&&s.ping!==null?`${s.ping} ms`:'—';
  const v=s.battery?.volts,volts=$('#volts');volts.textContent=Number.isFinite(v)?`${v.toFixed(2)} V`:'— V';volts.className='volts'+(Number.isFinite(v)?v>=12?' good':v>=11?' caution':' danger':'');
  const rc=s.rcBattery;$('#rc-battery-stat').hidden=!(rc&&Number.isFinite(rc.percent));if(rc)$('#rc-battery').textContent=`${Math.round(rc.percent)}%${rc.charging?' +':''}`;
  const overlay=$('#link-overlay');overlay.hidden=connected;overlay.classList.toggle('bad',['rejected','incompatible'].includes(s.connection));
  if(!connected){
    const [title,text]=s.connection==='rejected'?['Another Driver Station is connected','This robot is already paired with a different Driver Station. Close that Driver Station app and this one connects automatically.']
      :s.connection==='incompatible'?['Robot Controller is not supported',`This robot reports Robocol version ${s.robot?.robocol}. Update the robot to a current FTC SDK release.`]
      :['Searching for robot…',`Looking for an FTC Robot Controller at ${info.host||'the saved address'}. Make sure this device is on the robot’s Wi-Fi network; a Control Hub is usually 192.168.43.1.`];
    $('#overlay-title').textContent=title;$('#overlay-text').textContent=text;
  }
  const m=selected?opMode(selected.name)||selected:null,flavor=flavorOf(m);
  $('#opmode-label').textContent=m?m.name:'Select an Op Mode';const small=$('#opmode-flavor');small.textContent=flavor==='auto'?'Autonomous':flavor==='teleop'?'TeleOp':'Op Mode';small.className=flavor;
  for(const id of ['#auto-list','#teleop-list','#opmode-name'])$(id).disabled=!connected||busy;
  const go=$('#main-action'),state=s.opModeState,kind=state==='running'?'stop':state==='init'?'start':'init';
  go.className=`ds-go ${kind}${s.pendingAction?' waiting':''}`;$('#main-label').textContent=kind.toUpperCase();
  go.disabled=!connected||(kind==='init'&&!m);$('#abort').hidden=state!=='init'||!connected;
  const timer=$('#timer'),counting=countdown!==null;timer.hidden=!(flavor==='auto'||counting);timer.className='ds-timer'+(counting?' counting':timerOn?' on':'');
  $('#timer-text').textContent=counting?String(Math.max(0,Math.ceil((timerEnd-Date.now())/1000))):String(AUTO_SECONDS);timer.disabled=state==='running';
  const status=$('#robot-status');status.textContent=STATUS[s.robotState]||s.robotState;status.className=s.robotState==='RUNNING'?'running':s.robotState==='INIT'?'init':s.robotState==='EMERGENCY_STOP'?'estop':'';
  $('#active-opmode').textContent=s.activeOpMode===STOP?'None':`${s.activeOpMode}${state==='init'?' (init)':''}`;
  $('#config').textContent=s.activeConfig?`${s.activeConfig.name||'No configuration'}${s.activeConfig.dirty?' (unsaved)':''}`:'—';
  const sys=$('#system-message');sys.hidden=!(s.systemError||s.systemWarning);sys.textContent=s.systemError||s.systemWarning;sys.className='ds-system '+(s.systemError?'error':'warning');
  if(s.telemetry.updated!==lastTelemetry)renderTelemetry(s.telemetry);
  watchTransitions(s);
}
function renderTelemetry(t){
  lastTelemetry=t.updated;const box=$('#telemetry');box.className='ds-lines'+(t.format==='MONOSPACE'?' monospace':'');
  if(!t.lines.length){box.replaceChildren(el('span','empty',session.state.opModeState==='stopped'?'Telemetry from the active op mode appears here.':'No telemetry yet.'));return;}
  box.replaceChildren(...t.lines.map(line=>{const row=el('div');if(t.format==='HTML')row.append(...safeHtml(line));else row.textContent=line;return row;}));
}
// HTML telemetry: rebuild an allow-listed subset as DOM nodes; no attributes but a validated color.
const TAGS=new Set(['B','I','U','EM','STRONG','BR','BIG','SMALL','TT','SUP','SUB','S','STRIKE','DEL','P','DIV','SPAN','FONT','H1','H2','H3','H4','H5','H6','UL','OL','LI','BLOCKQUOTE','PRE','CODE']);
function safeHtml(html){
  const doc=new DOMParser().parseFromString(`<body>${html}</body>`,'text/html');
  const copy=node=>{
    if(node.nodeType===Node.TEXT_NODE)return [document.createTextNode(node.nodeValue)];
    if(node.nodeType!==Node.ELEMENT_NODE)return [];const kids=[...node.childNodes].flatMap(copy);
    if(!TAGS.has(node.tagName))return kids;const out=document.createElement(node.tagName==='FONT'?'span':node.tagName.toLowerCase());
    const color=node.getAttribute('color')||'';if(/^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(color))out.style.color=color;out.append(...kids);return [out];
  };
  return [...doc.body.childNodes].flatMap(copy);
}
function watchTransitions(s){
  if(s.opModeState==='running'&&lastState.opModeState!=='running'&&timerOn&&flavorOf(opMode(s.activeOpMode))==='auto')startCountdown();
  if(s.opModeState!=='running')stopCountdown();
  if(s.connection!==lastState.connection&&s.connection==='connected')toast(`Connected to ${info.name}`,2000);
  lastState={opModeState:s.opModeState,connection:s.connection};
}
function startCountdown(){stopCountdown();timerEnd=Date.now()+AUTO_SECONDS*1000;countdown=setInterval(()=>{if(Date.now()>=timerEnd){stopCountdown();session.stopOpMode();toast('Autonomous period ended');}queueRender();},200);}
function stopCountdown(){if(countdown!==null){clearInterval(countdown);countdown=null;}}

// ---- Op mode selection and control ---------------------------------------------------------
function openPicker(flavor){
  const s=session.state,list=s.opModes.filter(m=>m.flavor===flavor),groups=new Map();
  for(const m of [...list].sort((a,b)=>a.name.localeCompare(b.name))){const g=!m.group||m.group==='$$$$$$$'?'':m.group;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(m);}
  const names=[...groups.keys()].sort((a,b)=>a===''?-1:b===''?1:a.localeCompare(b)),items=[];
  for(const g of names){if(g)items.push(el('h3','',g));for(const m of groups.get(g)){const b=el('button',selected?.name===m.name?'selected':'');b.setAttribute('role','option');b.append(el('span','',m.name));if(m.source==='BLOCKLY'||m.source==='ONBOTJAVA')b.append(el('small','',m.source==='BLOCKLY'?'Blocks':'OnBot Java'));b.onclick=()=>{selected=m;timerOn=m.flavor==='AUTONOMOUS';closePicker();queueRender();};items.push(b);}}
  if(!items.length)items.push(el('p','none',`No ${flavor==='AUTONOMOUS'?'autonomous':'TeleOp'} op modes are registered on this robot.`));
  $('#picker-title').textContent=flavor==='AUTONOMOUS'?'Autonomous':'TeleOp';$('#picker-list').replaceChildren(...items);$('#picker').hidden=false;$('#picker-list button')?.focus();
}
function closePicker(){$('#picker').hidden=true;}
function mainAction(){
  const s=session.state;
  if(s.opModeState==='running')stop();else if(s.opModeState==='init')session.startOpMode(s.activeOpMode);else if(selected)session.initOpMode(selected.name);
  queueRender();
}
function stop(){stopCountdown();session.stopOpMode();queueRender();}

// ---- Gamepads: START+A assigns User 1, START+B assigns User 2 ---------------------------------
const dead=v=>{v=Math.max(-1,Math.min(1,Number(v)||0));return Math.abs(v)<0.05?0:v;};
function gamepadType(id){return /054c|sony|dualshock|dualsense|wireless controller/i.test(id)?R.GamepadType.SONY_PS4:/046d|logitech|f310/i.test(id)?R.GamepadType.LOGITECH_F310:R.GamepadType.XBOX_360;}
function ftcPad(p,rest){
  const base={id:p.index+1,gamepadType:gamepadType(p.id)};if(rest)return base;
  const on=i=>!!p.buttons[i]?.pressed,val=i=>Math.max(0,Math.min(1,p.buttons[i]?.value||0));
  return {...base,left_stick_x:dead(p.axes[0]),left_stick_y:dead(p.axes[1]),right_stick_x:dead(p.axes[2]),right_stick_y:dead(p.axes[3]),left_trigger:val(6),right_trigger:val(7),
    a:on(0),b:on(1),x:on(2),y:on(3),left_bumper:on(4),right_bumper:on(5),back:on(8),start:on(9),left_stick_button:on(10),right_stick_button:on(11),dpad_up:on(12),dpad_down:on(13),dpad_left:on(14),dpad_right:on(15),guide:on(16),touchpad:on(17)};
}
function inputsLive(){return inputsOn&&!document.hidden&&document.hasFocus();}
function pollGamepads(){
  if(!session)return;const pads=[...(navigator.getGamepads?.()||[])].filter(p=>p&&p.connected),present=new Set(pads.map(p=>p.index));
  for(const u of [1,2])if(users[u]!==null&&!present.has(users[u])){users[u]=null;session.setGamepad(u,null);toast(`User ${u} gamepad disconnected`);}
  for(const p of pads){
    const pressed=i=>!!p.buttons[i]?.pressed;
    if(inputsLive()&&pressed(9)&&(pressed(0)||pressed(1))){
      const u=pressed(0)?1:2,other=3-u;
      if(users[u]!==p.index){if(users[other]===p.index){users[other]=null;session.setGamepad(other,null);}users[u]=p.index;held.add(p.index);toast(`Gamepad assigned to User ${u}`,2000);}
    }
    if(held.has(p.index)&&!p.buttons.some(b=>b.pressed))held.delete(p.index);
  }
  for(const u of [1,2]){
    const index=users[u],button=$('#pad-'+u);button.classList.toggle('assigned',index!==null);if(index===null){button.classList.remove('active');continue;}
    const p=pads.find(x=>x.index===index),pad=ftcPad(p,!inputsLive()||held.has(index)),key=JSON.stringify(pad);
    if(key!==padKeys[u]){padKeys[u]=key;padStamps[u]=Date.now();}
    session.setGamepad(u,{...pad,timestamp:padStamps[u]});button.classList.toggle('active',!R.atRest(pad));button.title=`User ${u}: ${p.id}`;
  }
  $('#assign-hint').hidden=!(session.state.connection==='connected'&&users[1]===null&&pads.some(p=>p.index!==users[2]));
}
async function rumble(effect){
  const token=++rumbleToken,index=users[effect.user===2?2:1],actuator=index===null?null:navigator.getGamepads?.()[index]?.vibrationActuator;if(!actuator?.playEffect)return;
  for(const step of effect.steps){if(token!==rumbleToken)return;const duration=step.duration<0?10000:Math.min(step.duration,10000);
    if(duration>0)await actuator.playEffect('dual-rumble',{startDelay:0,duration,strongMagnitude:(step.large||0)/255,weakMagnitude:(step.small||0)/255}).catch(()=>{});}
}

// ---- Robot messages, menu, and camera -----------------------------------------------------------
function showFrame(bytes){const url=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));$('#camera-image').src=url;if(cameraUrl)URL.revokeObjectURL(cameraUrl);cameraUrl=url;}
function openCamera(){if(!session.state.streamAvailable){toast('No camera stream is available. Initialize an op mode that streams a camera, then try again.',4500);return;}$('#camera').hidden=false;$('#telemetry').hidden=true;$('#camera-close').hidden=false;session.requestFrame();}
function closeCamera(){$('#camera').hidden=true;$('#telemetry').hidden=false;$('#camera-close').hidden=true;}
function setMenu(open){$('#ds-menu').hidden=!open;$('#ds-more').setAttribute('aria-expanded',String(open));}
function menu(action){setMenu(false);action();}
$('#ds-more').onclick=()=>setMenu($('#ds-menu').hidden);
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#ds-menu')&&!e.target.closest('#ds-more'))setMenu(false);});
$('#menu-restart').onclick=()=>menu(()=>{session.restartRobot();toast('Restarting robot…');});
$('#menu-manage').onclick=()=>menu(()=>{Promise.resolve(host.programAndManage?.()).catch(e=>toast(e.message));});
$('#menu-camera').onclick=()=>menu(openCamera);
$('#menu-about').onclick=()=>menu(()=>{session.requestAbout();const r=session.state.robot;showDialog('About',`Robot: ${info.name}\nAddress: ${info.host}\nRobocol: ${session.identity.version}${r?.sdk?`\nRobot Controller SDK: ${r.sdk}`:''}\n\nWaiting for the Robot Controller’s details…`);});
$('#menu-gamepads').onclick=()=>menu(()=>showDialog('Gamepad assignment',`Press START + A on a gamepad to make it User 1 (gamepad1).\nPress START + B to make it User 2 (gamepad2).\n\nOn Steam Deck, START is the ☰ button.\n\nUser 1: ${users[1]===null?'not assigned':navigator.getGamepads()[users[1]]?.id||'assigned'}\nUser 2: ${users[2]===null?'not assigned':navigator.getGamepads()[users[2]]?.id||'assigned'}`));
$('#camera-image').onclick=()=>session.requestFrame();$('#camera-close').onclick=closeCamera;
$('#auto-list').onclick=()=>openPicker('AUTONOMOUS');$('#teleop-list').onclick=()=>openPicker('TELEOP');
$('#opmode-name').onclick=()=>openPicker(selected?.flavor==='AUTONOMOUS'?'AUTONOMOUS':'TELEOP');
$('#picker-close').onclick=closePicker;$('#picker').onclick=e=>{if(e.target.id==='picker')closePicker();};
$('#main-action').onclick=mainAction;$('#abort').onclick=stop;
$('#timer').onclick=()=>{if(countdown===null){timerOn=!timerOn;queueRender();}};
$('#dialog-ok').onclick=()=>$('#ds-dialog').close();
$('#pad-1').onclick=$('#pad-2').onclick=()=>$('#menu-gamepads').click();
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closePicker();setMenu(false);}
  // Space stops an initialized or running op mode, like an emergency stop key.
  if(e.code==='Space'&&session&&session.state.opModeState!=='stopped'&&!$('#ds-dialog').open){e.preventDefault();stop();}
});

async function boot(){
  if(!host){$('#overlay-title').textContent='Driver Station bridge unavailable';$('#overlay-text').textContent='Open this robot from Deck Driver Station Settings.';$('#link-overlay').classList.add('bad');return;}
  try{info={...info,...await host.info()};}catch{}
  $('#robot-name').textContent=info.name||'FTC Robot';document.title=`${info.name||'FTC Robot'} · Driver Station`;
  session=new R.DriverStation({send:bytes=>host.send(bytes)});host.onPacket(bytes=>session.receive(bytes));
  host.onActive?.(on=>{inputsOn=on;pollGamepads();});
  session.on('state',queueRender);
  session.on('op-mode-ended',m=>{const next=m.autoTransition&&opMode(m.autoTransition);if(next&&next.flavor==='TELEOP'){selected=next;timerOn=false;session.initOpMode(next.name);toast(`Initializing ${next.name}`);}});
  session.on('toast',t=>toast(t.message,(t.duration||3)*1000));
  session.on('dialog',d=>{$('#ds-dialog').dataset.id=d.id;showDialog(d.title||'Robot Controller',d.message);});
  session.on('dismiss-dialog',id=>{const d=$('#ds-dialog');if(d.open&&(id==='*'||d.dataset.id===id))d.close();});
  session.on('stacktrace',text=>{$('#ds-dialog').dataset.id='';showDialog('Op mode stopped by an error',text);});
  session.on('progress',p=>{$('#progress').hidden=!p;if(p){$('#progress-text').textContent=p.message;$('#progress-bar').max=p.max||100;$('#progress-bar').value=p.cur||0;}});
  session.on('rumble',e=>void rumble(e));
  session.on('speech',s=>{try{const u=new SpeechSynthesisUtterance(s.text);if(s.languageCode)u.lang=s.languageCode+(s.countryCode?'-'+s.countryCode:'');speechSynthesis.speak(u);}catch{}});
  session.on('frame',showFrame);
  session.on('about',a=>showDialog('About',`Robot: ${info.name}\nAddress: ${info.host}\nRobot Controller app: ${a.appVersion||'—'}\nSDK library: ${a.libVersion||'—'}\nRobocol: ${a.networkProtocolVersion||session.identity.version}\nBuilt: ${a.buildTime||'—'}\nOperating system: ${a.osVersion||'—'}\nNetwork: ${a.networkConnectionInfo||'—'}`));
  session.on('disconnected',()=>{stopCountdown();toast('Robot connection lost. Searching…');});
  window.deckShutdown=()=>{session.shutdown();return true;};window.addEventListener('pagehide',()=>session.shutdown());
  window.addEventListener('blur',pollGamepads);window.addEventListener('focus',pollGamepads);
  session.start();render();setInterval(pollGamepads,20);
}
void boot();
})();
