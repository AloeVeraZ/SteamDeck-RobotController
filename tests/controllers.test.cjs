'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Assignments,defaultPad,orderedPads}=require('../ui/controllers.js');
const {identifyHardware,detectHardware}=require('../src/hardware.cjs');
const pad=(id,index,mapping='standard')=>({id,index,mapping,connected:true});
const deck=identifyHardware({override:'Steam Deck LCD'});
test('Steam Deck LCD/OLED, ROG Ally, and Legion Go models expose built-in controller capability',()=>{
 for(const [product,vendor,family] of [['Jupiter','Valve','steamdeck'],['Galileo','Valve','steamdeck'],['ROG Ally RC71L_RC71L','ASUSTeK COMPUTER INC.','ally'],['ROG Ally X RC72LA','ASUSTeK','ally'],['83E10000US','LENOVO','legion'],['83L3','LENOVO','legion'],['83N0','LENOVO','legion']]){
  const hardware=identifyHardware({product,vendor});assert.equal(hardware.builtInController,true,product);assert.equal(hardware.controllerFamily,family,product);
 }
 for(const [product,vendor] of [['20XY002VUS','LENOVO'],['ROG Zephyrus G14','ASUS'],['MacBook Pro','Apple'],['83E1','Other vendor']])assert.equal(identifyHardware({product,vendor}).builtInController,false);
});
test('device capability is read on Linux and Windows, with a safe ordinary-desktop fallback',async()=>{
 const linux=await detectHardware({platform:'linux',env:{},readFile:file=>file.endsWith('product_name')?'83N6\n':'LENOVO\n'});assert.equal(linux.model,'Lenovo Legion Go S');
 let options;const windows=await detectHardware({platform:'win32',env:{},runner:async(_command,_args,opts)=>{options=opts;return {stdout:JSON.stringify({Manufacturer:'ASUSTeK',Model:'ROG Ally RC71L'})};}});assert.equal(windows.controllerFamily,'ally');assert.equal(options.windowsHide,true);
 const fallback=await detectHardware({platform:'win32',env:{},runner:async()=>{throw Error('CIM unavailable');}});assert.equal(fallback.builtInController,false);
 const override=await detectHardware({platform:'win32',env:{DECK_DEVICE_MODEL:'Steam Deck OLED'},runner:async()=>{throw Error('Should not be called');}});assert.equal(override.model,'Steam Deck OLED');assert.equal(override.controllerFamily,'steamdeck');
});
test('native built-in controls take User 1 even when external pads enumerate first',()=>{
 const external=pad('Xbox Wireless Controller',0),builtin=pad('Steam Deck Controller (Vendor: 28de Product: 1205)',3),third=pad('DualSense',1);
 const a=new Assignments();assert.equal(a.sync([external,null,third,builtin],deck).automatic.index,3);assert.deepEqual(a.users,{1:3,2:null});
 assert.deepEqual(orderedPads([external,third,builtin],deck).map(p=>p.index),[3,0,1]);
 assert.equal(defaultPad([external,pad('ROG Ally Controller',2)],identifyHardware({override:'ROG Ally'})).index,2);
});
test('late built-in enumeration replaces an automatic fallback but never a manual selection',()=>{
 const a=new Assignments(),external=pad('Xbox',0),builtin=pad('Steam Deck Controller',3);a.sync([external],deck);a.sync([external,builtin],deck);assert.equal(a.users[1],3);
 a.assign(1,external);a.sync([external,builtin],deck);assert.equal(a.users[1],0);
});
test('renamed standard gamepads work on handhelds; no controller is invented when none is exposed',()=>{
 const a=new Assignments();assert.equal(a.sync([],deck).automatic,null);assert.equal(a.users[1],null);
 assert.equal(a.sync([pad('Xbox 360 Controller (XInput STANDARD GAMEPAD)',1)],deck).automatic.index,1);
 assert.equal(defaultPad([pad('Flight stick',0,'')],deck),null);
});
test('ordinary desktops and unknown handhelds default to the first standard controller',()=>{
 for(const platform of ['win32','darwin','linux']){const a=new Assignments(),external=pad('Xbox Wireless Controller',0);assert.equal(a.sync([external],identifyHardware({platform})).automatic.index,0);assert.deepEqual(a.users,{1:0,2:null});}
 assert.equal(defaultPad([pad('External Xbox',0),pad('Future Integrated Gamepad',2)],{}).index,2);
});
test('manual external User 1 and built-in User 2 choices are not overwritten by automatic defaults',()=>{
 const a=new Assignments(),builtin=pad('Steam Deck Controller',2),external=pad('Xbox',0),pads=[external,builtin];a.sync(pads,deck);a.assign(1,external);a.assign(2,builtin);
 assert.equal(a.sync(pads,deck).automatic,null);assert.deepEqual(a.users,{1:0,2:2});
 assert.deepEqual(a.sync([builtin],deck).disconnected,[1]);assert.deepEqual(a.users,{1:null,2:2});assert.equal(a.sync([builtin],deck).automatic,null);
});
test('disconnect releases the user; built-in reconnect on a different index returns to User 1',()=>{
 const a=new Assignments();a.sync([pad('Steam Deck Controller',0)],deck);assert.deepEqual(a.sync([],deck).disconnected,[1]);assert.deepEqual(a.snapshot([]),[null,null]);
 const reconnected=pad('Steam Deck Controller',4);a.sync([reconnected],deck);assert.equal(a.users[1],4);assert.equal(a.snapshot([reconnected])[0].index,4);
});
test('a different controller reusing a gamepad index cannot inherit a manual assignment',()=>{
 const a=new Assignments();a.assign(1,pad('Xbox A',0));const change=a.sync([pad('Xbox B',0)],{});assert.deepEqual(change.disconnected,[1]);assert.equal(change.automatic.id,'Xbox B');assert.equal(a.identities[1],'Xbox B');
});
