'use strict';
const {app,BrowserWindow,WebContentsView,ipcMain,screen,Menu,shell,powerMonitor}=require('electron');
const fs=require('node:fs'),path=require('node:path');const {execFile}=require('node:child_process');const {promisify}=require('node:util');const {createHash,randomUUID}=require('node:crypto');
const {Library,normalizeUrl,cleanSsid}=require('./library.cjs');const {Network}=require('./network.cjs');const {RobotProxy}=require('./robot-proxy.cjs');const {FtcSocket,probeFtc,findFtc}=require('./ftc.cjs');
const {Updater,prepareInstall,launchInstall}=require('./updater.cjs');const meta=require('../package.json');let updater;
const {identifyHardware,detectHardware}=require('./hardware.cjs');let device=identifyHardware();
const {ControllerHub}=require('./controller-hub.cjs');let controllerHub,lastControllerState='',lastInputConfig='';
const {controllerOutput}=require('./controller-output.cjs');let lastControllerInput=0;
const {deadzone}=require('../ui/controller-calibration.js');let calibrationFile,calibrations=Object.create(null);
const discovery=require('./discovery.cjs');let finding=null;
const {RobotKeyboard}=require('./touch-keyboard.cjs');let robotKeyboard;
const controllerSessions=new WeakSet(),controllerArguments=process.env.DECK_CONTROLLER_TEST==='1'?['--deck-controller-fixtures']:[];
const robotArguments=()=>[...controllerArguments,...(device.builtInController?['--deck-touch-first']:[])];
const run=promisify(execFile);let win,library,robotView=null,bridge=null,auth=null,pollTimer,active=null,currentNetwork=null,opening=false,viewBounds={x:0,y:127,width:1280,height:643};
// FTC robots: robotView is the bundled Driver Station page, bridge its UDP socket; managerView is Program & Manage.
let managerView=null,managerProxy=null;
let robotExitView=null,robotExitReady=null,robotFullscreenPrevious=false;
let suspended=false,interruption=null,connectionEpoch=0;const recoveryControllers=new Set();
const state={page:'drive',loading:false,url:'',title:'',error:'',robot:null,kind:'',manager:false,robotFullscreen:false,recovering:false};const network=new Network();let overlay=false;
app.setName('Deck Driver Station');
if(process.env.DECK_DATA_DIR){fs.mkdirSync(process.env.DECK_DATA_DIR,{recursive:true});app.setPath('userData',process.env.DECK_DATA_DIR);}
if(!app.requestSingleInstanceLock())app.quit();app.on('second-instance',()=>{win?.show();win?.focus();});
function emit(channel,value){try{if(win&&!win.isDestroyed())win.webContents.send(channel,value);}catch{}}
function snapshot(){return {...state,robots:library?.list(currentNetwork?.ssid),network:currentNetwork};}
function update(patch={}){Object.assign(state,patch);if(state.page!=='drive'||state.error||!state.url)robotKeyboard?.hide({focus:false});if(state.robotFullscreen&&(state.page!=='drive'||state.error||!state.url))void setRobotFullscreen(false);emit('state',snapshot());}
function trusted(e){if(!win||e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)throw Error('Only app settings can perform this action.');}
function handle(channel,fn){ipcMain.handle(channel,async(e,...args)=>{try{trusted(e);return {ok:true,value:await fn(...args)};}catch(e){return {ok:false,error:e.message,code:e.code};}});}
function hardware(){const d=screen.getDisplayMatching(win.getBounds());return {...device,platform:process.platform,launchedThroughSteam:[process.env.SteamGameId,process.env.SteamAppId].some(id=>/^[1-9]\d*$/.test(id||'')),display:{width:d.size.width,height:d.size.height,scale:d.scaleFactor}};}
function controllerState(){const value=controllerHub?.state()||{count:1,slots:[null,null],capture:null,blocked:[]};return {...value,deadzones:value.slots.map(p=>p?calibrations[p.id]||0:0),paused:suspended||state.recovering||state.page!=='drive'||!!overlay||!!auth||!!managerView||!!robotKeyboard?.visible};}
function blockHeldControllers(){for(const pad of controllerHub?.state().slots||[])if(pad){recoveryControllers.add(pad.id);controllerHub.blocked.add(`${pad.index}:${pad.id}`);}}
function inputConfig(value=controllerState()){const {count,slots,capture,blocked,paused,deadzones}=value;return {count,slots,capture,blocked,paused,deadzones,pads:controllerOutput(value)};}
function sendControllers(force=false){
  if(!controllerHub)return;controllerHub.tick();const value=controllerState(),signature=JSON.stringify(value);if(!force&&signature===lastControllerState)return;lastControllerState=signature;
  emit('controller-state',value);
  // Raw diagnostics stay in the trusted app UI. Robot pages need only slot
  // routing and pause state, not the test screen's other-controller readings.
  const config=inputConfig(value),routing=JSON.stringify(config);if(force||routing!==lastInputConfig){lastInputConfig=routing;for(const view of [win,robotView])try{view?.webContents.send('controller-config',config);}catch{}}
}
const touchSessions=new WeakSet();
function touchSession(session){if(!touchSessions.has(session)){session.registerPreloadScript({type:'frame',filePath:path.join(__dirname,'touch-preload.cjs')});touchSessions.add(session);}}
function controllerSession(session){if(!controllerSessions.has(session)){session.registerPreloadScript({type:'frame',filePath:path.join(__dirname,'controller-preload.cjs')});touchSession(session);controllerSessions.add(session);}}
function controllerSender(e){return e.sender===win?.webContents||e.sender===robotView?.webContents;}
ipcMain.on('controller-ready',e=>{if(controllerSender(e)&&e.senderFrame===e.sender.mainFrame)e.reply('controller-config',inputConfig());});
ipcMain.on('controller-input',(e,pads)=>{
  if(!controllerHub||e.sender!==win?.webContents||e.senderFrame!==e.sender.mainFrame)return;
  lastControllerInput=performance.now();controllerHub.ingest(pads);
  for(const pad of controllerHub.pads)if(recoveryControllers.has(pad.id)){if(!pad.pressed&&!controllerHub.axesActive(pad))recoveryControllers.delete(pad.id);else controllerHub.blocked.add(`${pad.index}:${pad.id}`);}
  if(suspended||state.recovering)blockHeldControllers();sendControllers();
});
function captureController(slot){controllerHub.begin(slot);win.webContents.focus();sendControllers(true);emit('controller-capture',controllerState());return controllerState();}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function closeManager(){
  robotKeyboard?.hide({focus:false});
  const view=managerView,proxy=managerProxy;managerView=null;managerProxy=null;
  if(view){try{win.contentView.removeChildView(view);view.webContents.close();}catch{}}
  if(proxy)await proxy.close();if(state.manager)update({manager:false});fitView();
}
async function closeRobot({retain=false}={}){
  if(!retain&&interruption)await interruption;
  connectionEpoch++;
  const selection=retain?{robot:active||state.robot,url:state.url||active?.url||'',title:state.title,kind:state.kind}:{};
  robotKeyboard?.hide({focus:false});
  await setRobotFullscreen(false);
  if(auth){auth.callback();auth=null;}
  await closeManager();
  // An FTC station sends STOP for an active op mode before its socket closes; the robot also stops on its own after 2 s.
  if(robotView&&bridge instanceof FtcSocket){try{await Promise.race([robotView.webContents.executeJavaScript('window.deckShutdown?.()'),delay(300)]);await delay(80);}catch{}}
  const view=robotView,proxy=bridge;robotView=null;bridge=null;active=null;
  controllerHub?.cancel();if(!retain)controllerHub?.setCount(1);sendControllers(true);
  if(view){try{win.contentView.removeChildView(view);view.webContents.close();}catch{}}
  if(proxy)await proxy.close();update({loading:false,robot:null,url:'',title:'',error:'',kind:'',recovering:false,...selection,...(retain?{recovering:true}:{})});
}
function interruptRobot(message){
  connectionEpoch++;finding?.abort();
  if(interruption)return interruption;
  if(!state.url&&!active)return Promise.resolve();
  update({loading:false,recovering:true,error:message});blockHeldControllers();sendControllers(true);
  interruption=closeRobot({retain:true}).then(()=>update({error:message})).finally(()=>{interruption=null;});
  return interruption;
}
function place(view,visible){const [width,fullHeight]=win.getContentSize(),height=fullHeight-(robotKeyboard?.visible?robotKeyboard.height():0);if(state.robotFullscreen){view.setBounds({x:0,y:0,width,height});view.setVisible(visible);return;}const x=Math.min(Math.max(0,Math.round(viewBounds.x)),width),y=Math.min(Math.max(0,Math.round(viewBounds.y)),height);view.setBounds({x,y,width:Math.max(0,Math.min(Math.round(viewBounds.width),width-x)),height:Math.max(0,Math.min(Math.round(viewBounds.height),height-y))});view.setVisible(visible);}
function fitView(){
  if(!robotView||!win)return;const shown=state.page==='drive'&&!auth&&!state.error&&!overlay;
  if(managerView)place(managerView,shown);place(robotView,shown&&!managerView);
  if(robotExitView){const [width]=win.getContentSize();robotExitView.setBounds({x:Math.max(0,width-60),y:12,width:48,height:48});robotExitView.setVisible(state.robotFullscreen&&shown);}
  robotKeyboard?.layout();
  // Hidden Driver Station: gamepads are released to rest, the connection (and a running op mode) continues.
  if(bridge instanceof FtcSocket)try{robotView.webContents.send('ftc-active',shown&&!managerView);}catch{}
  sendControllers();
}
async function ensureRobotExit(){
  if(robotExitView){await robotExitReady;win.contentView.removeChildView(robotExitView);win.contentView.addChildView(robotExitView);return;}
  const view=new WebContentsView({webPreferences:{preload:path.join(__dirname,'robot-fullscreen-preload.cjs'),partition:'robot-fullscreen-controls',sandbox:true,contextIsolation:true,nodeIntegration:false}});
  robotExitView=view;view.setVisible(false);view.setBackgroundColor('#00000000');win.contentView.addChildView(view);
  const file=path.join(__dirname,'../ui/robot-fullscreen-exit.html'),url=require('node:url').pathToFileURL(file).href;lockDown(view.webContents,target=>target===url);
  view.webContents.on('render-process-gone',()=>{if(robotExitView!==view)return;win?.contentView.removeChildView(view);robotExitView=null;void setRobotFullscreen(false);});
  robotExitReady=view.webContents.loadFile(file);
  try{await robotExitReady;}catch(error){if(robotExitView===view){win?.contentView.removeChildView(view);robotExitView=null;}view.webContents.close();throw error;}finally{robotExitReady=null;}
}
async function setRobotFullscreen(enabled){
  enabled=!!enabled;if(enabled===state.robotFullscreen)return snapshot();
  if(enabled){
    if(!robotView||state.page!=='drive'||state.loading||state.error||auth||overlay)throw Error('Open a robot before expanding its view.');
    await ensureRobotExit();if(state.robotFullscreen)return snapshot();
    if(!robotView||state.page!=='drive'||state.loading||state.error||auth||overlay||!win||win.isDestroyed())throw Error('Open a robot before expanding its view.');
    robotFullscreenPrevious=win.isFullScreen();update({robotFullscreen:true});win.setFullScreen(true);fitView();(managerView||robotView).webContents.focus();
  }else{
    update({robotFullscreen:false});robotExitView?.setVisible(false);if(win&&!win.isDestroyed()){if(!robotFullscreenPrevious&&win.isFullScreen())win.setFullScreen(false);fitView();if(state.page==='drive') (managerView||robotView)?.webContents.focus();}
  }
  return snapshot();
}
function robotEscape(contents){contents.on('before-input-event',(_event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'){robotKeyboard?.hide();if(state.robotFullscreen)void setRobotFullscreen(false);}});contents.on('did-start-navigation',(_event,_url,inPlace,mainFrame)=>{if(mainFrame&&!inPlace)robotKeyboard?.hide({focus:false});});}
handle('robot-fullscreen',setRobotFullscreen);
ipcMain.handle('robot-fullscreen-exit',async e=>{if(e.sender!==robotExitView?.webContents||e.senderFrame!==e.sender.mainFrame)throw Error('Only the fullscreen exit button can restore this view.');await setRobotFullscreen(false);});
async function refreshNetwork(){
  const next=await network.status(),previous=currentNetwork;currentNetwork=next;
  if(previous&&(next.ssid!==previous.ssid||next.device!==previous.device))finding?.abort();
  const expected=active?.ssid||state.robot?.ssid||previous?.ssid;
  if((robotView||opening&&state.url)&&expected&&next.ssid!==expected&&!network.busy&&!suspended){await interruptRobot(next.ssid?'Wi-Fi changed. Your robot address is saved. Choose Try again to reconnect to its network.':'Wi-Fi disconnected. Your robot address is saved. Reconnect Wi-Fi, then choose Try again.');}
  emit('network',next);return next;
}
async function openRobot(input){
  finding?.abort();
  if(opening)throw Error('A robot connection is already opening.');opening=true;
  try{
    if(interruption)await interruption;
    if(suspended)throw Error('Wait for this device to wake before reconnecting.');
    const saved=input.id?library.get(input.id):null,target={...saved,...input,url:normalizeUrl(input.url||saved?.url)};
    const wifi=await refreshNetwork(),ssid=cleanSsid(input.id&&!input.url?saved?.ssid||wifi.ssid:input.ssid||wifi.ssid);
    if(ssid&&wifi.ssid!==ssid)return {needsWifi:{ssid},request:target};
    // The automatic FTC check holds UDP 20884 for up to 1.5 s; let it finish first.
    for(let i=0;auto.busy&&i<40;i++)await delay(50);
    await closeRobot();
    if(suspended)throw Error('Wait for this device to wake before reconnecting.');
    const epoch=++connectionEpoch;active={...target,ssid};
    update({page:'drive',loading:true,url:target.url,title:target.name||'Opening robot',robot:active,error:''});
    // FTC Robot Controllers answer Robocol discovery on UDP 20884 and get the Driver Station; everything else is a website.
    // The Settings "FTC robot" box forces the Driver Station; unticked ("auto") detects again.
    let kind=input.kind==='ftc'?'ftc':input.kind==='auto'?undefined:saved?.url===target.url?saved.kind:undefined;
    if(!kind){kind=(await probeFtc(new URL(target.url).hostname)).ftc?'ftc':'web';}
    if(epoch!==connectionEpoch||suspended)return {opened:false};
    if(kind==='ftc')return await openFtc(target,ssid,epoch);
    const proxy=new RobotProxy(target.url),localUrl=await proxy.start();if(epoch!==connectionEpoch||suspended){await proxy.close();return {opened:false};}bridge=proxy;
    const identity=createHash('sha256').update(`${ssid}\0${new URL(target.url).origin}`).digest('hex');
    const view=new WebContentsView({webPreferences:{partition:`persist:robot-${identity}`,additionalArguments:robotArguments(),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,webSecurity:true}});
    robotView=view;active={...target,ssid};win.contentView.addChildView(view);
    const contents=view.webContents,session=contents.session;
    robotEscape(contents);
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
    contents.on('render-process-gone',()=>{if(robotView===view)void interruptRobot('Robot page closed unexpectedly. Your address is saved. Choose Try again to reconnect.');});
    update({page:'drive',loading:true,url:target.url,title:target.name||'Opening robot',robot:active,error:''});fitView();
    void contents.loadURL(localUrl).then(()=>{if(robotView===view)contents.focus();}).catch(e=>{if(robotView===view)update({loading:false,error:e.message});});return {opened:true};
  }finally{opening=false;}
}
function lockDown(contents,allowed){
  const session=contents.session;session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));session.setPermissionCheckHandler(()=>false);
  contents.on('will-navigate',(e,url)=>{if(!allowed(url))e.preventDefault();});contents.setWindowOpenHandler(({url})=>{if(allowed(url))void contents.loadURL(url);return {action:'deny'};});
}
async function openFtc(target,ssid,epoch){
  const host=new URL(target.url).hostname,socket=new FtcSocket(host);
  try{await socket.open();}catch(e){if(epoch===connectionEpoch)update({page:'drive',loading:false,url:target.url,title:target.name||host,error:e.message});return {opened:false};}
  if(epoch!==connectionEpoch||suspended){await socket.close();return {opened:false};}
  const robot=library.upsert({...target,ssid,kind:'ftc'},{opened:true});
  const view=new WebContentsView({webPreferences:{preload:path.join(__dirname,'ftc-preload.cjs'),partition:'ftc-driver-station',additionalArguments:robotArguments(),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,webSecurity:true}});
  const page=path.join(__dirname,'../ui/ftc/index.html'),pageUrl=require('node:url').pathToFileURL(page).href;
  robotView=view;bridge=socket;active=robot;win.contentView.addChildView(view);lockDown(view.webContents,url=>url===pageUrl);
  robotEscape(view.webContents);
  controllerSession(view.webContents.session);controllerHub.setCount(robot.controllerCount);
  socket.onPacket(bytes=>{if(robotView===view)view.webContents.send('ftc-packet',bytes);});
  view.webContents.on('render-process-gone',()=>{if(robotView===view)void interruptRobot('The Driver Station closed unexpectedly. Your robot address is saved. Choose Try again to reconnect.');});
  update({page:'drive',loading:false,url:target.url,title:robot.name,robot,kind:'ftc',error:''});fitView();
  await view.webContents.loadFile(page);if(robotView===view){view.webContents.focus();fitView();}return {opened:true,kind:'ftc'};
}
// Program & Manage: the Robot Controller's own web interface (port 8080) over the existing website bridge.
async function openManager(){
  if(!(bridge instanceof FtcSocket))throw Error('Program & Manage is available for FTC robots.');await closeManager();
  const proxy=new RobotProxy(`http://${bridge.host.includes(':')?`[${bridge.host}]`:bridge.host}:8080/`),localUrl=await proxy.start();
  const view=new WebContentsView({webPreferences:{partition:`persist:robot-manage-${createHash('sha256').update(bridge.host).digest('hex')}`,additionalArguments:robotArguments(),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  touchSession(view.webContents.session);
  managerView=view;managerProxy=proxy;win.contentView.addChildView(view);lockDown(view.webContents,url=>{try{return new URL(url).origin===proxy.origin;}catch{return false;}});
  if(state.robotFullscreen&&robotExitView){win.contentView.removeChildView(robotExitView);win.contentView.addChildView(robotExitView);}
  robotEscape(view.webContents);
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
  if(suspended||state.recovering||auto.busy||auto.dismissed||robotView||opening||finding||updater?.busy||network.busy||!library||!ssid)return;
  const saved=library.list(ssid).filter(r=>r.ssid===ssid&&r.kind==='ftc');if(!saved.length)return;
  auto.busy=true;
  try{
    const host=await findFtc([...new Set(saved.map(r=>new URL(r.url).hostname))]);const robot=saved.find(r=>new URL(r.url).hostname===host);
    if(robot&&!suspended&&!state.recovering&&!robotView&&!opening&&!auto.dismissed&&(currentNetwork?.ssid||'')===ssid){auto.busy=false;await openRobot({id:robot.id});}
  }catch(e){emit('notice',e.message);}finally{auto.busy=false;}
}
handle('bootstrap',async()=>{await refreshNetwork();setTimeout(()=>void autoOpenFtc(),300);return {state:snapshot(),hardware:hardware(),app:{version:meta.version,channel:meta.updateChannel}};});handle('open',openRobot);handle('close',async()=>{auto.dismissed=true;await closeRobot();});
// The open robot stays connected while Settings is shown; it is hidden, not closed.
handle('page',async page=>{if(!['drive','settings'].includes(page))throw Error('Unknown app view.');if(page!=='drive'){robotKeyboard?.hide({focus:false});await setRobotFullscreen(false);}update({page});fitView();return snapshot();});
handle('save',async input=>{const wifi=await refreshNetwork();const robot=library.upsert({...input,ssid:wifi.ssid||''});if(active?.id===robot.id){active=robot;controllerHub.setCount(robot.controllerCount);update({robot});sendControllers(true);}else update();return robot;});handle('remove',id=>{library.remove(id);update();});
handle('network',refreshNetwork);handle('scan',()=>network.scan());
handle('discovery-info',async()=>{const context=await network.context();return {...context,reason:discovery.eligibility(context)};});
handle('discover-robot',async input=>{if(finding)throw Error('Already finding a robot.');if(robotView||opening)throw Error('Close the current robot before finding another.');const controller=new AbortController();finding=controller;try{return await discovery.discover({network,ssid:input?.ssid,confirmed:input?.confirmed,signal:controller.signal});}finally{if(finding===controller)finding=null;}});
handle('discovery-cancel',()=>{finding?.abort();});
handle('join',async(ssid,password)=>{await closeRobot();let info;try{info=await network.join(ssid,password);}catch(e){if(e.code==='NEEDS_PASSWORD')return {needsPassword:true,ssid,message:e.message};throw e;}currentNetwork=info;emit('network',info);update();setTimeout(()=>void autoOpenFtc(),500);return info;});
handle('system-wifi',async()=>{
  await closeRobot();if(process.platform==='win32')return shell.openExternal('ms-settings:network-wifi');
  if(process.platform==='darwin')return shell.openExternal('x-apple.systempreferences:com.apple.wifi-settings-extension');
  await run('systemsettings',['kcm_networkmanagement'],{timeout:5000}).catch(e=>{if(e.killed)return;throw Error('Open Wi-Fi from the SteamOS quick settings menu.');});
});
handle('bounds',bounds=>{if(!bounds||!['x','y','width','height'].every(k=>Number.isFinite(bounds[k])&&bounds[k]>=0))throw Error('Invalid robot view bounds.');if(!state.robotFullscreen)viewBounds=bounds;fitView();});
handle('overlay',visible=>{const previous=overlay;overlay=!!visible;if(overlay)robotKeyboard?.hide({focus:false});fitView();if(previous&&!overlay&&state.page==='drive'&&win.isFocused())robotView?.webContents.focus();});
handle('robot-focus',()=>{if(state.page==='drive'&&!overlay&&!auth&&!robotKeyboard?.visible&&win.isFocused())(managerView||robotView)?.webContents.focus();});
handle('reload',()=>{const view=managerView||robotView;if(view)view.webContents.reload();});handle('back',async()=>{const view=managerView||robotView;if(view?.webContents.navigationHistory.canGoBack())view.webContents.navigationHistory.goBack();else if(managerView)await closeManager();});
handle('controllers',()=>controllerHub.state().slots);
handle('controller-info',()=>controllerState());handle('controller-capture',captureController);handle('controller-cancel',()=>{controllerHub.cancel();sendControllers(true);return controllerState();});
handle('controller-automatic',()=>{controllerHub.automatic();sendControllers(true);return controllerState();});
handle('controller-calibration',({slot,zone})=>{if(![1,2].includes(slot))throw Error('Choose controller 1 or controller 2.');const pad=controllerHub.state().slots[slot-1];if(!pad||pad.mapping!=='standard')throw Error('Connect a mapped controller first.');const next=Object.assign(Object.create(null),calibrations,{[pad.id]:deadzone(zone)});fs.writeFileSync(calibrationFile+'.tmp',JSON.stringify(next),{mode:0o600});fs.renameSync(calibrationFile+'.tmp',calibrationFile);calibrations=next;controllerHub.blocked.add(`${pad.index}:${pad.id}`);sendControllers(true);return controllerState();});
handle('auth',({id,username,password,cancel})=>{if(!auth||auth.id!==id)throw Error('This sign-in prompt expired.');const pending=auth;auth=null;if(cancel)pending.callback();else pending.callback(String(username||'').slice(0,256),String(password||'').slice(0,1024));fitView();});
handle('fullscreen',()=>win.setFullScreen(!win.isFullScreen()));handle('quit',()=>app.quit());
handle('update-info',async()=>{auto.dismissed=true;finding?.abort();await closeRobot();return updater.info();});
handle('update-check',()=>updater.check());
handle('update-channel',(channel,confirmed)=>updater.setChannel(channel,confirmed));
handle('update-download',()=>updater.downloadAndInstall(async download=>{await closeRobot();const prepared=await prepareInstall(download,{appPath:app.getAppPath(),executable:process.execPath});await launchInstall(prepared);setTimeout(()=>app.quit(),200);return {restarting:true};}));
app.on('login',(event,contents,details,info,callback)=>{
  if(contents!==robotView?.webContents)return;event.preventDefault();if(auth)auth.callback();auth={id:randomUUID(),callback};robotKeyboard?.hide({focus:false});robotView.setVisible(false);emit('auth',{id:auth.id,host:active?.url||'',realm:info.realm||'',retry:!details.firstAuthAttempt});
  void setRobotFullscreen(false);
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
  powerMonitor.on('suspend',()=>{suspended=true;blockHeldControllers();sendControllers(true);void interruptRobot('Device sleeping. Your robot address is saved. After waking and reconnecting Wi-Fi, choose Try again.');});
  powerMonitor.on('resume',()=>{suspended=false;lastControllerInput=0;controllerHub?.ingest([]);sendControllers(true);void (async()=>{if(interruption)await interruption;await refreshNetwork();if(state.recovering)update({error:'Device resumed. Your robot address is saved. Check Wi-Fi, then choose Try again. Robot controls stay neutral until released.'});})().catch(e=>emit('notice',e.message));});
  device=await detectHardware();
  recoverSandboxedLibrary(app.getPath('userData'));
  const controllerFile=path.join(app.getPath('userData'),'controller-settings.json');let preferred=[];try{const saved=JSON.parse(fs.readFileSync(controllerFile,'utf8'));if(Array.isArray(saved))preferred=saved;}catch{}
  controllerHub=new ControllerHub({hardware:device,preferred,zoneFor:id=>calibrations[id]||0,persist:value=>fs.writeFileSync(controllerFile,JSON.stringify(value),{mode:0o600})});
  calibrationFile=path.join(app.getPath('userData'),'controller-calibration.json');try{for(const [id,zone]of Object.entries(JSON.parse(fs.readFileSync(calibrationFile,'utf8')))){if(id.length<=2048)calibrations[id]=deadzone(zone);}}catch{}
  updater=new Updater({directory:app.getPath('userData'),version:meta.version,repo:meta.repository.url,channel:meta.updateChannel,onProgress:p=>emit('update-progress',p)});
  try{library=new Library(path.join(app.getPath('userData'),'robots.json'));}catch(e){state.error=`Saved library could not be read: ${e.message}`;library=new Library(path.join(app.getPath('userData'),`robots-recovered-${Date.now()}.json`));}
  const d=screen.getPrimaryDisplay().workAreaSize;
  win=new BrowserWindow({show:process.env.DECK_HEADLESS!=='1',width:Math.min(1280,d.width),height:Math.min(800,d.height),minWidth:360,minHeight:480,title:'Deck Driver Station',icon:path.join(__dirname,'../ui/icon.png'),backgroundColor:'#080808',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),additionalArguments:[...controllerArguments,'--deck-controller-shell'],partition:'persist:launcher',sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  robotKeyboard=new RobotKeyboard({WebContentsView,ipcMain,window:()=>win,robot:()=>managerView||robotView,allowed:()=>!!win&&!win.isDestroyed()&&state.page==='drive'&&!overlay&&!auth&&!state.error,changed:()=>fitView(),released:()=>{for(const pad of controllerHub.state().slots)if(pad)controllerHub.blocked.add(`${pad.index}:${pad.id}`);}});
  controllerSession(win.webContents.session);const controllerTimer=setInterval(()=>{if(lastControllerInput&&performance.now()-lastControllerInput>500)controllerHub.ingest([]);sendControllers();},100);controllerTimer.unref();
  win.webContents.on('render-process-gone',()=>{lastControllerInput=0;controllerHub.ingest([]);sendControllers(true);});
  Menu.setApplicationMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.on('resize',fitView);win.loadFile(path.join(__dirname,'../ui/index.html'));
  win.on('enter-full-screen',fitView);win.on('leave-full-screen',()=>{if(state.robotFullscreen)void setRobotFullscreen(false);else fitView();});
  win.on('close',()=>robotKeyboard?.close());win.on('closed',()=>{robotExitView?.webContents.close();robotExitView=null;});
  pollTimer=setInterval(()=>{if(!network.busy)void refreshNetwork().then(()=>autoOpenFtc());},5000);pollTimer.unref();
});
let closing=false;app.on('before-quit',e=>{if(closing)return;e.preventDefault();closing=true;clearInterval(pollTimer);void closeRobot().finally(()=>app.quit());});app.on('window-all-closed',()=>app.quit());
