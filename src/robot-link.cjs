'use strict';
// Send to robot: what the app does with a Control Hub over its Wi-Fi, for the simulator's exports.
//  - Reads the robot configuration as a Driver Station does (Robocol commands from FTC SDK 12.0's FtcEventLoopBase):
//    CMD_REQUEST_CONFIGURATIONS lists the saved configurations, CMD_NOTIFY_ACTIVE_CONFIGURATION names the active one, and
//    CMD_REQUEST_PARTICULAR_CONFIGURATION returns its XML.
//  - Uploads and builds code with the hub's own OnBot Java server on port 8080 (handlers from FTC SDK 12.0's OnBotJava
//    library): POST /java/file/save?f=/src/<path> with the form field data, GET /java/file/get?f=..., and
//    /java/build/start, /java/build/status ({completed, running, successful, startTimestamp, timestamp}) and
//    /java/build/log.
//  - Scans the robot's hubs as Configure Robot's Scan does (CMD_SCAN, then CMD_DISCOVER_LYNX_MODULES for each hub portal),
//    and saves a configuration with CMD_SAVE_CONFIGURATION, which the robot writes, makes active and announces with
//    CMD_NOTIFY_ACTIVE_CONFIGURATION. Only under a name the robot does not have yet: a saved configuration is never replaced.
//  - Runs the guided check TeleOp when the person asks (runCheck). It never starts the autonomous.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const Robocol=require('../ui/ftc/robocol.js'),RobotConfig=require('../ui/ftc/robot-config.js'),{FtcSocket}=require('./ftc.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
// A robot address: an IP address or a host name, nothing else (no scheme, port or path).
function checkHost(host){const h=String(host||'').trim();if(!net.isIP(h)&&!/^[A-Za-z0-9]([A-Za-z0-9-]{0,62}\.)*[A-Za-z0-9-]{1,63}$/.test(h))throw Error('Enter the robot address, such as 192.168.43.1.');return h;}

// ---- a Driver Station session, over Robocol
// Connects as a Driver Station, runs task, then disconnects. ask(command, extra) sends a command and waits for the
// robot's next <command>_RESP; until(test) waits for the station's state to pass test; sent(command) waits until the
// robot has acknowledged a command.
async function session(host,task,{timeout=8000,socket=null}={}){
  host=checkHost(host);
  let link=socket;if(!link){try{link=await new FtcSocket(host).open();}catch(e){throw Error(/in use/.test(e.message)?'Another FTC Driver Station on this computer is using the robot connection. Close the robot in Drive (or the other app) and try again.':e.message);}}
  const ds=new Robocol.DriverStation({send:bytes=>link.send(bytes)}),off=link.onPacket(bytes=>ds.receive(bytes)),answers=new Map(),waiters=[];
  ds.on('command',c=>{answers.set(c.name,c.extra);for(const w of [...waiters])if(w.name===c.name){waiters.splice(waiters.indexOf(w),1);w.done(c.extra);}});
  const answer=(name,ms=timeout)=>answers.has(name)?Promise.resolve(answers.get(name)):new Promise((done,fail)=>{const w={name,done:v=>{clearTimeout(t);done(v);}},t=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);fail(Error(`The robot did not answer ${name}.`));},ms);waiters.push(w);});
  const ask=(name,extra='',ms=timeout)=>{answers.delete(name+'_RESP');ds.command(name,extra);return answer(name+'_RESP',ms);};
  const until=(test,ms,message)=>new Promise((done,fail)=>{if(test(ds.state))return done(ds.state);const stop=ds.on('state',s=>{if(test(s)){clearTimeout(t);stop();done(s);}}),t=setTimeout(()=>{stop();fail(Error(message));},ms);});
  const sent=(command,ms=timeout)=>new Promise((done,fail)=>{const began=Date.now(),end=error=>{clearInterval(t);stop();error?fail(error):done();};
    const stop=ds.on('command-failed',c=>{if(c===command)end(Error(`The robot did not take ${command.name}.`));});
    const t=setInterval(()=>{if(!ds.pending.includes(command))end();else if(Date.now()-began>ms)end(Error(`The robot did not take ${command.name}.`));},20);});
  try{
    ds.start();
    const s=await until(s=>['connected','rejected','incompatible'].includes(s.connection),timeout,`No FTC robot answered at ${host}. Join the robot's Wi-Fi and check the Robot Controller app is running.`);
    if(s.connection==='rejected')throw Error('Another Driver Station is connected to this robot. Disconnect it, then try again.');
    if(s.connection==='incompatible')throw Error(`This robot runs an FTC SDK older than this app supports (Robocol ${s.robot?.robocol}).`);
    return await task({ds,ask,answer,until,sent,host});
  }finally{ds.stop();off();if(!socket)await link.close();}
}
const configFile=name=>({name,resourceId:0,location:'LOCAL_STORAGE',isDirty:false});
// The saved configurations (RobotConfigFile entries) and the active one's name.
async function configurations({ask,until},timeout){
  const list=JSON.parse(await ask('CMD_REQUEST_CONFIGURATIONS')),files=Array.isArray(list)?list.filter(c=>c&&typeof c.name==='string'):[];
  // On connecting the station asks for the op modes and the active configuration.
  const active=(await until(s=>s.activeConfig,timeout,'The robot did not say which configuration is active.')).activeConfig.name;
  return {files,active};
}
// The robot's hubs: each hub portal's serial number ("(embedded)" for a Control Hub's own board) and the hubs behind it.
async function scanHubs(ask){
  const serials=RobotConfig.lynxSerials(await ask('CMD_SCAN','',20000)),portals=[];
  for(const serial of serials)portals.push(RobotConfig.lynxModules(await ask('CMD_DISCOVER_LYNX_MODULES',serial,20000)));
  return portals.filter(p=>p.modules.length);
}

// ---- the robot configuration
// The active configuration's devices and hubs. scan: also scan the robot's hubs (portals), to add devices or to make
// a configuration for a robot that has none.
async function readRobot(host,{timeout=8000,socket=null,scan=false}={}){
  return session(host,async link=>{
    const {ask,ds}=link,{files,active:activeName}=await configurations(link,timeout),active=files.find(c=>c.name===activeName)||null,names=files.map(c=>c.name);
    const portals=scan?await scanHubs(ask):undefined,extra=portals?{portals}:{};
    if(!active)return {robot:ds.state.robot,configurations:names,active:null,devices:[],hubs:[],opModes:ds.state.opModes,...extra};
    const xml=await ask('CMD_REQUEST_PARTICULAR_CONFIGURATION',JSON.stringify(active)),parsed=RobotConfig.parse(xml);
    return {robot:ds.state.robot,configurations:names,active:{name:active.name,dirty:!!active.isDirty},xml,...parsed,opModes:ds.state.opModes,...extra};
  },{timeout,socket});
}
// Saves xml as a new configuration and makes it active (the robot announces it), reads it back, then restarts the robot
// so its hardware map is built from it. A name the robot already has is refused.
async function writeConfiguration(host,{name,xml}={},{timeout=8000,socket=null,restart=true}={}){
  if(!RobotConfig.validName(name))throw Error('A configuration name has letters, digits, spaces, - and _ only (up to 40).');
  // A Robocol command carries at most 64 KB.
  if(typeof xml!=='string'||Buffer.byteLength(xml)>60000)throw Error('That is not a robot configuration the robot can take.');
  const devices=RobotConfig.parse(xml).devices;if(xml.includes(';'))throw Error('The robot cannot take a configuration with a ; in it.');
  return session(host,async link=>{
    const {ds,ask,until,sent}=link,{files}=await configurations(link,timeout);
    if(files.some(c=>c.name.toLowerCase()===name.toLowerCase()))throw Error(`The robot already has a configuration named “${name}”. Deck never replaces one.`);
    await sent(ds.command('CMD_SAVE_CONFIGURATION',`${JSON.stringify(configFile(name))};${xml}`));
    await until(s=>s.activeConfig?.name===name,15000,`The robot did not save “${name}”. Check the Robot Controller app, then try again.`);
    const saved=RobotConfig.parse(await ask('CMD_REQUEST_PARTICULAR_CONFIGURATION',JSON.stringify(configFile(name)))).devices;
    if(saved.length!==devices.length||devices.some(d=>!saved.some(s=>s.name===d.name&&s.tag===d.tag&&s.port===d.port&&s.bus===d.bus)))throw Error(`The robot saved “${name}” differently from what was sent. Check it in Configure Robot.`);
    if(restart)await sent(ds.restartRobot());
    return {name,devices:saved.length,restarted:restart};
  },{timeout,socket});
}

// Every configuration the robot keeps, read as Configure Robot lists them: {configurations, active, files: {name: xml}}.
async function readConfigurations(host,{timeout=8000,socket=null}={}){
  return session(host,async link=>{const {ask}=link,{files,active}=await configurations(link,timeout),out={};
    for(const f of files.slice(0,24)){try{const xml=await ask('CMD_REQUEST_PARTICULAR_CONFIGURATION',JSON.stringify(configFile(f.name)));if(/<Robot\b/.test(xml))out[f.name]=xml;}catch{}}
    return {source:'wifi',host,configurations:Object.keys(out),active:{name:active},files:out};},{timeout,socket});}
// Makes a saved configuration the active one, as the Driver Station's Configure Robot does, then restarts the robot so
// its hardware map is built from it.
async function activateConfiguration(host,name,{timeout=8000,socket=null,restart=true}={}){
  return session(host,async link=>{const {ds,until,sent}=link,{files}=await configurations(link,timeout);if(!files.some(c=>c.name===name))throw Error(`The robot has no configuration named “${name}”.`);
    await sent(ds.command('CMD_ACTIVATE_CONFIGURATION',JSON.stringify(configFile(name))));await until(s=>s.activeConfig?.name===name,15000,`The robot did not make “${name}” active.`);
    if(restart)await sent(ds.restartRobot());return {name,restarted:restart};},{timeout,socket});}

// ---- the guided check, run from Deck
// Runs the check TeleOp as a Driver Station does (INIT, then START once it has initialized) and stays connected while
// it runs: onUpdate gets its telemetry, press() presses a gamepad 1 button for the person answering in Deck, and stop()
// stops the op mode (as a Driver Station's stop button does) and disconnects. The check also ends when the op mode stops
// on the robot, when the connection drops, and after `limit`. ended resolves with why: stopped, ended, time or lost.
const BUTTONS=new Set(['a','b','x','y','dpad_up','dpad_down','dpad_left','dpad_right']);
function runCheck(host,opMode,{onUpdate=()=>{},limit=20*60e3,timeout=8000,socket=null}={}){
  if(typeof opMode!=='string'||!opMode||opMode.length>200)throw Error('Which op mode is the check?');
  let finish=()=>{},ds=null,release=null,running=false,stopping=false;const done=new Promise(r=>{finish=why=>{stopping=true;r(why);};});
  const ended=session(host,async({ds:station,until})=>{
    ds=station;
    // The robot lists its op modes on connecting.
    await until(s=>s.opModes.length,timeout,'The robot did not list its op modes.').catch(()=>{});
    if(!ds.state.opModes.some(m=>m.name===opMode))throw Error(`The robot has no op mode “${opMode}”. Send to robot first, so it is built.`);
    if(ds.state.opModeState!=='stopped')throw Error(`“${ds.state.activeOpMode}” is running on the robot. Stop it first.`);
    ds.initOpMode(opMode);await until(s=>s.activeOpMode===opMode&&s.opModeState==='init',10000,'The robot did not INIT the check.');
    // Stopped while it initialized: it never starts.
    if(stopping){ds.stopOpMode();await until(s=>s.opModeState==='stopped',3000,'').catch(()=>{});return 'stopped';}
    ds.startOpMode(opMode);await until(s=>s.opModeState==='running',10000,'The robot did not START the check.');running=true;
    const report=()=>onUpdate({state:ds.state.opModeState,lines:ds.state.telemetry.lines});report();
    const offState=ds.on('state',s=>{report();if(s.connection!=='connected')finish('lost');else if(s.opModeState==='stopped')finish('ended');});
    const timer=setTimeout(()=>finish('time'),limit);
    const why=await done;clearTimeout(timer);offState();clearTimeout(release);running=false;
    if(ds.connected()&&ds.state.opModeState!=='stopped'){ds.setGamepad(1,null);ds.stopOpMode();await until(s=>s.opModeState==='stopped',3000,'').catch(()=>{});}
    return why;
  },{timeout,socket});
  ended.catch(()=>{}).finally(()=>{running=false;});
  let held=false;
  return {ended,
    // A short press (200 ms), as a person taps a button. Only while the check runs.
    press(button){if(!running||!BUTTONS.has(button))return false;clearTimeout(release);ds.setGamepad(1,{id:1,timestamp:Date.now(),[button]:true});release=setTimeout(()=>ds.setGamepad(1,{id:1,timestamp:Date.now()}),200);return true;},
    // This computer's controller 1 (a Steam Deck's own controls, as a standard-mapping gamepad): its face buttons and
    // D-pad are gamepad 1's on the robot for as long as they are held.
    pad(p){if(!running)return;const down=PAD.filter(([i])=>p?.buttons?.[i]?.pressed).map(([,name])=>name);
      if(down.length){clearTimeout(release);held=true;ds.setGamepad(1,{id:1,timestamp:Date.now(),...Object.fromEntries(down.map(name=>[name,true]))});}
      else if(held){held=false;ds.setGamepad(1,{id:1,timestamp:Date.now()});}},
    stop(){finish('stopped');}};
}
const PAD=[[0,'a'],[1,'b'],[2,'x'],[3,'y'],[12,'dpad_up'],[13,'dpad_down'],[14,'dpad_left'],[15,'dpad_right']];

// ---- OnBot Java, over HTTP on port 8080
// The OnBot Java editor's own form encoding (encodeURIComponent, plus ! ' ( ) *).
const formEncode=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
function request(host,method,route,body,{timeout=15000,port=8080}={}){
  return new Promise((resolve,reject)=>{
    const data=body===undefined?null:Buffer.from(body,'utf8');
    const req=http.request({host,port,method,path:route,headers:{...(data?{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Content-Length':data.length}:{})}},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,text:Buffer.concat(chunks).toString('utf8')}));});
    req.setTimeout(timeout,()=>req.destroy(Object.assign(Error('timed out'),{code:'ETIMEDOUT'})));
    req.on('error',e=>reject(Object.assign(Error(`Could not reach the robot's OnBot Java at http://${host}:${port} (${e.code||e.message}). Join the robot's Wi-Fi, and check the Robot Controller app is running.`),{code:e.code})));
    if(data)req.write(data);req.end();
  });
}
// An export path under TeamCode's java folder, as OnBot Java keeps it under /src.
const sourcePath=file=>{if(!/^[A-Za-z_][\w]*(\/[A-Za-z_][\w]*)*\.java$/.test(file))throw Error(`${file} is not a Java source path.`);return '/src/'+file;};
class OnBotJava{
  constructor(host,options={}){this.host=checkHost(host);this.options=options;}
  call(method,route,body,options){return request(this.host,method,route,body,{...this.options,...options});}
  // Whether the robot runs OnBot Java at all (its build status answers).
  async available(){const r=await this.call('GET','/java/build/status');if(r.status!==200)throw Error(`The robot at ${this.host} has no OnBot Java (HTTP ${r.status}). Use a Control Hub, or a Robot Controller phone with its programming mode on.`);return JSON.parse(r.text);}
  // The robot's copy of a file, or null when it has none (OnBot Java answers 404 "File Not Found!").
  async read(file){const r=await this.call('GET','/java/file/get?f='+sourcePath(file));if(r.status===404)return null;if(r.status!==200)throw Error(`The robot did not return ${path.basename(file)} (HTTP ${r.status}: ${r.text.slice(0,120)}).`);return r.text;}
  async save(file,text){const r=await this.call('POST','/java/file/save?f='+sourcePath(file),'data='+formEncode(text));if(r.status!==200)throw Error(`The robot refused to save ${path.basename(file)} (HTTP ${r.status}${r.text?`: ${r.text.slice(0,120)}`:''}).`);}
  async status(){const r=await this.call('GET','/java/build/status');if(r.status!==200)throw Error(`The robot's build status could not be read (HTTP ${r.status}).`);return JSON.parse(r.text);}
  // Builds everything in OnBot Java and waits for it. Resolves with whether it built, how long it took and its log.
  async build({timeout=240000,poll=500,onProgress=()=>{}}={}){
    const began=Date.now();let launched=NaN;
    // A successful start answers with the new build's start time (a JSON number).
    for(let attempt=0;attempt<2;attempt++){const r=await this.call('GET','/java/build/start');if(r.status===200){launched=Number(r.text.trim());break;}
      // Another build is running: wait for it, then start ours.
      await this.waitIdle(timeout,poll);}
    onProgress('building');
    for(;;){
      if(Date.now()-began>timeout)throw Error('The robot did not finish building within 4 minutes.');
      const s=await this.status();
      if(s.completed&&!s.running&&(!Number.isFinite(launched)||s.startTimestamp>=launched)){const log=(await this.call('GET','/java/build/log')).text||'';return {built:!!s.successful,seconds:+((Date.now()-began)/1000).toFixed(1),log,errors:buildErrors(log)};}
      await delay(poll);
    }
  }
  async waitIdle(timeout,poll){const began=Date.now();while(Date.now()-began<timeout){const s=await this.status();if(!s.running)return;await delay(poll);}throw Error('A build on the robot did not finish.');}
}
// Compiler errors from a build log: file, line and message for each.
function buildErrors(log){
  const out=[];for(const m of String(log).matchAll(/([\w./\\-]+\.java):(\d+)(?::\d+)?:\s*error:\s*([^\r\n]*)/gi))out.push({file:path.basename(m[1]),line:Number(m[2]),message:m[3].trim()});
  return out.slice(0,20);
}
// Uploads the export's files and builds them. A file the robot already has with other contents is kept on this computer
// first (backupDir); files listed in keep are written only when the robot does not have them yet.
async function send(host,files,{keep=[],backupDir,onProgress=()=>{},client=new OnBotJava(host)}={}){
  const entries=Object.entries(files||{});if(!entries.length)throw Error('Nothing to send.');
  const backups=[],written=[],kept=[];
  // Just after a new configuration the robot restarts, and its web server may refuse a connection for a moment.
  for(let attempt=0;;attempt++){try{await client.available();break;}catch(e){if(!['ECONNREFUSED','ECONNRESET'].includes(e.code)||attempt>=8)throw e;await delay(1000);}}
  for(const [file,text] of entries){
    if(typeof text!=='string'||text.length>4*1024*1024)throw Error(`${file} is not a source file.`);
    onProgress('uploading',path.basename(file));
    const theirs=await client.read(file);
    if(theirs!==null&&keep.includes(file)){kept.push(path.basename(file));continue;}
    if(theirs!==null&&theirs.replace(/\r\n/g,'\n')!==text.replace(/\r\n/g,'\n')&&backupDir){
      const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dir=path.join(backupDir,client.host.replace(/[^\w.-]/g,'_'));fs.mkdirSync(dir,{recursive:true});
      const copy=path.join(dir,`${stamp}-${path.basename(file)}`);fs.writeFileSync(copy,theirs);backups.push(copy);}
    await client.save(file,text);written.push(path.basename(file));
  }
  const result=await client.build({onProgress});
  return {...result,written,kept,backups};
}
// ---- a Control Hub on this computer's USB cable (ADB) -------------------------------------------------------------
// The Robot Controller keeps each configuration as /sdcard/FIRST/<name>.xml. Over USB Deck lists and reads them with ADB
// (the copy the REV Hardware Client installs, Android's platform-tools, or one on PATH). The Robot Controller's own web
// server (port 8080), forwarded over the same cable, says which one is active (/js/rcInfo.json activeConfigName) and
// lists the hardware Blocks offers from it (/hardware: allHardwareIdentifiers, "<name>As<Type>").
const {execFile}=require('node:child_process');
function adbPath(){const fsx=require('node:fs'),cands=[process.env.ADB,process.platform==='win32'?path.join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','REV Robotics','REV Hardware Client','android-tools','adb.exe'):null,
    process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'Android','Sdk','platform-tools','adb.exe'):null,process.env.ANDROID_HOME?path.join(process.env.ANDROID_HOME,'platform-tools',process.platform==='win32'?'adb.exe':'adb'):null].filter(Boolean);
  return cands.find(f=>fsx.existsSync(f))||'adb';}
const adb=(args,{timeout=10000,run=execFile}={})=>new Promise((resolve,reject)=>run(adbPath(),args,{timeout,maxBuffer:8*1024*1024,windowsHide:true,encoding:'utf8'},(e,out,err)=>e?reject(Object.assign(Error(e.code==='ENOENT'?'ADB was not found. Install the REV Hardware Client (it brings ADB) or Android platform-tools.':(String(err||e.message).trim()||e.message)),{code:e.code})):resolve(String(out))));
// GET a path of the robot's web server forwarded to this computer's port (it hangs up on a kept-alive request).
const getLocal=(port,p,timeout=5000)=>new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port,path:p,timeout,headers:{'User-Agent':'Deck Driver Station','Accept':'*/*','Connection':'close'}},res=>{let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>res.statusCode===200?resolve(body):reject(Error(`HTTP ${res.statusCode}`)));});req.on('timeout',()=>req.destroy(Error('timed out')));req.on('error',reject);});
// Blocks' hardware names: "frontleftAsDcMotor" is the device "frontleft" as a DcMotor (hub modules left out).
function blocksHardware(js){const m=/allHardwareIdentifiers\s*=\s*\[([^\]]*)\]/.exec(String(js||''));if(!m)return [];
  return [...m[1].matchAll(/'((?:\\.|[^'\\])*)'/g)].map(x=>x[1].replace(/\\(.)/g,'$1')).map(id=>{const i=id.lastIndexOf('As');return i>0?{identifier:id,name:id.slice(0,i),type:id.slice(i+2)}:null;}).filter(x=>x&&!/^(REVModule|ServoController|VoltageSensor|MotorController|LynxModule)$/.test(x.type));}
async function readUsb({run}={}){
  const listed=(await adb(['devices'],{run})).split(/\r?\n/).slice(1).map(l=>l.trim().split(/\s+/)).filter(x=>x[0]);
  if(!listed.length)throw Error('No Control Hub on USB. Plug its USB-C port into this computer with a data cable (some cables only charge).');
  const ready=listed.find(x=>x[1]==='device');if(!ready)throw Error(listed[0][1]==='unauthorized'?'The Control Hub is on USB but has not allowed this computer yet: look for the prompt in the REV Hardware Client.':`The Control Hub on USB is ${listed[0][1]}.`);
  const serial=ready[0],sh=cmd=>adb(['-s',serial,'shell',cmd],{run});
  // Names with their times, newest first: ls -l --full-time is not on every Android, so plain ls -l and a sort by name too.
  const files=(await sh('ls -1t /sdcard/FIRST/ 2>/dev/null')).split(/\r?\n/).map(s=>s.trim()).filter(s=>/\.xml$/i.test(s)&&!/^\./.test(s));
  if(!files.length)return {source:'usb',serial,configurations:[],active:null,devices:[],hubs:[],files:{}};
  const out={};for(const f of files.slice(0,20)){try{const xml=await sh(`cat '/sdcard/FIRST/${f.replace(/'/g,'')}'`);if(/<Robot\b/.test(xml))out[f.replace(/\.xml$/i,'')]=xml;}catch{}}
  const names=Object.keys(out);if(!names.length)return {source:'usb',serial,configurations:[],active:null,devices:[],hubs:[],files:{}};
  // The active configuration and Blocks' list, from the robot's web server over the cable; the newest file otherwise.
  let active=null,blocks=[];const port=18000+Math.floor(Math.random()*2000);
  try{await adb(['-s',serial,'forward',`tcp:${port}`,'tcp:8080'],{run});const info=JSON.parse(await getLocal(port,'/js/rcInfo.json'));if(typeof info.activeConfigName==='string')active=info.activeConfigName;
    try{blocks=blocksHardware(await getLocal(port,'/hardware',10000));}catch{}}catch{}finally{adb(['-s',serial,'forward','--remove',`tcp:${port}`],{run}).catch(()=>{});}
  const name=active&&out[active]?active:names[0],parsed=RobotConfig.parse(out[name]);
  return {source:'usb',serial,configurations:names,active:{name,...(active&&out[active]?{}:{guessed:true})},xml:out[name],...parsed,blocks,files:out};}
module.exports={readConfigurations,activateConfiguration,readUsb,adbPath,blocksHardware,readRobot,writeConfiguration,runCheck,session,OnBotJava,send,buildErrors,formEncode,checkHost};
