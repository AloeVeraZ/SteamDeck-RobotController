'use strict';
// The persistent station owns OS polling. Robot documents receive gated logical
// gamepads, so navigation cannot reset discovery or require another activation.
const {contextBridge,ipcRenderer}=require('electron');
if(window.top===window){
  const shell=process.argv.includes('--deck-controller-shell');
  let config={count:1,slots:[null,null],pads:[null,null],paused:true};const listeners=new Set();
  ipcRenderer.on('controller-config',(_event,value)=>{config=value;for(const listener of listeners)listener(value);});
  const bridge={state:()=>config,onState:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  if(shell)bridge.report=pads=>ipcRenderer.send('controller-input',pads);
  contextBridge.exposeInMainWorld('__deckControllerInput',bridge);
  contextBridge.executeInMainWorld({func:(fixtures,shell)=>{
    const input=window.__deckControllerInput,original=navigator.getGamepads?.bind(navigator)||(()=>[]);
    let config=input.state(),raw=()=>Array.from(original()||[]),lastReport='',lastSent=0,reporting=true,previous=[null,null],cache=[null,null],ready=document.readyState==='complete',timestamp=performance.now();
    const getRaw=()=>{try{return raw();}catch{return [];}};
    const identity=slot=>{const p=config.pads?.[slot],source=config.slots?.[slot];return p&&source?JSON.stringify([p.id,source.index,p.mapping,p.axes.length,p.buttons.length]):'';};
    function gamepad(slot){
      const owner=identity(slot);if(!owner)return null;if(cache[slot]?.owner===owner)return cache[slot].pad;
      const initial=config.pads[slot],data=()=>identity(slot)===owner?config.pads[slot]:null;
      const axes=Array.from({length:initial.axes.length},()=>0);axes.forEach((_,i)=>Object.defineProperty(axes,i,{get:()=>data()?.axes[i]||0,enumerable:true}));Object.freeze(axes);
      const buttons=Object.freeze(initial.buttons.map((_,i)=>Object.freeze({get value(){return data()?.buttons[i]?.value||0;},get pressed(){return !!data()?.buttons[i]?.pressed;},get touched(){return !!data()?.buttons[i]?.touched;}})));
      const native=()=>{const source=config.slots?.[slot];return data()&&getRaw().find(p=>p?.id===source.id&&p.index===source.index);};
      const pad=Object.freeze({id:initial.id,index:slot,mapping:initial.mapping,get connected(){return !!data();},get timestamp(){return timestamp;},axes,buttons,touches:Object.freeze([]),get vibrationActuator(){return native()?.vibrationActuator||null;},get hapticActuators(){return native()?.hapticActuators||Object.freeze([]);}});
      cache[slot]={owner,pad};return pad;
    }
    const projected=()=>shell?[null,null,null,null]:[gamepad(0),gamepad(1),null,null];
    function events(){if(!ready)return;const current=projected();for(let slot=0;slot<2;slot++){const p=current[slot],old=previous[slot],source=identity(slot);if(old?.source!==source||old?.id!==p?.id){if(old){const event=new Event('gamepaddisconnected');Object.defineProperty(event,'gamepad',{value:old.pad});window.dispatchEvent(event);}if(p){const event=new Event('gamepadconnected');Object.defineProperty(event,'gamepad',{value:p});window.dispatchEvent(event);}}previous[slot]=p?{id:p.id,source,pad:p}:null;}}
    const clamp=(v,min=0)=>Number.isFinite(v)?Math.max(min,Math.min(1,v)):0;
    function report(force=false){
      if(!shell||!reporting)return;
      const summary=getRaw().filter(p=>p?.connected).slice(0,16).map(p=>({id:p.id,index:p.index,mapping:p.mapping,connected:true,pressed:p.buttons?.some(b=>b.pressed||b.value>0.2)||false,axesActive:p.axes?.some(v=>Math.abs(v)>0.08)||false,axes:Array.from(p.axes||[]).slice(0,4).map(v=>clamp(v,-1)),buttons:Array.from(p.buttons||[]).slice(0,24).map(b=>clamp(typeof b==='number'?b:b.value)),buttonPressed:Array.from(p.buttons||[]).slice(0,24).map(b=>typeof b==='number'?b>.5:!!b.pressed),buttonTouched:Array.from(p.buttons||[]).slice(0,24).map(b=>typeof b==='number'?b>0:!!b.touched||b.value>0)}));
      const signature=JSON.stringify(summary),now=performance.now();if(force||signature!==lastReport||now-lastSent>=100){lastReport=signature;lastSent=now;input.report(summary);}
    }
    Object.defineProperty(navigator,'getGamepads',{value:projected,configurable:true});
    for(const name of ['gamepadconnected','gamepaddisconnected'])window.addEventListener(name,event=>{if(event.isTrusted){event.stopImmediatePropagation();report(true);}},true);
    input.onState(next=>{config=next;timestamp=performance.now();events();});
    // Dispatch after the page's load handlers have installed their listeners.
    if(!ready)window.addEventListener('load',()=>setTimeout(()=>{ready=true;events();},0),{once:true});else setTimeout(events,0);
    if(shell){setInterval(()=>report(),20);report(true);}
    if(fixtures)Object.defineProperty(window,'__deckGamepadTest',{value:{set:pads=>{raw=()=>pads;report(true);},reset:()=>{raw=()=>Array.from(original()||[]);report(true);},pauseReporting:paused=>{reporting=!paused;if(reporting)report(true);}}});
  },args:[process.argv.includes('--deck-controller-fixtures'),shell]});
  ipcRenderer.send('controller-ready');
}
