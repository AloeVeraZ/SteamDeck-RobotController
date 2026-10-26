'use strict';
// Only the persistent station receives fixture OS reports. Every new robot
// document starts with an empty native Gamepad API and gets station output.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {_electron}=require(process.env.DECK_PLAYWRIGHT||'playwright'),root=path.join(__dirname,'..');
const make=(id,index,y=0)=>({id,index,mapping:'standard',connected:true,axes:[0,y,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:i===0,value:i===0?1:i===6?.612345:0,touched:i===0||i===6}))});
(async()=>{
  const html='<!doctype html><title>Controller session fixture</title><h1>Simulated robot</h1><script>window.connections=[];addEventListener("load",()=>addEventListener("gamepadconnected",e=>{connections.push(e.gamepad.index);if(e.gamepad.index===0)window.retained=e.gamepad}));setInterval(()=>window.sample=Array.from(navigator.getGamepads()).map(p=>p?{id:p.id,y:p.axes[1],trigger:p.buttons[6].value,triggerPressed:p.buttons[6].pressed,a:p.buttons[0].pressed}:null),10);</script>';
  const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.2',r));
  const env={...process.env,DECK_HEADLESS:'1',DECK_CONTROLLER_TEST:'1',DECK_DEVICE_MODEL:'Steam Deck LCD',DECK_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'deck-controller-session-'))};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:process.env.DECK_ELECTRON,args:[root,...(env.DECK_ELECTRON_TEST_NO_SANDBOX==='1'?['--no-sandbox']:[])],env});
  try{
    const station=await app.firstWindow();station.setDefaultTimeout(15000);await station.waitForFunction(()=>!!window.__deckGamepadTest&&typeof hardware==='object'&&hardware.model==='Steam Deck LCD');
    let pads=[make('USB controller',0,.234567),null,null,make('Steam Deck Controller',3,-.678901)];
    const feed=()=>station.evaluate(p=>window.__deckGamepadTest.set(p),pads);await feed();await station.waitForFunction(()=>window.deck.controllerInfo().then(s=>s.slots[0]?.index===3&&s.slots[1]?.index===0));
    await station.evaluate(url=>window.deck.open({url,name:'Session robot',controllerCount:2}),`http://127.0.0.2:${server.address().port}/`);await station.waitForFunction(()=>state.url&&!state.loading);
    let robot=app.context().pages().find(p=>p.url().startsWith('http://127.0.0.1:'));assert.ok(robot);robot.setDefaultTimeout(15000);
    const check=async()=>{await robot.waitForFunction(()=>sample?.[0]?.y===-.678901&&sample[1]?.y===.234567);assert.equal(await robot.evaluate(()=>sample[0].trigger),.612345);assert.equal(await robot.evaluate(()=>sample[0].triggerPressed),false);await robot.waitForFunction(()=>connections.includes(0)&&connections.includes(1));assert.equal(await robot.evaluate(()=>typeof window.__deckControllerInput.report),'undefined');assert.equal(await robot.evaluate(()=>typeof window.__deckControllerInput.state().readings),'undefined');};
    await check();
    for(let i=0;i<3;i++){await Promise.all([robot.waitForEvent('load'),station.evaluate(()=>window.deck.reload())]);await check();assert.deepEqual(await station.evaluate(()=>window.deck.controllerInfo().then(s=>s.slots.map(p=>p.index))),[3,0]);assert.ok(!(await station.locator('#controller-1 small').textContent()).includes('Set up'));}
    await robot.goto(new URL('/next',robot.url()).href);await check();
    // A retained Gamepad and button array remain live, not a stale snapshot.
    pads[3].axes[1]=-.123456;pads[3].buttons[0]={value:0,pressed:false,touched:false};await feed();await robot.waitForFunction(()=>retained.axes[1]===-.123456&&!retained.buttons[0].pressed);
    pads[3].axes[1]=-.678901;await feed();
    await station.evaluate(()=>window.deck.page('settings'));await robot.waitForFunction(()=>sample[0].y===0&&!sample[0].a);assert.ok(await robot.evaluate(()=>window.__deckControllerInput.state().pads.every(p=>p.axes.every(v=>v===0)&&p.buttons.every(b=>b.value===0&&!b.pressed))));await station.evaluate(()=>window.deck.page('drive'));await check();
    const id=await station.evaluate(()=>state.robot.id);await station.evaluate(()=>window.deck.close());assert.deepEqual(await station.evaluate(()=>window.deck.controllerInfo().then(s=>s.slots.map(p=>p.index))),[3,0]);await station.evaluate(id=>window.deck.open({id}),id);await station.waitForFunction(()=>state.url&&!state.loading);robot=app.context().pages().find(p=>p.url().startsWith('http://127.0.0.1:'));robot.setDefaultTimeout(15000);await check();
    // A robot document cannot erase the source by seeing no native devices.
    await robot.evaluate(()=>window.__deckGamepadTest.set([]));await check();
    await station.evaluate(()=>window.__deckGamepadTest.pauseReporting(true));await robot.waitForFunction(()=>sample[0]===null&&sample[1]===null);await station.evaluate(()=>window.__deckGamepadTest.pauseReporting(false));await check();
    pads=[];await feed();await robot.waitForFunction(()=>sample[0]===null&&sample[1]===null);assert.equal(await robot.evaluate(()=>retained.connected),false);assert.equal(await robot.evaluate(()=>retained.axes[1]),0);
    pads=[make('USB controller',0,.234567),null,null,make('Steam Deck Controller',3,-.678901)];await feed();await check();
    // A manually swapped pair must survive reload just like automatic slots.
    await station.evaluate(()=>window.deck.controllerCapture(1));for(const pad of pads.filter(Boolean)){pad.axes=[0,0,0,0];pad.buttons=pad.buttons.map(()=>({value:0,pressed:false,touched:false}));}await feed();pads[0].buttons[0]={value:1,pressed:true,touched:true};await feed();await station.waitForFunction(()=>window.deck.controllerInfo().then(s=>!s.capture&&s.slots[0]?.index===0));pads[0].buttons[0]={value:0,pressed:false,touched:false};await feed();await station.locator('#controller-done').click();pads[0].axes[1]=.234567;pads[3].axes[1]=-.678901;await feed();await Promise.all([robot.waitForEvent('load'),station.evaluate(()=>window.deck.reload())]);await robot.waitForFunction(()=>sample?.[0]?.id==='USB controller'&&sample[0].y===.234567&&sample[1]?.y===-.678901);assert.deepEqual(await station.evaluate(()=>window.deck.controllerInfo().then(s=>s.slots.map(p=>p.index))),[0,3]);
    console.log('PASS: station-only reports survive three robot reloads, navigation and close/reopen; post-load connection events; both slots/analog precision/live cached Gamepads; robot cannot report inputs; paused IPC neutral; source-loss watchdog; true disconnect/reconnect. No robot-page activation or reassignment.');
  }finally{await app.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
