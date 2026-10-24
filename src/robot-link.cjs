'use strict';
// Send to robot: what the app does with a Control Hub over its Wi-Fi, for the simulator's exports.
//  - Reads the robot configuration as a Driver Station does (Robocol commands from FTC SDK 12.0's FtcEventLoopBase):
//    CMD_REQUEST_CONFIGURATIONS lists the saved configurations, CMD_NOTIFY_ACTIVE_CONFIGURATION names the active one, and
//    CMD_REQUEST_PARTICULAR_CONFIGURATION returns its XML.
//  - Uploads and builds code with the hub's own OnBot Java server on port 8080 (handlers from FTC SDK 12.0's OnBotJava
//    library): POST /java/file/save?f=/src/<path> with the form field data, GET /java/file/get?f=..., and
//    /java/build/start, /java/build/status ({completed, running, successful, startTimestamp, timestamp}) and
//    /java/build/log.
// It never starts an op mode and never changes the robot configuration.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const Robocol=require('../ui/ftc/robocol.js'),RobotConfig=require('../ui/ftc/robot-config.js'),{FtcSocket}=require('./ftc.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
// A robot address: an IP address or a host name, nothing else (no scheme, port or path).
function checkHost(host){const h=String(host||'').trim();if(!net.isIP(h)&&!/^[A-Za-z0-9]([A-Za-z0-9-]{0,62}\.)*[A-Za-z0-9-]{1,63}$/.test(h))throw Error('Enter the robot address, such as 192.168.43.1.');return h;}

// ---- the robot configuration, over Robocol
async function readRobot(host,{timeout=8000,socket=null}={}){
  host=checkHost(host);
  let link=socket;if(!link){try{link=await new FtcSocket(host).open();}catch(e){throw Error(/in use/.test(e.message)?'Another FTC Driver Station on this computer is using the robot connection. Close the robot in Drive (or the other app) and try again.':e.message);}}
  const ds=new Robocol.DriverStation({send:bytes=>link.send(bytes)}),off=link.onPacket(bytes=>ds.receive(bytes)),answers=new Map(),waiters=[];
  ds.on('command',c=>{answers.set(c.name,c.extra);for(const w of [...waiters])if(w.name===c.name){waiters.splice(waiters.indexOf(w),1);w.done(c.extra);}});
  const answer=(name,ms=timeout)=>answers.has(name)?Promise.resolve(answers.get(name)):new Promise((done,fail)=>{const w={name,done:v=>{clearTimeout(t);done(v);}},t=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);fail(Error(`The robot did not answer ${name}.`));},ms);waiters.push(w);});
  const until=(test,ms,message)=>new Promise((done,fail)=>{if(test(ds.state))return done(ds.state);const stop=ds.on('state',s=>{if(test(s)){clearTimeout(t);stop();done(s);}}),t=setTimeout(()=>{stop();fail(Error(message));},ms);});
  try{
    ds.start();
    const s=await until(s=>['connected','rejected','incompatible'].includes(s.connection),timeout,`No FTC robot answered at ${host}. Join the robot's Wi-Fi and check the Robot Controller app is running.`);
    if(s.connection==='rejected')throw Error('Another Driver Station is connected to this robot. Disconnect it, then try again.');
    if(s.connection==='incompatible')throw Error(`This robot runs an FTC SDK older than this app supports (Robocol ${s.robot?.robocol}).`);
    // On connecting the station asks for the op modes and the active configuration; the list of configurations comes next.
    ds.command('CMD_REQUEST_CONFIGURATIONS');
    const list=JSON.parse(await answer('CMD_REQUEST_CONFIGURATIONS_RESP')),configurations=Array.isArray(list)?list:[];
    const activeName=(await until(s=>s.activeConfig,timeout,'The robot did not say which configuration is active.')).activeConfig.name;
    const active=configurations.find(c=>c?.name===activeName)||null;
    if(!active)return {robot:ds.state.robot,configurations:configurations.map(c=>c.name),active:null,devices:[],hubs:[],opModes:ds.state.opModes};
    ds.command('CMD_REQUEST_PARTICULAR_CONFIGURATION',JSON.stringify(active));
    const xml=await answer('CMD_REQUEST_PARTICULAR_CONFIGURATION_RESP'),parsed=RobotConfig.parse(xml);
    return {robot:ds.state.robot,configurations:configurations.map(c=>c.name),active:{name:active.name,dirty:!!active.isDirty},xml,...parsed,opModes:ds.state.opModes};
  }finally{ds.stop();off();if(!socket)await link.close();}
}

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
  const backups=[],written=[],kept=[];await client.available();
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
module.exports={readRobot,OnBotJava,send,buildErrors,formEncode,checkHost};
