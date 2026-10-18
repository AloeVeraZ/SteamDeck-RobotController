'use strict';
// Shared key surface. It never reads, stores or displays a field's contents.
window.DeckTouchKeyboard={mount(host,{press,close}){
 let shift=false,symbols=false;
 host.classList.add('touch-keyboard');host.setAttribute('aria-label','On-screen keyboard');
 host.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();});
 const button=(label,action,wide=false)=>{const key=document.createElement('button');key.type='button';key.textContent=label;key.setAttribute('aria-label',({' ':'Space','⌫':'Backspace','←':'Move caret left','→':'Move caret right'})[label]||label);if(wide)key.className='wide';key.onclick=action;return key;};
 function render(){
  const title=document.createElement('div');title.className='touch-keyboard-title';const label=document.createElement('span');label.textContent='TOUCH KEYBOARD';title.append(label,button('Done',close,true));
  const rows=symbols?['1234567890','!@#$%^&*()','_+-=[]{}\\|',';:\'",./?<>~`']:['1234567890','qwertyuiop','asdfghjkl','zxcvbnm'];
  host.replaceChildren(title,...rows.map((letters,index)=>{const row=document.createElement('div');row.className='touch-key-row';if(index===3&&!symbols)row.append(button(shift?'Lowercase':'Shift',()=>{shift=!shift;render();},true));for(const letter of letters){const text=shift&&!symbols?letter.toUpperCase():letter;row.append(button(text,()=>press({kind:'text',value:text})));}if(index===3)row.append(button('⌫',()=>press({kind:'backspace'}),true));return row;}));
  const row=document.createElement('div');row.className='touch-key-row touch-key-actions';row.append(button(symbols?'ABC':'Symbols',()=>{symbols=!symbols;render();},true),...['.',':','/'].map(text=>button(text,()=>press({kind:'text',value:text}))),button('←',()=>press({kind:'left'})),button('Space',()=>press({kind:'text',value:' '}),true),button('→',()=>press({kind:'right'})),button('Enter',()=>press({kind:'enter'}),true));host.append(row);
 }
 render();return {reset(){shift=false;symbols=false;render();}};
}};
