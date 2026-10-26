'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),net=require('node:net'),path=require('node:path'),{spawn}=require('node:child_process');
test('local preview serves every script and stylesheet referenced by the app and FTC station',{timeout:15000},async()=>{
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const child=spawn(process.execPath,[path.join(__dirname,'../tools/preview.cjs')],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Preview startup timeout')),8000);child.once('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(Error('Preview exited before ready'));});child.stdout.on('data',chunk=>{if(String(chunk).includes('http://')){clearTimeout(timer);resolve();}});});
  for(const page of ['/index.html','/ftc/index.html']){
   const url=`http://127.0.0.1:${port}${page}`,response=await fetch(url);assert.equal(response.status,200);const html=await response.text();
   const paths=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(match=>match[1]);assert.ok(paths.length>3);
   for(const asset of paths){const resourceUrl=new URL(asset,url),resource=await fetch(resourceUrl);assert.equal(resource.status,200,page+' missing '+asset);const bytes=await resource.arrayBuffer();assert.ok(bytes.byteLength>0,asset+' is empty');
    if(asset.endsWith('.css'))for(const font of new TextDecoder().decode(bytes).matchAll(/url\(['"]?(fonts\/[^'")]+\.woff2)['"]?\)/g)){const response=await fetch(new URL(font[1],resourceUrl));assert.equal(response.status,200,'Offline font missing: '+font[1]);assert.equal(response.headers.get('content-type'),'font/woff2');assert.ok((await response.arrayBuffer()).byteLength>1000);}
   }
  }
 }finally{child.kill();}
});
