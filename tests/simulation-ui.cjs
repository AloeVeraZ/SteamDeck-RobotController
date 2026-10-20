'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require(process.env.DECK_PLAYWRIGHT||'playwright'),{startUdpRobot}=require('../tools/ftc-sim.cjs');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results/simulation');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'deck-simulation-')),env={...process.env,DECK_HEADLESS:'1',DECK_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.DECK_ELECTRON,args:[root,...(env.DECK_ELECTRON_TEST_NO_SANDBOX==='1'?['--no-sandbox']:[])],env});
 let fixture;
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>typeof state==='object'&&!!hardware.model);
  await page.locator('#more').click();await page.locator('#menu-simulation').click();await page.locator('#simulation-field').waitFor({state:'visible'});
  const graph=page.locator('#simulation-field'),pose=()=>page.evaluate(()=>JSON.parse(localStorage.getItem(DeckField.KEY))?.start||null);
  const point=async(x,y)=>graph.evaluate((element,{x,y})=>{const p=element.createSVGPoint();p.x=x;p.y=144-y;const result=p.matrixTransform(element.getScreenCTM());return {x:result.x,y:result.y};},{x,y});
  const move=async(x,y)=>{const p=await point(x,y);await page.mouse.move(p.x,p.y);};
  const click=async(x,y)=>{const p=await point(x,y);await page.mouse.click(p.x,p.y);};
  assert.equal(await graph.getAttribute('data-placing'),'true');assert.equal(await pose(),null);assert.equal(await page.locator('#start-x').inputValue(),'9');
  await move(50,100);assert.match(await page.locator('#field-coordinates').textContent(),/X 50 in · Y 100 in/);assert.equal(await pose(),null,'hover must not save the draft');
  await click(50,100);let saved=await pose();assert.ok(Math.abs(saved.x-50)<.1&&Math.abs(saved.y-100)<.1);assert.equal(await graph.getAttribute('data-placing'),'false');
  await move(80,80);assert.deepEqual(await pose(),saved,'cursor movement changed the locked pose');
  await page.locator('#start-place').click();await move(80,80);await page.keyboard.press('Escape');assert.deepEqual(await pose(),saved);
  await page.locator('#start-x').fill('37.25');await page.locator('#start-y').fill('82.75');await page.locator('#start-heading').fill('90');await page.locator('#start-form button').click();assert.deepEqual(await pose(),{x:37.25,y:82.75,heading:90});
  await page.locator('#start-x').fill('0');await page.locator('#start-form button').click();assert.match(await page.locator('#start-status').textContent(),/footprint/);assert.equal((await pose()).x,37.25);
  await page.locator('#start-edge').click();assert.match(await page.locator('#field-coordinates').textContent(),/X 9 in · Y 72 in/);await page.keyboard.press('Enter');assert.deepEqual(await pose(),{x:9,y:72,heading:90});
  await page.evaluate(()=>window.deck.controllerSource('keyboard'));await page.waitForFunction(()=>!window.__deckControllerInput.state().keyboardKeys.length);assert.equal(await page.evaluate(()=>window.__deckControllerInput.state().paused),true);
  await page.locator('#start-place').click();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');assert.deepEqual(await pose(),{x:10,y:73,heading:90});
  // Actual touch events exercise drag placement and SVG screen transforms.
  const touch=await page.context().newCDPSession(page);await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await page.locator('#start-place').click();
  const a=await point(40,40),b=await point(110,60);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  saved=await pose();assert.ok(Math.abs(saved.x-110)<.5&&Math.abs(saved.y-60)<.5);
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await page.reload();await page.waitForFunction(()=>typeof hardware==='object'&&!!hardware.model);await page.evaluate(()=>window.deck.page('simulation'));await graph.waitFor({state:'visible'});assert.deepEqual(await pose(),saved);assert.equal(await graph.getAttribute('data-placing'),'false');
  console.log('PASS: cursor, numeric, keyboard, touch and persistence checks.');
  const win=await app.browserWindow(page);
  for(const [width,height,name] of [[1280,800,'steamdeck-lcd'],[1280,720,'steamdeck-oled'],[800,600,'small-landscape'],[390,844,'narrow']]){
    await win.evaluate((w,size)=>{w.setMinimumSize(0,0);w.setContentSize(...size);},[width,height]);await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow at '+name);
    console.log('Checking layout: '+name);
    if(width>=800)await page.screenshot({path:path.join(out,name+'.png'),fullPage:true,scale:'css',timeout:15000});
  }
  await win.evaluate(w=>w.setContentSize(1280,800));
  // Entry disconnects an existing FTC station; automatic reconnect cannot hijack this view.
  fixture=await startUdpRobot({address:'127.0.0.2'});await page.evaluate(()=>window.deck.open({url:'127.0.0.2',kind:'ftc',name:'Field test fixture'}));await page.waitForFunction(()=>state.kind==='ftc'&&!state.loading);
  const station=app.context().pages().find(p=>p.url().includes('ui/ftc/index.html'));await station.waitForFunction(()=>document.querySelector('#link-text').textContent==='Robot Connected');
  fixture.sim.setOpMode('Field Centric TeleOp','running');await station.waitForFunction(()=>document.body.dataset.robotState==='running');
  await page.evaluate(()=>window.deck.page('simulation'));assert.equal(fixture.sim.opState,'stopped');assert.equal(await page.evaluate(()=>state.url),'');assert.equal(await page.evaluate(()=>state.page),'simulation');
  assert.equal(app.context().pages().filter(p=>p.url().includes('ui/ftc/index.html')).length,0);
  await page.evaluate(()=>window.deck.network());await page.waitForTimeout(5200);assert.equal(await page.evaluate(()=>state.page),'simulation');assert.deepEqual(errors,[]);
  // An in-flight connection probe must not reopen Drive after choosing Simulation.
  await page.evaluate(()=>{window.pendingOpen=window.deck.open({url:'127.0.0.3',kind:'auto',name:'Pending fixture'});});await page.waitForFunction(()=>state.loading);
  await page.evaluate(()=>window.deck.page('simulation'));await page.evaluate(()=>window.pendingOpen);assert.equal(await page.evaluate(()=>state.page),'simulation');assert.equal(await page.evaluate(()=>state.url),'');
  console.log('PASS: edge default, cursor preview, click/keyboard/touch placement, numeric validation, persisted pose, responsive field, keyboard controller isolation and FTC disconnect.');
 }finally{await app.close();if(fixture)await fixture.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
