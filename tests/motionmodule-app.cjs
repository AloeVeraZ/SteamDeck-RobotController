'use strict';
// Cross-repository check against MotionModule's actual HTML, scripts and Flask API.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,what,ms=8000){const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch{}await wait(50);}throw Error('Timed out: '+what);}
class Cdp{constructor(url){this.ws=new WebSocket(url);this.id=0;this.pending=new Map();this.ready=new Promise(r=>this.ws.onopen=r);this.ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id){this.pending.get(d.id)?.(d);this.pending.delete(d.id);}};}async eval(expression){const id=++this.id,r=await new Promise(resolve=>{this.pending.set(id,resolve);this.ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});if(r.result?.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}}
(async()=>{
 const server=spawn(process.env.DECK_PYTHON||'python3',[path.join(__dirname,'motionmodule-server.py')],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});let url='',stderr='';server.stderr.on('data',d=>stderr+=d);server.stdout.on('data',d=>{for(const line of d.toString().split(/\r?\n/)){try{url=JSON.parse(line).url||url;}catch{}}});let app,L,W;
 try{
  await until(()=>url,'MotionModule simulator: '+stderr,15000);
  const env={...process.env,DECK_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'deck-motionmodule-')),DECK_DEVICE_MODEL:'Steam Deck LCD',DECK_CONTROLLER_TEST:'1',DECK_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;
  app=spawn(process.env.DECK_ELECTRON||path.join(root,'.cache/runtime-win32-x64-44.8.0/electron.exe'),[root,'--remote-debugging-port=9335',...(env.DECK_ELECTRON_TEST_NO_SANDBOX==='1'?['--no-sandbox']:[])],{env,stdio:'ignore'});
  const targets=async()=>(await fetch('http://127.0.0.1:9335/json/list')).json();
  await until(async()=>{const t=(await targets()).find(t=>t.url.endsWith('ui/index.html'));if(t){L=new Cdp(t.webSocketDebuggerUrl);await L.ready;return true;}},'launcher',15000);
  await until(()=>L.eval('!!window.deck&&typeof state==="object"'),'launcher ready');await L.eval('window.deck.open('+JSON.stringify({url,name:'MotionModule'})+')');
  await until(async()=>{const t=(await targets()).find(t=>t.url.startsWith('http://127.0.0.1:'));if(t){W=new Cdp(t.webSocketDebuggerUrl);await W.ready;return true;}},'actual MotionModule driver station');
  await until(()=>W.eval('typeof connected!=="undefined"&&connected'),'MotionModule telemetry');
  const pad=(id,index)=>({id,index,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
  const pads=[pad('USB Xbox Controller',0),null,null,pad('Steam Deck Controller',3)];
  const feed=async()=>{const parent=await L.eval('window.deck.controllerInfo().then(s=>!!s.capture||s.paused)');for(const c of parent?[W,L]:[L,W])await c.eval('window.__deckGamepadTest.set('+JSON.stringify(pads)+')');};await feed();
  await until(()=>W.eval('activePad()?.id==="Steam Deck Controller"'),'built-in Controller 1 at logical 0');
  // Older robot pages used a confirmation checkbox; current MotionModule owns
  // a direct Enable action. Exercise either existing robot UI without changing it.
  const enable=()=>W.eval('(()=>{const confirm=document.querySelector("#armConfirm");if(confirm){confirm.checked=true;confirm.dispatchEvent(new Event("change"));}document.querySelector("#enableButton").click();})()');
  await enable();await until(()=>W.eval('armed'),'MotionModule enabled');
  const state=async()=>(await fetch(new URL('/__test_state',url))).json();
  pads[3].axes=[0.6,-0.7,0.5,0];await feed();
  await until(async()=>{const s=await state();return s.commands.some(c=>c.forward>0.6&&c.strafe>0.5&&c.rotate< -0.4)&&Object.values(s.outputs).some(v=>Math.abs(v)>0);},'actual left-stick forward/strafe and right-stick rotation commands');
  assert.equal((await state()).hardware,false,'simulator must never open GPIO');
  await L.eval('document.querySelector("#controller-1").click()');await until(async()=>Object.values((await state()).outputs).every(v=>v===0),'opening input test stops MotionModule outputs');
  await until(()=>L.eval('document.querySelector("#controller-axis-2").textContent==="0.50"'),'raw right-stick diagnostic');
  await L.eval('document.querySelector("#controller-done").click()');
  // Re-enable deliberately after the robot page's own focus safety stop.
  pads[3].axes=[0,0,0,0];await feed();await enable();
  pads[3].axes=[0,-0.5,0,0];await feed();await until(async()=>Object.values((await state()).outputs).some(v=>v!==0),'robot resumed with gamepad input');
  pads[3].axes=[0,0,0,0];pads[3].buttons[13]={pressed:true,value:1};await feed();
  await until(()=>W.eval('!armed'),'MotionModule configured D-pad stop button');await until(async()=>Object.values((await state()).outputs).every(v=>v===0),'robot outputs stopped');
  // An external USB/Bluetooth-style standard pad can replace built-in C1.
  await L.eval('document.querySelector("#controller-1").click()');await L.eval('document.querySelector("#controller-assign").click()');
  pads[3].buttons[13]={pressed:false,value:0};await feed();pads[0].buttons[0]={pressed:true,value:1};await feed();
  await until(()=>L.eval('window.deck.controllerInfo().then(s=>!s.capture&&s.slots[0].index===0)'),'external controller assignment');
  pads[0].buttons[0]={pressed:false,value:0};await feed();await L.eval('document.querySelector("#controller-done").click()');await enable();
  pads[0].axes=[0.4,-0.6,-0.7,0];await feed();
  await until(async()=>{const s=await state(),c=s.commands.at(-1);return c.forward>0.5&&c.strafe>0.3&&c.rotate>0.6&&Object.values(s.outputs).some(v=>v!==0);},'external controller drives actual MotionModule');
  pads[0].buttons[13]={pressed:true,value:1};await feed();await until(()=>W.eval('!armed'),'external controller stop');
  console.log('PASS: actual MotionModule Flask app and driver page, Deck default C1 and external controller reassignment, left-stick forward/strafe, right-stick turn, real /api/drive, simulated motors, diagnostic pause, robot-owned stop button.');
 }catch(error){console.error(stderr.slice(-2000));throw error;}
 finally{L?.ws.close();W?.ws.close();app?.kill();server.kill();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
