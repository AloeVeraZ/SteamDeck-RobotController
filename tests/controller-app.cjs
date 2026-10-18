'use strict';
// Native website check: the robot reads the real, remapped Gamepad API.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,what,ms=8000){const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch{}await wait(50);}throw Error('Timed out: '+what);}
class Cdp{
 constructor(url){this.ws=new WebSocket(url);this.id=0;this.pending=new Map();this.ready=new Promise(r=>this.ws.onopen=r);this.ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id){this.pending.get(d.id)?.(d);this.pending.delete(d.id);}};}
 async eval(expression){const id=++this.id,r=await new Promise(resolve=>{this.pending.set(id,resolve);this.ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});if(r.result?.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
}
(async()=>{
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Robot gamepad fixture</title><h1>Robot controls</h1><script>window.connected=[];addEventListener("gamepadconnected",e=>connected.push(e.gamepad.index));setInterval(()=>window.sample=Array.from(navigator.getGamepads()).map(p=>p?{id:p.id,index:p.index,y:p.axes[1],a:p.buttons[0].pressed}:null),10);</script>');});
 await new Promise(r=>server.listen(0,'127.0.0.2',r));
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'deck-web-controllers-'));
 const env={...process.env,DECK_DATA_DIR:data,DECK_DEVICE_MODEL:'Steam Deck LCD',DECK_CONTROLLER_TEST:'1',DECK_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const app=spawn(process.env.DECK_ELECTRON||path.join(root,'.cache/runtime-win32-x64-44.8.0/electron.exe'),[root,'--remote-debugging-port=9334',...(env.DECK_ELECTRON_TEST_NO_SANDBOX==='1'?['--no-sandbox']:[])],{env,stdio:'ignore'});
 const targets=async()=>(await fetch('http://127.0.0.1:9334/json/list')).json();let L,W;
 const make=(id,index,y=0,pressed=false)=>({id,index,connected:true,mapping:'standard',axes:[0,y,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:pressed&&i===0,value:pressed&&i===0?1:0}))});
 const pads=[make('USB Xbox Controller',0,0.25),null,null,make('Steam Deck Controller',3,-0.5)];
 async function feed(){const capture=await L.eval('window.deck.controllerInfo().then(s=>!!s.capture)');for(const c of capture?[W,L]:[L,W])await c.eval('window.__deckGamepadTest.set('+JSON.stringify(pads)+')');}
 try{
  await until(async()=>{const t=(await targets()).find(t=>t.url.endsWith('ui/index.html'));if(t){L=new Cdp(t.webSocketDebuggerUrl);await L.ready;return true;}},'launcher',15000);
  await until(()=>L.eval('!!window.deck&&typeof state==="object"'),'launcher ready');
  await L.eval('window.deck.open('+JSON.stringify({url:`http://127.0.0.2:${server.address().port}`,name:'Web robot'})+')');
  await until(async()=>{const t=(await targets()).find(t=>t.url.startsWith('http://127.0.0.1:'));if(t){W=new Cdp(t.webSocketDebuggerUrl);await W.ready;return true;}},'robot view');
  await until(()=>W.eval('!!window.__deckGamepadTest'),'shared preload');await feed();
  await until(()=>W.eval('sample?.[0]?.y===-0.5&&sample[1]===null'),'built-in physical 3 mapped to logical 0');
  assert.equal(await W.eval('typeof require'), 'undefined');assert.equal(await W.eval('typeof window.deck'), 'undefined');
  assert.equal(await W.eval('sample[0].index'),0);assert.ok((await W.eval('connected')).includes(0));
  await L.eval('window.deck.page("settings")');await until(()=>W.eval('sample[0].y===0&&!sample[0].a'),'Settings pauses input');
  await L.eval('window.deck.page("drive")');await until(()=>W.eval('sample[0].y===-0.5'),'Drive restores input');
  await L.eval('document.querySelector("#controller-1").click()');await until(()=>L.eval('document.querySelector("#controller-dialog").open'),'capture dialog');
  pads[0]=make(pads[0].id,0);pads[3]=make(pads[3].id,3);await feed();pads[0]=make(pads[0].id,0,0,true);await feed();
  await until(async()=>!(await L.eval('document.querySelector("#controller-dialog").open')),'capture completes');
  await until(()=>W.eval('sample[0]?.id==="USB Xbox Controller"&&!sample[0].a&&sample[0].y===0'),'assignment press consumed by website');
  pads[0]=make(pads[0].id,0,0.5,true);await feed();await wait(100);assert.equal(await W.eval('sample[0].y'),0,'held controls leaked before neutral');
  pads[0]=make(pads[0].id,0);await feed();pads[0].axes[1]=0.25;await feed();await until(()=>W.eval('sample[0].y===0.25'),'manual C1 drives website');
  await L.eval('window.deck.save({...state.robot,controllerCount:2})');await feed();
  await until(()=>W.eval('sample[1]?.index===1'),'second logical slot enabled');
  await L.eval('document.querySelector("#controller-2").click()');await until(()=>L.eval('document.querySelector("#controller-dialog").open'),'C2 capture');
  pads[0]=make(pads[0].id,0);await feed();pads[0]=make(pads[0].id,0,0,true);await feed();await until(async()=>!(await L.eval('document.querySelector("#controller-dialog").open')),'C2 swap');
  pads[0]=make(pads[0].id,0);await feed();pads[0].axes[1]=0.25;pads[3].axes[1]=-0.5;await feed();
  await until(()=>W.eval('sample[0]?.y===-0.5&&sample[1]?.y===0.25'),'header swap affects actual website input');
  await L.eval('window.deck.save({...state.robot,controllerCount:1})');await feed();await until(()=>W.eval('sample[1]===null'),'single-controller mode hides User 2');
  const saved=JSON.parse(fs.readFileSync(path.join(data,'controller-settings.json')));assert.equal(saved[0].id,'Steam Deck Controller');assert.equal(saved[1].id,'USB Xbox Controller');
  console.log('PASS: native robot Gamepad API, built-in C1, optional C2, header click/press and swaps, consumed assignment press, Settings pause, saved preferences, renderer isolation.');
 }finally{L?.ws.close();W?.ws.close();app.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
