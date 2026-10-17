'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');const {RobotProxy}=require('../src/robot-proxy.cjs');
async function setup(t,handler){const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const target=`http://127.0.0.1:${server.address().port}`,bridge=new RobotProxy(target);const url=await bridge.start();t.after(async()=>{await bridge.close();server.closeAllConnections();await new Promise(r=>server.close(r));});return {server,target,bridge,url};}
test('robot HTML and API responses pass through without replacing the interface',async t=>{
  const f=await setup(t,(req,res)=>res.end(req.url==='/api/state'?'original API':'<title>Robot original dashboard</title><button>Initialize</button>'));assert.equal(await(await fetch(f.url)).text(),'<title>Robot original dashboard</title><button>Initialize</button>');assert.equal(await(await fetch(f.url+'api/state')).text(),'original API');
});
test('POST bodies, content type, authorization, cookies, and robot origin are forwarded',async t=>{
  let observed;const f=await setup(t,async(req,res)=>{let body='';for await(const b of req)body+=b;observed={body,headers:req.headers};res.end('ok');});
  await fetch(f.url+'api/control',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Basic test',Cookie:'session=abc',Origin:f.bridge.origin},body:'{"enable":true}'});
  assert.equal(observed.body,'{"enable":true}');assert.equal(observed.headers.authorization,'Basic test');assert.equal(observed.headers.cookie,'session=abc');assert.equal(observed.headers.origin,f.target);
});
test('HTTP password challenges and same-robot redirects survive the bridge',async t=>{
  const f=await setup(t,(req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{Location:f.target+'/login'});res.end();}else{res.writeHead(401,{'WWW-Authenticate':'Basic realm="Robot"','Set-Cookie':'sid=1; Domain=127.0.0.1; Path=/'});res.end('Sign in');}});
  const login=await fetch(f.url);assert.equal(login.status,401);assert.equal(login.headers.get('www-authenticate'),'Basic realm="Robot"');assert.equal(login.headers.get('set-cookie'),'sid=1; Path=/');const redirect=await fetch(f.url+'redirect',{redirect:'manual'});assert.equal(redirect.headers.get('location'),f.bridge.origin+'/login');
});
test('foreign origins cannot use the bridge to reach the robot',async t=>{let called=false;const f=await setup(t,(_q,r)=>{called=true;r.end('no');});const response=await fetch(f.url,{headers:{Origin:'https://unrelated.example'}});assert.equal(response.status,403);assert.equal(called,false);});
test('camera streams start before the upstream response ends',async t=>{
  const f=await setup(t,(_q,r)=>{r.writeHead(200,{'Content-Type':'multipart/x-mixed-replace; boundary=frame'});r.write('--frame\r\n');const timer=setInterval(()=>r.write('frame data\r\n'),20);r.on('close',()=>clearInterval(timer));});const response=await fetch(f.url);const reader=response.body.getReader();assert.ok((await reader.read()).value.length>0);await reader.cancel();
});
