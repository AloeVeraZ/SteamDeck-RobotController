'use strict';
const {app,BrowserWindow,WebContentsView,ipcMain,screen,Menu,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path');const {execFile}=require('node:child_process');const {promisify}=require('node:util');const {createHash,randomUUID}=require('node:crypto');
const {Library,normalizeUrl,cleanSsid}=require('./library.cjs');const {Network}=require('./network.cjs');const {RobotProxy}=require('./robot-proxy.cjs');
const {Updater,prepareInstall,launchInstall}=require('./updater.cjs');const meta=require('../package.json');let updater;
const run=promisify(execFile);let win,library,robotView=null,bridge=null,auth=null,pollTimer,active=null,currentNetwork=null,opening=false,viewBounds={x:0,y:127,width:1280,height:643};
const state={page:'drive',loading:false,url:'',title:'',error:'',robot:null};const network=new Network();let overlay=false;
app.setName('Deck Driver Station');
if(process.env.DECK_DATA_DIR){fs.mkdirSync(process.env.DECK_DATA_DIR,{recursive:true});app.setPath('userData',process.env.DECK_DATA_DIR);}
if(!app.requestSingleInstanceLock())app.quit();app.on('second-instance',()=>{win?.show();win?.focus();});
function emit(channel,value){try{if(win&&!win.isDestroyed())win.webContents.send(channel,value);}catch{}}
function snapshot(){return {...state,robots:library?.list(currentNetwork?.ssid),network:currentNetwork};}
function update(patch={}){Object.assign(state,patch);emit('state',snapshot());}
function trusted(e){if(!win||e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)throw Error('Only app settings can perform this action.');}
function handle(channel,fn){ipcMain.handle(channel,async(e,...args)=>{try{trusted(e);return {ok:true,value:await fn(...args)};}catch(e){return {ok:false,error:e.message,code:e.code};}});}
function hardware(){let model=process.platform==='win32'?'Windows desktop':process.platform==='darwin'?'Mac':'Linux desktop';if(process.platform==='linux'){try{const s=fs.readFileSync('/sys/class/dmi/id/product_name','utf8').trim();if(/jupiter/i.test(s))model='Steam Deck LCD';else if(/galileo/i.test(s))model='Steam Deck OLED';}catch{}}const d=screen.getDisplayMatching(win.getBounds());return {model,platform:process.platform,display:{width:d.size.width,height:d.size.height,scale:d.scaleFactor}};}
async function closeRobot(){
  if(auth){auth.callback();auth=null;}
  const view=robotView,proxy=bridge;robotView=null;bridge=null;active=null;
  if(view){try{win.contentView.removeChildView(view);view.webContents.close();}catch{}}
  if(proxy)await proxy.close();update({loading:false,robot:null,url:'',title:'',error:''});
}
function fitView(){if(!robotView)return;const [width,height]=win.getContentSize();const x=Math.min(Math.max(0,Math.round(viewBounds.x)),width),y=Math.min(Math.max(0,Math.round(viewBounds.y)),height);robotView.setBounds({x,y,width:Math.max(0,Math.min(Math.round(viewBounds.width),width-x)),height:Math.max(0,Math.min(Math.round(viewBounds.height),height-y))});robotView.setVisible(state.page==='drive'&&!auth&&!state.error&&!overlay);}
async function refreshNetwork(){
  const next=await network.status(),previous=currentNetwork;currentNetwork=next;
  if(robotView&&previous?.ssid&&next.ssid!==previous.ssid&&!network.busy){await closeRobot();update({error:'Wi-Fi changed. Open the robot saved for this network.'});}
  emit('network',next);return next;
}
async function openRobot(input){
  if(opening)throw Error('A robot connection is already opening.');opening=true;
  try{
    const saved=input.id?library.get(input.id):null,target={...saved,...input,url:normalizeUrl(input.url||saved?.url)};
    const wifi=await refreshNetwork(),ssid=cleanSsid(target.ssid||wifi.ssid);
    if(ssid&&wifi.ssid!==ssid)return {needsWifi:{ssid},request:target};
    await closeRobot();const proxy=new RobotProxy(target.url),localUrl=await proxy.start();bridge=proxy;
    const identity=createHash('sha256').update(`${ssid}\0${new URL(target.url).origin}`).digest('hex');
    const view=new WebContentsView({webPreferences:{partition:`persist:robot-${identity}`,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,webSecurity:true}});
    robotView=view;active={...target,ssid};win.contentView.addChildView(view);
    const contents=view.webContents,session=contents.session;
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
      const robot=library.upsert({...active,url:robotUrl},{opened:true,title});active=robot;update({loading:false,title:title||robot.name,url:robotUrl,robot});
    });
    contents.on('page-title-updated',(_e,title)=>{if(robotView===view){if(active?.id)library.updateTitle(active.id,title);update({title});}});
    contents.on('did-fail-load',(_e,code,message,_url,isMainFrame)=>{if(robotView===view&&isMainFrame&&code!==-3){view.setVisible(false);update({loading:false,error:`Could not open the robot: ${message}`});}});
    contents.on('render-process-gone',()=>{if(robotView===view)void closeRobot().then(()=>update({error:'Robot page closed unexpectedly. Open it again to reconnect.'}));});
    update({page:'drive',loading:true,url:target.url,title:target.name||'Opening robot',robot:saved||null,error:''});fitView();
    void contents.loadURL(localUrl).then(()=>{if(robotView===view)contents.focus();}).catch(e=>{if(robotView===view)update({loading:false,error:e.message});});return {opened:true};
  }finally{opening=false;}
}
handle('bootstrap',async()=>{await refreshNetwork();return {state:snapshot(),hardware:hardware()};});handle('open',openRobot);handle('close',closeRobot);
handle('page',async page=>{if(!['drive','settings'].includes(page))throw Error('Unknown app view.');if(page==='settings')await closeRobot();update({page});fitView();return snapshot();});
handle('save',input=>{const robot=library.upsert(input);update();return robot;});handle('remove',id=>{library.remove(id);update();});
handle('network',refreshNetwork);handle('scan',()=>network.scan());
handle('join',async(ssid,password)=>{await closeRobot();const info=await network.join(ssid,password);currentNetwork=info;emit('network',info);update();return info;});
handle('system-wifi',async()=>{
  await closeRobot();if(process.platform==='win32')return shell.openExternal('ms-settings:network-wifi');
  if(process.platform==='darwin')return shell.openExternal('x-apple.systempreferences:com.apple.wifi-settings-extension');
  await run('systemsettings',['kcm_networkmanagement'],{timeout:5000}).catch(e=>{if(e.killed)return;throw Error('Open Wi-Fi from the SteamOS quick settings menu.');});
});
handle('bounds',bounds=>{if(!bounds||!['x','y','width','height'].every(k=>Number.isFinite(bounds[k])&&bounds[k]>=0))throw Error('Invalid robot view bounds.');viewBounds=bounds;fitView();});
handle('overlay',visible=>{overlay=!!visible;fitView();});
handle('reload',()=>{if(robotView)robotView.webContents.reload();});handle('back',()=>{if(robotView?.webContents.navigationHistory.canGoBack())robotView.webContents.navigationHistory.goBack();});
handle('controllers',async()=>{if(!robotView)return null;try{return await robotView.webContents.executeJavaScript(`Array.from(navigator.getGamepads?.()||[]).filter(p=>p?.connected).slice(0,2).map(p=>({id:p.id,index:p.index,mapping:p.mapping}))`);}catch{return [];}});
handle('auth',({id,username,password,cancel})=>{if(!auth||auth.id!==id)throw Error('This sign-in prompt expired.');const pending=auth;auth=null;if(cancel)pending.callback();else pending.callback(String(username||'').slice(0,256),String(password||'').slice(0,1024));fitView();});
handle('fullscreen',()=>win.setFullScreen(!win.isFullScreen()));handle('quit',()=>app.quit());
handle('update-info',async()=>{await closeRobot();return updater.info();});
handle('update-check',repo=>updater.check(repo));
handle('update-download',()=>updater.download());
handle('update-folder',async()=>{if(!updater.downloaded)throw Error('Download an update first.');shell.showItemInFolder(updater.downloaded.file);});
handle('update-install',async()=>{if(!updater.downloaded)throw Error('Download an update first.');await closeRobot();const prepared=await prepareInstall(updater.downloaded,{appPath:app.getAppPath(),executable:process.execPath});await launchInstall(prepared);setTimeout(()=>app.quit(),200);return {restarting:true};});
app.on('login',(event,contents,details,info,callback)=>{
  if(contents!==robotView?.webContents)return;event.preventDefault();if(auth)auth.callback();auth={id:randomUUID(),callback};robotView.setVisible(false);emit('auth',{id:auth.id,host:active?.url||'',realm:info.realm||'',retry:!details.firstAuthAttempt});
});
app.whenReady().then(()=>{
  updater=new Updater({directory:app.getPath('userData'),version:meta.version,repo:meta.repository.url,channel:meta.updateChannel,onProgress:p=>emit('update-progress',p)});
  try{library=new Library(path.join(app.getPath('userData'),'robots.json'));}catch(e){state.error=`Saved library could not be read: ${e.message}`;library=new Library(path.join(app.getPath('userData'),`robots-recovered-${Date.now()}.json`));}
  const d=screen.getPrimaryDisplay().workAreaSize;
  win=new BrowserWindow({show:process.env.DECK_HEADLESS!=='1',width:Math.min(1280,d.width),height:Math.min(800,d.height),minWidth:360,minHeight:480,title:'Deck Driver Station',icon:path.join(__dirname,'../ui/icon.png'),backgroundColor:'#11171b',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),partition:'persist:launcher',sandbox:true,contextIsolation:true,nodeIntegration:false}});
  Menu.setApplicationMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.on('resize',fitView);win.loadFile(path.join(__dirname,'../ui/index.html'));
  pollTimer=setInterval(()=>{if(!network.busy)void refreshNetwork();},5000);pollTimer.unref();
});
let closing=false;app.on('before-quit',e=>{if(closing)return;e.preventDefault();closing=true;clearInterval(pollTimer);void closeRobot().finally(()=>app.quit());});app.on('window-all-closed',()=>app.quit());
