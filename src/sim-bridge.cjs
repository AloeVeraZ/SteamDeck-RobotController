'use strict';
// Main-process side of the offline simulator: owns the simulation utility process, relays its
// messages to the driver station window and handles local files
// (projects, robot models, route exports, Java programs). Nothing here talks to a robot; leaving
// the Simulation view kills the utility process (and with it any Java program).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MESH_TYPES={'.glb':'glb','.gltf':'gltf','.stl':'stl','.obj':'obj'},STEP_TYPES=['.step','.stp'];
const MODEL_LIMIT=200*1024*1024,STORED_LIMIT=150*1024*1024,SOURCE_LIMIT=200*1024,PROJECT_LIMIT=150*1024*1024,EXPORT_LIMIT=4*1024*1024;
const EXPORTS={java:{name:'Pedro Java',extensions:['java']},pp:{name:'Pedro path file',extensions:['pp']},timed:{name:'Timed drive commands',extensions:['json']},motionmodule:{name:'MotionModule autonomous',extensions:['py']}};
const validKey=key=>typeof key==='string'&&/^[\w-]{1,64}$/.test(key);

class SimulationHost{
  constructor({utilityProcess,dataDir,emit}){this.utilityProcess=utilityProcess;this.dataDir=dataDir;this.emit=emit;this.proc=null;this.pending=new Map();this.nextId=1;}
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
    proc.on('exit',code=>{if(proc!==this.proc)return;this.proc=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('The simulation process stopped.'));}this.pending.clear();
      this.emit({type:'host-exit',code,error:code?`The simulation process stopped unexpectedly (code ${code}). ${stderr.trim().split('\n').slice(-3).join(' ')}`.trim():''});});
    this.proc=proc;return proc;
  }
  call(method,args=[]){
    if(typeof method!=='string'||!Array.isArray(args))return Promise.reject(Error('Invalid simulator call.'));
    const proc=this.start(),id=this.nextId++,timeout={run:60000,practice:60000,load:30000,evaluate:180000,convertStep:300000}[method]||10000;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('The simulator did not respond.'));},timeout);this.pending.set(id,{resolve,reject,timer});proc.postMessage({id,method,args});});
  }
  stop(){const proc=this.proc;this.proc=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Simulation closed.'));}this.pending.clear();if(proc)try{proc.kill();}catch{}}
  practiceInput(pad){if(this.proc)this.proc.postMessage({method:'practice-input',args:[pad||null]});}
  // A robot model the team picked or dropped: STEP is tessellated and merged into one body in the
  // simulation process; mesh formats are returned as bytes for the window to merge.
  async readModel(file){
    const ext=path.extname(file).toLowerCase(),size=fs.statSync(file).size;
    if(size>MODEL_LIMIT)throw Error(`${path.basename(file)} is larger than 200 MB.`);
    if(STEP_TYPES.includes(ext))return {kind:'step',...await this.call('convertStep',[file])};
    if(!MESH_TYPES[ext])throw Error('Use a STEP (.step/.stp), .glb, .gltf, .stl or .obj file.');
    return {kind:'mesh',name:path.basename(file),format:MESH_TYPES[ext],bytes:new Uint8Array(fs.readFileSync(file))};
  }
  exportsFile(){return path.join(this.dataDir,'simulation','exports.json');}
  exportTargets(){try{const v=JSON.parse(fs.readFileSync(this.exportsFile(),'utf8'));return v&&typeof v==='object'?v:{};}catch{return {};}}
  async file(dialog,win,action,data){
    if(action==='builtin-model'){if(!['strafer','swechanum'].includes(data))throw Error('Unknown bundled robot.');const dir=path.join(__dirname,'../ui/assets/robots'),catalog=JSON.parse(fs.readFileSync(path.join(dir,'catalog.json'),'utf8'));return {bytes:new Uint8Array(require('node:zlib').gunzipSync(fs.readFileSync(path.join(dir,data+'.glb.gz')))),meta:catalog[data]};}
    const models=path.join(this.dataDir,'simulation','models');
    const open=async(title,filters,limit)=>{const r=await dialog.showOpenDialog(win,{title,properties:['openFile'],filters});if(r.canceled||!r.filePaths[0])return null;const file=r.filePaths[0];if(fs.statSync(file).size>limit)throw Error(`${path.basename(file)} is larger than ${Math.round(limit/1048576)} MB.`);return file;};
    if(action==='project-save'){
      if(typeof data!=='string'||data.length>PROJECT_LIMIT)throw Error('Project is too large to save.');
      const r=await dialog.showSaveDialog(win,{title:'Save simulation project',defaultPath:'deck-simulation.json',filters:[{name:'Simulation project',extensions:['json']}]});
      if(r.canceled||!r.filePath)return null;fs.writeFileSync(r.filePath,data);return {name:path.basename(r.filePath)};
    }
    if(action==='project-open'){const file=await open('Open simulation project',[{name:'Simulation project',extensions:['json']}],PROJECT_LIMIT);return file&&{name:path.basename(file),text:fs.readFileSync(file,'utf8')};}
    if(action==='java-open'){const file=await open('Choose a Java autonomous program',[{name:'Java source',extensions:['java']}],SOURCE_LIMIT);return file&&{name:path.basename(file),source:fs.readFileSync(file,'utf8')};}
    if(action==='model-open'){const file=await open('Import your robot',[{name:'Robot CAD or mesh',extensions:['step','stp','glb','gltf','stl','obj']}],MODEL_LIMIT);return file&&this.readModel(file);}
    // A file dropped on the window: the path comes from Electron's own File-to-path lookup.
    if(action==='model-drop'){if(typeof data!=='string'||!path.isAbsolute(data)||!fs.existsSync(data))throw Error('That file could not be opened.');return this.readModel(data);}
    if(action==='model-save'){
      if(!data||typeof data.name!=='string'||!(data.bytes instanceof Uint8Array)||data.bytes.length>STORED_LIMIT)throw Error('Invalid model data.');
      const bytes=Buffer.from(data.bytes),id=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,32)+'.glb';
      fs.mkdirSync(models,{recursive:true});fs.writeFileSync(path.join(models,id),bytes);return {id,name:path.basename(data.name).slice(0,120)};
    }
    if(action==='model-read'){if(typeof data!=='string'||!/^[0-9a-f]{32}\.glb$/.test(data))throw Error('Invalid model id.');const file=path.join(models,data);return fs.existsSync(file)?{id:data,bytes:new Uint8Array(fs.readFileSync(file))}:null;}
    // Control Hub TeamCode: the OpMode, Pedro Constants and route, written at their package paths under
    // a folder the user picks (normally TeamCode/src/main/java). Names are checked so nothing escapes it.
    if(action==='teamcode-save'){
      const files=data?.files;if(!files||typeof files!=='object')throw Error('Invalid TeamCode export.');
      const entries=Object.entries(files);if(!entries.length||entries.length>12||entries.some(([rel,text])=>typeof text!=='string'||!/^[A-Za-z0-9_]+(\/[A-Za-z0-9_]+)*\.java$/.test(rel))||entries.reduce((s,[,text])=>s+text.length,0)>EXPORT_LIMIT)throw Error('Invalid TeamCode export.');
      const r=await dialog.showOpenDialog(win,{title:'Choose your TeamCode java folder (TeamCode/src/main/java)',properties:['openDirectory','createDirectory']});
      if(r.canceled||!r.filePaths[0])return null;const base=path.resolve(r.filePaths[0]);
      for(const [rel,text] of entries){const file=path.resolve(base,rel);if(!file.startsWith(base+path.sep))throw Error('Invalid TeamCode path.');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
      return {name:path.basename(base),count:entries.length};
    }
    // Route exports. The window may only write to a file the user picked in a save dialog; with
    // "keep updated" that choice is remembered per field layout and format.
    if(['export-save','export-update','export-status','export-forget'].includes(action)){
      if(!data||!validKey(data.key))throw Error('Invalid export target.');
      const targets=this.exportTargets(),save=()=>{fs.mkdirSync(path.dirname(this.exportsFile()),{recursive:true});fs.writeFileSync(this.exportsFile(),JSON.stringify(targets),{mode:0o600});};
      if(action==='export-status')return targets[data.key]?{name:path.basename(targets[data.key].path),format:targets[data.key].format}:null;
      if(action==='export-forget'){delete targets[data.key];save();return null;}
      if(!EXPORTS[data.format]||typeof data.text!=='string'||data.text.length>EXPORT_LIMIT)throw Error('Invalid export.');
      if(action==='export-update'){const t=targets[data.key];if(!t||t.format!==data.format)return null;fs.writeFileSync(t.path,data.text);return {name:path.basename(t.path)};}
      const r=await dialog.showSaveDialog(win,{title:`Export ${EXPORTS[data.format].name}`,defaultPath:typeof data.name==='string'?path.basename(data.name):'PlannedRoute.'+EXPORTS[data.format].extensions[0],filters:[EXPORTS[data.format]]});
      if(r.canceled||!r.filePath)return null;fs.writeFileSync(r.filePath,data.text);
      if(data.keep){targets[data.key]={path:r.filePath,format:data.format};save();}
      return {name:path.basename(r.filePath)};
    }
    throw Error('Unknown simulator file action.');
  }
}
module.exports={SimulationHost};
