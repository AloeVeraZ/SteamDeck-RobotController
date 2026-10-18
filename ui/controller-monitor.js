'use strict';
window.DeckControllerMonitor={create({api,hardware,robot,syncOverlay,toast}){
  const $=selector=>document.querySelector(selector),dialog=$('#controller-dialog');
  const names=['A / Cross','B / Circle','X / Square','Y / Triangle','LB / L1','RB / R1','LT / L2','RT / R2','Back / View','Start / Menu','Left stick click','Right stick click','D-pad up','D-pad down','D-pad left','D-pad right','Guide / Home'];
  const number=v=>Number.isFinite(v)?Math.max(-1,Math.min(1,v)):0;
  let info={count:1,slots:[null,null],readings:[]},slot=1,lastCapture=null,lastAssignment=0,captureMessage='';
  const key=(i,x,y,label)=>`<g data-pad-button="${i}" class="pad-key"><circle cx="${x}" cy="${y}" r="17"/><text x="${x}" y="${y+5}">${label}</text></g>`;
  $('#controller-visual').innerHTML=`<svg viewBox="0 0 600 320" role="img" aria-label="Live controller sticks, buttons, and triggers">
    <path class="pad-body" d="M140 68h320c35 0 57 32 70 74l30 111c12 45-20 66-48 44l-80-65H168l-80 65c-28 22-60 1-48-44l30-111c13-42 35-74 70-74Z"/>
    <g class="pad-trigger" data-pad-button="6"><rect x="105" y="17" width="90" height="30" rx="9"/><rect id="trigger-left-fill" class="trigger-fill" x="110" y="22" width="0" height="20" rx="5"/><text x="150" y="37">LT / L2</text></g>
    <g class="pad-trigger" data-pad-button="7"><rect x="405" y="17" width="90" height="30" rx="9"/><rect id="trigger-right-fill" class="trigger-fill" x="410" y="22" width="0" height="20" rx="5"/><text x="450" y="37">RT / R2</text></g>
    <g class="pad-trigger" data-pad-button="4"><rect x="108" y="51" width="84" height="17" rx="5"/><text x="150" y="64">LB / L1</text></g>
    <g class="pad-trigger" data-pad-button="5"><rect x="408" y="51" width="84" height="17" rx="5"/><text x="450" y="64">RB / R1</text></g>
    <g class="pad-stick" data-pad-button="10"><circle cx="170" cy="128" r="45"/><path d="M125 128h90m-45-45v90"/><circle id="stick-left-dot" class="stick-dot" cx="170" cy="128" r="19"/></g>
    <g class="pad-stick" data-pad-button="11"><circle cx="370" cy="211" r="45"/><path d="M325 211h90m-45-45v90"/><circle id="stick-right-dot" class="stick-dot" cx="370" cy="211" r="19"/></g>
    ${key(0,448,169,'A')}${key(1,488,129,'B')}${key(2,408,129,'X')}${key(3,448,89,'Y')}
    ${key(8,270,119,'‹')}${key(9,330,119,'☰')}${key(16,300,82,'●')}
    ${key(12,206,190,'↑')}${key(13,206,254,'↓')}${key(14,174,222,'←')}${key(15,238,222,'→')}
    <text class="pad-caption" x="170" y="301">LEFT STICK</text><text class="pad-caption" x="370" y="301">RIGHT STICK</text>
  </svg>`;
  const buttonNodes=names.map((name,index)=>{const item=document.createElement('div');item.className='input-button';item.dataset.button=String(index);const title=document.createElement('span');title.textContent=name;const value=document.createElement('output');value.textContent='0.00';value.setAttribute('aria-label',name+' value');const small=document.createElement('small');small.textContent='Button '+index;item.append(title,value,small);$('#controller-buttons').append(item);return item;});
  const axisNodes=['Left X','Left Y','Right X','Right Y'].map((name,index)=>{const item=document.createElement('div');item.className='axis-reading';const label=document.createElement('span'),value=document.createElement('output'),detail=document.createElement('small');label.textContent=name;value.textContent='0.00';value.id='controller-axis-'+index;detail.textContent='Axis '+index;item.append(label,value,detail);$('#controller-axes').append(item);return value;});
  function renderMonitor(){
    if(!dialog.open)return;
    const pad=info.slots?.[slot-1],reading=info.readings?.[slot-1],capturing=info.capture?.slot===slot,optional=slot===2&&info.count===1,h=hardware();
    $('#controller-dialog-title').textContent='Controller '+slot;
    $('#controller-monitor-name').textContent=pad?.id||(slot===1&&h.builtInController?h.model+' controls · waiting for gamepad input':'No controller assigned');
    $('#controller-monitor-dot').className='dot'+(pad?' live':'');
    $('#controller-role').textContent=optional?'Standby':slot===1?'Default':'Second operator';
    $('.controller-buttons-panel>.hint').textContent=pad&&pad.mapping!=='standard'?'Raw layout: indices and values are live; these reference button names may differ on this device.':'Standard gamepad names and indices. The robot defines their actions.';
    $('#controller-monitor-state').textContent=pad?(reading?.pressed||reading?.axesActive?'Receiving stick or button input':captureMessage||'Connected · move the sticks and press buttons'):'Connect a controller, then press a button. Built-in controls must be in Gamepad Mode.';
    $('#controller-capture-status').hidden=!capturing;
    $('#controller-capture-status').textContent='Release buttons and center sticks, then press any button on the controller to assign it.';
    const axes=Array.from({length:4},(_,i)=>number(reading?.axes?.[i]));
    axisNodes.forEach((node,i)=>node.textContent=axes[i].toFixed(2));
    $('#stick-left-dot').setAttribute('transform',`translate(${axes[0]*25} ${axes[1]*25})`);
    $('#stick-right-dot').setAttribute('transform',`translate(${axes[2]*25} ${axes[3]*25})`);
    const buttons=names.map((_,i)=>{const b=reading?.buttons?.[i];return Math.max(0,number(typeof b==='object'?b.value:b));});
    buttonNodes.forEach((node,i)=>{node.classList.toggle('pressed',buttons[i]>0.2);node.querySelector('output').textContent=buttons[i].toFixed(2);});
    for(const node of document.querySelectorAll('[data-pad-button]'))node.classList.toggle('pressed',buttons[Number(node.dataset.padButton)]>0.2);
    $('#trigger-left-fill').setAttribute('width',String(buttons[6]*80));$('#trigger-right-fill').setAttribute('width',String(buttons[7]*80));
    $('#controller-assign').textContent=capturing?'Cancel assignment':pad?'Reassign controller '+slot:'Assign controller '+slot;
    $('#controller-auto').hidden=slot!==1||!api.controllerAutomatic;
    $('#controller-robot-note').textContent=(optional?'This robot uses one controller. Controller 2 is available on standby; select Two controllers in the robot’s Settings when it needs a second operator. ':'')+'The robot defines each control’s action. Gamepad outputs to the robot stay neutral while this test is open.';
    const deck=h.controllerFamily==='steamdeck';
    $('#controller-mode-title').textContent=deck&&!h.launchedThroughSteam?'Steam Deck · Desktop shortcut':'Gamepad input · built-in or external';
    $('#controller-mode-copy').textContent=deck&&!h.launchedThroughSteam?'Keep Steam running. Hold ☰ Menu until Gamepad Mode appears, then press A. The left stick should move Left X / Y here; the right stick should move Right X / Y. For Gaming Mode, add this app to Steam and choose the Gamepad template. Use the touchscreen for the pointer, or configure a mouse trackpad while keeping both sticks as joysticks.':'Pair external controllers in your operating system, or connect a USB data cable. If sticks move the mouse or scroll, switch your handheld utility or this app’s Steam Input layout to Gamepad. Move both sticks here to verify gamepad input before returning to Drive.';
  }
  function render(next){
    info=next;
    for(let i=0;i<2;i++){
      const pad=info.slots?.[i],row=$('#controller-'+(i+1)),standby=i===1&&info.count===1;
      row.hidden=false;row.classList.toggle('standby',standby);row.querySelector('small').textContent=pad?(standby?'Standby · ':'')+pad.id:standby?'Optional · USB / Bluetooth':'Set up gamepad input';
      row.querySelector('.dot').className='dot'+(pad?' live':'');row.title='Test or assign controller '+(i+1)+(standby?' · optional for this robot':'');
      $('#setup-controller-'+(i+1)+'-name').textContent=pad?.id||(i===0?(hardware().builtInController?hardware().model+' · automatic default':'First standard gamepad · automatic default'):'Connect a USB or Bluetooth controller');
    }
    $('#input-notice').hidden=!(hardware().builtInController&&!info.slots?.[0]);
    if(dialog.open&&lastCapture&&!info.capture){const assigned=(info.assignment?.serial||0)>lastAssignment;captureMessage=assigned?'Assigned. Release buttons and center sticks, then test below.':'Assignment ended. Your previous selection is kept.';}
    lastCapture=info.capture;lastAssignment=info.assignment?.serial||0;renderMonitor();
  }
  function show(selected=slot){if(!dialog.open||selected!==slot)captureMessage='';slot=selected;if(!dialog.open)dialog.showModal();renderMonitor();syncOverlay();}
  async function start(){if(!api.controllerCapture){toast('Use the installed app to assign controllers.');return;}if(info.capture){render(await api.controllerCancel());return;}render(await api.controllerCapture(slot));}
  async function close(){if(info.capture&&api.controllerCancel)render(await api.controllerCancel());dialog.close();syncOverlay();}
  const task=fn=>void Promise.resolve().then(fn).catch(error=>toast(error.message));
  for(const selected of [1,2]){const open=()=>task(async()=>{show(selected);if(!info.slots?.[selected-1])await start();});$('#controller-'+selected).onclick=open;$('#setup-controller-'+selected).onclick=open;}
  $('#controller-assign').onclick=()=>task(start);$('#controller-auto').onclick=()=>task(async()=>{render(await api.controllerAutomatic());captureMessage='Automatic assignment selected. Built-in controls are preferred; center sticks and release buttons before driving.';renderMonitor();});
  $('#controller-cancel').onclick=()=>task(close);$('#controller-done').onclick=()=>task(close);dialog.addEventListener('cancel',event=>{event.preventDefault();task(close);});
  $('#input-notice-test').onclick=()=>show(1);
  api.onControllerState?.(render);api.onControllerCapture?.(next=>{slot=next.capture?.slot||slot;show(slot);render(next);});
  return {render};
}};
