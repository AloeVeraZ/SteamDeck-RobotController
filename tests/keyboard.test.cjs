'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const K=require('../ui/keyboard-layout.js'),{identity}=require('../ui/controllers.js'),{ControllerHub}=require('../src/controller-hub.cjs'),{controllerOutput}=require('../src/controller-output.cjs');

test('WASD and the arrow keys drive the sticks; diagonals stay inside the unit circle',()=>{
  const p=K.pad(new Set(['KeyW','KeyD','ArrowLeft']));
  assert.equal(p.id,K.ID);assert.equal(p.mapping,'standard');assert.equal(p.buttons.length,17);
  assert.ok(Math.abs(p.axes[0]-Math.SQRT1_2)<1e-9&&Math.abs(p.axes[1]+Math.SQRT1_2)<1e-9);assert.deepEqual(p.axes.slice(2),[-1,0]);
  assert.equal(p.axesActive,true);assert.equal(p.pressed,false);
  assert.deepEqual(K.pad(new Set(['KeyA','KeyD'])).axes,[0,0,0,0]);
});
test('face, shoulder, trigger, menu, stick-click and D-pad keys follow standard button order',()=>{
  const codes=['Space','KeyC','KeyR','KeyF','KeyQ','KeyE','ShiftLeft','KeyG','Backquote','Enter','KeyX','KeyM','KeyI','KeyK','KeyJ','KeyL'];
  codes.forEach((code,index)=>{const p=K.pad(new Set([code]));assert.equal(p.buttons[index],1,code);assert.equal(p.buttons.reduce((a,b)=>a+b,0),1,code);assert.equal(p.buttonPressed[index],true);});
  assert.equal(K.pad(new Set()).pressed,false);assert.ok(K.used.has('KeyW')&&!K.used.has('KeyP'));
});
const layout=(entries,language)=>K.detect(new Map(Object.entries(entries)),language);
const qwerty={KeyQ:'q',KeyW:'w',KeyE:'e',KeyR:'r',KeyY:'y',KeyZ:'z',Semicolon:';',Quote:"'",BracketLeft:'[',Minus:'-',Backslash:'\\'};
test('keyboard layouts and country variants are named from the layout map',()=>{
  assert.equal(layout(qwerty,'en-US').name,'English (US) QWERTY keyboard');
  assert.equal(layout({...qwerty,Backslash:'#'},'en-GB').name,'English (UK) QWERTY keyboard');
  assert.equal(layout(qwerty,'en-CA').name,'English (Canada) QWERTY keyboard');
  assert.equal(layout({...qwerty,KeyQ:'a',KeyW:'z',Semicolon:'m'},'fr-FR').name,'French AZERTY keyboard');
  assert.equal(layout({...qwerty,KeyQ:'a',KeyW:'z',Semicolon:'m'},'fr-BE').name,'Belgian AZERTY keyboard');
  assert.equal(layout({...qwerty,KeyY:'z',KeyZ:'y',Semicolon:'ö',BracketLeft:'ü',Minus:'ß'},'de-DE').name,'German QWERTZ keyboard');
  assert.equal(layout({...qwerty,KeyY:'z',KeyZ:'y',Semicolon:'ö',BracketLeft:'ü',Minus:"'"},'de-CH').name,'Swiss QWERTZ keyboard');
  assert.equal(layout({...qwerty,Semicolon:'ñ'},'es-ES').name,'Spanish QWERTY keyboard');
  assert.equal(layout({...qwerty,Semicolon:'ñ'},'es-MX').name,'Spanish (Latin America) QWERTY keyboard');
  assert.equal(layout({...qwerty,Semicolon:'ö',Quote:'ä'},'sv-SE').name,'Swedish QWERTY keyboard');
  assert.equal(layout({...qwerty,Semicolon:'ø',Quote:'æ'},'nb-NO').name,'Norwegian QWERTY keyboard');
  assert.equal(layout({...qwerty,Semicolon:'ç',Quote:'~'},'pt-BR').name,'Portuguese (Brazil) QWERTY keyboard');
  assert.equal(layout({...qwerty,Quote:':'},'ja-JP').name,'Japanese QWERTY keyboard');
  assert.equal(layout({...qwerty,KeyQ:"'",KeyW:','},'en-US').family,'Dvorak');
  assert.equal(layout({...qwerty,KeyE:'f',KeyR:'p'},'en-US').family,'Colemak');
  assert.equal(layout({...qwerty,KeyQ:'й',KeyW:'ц'},'ru-RU').family,'Non-Latin');
  assert.equal(K.detect(null).name,'Keyboard');
});
test('binding labels show the keycap printed at each physical position',()=>{
  const azerty=new Map(Object.entries({KeyW:'z',KeyA:'q',KeyS:'s',KeyD:'d'}));
  assert.deepEqual(['KeyW','KeyA','KeyS','KeyD'].map(c=>K.label(c,azerty)),['Z','Q','S','D']);
  assert.deepEqual(['KeyW','Space','ShiftLeft','ArrowUp','Enter'].map(c=>K.label(c,null)),['W','Space','Shift','↑','Enter']);
});
test('unlisted controllers from known makers are named by vendor ID; virtual and cloned IDs stay generic',()=>{
  const pad=id=>({id,index:0,mapping:'standard',connected:true});
  assert.equal(identity(pad('Wireless Gamepad (Vendor: 2dc8 Product: 9999)')).name,'8BitDo controller');
  assert.equal(identity(pad('0f0d-1234-Fighting Commander')).name,'HORI controller');
  assert.deepEqual([identity(pad('Gamepad (Vendor: 045e Product: 0b13)')).name,identity(pad('Gamepad (Vendor: 045e Product: 0b13)')).art],['Microsoft Xbox controller','xbox']);
  for(const id of ['Steam Virtual Gamepad (Vendor: 28de Product: 11ff)','Controller (Vendor: 045e Product: 028e)','Unknown (Vendor: abcd Product: 0001)'])assert.equal(identity(pad(id)).name,'Generic controller',id);
});
test('the keyboard holds Controller 1 while selected and a physical controller moves to Controller 2',()=>{
  const hub=new ControllerHub({hardware:{}}),xbox={id:'Xbox Series X Controller',index:0,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array(17).fill(0)};
  hub.ingest([xbox]);assert.equal(hub.state().slots[0].id,xbox.id);
  hub.setCount(2);hub.ingest([xbox,K.pad(new Set(['KeyW']))],{pin:K.ID});
  const state=hub.state();assert.equal(state.slots[0].id,K.ID);assert.equal(state.slots[1].id,xbox.id);
  const out=controllerOutput({...state,paused:false,deadzones:[0,0]});assert.equal(out[0].axes[1],-1);assert.equal(out[0].index,0);
  hub.ingest([xbox]);assert.equal(hub.state().slots[0],null,'a lost Controller 1 is not refilled from Controller 2 by itself');
  hub.promote();hub.ingest([xbox]);assert.equal(hub.state().slots[0].id,xbox.id,'choosing Controller again moves it back to Controller 1');
});
