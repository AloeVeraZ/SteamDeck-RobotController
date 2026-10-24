'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const K=require('../ui/keyboard-layout.js'),{identity}=require('../ui/controllers.js'),{ControllerHub}=require('../src/controller-hub.cjs'),{controllerOutput}=require('../src/controller-output.cjs');
const {KeyboardInput}=require('../src/keyboard-input.cjs');

test('Windows keys without physical code still test and drive; supplied positions stay authoritative',()=>{
  const keyboard=new KeyboardInput();
  for(const [key,axis,value] of [['w',1,-1],['A',0,-1],['s',1,1],['D',0,1],['ArrowUp',3,-1]]){
    assert.equal(keyboard.key({type:'keyDown',key,code:''}),true);
    assert.equal(K.pad(keyboard.down).axes[axis],value,key);
    keyboard.key({type:'keyUp',key,code:''});assert.deepEqual(K.pad(keyboard.down).axes,[0,0,0,0]);
  }
  assert.equal(K.code({key:'z',code:'KeyW'}),'KeyW','AZERTY stays position based');
  assert.equal(K.code({key:'w',code:'KeyZ'}),'KeyZ','an unused supplied code is not rebound');
  for(const [key,code] of [[' ','Space'],['Shift','ShiftLeft'],['`','Backquote'],['Enter','Enter']])assert.equal(K.code({key}),code);
});

test('WASD testing stays live while robot output is paused and releases each axis',()=>{
  const keyboard=new KeyboardInput(),hub=new ControllerHub({hardware:{}});
  const ingest=()=>{hub.ingest([K.pad(keyboard.down)],{pin:K.ID});return hub.state();};
  ingest();
  for(const [code,axis,value] of [['KeyW',1,-1],['KeyA',0,-1],['KeyS',1,1],['KeyD',0,1]]){
    assert.equal(keyboard.key({type:'keyDown',code,isAutoRepeat:false}),true);
    const raw=ingest();assert.equal(raw.readings[0].axes[axis],value,code+' is visible in the tester');
    assert.deepEqual(controllerOutput({...raw,paused:true})[0].axes,[0,0,0,0],'background output is neutral');
    keyboard.key({type:'keyUp',code});assert.deepEqual(ingest().readings[0].axes,[0,0,0,0]);
  }
});
test('closing a tester or changing editing focus cannot transfer held keys into driving',()=>{
  const keyboard=new KeyboardInput();
  keyboard.key({type:'keyDown',code:'KeyW',isAutoRepeat:false});
  assert.equal(keyboard.release(),true);assert.deepEqual(K.pad(keyboard.down).axes,[0,0,0,0]);
  assert.equal(keyboard.key({type:'keyDown',code:'KeyW',isAutoRepeat:true}),false,'OS repeat remains blocked');
  assert.deepEqual(K.pad(keyboard.down).axes,[0,0,0,0]);
  keyboard.key({type:'keyUp',code:'KeyW'});keyboard.key({type:'keyDown',code:'KeyW',isAutoRepeat:false});
  assert.equal(K.pad(keyboard.down).axes[1],-1,'a fresh press drives normally');
  keyboard.release();keyboard.key({type:'keyDown',code:'KeyW',isAutoRepeat:false});
  assert.equal(K.pad(keyboard.down).axes[1],-1,'a release outside the app does not require an extra tap');
});
test('shortcuts and unmapped keys do not become controller input; source reset clears stale holds',()=>{
  const keyboard=new KeyboardInput();
  for(const input of [{code:'KeyP'},{code:'KeyW',control:true},{code:'KeyA',alt:true},{code:'KeyS',meta:true}])assert.equal(keyboard.key({type:'keyDown',...input}),false);
  assert.equal(keyboard.down.size,0);
  keyboard.key({type:'keyDown',code:'Space'});keyboard.release();keyboard.reset();
  assert.equal(keyboard.key({type:'keyDown',code:'Space',isAutoRepeat:true}),true);
  assert.equal(K.pad(keyboard.down).buttons[0],1);
  assert.equal(keyboard.key({type:'keyUp',code:'Space',control:true}),true);
});

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
