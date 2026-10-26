'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{gunzipSync}=require('node:zlib');
test('curated robot assets match their source catalog and have four explicit drive wheels',()=>{
  const dir=path.join(__dirname,'../ui/assets/robots'),catalog=JSON.parse(fs.readFileSync(path.join(dir,'catalog.json'),'utf8'));
  for(const id of ['strafer','swechanum']){const bytes=fs.readFileSync(path.join(dir,id+'.glb.gz'));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),catalog[id].assetSha256);assert.match(catalog[id].stepSha256,/^[0-9a-f]{64}$/);
    const glb=gunzipSync(bytes);assert.equal(glb.readUInt32LE(0),0x46546c67);assert.equal(glb.readUInt32LE(8),glb.length);const document=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString('utf8')),wheels=document.nodes.filter(n=>n.extras?.deckWheel?.kind===(id==='strafer'?'mecanum':'swerve'));assert.equal(wheels.length,4);assert.ok(document.meshes.length<=16,'CAD parts are merged for efficient rendering');
    for(const mesh of document.meshes){const position=document.accessors[mesh.primitives[0].attributes.POSITION];assert.ok(position.count>0);assert.ok(position.min.every(Number.isFinite));assert.ok(position.max.every(Number.isFinite));}
    if(id==='swechanum'){assert.equal(document.nodes.filter(n=>n.extras?.deckSteerBody).length,4);for(const w of wheels)assert.ok(w.translation[2]< -6,'swerve wheels are below the frame in the curated robot orientation');}
  }
});
