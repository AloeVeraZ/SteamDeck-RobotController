'use strict';
const {contextBridge,ipcRenderer}=require('electron');
if(window.top===window&&!process.argv.includes('--deck-controller-shell')){
 // With the on-screen keyboard turned off in Settings, fields keep their own inputmode so the
 // system keyboard (Steam, Windows touch keyboard) can be used instead.
 let enabled=!process.argv.includes('--deck-touch-keyboard-off');
 ipcRenderer.on('deck-touch-keyboard-enabled',(_event,value)=>{enabled=value!==false;});
 contextBridge.exposeInMainWorld('__deckTouchKeyboard',{show:()=>ipcRenderer.send('robot-touch-keyboard',true),hide:()=>ipcRenderer.send('robot-touch-keyboard',false),enabled:()=>enabled});
 contextBridge.executeInMainWorld({func:handheld=>{
  const bridge=window.__deckTouchKeyboard;
  const editable=target=>target instanceof HTMLElement&&!target.disabled&&!target.readOnly&&(target.isContentEditable||target.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=color]):not([type=button]):not([type=submit]):not([type=hidden]):not([type=date]):not([type=time])'));
  const previous=new WeakMap();let active=null;
  const touch=event=>['touch','pen'].includes(event.pointerType)||event.sourceCapabilities?.firesTouchEvents||((handheld||navigator.maxTouchPoints>0||matchMedia('(any-pointer: coarse)').matches)&&event.pointerType==='mouse');
  function restore(){if(active){const mode=previous.get(active);if(mode===null)active.removeAttribute('inputmode');else if(mode!==undefined)active.setAttribute('inputmode',mode);}active=null;}
  document.addEventListener('pointerdown',event=>{if(!bridge.enabled()){restore();return;}if(event.isTrusted&&touch(event)&&editable(event.target)){restore();active=event.target;previous.set(active,active.getAttribute('inputmode'));active.setAttribute('inputmode','none');}});
  document.addEventListener('click',event=>{if(!event.isTrusted||!touch(event))return;if(bridge.enabled()&&editable(event.target))bridge.show();else{restore();bridge.hide();}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){restore();bridge.hide();}});
 },args:[process.argv.includes('--deck-touch-first')]});
}
