'use strict';
// Main-process side of the offline simulator: owns the simulation utility process, relays its
// messages to the driver station window, merges manual driving input, serves the bundled DSIM
// models over a narrow read-only scheme and handles local file dialogs. Nothing here talks to a
// robot; leaving the Simulation view kills the utility process (and with it any Java program).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const ASSET_SCHEME='deck-asset',ASSET_ROOT=path.join(__dirname,'../ui/vendor/dsim');
const MESH_TYPES={'.glb':'glb','.gltf':'gltf','.stl':'stl','.obj':'obj'},MESH_LIMIT=25*1024*1024,SOURCE_LIMIT=200*1024,PROJECT_LIMIT=40*1024*1024;

function registerAssetScheme(protocol){protocol.registerSchemesAsPrivileged([{scheme:ASSET_SCHEME,privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);}
// deck-asset://dsim/<path> maps to ui/vendor/dsim/<path>, and nothing outside it.
function serveAssets(session,net){
  session.protocol.handle(ASSET_SCHEME,request=>{
    const url=new URL(request.url),file=path.resolve(ASSET_ROOT,'.'+decodeURIComponent(url.pathname));
    if(url.hostname!=='dsim'||!file.startsWith(ASSET_ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return new Response('Not found',{status:404});
    return net.fetch(pathToFileURL(file).toString());
  });
}
const axis=v=>Number.isFinite(v)&&Math.abs(v)>.06?Math.max(-1,Math.min(1,v)):0;

class SimulationHost{
  constructor({utilityProcess,dataDir,emit}){this.utilityProcess=utilityProcess;this.dataDir=dataDir;this.emit=emit;this.proc=null;this.pending=new Map();this.nextId=1;this.drive={enabled:false,keyboard:null,fieldCentric:false,precision:false};this.pad=null;this.lastManual='';}
  get running(){return !!this.proc;}
  start(){
    if(this.proc)return this.proc;
    const work=path.join(this.dataDir,'simulation','work');fs.mkdirSync(work,{recursive:true});
    const proc=this.utilityProcess.fork(path.join(__dirname,'sim-host.cjs'),[work],{serviceName:'Deck Driver Station simulation',stdio:'pipe'});
    let stderr='';proc.stderr?.on('data',d=>{stderr=(stderr+d).slice(-4000);});proc.stdout?.on('data',()=>{});
    proc.on('message',message=>{
      if(proc!==this.proc)return;
      if(message?.type==='reply'){const p=this.pending.get(message.id);if(!p)return;this.pending.delete(message.id);clearTimeout(p.timer);message.ok?p.resolve(message.value):p.reject(Error(message.error));return;}
      this.emit(message);
    });
    proc.on('exit',code=>{if(proc!==this.proc)return;this.proc=null;this.lastManual='';for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('The simulation process stopped.'));}this.pending.clear();
      this.emit({type:'host-exit',code,error:code?`The simulation process stopped unexpectedly (code ${code}). ${stderr.trim().split('\n').slice(-3).join(' ')}`.trim():''});});
    this.proc=proc;return proc;
  }
  call(method,args=[]){
    if(typeof method!=='string'||!Array.isArray(args))return Promise.reject(Error('Invalid simulator call.'));
    const proc=this.start(),id=this.nextId++,timeout=method==='run'?60000:method==='load'?30000:10000;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('The simulator did not respond.'));},timeout);this.pending.set(id,{resolve,reject,timer});proc.postMessage({id,method,args});});
  }
  stop(){const proc=this.proc;this.proc=null;this.drive={enabled:false,keyboard:null,fieldCentric:false,precision:false};this.pad=null;this.lastManual='';for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Simulation closed.'));}this.pending.clear();if(proc)try{proc.kill();}catch{}}
  // Manual driving: the window's keyboard input plus controller 1 (after the app's deadzone).
  setDrive(value){if(!value||typeof value!=='object')return;const k=value.keyboard;this.drive={enabled:!!value.enabled,fieldCentric:!!value.fieldCentric,precision:!!value.precision,keyboard:k&&{x:axis(k.x),y:axis(k.y),turn:axis(k.turn)}};this.pushManual();}
  setGamepad(pad){this.pad=pad&&pad.mapping==='standard'?{x:axis(pad.axes[0]),y:-axis(pad.axes[1]),turn:axis(pad.axes[2]),precision:!!pad.buttons[4]?.pressed}:null;this.pushManual();}
  pushManual(){
    if(!this.proc)return;const d=this.drive,k=d.keyboard||{x:0,y:0,turn:0},p=this.pad||{x:0,y:0,turn:0,precision:false};
    const input=d.enabled?{x:axis(k.x+p.x),y:axis(k.y+p.y),turn:axis(k.turn+p.turn),fieldCentric:d.fieldCentric,precision:d.precision||p.precision}:null;
    const signature=JSON.stringify(input);if(signature===this.lastManual)return;this.lastManual=signature;this.proc.postMessage({method:'manual',args:[input]});
  }
  async file(dialog,win,action,data){
    const dir=path.join(this.dataDir,'simulation','meshes');
    if(action==='project-save'){
      if(typeof data!=='string'||data.length>PROJECT_LIMIT)throw Error('Project is too large to save.');
      const r=await dialog.showSaveDialog(win,{title:'Save simulation project',defaultPath:'deck-simulation.json',filters:[{name:'Simulation project',extensions:['json']}]});
      if(r.canceled||!r.filePath)return null;fs.writeFileSync(r.filePath,data);return {name:path.basename(r.filePath)};
    }
    const open=async(title,filters,limit)=>{const r=await dialog.showOpenDialog(win,{title,properties:['openFile'],filters});if(r.canceled||!r.filePaths[0])return null;const file=r.filePaths[0],size=fs.statSync(file).size;if(size>limit)throw Error(`${path.basename(file)} is larger than ${Math.round(limit/1048576)} MB.`);return file;};
    if(action==='project-open'){const file=await open('Open simulation project',[{name:'Simulation project',extensions:['json']}],PROJECT_LIMIT);return file&&{name:path.basename(file),text:fs.readFileSync(file,'utf8')};}
    if(action==='java-open'){const file=await open('Choose a Java autonomous program',[{name:'Java source',extensions:['java']}],SOURCE_LIMIT);return file&&{name:path.basename(file),source:fs.readFileSync(file,'utf8')};}
    if(action==='mesh-open'||action==='mesh-store'){
      let name,bytes;
      if(action==='mesh-open'){const file=await open('Import robot model (visual only)',[{name:'3D model',extensions:['glb','gltf','stl','obj']}],MESH_LIMIT);if(!file)return null;name=path.basename(file);bytes=fs.readFileSync(file);}
      else{if(!data||typeof data.name!=='string'||!(data.bytes instanceof Uint8Array)||data.bytes.length>MESH_LIMIT)throw Error('Invalid model data.');name=path.basename(data.name);bytes=Buffer.from(data.bytes);}
      const ext=path.extname(name).toLowerCase();if(!MESH_TYPES[ext])throw Error('Use a .glb, .gltf, .stl or .obj model.');
      const id=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,32)+ext;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,id),bytes);
      return {id,name,format:MESH_TYPES[ext],bytes:new Uint8Array(bytes)};
    }
    if(action==='mesh-read'){if(typeof data!=='string'||!/^[0-9a-f]{32}\.(glb|gltf|stl|obj)$/.test(data))throw Error('Invalid model id.');const file=path.join(dir,data);if(!fs.existsSync(file))return null;return {id:data,format:MESH_TYPES[path.extname(data)],bytes:new Uint8Array(fs.readFileSync(file))};}
    throw Error('Unknown simulator file action.');
  }
}
module.exports={SimulationHost,registerAssetScheme,serveAssets,ASSET_SCHEME};
