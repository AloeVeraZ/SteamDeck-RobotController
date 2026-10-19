'use strict';
// Keyboard as Controller 1: a standard-mapping gamepad built from physical keys
// (KeyboardEvent.code), so the left-hand cluster stays where WASD is on every layout.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DeckKeyboard=factory();})(typeof self!=='undefined'?self:this,function(){
const ID='Keyboard (Deck Driver Station standard layout)',INDEX=15;
// Standard gamepad button order: A B X Y LB RB LT RT Back Start L3 R3 Up Down Left Right Guide.
const buttons=[['Space'],['KeyC'],['KeyR'],['KeyF'],['KeyQ'],['KeyE'],['ShiftLeft'],['KeyG'],['Backquote'],['Enter'],['KeyX'],['KeyM'],['KeyI'],['KeyK'],['KeyJ'],['KeyL'],[]];
// [negative, positive] for Left X, Left Y, Right X, Right Y.
const axes=[['KeyA','KeyD'],['KeyW','KeyS'],['ArrowLeft','ArrowRight'],['ArrowUp','ArrowDown']];
const used=new Set([...buttons.flat(),...axes.flat()]);
function stick(x,y){const length=Math.hypot(x,y);return length>1?[x/length,y/length]:[x,y];}
function pad(down){
  const held=code=>down.has(code)?1:0,raw=axes.map(([negative,positive])=>held(positive)-held(negative));
  const values=[...stick(raw[0],raw[1]),...stick(raw[2],raw[3])],pressed=buttons.map(codes=>codes.some(code=>down.has(code))?1:0);
  return {id:ID,index:INDEX,mapping:'standard',connected:true,pressed:pressed.some(Boolean),axesActive:values.some(Boolean),axes:values,buttons:pressed,buttonPressed:pressed.map(Boolean),buttonTouched:pressed.map(Boolean)};
}
const isKeyboard=p=>p?.id===ID;

// Layout from Chromium's keyboard map (code -> unshifted character) plus the UI language.
function detect(map,language=''){
  const k=code=>String((map&&typeof map.get==='function'?map.get(code):map?.[code])||'').toLowerCase(),region=String(language).split('-')[1]?.toUpperCase()||'';
  if(!k('KeyQ'))return {family:'',name:'Keyboard',known:false};
  const q=k('KeyQ'),w=k('KeyW'),y=k('KeyY'),z=k('KeyZ'),semicolon=k('Semicolon'),quote=k('Quote'),bracket=k('BracketLeft'),minus=k('Minus'),backslash=k('Backslash');
  const family=!/^[a-z',;]$/.test(q)?'Non-Latin':q==='a'&&w==='z'?'AZERTY':y==='z'&&z==='y'?'QWERTZ':q==="'"&&w===','?'Dvorak':k('KeyE')==='f'&&k('KeyR')==='p'?'Colemak':q==='q'&&w==='w'&&y==='y'?'QWERTY':'Other';
  let country='';
  if(family==='QWERTY'){
    if(quote===':')country='Japanese';
    else if(semicolon===';'&&quote==="'")country=backslash==='#'?'English (UK)':region==='CA'?'English (Canada)':region==='AU'?'English (Australia)':region==='IE'?'English (Ireland)':'English (US)';
    else if(semicolon==='ñ')country=region==='ES'||!region?'Spanish':'Spanish (Latin America)';
    else if(semicolon==='ç')country=quote==='~'||region==='BR'?'Portuguese (Brazil)':'Portuguese';
    else if(semicolon==='ò')country='Italian';
    else if(semicolon==='ö'&&quote==='ä')country=region==='FI'?'Finnish':'Swedish';
    else if(semicolon==='ø'&&quote==='æ')country='Norwegian';
    else if(semicolon==='æ'&&quote==='ø')country='Danish';
    else if(semicolon==='ş')country='Turkish';
    else if(semicolon===';'&&bracket==='[')country='English';
  }else if(family==='QWERTZ'){
    if(semicolon==='ö'&&bracket==='ü')country=minus==='ß'?'German':minus==="'"?'Swiss':'German';
    else if(semicolon==='ů')country='Czech';else if(semicolon==='ô')country='Slovak';else if(semicolon==='é')country='Hungarian';else if(semicolon==='č')country='Croatian / Slovenian';else if(semicolon==='ł')country='Polish';
  }else if(family==='AZERTY')country=region==='BE'?'Belgian':'French';
  const name=family==='Non-Latin'?'Keyboard · non-Latin layout':`${country?country+' ':''}${family} keyboard`;
  return {family,country,name,known:family!=='Other'};
}
const names={Space:'Space',ShiftLeft:'Shift',Enter:'Enter',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Backquote:'`'};
// The keycap printed at that physical position on this layout, e.g. KeyW is "Z" on AZERTY.
function label(code,map){const key=map&&typeof map.get==='function'?map.get(code):map?.[code];if(names[code]&&(code!=='Backquote'||!key))return names[code];return key?String(key).toUpperCase():code.replace(/^Key|^Digit/,'');}
return {ID,INDEX,buttons,axes,used,pad,isKeyboard,detect,label};
});
