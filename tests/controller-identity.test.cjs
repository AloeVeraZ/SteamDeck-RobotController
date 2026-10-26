'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {identity,Assignments}=require('../ui/controllers.js');
const {identifyHardware}=require('../src/hardware.cjs');
const pad=id=>({id,index:0,mapping:'standard',connected:true});
test('explicit Steam Deck identity uses detected LCD/OLED model; host alone cannot identify a virtual pad',()=>{
 for(const model of ['Steam Deck LCD','Steam Deck OLED']){
  const hardware=identifyHardware({override:model});
  for(const id of ['Steam Deck Controller','Controller (Vendor: 28de Product: 1205)']){
   assert.equal(identity(pad(id),hardware).name,model+' controls');assert.equal(identity(pad(id),hardware).art,'steamdeck');
  }
  for(const id of ['Microsoft X-Box 360 pad 0','Xbox 360 Controller (XInput STANDARD GAMEPAD)','Steam Virtual Gamepad (Vendor: 28de Product: 11ff)']){
   assert.equal(identity(pad(id),hardware).name,'Generic controller');assert.equal(identity(pad(id),hardware).known,false);
  }
 }
 assert.equal(identity(pad('Steam Deck Controller'),{}).name,'Steam Deck controls');
});
test('known external models retain their names on a handheld; unknown descriptions use Generic controller',()=>{
 const hardware=identifyHardware({override:'Steam Deck LCD'});
 for(const [id,name,art] of [['Xbox One Wireless Controller','Xbox One controller','xbox'],['Xbox Series X Controller','Xbox Series controller','xbox'],['DualSense Wireless Controller','DualSense controller','playstation'],['DualSense Edge','DualSense Edge controller','playstation'],['PS4 Controller','DualShock 4 controller','playstation'],['ROG Ally X Controller','ROG Ally X controls','generic']]){
  assert.deepEqual([identity(pad(id),hardware).name,identity(pad(id),hardware).art],[name,art]);
 }
 for(const id of ['Unknown USB Gamepad','Xbox Wireless Controller','Microsoft X-Box 360 pad 0',''])assert.equal(identity(pad(id),{}).name,'Generic controller');
 assert.equal(identity(null).name,'No controller assigned');
});
test('friendly display names do not modify raw identities used for controller assignments',()=>{
 const source=Object.freeze(pad('Microsoft X-Box 360 pad 0')),assignments=new Assignments();
 const display=identity(source,identifyHardware({override:'Steam Deck LCD'}));assignments.assign(1,source);
 assert.equal(display.name,'Generic controller');assert.equal(assignments.snapshot([source])[0].id,source.id);
});
