'use strict';
// Browser preview of the launcher. Wi-Fi changes remain native-app-only.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');const {randomUUID}=require('node:crypto');
const {Updater}=require('../src/updater.cjs');const meta=require('../package.json');const updater=new Updater({directory:path.join(__dirname,'../.cache/preview-settings'),version:meta.version,repo:meta.repository.url,channel:meta.updateChannel});
const {Library,normalizeUrl}=require('../src/library.cjs'),{RobotProxy}=require('../src/robot-proxy.cjs');
const root=path.join(__dirname,'../ui'),token=randomUUID(),port=Number(process.env.PORT||8787),host=`127.0.0.1:${port}`;
const library=new Library(path.join(__dirname,'../.cache/preview-v2-robots.json'));let bridge=null;
const network={connected:false,ssid:'',native:false,message:'Browser preview: use your system Wi-Fi settings. Native apps provide the platform connection controls.'};
const state={page:'drive',loading:false,url:'',title:'',error:'',robot:null};const snapshot=()=>({...state,robots:library.list(),network});
const bootstrap={hardware:{model:'Browser preview',platform:'preview',display:{width:1280,height:800,scale:1}}};
async function close(){if(bridge)await bridge.close();bridge=null;Object.assign(state,{url:'',robot:null,title:'',loading:false,error:''});}
const js=`(()=>{let callbacks=[],networkCallbacks=[];const call=async(method,args=[])=>{const r=await fetch('/preview-api',{method:'POST',headers:{'Content-Type':'application/json','X-Preview-Token':${JSON.stringify(token)}},body:JSON.stringify({method,args})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};const frame=()=>document.querySelector('#preview-frame');window.deck={updateInfo:()=>call('update-info'),updateChannel:(c,confirm)=>call('update-channel',[c,confirm]),updateCheck:r=>call('update-check',[r]),updateDownload:()=>call('native-only'),updateInstall:()=>call('native-only'),updateFolder:()=>call('native-only'),bootstrap:()=>call('bootstrap'),open:async p=>{const d=await call('open',[p]);frame().src=d.localUrl;frame().hidden=false;return d;},close:async()=>{await call('close');frame().hidden=true;frame().removeAttribute('src');},page:p=>call('page',[p]),save:p=>call('save',[p]),remove:id=>call('remove',[id]),network:()=>call('network'),scan:()=>call('scan'),join:()=>call('native-only'),systemWifi:()=>call('native-only'),bounds:async()=>{},overlay:async()=>{},reload:async()=>{frame().src=frame().src;},back:async()=>{},controllers:async()=>null,auth:()=>call('native-only'),fullscreen:()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen(),quit:()=>call('close'),onState:fn=>callbacks.push(fn),onNetwork:fn=>networkCallbacks.push(fn),onAuth:()=>{}};setInterval(async()=>{try{const s=await call('state');if(!s.url){frame().hidden=true;frame().removeAttribute('src');}callbacks.forEach(fn=>fn(s));}catch{}},400);})();`;
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method==='POST'&&req.url==='/preview-api'){
   if(req.headers.host!==host||req.headers['x-preview-token']!==token||(req.headers.origin&&req.headers.origin!==`http://${host}`))throw Error('Only the local preview can perform this action.');
   let raw='';for await(const c of req){raw+=c;if(raw.length>20000)throw Error('Request too large');}const {method,args=[]}=JSON.parse(raw);let result;
   if(method==='update-info'){await close();result=updater.info();}else if(method==='update-channel')result=updater.setChannel(args[0],args[1]);else if(method==='update-check'){result=await updater.check(args[0]);if(result.status==='available')result.message+=' Download and install from the native app.';}else if(method==='bootstrap')result={...bootstrap,state:snapshot()};else if(method==='state')result=snapshot();
   else if(method==='open'){
    const p=args[0].id?library.get(args[0].id):args[0];await close();const url=normalizeUrl(p.url);bridge=new RobotProxy(url);const localUrl=await bridge.start();const robot=library.upsert({...p,url},{opened:true});Object.assign(state,{page:'drive',url,title:robot.name,robot});result={opened:true,localUrl};
   }else if(method==='close'){await close();result=snapshot();}
   else if(method==='page'){if(args[0]==='settings')await close();state.page=args[0];result=snapshot();}
   else if(method==='save')result=library.upsert(args[0]);else if(method==='remove'){library.remove(args[0]);result={ok:true};}
   else if(method==='network')result=network;else if(method==='scan')result=[];
   else throw Error('Use the installed native app for Wi-Fi switching and operating-system controls.');
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));return;
  }
  if(req.url==='/preview-bridge.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(js);return;}
  const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/icon.svg':'icon.svg','/icon.png':'icon.png'};const file=files[req.url];if(!file){res.writeHead(404);res.end();return;}
  let body=fs.readFileSync(path.join(root,file));if(file==='index.html')body=body.toString().replace('<script src="app.js">','<script src="preview-bridge.js"></script><script src="app.js">');
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)];res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});res.end(body);
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});server.listen(port,'127.0.0.1',()=>console.log(`Robot website launcher preview: http://${host}`));process.on('SIGINT',()=>close().finally(()=>server.close(()=>process.exit())));
