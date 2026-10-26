'use strict';
// Inject standardized reports at the OS/Gamepad boundary. This exercises the
// actual sandbox preload and robot Gamepad API, not Bluetooth or hardware drivers.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {_electron}=require(process.env.DECK_PLAYWRIGHT||'playwright');
const {profiles}=require('./fixtures/controller-profiles.json');
const root=path.join(__dirname,'..');
const pad=(id,index,mapping='standard')=>({id,index,mapping,connected:true,axes:[-.75,.4,.6,-.2],buttons:Array.from({length:17},(_,i)=>({pressed:i===0||i===15,value:i===0||i===15?1:i===6?.65:0}))});
(async()=>{
 const server=http.createServer((_q,r)=>{r.setHeader('Content-Type','text/html');r.end('<!doctype html><title>Controller compatibility fixture</title><script>setInterval(()=>window.sample=Array.from(navigator.getGamepads()).map(p=>p?{id:p.id,index:p.index,mapping:p.mapping,axes:Array.from(p.axes),buttons:Array.from(p.buttons,b=>({value:b.value,pressed:b.pressed}))}:null),10)</script>');});await new Promise(r=>server.listen(0,'127.0.0.2',r));
 const env={...process.env,DECK_HEADLESS:'1',DECK_CONTROLLER_TEST:'1',DECK_DEVICE_MODEL:'Windows desktop',DECK_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'deck-pad-compat-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.DECK_ELECTRON,args:[root,...(env.DECK_ELECTRON_TEST_NO_SANDBOX==='1'?['--no-sandbox']:[])],env});
 try{
  const launcher=await app.firstWindow();await launcher.waitForFunction(()=>typeof state==='object'&&!!window.deck);
  await launcher.evaluate(url=>window.deck.open({url,name:'Controller fixture',controllerCount:2}),`http://127.0.0.2:${server.address().port}`);await launcher.waitForFunction(()=>state.url&&!state.loading);
  const robot=app.context().pages().find(p=>p.url().startsWith('http://127.0.0.1:'));assert.ok(robot);await robot.waitForFunction(()=>!!window.__deckGamepadTest);
  const feed=async pads=>{await launcher.evaluate(p=>window.__deckGamepadTest.set(p),pads);await robot.evaluate(p=>window.__deckGamepadTest.set(p),pads);};
  for(const profile of profiles){
   const primary=pad(profile.id,3),secondary=pad('External generic gamepad',5);await feed([null,null,null,primary,null,secondary]);
   await robot.waitForFunction(id=>window.sample?.[0]?.id===id&&sample[1]?.id==='External generic gamepad',profile.id);
   const actual=await robot.evaluate(()=>window.sample.slice(0,2));
   for(const [i,expected] of [primary,secondary].entries())assert.deepEqual(actual[i],{id:expected.id,index:i,mapping:'standard',axes:expected.axes,buttons:expected.buttons});
  }
  // Exercise raw-layout protection even when the user manually selects it.
  const raw=pad('Raw DirectInput pad',3,'');await feed([null,null,null,raw]);await launcher.locator('#controller-1').click();await launcher.evaluate(()=>window.deck.controllerCapture(1));
  await feed([null,null,null,{...raw,buttons:raw.buttons.map(()=>({pressed:false,value:0}))}]);await feed([null,null,null,raw]);
  await launcher.waitForFunction(()=>document.querySelector('#controller-monitor-state').textContent.includes('Layout not mapped'));
  assert.equal(await launcher.locator('.input-button').first().locator('span').textContent(),'Raw button 0');await launcher.locator('#controller-done').click();
  await robot.waitForFunction(()=>sample?.[0]?.mapping==='');assert.ok(await robot.evaluate(()=>sample[0].axes.every(v=>v===0)&&sample[0].buttons.every(b=>!b.pressed&&b.value===0)));
  // Reconnect in a mapped mode and verify diagnostics use the physical labels.
  await feed([]);const nintendo=pad('Pro Controller (Vendor: 057e Product: 2009)',7);await feed(Array.from({length:8},(_,i)=>i===7?nintendo:null));
  await robot.waitForFunction(()=>sample?.[0]?.id.includes('057e')&&sample[0].axes[0]===-.75);
  await launcher.locator('#controller-1').click();await launcher.waitForFunction(()=>document.querySelector('#controller-monitor-name').textContent==='Nintendo Switch Pro controller');
  assert.equal(await launcher.locator('[data-pad-button="0"] text').textContent(),'B');assert.equal(await launcher.locator('.input-button').first().locator('span').textContent(),'B · South');
  await launcher.locator('#controller-done').click();await launcher.evaluate(()=>window.deck.close());
  console.log('PASS: 100 source-documented synthetic standard reports through native Electron robot input; 4 axes, 17 button values/press states, C1/C2 routing; raw layout held neutral; reconnect and Nintendo physical labels. Hardware pairing/driver mapping not simulated.');
 }finally{await app.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
