'use strict';
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require(process.env.DECK_PLAYWRIGHT||'playwright');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results','controllers');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const env={...process.env,DECK_DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'deck-controller-ui-')),DECK_DEVICE_MODEL:'Steam Deck LCD',DECK_CONTROLLER_TEST:'1',DECK_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.DECK_ELECTRON,args:[root],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>typeof state==='object'&&!!window.__deckGamepadTest);
  await page.evaluate(()=>window.__deckGamepadTest.set([{id:'Steam Deck Controller',index:0,mapping:'standard',connected:true,axes:[-0.55,-0.8,0.75,0.35],buttons:Array.from({length:17},(_,i)=>({pressed:[0,4,6].includes(i),value:[0,4].includes(i)?1:i===6?0.65:0}))}]));
  await page.waitForFunction(()=>document.querySelector('#controller-1 small').textContent.includes('Steam Deck Controller'));
  await page.locator('#controller-1').click();await page.locator('#controller-dialog').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#controller-axis-1').textContent==='-0.80');
  const window=await app.browserWindow(page);
  for(const [width,height,name] of [[1280,800,'lcd'],[1920,1080,'desktop'],[390,844,'portrait']]){
   await window.evaluate((w,size)=>{w.setMinimumSize(0,0);w.setContentSize(size.width,size.height);},{width,height});await page.waitForTimeout(150);
   const dims=await page.locator('#controller-dialog').evaluate(d=>({width:d.clientWidth,scroll:d.scrollWidth}));assert.ok(dims.scroll<=dims.width+1,name+' dialog overflows horizontally');
   if(name==='lcd'){const done=await page.locator('#controller-done').boundingBox();assert.ok(done.y+done.height<=height,'LCD controller screen requires scrolling to exit');}
   await page.screenshot({path:path.join(out,'input-test-'+name+'.png'),scale:'css'});
  }
  assert.equal(await page.locator('.input-button.pressed').count(),3);assert.equal(await page.locator('#controller-axis-2').textContent(),'0.75');
  assert.equal(await page.locator('#controller-2').getAttribute('hidden'),null);await page.locator('#controller-done').click();await page.locator('#controller-dialog').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);console.log('PASS: live visual sticks/buttons/triggers, persistent test screen, both slots visible, LCD/desktop/portrait controller layouts, no page errors.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
