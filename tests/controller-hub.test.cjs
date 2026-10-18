'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ControllerHub}=require('../src/controller-hub.cjs');
const pad=(id,index,extra={})=>({id,index,mapping:'standard',connected:true,pressed:false,axesActive:false,...extra});
const external=pad('Xbox Wireless',0),builtin=pad('Steam Deck Controller',3),hardware={builtInController:true,controllerFamily:'steamdeck'};
test('one controller is the default; a robot can opt into two without duplicate slots',()=>{
 const h=new ControllerHub({hardware});h.ingest([external,builtin]);assert.deepEqual(h.state().slots.map(p=>p?.index),[3,undefined]);
 assert.throws(()=>h.begin(2));h.setCount(2);h.ingest([external,builtin]);assert.deepEqual(h.state().slots.map(p=>p?.index),[3,0]);
 h.begin(2);h.setCount(1);assert.equal(h.state().capture,null);assert.equal(h.state().slots[1],null);assert.throws(()=>h.setCount(3));
});
test('click and press assignment waits for release, swaps slots and suppresses held input until neutral',()=>{
 let persisted;const h=new ControllerHub({hardware,persist:v=>persisted=v});h.setCount(2);h.ingest([pad(external.id,0,{pressed:true}),builtin]);h.begin(1);
 h.ingest([pad(external.id,0,{pressed:true}),builtin]);assert.equal(h.state().capture.slot,1);
 h.ingest([external,builtin]);h.ingest([pad(external.id,0,{pressed:true}),builtin]);
 assert.equal(h.state().capture,null);assert.deepEqual(h.state().slots.map(p=>p.index),[0,3]);assert.equal(persisted[0].id,external.id);assert.equal(h.state().assignment.slot,1);assert.ok(h.state().blocked.includes('0:'+external.id));
 h.ingest([pad(external.id,0,{axesActive:true}),builtin]);assert.ok(h.state().blocked.includes('0:'+external.id));
 h.ingest([external,builtin]);assert.deepEqual(h.state().blocked,[]);
});
test('saved manual choices survive a restart and reconnect under a changed index',()=>{
 const h=new ControllerHub({hardware,preferred:[external,builtin]});h.setCount(2);h.ingest([builtin,external]);assert.deepEqual(h.state().slots.map(p=>p.id),[external.id,builtin.id]);
 h.ingest([]);h.ingest([builtin,pad(external.id,5)]);assert.deepEqual(h.state().slots.map(p=>p.index),[5,3]);
});
test('capture cancellation and timeout leave assignments intact; missing devices do not block another capture',()=>{
 const h=new ControllerHub();h.ingest([external]);h.begin(1,100);h.tick(15100);assert.equal(h.state().capture,null);assert.equal(h.state().slots[0].id,external.id);
 h.begin(1);h.cancel();assert.equal(h.state().capture,null);h.ingest([]);h.begin(1);h.ingest([pad('New USB pad',1,{pressed:true})]);assert.equal(h.state().slots[0].id,'New USB pad');
});
test('malformed device reports cannot create extra slots or duplicate indices',()=>{
 const h=new ControllerHub();for(const v of [null,{},'invalid']){h.ingest(v);assert.deepEqual(h.state().slots,[null,null]);}
 h.ingest([pad('bad',-1),pad('bad',16),pad('x'.repeat(2049),0),pad('Valid',2),pad('Duplicate',2)]);assert.equal(h.pads.length,1);assert.equal(h.state().slots[0].id,'Valid');
});
