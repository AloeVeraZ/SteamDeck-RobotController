'use strict';
// Data-only input bridge. Robot content never receives Node, settings IPC, or
// permission to change assignments; capture requests belong to the app window.
const {contextBridge,ipcRenderer}=require('electron');
if(window.top===window){
  let config={count:1,slots:[null,null],blocked:[],paused:true,capture:null};const listeners=new Set();
  ipcRenderer.on('controller-config',(_event,value)=>{config=value;for(const listener of listeners)listener(value);});
  contextBridge.exposeInMainWorld('__deckControllerInput',{state:()=>config,report:pads=>ipcRenderer.send('controller-input',pads),onState:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}});
  contextBridge.executeInMainWorld({func:(fixtures,shell)=>{
    const input=window.__deckControllerInput;let config=input.state(),raw=()=>Array.from(original()||[]),lastReport='',previous=[null,null];
    const original=navigator.getGamepads?.bind(navigator)||(()=>[]);
    const getRaw=()=>{try{return raw();}catch{return [];}};
    const projected=()=>{
      // Dashboard navigation belongs to touch/mouse/keyboard. Raw reporting
      // below still feeds assignment diagnostics without exposing gamepads here.
      if(shell)return [null,null,null,null];
      const pads=getRaw();return [0,1,2,3].map(slot=>{
        const selected=slot<config.count?config.slots[slot]:null,p=selected&&pads.find(p=>p?.connected&&p.index===selected.index&&p.id===selected.id);if(!p)return null;
        // Never guess raw DirectInput/HID indices. Chromium maps recognized
        // USB/Bluetooth layouts to standard; raw devices remain diagnostic only.
        const rest=p.mapping!=='standard'||config.paused||config.capture||config.blocked.includes(`${p.index}:${p.id}`);
        return new Proxy(p,{get:(target,property)=>property==='index'?slot:property==='axes'&&rest?Array.from(target.axes||[],()=>0):property==='buttons'&&rest?Array.from(target.buttons||[],b=>({pressed:false,touched:false,value:0})):Reflect.get(target,property,target)});
      });
    };
    const quantize=(value,min=0)=>Number.isFinite(value)?Math.round(Math.max(min,Math.min(1,value))*100)/100:0;
    function report(force=false){const summary=getRaw().filter(p=>p?.connected).slice(0,16).map(p=>({id:p.id,index:p.index,mapping:p.mapping,connected:true,pressed:p.buttons?.some(b=>b.pressed||b.value>0.2)||false,axesActive:p.axes?.some(v=>Math.abs(v)>0.08)||false,axes:Array.from(p.axes||[]).slice(0,4).map(v=>quantize(v,-1)),buttons:Array.from(p.buttons||[]).slice(0,24).map(b=>quantize(typeof b==='number'?b:b.value))}));const signature=JSON.stringify(summary);if(force||signature!==lastReport){lastReport=signature;input.report(summary);}}
    function events(){const current=projected();for(let slot=0;slot<2;slot++){const p=current[slot],old=previous[slot];if(old?.id!==p?.id||old?.source!==config.slots[slot]?.index){if(old){const event=new Event('gamepaddisconnected');Object.defineProperty(event,'gamepad',{value:old.pad});window.dispatchEvent(event);}if(p){const event=new Event('gamepadconnected');Object.defineProperty(event,'gamepad',{value:p});window.dispatchEvent(event);}}previous[slot]=p?{id:p.id,source:config.slots[slot]?.index,pad:p}:null;}}
    // Replace only gamepad enumeration. The robot's own page, API and controls stay intact.
    Object.defineProperty(navigator,'getGamepads',{value:projected,configurable:true});
    for(const name of ['gamepadconnected','gamepaddisconnected'])window.addEventListener(name,event=>{if(event.isTrusted){event.stopImmediatePropagation();report(true);}},true);
    input.onState(next=>{config=next;events();report(true);});setInterval(()=>report(),20);report(true);
    if(fixtures)Object.defineProperty(window,'__deckGamepadTest',{value:{set:pads=>{raw=()=>pads;report(true);},reset:()=>{raw=()=>Array.from(original()||[]);report(true);}}});
  },args:[process.argv.includes('--deck-controller-fixtures'),process.argv.includes('--deck-controller-shell')]});
  ipcRenderer.send('controller-ready');
}
