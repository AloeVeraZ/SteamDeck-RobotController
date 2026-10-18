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
   for(const asset of paths){const resource=await fetch(new URL(asset,url));assert.equal(resource.status,200,page+' missing '+asset);assert.ok((await resource.arrayBuffer()).byteLength>0,asset+' is empty');}
  }
 }finally{child.kill();}
});
