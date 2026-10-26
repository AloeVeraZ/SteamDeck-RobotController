'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{shortcut}=require('../src/shortcuts.cjs');
const down=(key,mods={})=>({type:'keyDown',key,control:false,meta:false,alt:false,shift:false,...mods});
test('Windows and Linux station shortcuts use Ctrl, Alt and F-keys',()=>{
 for(const platform of ['win32','linux']){
  assert.equal(shortcut(down('F5'),platform),'reload');assert.equal(shortcut(down('r',{control:true}),platform),'reload');
  assert.equal(shortcut(down('F11'),platform),'fullscreen');assert.equal(shortcut(down('ArrowLeft',{alt:true}),platform),'back');
  assert.equal(shortcut(down('=',{control:true}),platform),'zoom-in');assert.equal(shortcut(down('-',{control:true}),platform),'zoom-out');assert.equal(shortcut(down('0',{control:true}),platform),'zoom-reset');
  assert.equal(shortcut(down('1',{control:true}),platform),'drive');assert.equal(shortcut(down('2',{control:true}),platform),'settings');
 }
});
test('macOS uses Command and leaves Option+Left for text editing',()=>{
 assert.equal(shortcut(down('r',{meta:true}),'darwin'),'reload');assert.equal(shortcut(down('[',{meta:true}),'darwin'),'back');
 assert.equal(shortcut(down('ArrowLeft',{alt:true}),'darwin'),null);assert.equal(shortcut(down('r',{control:true}),'darwin'),null);
});
test('plain keys, key releases and other chords reach the robot page',()=>{
 for(const key of ['r','1',' ','Enter','ArrowLeft','w','Escape'])assert.equal(shortcut(down(key),'win32'),null,key);
 assert.equal(shortcut({...down('F5'),type:'keyUp'},'win32'),null);
 assert.equal(shortcut(down('R',{control:true,shift:true}),'win32'),null);assert.equal(shortcut(down('c',{control:true}),'win32'),null);assert.equal(shortcut(down('1',{control:true,alt:true}),'win32'),null);
});
