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
  // ---- Offline simulator: zones, pins, planning, Pedro run through DSIM physics, stop/reset, 3D.
  await page.evaluate(()=>localStorage.removeItem('deck-simulation-project-v1'));await page.reload();await page.waitForFunction(()=>typeof hardware==='object'&&!!hardware.model);await page.evaluate(()=>window.deck.page('simulation'));await graph.waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#sim-telemetry').children.length>0,null,{timeout:30000});
  await page.locator('#start-x').fill('20');await page.locator('#start-y').fill('72');await page.locator('#start-heading').fill('0');await page.locator('#start-form button').click();
  const project=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('deck-simulation-project-v1')));
  const dragOn=async(a,b)=>{const p=await point(...a),q=await point(...b);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:6});await page.mouse.up();};
  await page.locator('[data-tool=rect]').click();await dragOn([62,50],[82,95]);
  await page.locator('[data-tool=circle]').click();await dragOn([110,110],[118,110]);
  await page.locator('[data-tool=triangle]').click();await dragOn([30,110],[50,130]);
  let zones=(await project()).zones;assert.deepEqual(zones.map(z=>z.type),['rect','circle','triangle']);assert.ok(Math.abs(zones[0].width-20)<.6&&Math.abs(zones[1].radius-8)<.6);
  // Select, edit numerically, move by keyboard, then delete the triangle.
  await page.locator('[data-tool=select]').click();await click(40,118);await page.locator('#zone-angle').fill('30');await page.locator('#zone-angle').press('Enter');
  assert.equal((await project()).zones[2].angle,30);await graph.focus();await page.keyboard.press('ArrowRight');assert.ok(Math.abs((await project()).zones[2].x-41)<.6);
  await page.keyboard.press('Delete');zones=(await project()).zones;assert.deepEqual(zones.map(z=>z.type),['rect','circle']);
  await page.locator('[data-tool=pin]').click();await click(124,72);await click(120,130);assert.equal((await project()).pins.length,2);
  await page.locator('[data-tab=plan]').click();await page.locator('#sim-plan').click();await page.waitForFunction(()=>/Route:/.test(document.querySelector('#sim-plan-status').textContent));
  const route=(await project()).route;assert.ok(route.samples.length>10&&route.length>110);
  // Run the planned route with the real Pedro process; motion comes from DSIM physics.
  await page.locator('[data-tab=run]').click();await page.locator('#sim-run').click();
  await page.waitForFunction(()=>/Finished/.test(document.querySelector('#sim-run-status').textContent),null,{timeout:60000});
  const report=await page.locator('#sim-run-status').textContent();assert.match(report,/No no-go zone was touched/);const err=Number(/error ([\d.]+) in/.exec(report)[1]);assert.ok(err<1.5,report);
  console.log('PASS: Pedro route run: '+report);
  // Stop mid-run: the robot comes to rest and no stale reply restarts it.
  await page.locator('#sim-run').click();await page.waitForFunction(()=>/Running/.test(document.querySelector('#sim-run-status').textContent),null,{timeout:30000});await page.waitForTimeout(500);
  await page.locator('#sim-stop').click();await page.waitForFunction(()=>/Stopped/.test(document.querySelector('#sim-run-status').textContent));await page.waitForTimeout(1500);
  const rest=await page.locator('#sim-telemetry').textContent();assert.match(rest,/0\.0 in\/s/);assert.match(rest,/fwd 0\.00 · strafe 0\.00 · turn 0\.00/);
  await page.locator('#sim-reset').click();await page.waitForFunction(()=>/Truth20\.0, 72\.0 in/.test(document.querySelector('#sim-telemetry').textContent));
  // A Java program with a compile error reports a readable diagnostic.
  await page.locator('[data-program=source]').click();await page.locator('#sim-source').fill('import deck.sim.*;\npublic class Broken implements DeckAutonomous {\n public void init(SimRobot r) { int x = "no"; }\n public void loop(SimRobot r) {}\n}\n');
  await page.locator('#sim-run').click();await page.locator('#sim-error').waitFor({state:'visible',timeout:30000});assert.match(await page.locator('#sim-error').textContent(),/Compile error: Broken\.java:3/);
  await page.locator('#sim-java-example').click();await page.locator('#sim-run').click();await page.waitForFunction(()=>/Finished/.test(document.querySelector('#sim-run-status').textContent),null,{timeout:60000});
  console.log('PASS: Java program: '+await page.locator('#sim-run-status').textContent());
  // Manual driving with the keyboard moves the simulated robot, never a real one.
  await page.locator('[data-tool=drive]').click();const truthText=()=>page.evaluate(()=>[...document.querySelectorAll('#sim-telemetry dt')].find(d=>d.textContent==='Truth').nextElementSibling.textContent);const before=await truthText();
  await page.keyboard.down('KeyW');await page.waitForTimeout(700);await page.keyboard.up('KeyW');await page.waitForTimeout(300);
  assert.notEqual(await truthText(),before,'keyboard drive moved the robot');
  // Persistence and 3D.
  await page.reload();await page.waitForFunction(()=>typeof hardware==='object'&&!!hardware.model);await page.evaluate(()=>window.deck.page('simulation'));await graph.waitFor({state:'visible'});
  assert.equal((await project()).zones.length,2);assert.equal((await project()).pins.length,2);
  // Visual mesh import: stored through the app, scaled explicitly, never used for collision.
  const stl=['solid t','facet normal 0 0 1','outer loop','vertex 0 0 0','vertex 10 0 0','vertex 0 10 0','endloop','endfacet','endsolid t',''].join(String.fromCharCode(10));
  const stored=await page.evaluate(async s=>{const r=await window.deck.simFile('mesh-store',{name:'tri.stl',bytes:new TextEncoder().encode(s)});const back=await window.deck.simFile('mesh-read',r.id);return {id:r.id,format:r.format,same:back.bytes.length===r.bytes.length};},stl);
  assert.equal(stored.format,'stl');assert.ok(stored.same);
  await page.evaluate(id=>{const p=JSON.parse(localStorage.getItem('deck-simulation-project-v1'));p.mesh={id,name:'tri.stl',format:'stl',scale:2,rx:0,ry:0,rz:0,dz:0};localStorage.setItem('deck-simulation-project-v1',JSON.stringify(p));},stored.id);
  await page.reload();await page.waitForFunction(()=>typeof hardware==='object'&&!!hardware.model);await page.evaluate(()=>window.deck.page('simulation'));await graph.waitFor({state:'visible'});
  const footprintBefore=await page.locator('#sim-footprint').textContent();
  await page.selectOption('#sim-field','biobuzz');await page.waitForFunction(()=>/Rapier 3D/.test(document.querySelector('#sim-subtitle').textContent),null,{timeout:30000});
  await page.locator('[data-view="3d"]').click();await page.locator('#sim-3d canvas').first().waitFor({state:'visible',timeout:30000});await page.waitForTimeout(3000);
  await page.waitForFunction(()=>/20.0 × 20.0 × 0.0 in/.test(document.querySelector('#sim-mesh-size').textContent),null,{timeout:15000});
  assert.match(await page.locator('#sim-footprint').textContent(),/Collision footprint: 10.50 in front, 7.50 in rear/,'mesh did not change the collision footprint');void footprintBefore;
  await page.screenshot({path:path.join(out,'biobuzz-3d.png'),scale:'css'});await page.locator('[data-view="2d"]').click();
  await page.selectOption('#sim-field','empty');await page.waitForFunction(()=>/Empty field/.test(document.querySelector('#sim-subtitle').textContent));
  assert.deepEqual(errors,[]);
  // Leaving Simulation ends its utility process (and with it any Java program).
  const utility=()=>app.evaluate(({app})=>app.getAppMetrics().filter(m=>m.type==='Utility'&&/simulation/i.test(m.name||'')).length);
  const javaRunning=()=>Number(require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-Command',"@(Get-Process java -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*sim-runtime*' }).Count"],{encoding:'utf8'}).trim()||0);
  assert.equal(await utility(),1);await page.locator('[data-tab=run]').click();await page.locator('[data-program=route]').click();await page.locator('#sim-run').click();await page.waitForFunction(()=>/Running/.test(document.querySelector('#sim-run-status').textContent),null,{timeout:30000});
  assert.ok(javaRunning()>=1,'Pedro process running');await page.evaluate(()=>window.deck.page('drive'));await page.waitForTimeout(1500);assert.equal(await utility(),0);assert.equal(javaRunning(),0,'leaving Simulation ended the Pedro process');
  await page.evaluate(()=>window.deck.page('simulation'));await page.waitForFunction(()=>document.querySelector('#sim-telemetry').children.length>0,null,{timeout:30000});
  console.log('PASS: zones (rect/circle/triangle draw, edit, delete), pins, planning, Pedro run, stop, reset, Java diagnostics, keyboard drive, persistence, BIOBUZZ 3D, process cleanup.');
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
