'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{validAction}=require('../src/touch-keyboard.cjs');
test('native touch keyboard accepts only single printable characters and fixed editing commands',()=>{
 for(const value of ['a','Z','0',':','/',' ','"',"'",'\\','%','&'])assert.equal(validAction({kind:'text',value}),true);
 for(const kind of ['backspace','left','right','enter','done'])assert.equal(validAction({kind}),true);
 for(const action of [null,{},[],{kind:'execute'},{kind:'text',value:'two letters'},{kind:'text',value:'\n'},{kind:'text',value:'\u0000'},{kind:'text',value:9},{kind:'file'},{kind:'clipboard'}])assert.equal(validAction(action),false);
});
