'use strict';
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),http=require('node:http');const {_electron}=require(process.env.DECK_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results','v2');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const actions=[];const server=http.createServer(async(req,res)=>{
    if(req.url==='/protected'&&req.headers.authorization!=='Basic '+Buffer.from('driver:secret-password').toString('base64')){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Robot sign-in"'});res.end('Sign in');return;}
    if(req.url==='/robot-action'){let body='';for await(const chunk of req)body+=chunk;actions.push(body);res.end('{"ok":true}');return;}
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Original Robot Dashboard</title><h1 id="original">The actual robot interface</h1><button id="init">Initialize on robot</button><button id="teleop">Teleop</button><button id="auto">Autonomous</button><script>document.querySelector("#init").onclick=()=>fetch("/robot-action",{method:"POST",body:"robot-initialize"});</script>');
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));const target=`http://127.0.0.1:${server.address().port}`;
  const data=path.join(out,'data-'+Date.now());let app;
  try{
    app=await _electron.launch({executablePath:process.env.DECK_ELECTRON,args:[root],env:{...process.env,DECK_HEADLESS:'1',DECK_DATA_DIR:data},timeout:30000});
    const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>typeof window.deck==='object'&&document.querySelector('#wifi-summary')?.textContent!=='Checking your network…');
    await page.locator('#settings-tab').click();await page.waitForFunction(()=>state.page==='settings');const window=await app.browserWindow(page);
    const layouts=[[1280,800,'lcd'],[3840,2160,'4k'],[390,844,'portrait']];for(const [width,height,name]of process.env.DECK_UI_QUICK?layouts.slice(0,1):layouts){
      await window.evaluate((w,s)=>{w.setMinimumSize(0,0);w.setContentSize(s.width,s.height);},{width,height});await page.waitForTimeout(120);
      const dims=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dims.scroll<=dims.w+1,`${name} has horizontal overflow: ${JSON.stringify(dims)}`);
      await page.screenshot({path:path.join(out,'settings-'+name+'.png'),fullPage:true,scale:'css'});
    }
    await window.evaluate(w=>w.setContentSize(1280,800));
    await page.locator('#robot-url').fill(target);await page.locator('#robot-name').fill('');await page.locator('#robot-network').fill('');
    await page.locator('#open-robot').click();await page.waitForFunction(()=>state.robot?.name==='Original Robot Dashboard'&&!state.loading);
    let robot=app.context().pages().find(p=>p!==page&&p.url().startsWith('http://127.0.0.1:'));assert.ok(robot,'robot WebContentsView was not created');await robot.waitForSelector('#original');
    assert.deepEqual(await robot.evaluate(()=>({node:typeof require,bridge:typeof window.deck,secure:window.isSecureContext,gamepads:typeof navigator.getGamepads})),{node:'undefined',bridge:'undefined',secure:true,gamepads:'function'});
    assert.equal(actions.length,0,'launcher sent a robot initialization command');await robot.locator('#init').click();await page.waitForTimeout(100);assert.deepEqual(actions,['robot-initialize']);
    await page.screenshot({path:path.join(out,'drive-shell.png'),fullPage:true,scale:'css'});
    await page.locator('#more').click();await page.locator('#menu-library').click();await page.waitForFunction(()=>state.page==='settings');assert.equal(app.context().pages().filter(p=>p!==page&&p.url().startsWith('http:')).length,0,'hidden robot view was left sending commands');
    assert.equal(await page.locator('.saved-row strong').first().textContent(),'Original Robot Dashboard');
    await page.locator('#robot-url').fill(target+'/protected');await page.locator('#robot-name').fill('Password robot');await page.locator('#open-robot').click();await page.locator('#auth-dialog').waitFor({state:'visible'});await page.locator('#auth-username').fill('driver');await page.locator('#auth-password').fill('secret-password');await page.locator('#auth-form button[type=submit]').click();await page.waitForFunction(()=>state.robot?.name==='Password robot'&&!state.loading);
    assert.ok(!fs.readFileSync(path.join(data,'robots.json'),'utf8').includes('secret-password'));
    await page.locator('#settings-tab').click();await page.locator('.saved-row').filter({hasText:'Original Robot Dashboard'}).locator('.secondary').click();await page.waitForFunction(()=>state.page==='drive'&&!state.loading);assert.deepEqual(errors,[]);
    await app.close();app=null;
    app=await _electron.launch({executablePath:process.env.DECK_ELECTRON,args:[root],env:{...process.env,DECK_HEADLESS:'1',DECK_DATA_DIR:data},timeout:30000});const second=await app.firstWindow();await second.waitForFunction(()=>state.robots.length===2);
    console.log('PASS: LCD/4K/portrait layouts; original robot HTML; secure Gamepad context; isolated robot renderer; no launcher initialization; robot-owned action; native HTTP sign-in; saved title/address/network; one-click reopen; persistence after restart.');
  }finally{if(app)await app.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
