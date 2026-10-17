'use strict';
const path=require('node:path');
// Desktop FTC check: drives the real Electron app over CDP against the simulated Control Hub on 127.0.0.2.
// DECK_ELECTRON=path/to/electron node tests/ftc-app.cjs
const root=path.join(__dirname,'..'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os');
const {startUdpRobot}=require(path.join(root,'tools/ftc-sim.cjs'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=8000,what='condition'){const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch{}await wait(100);}throw Error('Timed out: '+what);}
class Cdp{constructor(url){this.ws=new WebSocket(url);this.id=0;this.cbs=new Map();this.ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&this.cbs.has(d.id)){this.cbs.get(d.id)(d);this.cbs.delete(d.id);}};this.ready=new Promise(r=>this.ws.onopen=r);}
  send(method,params={}){const id=++this.id;return new Promise(r=>{this.cbs.set(id,r);this.ws.send(JSON.stringify({id,method,params}));});}
  async eval(expr){const r=await this.send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails).slice(0,400));return r.result?.result?.value;}
  async shot(file){const r=await this.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(file,Buffer.from(r.result.data,'base64'));}}
async function targets(){return (await fetch('http://127.0.0.1:9333/json/list')).json();}
(async()=>{
  const robot=await startUdpRobot({address:'127.0.0.2'}),data=fs.mkdtempSync(path.join(os.tmpdir(),'deck-e2e-')),out=path.join(root,'test-results','ftc');fs.mkdirSync(out,{recursive:true});
  const app=spawn(process.env.DECK_ELECTRON||path.join(root,'.cache/runtime-win32-x64-44.8.0/electron.exe'),[root,'--remote-debugging-port=9333'],{env:(()=>{const e={...process.env,DECK_DATA_DIR:data};delete e.ELECTRON_RUN_AS_NODE;return e;})(),stdio:'ignore'});
  try{
    const launcherT=await until(async()=>(await targets()).find(t=>t.url.endsWith('ui/index.html')),15000,'launcher');const L=new Cdp(launcherT.webSocketDebuggerUrl);await L.ready;
    await until(()=>L.eval('typeof state==="object"&&!!document.querySelector("#wifi-summary")'),10000,'launcher ready');
    await L.eval(`window.deck.open({url:'127.0.0.2',name:'Practice Bot'})`);
    const dsT=await until(async()=>(await targets()).find(t=>t.url.includes('ui/ftc/index.html')),10000,'driver station view');const D=new Cdp(dsT.webSocketDebuggerUrl);await D.ready;
    await until(()=>D.eval(`document.querySelector('#link-text').textContent==='Robot Connected'&&document.querySelector('#config').textContent==='competition'`),8000,'DS connected');
    console.log('launcher state:',JSON.stringify(await L.eval('({kind:state.kind,title:state.title,url:state.url,robot:state.robot?.kind})')));
    console.log('DS:',await D.eval(`[...document.querySelectorAll('#ds-name,#link-text,#network,#ping,#volts,#volts-min,#config,#ds-battery-text')].map(e=>e.textContent).join(' | ')`));
    await D.eval(`document.querySelector('#teleop-list').click();[...document.querySelectorAll('#picker-list button')].find(b=>b.textContent.startsWith('Field Centric')).click();`);await wait(200);await D.eval(`document.querySelector('#main-action').click()`);
    await until(()=>robot.sim.opState==='init',5000,'robot init');
    await D.eval(`document.querySelector('#main-action').click()`);await until(()=>robot.sim.opState==='running',5000,'robot running');
    await wait(500);await D.shot(path.join(out,'ds-running.png'));await L.shot(path.join(out,'launcher-running.png'));
    // Settings keeps the robot connected and running; Drive shows it again.
    await L.eval(`document.querySelector('#settings-tab').click()`);await wait(2600);
    if(robot.sim.opState!=='running'||!robot.sim.peer)throw Error('Settings disconnected or stopped the robot');
    console.log('after settings 2.6s: sim',robot.sim.opState,'peer',robot.sim.peer,'| launcher url',await L.eval('state.url'),'| DS active input',await D.eval('document.querySelector("#link-text").textContent'));
    await L.eval(`document.querySelector('#drive-tab').click()`);await wait(300);
    const hb=robot.sim.heartbeats;await wait(1000);const rate=robot.sim.heartbeats-hb;console.log('heartbeats/s while shown:',rate);if(rate<6)throw Error('heartbeat rate too low');
    // Close robot: STOP is sent before the socket closes.
    await L.eval(`document.querySelector('#close-page').click()`);await until(()=>robot.sim.opState==='stopped',3000,'stop on close');console.log('close sent stop: sim',robot.sim.opState,robot.sim.opMode);
    const saved=JSON.parse(fs.readFileSync(path.join(data,'robots.json'),'utf8')).robots;console.log('saved:',JSON.stringify(saved.map(r=>({name:r.name,url:r.url,kind:r.kind}))));
    // Reopen from the library: no probe needed, straight to the station.
    await L.eval(`window.deck.open({id:${JSON.stringify(saved[0].id)}})`);await until(async()=>(await targets()).some(t=>t.url.includes('ui/ftc/index.html')),5000,'reopen');
    console.log('PASS');
  }catch(e){console.error('FAIL',e.message);process.exitCode=1;}
  finally{app.kill();await robot.close();}
})();
