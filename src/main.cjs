'use strict';
const {app,BrowserWindow,WebContentsView,ipcMain,screen,Menu,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path');const {execFile}=require('node:child_process');const {promisify}=require('node:util');const {createHash,randomUUID}=require('node:crypto');
const {Library,normalizeUrl,cleanSsid}=require('./library.cjs');const {Network}=require('./network.cjs');const {RobotProxy}=require('./robot-proxy.cjs');const {FtcSocket,probeFtc,findFtc}=require('./ftc.cjs');
const {Updater,prepareInstall,launchInstall}=require('./updater.cjs');const meta=require('../package.json');let updater;
const {identifyHardware,detectHardware}=require('./hardware.cjs');let device=identifyHardware();
const {ControllerHub}=require('./controller-hub.cjs');let controllerHub,lastControllerState='',lastInputConfig='';
const controllerSessions=new WeakSet(),controllerArguments=process.env.DECK_CONTROLLER_TEST==='1'?['--deck-controller-fixtures']:[];
const run=promisify(execFile);let win,library,robotView=null,bridge=null,auth=null,pollTimer,active=null,currentNetwork=null,opening=false,viewBounds={x:0,y:127,width:1280,height:643};
// FTC robots: robotView is the bundled Driver Station page, bridge its UDP socket; managerView is Program & Manage.
let managerView=null,managerProxy=null;
const state={page:'drive',loading:false,url:'',title:'',error:'',robot:null,kind:'',manager:false};const network=new Network();let overlay=false;
app.setName('Deck Driver Station');
if(process.env.DECK_DATA_DIR){fs.mkdirSync(process.env.DECK_DATA_DIR,{recursive:true});app.setPath('userData',process.env.DECK_DATA_DIR);}
if(!app.requestSingleInstanceLock())app.quit();app.on('second-instance',()=>{win?.show();win?.focus();});
function emit(channel,value){try{if(win&&!win.isDestroyed())win.webContents.send(channel,value);}catch{}}
function snapshot(){return {...state,robots:library?.list(currentNetwork?.ssid),network:currentNetwork};}
function update(patch={}){Object.assign(state,patch);emit('state',snapshot());}
function trusted(e){if(!win||e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)throw Error('Only app settings can perform this action.');}
function handle(channel,fn){ipcMain.handle(channel,async(e,...args)=>{try{trusted(e);return {ok:true,value:await fn(...args)};}catch(e){return {ok:false,error:e.message,code:e.code};}});}
function hardware(){const d=screen.getDisplayMatching(win.getBounds());return {...device,platform:process.platform,launchedThroughSteam:[process.env.SteamGameId,process.env.SteamAppId].some(id=>/^[1-9]\d*$/.test(id||'')),display:{width:d.size.width,height:d.size.height,scale:d.scaleFactor}};}
function controllerState(){return {...(controllerHub?.state()||{count:1,slots:[null,null],capture:null,blocked:[]}),paused:state.page!=='drive'||!!overlay||!!auth||!!managerView};}
function inputConfig(value=controllerState()){const {count,slots,capture,blocked,paused}=value;return {count,slots,capture,blocked,paused};}
function sendControllers(force=false){
  if(!controllerHub)return;controllerHub.tick();const value=controllerState(),signature=JSON.stringify(value);if(!force&&signature===lastControllerState)return;lastControllerState=signature;
  emit('controller-state',value);
  // Raw diagnostics stay in the trusted app UI. Robot pages need only slot
  // routing and pause state, not the test screen's other-controller readings.
  const config=inputConfig(value),routing=JSON.stringify(config);if(force||routing!==lastInputConfig){lastInputConfig=routing;for(const view of [win,robotView])try{view?.webContents.send('controller-config',config);}catch{}}
}
function controllerSession(session){if(!controllerSessions.has(session)){session.registerPreloadScript({type:'frame',filePath:path.join(__dirname,'controller-preload.cjs')});controllerSessions.add(session);}}
function controllerSender(e){return e.sender===win?.webContents||e.sender===robotView?.webContents;}
ipcMain.on('controller-ready',e=>{if(controllerSender(e)&&e.senderFrame===e.sender.mainFrame)e.reply('controller-config',inputConfig());});
ipcMain.on('controller-input',(e,pads)=>{
  if(!controllerHub||!controllerSender(e)||e.senderFrame!==e.sender.mainFrame)return;
  const rootInput=!robotView||!!controllerHub.capture||state.page!=='drive'||overlay||!!auth||!!managerView;
  if((rootInput&&e.sender!==win.webContents)||(!rootInput&&e.sender!==robotView.webContents))return;
  controllerHub.ingest(pads);sendControllers();
});
function captureController(slot){controllerHub.begin(slot);win.webContents.focus();sendControllers(true);emit('controller-capture',controllerState());return controllerState();}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function closeManager(){
  const view=managerView,proxy=managerProxy;managerView=null;managerProxy=null;
  if(view){try{win.contentView.removeChildView(view);view.webContents.close();}catch{}}
  if(proxy)await proxy.close();if(state.manager)update({manager:false});fitView();
}
async function closeRobot(){
  if(auth){auth.callback();auth=null;}
  await closeManager();
  // An FTC station sends STOP for an active op mode before its socket closes; the robot also stops on its own after 2 s.
  if(robotView&&bridge instanceof FtcSocket){try{await Promise.race([robotView.webContents.executeJavaScript('window.deckShutdown?.()'),delay(300)]);await delay(80);}catch{}}
  const view=robotView,proxy=bridge;robotView=null;bridge=null;active=null;
  controllerHub?.cancel();controllerHub?.setCount(1);sendControllers(true);
  if(view){try{win.contentView.removeChildView(view);view.webContents.close();}catch{}}
  if(proxy)await proxy.close();update({loading:false,robot:null,url:'',title:'',error:'',kind:''});
}
function place(view,visible){const [width,height]=win.getContentSize();const x=Math.min(Math.max(0,Math.round(viewBounds.x)),width),y=Math.min(Math.max(0,Math.round(viewBounds.y)),height);view.setBounds({x,y,width:Math.max(0,Math.min(Math.round(viewBounds.width),width-x)),height:Math.max(0,Math.min(Math.round(viewBounds.height),height-y))});view.setVisible(visible);}
function fitView(){
  if(!robotView||!win)return;const shown=state.page==='drive'&&!auth&&!state.error&&!overlay;
  if(managerView)place(managerView,shown);place(robotView,shown&&!managerView);
  // Hidden Driver Station: gamepads are released to rest, the connection (and a running op mode) continues.
  if(bridge instanceof FtcSocket)try{robotView.webContents.send('ftc-active',shown&&!managerView);}catch{}
  sendControllers();
}
async function refreshNetwork(){
  const next=await network.status(),previous=currentNetwork;currentNetwork=next;
  if(robotView&&previous?.ssid&&next.ssid!==previous.ssid&&!network.busy){await closeRobot();update({error:'Wi-Fi changed. Open the robot saved for this network.'});}
  emit('network',next);return next;
}
async function openRobot(input){
  if(opening)throw Error('A robot connection is already opening.');opening=true;
  try{
    const saved=input.id?library.get(input.id):null,target={...saved,...input,url:normalizeUrl(input.url||saved?.url)};
    const wifi=await refreshNetwork(),ssid=cleanSsid(input.id&&!input.url?saved?.ssid||wifi.ssid:wifi.ssid);
    if(ssid&&wifi.ssid!==ssid)return {needsWifi:{ssid},request:target};
    // The automatic FTC check holds UDP 20884 for up to 1.5 s; let it finish first.
    for(let i=0;auto.busy&&i<40;i++)await delay(50);
    await closeRobot();
    // FTC Robot Controllers answer Robocol discovery on UDP 20884 and get the Driver Station; everything else is a website.
    // The Settings "FTC robot" box forces the Driver Station; unticked ("auto") detects again.
    let kind=input.kind==='ftc'?'ftc':input.kind==='auto'?undefined:saved?.url===target.url?saved.kind:undefined;
    if(!kind){update({page:'drive',loading:true,url:target.url,title:target.name||'Looking for robot',robot:saved||null,error:''});kind=(await probeFtc(new URL(target.url).hostname)).ftc?'ftc':'web';}
    if(kind==='ftc')return await openFtc(target,ssid);
    const proxy=new RobotProxy(target.url),localUrl=await proxy.start();bridge=proxy;
    const identity=createHash('sha256').update(`${ssid}\0${new URL(target.url).origin}`).digest('hex');
    const view=new WebContentsView({webPreferences:{partition:`persist:robot-${identity}`,additionalArguments:controllerArguments,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,webSecurity:true}});
    robotView=view;active={...target,ssid};win.contentView.addChildView(view);
    const contents=view.webContents,session=contents.session;
    controllerSession(session);controllerHub.setCount(target.controllerCount===2?2:1);
    session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));session.setPermissionCheckHandler(()=>false);
    session.webRequest.onBeforeRequest((details,cb)=>{
      try{const u=new URL(details.url);
        if(['http:','https:'].includes(u.protocol)&&u.origin===proxy.target.origin)return cb({redirectURL:proxy.origin+u.pathname+u.search});
        if(['http:','https:','ws:','wss:'].includes(u.protocol)&&['127.0.0.1','localhost'].includes(u.hostname)&&u.port!==new URL(proxy.origin).port){u.hostname=proxy.target.hostname;if(u.href!==details.url)return cb({redirectURL:u.href});}
      }catch{}cb({});
    });
    const allowed=url=>{try{return new URL(url).origin===proxy.origin;}catch{return false;}};
    contents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault();});
    contents.on('will-redirect',(e,url)=>{if(!allowed(url)){e.preventDefault();update({error:'The robot redirected outside its address. Enter that address in Settings if intended.'});}});
    contents.setWindowOpenHandler(({url})=>{if(allowed(url))void contents.loadURL(url);return {action:'deny'};});
    contents.on('did-start-loading',()=>{if(robotView===view)update({loading:true,error:''});});
    contents.on('did-finish-load',()=>{
      if(robotView!==view)return;const title=contents.getTitle(),u=new URL(contents.getURL());
      const robotUrl=proxy.target.origin+u.pathname+u.search+u.hash;
      const robot=library.upsert({...active,url:robotUrl,kind:'web'},{opened:true,title});active=robot;update({loading:false,title:robot.name,url:robotUrl,robot,kind:'web'});
    });
    contents.on('page-title-updated',(_e,title)=>{if(robotView===view&&active?.id){const robot=library.updateTitle(active.id,title);update({title:robot.name,robot});}});
    contents.on('did-fail-load',(_e,code,message,_url,isMainFrame)=>{if(robotView===view&&isMainFrame&&code!==-3){view.setVisible(false);update({loading:false,error:`Could not open the robot: ${message}`});}});
    contents.on('render-process-gone',()=>{if(robotView===view)void closeRobot().then(()=>update({error:'Robot page closed unexpectedly. Open it again to reconnect.'}));});
    update({page:'drive',loading:true,url:target.url,title:target.name||'Opening robot',robot:saved||null,error:''});fitView();
    void contents.loadURL(localUrl).then(()=>{if(robotView===view)contents.focus();}).catch(e=>{if(robotView===view)update({loading:false,error:e.message});});return {opened:true};
  }finally{opening=false;}
}
function lockDown(contents,allowed){
  const session=contents.session;session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));session.setPermissionCheckHandler(()=>false);
  contents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault();});contents.setWindowOpenHandler(({url})=>{if(allowed(url))void contents.loadURL(url);return {action:'deny'};});
}
async function openFtc(target,ssid){
  const host=new URL(target.url).hostname,socket=new FtcSocket(host);
  try{await socket.open();}catch(e){update({page:'drive',loading:false,url:target.url,title:target.name||host,error:e.message});return {opened:false};}
  const robot=library.upsert({...target,ssid,kind:'ftc'},{opened:true});
  const view=new WebContentsView({webPreferences:{preload:path.join(__dirname,'ftc-preload.cjs'),partition:'ftc-driver-station',additionalArguments:controllerArguments,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,webSecurity:true}});
  const page=path.join(__dirname,'../ui/ftc/index.html'),pageUrl=require('node:url').pathToFileURL(page).href;
  robotView=view;bridge=socket;active=robot;win.contentView.addChildView(view);lockDown(view.webContents,url=>url===pageUrl);
  controllerSession(view.webContents.session);controllerHub.setCount(robot.controllerCount);
  socket.onPacket(bytes=>{if(robotView===view)view.webContents.send('ftc-packet',bytes);});
  view.webContents.on('render-process-gone',()=>{if(robotView===view)void closeRobot().then(()=>update({error:'The Driver Station closed unexpectedly. Open the robot again to reconnect.'}));});
  update({page:'drive',loading:false,url:target.url,title:robot.name,robot,kind:'ftc',error:''});fitView();
  await view.webContents.loadFile(page);if(robotView===view){view.webContents.focus();fitView();}return {opened:true,kind:'ftc'};
}
// Program & Manage: the Robot Controller's own web interface (port 8080) over the existing website bridge.
async function openManager(){
  if(!(bridge instanceof FtcSocket))throw Error('Program & Manage is available for FTC robots.');await closeManager();
  const proxy=new RobotProxy(`http://${bridge.host.includes(':')?`[${bridge.host}]`:bridge.host}:8080/`),localUrl=await proxy.start();
  const view=new WebContentsView({webPreferences:{partition:`persist:robot-manage-${createHash('sha256').update(bridge.host).digest('hex')}`,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  managerView=view;managerProxy=proxy;win.contentView.addChildView(view);lockDown(view.webContents,url=>{try{return new URL(url).origin===proxy.origin;}catch{return false;}});
  view.webContents.on('did-fail-load',(_e,code,message,_u,main)=>{if(managerView===view&&main&&code!==-3)void closeManager().then(()=>emit('notice',`Program & Manage is not reachable: ${message}`));});
  update({manager:true});fitView();void view.webContents.loadURL(localUrl);return true;
}
ipcMain.on('ftc-send',(e,bytes)=>{if(robotView&&e.sender===robotView.webContents&&bridge instanceof FtcSocket&&bytes instanceof Uint8Array)bridge.send(bytes);});
ipcMain.handle('ftc-info',e=>{if(!robotView||e.sender!==robotView.webContents||!(bridge instanceof FtcSocket))throw Error('No FTC robot is open.');return {name:active?.name||bridge.host,host:bridge.host,address:bridge.address,ssid:active?.ssid||currentNetwork?.ssid||'',controllerCount:active?.controllerCount||1,...device,steamDeck:device.controllerFamily==='steamdeck'};});
ipcMain.handle('ftc-controller-capture',(e,slot)=>{if(e.sender!==robotView?.webContents||!(bridge instanceof FtcSocket))throw Error('No FTC driver station is open.');return captureController(slot);});
ipcMain.handle('ftc-manage',async e=>{if(!robotView||e.sender!==robotView.webContents)throw Error('No FTC robot is open.');return openManager();});
handle('manager-close',closeManager);
// An FTC robot makes its own Wi-Fi network. Once a robot is saved as FTC, joining that network opens Drive and
// its Driver Station as soon as the Robot Controller answers. Retries every poll (the hub's Wi-Fi starts before
// its software); closing the robot stops this until the network changes.
const auto={ssid:null,dismissed:false,busy:false};
async function autoOpenFtc(){
  const ssid=currentNetwork?.ssid||'';if(auto.ssid!==ssid)Object.assign(auto,{ssid,dismissed:false});
  if(auto.busy||auto.dismissed||robotView||opening||network.busy||!library||!ssid)return;
  const saved=library.list(ssid).filter(r=>r.ssid===ssid&&r.kind==='ftc');if(!saved.length)return;
  auto.busy=true;
  try{
    const host=await findFtc([...new Set(saved.map(r=>new URL(r.url).hostname))]);const robot=saved.find(r=>new URL(r.url).hostname===host);
    if(robot&&!robotView&&!opening&&!auto.dismissed&&(currentNetwork?.ssid||'')===ssid){auto.busy=false;await openRobot({id:robot.id});}
  }catch(e){emit('notice',e.message);}finally{auto.busy=false;}
}
handle('bootstrap',async()=>{await refreshNetwork();setTimeout(()=>void autoOpenFtc(),300);return {state:snapshot(),hardware:hardware(),app:{version:meta.version,channel:meta.updateChannel}};});handle('open',openRobot);handle('close',async()=>{auto.dismissed=true;await closeRobot();});
// The open robot stays connected while Settings is shown; it is hidden, not closed.
handle('page',async page=>{if(!['drive','settings'].includes(page))throw Error('Unknown app view.');update({page});fitView();return snapshot();});
handle('save',async input=>{const wifi=await refreshNetwork();const robot=library.upsert({...input,ssid:wifi.ssid||''});if(active?.id===robot.id){active=robot;controllerHub.setCount(robot.controllerCount);update({robot});sendControllers(true);}else update();return robot;});handle('remove',id=>{library.remove(id);update();});
handle('network',refreshNetwork);handle('scan',()=>network.scan());
handle('join',async(ssid,password)=>{await closeRobot();let info;try{info=await network.join(ssid,password);}catch(e){if(e.code==='NEEDS_PASSWORD')return {needsPassword:true,ssid,message:e.message};throw e;}currentNetwork=info;emit('network',info);update();setTimeout(()=>void autoOpenFtc(),500);return info;});
handle('system-wifi',async()=>{
  await closeRobot();if(process.platform==='win32')return shell.openExternal('ms-settings:network-wifi');
  if(process.platform==='darwin')return shell.openExternal('x-apple.systempreferences:com.apple.wifi-settings-extension');
  await run('systemsettings',['kcm_networkmanagement'],{timeout:5000}).catch(e=>{if(e.killed)return;throw Error('Open Wi-Fi from the SteamOS quick settings menu.');});
});
handle('bounds',bounds=>{if(!bounds||!['x','y','width','height'].every(k=>Number.isFinite(bounds[k])&&bounds[k]>=0))throw Error('Invalid robot view bounds.');viewBounds=bounds;fitView();});
handle('overlay',visible=>{const previous=overlay;overlay=!!visible;fitView();if(previous&&!overlay&&state.page==='drive'&&win.isFocused())robotView?.webContents.focus();});
handle('reload',()=>{const view=managerView||robotView;if(view)view.webContents.reload();});handle('back',async()=>{const view=managerView||robotView;if(view?.webContents.navigationHistory.canGoBack())view.webContents.navigationHistory.goBack();else if(managerView)await closeManager();});
handle('controllers',()=>controllerHub.state().slots);
handle('controller-info',()=>controllerState());handle('controller-capture',captureController);handle('controller-cancel',()=>{controllerHub.cancel();sendControllers(true);return controllerState();});
handle('controller-automatic',()=>{controllerHub.automatic();sendControllers(true);return controllerState();});
handle('auth',({id,username,password,cancel})=>{if(!auth||auth.id!==id)throw Error('This sign-in prompt expired.');const pending=auth;auth=null;if(cancel)pending.callback();else pending.callback(String(username||'').slice(0,256),String(password||'').slice(0,1024));fitView();});
handle('fullscreen',()=>win.setFullScreen(!win.isFullScreen()));handle('quit',()=>app.quit());
handle('update-info',async()=>{await closeRobot();return updater.info();});
handle('update-check',repo=>updater.check(repo));
handle('update-channel',(channel,confirmed)=>updater.setChannel(channel,confirmed));
handle('update-download',()=>updater.download());
handle('update-folder',async()=>{if(!updater.downloaded)throw Error('Download an update first.');shell.showItemInFolder(updater.downloaded.file);});
handle('update-install',async()=>{if(!updater.downloaded)throw Error('Download an update first.');await closeRobot();const prepared=await prepareInstall(updater.downloaded,{appPath:app.getAppPath(),executable:process.execPath});await launchInstall(prepared);setTimeout(()=>app.quit(),200);return {restarting:true};});
app.on('login',(event,contents,details,info,callback)=>{
  if(contents!==robotView?.webContents)return;event.preventDefault();if(auth)auth.callback();auth={id:randomUUID(),callback};robotView.setVisible(false);emit('auth',{id:auth.id,host:active?.url||'',realm:info.realm||'',retry:!details.firstAuthAttempt});
});
// A copy installed by a sandboxed Windows app (a packaged agent or shell) keeps its data inside that app's
// LocalCache, out of Explorer's reach. On the first start of a normal install, bring that robot list along.
function recoverSandboxedLibrary(dir){
  if(process.platform!=='win32'||process.env.DECK_DATA_DIR||fs.existsSync(path.join(dir,'robots.json'))||!process.env.LOCALAPPDATA)return;
  try{
    const packages=path.join(process.env.LOCALAPPDATA,'Packages');let best=null;
    for(const name of fs.readdirSync(packages)){const folder=path.join(packages,name,'LocalCache','Roaming',app.getName());try{const t=fs.statSync(path.join(folder,'robots.json')).mtimeMs;if(!best||t>best.t)best={folder,t};}catch{}}
    if(!best)return;fs.mkdirSync(dir,{recursive:true});
    for(const file of ['robots.json','update-settings.json'])if(fs.existsSync(path.join(best.folder,file))&&!fs.existsSync(path.join(dir,file)))fs.copyFileSync(path.join(best.folder,file),path.join(dir,file));
  }catch{}
}
app.whenReady().then(async()=>{
  device=await detectHardware();
  recoverSandboxedLibrary(app.getPath('userData'));
  const controllerFile=path.join(app.getPath('userData'),'controller-settings.json');let preferred=[];try{const saved=JSON.parse(fs.readFileSync(controllerFile,'utf8'));if(Array.isArray(saved))preferred=saved;}catch{}
  controllerHub=new ControllerHub({hardware:device,preferred,persist:value=>fs.writeFileSync(controllerFile,JSON.stringify(value),{mode:0o600})});
  updater=new Updater({directory:app.getPath('userData'),version:meta.version,repo:meta.repository.url,channel:meta.updateChannel,onProgress:p=>emit('update-progress',p)});
  try{library=new Library(path.join(app.getPath('userData'),'robots.json'));}catch(e){state.error=`Saved library could not be read: ${e.message}`;library=new Library(path.join(app.getPath('userData'),`robots-recovered-${Date.now()}.json`));}
  const d=screen.getPrimaryDisplay().workAreaSize;
  win=new BrowserWindow({show:process.env.DECK_HEADLESS!=='1',width:Math.min(1280,d.width),height:Math.min(800,d.height),minWidth:360,minHeight:480,title:'Deck Driver Station',icon:path.join(__dirname,'../ui/icon.png'),backgroundColor:'#080808',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),additionalArguments:controllerArguments,partition:'persist:launcher',sandbox:true,contextIsolation:true,nodeIntegration:false}});
  controllerSession(win.webContents.session);const controllerTimer=setInterval(()=>sendControllers(),100);controllerTimer.unref();
  Menu.setApplicationMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.on('resize',fitView);win.loadFile(path.join(__dirname,'../ui/index.html'));
  pollTimer=setInterval(()=>{if(!network.busy)void refreshNetwork().then(()=>autoOpenFtc());},5000);pollTimer.unref();
});
let closing=false;app.on('before-quit',e=>{if(closing)return;e.preventDefault();closing=true;clearInterval(pollTimer);void closeRobot().finally(()=>app.quit());});app.on('window-all-closed',()=>app.quit());
