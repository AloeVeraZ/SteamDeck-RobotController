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
  // macOS can select the robot's loopback alias itself as the outgoing source.
  // Pin the station side of this two-host fixture to a different loopback address.
  await app.evaluate(({app})=>{const req=process.getBuiltinModule('node:module').createRequire(app.getAppPath()+'/package.json'),{FtcSocket}=req('./src/ftc.cjs'),open=FtcSocket.prototype.open;FtcSocket.prototype.open=function(){if(['127.0.0.2','127.0.0.3'].includes(this.host))this.localAddress='127.0.0.1';return open.call(this);};});
  await page.locator('#more').click();await page.locator('#menu-simulation').click();await page.locator('#simulation-field').waitFor({state:'visible'});
  const graph=page.locator('#simulation-field'),pose=()=>page.evaluate(()=>JSON.parse(localStorage.getItem(DeckField.KEY))?.start||null);
  const point=async(x,y)=>graph.evaluate((element,{x,y})=>{const p=element.createSVGPoint();p.x=x;p.y=144-y;const result=p.matrixTransform(element.getScreenCTM());return {x:result.x,y:result.y};},{x,y});
  const move=async(x,y)=>{const p=await point(x,y);await page.mouse.move(p.x,p.y);};
  const click=async(x,y)=>{const p=await point(x,y);await page.mouse.click(p.x,p.y);};
  assert.equal(await graph.getAttribute('data-placing'),'true');assert.equal(await pose(),null);assert.equal(await page.locator('#start-x').inputValue(),'7.5','default sim robot: 7.5 in rear overhang against the left wall');
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
  // ---- Path-planning simulator: zones, pins, automatic routes, test drives, run, export, robot model, 3D.
  await page.evaluate(()=>{localStorage.removeItem('deck-simulation-project-v2');localStorage.removeItem('deck-simulation-project-v1');});await page.reload();await page.waitForFunction(()=>typeof hardware==='object'&&!!hardware.model);await page.evaluate(()=>window.deck.page('simulation'));await graph.waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#sim-telemetry').children.length>0,null,{timeout:30000});
  await page.locator('#start-x').fill('20');await page.locator('#start-y').fill('72');await page.locator('#start-heading').fill('0');await page.locator('#start-form button').click();
  const layout=()=>page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('deck-simulation-project-v2'));return p.layouts.find(l=>l.id===p.active);});
  const dragOn=async(a,b)=>{const p=await point(...a),q=await point(...b);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:6});await page.mouse.up();};
  await page.locator('[data-tool=rect]').click();await dragOn([62,50],[82,95]);
  await page.locator('[data-tool=circle]').click();await dragOn([110,110],[118,110]);
  // Triangle: pressed at its base, the tip follows the cursor (here pointing right).
  await page.locator('[data-tool=triangle]').click();await dragOn([30,112],[50,112]);
  await page.locator('[data-tool=shape]').click();for(const [x,y] of [[30,20],[50,20],[40,34]])await click(x,y);await click(30,20);
  await page.locator('[data-tool=shape]').click();await click(96,24);await click(120,24);await graph.press('Enter');
  let zones=(await layout()).zones;assert.deepEqual(zones.map(z=>z.type),['rect','circle','triangle','polygon','polygon']);
  assert.ok(Math.abs(zones[0].width-20)<.6&&Math.abs(zones[1].radius-8)<.6);assert.ok(Math.abs(zones[2].angle-270)<1&&Math.abs(zones[2].height-20)<.6,'triangle tip points right');
  assert.equal(zones[3].points.length,3);assert.equal(zones[4].points.length,2,'two clicks make a wall line');
  // Select the circle and stretch it with its edge handle; edit the triangle numerically; delete the wall.
  await page.locator('[data-tool=select]').click();await click(110,110);await dragOn([118,110],[122,110]);assert.ok(Math.abs((await layout()).zones[1].radius-12)<.6,'circle resized by its handle');
  await click(40,112);await page.locator('#zone-angle').fill('30');await page.locator('#zone-angle').press('Enter');assert.equal((await layout()).zones[2].angle,30);
  await click(108,24);await page.keyboard.press('Delete');assert.equal((await layout()).zones.length,4);
  // Pins: the route plans itself, and a pause marks a stop.
  await page.locator('[data-tool=pin]').click();await click(124,72);await click(130,134);assert.equal((await layout()).pins.length,2);
  await page.locator('[data-tab=plan]').click();await page.waitForFunction(()=>/Route ready/.test(document.querySelector('#sim-plan-status').textContent)).catch(async e=>{throw Error('Plan: '+await page.locator('#sim-plan-status').textContent());});
  await page.locator('.pin-wait').first().fill('1');await page.locator('.pin-wait').first().press('Tab');await page.locator('.pin-action').first().fill('Intake');await page.locator('.pin-action').first().press('Tab');
  await page.waitForFunction(()=>/1 pause/.test(document.querySelector('#sim-plan-status').textContent));
  const route=(await layout()).route;assert.equal(route.style,'spline');assert.ok(route.stops[0].wait===1&&route.stops[0].action==='Intake');
  await page.locator('#sim-optimize').click();await page.waitForFunction(()=>/Fastest:/.test(document.querySelector('#sim-plan-status').textContent),null,{timeout:120000});
  console.log('PASS: find fastest route: '+(await page.locator('#sim-tested').innerText()).replace(/\n/g,' | '));
  // Export once with "keep updated": moving a pin rewrites the file.
  const exportFile=path.join(data,'PlannedRoute.java');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},exportFile);
  await page.locator('#sim-export-keep').check();await page.locator('#sim-export-java').click();await page.waitForFunction(()=>/Exported/.test(document.querySelector('#sim-export-status').textContent));
  const exported=fs.readFileSync(exportFile,'utf8');assert.match(exported,/public final class PlannedRoute/);assert.match(exported,/WAIT_SECONDS = \{1, 0\}/);assert.match(exported,/"Intake"/);
  await page.locator('[data-tool=select]').click();await dragOn([130,134],[126,132]);await page.waitForFunction(()=>/Updated/.test(document.querySelector('#sim-export-status').textContent),null,{timeout:15000});
  assert.notEqual(fs.readFileSync(exportFile,'utf8'),exported,'exported file follows the route');
  // Run the planned route with the real Pedro process; motion comes from the physics.
  await page.locator('[data-tab=run]').click();await page.locator('#sim-run').click();
  await page.waitForFunction(()=>/Finished/.test(document.querySelector('#sim-run-status').textContent),null,{timeout:90000});
  const report=await page.locator('#sim-run-status').textContent();assert.match(report,/No zones touched/);assert.ok(Number(/Ended ([\d.]+) in/.exec(report)[1])<1.5,report);
  console.log('PASS: route run: '+report);
  // Stop mid-run: the robot comes to rest and no stale reply restarts it.
  await page.locator('#sim-run').click();await page.waitForFunction(()=>/Running/.test(document.querySelector('#sim-run-status').textContent),null,{timeout:30000});await page.waitForTimeout(500);
  await page.locator('#sim-stop').click();await page.waitForFunction(()=>/Stopped/.test(document.querySelector('#sim-run-status').textContent));await page.waitForTimeout(1500);
  const robotRow=()=>page.evaluate(()=>[...document.querySelectorAll('#sim-telemetry dt')].find(d=>d.textContent==='Robot').nextElementSibling.textContent);
  assert.match(await robotRow(),/· 0\.0 in\/s$/);
  await page.locator('#sim-reset').click();await page.waitForFunction(()=>/Back at the starting pose/.test(document.querySelector('#sim-run-status').textContent));assert.match(await robotRow(),/^20\.0, 72\.0 in/);
  // A Java program with a compile error reports a readable diagnostic; the example runs.
  await page.locator('[data-program=source]').click();await page.locator('#sim-source').fill('import deck.sim.*;\npublic class Broken implements DeckAutonomous {\n public void init(SimRobot r) { int x = "no"; }\n public void loop(SimRobot r) {}\n}\n');
  await page.locator('#sim-run').click();await page.locator('#sim-error').waitFor({state:'visible',timeout:30000});assert.match(await page.locator('#sim-error').textContent(),/Compile error: Broken\.java:3/);
  await page.locator('#sim-java-example').click();await page.locator('#sim-run').click();await page.waitForFunction(()=>/Finished/.test(document.querySelector('#sim-run-status').textContent),null,{timeout:90000});
  console.log('PASS: Java program: '+await page.locator('#sim-run-status').textContent());
  // Manual driving with the keyboard moves the simulated robot, never a real one.
  await page.locator('[data-tool=drive]').click();const before=await robotRow();
  await page.keyboard.down('KeyW');await page.waitForTimeout(700);await page.keyboard.up('KeyW');await page.waitForTimeout(300);assert.notEqual(await robotRow(),before,'keyboard drive moved the robot');
  // Robot CAD: a STEP assembly becomes one body; the view cube sets which side is the front.
  const step=path.join(root,'.cache/simulation-deps/node_modules/occt-import-js/test/testfiles/cax-if/as1-oc-214.stp');
  if(fs.existsSync(step)){
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},step);
    await page.locator('[data-tab=setup]').click();const footprint=await page.locator('#sim-footprint').textContent();await page.locator('#sim-model-open').click();
    await page.waitForFunction(()=>/Imported 18 parts as one body/.test(document.querySelector('#start-status').textContent),null,{timeout:90000});
    assert.match(await page.locator('#sim-mesh-size').textContent(),/7\.\d long × 5\.\d wide × 3\.\d in tall, as one solid body/);
    await page.locator('.view-cube [data-side=left]').dispatchEvent('click');await page.locator('#sim-model-front').click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('deck-simulation-project-v2')).model.front==='+y');
    await page.waitForFunction(()=>/5\.\d long × 7\.\d wide/.test(document.querySelector('#sim-mesh-size').textContent),null,{timeout:10000}).catch(async()=>{throw Error('Model text: '+await page.locator('#sim-mesh-size').textContent()+' / '+await page.locator('#start-status').textContent());});
    assert.equal(await page.locator('#sim-footprint').textContent(),footprint,'a model never changes the collision footprint');
    assert.ok(await page.locator('#sim-robot-image').evaluate(i=>i.getAttribute('href').startsWith('data:image/png')&&Number(i.getAttribute('width'))>0),'2D shows the robot model from above');
    console.log('PASS: STEP import as one body, view-cube orientation, top-down robot picture.');
  }
  // Layouts persist; a new empty field starts clean; BIOBUZZ runs 3D physics; 3D view renders.
  await page.reload();await page.waitForFunction(()=>typeof hardware==='object'&&!!hardware.model);await page.evaluate(()=>window.deck.page('simulation'));await graph.waitFor({state:'visible'});
  assert.equal((await layout()).zones.length,4);assert.equal((await layout()).pins.length,2);
  await page.selectOption('#sim-field','new:empty');await page.waitForFunction(()=>/Empty field 2/.test(document.querySelector('#sim-subtitle').textContent));assert.equal((await layout()).zones.length,0);
  await page.selectOption('#sim-field',{label:'BIOBUZZ'});await page.waitForFunction(()=>/3D physics/.test(document.querySelector('#sim-subtitle').textContent),null,{timeout:30000});
  assert.match(await page.locator('#sim-field-note').textContent(),/hive legs and flower bases/);
  await page.locator('[data-view="3d"]').click();await page.locator('#sim-3d canvas').first().waitFor({state:'visible',timeout:30000});await page.waitForTimeout(2000);
  await page.screenshot({path:path.join(out,'biobuzz-3d.png'),scale:'css'});await page.locator('[data-view="2d"]').click();
  await page.selectOption('#sim-field',{label:'Empty field 1'});await page.waitForFunction(()=>/Empty field 1/.test(document.querySelector('#sim-subtitle').textContent));
  assert.deepEqual(errors,[]);
  // Leaving Simulation ends its utility process and any running Java program.
  const utility=()=>app.evaluate(({app})=>app.getAppMetrics().filter(m=>m.type==='Utility'&&/simulation/i.test(m.name||'')).length);
  const javaRunning=()=>Number(require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-Command',"@(Get-Process java -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*sim-runtime*' }).Count"],{encoding:'utf8'}).trim()||0);
  assert.equal(await utility(),1);await page.locator('[data-tab=run]').click();await page.locator('[data-program=route]').click();await page.locator('#sim-run').click();await page.waitForFunction(()=>/Running/.test(document.querySelector('#sim-run-status').textContent),null,{timeout:30000});
  assert.ok(javaRunning()>=1,'Pedro process running');await page.evaluate(()=>window.deck.page('drive'));await page.waitForTimeout(1500);assert.equal(await utility(),0);assert.equal(javaRunning(),0,'leaving Simulation ended the Pedro process');
  await page.evaluate(()=>window.deck.page('simulation'));await page.waitForFunction(()=>document.querySelector('#sim-telemetry').children.length>0,null,{timeout:30000});
  console.log('PASS: box/circle/triangle/shape/wall zones with handles, pins with pauses, automatic spline route, export auto-update, run, stop, reset, Java diagnostics, keyboard drive, layouts, BIOBUZZ 3D, process cleanup.');
  const win=await app.browserWindow(page);
  for(const [width,height,name] of [[1280,800,'steamdeck-lcd'],[1280,720,'steamdeck-oled'],[800,600,'small-landscape'],[390,844,'narrow']]){
    await win.evaluate((w,size)=>{w.setMinimumSize(0,0);w.setContentSize(...size);},[width,height]);await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow at '+name);
    console.log('Checking layout: '+name);
    if(width>=800)await page.screenshot({path:path.join(out,name+'.png'),fullPage:true,scale:'css',timeout:15000});
  }
  await win.evaluate(w=>w.setContentSize(1280,800));
  // Entry disconnects an existing FTC station; automatic reconnect cannot hijack this view.
  fixture=await startUdpRobot({address:'127.0.0.2'});const opened=await page.evaluate(()=>window.deck.open({url:'127.0.0.2',kind:'ftc',name:'Field test fixture'}));assert.equal(opened.opened,true,await page.evaluate(()=>state.error));await page.waitForFunction(()=>state.kind==='ftc'&&!state.loading);
  const station=app.context().pages().find(p=>p.url().includes('ui/ftc/index.html'));await station.waitForFunction(()=>document.querySelector('#link-text').textContent==='Robot Connected');
  fixture.sim.setOpMode('Field Centric TeleOp','running');await station.waitForFunction(()=>document.body.dataset.robotState==='running');
  await page.evaluate(()=>window.deck.page('simulation'));assert.equal(fixture.sim.opState,'stopped');assert.equal(await page.evaluate(()=>state.url),'');assert.equal(await page.evaluate(()=>state.page),'simulation');
  assert.equal(app.context().pages().filter(p=>p.url().includes('ui/ftc/index.html')).length,0);
  await page.evaluate(()=>window.deck.network());await page.waitForTimeout(5200);assert.equal(await page.evaluate(()=>state.page),'simulation');assert.deepEqual(errors,[]);
  // An in-flight connection probe must not reopen Drive after choosing Simulation.
  await page.evaluate(()=>{window.pendingOpen=window.deck.open({url:'127.0.0.3',kind:'auto',name:'Pending fixture'});});await page.waitForFunction(()=>state.loading);
  await page.evaluate(()=>window.deck.page('simulation'));await page.evaluate(()=>window.pendingOpen);assert.equal(await page.evaluate(()=>state.page),'simulation');assert.equal(await page.evaluate(()=>state.url),'');
  console.log('PASS: edge default, cursor preview, click/keyboard/touch placement, numeric validation, persisted pose, responsive field, keyboard controller isolation and FTC disconnect.');
  // Late IPC after the window is destroyed (seen during app.exit) must be ignored, not crash main.
  const late=await app.evaluate(({ipcMain,BrowserWindow})=>{BrowserWindow.getAllWindows().forEach(w=>w.destroy());const event={sender:{},senderFrame:null,reply(){}},failures=[];
    for(const channel of ['controller-input','sim-drive','controller-ready'])try{ipcMain.emit(channel,event,[]);}catch(e){failures.push(channel+': '+e.message);}return failures;});
  assert.deepEqual(late,[],'IPC after window destruction');console.log('PASS: late controller/simulation IPC after the window closes is ignored.');
 }finally{await app.close();if(fixture)await fixture.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
